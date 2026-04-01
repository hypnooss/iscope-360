import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

interface ValidationRequest {
  tenant_id: string;
  app_id: string;
  client_secret: string;
  tenant_record_id?: string; // If updating existing tenant
}

interface PermissionStatus {
  name: string;
  granted: boolean;
  required: boolean;
}

// Permissions are loaded dynamically from m365_required_permissions table

// Office 365 Exchange Online Resource ID
const EXCHANGE_RESOURCE_ID = "00000002-0000-0ff1-ce00-000000000000";
const EXCHANGE_MANAGE_AS_APP_ID = "dc50a0fb-09a3-484d-be87-e023b12c6440";

// SharePoint Online Resource ID
const SHAREPOINT_RESOURCE_ID = "00000003-0000-0ff1-ce00-000000000000";
const SHAREPOINT_SITES_FULLCONTROL_ID = "678536fe-1083-478a-9c59-b99265e6b0d3";

// Function to test App Role Assignments (via Admin Consent)
async function testAppRoleAssignment(
  accessToken: string, 
  appId: string, 
  resourceAppId: string, 
  appRoleId: string
): Promise<{granted: boolean, error?: string}> {
  try {
    // Step 1: Get the Service Principal for our app
    const spResponse = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${appId}'&$select=id`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!spResponse.ok) {
      console.log(`App Role check - SP lookup failed: ${spResponse.status}`);
      return { granted: false, error: 'SP lookup failed' };
    }
    
    const spData = await spResponse.json();
    const spId = spData.value?.[0]?.id;
    
    if (!spId) {
      return { granted: false, error: 'SP not found' };
    }
    
    // Step 2: Get all App Role Assignments for our Service Principal
    const appRolesResponse = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals/${spId}/appRoleAssignments`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!appRolesResponse.ok) {
      console.log(`App Role check - appRoleAssignments failed: ${appRolesResponse.status}`);
      return { granted: false, error: `HTTP ${appRolesResponse.status}` };
    }
    
    const appRolesData = await appRolesResponse.json();
    
    // Step 3: Check if there's an assignment matching the resource and role
    // We need to find the Resource Service Principal first to get its ID
    const resourceSpResponse = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${resourceAppId}'&$select=id`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!resourceSpResponse.ok) {
      console.log(`App Role check - Resource SP lookup failed: ${resourceSpResponse.status}`);
      return { granted: false, error: 'Resource SP lookup failed' };
    }
    
    const resourceSpData = await resourceSpResponse.json();
    const resourceSpId = resourceSpData.value?.[0]?.id;
    
    if (!resourceSpId) {
      // Resource Service Principal not found in tenant - permission not granted
      console.log(`App Role check - Resource SP not found for appId: ${resourceAppId}`);
      return { granted: false, error: 'Resource SP not found' };
    }
    
    // Check if there's an assignment where resourceId matches and appRoleId matches
    const hasAssignment = appRolesData.value?.some(
      (assignment: { resourceId: string; appRoleId: string }) => 
        assignment.resourceId === resourceSpId && assignment.appRoleId === appRoleId
    );
    
    return { granted: hasAssignment };
  } catch (error) {
    return { granted: false, error: String(error) };
  }
}

