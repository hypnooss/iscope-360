import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

import { getCorsHeaders } from '../_shared/cors.ts';

// Generate a new access token (only "type" in payload, agent_id in "sub")
async function generateAccessToken(agentId: string, jwtSecret: string): Promise<string> {
  const secretKey = new TextEncoder().encode(jwtSecret);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 30 * 60; // 30 minutes

  const jwt = await new jose.SignJWT({ type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setSubject(agentId)
    .sign(secretKey);

  return jwt;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== "POST") {
    console.log(`[agent-refresh] Method not allowed: ${req.method}`);
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get refresh token from body or Authorization header
    let refresh_token: string | null = null;
    
    // Try to get from body first
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const body = await req.json();
        refresh_token = body.refresh_token;
      } catch {
        // Body parsing failed, try header
      }
    }
    
    // Fallback to Authorization header (Bearer token)
    if (!refresh_token) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        refresh_token = authHeader.substring(7);
        console.log("[agent-refresh] Using refresh token from Authorization header");
      }
    }

    if (!refresh_token || typeof refresh_token !== "string") {
      console.log("[agent-refresh] Missing refresh_token in body or Authorization header");
      return new Response(
        JSON.stringify({ error: "refresh_token is required in body or Authorization header", code: "MISSING_TOKEN" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[agent-refresh] Processing refresh request...");

    // Step 1: Decode token to get agent_id (without verification first)
    let payload: jose.JWTPayload;
    try {
      payload = jose.decodeJwt(refresh_token);
    } catch (decodeError) {
      console.log("[agent-refresh] Failed to decode token");
      return new Response(
        JSON.stringify({ error: "Invalid token format", code: "INVALID_TOKEN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agentId = payload.sub;
    if (!agentId) {
      console.log("[agent-refresh] Token missing 'sub' claim");
      return new Response(
        JSON.stringify({ error: "Invalid token - missing agent ID", code: "INVALID_TOKEN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[agent-refresh] Agent ID from token: ${agentId}`);

    // Step 2: Create Supabase client and fetch agent
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, jwt_secret, revoked")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      console.log(`[agent-refresh] Agent not found: ${agentError?.message}`);
      return new Response(
        JSON.stringify({ error: "Agent not found", code: "AGENT_NOT_FOUND" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Check if agent is revoked
    if (agent.revoked) {
      console.log(`[agent-refresh] Agent ${agentId} is revoked`);
      return new Response(
        JSON.stringify({ error: "Agent has been revoked", code: "AGENT_REVOKED" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 4: Check if agent has jwt_secret (is registered)
    if (!agent.jwt_secret) {
      console.log(`[agent-refresh] Agent ${agentId} has no jwt_secret`);
      return new Response(
        JSON.stringify({ error: "Agent not registered", code: "AGENT_NOT_REGISTERED" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 5: Verify token signature
    const secretKey = new TextEncoder().encode(agent.jwt_secret);
    try {
      await jose.jwtVerify(refresh_token, secretKey);
    } catch (verifyError) {
      console.log(`[agent-refresh] Token verification failed: ${verifyError}`);
      return new Response(
        JSON.stringify({ error: "Invalid token signature", code: "INVALID_SIGNATURE" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 6: Verify token type is 'refresh'
    if (payload.type !== "refresh") {
      console.log(`[agent-refresh] Wrong token type: ${payload.type}`);
      return new Response(
        JSON.stringify({ error: "Invalid token type - must be refresh token", code: "WRONG_TOKEN_TYPE" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 7: Check expiration (jose.jwtVerify already does this, but let's be explicit)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.log(`[agent-refresh] Refresh token expired at ${payload.exp}`);
      return new Response(
        JSON.stringify({ error: "Refresh token has expired", code: "TOKEN_EXPIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 8: Generate new access token
    console.log(`[agent-refresh] Generating new access token for agent ${agentId}`);
    const newAccessToken = await generateAccessToken(agentId, agent.jwt_secret);

    // Step 9: Update last_seen
    await supabase
      .from("agents")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", agentId);

    console.log(`[agent-refresh] Successfully refreshed token for agent ${agentId}`);

    return new Response(
      JSON.stringify({
        access_token: newAccessToken,
        expires_in: 1800, // 30 minutes in seconds
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[agent-refresh] Unexpected error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
