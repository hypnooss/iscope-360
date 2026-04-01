import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

import { getCorsHeaders } from '../_shared/cors.ts';

// Rate limiting configuration
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour in milliseconds

// ============= AES-256-GCM Decryption =============

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('M365_ENCRYPTION_KEY not configured or invalid');
  }
  
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(keyHex.substr(i * 2, 2), 16);
  }
  
  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

function fromHex(hex: string): Uint8Array {
  const length = hex.length / 2;
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function decryptSecret(encrypted: string): Promise<string> {
  if (encrypted.includes(':')) {
    try {
      const [ivHex, ctHex] = encrypted.split(':');
      const key = await getEncryptionKey();
      const iv = fromHex(ivHex);
      const ciphertext = fromHex(ctHex);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as Uint8Array<ArrayBuffer> },
        key,
        ciphertext as unknown as Uint8Array<ArrayBuffer>
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('[register-agent] AES-GCM decryption failed:', error);
      return '';
    }
  }
  
  // Legacy Base64 fallback
  try {
    return atob(encrypted);
  } catch {
    return '';
  }
}

// ============= Azure Certificate Upload =============

interface AzureUploadResult {
  success: boolean;
  keyId?: string;
  error?: string;
}

// NOTE: This function is DEPRECATED and no longer used.
// Certificate upload now happens via agent-heartbeat for CLIENT tenants only.
// Kept here for backwards compatibility but will be removed in future versions.
async function uploadCertificateToAzure(
  _appObjectId: string,
  _appId: string,
  _clientSecret: string,
  _tenantId: string,
  _certificatePem: string,
  _displayName: string
): Promise<AzureUploadResult> {
  console.log('[register-agent] uploadCertificateToAzure is deprecated - certificates are now uploaded via agent-heartbeat');
  return { success: false, error: 'Deprecated - use agent-heartbeat instead' };
}

// ============= Helper Functions =============

