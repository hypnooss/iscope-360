import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

interface StatePayload {
  tenant_record_id: string;
  client_id: string;
  tenant_id: string;
  redirect_url: string;
}

const REQUIRED_PERMISSIONS = [
  'User.Read.All',
  'Directory.Read.All', 
  'Group.Read.All',
  'Application.Read.All',
  'AuditLog.Read.All',
  'Policy.Read.All',
  'RoleManagement.ReadWrite.Directory', // Required to assign Exchange Administrator Role
  'IdentityRiskyUser.Read.All', // Required for Identity Protection risky users
  'IdentityRiskEvent.Read.All', // Required for Identity Protection risk detections
  // Exchange Online
  'MailboxSettings.Read',
  'Mail.Read',
];

const OPTIONAL_PERMISSIONS = [
  'Reports.Read.All', // Requires Azure AD Premium
];

// Exchange Administrator Role Template ID (constant across all Azure AD tenants)
const EXCHANGE_ADMIN_ROLE_TEMPLATE_ID = '29232cdf-9323-42fd-ade2-1d097af3e4de';

// Function to assign Exchange Administrator role to the App's Service Principal
// This is required for PowerShell CBA connections to Exchange Online
async function assignExchangeAdminRole(
  accessToken: string, 
  appId: string
): Promise<{ success: boolean; error?: string; alreadyAssigned?: boolean; retryable?: boolean }> {
  try {
    // 1. Get Service Principal by App ID in the target tenant
    console.log('Looking up Service Principal for app:', appId);
    const spResponse = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${appId}'&$select=id,displayName`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!spResponse.ok) {
      const errText = await spResponse.text();
      console.error('Failed to find Service Principal:', spResponse.status, errText);
      return { success: false, error: `Failed to find Service Principal: HTTP ${spResponse.status}` };
    }
    
    const spData = await spResponse.json();
    const servicePrincipalId = spData.value?.[0]?.id;
    const spDisplayName = spData.value?.[0]?.displayName;
    
    if (!servicePrincipalId) {
      console.error('Service Principal not found in tenant for app:', appId);
      return { success: false, error: 'Service Principal not found in tenant' };
    }
    
    console.log('Found Service Principal:', servicePrincipalId, spDisplayName);
    
    // 2. Check if role is already assigned
    console.log('Checking if Exchange Administrator role is already assigned...');
    const checkResponse = await fetch(
      `https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments?$filter=principalId eq '${servicePrincipalId}' and roleDefinitionId eq '${EXCHANGE_ADMIN_ROLE_TEMPLATE_ID}'`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      if (checkData.value?.length > 0) {
        console.log('Exchange Administrator role already assigned to Service Principal');
        return { success: true, alreadyAssigned: true };
      }
    } else {
      // Log but continue - we'll try to assign anyway
      const checkErr = await checkResponse.text();
      console.warn('Could not check existing role assignments:', checkResponse.status, checkErr);
    }
    
    // 3. Assign the Exchange Administrator role
    console.log('Assigning Exchange Administrator role to Service Principal...');
    const assignResponse = await fetch(
      'https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          '@odata.type': '#microsoft.graph.unifiedRoleAssignment',
          roleDefinitionId: EXCHANGE_ADMIN_ROLE_TEMPLATE_ID,
          principalId: servicePrincipalId,
          directoryScopeId: '/',
        }),
      }
    );
    
    if (assignResponse.ok || assignResponse.status === 201) {
      console.log('Exchange Administrator role assigned successfully');
      return { success: true };
    }
    
    const errorBody = await assignResponse.json().catch(() => ({}));
    const errorMessage = errorBody?.error?.message || `HTTP ${assignResponse.status}`;
    const errorCode = errorBody?.error?.code || '';
    
    // Handle specific error codes
    if (errorCode === 'Authorization_RequestDenied' || assignResponse.status === 403) {
      console.warn('Insufficient permissions to assign Exchange Administrator role:', errorMessage);
      return { 
        success: false, 
        retryable: true,
        error: 'Permissão RoleManagement.ReadWrite.Directory ainda não propagou ou não foi concedida.' 
      };
    }
    
    console.error('Failed to assign Exchange Administrator role:', errorCode, errorMessage);
    return { success: false, error: errorMessage };
  } catch (error) {
    console.error('Exception while assigning Exchange Administrator role:', error);
    return { success: false, error: String(error) };
  }
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
  
  // Legacy Base64 fallback
  try {
    console.warn('Using legacy Base64 decryption - please re-save config to upgrade to AES-GCM');
    return atob(encrypted);
  } catch {
    return '';
  }
}

