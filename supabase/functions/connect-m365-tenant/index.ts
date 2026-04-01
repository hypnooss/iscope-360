import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// AES-GCM decryption for stored secrets
async function decryptSecret(encryptedData: string, keyHex: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const [ivHex, ciphertextHex] = encryptedData.split(':');
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const ciphertext = new Uint8Array(ciphertextHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

// Initiate Device Code Flow
async function initiateDeviceCodeFlow(tenantId: string, appId: string): Promise<{
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}> {
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        scope: 'https://graph.microsoft.com/.default offline_access',
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Device code error:', errorData);
    throw new Error(errorData.error_description || 'Erro ao iniciar autenticação.');
  }

  return await response.json();
}

// Poll for token using device code (Public Client - no client_secret)
async function pollForToken(
  tenantId: string, 
  appId: string, 
  deviceCode: string
): Promise<{ 
  pending?: boolean; 
  expired?: boolean; 
  access_token?: string;
  error?: string;
}> {
  console.log(`[pollForToken] Polling as public client (no client_secret)`);
  
  const params = new URLSearchParams();
  params.append('client_id', appId);
  // Public client flow - no client_secret required
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
  params.append('device_code', deviceCode);
  
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    }
  );
  
  console.log(`[pollForToken] Response status: ${response.status}`);

  const data = await response.json();

  if (data.error === 'authorization_pending') {
    return { pending: true };
  }

  if (data.error === 'expired_token') {
    return { expired: true, error: 'Tempo de autenticação expirado. Tente novamente.' };
  }

  if (data.error === 'authorization_declined') {
    return { error: 'Autenticação recusada pelo usuário.' };
  }

  if (data.error === 'bad_verification_code') {
    return { error: 'Código inválido. Tente novamente.' };
  }

  if (data.error) {
    console.error(`[pollForToken] Azure error: ${data.error} - ${data.error_description}`);
    return { error: data.error_description || data.error };
  }

  return { access_token: data.access_token };
}

// Fetch organization info from Graph API
async function fetchOrganizationInfo(accessToken: string): Promise<{
  displayName: string;
  primaryDomain: string;
  tenantId: string;
  spoDomain: string | null;
}> {
  const response = await fetch('https://graph.microsoft.com/v1.0/organization', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Não foi possível obter informações da organização.');
  }

  const data = await response.json();
  const org = data.value?.[0];
  
  if (!org) {
    throw new Error('Organização não encontrada.');
  }

  const verifiedDomains = org.verifiedDomains || [];
  const primaryDomain = verifiedDomains.find((d: any) => d.isDefault)?.name || 
                        verifiedDomains[0]?.name || 
                        `${org.id}.onmicrosoft.com`;

  // Extract SPO domain: find the .onmicrosoft.com domain (without .mail) to derive SharePoint admin URL
  let spoDomain: string | null = null;
  const onmicrosoftDomain = verifiedDomains.find(
    (d: any) => d.name?.endsWith('.onmicrosoft.com') && !d.name?.includes('.mail.')
  );
  if (onmicrosoftDomain) {
    spoDomain = onmicrosoftDomain.name.replace('.onmicrosoft.com', '');
    console.log(`[connect-m365-tenant] SPO domain extracted: ${spoDomain} (from ${onmicrosoftDomain.name})`);
  } else {
    // Fallback: try to derive from any onmicrosoft domain
    const anyOnmicrosoft = verifiedDomains.find((d: any) => d.name?.endsWith('.onmicrosoft.com'));
    if (anyOnmicrosoft) {
      spoDomain = anyOnmicrosoft.name.replace('.mail.onmicrosoft.com', '').replace('.onmicrosoft.com', '').split('.')[0];
      console.log(`[connect-m365-tenant] SPO domain derived from fallback: ${spoDomain}`);
    }
  }

  return {
    displayName: org.displayName || 'Unknown Organization',
    primaryDomain,
    tenantId: org.id,
    spoDomain,
  };
}