// ========== Encryption Utilities ==========
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex) {
    throw new Error('M365_ENCRYPTION_KEY not configured');
  }
  const keyBytes = fromHex(keyHex);
  return await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
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
  // Check if this is in the new encrypted format (iv:ciphertext)
  if (encrypted.includes(':')) {
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
  }
  
  // Fallback: assume it's a plain text or Base64 encoded secret (legacy)
  try {
    return atob(encrypted);
  } catch {
    // If not Base64, return as-is (plain text)
    return encrypted;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user's JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ValidationRequest = await req.json();
    let { tenant_id, app_id, client_secret, tenant_record_id } = body;

    // Fallback: if only tenant_record_id is provided, fetch credentials from DB
    if (tenant_record_id && (!tenant_id || !app_id || !client_secret)) {
      console.log('Fetching credentials from DB for tenant_record_id:', tenant_record_id);

      // 1. Get tenant_id from m365_tenants
      if (!tenant_id) {
        const { data: tenantRow, error: tenantErr } = await supabase
          .from('m365_tenants')
          .select('tenant_id')
          .eq('id', tenant_record_id)
          .single();
        if (tenantErr || !tenantRow?.tenant_id) {
          return new Response(
            JSON.stringify({ error: 'Tenant não encontrado para o tenant_record_id fornecido.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        tenant_id = tenantRow.tenant_id;
      }

      // 2. Get app_id from m365_app_credentials
      if (!app_id) {
        const { data: credRow } = await supabase
          .from('m365_app_credentials')
          .select('azure_app_id')
          .eq('tenant_record_id', tenant_record_id)
          .eq('is_active', true)
          .maybeSingle();
        if (credRow?.azure_app_id) {
          app_id = credRow.azure_app_id;
        }
      }

      // 3. Get client_secret from m365_app_credentials or m365_global_config
      if (!client_secret) {
        // Try tenant-specific secret first
        const { data: credSecretRow } = await supabase
          .from('m365_app_credentials')
          .select('client_secret_encrypted')
          .eq('tenant_record_id', tenant_record_id)
          .eq('is_active', true)
          .maybeSingle();

        if (credSecretRow?.client_secret_encrypted) {
          client_secret = credSecretRow.client_secret_encrypted;
        } else {
          // Fallback to global config
          const { data: globalRow } = await supabase
            .from('m365_global_config')
            .select('client_secret_encrypted')
            .maybeSingle();
          if (globalRow?.client_secret_encrypted) {
            client_secret = globalRow.client_secret_encrypted;
          }
        }

        // If still no app_id, try global config
        if (!app_id) {
          const { data: globalRow } = await supabase
            .from('m365_global_config')
            .select('app_id')
            .maybeSingle();
          if (globalRow?.app_id) {
            app_id = globalRow.app_id;
          }
        }
      }
    }

    if (!tenant_id || !app_id || !client_secret) {
      return new Response(
        JSON.stringify({ error: 'tenant_id, app_id, and client_secret are required (or provide tenant_record_id)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt the client secret
    let decryptedSecret: string;
    try {
      decryptedSecret = await decryptSecret(client_secret);
      console.log('Client secret decrypted successfully');
    } catch (e) {
      console.error('Failed to decrypt client secret:', e);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Falha ao decriptar client secret.',
          details: 'A chave de criptografia pode estar incorreta ou o secret está corrompido.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Try to get an access token using Client Credentials flow
    console.log(`Attempting to get token for tenant: ${tenant_id}`);
    
    const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
    const tokenBody = new URLSearchParams({
      client_id: app_id,
      client_secret: decryptedSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token error:', tokenData);
      
      let errorMessage = 'Falha ao obter token de acesso.';
      let errorDetails = '';
      
      if (tokenData.error === 'invalid_client') {
        errorMessage = 'Client ID ou Client Secret inválido.';
        errorDetails = 'Verifique se o Application (Client) ID e o Client Secret estão corretos. Lembre-se: copie o VALUE do secret, não o Secret ID.';
      } else if (tokenData.error === 'unauthorized_client') {
        errorMessage = 'O aplicativo não está autorizado.';
        errorDetails = 'O App Registration pode não existir ou o Client Secret expirou.';
      } else if (tokenData.error_description?.includes('not found')) {
        errorMessage = 'Tenant ou aplicativo não encontrado.';
        errorDetails = 'Verifique se o Tenant ID e o Application ID estão corretos.';
      }

      // Update tenant status to failed if tenant_record_id provided
      if (tenant_record_id) {
        await supabase
          .from('m365_tenants')
          .update({
            connection_status: 'failed',
            last_validated_at: new Date().toISOString(),
          })
          .eq('id', tenant_record_id);
      }

      return new Response(
        JSON.stringify({ 
          success: false,
          error: errorMessage,
          details: errorDetails,
          step: 'token',
          raw_error: tokenData.error_description || tokenData.error,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = tokenData.access_token;
    console.log('Token obtained successfully');

    // Step 2: Test a basic Graph API call
    const meResponse = await fetch('https://graph.microsoft.com/v1.0/organization', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!meResponse.ok) {
      const errorData = await meResponse.json();
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Falha ao acessar Microsoft Graph.',
          details: 'O token foi obtido mas não foi possível acessar a API do Graph.',
          step: 'graph_access',
          raw_error: errorData.error?.message,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const orgData = await meResponse.json();
    const tenantDisplayName = orgData.value?.[0]?.displayName || 'Unknown';
    const verifiedDomains = orgData.value?.[0]?.verifiedDomains?.map((d: any) => d.name) || [];
    console.log('Graph access confirmed for:', tenantDisplayName);

    // Step 3: Fetch permissions from database and test each one dynamically
    const { data: dbPermissions } = await supabase
      .from('m365_required_permissions')
      .select('permission_name, test_url, is_required')
      .order('permission_name');

    const permissionResults: PermissionStatus[] = [];
    const permTestUrlMap: Record<string, string> = {};
    for (const p of (dbPermissions || [])) {
      if (p.test_url) permTestUrlMap[p.permission_name] = p.test_url;
    }

    for (const dbPerm of (dbPermissions || [])) {
      const permission = dbPerm.permission_name;
      let granted = false;

      try {
        // ===== Complex handlers requiring multi-step logic =====
        if (permission === 'Directory.Read.All') {
          const response = await fetch('https://graph.microsoft.com/v1.0/domains?$top=1', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          granted = response.ok;
          console.log(`Permission ${permission}: ${response.status} - granted: ${granted}`);
          if (!granted) {
            const fallbackResponse = await fetch('https://graph.microsoft.com/v1.0/directoryRoles?$top=1&$select=id', {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            granted = fallbackResponse.ok;
            console.log(`Permission ${permission} fallback: ${fallbackResponse.status} - granted: ${granted}`);
          }
        } else if (permission === 'AuditLog.Read.All') {
          const response = await fetch('https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?$top=1', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          granted = response.ok || response.status === 400;
          console.log(`Permission ${permission}: ${response.status} - granted: ${granted}`);
          if (!granted && response.status === 403) {
            const signInsResponse = await fetch('https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=1', {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            granted = signInsResponse.ok || signInsResponse.status === 400;
            console.log(`Permission ${permission} fallback: ${signInsResponse.status} - granted: ${granted}`);
          }
        } else if (permission === 'IdentityRiskyUser.Read.All') {
          const response = await fetch('https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?$top=1', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (response.ok) {
            granted = true;
          } else {
            const errBody = await response.json().catch(() => ({}));
            const errCode = errBody?.error?.code || '';
            const errMsg = errBody?.error?.message || '';
            console.log(`Permission ${permission}: ${response.status} - code: ${errCode} - msg: ${errMsg}`);
            if (response.status === 403 && (
              errCode.includes('NonPremiumTenant') ||
              errCode.includes('NotSupported') ||
              errMsg.toLowerCase().includes('license') ||
              errMsg.toLowerCase().includes('premium')
            )) {
              granted = true;
              console.log(`Permission ${permission}: 403 but license issue - treating as granted`);
            }
          }
          console.log(`Permission ${permission}: granted: ${granted}`);
        } else if (permission === 'IdentityRiskEvent.Read.All') {
          const response = await fetch('https://graph.microsoft.com/beta/identityProtection/riskDetections?$top=1', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (response.ok) {
            granted = true;
          } else {
            const errBody = await response.json().catch(() => ({}));
            const errCode = errBody?.error?.code || '';
            const errMsg = errBody?.error?.message || '';
            console.log(`Permission ${permission}: ${response.status} - code: ${errCode} - msg: ${errMsg}`);
            if (response.status === 403 && (
              errCode.includes('NonPremiumTenant') ||
              errCode.includes('NotSupported') ||
              errMsg.toLowerCase().includes('license') ||
              errMsg.toLowerCase().includes('premium')
            )) {
              granted = true;
              console.log(`Permission ${permission}: 403 but license issue - treating as granted`);
            }
          }
          console.log(`Permission ${permission}: granted: ${granted}`);
        } else if (permission === 'MailboxSettings.Read') {
          const usersResp = await fetch('https://graph.microsoft.com/v1.0/users?$top=5&$select=id', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (usersResp.ok) {
            const usersData = await usersResp.json();
            const userIds: string[] = (usersData.value || []).map((u: any) => u.id);
            if (userIds.length > 0) {
              let allMailboxNotEnabled = true;
              for (const uid of userIds) {
                const mailboxResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${uid}/mailboxSettings`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` },
                });
                if (mailboxResponse.ok) {
                  granted = true;
                  allMailboxNotEnabled = false;
                  console.log(`Permission ${permission}: ${mailboxResponse.status} on user ${uid} - granted: true`);
                  break;
                }
                const errBody = await mailboxResponse.json().catch(() => ({}));
                const errCode = errBody?.error?.code || '';
                if (mailboxResponse.status === 403) {
                  granted = false;
                  allMailboxNotEnabled = false;
                  console.log(`Permission ${permission}: 403 on user ${uid} - permission denied`);
                  break;
                } else if (errCode === 'MailboxNotEnabledForRESTAPI') {
                  console.log(`Permission ${permission}: MailboxNotEnabledForRESTAPI on user ${uid} - trying next`);
                } else {
                  console.log(`Permission ${permission}: ${mailboxResponse.status} (${errCode}) on user ${uid}`);
                }
              }
              if (allMailboxNotEnabled && !granted) {
                granted = true;
                console.log(`Permission ${permission}: all users had MailboxNotEnabledForRESTAPI - treating as granted`);
              }
            }
          } else {
            console.log(`Permission ${permission}: could not fetch users - granted: false`);
          }
        } else if (permission === 'Mail.Read') {
          const usersResponse = await fetch('https://graph.microsoft.com/v1.0/users?$top=5&$select=id', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            const userIds: string[] = (usersData.value || []).map((u: any) => u.id);
            if (userIds.length > 0) {
              let allMailboxNotEnabled = true;
              for (const uid of userIds) {
                const rulesResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${uid}/mailFolders/inbox/messageRules?$top=1`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` },
                });
                if (rulesResponse.ok) {
                  granted = true;
                  allMailboxNotEnabled = false;
                  console.log(`Permission ${permission}: ${rulesResponse.status} on user ${uid} - granted: true`);
                  break;
                }
                const errBody = await rulesResponse.json().catch(() => ({}));
                const errCode = errBody?.error?.code || '';
                if (rulesResponse.status === 403) {
                  granted = false;
                  allMailboxNotEnabled = false;
                  console.log(`Permission ${permission}: 403 on user ${uid} - permission denied`);
                  break;
                } else if (errCode === 'MailboxNotEnabledForRESTAPI') {
                  console.log(`Permission ${permission}: MailboxNotEnabledForRESTAPI on user ${uid} - trying next`);
                } else {
                  console.log(`Permission ${permission}: ${rulesResponse.status} (${errCode}) on user ${uid}`);
                }
              }
              if (allMailboxNotEnabled && !granted) {
                granted = true;
                console.log(`Permission ${permission}: all users had MailboxNotEnabledForRESTAPI - treating as granted`);
              }
            }
          } else {
            console.log(`Permission ${permission}: could not fetch users - granted: false`);
          }
        } else if (permission === 'Sites.Read.All') {
          const response = await fetch('https://graph.microsoft.com/v1.0/sites/root?$select=id', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          granted = response.ok;
          console.log(`Permission ${permission}: ${response.status} - granted: ${granted}`);
          if (!granted && response.status !== 403) {
            const sitesResponse = await fetch('https://graph.microsoft.com/v1.0/sites?$select=id&$top=1', {
              headers: { 'Authorization': `Bearer ${accessToken}` },
            });
            granted = sitesResponse.ok;
            console.log(`Permission ${permission} fallback: ${sitesResponse.status} - granted: ${granted}`);
          }
        } else if (dbPerm.test_url) {
          // ===== Generic handler using test_url from database with tolerance =====
          const testUrl = dbPerm.test_url;
          const response = await fetch(testUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });

          if (response.ok) {
            granted = true;
          } else {
            const errBody = await response.json().catch(() => ({}));
            const errCode = errBody?.error?.code || '';
            const errMsg = errBody?.error?.message || '';
            const lowerMsg = errMsg.toLowerCase();
            const lowerCode = errCode.toLowerCase();

            console.log(`Permission ${permission} FAILED: status=${response.status}, code="${errCode}", message="${errMsg.substring(0, 200)}"`);

            const isSecurityEndpoint = testUrl.includes('/security/');
            const isAdminSharepoint = testUrl.includes('/admin/sharepoint');
            const isBetaEndpoint = testUrl.includes('/beta/');

            if (response.status === 400 && (
              lowerMsg.includes('not applicable to target tenant') ||
              lowerMsg.includes('service principal for resource') ||
              (lowerMsg.includes('service principal') && lowerMsg.includes('disabled'))
            )) {
              granted = true;
              console.log(`Permission ${permission}: 400 license/service issue - treating as granted`);
            } else if (response.status === 412 || (response.status === 400 && lowerMsg.includes('not supported'))) {
              granted = true;
              console.log(`Permission ${permission}: ${response.status} app-only not supported - treating as granted`);
            } else if (response.status === 400) {
              granted = true;
              console.log(`Permission ${permission}: 400 query issue - treating as granted`);
            } else if (response.status === 403) {
              const isMissingRoles = lowerMsg.includes('missing application roles') || lowerMsg.includes('missing role');
              if (!isMissingRoles) {
                const isKnownLicenseError = (
                  lowerCode.includes('nonpremiumtenant') ||
                  lowerMsg.includes('license') ||
                  lowerMsg.includes('premium') ||
                  lowerCode === 'forbidden' ||
                  lowerCode === 'unknownerror'
                );
                const isSecurityLicenseIssue = isSecurityEndpoint && !lowerMsg.includes('insufficient privileges');
                const isAdminLicenseIssue = (isAdminSharepoint || isBetaEndpoint) && !lowerMsg.includes('insufficient privileges');

                if (isKnownLicenseError || isSecurityLicenseIssue || isAdminLicenseIssue) {
                  granted = true;
                  console.log(`Permission ${permission}: 403 license/service issue - treating as granted`);
                }
              } else {
                console.log(`Permission ${permission}: 403 missing application roles - NOT treating as granted`);
              }
            } else if (response.status === 404 && isBetaEndpoint) {
              granted = true;
              console.log(`Permission ${permission}: 404 on beta endpoint - treating as granted`);
            }
          }
          console.log(`Permission ${permission}: ${granted ? 'granted' : 'not granted'}`);
        } else {
          console.log(`Permission ${permission}: no test_url configured - skipping`);
        }
      } catch (e) {
        console.error(`Error testing ${permission}:`, e);
        granted = false;
      }

      permissionResults.push({
        name: permission,
        granted,
        required: dbPerm.is_required,
      });
    }

    // Test Application.ReadWrite.All (certificate management permission)
    // In a client tenant, we use the Service Principal (Enterprise Application)
    // The endpoint /servicePrincipals/{id} endpoint works within the client tenant context
    console.log('Testing Application.ReadWrite.All permission...');
    
    let spObjectId: string | null = null;
    
    // First, try to get sp_object_id from m365_app_credentials
    if (tenant_record_id) {
      const { data: appCreds } = await supabase
        .from('m365_app_credentials')
        .select('sp_object_id, azure_app_id')
        .eq('tenant_record_id', tenant_record_id)
        .maybeSingle();
      
      spObjectId = appCreds?.sp_object_id || null;
      
      // If no sp_object_id stored, fetch from Graph using servicePrincipals endpoint
      if (!spObjectId && (appCreds?.azure_app_id || app_id)) {
        const appIdToUse = appCreds?.azure_app_id || app_id;
        console.log('Fetching Service Principal from Graph API for appId:', appIdToUse);
        
        const spLookupResponse = await fetch(
          `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${appIdToUse}'&$select=id,appId,displayName`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        
        if (spLookupResponse.ok) {
          const spData = await spLookupResponse.json();
          spObjectId = spData.value?.[0]?.id || null;
          console.log('Found Service Principal:', spObjectId, spData.value?.[0]?.displayName);
          
          if (spObjectId && tenant_record_id) {
            await supabase
              .from('m365_app_credentials')
              .update({ sp_object_id: spObjectId })
              .eq('tenant_record_id', tenant_record_id);
            console.log('Stored sp_object_id:', spObjectId);
          }
        } else {
          const errorText = await spLookupResponse.text();
          console.log('Could not fetch Service Principal:', spLookupResponse.status, errorText);
        }
      }
    }

    // Validate Application.ReadWrite.All - only if not already tested from DB
    if (!permissionResults.find(p => p.name === 'Application.ReadWrite.All')) {
      if (spObjectId) {
        console.log('Testing Application.ReadWrite.All with Service Principal:', spObjectId);
        const spResponse = await fetch(
          `https://graph.microsoft.com/v1.0/servicePrincipals/${spObjectId}?$select=id,appId,keyCredentials`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const appWriteGranted = spResponse.ok;
        console.log(`Permission Application.ReadWrite.All: ${spResponse.status} - granted: ${appWriteGranted}`);
        if (!appWriteGranted) {
          const errorBody = await spResponse.text();
          console.log('Application.ReadWrite.All error:', errorBody);
        }
        permissionResults.push({ name: 'Application.ReadWrite.All', granted: appWriteGranted, required: false });
      } else {
        console.log('Could not find Service Principal - marking Application.ReadWrite.All as not granted');
        permissionResults.push({ name: 'Application.ReadWrite.All', granted: false, required: false });
      }
    }

    // Test Exchange.ManageAsApp permission (displayed as "Exchange Administrator")
    console.log('Testing Exchange.ManageAsApp (Exchange Administrator)...');
    const exchangeResult = await testAppRoleAssignment(accessToken, app_id, EXCHANGE_RESOURCE_ID, EXCHANGE_MANAGE_AS_APP_ID);
    permissionResults.push({ name: 'Exchange Administrator', granted: exchangeResult.granted, required: false });
    console.log(`Exchange Administrator (Exchange.ManageAsApp): ${exchangeResult.granted ? 'granted' : 'not granted'}${exchangeResult.error ? ` (${exchangeResult.error})` : ''}`);

    // Test Sites.FullControl.All permission (displayed as "SharePoint Administrator")
    console.log('Testing Sites.FullControl.All (SharePoint Administrator)...');
    const sharepointResult = await testAppRoleAssignment(accessToken, app_id, SHAREPOINT_RESOURCE_ID, SHAREPOINT_SITES_FULLCONTROL_ID);
    permissionResults.push({ name: 'SharePoint Administrator', granted: sharepointResult.granted, required: false });
    console.log(`SharePoint Administrator (Sites.FullControl.All): ${sharepointResult.granted ? 'granted' : 'not granted'}${sharepointResult.error ? ` (${sharepointResult.error})` : ''}`);

    // ========== Retry Logic for Azure AD Propagation Delay ==========
    // When a new permission is added to the app manifest and Admin Consent is granted,
    // the client_credentials token may take up to 5 minutes to reflect the new scope.
    // We detect "scopes are missing in the token" errors and retry with a fresh token.
    const failedPermissions = permissionResults.filter(p => !p.granted).map(p => p.name);
    
    if (failedPermissions.length > 0) {
      // Build a test URL map for quick retesting
      // Use test URLs from database (built earlier from dbPermissions)
      const RETRY_TEST_URLS = permTestUrlMap;

      // First pass: check which failed permissions have "scopes are missing" error
      const scopesMissingPermissions: string[] = [];
      for (const permName of failedPermissions) {
        const testUrl = RETRY_TEST_URLS[permName];
        if (!testUrl) continue;
        
        try {
          const checkResponse = await fetch(testUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (!checkResponse.ok) {
            const errText = await checkResponse.text().catch(() => '');
            if (errText.toLowerCase().includes('scopes are missing')) {
              scopesMissingPermissions.push(permName);
              console.log(`Permission ${permName}: detected "scopes are missing" - will retry with new token`);
            }
          } else {
            // Actually succeeded on recheck - update result
            const idx = permissionResults.findIndex(p => p.name === permName);
            if (idx !== -1) {
              permissionResults[idx].granted = true;
              console.log(`Permission ${permName}: succeeded on recheck - marking as granted`);
            }
          }
        } catch (e) {
          console.error(`Error rechecking ${permName}:`, e);
        }
      }

      // If we found permissions with "scopes are missing", wait and retry with a fresh token
      if (scopesMissingPermissions.length > 0) {
        console.log(`Azure AD propagation delay detected for ${scopesMissingPermissions.length} permissions. Waiting 15 seconds for new token...`);
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Get a fresh token
        const retryTokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenBody.toString(),
        });

        if (retryTokenResponse.ok) {
          const retryTokenData = await retryTokenResponse.json();
          const freshToken = retryTokenData.access_token;
          console.log('Fresh token obtained for retry');

          for (const permName of scopesMissingPermissions) {
            const testUrl = RETRY_TEST_URLS[permName];
            if (!testUrl) continue;

            try {
              const retryResponse = await fetch(testUrl, {
                headers: { 'Authorization': `Bearer ${freshToken}` },
              });
              
              const retryGranted = retryResponse.ok || retryResponse.status === 400;
              console.log(`Permission ${permName} retry: ${retryResponse.status} - granted: ${retryGranted}`);

              if (retryGranted) {
                const idx = permissionResults.findIndex(p => p.name === permName);
                if (idx !== -1) {
                  permissionResults[idx].granted = true;
                  console.log(`Permission ${permName}: granted after retry with fresh token ✅`);
                }
              } else {
                const errText = await retryResponse.text().catch(() => '');
                console.log(`Permission ${permName}: still failing after retry - ${errText.substring(0, 200)}`);
              }
            } catch (e) {
              console.error(`Error retrying ${permName}:`, e);
            }
          }
        } else {
          console.error('Failed to obtain fresh token for retry:', retryTokenResponse.status);
        }
      }
    }

    const requiredResults = permissionResults.filter(p => p.required !== false);
    const allPermissionsGranted = requiredResults.every(p => p.granted);
    const missingPermissions = permissionResults.filter(p => !p.granted).map(p => p.name);
    console.log(`Permission check complete: ${permissionResults.filter(p => p.granted).length}/${permissionResults.length} granted`);
    console.log(`Missing permissions: ${missingPermissions.join(', ') || 'none'}`);

    // Step 4: If tenant_record_id provided, update the tenant status
    if (tenant_record_id) {
      const connectionStatus = allPermissionsGranted ? 'connected' : 'partial';
      
      await supabase
        .from('m365_tenants')
        .update({
          connection_status: connectionStatus,
          display_name: tenantDisplayName,
          tenant_domain: verifiedDomains[0] || null,
          last_validated_at: new Date().toISOString(),
        })
        .eq('id', tenant_record_id);

      // Update permission status in m365_tenant_permissions
      for (const perm of permissionResults) {
        const upsertResult = await supabase
          .from('m365_tenant_permissions')
          .upsert({
            tenant_record_id,
            permission_name: perm.name,
            permission_type: 'Application',
            status: perm.granted ? 'granted' : 'pending',
            granted_at: perm.granted ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'tenant_record_id,permission_name',
          });
        
        if (upsertResult.error) {
          console.error(`Error upserting permission ${perm.name}:`, upsertResult.error);
        } else {
          console.log(`Permission ${perm.name} upserted: status=${perm.granted ? 'granted' : 'pending'}`);
        }
      }

      // Log the validation action
      await supabase.from('m365_audit_logs').insert({
        tenant_record_id,
        user_id: user.id,
        action: 'connection_tested',
        action_details: {
          connection_status: connectionStatus,
          permissions_granted: permissionResults.filter(p => p.granted).length,
          permissions_total: permissionResults.length,
          missing_permissions: missingPermissions,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        token_valid: true,
        graph_access: true,
        tenant_info: {
          display_name: tenantDisplayName,
          verified_domains: verifiedDomains,
        },
        permissions: permissionResults,
        all_permissions_granted: allPermissionsGranted,
        missing_permissions: missingPermissions,
        connection_status: allPermissionsGranted ? 'connected' : 'partial',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Validation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Erro interno ao validar conexão.',
        details: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});