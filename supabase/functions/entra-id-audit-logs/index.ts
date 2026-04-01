import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

interface AuditLogsRequest {
  tenant_record_id: string;
  log_type: 'signIns' | 'directoryAudits';
  filter_date_from?: string;
  filter_date_to?: string;
  filter_user?: string;
  filter_status?: 'success' | 'failure';
  top?: number;
  skip_token?: string;
}

// Encryption utilities
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex) {
    throw new Error('M365_ENCRYPTION_KEY não está configurada');
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

function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

async function decryptSecret(encrypted: string): Promise<string> {
  if (!encrypted.includes(':')) {
    // Legacy format - try base64 decode
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
    console.error('Decryption failed:', error);
    throw new Error('Falha ao decriptar secret');
  }
}

async function getAccessToken(tenantId: string, appId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token request failed:', errorText);
    throw new Error(`Falha ao obter access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

function buildODataFilter(request: AuditLogsRequest): string {
  const filters: string[] = [];
  
  if (request.filter_date_from) {
    const fieldName = request.log_type === 'signIns' ? 'createdDateTime' : 'activityDateTime';
    filters.push(`${fieldName} ge ${request.filter_date_from}`);
  }
  
  if (request.filter_date_to) {
    const fieldName = request.log_type === 'signIns' ? 'createdDateTime' : 'activityDateTime';
    filters.push(`${fieldName} le ${request.filter_date_to}`);
  }
  
  if (request.filter_user && request.log_type === 'signIns') {
    filters.push(`userPrincipalName eq '${request.filter_user}'`);
  }
  
  if (request.filter_status && request.log_type === 'signIns') {
    if (request.filter_status === 'success') {
      filters.push("status/errorCode eq 0");
    } else {
      filters.push("status/errorCode ne 0");
    }
  }
  
  return filters.join(' and ');
}

async function fetchAuditLogs(
  accessToken: string,
  request: AuditLogsRequest
): Promise<{ logs: any[]; nextLink: string | null }> {
  const baseUrl = `https://graph.microsoft.com/v1.0/auditLogs/${request.log_type}`;
  
  const params = new URLSearchParams();
  
  const top = Math.min(request.top || 50, 100);
  params.append('$top', top.toString());
  
  const orderBy = request.log_type === 'signIns' ? 'createdDateTime desc' : 'activityDateTime desc';
  params.append('$orderby', orderBy);
  
  const filter = buildODataFilter(request);
  if (filter) {
    params.append('$filter', filter);
  }
  
  let url = `${baseUrl}?${params.toString()}`;
  
  // If skip_token is provided, use it directly (it's a full URL)
  if (request.skip_token) {
    url = request.skip_token;
  }
  
  console.log('Fetching audit logs from:', url);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Graph API error:', response.status, errorText);
    
    if (response.status === 403) {
      throw new Error('PREMIUM_LICENSE_REQUIRED');
    }
    
    throw new Error(`Falha ao buscar logs: ${response.status}`);
  }
  
  const data = await response.json();
  
  return {
    logs: data.value || [],
    nextLink: data['@odata.nextLink'] || null,
  };
}

function formatSignInLog(log: any) {
  return {
    id: log.id,
    createdDateTime: log.createdDateTime,
    userDisplayName: log.userDisplayName,
    userPrincipalName: log.userPrincipalName,
    appDisplayName: log.appDisplayName,
    ipAddress: log.ipAddress,
    location: log.location ? {
      city: log.location.city,
      state: log.location.state,
      countryOrRegion: log.location.countryOrRegion,
    } : null,
    status: {
      errorCode: log.status?.errorCode || 0,
      failureReason: log.status?.failureReason || null,
    },
    clientAppUsed: log.clientAppUsed,
    deviceDetail: log.deviceDetail ? {
      browser: log.deviceDetail.browser,
      operatingSystem: log.deviceDetail.operatingSystem,
    } : null,
    conditionalAccessStatus: log.conditionalAccessStatus,
    isInteractive: log.isInteractive,
    riskState: log.riskState,
    riskLevelDuringSignIn: log.riskLevelDuringSignIn,
  };
}

function formatDirectoryAuditLog(log: any) {
  return {
    id: log.id,
    activityDateTime: log.activityDateTime,
    activityDisplayName: log.activityDisplayName,
    category: log.category,
    operationType: log.operationType,
    result: log.result,
    resultReason: log.resultReason,
    initiatedBy: {
      user: log.initiatedBy?.user ? {
        displayName: log.initiatedBy.user.displayName,
        userPrincipalName: log.initiatedBy.user.userPrincipalName,
      } : null,
      app: log.initiatedBy?.app ? {
        displayName: log.initiatedBy.app.displayName,
        appId: log.initiatedBy.app.appId,
      } : null,
    },
    targetResources: (log.targetResources || []).map((target: any) => ({
      displayName: target.displayName,
      type: target.type,
      id: target.id,
    })),
  };
}

Deno.serve(async (req) => {
  // Handle CORS
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Autorização necessária' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Parse request
    const request: AuditLogsRequest = await req.json();
    
    if (!request.tenant_record_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_record_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!request.log_type || !['signIns', 'directoryAudits'].includes(request.log_type)) {
      return new Response(
        JSON.stringify({ error: 'log_type deve ser "signIns" ou "directoryAudits"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for database queries
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from('m365_tenants')
      .select('id, tenant_id, tenant_domain, client_id, connection_status')
      .eq('id', request.tenant_record_id)
      .single();

    if (tenantError || !tenant) {
      console.error('Tenant fetch error:', tenantError);
      return new Response(
        JSON.stringify({ error: 'Tenant não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this tenant's client
    const { data: hasAccess } = await supabase
      .rpc('has_client_access', { _user_id: user.id, _client_id: tenant.client_id });

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado a este tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch global M365 config for credentials
    const { data: globalConfig, error: configError } = await supabase
      .from('m365_global_config')
      .select('app_id, client_secret_encrypted')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      console.error('Global config fetch error:', configError);
      return new Response(
        JSON.stringify({ error: 'Configuração M365 não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt client secret
    const clientSecret = await decryptSecret(globalConfig.client_secret_encrypted);

    // Get access token
    const accessToken = await getAccessToken(
      tenant.tenant_id,
      globalConfig.app_id,
      clientSecret
    );

    // Fetch audit logs
    const { logs: rawLogs, nextLink } = await fetchAuditLogs(accessToken, request);

    // Format logs based on type
    const formattedLogs = rawLogs.map(log => 
      request.log_type === 'signIns' 
        ? formatSignInLog(log) 
        : formatDirectoryAuditLog(log)
    );

    console.log(`Fetched ${formattedLogs.length} ${request.log_type} logs`);

    return new Response(
      JSON.stringify({
        success: true,
        logs: formattedLogs,
        hasMore: !!nextLink,
        nextLink: nextLink,
        tenant: {
          id: tenant.id,
          domain: tenant.tenant_domain,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in entra-id-audit-logs:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    if (errorMessage === 'PREMIUM_LICENSE_REQUIRED') {
      return new Response(
        JSON.stringify({
          error: 'Licença Azure AD Premium necessária',
          errorCode: 'PREMIUM_LICENSE_REQUIRED',
          message: 'Os logs de auditoria do Entra ID requerem uma licença Azure AD Premium (P1 ou P2) no tenant.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