// Fetch Service Principal Object ID automatically
async function fetchServicePrincipalId(accessToken: string, appId: string): Promise<string> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${appId}'`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error('Não foi possível buscar o Service Principal.');
  }

  const data = await response.json();
  const sp = data.value?.[0];
  
  if (!sp) {
    throw new Error('Service Principal não encontrado. O administrador precisa autorizar o aplicativo primeiro.');
  }

  return sp.id;
}

// Discover tenant ID from email domain
async function discoverTenantId(emailDomain: string): Promise<string> {
  try {
    const wellKnownUrl = `https://login.microsoftonline.com/${emailDomain}/v2.0/.well-known/openid-configuration`;
    const response = await fetch(wellKnownUrl);
    
    if (response.ok) {
      const wellKnown = await response.json();
      const issuer = wellKnown.issuer;
      const match = issuer.match(/login\.microsoftonline\.com\/([^/]+)/);
      return match?.[1] || emailDomain;
    }
  } catch (e) {
    console.warn('Tenant discovery failed, using domain:', e);
  }
  return emailDomain;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("M365_ENCRYPTION_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, workspaceId, adminEmail, deviceCode, tenantId: providedTenantId } = body;

    // Get global config
    const { data: globalConfig, error: configError } = await supabase
      .from('m365_global_config')
      .select('app_id, client_secret_encrypted')
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      console.error("Global config not found:", configError);
      return new Response(
        JSON.stringify({ error: "Configuração do M365 não encontrada. Contate o administrador." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========================================
    // ACTION: START - Initiate Device Code Flow
    // ========================================
    if (action === 'start') {
      if (!workspaceId || !adminEmail) {
        return new Response(
          JSON.stringify({ error: "Campos obrigatórios: workspaceId, adminEmail" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!adminEmail.includes('@')) {
        return new Response(
          JSON.stringify({ error: "Email inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailDomain = adminEmail.split('@')[1];
      const tenantId = await discoverTenantId(emailDomain);

      console.log(`[connect-m365-tenant] Starting Device Code Flow for ${emailDomain}, tenant: ${tenantId}`);

      try {
        const deviceCodeResponse = await initiateDeviceCodeFlow(tenantId, globalConfig.app_id);

        return new Response(
          JSON.stringify({
            action: 'authenticate',
            device_code: deviceCodeResponse.device_code,
            user_code: deviceCodeResponse.user_code,
            verification_uri: deviceCodeResponse.verification_uri,
            expires_in: deviceCodeResponse.expires_in,
            interval: deviceCodeResponse.interval || 5,
            message: deviceCodeResponse.message,
            tenantId: tenantId,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        console.error("Device code initiation failed:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ========================================
    // ACTION: POLL - Check if user authenticated
    // ========================================
    if (action === 'poll') {
      if (!deviceCode || !providedTenantId) {
        return new Response(
          JSON.stringify({ error: "Campos obrigatórios: deviceCode, tenantId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[connect-m365-tenant] Polling for token (public client flow)...`);

      // Public client flow - no client_secret needed for Device Code Flow
      const pollResult = await pollForToken(providedTenantId, globalConfig.app_id, deviceCode);

      if (pollResult.pending) {
        return new Response(
          JSON.stringify({ pending: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (pollResult.expired || pollResult.error) {
        return new Response(
          JSON.stringify({ 
            expired: pollResult.expired || false,
            error: pollResult.error 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // User authenticated! Now complete the connection
      const accessToken = pollResult.access_token!;
      
      console.log(`[connect-m365-tenant] Token acquired, fetching org info...`);

      // Fetch organization info
      const orgInfo = await fetchOrganizationInfo(accessToken);
      console.log(`[connect-m365-tenant] Organization: ${orgInfo.displayName} (${orgInfo.primaryDomain})`);

      // Fetch Service Principal Object ID
      let spObjectId: string;
      try {
        spObjectId = await fetchServicePrincipalId(accessToken, globalConfig.app_id);
        console.log(`[connect-m365-tenant] Service Principal Object ID: ${spObjectId}`);
      } catch (spError: any) {
        console.error("Service Principal lookup failed:", spError);
        return new Response(
          JSON.stringify({ 
            error: "Service Principal não encontrado. Execute o Admin Consent primeiro.",
            code: "SP_NOT_FOUND"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if tenant already exists
      const { data: existingTenant } = await supabase
        .from('m365_tenants')
        .select('id')
        .eq('client_id', workspaceId)
        .eq('tenant_id', orgInfo.tenantId)
        .single();

      if (existingTenant) {
        return new Response(
          JSON.stringify({ 
            error: "Este tenant já está conectado a este workspace.",
            code: "TENANT_EXISTS" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create tenant record
      const { data: tenant, error: tenantError } = await supabase
        .from('m365_tenants')
        .insert({
          client_id: workspaceId,
          tenant_id: orgInfo.tenantId,
          tenant_domain: orgInfo.primaryDomain,
          display_name: orgInfo.displayName,
          spo_domain: orgInfo.spoDomain,
          connection_status: 'connected',
          created_by: user.id,
          last_validated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (tenantError) {
        console.error("Tenant creation failed:", tenantError);
        throw tenantError;
      }

      console.log(`[connect-m365-tenant] Tenant created: ${tenant.id}`);

      // Create app credentials record
      await supabase
        .from('m365_app_credentials')
        .insert({
          tenant_record_id: tenant.id,
          azure_app_id: globalConfig.app_id,
          auth_type: 'client_secret',
          is_active: true,
          created_by: user.id,
        });

      // Find and link agent from workspace
      const { data: workspaceAgent } = await supabase
        .from('agents')
        .select('id, name, certificate_thumbprint')
        .eq('client_id', workspaceId)
        .eq('revoked', false)
        .not('certificate_thumbprint', 'is', null)
        .limit(1)
        .single();

      if (workspaceAgent) {
        await supabase
          .from('m365_tenant_agents')
          .insert({
            tenant_record_id: tenant.id,
            agent_id: workspaceAgent.id,
            enabled: true,
          });

        console.log(`[connect-m365-tenant] Agent ${workspaceAgent.id} linked to tenant`);

        // Store SP Object ID in credentials for later RBAC setup
        await supabase
          .from('m365_app_credentials')
          .update({ sp_object_id: spObjectId })
          .eq('tenant_record_id', tenant.id);
        
        // Exchange RBAC setup is NOT done automatically here because:
        // 1. CBA requires RBAC to be configured first (chicken-and-egg problem)
        // 2. RBAC setup requires admin credentials which we don't have yet
        // The user will configure Exchange RBAC via dedicated flow in TenantStatusCard
        console.log(`[connect-m365-tenant] Exchange RBAC will be configured via dedicated setup flow`);
      }

      // Create audit log
      await supabase.from('m365_audit_logs').insert({
        action: 'tenant_connected',
        user_id: user.id,
        client_id: workspaceId,
        tenant_record_id: tenant.id,
        action_details: {
          tenant_id: orgInfo.tenantId,
          display_name: orgInfo.displayName,
          domain: orgInfo.primaryDomain,
          agent_linked: !!workspaceAgent,
          sp_object_id: spObjectId,
          auth_method: 'device_code_flow',
        },
      });

      console.log(`[connect-m365-tenant] Connection complete for ${orgInfo.displayName}`);

      return new Response(
        JSON.stringify({
          success: true,
          tenantRecordId: tenant.id,
          displayName: orgInfo.displayName,
          domain: orgInfo.primaryDomain,
          tenantId: orgInfo.tenantId,
          agentLinked: !!workspaceAgent,
          message: workspaceAgent 
            ? "Tenant conectado! Configuração do Exchange em andamento..."
            : "Tenant conectado! Vincule um agent para análises avançadas.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invalid action
    return new Response(
      JSON.stringify({ error: "Ação inválida. Use 'start' ou 'poll'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in connect-m365-tenant:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