// Generate a cryptographically secure random string
function generateSecureSecret(length: number = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Generate a JWT token signed with the agent's secret
async function generateAgentToken(agentId: string, jwtSecret: string, expiresIn: string): Promise<string> {
  const secretKey = new TextEncoder().encode(jwtSecret);
  const now = Math.floor(Date.now() / 1000);

  let exp: number;
  if (expiresIn.endsWith("m")) {
    exp = now + parseInt(expiresIn) * 60;
  } else if (expiresIn.endsWith("h")) {
    exp = now + parseInt(expiresIn) * 60 * 60;
  } else if (expiresIn.endsWith("d")) {
    exp = now + parseInt(expiresIn) * 60 * 60 * 24;
  } else {
    exp = now + 30 * 60; // Default 30 minutes
  }

  const jwt = await new jose.SignJWT({ type: expiresIn.includes("d") ? "refresh" : "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setSubject(agentId)
    .sign(secretKey);

  return jwt;
}

// Extract client IP from request headers
function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || "unknown";
}

// Check rate limit and record attempt
async function checkRateLimit(
  supabase: any,
  clientIP: string
): Promise<{ allowed: boolean; count: number }> {
  const rateLimitKey = `register_agent:${clientIP}`;
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  // Count recent attempts
  const { count, error: countError } = await supabase
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("key", rateLimitKey)
    .gte("created_at", windowStart);

  if (countError) {
    console.error(`[rate-limit] Error checking rate limit: ${countError.message}`);
    // On error, allow the request but log it
    return { allowed: true, count: 0 };
  }

  const currentCount = count || 0;
  
  // Record this attempt
  const { error: insertError } = await supabase
    .from("rate_limits")
    .insert({
      key: rateLimitKey,
      endpoint: "register-agent",
      ip_address: clientIP,
    });

  if (insertError) {
    console.error(`[rate-limit] Error recording attempt: ${insertError.message}`);
  }

  return {
    allowed: currentCount < RATE_LIMIT_MAX_ATTEMPTS,
    count: currentCount + 1,
  };
}

// ============= Main Handler =============

serve(async (req) => {
  // Handle CORS preflight
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    console.log(`[register-agent] Method not allowed: ${req.method}`);
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create Supabase client with SERVICE ROLE for rate limiting
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Get client IP and check rate limit
  const clientIP = getClientIP(req);
  console.log(`[register-agent] Request from IP: ${clientIP}`);

  const { allowed, count } = await checkRateLimit(supabase, clientIP);

  if (!allowed) {
    console.warn(`[register-agent] Rate limit exceeded for IP ${clientIP} (${count} attempts)`);
    return new Response(
      JSON.stringify({
        error: "Too many registration attempts. Please try again later.",
        code: "RATE_LIMITED",
        retry_after: 3600,
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "3600",
        },
      }
    );
  }

  try {
    // Parse request body
    const body = await req.json();
    const { 
      activation_code, 
      certificate_thumbprint, 
      certificate_public_key,
      capabilities 
    } = body;

    console.log(`[register-agent] Registration attempt with code: ${activation_code?.substring(0, 4)}... (attempt ${count}/${RATE_LIMIT_MAX_ATTEMPTS})`);
    
    if (certificate_thumbprint) {
      console.log(`[register-agent] Certificate thumbprint provided: ${certificate_thumbprint.substring(0, 8)}...`);
    }
    
    if (capabilities && Array.isArray(capabilities)) {
      console.log(`[register-agent] Capabilities: ${capabilities.join(", ")}`);
    }

    if (!activation_code || typeof activation_code !== "string") {
      console.log("[register-agent] Missing or invalid activation_code");
      return new Response(JSON.stringify({ error: "activation_code is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Find agent by activation_code
    console.log("[register-agent] Looking up agent by activation code...");

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("*")
      .eq("activation_code", activation_code)
      .single();

    if (agentError || !agent) {
      console.log(`[register-agent] Agent not found: ${agentError?.message || "No agent with this code"}`);
      return new Response(
        JSON.stringify({ error: "Invalid activation code", code: "INVALID_CODE" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[register-agent] Found agent: ${agent.id} (${agent.name})`);

    // Step 2: Validate agent state
    // Check if revoked
    if (agent.revoked) {
      console.log(`[register-agent] Agent ${agent.id} is revoked`);
      return new Response(
        JSON.stringify({ error: "Agent has been revoked", code: "AGENT_REVOKED" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if code expired
    if (agent.activation_code_expires_at) {
      const expiresAt = new Date(agent.activation_code_expires_at);
      if (expiresAt < new Date()) {
        console.log(`[register-agent] Activation code expired at ${agent.activation_code_expires_at}`);
        return new Response(
          JSON.stringify({ error: "Activation code has expired", code: "CODE_EXPIRED" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 3: Check if already registered (jwt_secret exists) - REEMIT tokens
    if (agent.jwt_secret) {
      console.log(`[register-agent] Agent ${agent.id} already registered, reemitting tokens...`);
      
      // Reemit tokens using existing jwt_secret
      const accessToken = await generateAgentToken(agent.id, agent.jwt_secret, "30m");
      const refreshToken = await generateAgentToken(agent.id, agent.jwt_secret, "90d");
      
      // Update last_seen
      await supabase
        .from("agents")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", agent.id);
      
      console.log(`[register-agent] Tokens reemitted for agent ${agent.id}`);
      
      return new Response(
        JSON.stringify({
          agent_id: agent.id,
          access_token: accessToken,
          refresh_token: refreshToken,
          reissued: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Generate secrets and tokens
    console.log(`[register-agent] Generating credentials for agent ${agent.id}...`);

    const jwtSecret = generateSecureSecret(64);
    const accessToken = await generateAgentToken(agent.id, jwtSecret, "30m");
    const refreshToken = await generateAgentToken(agent.id, jwtSecret, "90d");

    console.log("[register-agent] Tokens generated successfully");

    // Step 5: Update agent with jwt_secret, certificate info, capabilities
    // NOTE: activation_code is NOT cleared here to allow retry if agent crashes before saving state.
    // It will be cleared on the first successful heartbeat instead.
    const updateData: Record<string, any> = {
      jwt_secret: jwtSecret,
      last_seen: new Date().toISOString(),
    };
    
    // Add certificate info if provided
    if (certificate_thumbprint && typeof certificate_thumbprint === "string") {
      updateData.certificate_thumbprint = certificate_thumbprint;
    }
    
    if (certificate_public_key && typeof certificate_public_key === "string") {
      updateData.certificate_public_key = certificate_public_key;
    }
    
    // Add capabilities if provided
    if (capabilities && Array.isArray(capabilities)) {
      updateData.capabilities = capabilities;
    }
    
    const { error: updateError } = await supabase
      .from("agents")
      .update(updateData)
      .eq("id", agent.id);

    if (updateError) {
      console.error(`[register-agent] Failed to update agent: ${updateError.message}`);
      return new Response(JSON.stringify({ error: "Failed to register agent" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[register-agent] Agent ${agent.id} registered successfully`);

    // Step 6: Upload certificate to Azure if provided and M365 config exists
    let azureCertificateKeyId: string | null = null;
    
    if (certificate_public_key && certificate_thumbprint) {
      console.log(`[register-agent] Attempting to upload certificate to Azure...`);
      
      try {
        // Certificate upload is now handled by agent-heartbeat for CLIENT tenants
        // This section is deprecated and kept for backwards compatibility only
        console.log("[register-agent] Certificate upload now happens via agent-heartbeat for client tenants");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.warn(`[register-agent] Azure certificate upload error: ${errorMessage}`);
        // Don't fail registration, just log the warning
      }
    }

    // Step 7: Return tokens
    return new Response(
      JSON.stringify({
        agent_id: agent.id,
        access_token: accessToken,
        refresh_token: refreshToken,
        azure_certificate_uploaded: !!azureCertificateKeyId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[register-agent] Unexpected error: ${errorMessage}`);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
