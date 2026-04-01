import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

import { getCorsHeaders } from '../_shared/cors.ts';

interface HeartbeatRequest {
  status: string;
  agent_version: string;
  supervisor_version?: string;
  monitor_version?: string;
  certificate_thumbprint?: string;
  certificate_public_key?: string;
  capabilities?: string[];
}

interface UpdateInfo {
  version: string;
  download_url: string;
  checksum: string;
  force: boolean;
}

interface HeartbeatSuccessResponse {
  success: true;
  agent_id: string;
  timestamp: string;
  next_heartbeat_in: number;
  config_flag: 0 | 1;
  has_pending_tasks: boolean;
  update_available: boolean;
  update_info?: UpdateInfo;
  supervisor_update_available?: boolean;
  supervisor_update_info?: UpdateInfo;
  monitor_update_available?: boolean;
  monitor_update_info?: UpdateInfo;
  azure_certificate_key_id?: string;
  check_components?: boolean;
  request_certificate?: boolean;
  has_pending_commands?: boolean;
  start_realtime?: boolean;
}

interface HeartbeatErrorResponse {
  error: string;
  code: 'TOKEN_EXPIRED' | 'INVALID_SIGNATURE' | 'INVALID_TOKEN' | 'BLOCKED' | 'UNREGISTERED' | 'INTERNAL_ERROR';
}

interface RpcHeartbeatResult {
  success: boolean;
  error?: string;
  agent_id?: string;
  jwt_secret?: string;
  config_flag?: number;
  has_pending_tasks?: boolean;
  next_heartbeat_in?: number;
}

/**
 * Sanitize certificate thumbprint by removing prefixes, colons, and normalizing format
 * Handles formats like "sha1 Fingerprint=AA:BB:CC:..." or "SHA1:AA:BB:CC:..."
 */
function sanitizeThumbprint(thumbprint: string | null | undefined): string | null {
  if (!thumbprint) return null;
  let clean = thumbprint.trim();
  if (clean.includes('=')) {
    clean = clean.split('=').pop() || clean;
  }
  clean = clean.replace(/:/g, '');
  return clean.toUpperCase().trim();
}

function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex) {
    throw new Error('M365_ENCRYPTION_KEY not configured');
  }
  const keyBytes = fromHex(keyHex);
  return await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

async function decryptSecret(encrypted: string): Promise<string> {
  if (!encrypted.includes(':')) {
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  }

  try {
    const [ivHex, ciphertextHex] = encrypted.split(':');
    const iv = fromHex(ivHex);
    const ciphertext = fromHex(ciphertextHex);
    const key = await getEncryptionKey();

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('AES-GCM decryption failed:', error);
    throw new Error('Failed to decrypt secret');
  }
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(n => parseInt(n, 10) || 0);
  const partsB = b.split('.').map(n => parseInt(n, 10) || 0);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

/**
 * Update agent version (and optionally supervisor_version) in database
 */
async function updateAgentVersion(supabase: any, agentId: string, version: string, supervisorVersion?: string): Promise<void> {
  if (!version || version === '0.0.0' || version === 'unknown') return;
  
  try {
    const updateData: Record<string, string> = { agent_version: version };
    if (supervisorVersion && supervisorVersion !== '0.0.0' && supervisorVersion !== 'unknown') {
      updateData.supervisor_version = supervisorVersion;
    }
    await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agentId);
  } catch (error) {
    console.error('Failed to update agent version:', error);
  }
}

