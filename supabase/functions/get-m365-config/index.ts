import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

// Permissions to check
const REQUIRED_PERMISSIONS = [
  'User.Read.All',
  'Directory.Read.All',
  'Organization.Read.All',
  'Domain.Read.All',
  'RoleManagement.ReadWrite.Directory', // Required to assign Exchange Administrator Role
];

const RECOMMENDED_PERMISSIONS = [
  'Group.Read.All',
  'Application.Read.All',
  'Policy.Read.All',
  'Reports.Read.All', // Usage reports
  'RoleManagement.Read.Directory', // Read-only role management
];

interface PermissionStatus {
  name: string;
  granted: boolean;
  type: 'required' | 'recommended';
}

// ============= AES-256-GCM Decryption =============

// Derive CryptoKey from hex string
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('M365_ENCRYPTION_KEY not configured or invalid (must be 64 hex characters)');
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
    ['encrypt', 'decrypt']
  );
}

// Convert hex string to Uint8Array with proper ArrayBuffer
function fromHex(hex: string): Uint8Array {
  const length = hex.length / 2;
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Decrypt secret using AES-256-GCM
// Supports legacy Base64 format for backwards compatibility
async function decryptSecret(encrypted: string): Promise<string> {
  // Check if it's AES-GCM format (contains colon separator)
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
      console.error('AES-GCM decryption failed:', error);
      return '';
    }
  }
  
  // Legacy Base64 fallback for backwards compatibility
  try {
    console.warn('Using legacy Base64 decryption - please re-save config to upgrade to AES-GCM');
    return atob(encrypted);
  } catch {
    return '';
  }
}

// ============= Permission Testing =============