// Get M365 credentials from database or environment variables
async function getM365Credentials(supabaseUrl: string, supabaseServiceKey: string): Promise<{ appId: string; clientSecret: string } | null> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // First try to get from database
  const { data: configData, error: configError } = await supabase
    .from('m365_global_config')
    .select('app_id, client_secret_encrypted')
    .limit(1)
    .maybeSingle();

  if (!configError && configData) {
    const config = configData as { app_id?: string; client_secret_encrypted?: string };
    if (config.app_id && config.client_secret_encrypted) {
      const clientSecret = await decryptSecret(config.client_secret_encrypted);
      if (clientSecret) {
        console.log('Using M365 credentials from database (AES-GCM encrypted)');
        return { appId: config.app_id, clientSecret };
      }
    }
  }

  // Fallback to environment variables
  const appId = Deno.env.get('M365_MULTI_TENANT_APP_ID');
  const clientSecret = Deno.env.get('M365_MULTI_TENANT_CLIENT_SECRET');

  if (appId && clientSecret) {
    console.log('Using M365 credentials from environment variables');
    return { appId, clientSecret };
  }

  return null;
}

// ============= Main Handler =============

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    
    if (error) {
      console.error('OAuth error from Microsoft:', error, errorDescription);
      let redirectUrl = '/scope-m365/oauth-callback';
      try {
        const stateData = JSON.parse(atob(url.searchParams.get('state')!));
        redirectUrl = stateData.redirect_url?.replace('/tenant-connection', '/oauth-callback') || redirectUrl;
      } catch {}
      
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${redirectUrl}?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`,
        },
      });
    }

    const stateParam = url.searchParams.get('state');
    if (!stateParam) {
      throw new Error('Missing state parameter');
    }

    let statePayload: StatePayload;
    try {
      statePayload = JSON.parse(atob(stateParam));
    } catch {
      throw new Error('Invalid state parameter');
    }

    const { tenant_record_id, client_id, tenant_id, redirect_url } = statePayload;

    // Initialize Supabase client for database access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get M365 credentials from database (preferred) or env vars (fallback)
    const credentials = await getM365Credentials(supabaseUrl, supabaseServiceKey);
    if (!credentials) {
      throw new Error('Multi-tenant app credentials not configured');
    }

    const { appId, clientSecret } = credentials;

    // Test the connection by getting a token using client credentials
    console.log('Getting token for tenant:', tenant_id);
    
    const tokenUrl = `https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`;
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
      const tokenError = await tokenResponse.text();
      console.error('Token error:', tokenError);
      const tokenErrorRedirectUrl = redirect_url.replace('/tenant-connection', '/oauth-callback');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${tokenErrorRedirectUrl}?error=token_failed&error_description=${encodeURIComponent('Falha ao obter token de acesso. Verifique se o Admin Consent foi concedido corretamente.')}`,
        },
      });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    console.log('Token obtained successfully, expires_in:', tokenData.expires_in);

    // Decode and log token claims for debugging
    try {
      const tokenParts = accessToken.split('.');
      const tokenPayload = JSON.parse(atob(tokenParts[1]));
      console.log('Token claims:', {
        appid: tokenPayload.appid,
        tid: tokenPayload.tid,
        aud: tokenPayload.aud,
        iss: tokenPayload.iss,
        exp: new Date(tokenPayload.exp * 1000).toISOString(),
      });
    } catch (decodeErr) {
      console.warn('Could not decode token for logging:', decodeErr);
    }

    // ===== EARLY SAVE: Save credentials BEFORE testing Graph API =====
    // This allows the user to use the "Test" button if the initial test fails
    console.log('Saving credentials early to allow retry...');
    const { error: earlyCredError } = await supabase
      .from('m365_app_credentials')
      .upsert({
        tenant_record_id,
        azure_app_id: appId,
        auth_type: 'multi_tenant_app',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_record_id',
      });

    if (earlyCredError) {
      console.error('Failed to save early credentials:', earlyCredError);
      // Continue anyway - not critical at this point
    } else {
      console.log('Early credentials saved successfully for tenant_record_id:', tenant_record_id);
    }

    // Test Graph API access using /organization endpoint
    // Organization.Read.All is always granted via Admin Consent
    console.log('Testing Graph API access with /organization endpoint...');
    
    const fetchOrganization = async () => {
      return await fetch('https://graph.microsoft.com/v1.0/organization', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
    };
    
    // Retry with exponential backoff: 10s, 20s, 30s (total 60s max wait)
    const delays = [10000, 20000, 30000];
    let orgResponse = await fetchOrganization();
    let lastError: { code?: string; message?: string } = {};

    for (let attempt = 0; !orgResponse.ok && attempt < delays.length; attempt++) {
      const errorText = await orgResponse.text();
      try {
        lastError = JSON.parse(errorText).error || { message: errorText };
      } catch {
        lastError = { code: 'UnknownError', message: errorText };
      }
      
      console.error(`Graph API error (attempt ${attempt + 1}):`, {
        status: orgResponse.status,
        code: lastError.code,
        message: lastError.message,
      });
      
      // Only retry on propagation-related errors
      if (lastError.code === 'Authorization_IdentityNotFound' || 
          lastError.code === 'Authorization_RequestDenied' ||
          orgResponse.status === 401 ||
          orgResponse.status === 403) {
        console.log(`Waiting ${delays[attempt]/1000}s for Admin Consent propagation (attempt ${attempt + 2})...`);
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        orgResponse = await fetchOrganization();
      } else {
        break; // Don't retry on other errors
      }
    }

    if (!orgResponse.ok) {
      const finalErrorText = await orgResponse.text();
      let finalError;
      try {
        finalError = JSON.parse(finalErrorText).error || { message: finalErrorText };
      } catch {
        finalError = { code: 'UnknownError', message: finalErrorText };
      }
      
      console.error('Graph API error (final):', {
        status: orgResponse.status,
        code: finalError.code,
        message: finalError.message,
      });
      
      const errorRedirectUrl = redirect_url.replace('/tenant-connection', '/oauth-callback');
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${errorRedirectUrl}?error=graph_access_failed&error_description=${encodeURIComponent(`Failed to access Microsoft Graph API after retries: ${finalError.message || 'Unknown error'}. O Admin Consent pode levar até 5 minutos para propagar. Aguarde e tente reconectar.`)}`,
        },
      });
    }

    const orgData = await orgResponse.json();
    const organization = orgData.value?.[0];
    console.log('Organization retrieved:', organization?.displayName);
    
    // Extract primary domain from organization's verified domains
    const verifiedDomains = organization?.verifiedDomains || [];
    const defaultDomain = verifiedDomains.find((d: any) => d.isDefault);
    const initialDomain = verifiedDomains.find((d: any) => d.isInitial);
    const primaryDomain = defaultDomain?.name || initialDomain?.name || verifiedDomains[0]?.name || null;
    const displayName = organization?.displayName || primaryDomain;

    // Test permissions
    console.log('Testing permissions...');
    const permissionResults: { name: string; granted: boolean; required: boolean; optional?: boolean; error?: string }[] = [];
    
    // Helper function to test Directory.Read.All with fallback (same strategy as validate-m365-connection)
    async function testDirectoryPermission(): Promise<{ granted: boolean; error?: string }> {
      // First try /domains (more reliable across tenant types)
      const domainsTestResponse = await fetch('https://graph.microsoft.com/v1.0/domains?$top=1', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (domainsTestResponse.ok) {
        return { granted: true };
      }
      
      // Fallback to /directoryRoles
      const rolesResponse = await fetch('https://graph.microsoft.com/v1.0/directoryRoles?$top=1&$select=id', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (rolesResponse.ok) {
        return { granted: true };
      }
      
      // Return error from the last test
      try {
        const errorBody = await rolesResponse.json();
        return { 
          granted: false, 
          error: errorBody?.error?.code || `HTTP ${rolesResponse.status}` 
        };
      } catch {
        return { granted: false, error: `HTTP ${rolesResponse.status}` };
      }
    }
    
    // Standard permission tests (excluding Directory.Read.All which has custom logic)
    const permissionTests = [
      { permission: 'User.Read.All', endpoint: 'https://graph.microsoft.com/v1.0/users?$top=1' },
      { permission: 'Group.Read.All', endpoint: 'https://graph.microsoft.com/v1.0/groups?$top=1' },
      { permission: 'Application.Read.All', endpoint: 'https://graph.microsoft.com/v1.0/applications?$top=1' },
      { permission: 'AuditLog.Read.All', endpoint: 'https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=1' },
      { permission: 'Policy.Read.All', endpoint: 'https://graph.microsoft.com/v1.0/policies/authenticationMethodsPolicy' },
      { permission: 'Reports.Read.All', endpoint: 'https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?$top=1' },
      { permission: 'IdentityRiskyUser.Read.All', endpoint: 'https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?$top=1' },
      { permission: 'IdentityRiskEvent.Read.All', endpoint: 'https://graph.microsoft.com/beta/identityProtection/riskDetections?$top=1' },
    ];

    // Test other permissions (generic endpoint tests) with unified tolerance logic
    for (const test of permissionTests) {
      try {
        const testResponse = await fetch(test.endpoint, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        const isRequired = REQUIRED_PERMISSIONS.includes(test.permission);
        const isOptional = OPTIONAL_PERMISSIONS.includes(test.permission);
        
        let permGranted = testResponse.ok;
        let errorDetail: string | undefined;
        
        if (!testResponse.ok) {
          let errCode = '';
          let errMsg = '';
          try {
            const errorBody = await testResponse.json();
            errCode = errorBody?.error?.code || '';
            errMsg = errorBody?.error?.message || '';
            errorDetail = errCode || errMsg || `HTTP ${testResponse.status}`;
          } catch {
            errorDetail = `HTTP ${testResponse.status}`;
          }
          
          const lowerMsg = errMsg.toLowerCase();
          const lowerCode = errCode.toLowerCase();
          const isSecurityEndpoint = test.endpoint.includes('/security/');
          const isBetaEndpoint = test.endpoint.includes('/beta/');
          
          // Unified tolerance: treat license/service/context errors as "granted"
          if (testResponse.status === 400 && (
            lowerMsg.includes('not applicable to target tenant') ||
            lowerMsg.includes('service principal for resource') ||
            (lowerMsg.includes('service principal') && lowerMsg.includes('disabled'))
          )) {
            permGranted = true;
            console.log(`Permission test for ${test.permission}: 400 license/service issue - treating as granted`);
          } else if (testResponse.status === 412 || (testResponse.status === 400 && lowerMsg.includes('not supported'))) {
            permGranted = true;
            console.log(`Permission test for ${test.permission}: ${testResponse.status} app-only not supported - treating as granted`);
          } else if (testResponse.status === 403) {
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
              if (isKnownLicenseError || isSecurityLicenseIssue) {
                permGranted = true;
                console.log(`Permission test for ${test.permission}: 403 license/service issue - treating as granted`);
              }
            }
            if (!permGranted) {
              console.log(`Permission test for ${test.permission}: FAILED - ${errorDetail}`);
            }
          } else if (testResponse.status === 404 && isBetaEndpoint) {
            permGranted = true;
            console.log(`Permission test for ${test.permission}: 404 on beta endpoint - treating as granted`);
          } else {
            console.log(`Permission test for ${test.permission}: FAILED - ${errorDetail}`);
          }
        } else {
          console.log(`Permission test for ${test.permission}: OK`);
        }
        
        permissionResults.push({
          name: test.permission,
          granted: permGranted,
          required: isRequired,
          optional: isOptional,
          error: permGranted ? undefined : errorDetail,
        });
      } catch (err) {
        console.error(`Permission test failed for ${test.permission}:`, err);
        permissionResults.push({
          name: test.permission,
          granted: false,
          required: REQUIRED_PERMISSIONS.includes(test.permission),
          optional: OPTIONAL_PERMISSIONS.includes(test.permission),
          error: String(err),
        });
      }
    }

    // Test Exchange Online permissions with user-specific endpoints
    // Fetch up to 5 users to handle MailboxNotEnabledForRESTAPI errors
    let testUserIds: string[] = [];
    try {
      const usersResp = await fetch('https://graph.microsoft.com/v1.0/users?$top=5&$select=id', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (usersResp.ok) {
        const usersData = await usersResp.json();
        testUserIds = (usersData.value || []).map((u: any) => u.id);
      }
    } catch (err) {
      console.warn('Could not fetch users for Exchange permission tests:', err);
    }

    // MailboxSettings.Read
    try {
      let mailboxGranted = false;
      let mailboxError: string | undefined;
      if (testUserIds.length > 0) {
        let allMailboxNotEnabled = true;
        for (const uid of testUserIds) {
          const mailboxResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${uid}/mailboxSettings`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (mailboxResponse.ok) {
            mailboxGranted = true;
            allMailboxNotEnabled = false;
            console.log(`Permission test for MailboxSettings.Read: OK on user ${uid}`);
            break;
          }
          const errBody = await mailboxResponse.json().catch(() => ({}));
          const errCode = errBody?.error?.code || '';
          if (mailboxResponse.status === 403) {
            allMailboxNotEnabled = false;
            mailboxError = errCode || `HTTP 403`;
            console.log(`Permission test for MailboxSettings.Read: DENIED (403) on user ${uid}`);
            break;
          } else if (errCode === 'MailboxNotEnabledForRESTAPI') {
            console.log(`Permission test for MailboxSettings.Read: MailboxNotEnabledForRESTAPI on user ${uid} - trying next`);
          } else {
            allMailboxNotEnabled = false;
            mailboxError = errCode || `HTTP ${mailboxResponse.status}`;
            console.log(`Permission test for MailboxSettings.Read: ${mailboxResponse.status} (${errCode}) on user ${uid}`);
          }
        }
        if (allMailboxNotEnabled && !mailboxGranted) {
          mailboxGranted = true;
          console.log(`Permission test for MailboxSettings.Read: all users had MailboxNotEnabledForRESTAPI - treating as granted`);
        }
      } else {
        mailboxError = 'No users found to test';
        console.log(`Permission test for MailboxSettings.Read: SKIPPED - no users`);
      }
      permissionResults.push({
        name: 'MailboxSettings.Read',
        granted: mailboxGranted,
        required: true,
        error: mailboxError,
      });
    } catch (err) {
      console.error('Permission test failed for MailboxSettings.Read:', err);
      permissionResults.push({ name: 'MailboxSettings.Read', granted: false, required: true, error: String(err) });
    }

    // Mail.Read
    try {
      let mailGranted = false;
      let mailError: string | undefined;
      if (testUserIds.length > 0) {
        let allMailNotEnabled = true;
        for (const uid of testUserIds) {
          const rulesResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${uid}/mailFolders/inbox/messageRules?$top=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (rulesResponse.ok) {
            mailGranted = true;
            allMailNotEnabled = false;
            console.log(`Permission test for Mail.Read: OK on user ${uid}`);
            break;
          }
          const errBody = await rulesResponse.json().catch(() => ({}));
          const errCode = errBody?.error?.code || '';
          if (rulesResponse.status === 403) {
            allMailNotEnabled = false;
            mailError = errCode || `HTTP 403`;
            console.log(`Permission test for Mail.Read: DENIED (403) on user ${uid}`);
            break;
          } else if (errCode === 'MailboxNotEnabledForRESTAPI') {
            console.log(`Permission test for Mail.Read: MailboxNotEnabledForRESTAPI on user ${uid} - trying next`);
          } else {
            allMailNotEnabled = false;
            mailError = errCode || `HTTP ${rulesResponse.status}`;
            console.log(`Permission test for Mail.Read: ${rulesResponse.status} (${errCode}) on user ${uid}`);
          }
        }
        if (allMailNotEnabled && !mailGranted) {
          mailGranted = true;
          console.log(`Permission test for Mail.Read: all users had MailboxNotEnabledForRESTAPI - treating as granted`);
        }
      } else {
        mailError = 'No users found to test';
        console.log(`Permission test for Mail.Read: SKIPPED - no users`);
      }
      permissionResults.push({
        name: 'Mail.Read',
        granted: mailGranted,
        required: true,
        error: mailError,
      });
    } catch (err) {
      console.error('Permission test failed for Mail.Read:', err);
      permissionResults.push({ name: 'Mail.Read', granted: false, required: true, error: String(err) });
    }

    console.log('Permission test results:', JSON.stringify(permissionResults));

    // === Fetch Service Principal Object ID for Exchange RBAC setup via PowerShell ===
    // This is critical for the setup-exchange-rbac edge function
    console.log('Fetching Service Principal Object ID for Exchange RBAC setup...');
    let spObjectId: string | null = null;
    try {
      const spResponse = await fetch(
        `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${appId}'&$select=id,displayName`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (spResponse.ok) {
        const spData = await spResponse.json();
        spObjectId = spData.value?.[0]?.id || null;
        console.log('Service Principal Object ID:', spObjectId);
      } else {
        console.warn('Could not fetch Service Principal:', await spResponse.text());
      }
    } catch (spErr) {
      console.error('Error fetching Service Principal:', spErr);
    }

    // === Fetch App Registration Object ID for certificate upload ===
    // This is required for PATCH /applications/{id} to upload agent certificates
    console.log('Fetching App Registration Object ID for certificate upload...');
    let appObjectId: string | null = null;
    try {
      const appRegResponse = await fetch(
        `https://graph.microsoft.com/v1.0/applications(appId='${appId}')?$select=id,displayName`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      if (appRegResponse.ok) {
        const appRegData = await appRegResponse.json();
        appObjectId = appRegData.id || null;
        console.log('App Registration Object ID:', appObjectId);
      } else {
        console.warn('Could not fetch App Registration:', await appRegResponse.text());
      }
    } catch (appErr) {
      console.error('Error fetching App Registration:', appErr);
    }

    // === Attempt to assign Exchange Administrator role for PowerShell CBA ===
    // This is non-blocking - if it fails, Graph API features still work
    // Uses retry with backoff to wait for RoleManagement.ReadWrite.Directory propagation
    console.log('Attempting to assign Exchange Administrator role for PowerShell connectivity...');
    const retryDelays = [5000, 10000, 15000]; // 5s, 10s, 15s between retries
    let roleResult = await assignExchangeAdminRole(accessToken, appId);
    
    if (!roleResult.success && roleResult.retryable) {
      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        console.log(`Exchange Admin role assignment failed (retryable). Waiting ${retryDelays[attempt] / 1000}s before retry ${attempt + 2}/${retryDelays.length + 1}...`);
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        roleResult = await assignExchangeAdminRole(accessToken, appId);
        if (roleResult.success || !roleResult.retryable) break;
      }
    }
    
    // Add role assignment result to permissions list for UI visibility
    permissionResults.push({
      name: 'Exchange Administrator Role',
      granted: roleResult.success,
      required: false, // Not required for Graph API, only for PowerShell
      optional: true,
      error: roleResult.error,
    });
    
    if (roleResult.success) {
      console.log(roleResult.alreadyAssigned 
        ? 'Exchange Administrator role already assigned' 
        : 'Exchange Administrator role assigned successfully');
    } else {
      console.warn('Could not assign Exchange Administrator role:', roleResult.error);
      console.warn('PowerShell Exchange Online features may not work. Manual role assignment required.');
    }

    const allPermissionsGranted = permissionResults
      .filter(p => p.required)
      .every(p => p.granted);

    const missingPermissions = permissionResults
      .filter(p => p.required && !p.granted)
      .map(p => p.name);

    // Update tenant record
    const connectionStatus = allPermissionsGranted ? 'connected' : 'pending';
    
    const { error: updateError } = await supabase
      .from('m365_tenants')
      .update({
        connection_status: connectionStatus,
        display_name: displayName,
        tenant_domain: primaryDomain,
        last_validated_at: new Date().toISOString(),
      })
      .eq('id', tenant_record_id);

    if (updateError) {
      console.error('Failed to update tenant:', updateError);
      throw new Error('Failed to update tenant record');
    }

    // Store credentials reference (using multi-tenant app) with sp_object_id and app_object_id
    const { error: credError } = await supabase
      .from('m365_app_credentials')
      .upsert({
        tenant_record_id,
        azure_app_id: appId,
        sp_object_id: spObjectId, // Service Principal Object ID for Exchange RBAC setup
        app_object_id: appObjectId, // App Registration Object ID for certificate upload
        auth_type: 'multi_tenant_app',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_record_id',
      });

    if (credError) {
      console.error('Failed to store credentials:', credError);
    } else {
      console.log('Credentials saved:', { spObjectId, appObjectId });
    }

    // Enable Entra ID submodule
    const { error: submoduleError } = await supabase
      .from('m365_tenant_submodules')
      .upsert({
        tenant_record_id,
        submodule: 'entra_id',
        is_enabled: true,
        sync_status: 'pending',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_record_id,submodule',
      });

    if (submoduleError) {
      console.error('Failed to enable submodule:', submoduleError);
    }

    // Store permission status with error reason
    for (const perm of permissionResults) {
      // Translate common Azure error codes to user-friendly messages
      let errorReason: string | null = null;
      if (!perm.granted && perm.error) {
        if (perm.error.includes('NonPremiumTenant') || perm.error.includes('RequestFromNonPremiumTenantOrB2CTenant')) {
          errorReason = 'Requer Azure AD Premium P1/P2';
        } else if (perm.error.includes('Authorization_RequestDenied')) {
          errorReason = 'Permissão negada pelo administrador';
        } else if (perm.error.includes('Request_UnsupportedQuery')) {
          errorReason = 'Recurso não suportado neste tenant';
        } else {
          errorReason = perm.error;
        }
      }

      await supabase
        .from('m365_tenant_permissions')
        .upsert({
          tenant_record_id,
          permission_name: perm.name,
          permission_type: 'Application',
          status: perm.granted ? 'granted' : 'pending',
          granted_at: perm.granted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
          error_reason: errorReason,
        }, {
          onConflict: 'tenant_record_id,permission_name',
        });
    }

    // Write audit log
    await supabase
      .from('m365_audit_logs')
      .insert({
        tenant_record_id,
        client_id,
        action: 'tenant_connected_oauth',
        action_details: {
          connection_method: 'multi_tenant_app',
          credentials_source: 'database_encrypted',
          permissions_granted: permissionResults.filter(p => p.granted).map(p => p.name),
          permissions_missing: missingPermissions,
          tenant_display_name: displayName,
          tenant_domain: primaryDomain,
        },
      });

    // Redirect to the dedicated callback page (not the main tenant connection page)
    // This page will display appropriate feedback and communicate with the parent window
    const callbackPage = redirect_url.replace('/tenant-connection', '/oauth-callback');
    const successUrl = allPermissionsGranted
      ? `${callbackPage}?success=true&tenant_id=${tenant_record_id}`
      : `${callbackPage}?success=partial&tenant_id=${tenant_record_id}&missing=${encodeURIComponent(missingPermissions.join(','))}`;

    console.log('Redirecting to:', successUrl);
    
    return new Response(null, {
      status: 302,
      headers: {
        'Location': successUrl,
      },
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/scope-m365/oauth-callback?error=callback_failed&error_description=${encodeURIComponent(errorMessage)}`,
      },
    });
  }
});