async function uploadCertificateToAppRegistration(
  homeTenantId: string,
  appId: string,
  appObjectId: string,
  clientSecret: string,
  thumbprint: string,
  publicKey: string,
  agentId: string
): Promise<{ success: boolean; keyId?: string; error?: string }> {
  try {
    console.log(`Uploading certificate to App Registration ${appObjectId.substring(0, 8)}... in Home Tenant ${homeTenantId.substring(0, 8)}...`);
    
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${homeTenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error(`Failed to get token for Home Tenant:`, errText);
      return { success: false, error: `Token error: ${tokenResponse.status}` };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const currentAppResponse = await fetch(
      `https://graph.microsoft.com/v1.0/applications/${appObjectId}?$select=keyCredentials`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!currentAppResponse.ok) {
      const errText = await currentAppResponse.text();
      console.error(`Failed to get App Registration:`, errText);
      return { success: false, error: `GET App error: ${currentAppResponse.status}` };
    }

    const currentAppData = await currentAppResponse.json();
    const existingKeys = currentAppData.keyCredentials || [];
    
    console.log(`App Registration has ${existingKeys.length} existing key(s)`);
    for (const k of existingKeys) {
      console.log(`  Key: ${k.displayName || 'unnamed'} | end: ${k.endDateTime} | type: ${k.type} | usage: ${k.usage}`);
    }

    const sanitizedNewThumbprint = sanitizeThumbprint(thumbprint);

    for (const key of existingKeys) {
      if (key.customKeyIdentifier) {
        try {
          const existingBytes = Uint8Array.from(atob(key.customKeyIdentifier), c => c.charCodeAt(0));
          const existingHex = Array.from(existingBytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
          if (existingHex === sanitizedNewThumbprint) {
            console.log(`Certificate with thumbprint ${sanitizedNewThumbprint?.substring(0, 8)}... already registered in App Registration`);
            return { success: true, keyId: sanitizedNewThumbprint };
          }
        } catch {
          // Continue if decode fails
        }
      }
    }

    const certBase64 = publicKey
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');

    const thumbprintBytes = fromHex(sanitizedNewThumbprint || '');
    const customKeyIdentifier = btoa(String.fromCharCode(...thumbprintBytes));

    const newKeyCredential: Record<string, string> = {
      type: 'AsymmetricX509Cert',
      usage: 'Verify',
      key: certBase64,
      customKeyIdentifier: customKeyIdentifier,
      displayName: `iScope-Agent-${agentId.substring(0, 8)}`,
    };

    console.log(`Adding certificate with displayName: ${newKeyCredential.displayName}`);

    const now = new Date();
    const agentPrefix = `iScope-Agent-${agentId.substring(0, 8)}`;
    const cleanedExistingKeys = existingKeys
      .filter((key: any) => {
        if (key.endDateTime) {
          const endDate = new Date(key.endDateTime);
          if (endDate < now) {
            console.log(`Removing expired key: ${key.displayName || 'unnamed'} (expired ${key.endDateTime})`);
            return false;
          }
        }
        if (key.displayName === agentPrefix) {
          console.log(`Removing old key from same agent: ${key.displayName}`);
          return false;
        }
        return true;
      })
      .map((key: any) => ({
        type: key.type,
        usage: key.usage,
        key: key.key,
        customKeyIdentifier: key.customKeyIdentifier,
        displayName: key.displayName,
        startDateTime: key.startDateTime,
        endDateTime: key.endDateTime,
      }));

    const patchResponse = await fetch(
      `https://graph.microsoft.com/v1.0/applications/${appObjectId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyCredentials: [...cleanedExistingKeys, newKeyCredential],
        }),
      }
    );

    if (!patchResponse.ok) {
      const errText = await patchResponse.text();
      console.error(`Failed to PATCH App Registration:`, errText);
      return { success: false, error: `PATCH error: ${patchResponse.status} - ${errText}` };
    }

    console.log(`Certificate uploaded to App Registration, thumbprint: ${sanitizedNewThumbprint?.substring(0, 8)}...`);
    return { success: true, keyId: sanitizedNewThumbprint || thumbprint };
  } catch (error) {
    console.error(`Error uploading certificate to App Registration:`, error);
    return { success: false, error: String(error) };
  }
}

async function uploadAgentCertificate(
  supabase: any,
  agentId: string,
  thumbprint: string,
  publicKey: string
): Promise<string | null> {
  console.log(`Uploading certificate for agent ${agentId}, thumbprint: ${thumbprint.substring(0, 8)}...`);
  
  try {
    const { data: globalConfig, error: configError } = await supabase
      .from('m365_global_config')
      .select('app_id, app_object_id, validation_tenant_id, client_secret_encrypted')
      .single();
    
    if (configError || !globalConfig) {
      console.error('No global config found:', configError);
      return null;
    }

    const { app_id, app_object_id, validation_tenant_id, client_secret_encrypted } = globalConfig;

    if (!app_object_id) {
      console.error('app_object_id not configured in m365_global_config');
      return null;
    }

    if (!validation_tenant_id) {
      console.error('validation_tenant_id not configured in m365_global_config');
      return null;
    }

    if (!client_secret_encrypted) {
      console.error('client_secret_encrypted not configured in m365_global_config');
      return null;
    }

    let globalClientSecret: string;
    try {
      globalClientSecret = await decryptSecret(client_secret_encrypted);
    } catch (decryptError) {
      console.error('Failed to decrypt global client secret:', decryptError);
      return null;
    }

    const { data: linkedTenants } = await supabase
      .from('m365_tenant_agents')
      .select('tenant_record_id')
      .eq('agent_id', agentId)
      .eq('enabled', true);

    console.log(`Agent ${agentId} has ${linkedTenants?.length || 0} linked tenant(s)`);

    const result = await uploadCertificateToAppRegistration(
      validation_tenant_id,
      app_id,
      app_object_id,
      globalClientSecret,
      thumbprint,
      publicKey,
      agentId
    );

    if (result.success && result.keyId) {
      const sanitizedThumbprint = sanitizeThumbprint(thumbprint);
      await supabase
        .from('agents')
        .update({
          certificate_thumbprint: sanitizedThumbprint,
          certificate_public_key: publicKey,
          azure_certificate_key_id: result.keyId,
        })
        .eq('id', agentId);

      console.log(`Certificate registered for agent ${agentId}: ${result.keyId.substring(0, 8)}...`);
      return result.keyId;
    }

    console.error(`Failed to upload certificate to App Registration: ${result.error}`);
    return null;
  } catch (error) {
    console.error('Error uploading certificate:', error);
    return null;
  }
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Token de autorização ausente ou inválido', code: 'INVALID_TOKEN' } as HeartbeatErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    let payload: { sub?: string; exp?: number };
    try {
      const [, payloadBase64] = decode(token);
      payload = payloadBase64 as { sub?: string; exp?: number };
    } catch (decodeError) {
      console.error('Failed to decode token:', decodeError);
      return new Response(
        JSON.stringify({ error: 'Token inválido', code: 'INVALID_TOKEN' } as HeartbeatErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentId = payload.sub;
    if (!agentId) {
      console.log('Token does not contain agent ID (sub claim)');
      return new Response(
        JSON.stringify({ error: 'Token não contém identificação do agent', code: 'INVALID_TOKEN' } as HeartbeatErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      console.log('Token has expired:', agentId);
      return new Response(
        JSON.stringify({ error: 'Token expirado', code: 'TOKEN_EXPIRED' } as HeartbeatErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('rpc_agent_heartbeat', { p_agent_id: agentId });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      return new Response(
        JSON.stringify({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' } as HeartbeatErrorResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = rpcResult as RpcHeartbeatResult;

    if (!result.success) {
      const errorCode = result.error || 'INTERNAL_ERROR';
      
      if (errorCode === 'AGENT_NOT_FOUND') {
        return new Response(
          JSON.stringify({ error: 'Agent não encontrado', code: 'INVALID_TOKEN' } as HeartbeatErrorResponse),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (errorCode === 'BLOCKED') {
        return new Response(
          JSON.stringify({ error: 'Agent bloqueado', code: 'BLOCKED' } as HeartbeatErrorResponse),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (errorCode === 'UNREGISTERED') {
        return new Response(
          JSON.stringify({ error: 'Agent desregistrado', code: 'UNREGISTERED' } as HeartbeatErrorResponse),
          { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Erro interno', code: 'INTERNAL_ERROR' } as HeartbeatErrorResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the token signature
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(result.jwt_secret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      await verify(token, cryptoKey);
    } catch (verifyError) {
      const errorMessage = String(verifyError);
      if (errorMessage.includes('expired') || errorMessage.includes('exp')) {
        console.log('Token expired during verification:', agentId);
        return new Response(
          JSON.stringify({ error: 'Token expirado', code: 'TOKEN_EXPIRED' } as HeartbeatErrorResponse),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.error('Token signature verification failed:', verifyError);
      return new Response(
        JSON.stringify({ error: 'Assinatura do token inválida', code: 'INVALID_SIGNATURE' } as HeartbeatErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: HeartbeatRequest;
    try {
      body = await req.json();
    } catch {
      body = { status: 'unknown', agent_version: 'unknown' };
    }

    const agentVersion = body.agent_version || '0.0.0';
    const supervisorVersion = body.supervisor_version || '';

    // Update agent version + supervisor_version in database
    await updateAgentVersion(supabase, agentId, agentVersion, supervisorVersion);

    // Clear activation_code on first successful heartbeat (confirms agent saved state)
    try {
      await supabase
        .from('agents')
        .update({ activation_code: null, activation_code_expires_at: null })
        .eq('id', agentId)
        .not('activation_code', 'is', null);
    } catch (clearErr) {
      console.error('Failed to clear activation_code:', clearErr);
    }

    // Persist capabilities if provided
    if (Array.isArray(body.capabilities)) {
      try {
        await supabase
          .from('agents')
          .update({ capabilities: body.capabilities })
          .eq('id', agentId);
        console.log(`Agent ${agentId}: capabilities updated (${body.capabilities.length} items)`);
      } catch (capErr) {
        console.error('Failed to update capabilities:', capErr);
      }
    }

    // Process certificate upload if provided
    let azureCertificateKeyId: string | null = null;
    let checkComponents = false;
    let requestCertificate = false;
    
    const { data: agentData } = await supabase
      .from('agents')
      .select('azure_certificate_key_id, check_components, certificate_thumbprint, shell_session_active')
      .eq('id', agentId)
      .single();

    checkComponents = agentData?.check_components || false;

    const sanitizedInputThumbprint = sanitizeThumbprint(body.certificate_thumbprint);
    const sanitizedAgentThumbprint = sanitizeThumbprint(agentData?.certificate_thumbprint);
    
    if (body.certificate_public_key && sanitizedInputThumbprint) {
      const thumbprintChanged = sanitizedAgentThumbprint &&
        sanitizedAgentThumbprint !== sanitizedInputThumbprint;

      if (thumbprintChanged) {
        console.log(`Agent ${agentId}: thumbprint changed ${sanitizedAgentThumbprint?.substring(0, 8)}... -> ${sanitizedInputThumbprint?.substring(0, 8)}..., re-uploading`);
      }

      if (!agentData?.azure_certificate_key_id || thumbprintChanged) {
        console.log(`Agent ${agentId} uploading certificate (thumbprint: ${sanitizedInputThumbprint?.substring(0, 8)}...)`);
        azureCertificateKeyId = await uploadAgentCertificate(
          supabase,
          agentId,
          sanitizedInputThumbprint,
          body.certificate_public_key
        );
      } else {
        azureCertificateKeyId = agentData.azure_certificate_key_id;
        console.log(`Agent ${agentId} already has certificate registered: ${azureCertificateKeyId}`);
      }
    }
    
    if (!sanitizedInputThumbprint && !agentData?.azure_certificate_key_id) {
      try {
        const { data: linkedTenants } = await supabase
          .from('m365_tenant_agents')
          .select('tenant_record_id')
          .eq('agent_id', agentId)
          .eq('enabled', true)
          .limit(1);

        if (linkedTenants && linkedTenants.length > 0) {
          requestCertificate = true;
          console.log(`Agent ${agentId}: has linked tenants but no certificate, requesting certificate`);
        }
      } catch (err) {
        console.error('Error checking linked tenants for certificate:', err);
      }
    }

    // Reset check_components flag after reading it
    if (checkComponents) {
      await supabase
        .from('agents')
        .update({ check_components: false })
        .eq('id', agentId);
      console.log(`Reset check_components flag for agent ${agentId}`);
    }

    // Check for available AGENT updates
    const { data: updateSettings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', [
        'agent_latest_version', 'agent_update_checksum', 'agent_force_update',
        'supervisor_latest_version', 'supervisor_update_checksum', 'supervisor_force_update',
        'monitor_latest_version', 'monitor_update_checksum', 'monitor_force_update',
      ]);

    // Agent update check
    const latestVersion = (updateSettings?.find(s => s.key === 'agent_latest_version')?.value as string || '1.0.0').replace(/"/g, '');
    const updateChecksum = (updateSettings?.find(s => s.key === 'agent_update_checksum')?.value as string || '').replace(/"/g, '');
    const forceUpdate = updateSettings?.find(s => s.key === 'agent_force_update')?.value === true || 
                        updateSettings?.find(s => s.key === 'agent_force_update')?.value === 'true';

    const updateAvailable = compareVersions(agentVersion, latestVersion) < 0;

    // Supervisor update check
    const supervisorLatestVersion = (updateSettings?.find(s => s.key === 'supervisor_latest_version')?.value as string || '1.0.0').replace(/"/g, '');
    const supervisorUpdateChecksum = (updateSettings?.find(s => s.key === 'supervisor_update_checksum')?.value as string || '').replace(/"/g, '');
    const supervisorForceUpdate = updateSettings?.find(s => s.key === 'supervisor_force_update')?.value === true ||
                                  updateSettings?.find(s => s.key === 'supervisor_force_update')?.value === 'true';

    const supervisorUpdateAvailable = supervisorVersion
      ? compareVersions(supervisorVersion, supervisorLatestVersion) < 0
      : false;

    // Monitor update check
    const monitorLatestVersion = (updateSettings?.find(s => s.key === 'monitor_latest_version')?.value as string || '1.0.0').replace(/"/g, '');
    const monitorUpdateChecksum = (updateSettings?.find(s => s.key === 'monitor_update_checksum')?.value as string || '').replace(/"/g, '');
    const monitorForceUpdate = updateSettings?.find(s => s.key === 'monitor_force_update')?.value === true ||
                               updateSettings?.find(s => s.key === 'monitor_force_update')?.value === 'true';

    const monitorVersion = body.monitor_version || '';
    const monitorUpdateAvailable = monitorVersion
      ? compareVersions(monitorVersion, monitorLatestVersion) < 0
      : false;

    console.log(`Heartbeat OK: agent=${agentId}, version=${agentVersion}, supervisor=${supervisorVersion || 'n/a'}, monitor=${monitorVersion || 'n/a'}, latest=${latestVersion}, sup_latest=${supervisorLatestVersion}, mon_latest=${monitorLatestVersion}, update=${updateAvailable}, sup_update=${supervisorUpdateAvailable}, mon_update=${monitorUpdateAvailable}, config_flag=${result.config_flag}, pending=${result.has_pending_tasks}, cert=${azureCertificateKeyId ? 'registered' : 'none'}`);

    // Check for pending remote commands
    let hasPendingCommands = false;
    try {
      const { count } = await supabase
        .from('agent_commands')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId)
        .eq('status', 'pending');
      hasPendingCommands = (count || 0) > 0;
    } catch (cmdErr) {
      console.error('Error checking pending commands:', cmdErr);
    }

    // Build success response
    const response: HeartbeatSuccessResponse = {
      success: true,
      agent_id: agentId,
      timestamp: new Date().toISOString(),
      next_heartbeat_in: result.next_heartbeat_in || 120,
      config_flag: (result.config_flag || 0) as 0 | 1,
      has_pending_tasks: result.has_pending_tasks || false,
      update_available: updateAvailable,
    };

    if (azureCertificateKeyId) {
      response.azure_certificate_key_id = azureCertificateKeyId;
    }

    if (checkComponents) {
      response.check_components = true;
    }
    
    if (requestCertificate) {
      response.request_certificate = true;
      console.log(`Agent ${agentId}: requesting certificate re-upload for linked tenants`);
    }

    if (hasPendingCommands) {
      response.has_pending_commands = true;
    }

    if (agentData?.shell_session_active) {
      response.start_realtime = true;
    }

    // Include AGENT update info if available (Supervisor downloads this)
    if (updateAvailable) {
      const agentFilePath = `iscope-agent-${latestVersion}.tar.gz`;
      let agentDownloadUrl = `${supabaseUrl}/storage/v1/object/public/agent-releases/${agentFilePath}`;
      try {
        const { data: signedData } = await supabase.storage
          .from('agent-releases')
          .createSignedUrl(agentFilePath, 3600); // 1 hour expiry
        if (signedData?.signedUrl) {
          agentDownloadUrl = signedData.signedUrl;
        }
      } catch (signErr) {
        console.error('Failed to create signed URL for agent release:', signErr);
      }
      response.update_info = {
        version: latestVersion,
        download_url: agentDownloadUrl,
        checksum: updateChecksum,
        force: forceUpdate,
      };
    }

    // Include SUPERVISOR update info if available (Worker/Agent downloads this)
    if (supervisorUpdateAvailable) {
      const supervisorFilePath = `iscope-supervisor-${supervisorLatestVersion}.tar.gz`;
      let supervisorDownloadUrl = `${supabaseUrl}/storage/v1/object/public/agent-releases/${supervisorFilePath}`;
      try {
        const { data: signedData } = await supabase.storage
          .from('agent-releases')
          .createSignedUrl(supervisorFilePath, 3600); // 1 hour expiry
        if (signedData?.signedUrl) {
          supervisorDownloadUrl = signedData.signedUrl;
        }
      } catch (signErr) {
        console.error('Failed to create signed URL for supervisor release:', signErr);
      }
      response.supervisor_update_available = true;
      response.supervisor_update_info = {
        version: supervisorLatestVersion,
        download_url: supervisorDownloadUrl,
        checksum: supervisorUpdateChecksum,
        force: supervisorForceUpdate,
      };
    }

    // Include MONITOR update info if available
    if (monitorUpdateAvailable) {
      const monitorFilePath = `iscope-monitor-${monitorLatestVersion}.tar.gz`;
      let monitorDownloadUrl = `${supabaseUrl}/storage/v1/object/public/agent-releases/${monitorFilePath}`;
      try {
        const { data: signedData } = await supabase.storage
          .from('agent-releases')
          .createSignedUrl(monitorFilePath, 3600);
        if (signedData?.signedUrl) {
          monitorDownloadUrl = signedData.signedUrl;
        }
      } catch (signErr) {
        console.error('Failed to create signed URL for monitor release:', signErr);
      }
      response.monitor_update_available = true;
      response.monitor_update_info = {
        version: monitorLatestVersion,
        download_url: monitorDownloadUrl,
        checksum: monitorUpdateChecksum,
        force: monitorForceUpdate,
      };
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in agent-heartbeat:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' } as HeartbeatErrorResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