async function testPermission(accessToken: string, permission: string): Promise<boolean> {
  try {
    let url = '';
    switch (permission) {
      case 'User.Read.All':
        url = 'https://graph.microsoft.com/v1.0/users?$top=1&$select=id';
        break;
      case 'Directory.Read.All':
        url = 'https://graph.microsoft.com/v1.0/directoryRoles';
        break;
      case 'Organization.Read.All':
        url = 'https://graph.microsoft.com/v1.0/organization?$select=id';
        break;
      case 'Domain.Read.All':
        url = 'https://graph.microsoft.com/v1.0/domains?$top=1&$select=id';
        break;
      case 'Group.Read.All':
        url = 'https://graph.microsoft.com/v1.0/groups?$top=1&$select=id';
        break;
      case 'Application.Read.All':
        url = 'https://graph.microsoft.com/v1.0/applications?$top=1&$select=id';
        break;
      case 'Policy.Read.All':
        url = 'https://graph.microsoft.com/v1.0/policies/conditionalAccessPolicies?$top=1';
        break;
      case 'Reports.Read.All':
        url = 'https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?$top=1';
        break;
      case 'RoleManagement.Read.Directory':
        url = 'https://graph.microsoft.com/v1.0/roleManagement/directory/roleDefinitions';
        break;
      case 'RoleManagement.ReadWrite.Directory':
        // Use same endpoint as Read permission - write permission is validated by successful API call
        url = 'https://graph.microsoft.com/v1.0/roleManagement/directory/roleDefinitions';
        break;
      default:
        return false;
    }

    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Permission ${permission} test failed (${response.status}): ${errorText.substring(0, 200)}`);
    } else {
      console.log(`Permission ${permission} test succeeded`);
    }
    
    return response.ok;
  } catch (error) {
    console.error(`Permission ${permission} test error:`, error);
    return false;
  }
}

async function validatePermissions(tenantId: string, appId: string, clientSecret: string): Promise<PermissionStatus[]> {
  const results: PermissionStatus[] = [];
  
  try {
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const tokenBody = new URLSearchParams({
      client_id: appId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      for (const perm of REQUIRED_PERMISSIONS) {
        results.push({ name: perm, granted: false, type: 'required' });
      }
      for (const perm of RECOMMENDED_PERMISSIONS) {
        results.push({ name: perm, granted: false, type: 'recommended' });
      }
      return results;
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    for (const perm of REQUIRED_PERMISSIONS) {
      const granted = await testPermission(accessToken, perm);
      results.push({ name: perm, granted, type: 'required' });
    }
    
    for (const perm of RECOMMENDED_PERMISSIONS) {
      const granted = await testPermission(accessToken, perm);
      results.push({ name: perm, granted, type: 'recommended' });
    }

  } catch (error) {
    console.error('Error validating permissions:', error);
    for (const perm of REQUIRED_PERMISSIONS) {
      results.push({ name: perm, granted: false, type: 'required' });
    }
    for (const perm of RECOMMENDED_PERMISSIONS) {
      results.push({ name: perm, granted: false, type: 'recommended' });
    }
  }

  return results;
}

// ============= Main Handler =============

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use getUser for token validation - better logging for debugging
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('Token validation failed:', {
        error: authError?.message,
        code: authError?.code,
        status: authError?.status,
        tokenPrefix: token.substring(0, 20) + '...',
      });
      return new Response(
        JSON.stringify({ 
          error: 'Invalid or expired token',
          code: 'TOKEN_INVALID',
          message: 'Please refresh your session and try again'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Token validated successfully for user:', user.id);

    const url = new URL(req.url);
    const shouldValidatePermissions = url.searchParams.get('validate_permissions') === 'true';
    const tenantIdForValidation = url.searchParams.get('tenant_id');

    const defaultPermissions: PermissionStatus[] = [
      ...REQUIRED_PERMISSIONS.map(name => ({ name, granted: false, type: 'required' as const })),
      ...RECOMMENDED_PERMISSIONS.map(name => ({ name, granted: false, type: 'recommended' as const })),
    ];

    const { data: configData, error: configError } = await supabase
      .from('m365_global_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.error('Error fetching config from database:', configError);
    }

    // Get credentials from database (with decryption) or fallback to env vars
    let appId = configData?.app_id || Deno.env.get('M365_MULTI_TENANT_APP_ID');
    let clientSecret: string | undefined;
    
    if (configData?.client_secret_encrypted) {
      clientSecret = await decryptSecret(configData.client_secret_encrypted);
    } else {
      clientSecret = Deno.env.get('M365_MULTI_TENANT_CLIENT_SECRET');
    }

    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidAppId = appId && guidRegex.test(appId);
    const hasClientSecret = clientSecret && clientSecret.length > 10 && !clientSecret.includes('PLACEHOLDER');

    let savedPermissions: PermissionStatus[] | null = null;
    let savedValidatedAt: string | null = null;
    let savedTenantId: string | null = null;

    if (configData?.validated_permissions && 
        Array.isArray(configData.validated_permissions) && 
        configData.validated_permissions.length > 0) {
      savedPermissions = configData.validated_permissions as PermissionStatus[];
      savedValidatedAt = configData.last_validated_at;
      savedTenantId = configData.validation_tenant_id;
    }

    if (!isValidAppId) {
      return new Response(
        JSON.stringify({ 
          configured: false,
          app_id: null,
          has_client_secret: false,
          permissions: defaultPermissions,
          permissions_validated: false,
          message: 'M365 multi-tenant app not configured or invalid App ID format.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let maskedSecret = '';
    if (hasClientSecret && clientSecret) {
      const visiblePart = clientSecret.substring(0, 6);
      const hiddenLength = clientSecret.length - 6;
      maskedSecret = visiblePart + '•'.repeat(Math.min(hiddenLength, 20));
    }

    let permissions = savedPermissions || defaultPermissions;
    let permissionsValidated = !!savedPermissions;
    let lastValidatedAt = savedValidatedAt;
    let validationTenantId = savedTenantId;

    if (shouldValidatePermissions && isValidAppId && hasClientSecret && tenantIdForValidation && appId && clientSecret) {
      console.log('Validating permissions for tenant:', tenantIdForValidation);
      permissions = await validatePermissions(tenantIdForValidation, appId, clientSecret);
      permissionsValidated = true;
      lastValidatedAt = new Date().toISOString();
      validationTenantId = tenantIdForValidation;

      const { error: updateError } = await supabase
        .from('m365_global_config')
        .update({
          validated_permissions: permissions,
          last_validated_at: lastValidatedAt,
          validation_tenant_id: validationTenantId,
        })
        .eq('id', configData.id);

      if (updateError) {
        console.error('Error saving validated permissions:', updateError);
      } else {
        console.log('Validated permissions saved to database');
      }
    }

    return new Response(
      JSON.stringify({
        configured: isValidAppId && hasClientSecret,
        app_id: appId,
        has_client_secret: hasClientSecret,
        masked_secret: maskedSecret,
        callback_url: `${supabaseUrl}/functions/v1/m365-oauth-callback`,
        permissions,
        permissions_validated: permissionsValidated,
        last_validated_at: lastValidatedAt,
        validation_tenant_id: validationTenantId,
        source: configData ? 'database' : 'env_vars',
        // Azure certificate upload config (deprecated - now uses client tenants)
        app_object_id: configData?.app_object_id || null,
        has_azure_config: !!configData?.app_object_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error getting M365 config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
