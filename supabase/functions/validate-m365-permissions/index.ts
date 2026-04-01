import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

interface PermissionStatus {
  name: string;
  granted: boolean;
  type: 'required' | 'recommended';
}

// Permissions are loaded dynamically from m365_required_permissions table

// Exchange Administrator Role Template ID (constant across all Azure AD tenants)
const EXCHANGE_ADMIN_ROLE_TEMPLATE_ID = '29232cdf-9323-42fd-ade2-1d097af3e4de';

// Test if Exchange Administrator role is assigned to the app's Service Principal
async function testExchangeAdminRole(accessToken: string, appId: string): Promise<boolean> {
  try {
    // Get Service Principal by App ID
    const spResponse = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${appId}'&$select=id`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!spResponse.ok) {
      console.log('Exchange Admin Role test: could not fetch Service Principal');
      await spResponse.text(); // Consume body
      return false;
    }
    
    const spData = await spResponse.json();
    const spId = spData.value?.[0]?.id;
    
    if (!spId) {
      console.log('Exchange Admin Role test: Service Principal not found');
      return false;
    }
    
    console.log(`Exchange Admin Role test: Found SP ${spId}`);
    
    // Query role assignments filtering by the Exchange Admin role ID
    // Then check if our SP is in the results
    const roleResponse = await fetch(
      `https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments?$filter=roleDefinitionId eq '${EXCHANGE_ADMIN_ROLE_TEMPLATE_ID}'`,
      { 
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'ConsistencyLevel': 'eventual'
        } 
      }
    );
    
    if (roleResponse.ok) {
      const roleData = await roleResponse.json();
      const hasRole = roleData.value?.some(
        (assignment: { principalId: string }) => assignment.principalId === spId
      );
      console.log(`Exchange Admin Role test: Total Exchange Admin assignments: ${roleData.value?.length || 0}, hasSPAssigned: ${hasRole}`);
      return hasRole;
    }
    
    const errText = await roleResponse.text();
    console.log(`Exchange Admin Role test filter failed (${roleResponse.status}): ${errText.substring(0, 200)}`);
    
    // Fallback: fetch ALL role assignments without filter
    console.log('Exchange Admin Role test: Trying fallback without filter');
    const allRolesResponse = await fetch(
      `https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (allRolesResponse.ok) {
      const allRolesData = await allRolesResponse.json();
      const matchingAssignment = allRolesData.value?.find(
        (assignment: { principalId: string; roleDefinitionId: string }) => 
          assignment.principalId === spId && 
          assignment.roleDefinitionId === EXCHANGE_ADMIN_ROLE_TEMPLATE_ID
      );
      console.log(`Exchange Admin Role test (fallback): Total assignments: ${allRolesData.value?.length || 0}, found: ${!!matchingAssignment}`);
      return !!matchingAssignment;
    }
    
    return false;
  } catch (error) {
    console.error('Error testing Exchange Admin Role:', error);
    return false;
  }
}

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

async function decryptSecret(encrypted: string): Promise<string> {
  // AES-GCM format: iv:ciphertext (hex encoded)
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

async function testPermission(accessToken: string, permission: string, appObjectId?: string, testUrl?: string): Promise<boolean> {
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
      case 'IdentityRiskyUser.Read.All':
        url = 'https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?$top=1';
        break;
      case 'IdentityRiskEvent.Read.All':
        url = 'https://graph.microsoft.com/beta/identityProtection/riskDetections?$top=1';
        break;
      case 'Application.ReadWrite.All': {
        // Auto-discover the app's object ID in the CLIENT tenant via appId
        // (appObjectId param is from the HOME tenant and won't work here)
        const discoverUrl = `https://graph.microsoft.com/v1.0/applications(appId='${accessToken.split('.').length === 3 ? '' : ''}')`;
        // We need the appId from the token claims or pass it in — use a simpler approach:
        // Just list applications filtered by displayName is unreliable, use servicePrincipals instead
        // Actually, the best approach: GET /applications?$filter=appId eq '{appId}'
        // But we don't have appId here in testPermission. Let's test with a generic applications read.
        const rwTestUrl = 'https://graph.microsoft.com/v1.0/applications?$top=1&$select=id,keyCredentials';
        const certResponse = await fetch(rwTestUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (certResponse.ok) {
          await certResponse.text();
          console.log(`Permission ${permission} test succeeded`);
          return true;
        }
        const certErrorText = await certResponse.text();
        console.log(`Permission ${permission} test failed (${certResponse.status}): ${certErrorText.substring(0, 200)}`);
        return false;
      }
      case 'MailboxSettings.Read': {
        // Fetch up to 5 users to find one with an active mailbox
        const usersResp = await fetch(
          'https://graph.microsoft.com/v1.0/users?$top=5&$select=id',
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (!usersResp.ok) {
          await usersResp.text();
          console.log(`Permission ${permission} test failed: could not fetch users`);
          return false;
        }
        const usersData = await usersResp.json();
        const userIds: string[] = (usersData.value || []).map((u: any) => u.id);
        if (userIds.length === 0) {
          console.log(`Permission ${permission} test failed: no users found`);
          return false;
        }
        let allMailboxNotEnabled = true;
        for (const uid of userIds) {
          const mailboxResp = await fetch(`https://graph.microsoft.com/v1.0/users/${uid}/mailboxSettings`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (mailboxResp.ok) {
            console.log(`Permission ${permission} test succeeded on user ${uid}`);
            return true;
          }
          const errBody = await mailboxResp.json().catch(() => ({}));
          const errCode = errBody?.error?.code || '';
          if (mailboxResp.status === 403) {
            console.log(`Permission ${permission} test failed: 403 on user ${uid}`);
            return false;
          } else if (errCode === 'MailboxNotEnabledForRESTAPI') {
            console.log(`Permission ${permission}: MailboxNotEnabledForRESTAPI on user ${uid} - trying next`);
          } else {
            console.log(`Permission ${permission}: ${mailboxResp.status} (${errCode}) on user ${uid}`);
            allMailboxNotEnabled = false;
          }
        }
        if (allMailboxNotEnabled) {
          console.log(`Permission ${permission}: all users had MailboxNotEnabledForRESTAPI - treating as granted`);
          return true;
        }
        return false;
      }
      case 'Mail.Read': {
        // Fetch up to 5 users to find one with an active mailbox
        const mailUsersResp = await fetch(
          'https://graph.microsoft.com/v1.0/users?$top=5&$select=id',
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (!mailUsersResp.ok) {
          await mailUsersResp.text();
          console.log(`Permission ${permission} test failed: could not fetch users`);
          return false;
        }
        const mailUsersData = await mailUsersResp.json();
        const mailUserIds: string[] = (mailUsersData.value || []).map((u: any) => u.id);
        if (mailUserIds.length === 0) {
          console.log(`Permission ${permission} test failed: no users found`);
          return false;
        }
        let allMailNotEnabled = true;
        for (const uid of mailUserIds) {
          const rulesResp = await fetch(`https://graph.microsoft.com/v1.0/users/${uid}/mailFolders/inbox/messageRules?$top=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          if (rulesResp.ok) {
            console.log(`Permission ${permission} test succeeded on user ${uid}`);
            return true;
          }
          const errBody = await rulesResp.json().catch(() => ({}));
          const errCode = errBody?.error?.code || '';
          if (rulesResp.status === 403) {
            console.log(`Permission ${permission} test failed: 403 on user ${uid}`);
            return false;
          } else if (errCode === 'MailboxNotEnabledForRESTAPI') {
            console.log(`Permission ${permission}: MailboxNotEnabledForRESTAPI on user ${uid} - trying next`);
          } else {
            console.log(`Permission ${permission}: ${rulesResp.status} (${errCode}) on user ${uid}`);
            allMailNotEnabled = false;
          }
        }
        if (allMailNotEnabled) {
          console.log(`Permission ${permission}: all users had MailboxNotEnabledForRESTAPI - treating as granted`);
          return true;
        }
        return false;
      }
      case 'DeviceManagementManagedDevices.Read.All':
        url = 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=1&$select=id';
        break;
      case 'DeviceManagementConfiguration.Read.All':
        url = 'https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies?$top=1&$select=id';
        break;
      case 'SecurityAlert.Read.All':
        url = 'https://graph.microsoft.com/v1.0/security/alerts_v2?$top=1&$select=id';
        break;
      case 'SecurityEvents.Read.All':
        url = 'https://graph.microsoft.com/v1.0/security/secureScores?$top=1&$select=id';
        break;
      case 'AuditLog.Read.All':
        url = 'https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?$top=1&$select=id';
        break;
      case 'SecurityIncident.Read.All':
        url = 'https://graph.microsoft.com/v1.0/security/incidents?$top=1&$select=id';
        break;
      case 'AttackSimulation.Read.All':
        url = 'https://graph.microsoft.com/v1.0/security/attackSimulation/simulations?$top=1';
        break;
      case 'InformationProtectionPolicy.Read.All':
        url = 'https://graph.microsoft.com/beta/informationProtection/policy/labels';
        break;
      case 'TeamSettings.Read.All':
        // /teamwork/teamsAppSettings doesn't work with app-only tokens (412)
        // Use /teams?$top=1 which requires TeamSettings.Read.All or Group.Read.All
        url = 'https://graph.microsoft.com/v1.0/teams?$top=1&$select=id';
        break;
      case 'Channel.ReadBasic.All': {
        // Test by getting a team then checking its channels
        const teamsResp = await fetch(
          "https://graph.microsoft.com/v1.0/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$top=1&$select=id",
          { headers: { 'Authorization': `Bearer ${accessToken}`, 'ConsistencyLevel': 'eventual' } }
        );
        if (!teamsResp.ok) {
          const errBody = await teamsResp.json().catch(() => ({}));
          // If we can't list groups, treat Channel permission as unknown
          console.log(`Permission ${permission}: could not list teams (${teamsResp.status})`);
          return teamsResp.status !== 403;
        }
        const teamsData = await teamsResp.json();
        const teamId = teamsData.value?.[0]?.id;
        if (!teamId) {
          console.log(`Permission ${permission}: no teams found - treating as granted`);
          return true;
        }
        // Don't use $top on channels endpoint — it returns 400 "$top not allowed"
        const channelResp = await fetch(
          `https://graph.microsoft.com/v1.0/teams/${teamId}/channels?$select=id`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (channelResp.ok) {
          await channelResp.text();
          console.log(`Permission ${permission} test succeeded`);
          return true;
        }
        const channelErr = await channelResp.text();
        console.log(`Permission ${permission} test failed (${channelResp.status}): ${channelErr.substring(0, 200)}`);
        return false;
      }
      case 'TeamMember.Read.All': {
        const tmTeamsResp = await fetch(
          "https://graph.microsoft.com/v1.0/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$top=1&$select=id",
          { headers: { 'Authorization': `Bearer ${accessToken}`, 'ConsistencyLevel': 'eventual' } }
        );
        if (!tmTeamsResp.ok) {
          console.log(`Permission ${permission}: could not list teams (${tmTeamsResp.status})`);
          await tmTeamsResp.text();
          return tmTeamsResp.status !== 403;
        }
        const tmTeamsData = await tmTeamsResp.json();
        const tmTeamId = tmTeamsData.value?.[0]?.id;
        if (!tmTeamId) {
          console.log(`Permission ${permission}: no teams found - treating as granted`);
          return true;
        }
        const memberResp = await fetch(
          `https://graph.microsoft.com/v1.0/teams/${tmTeamId}/members?$top=1`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (memberResp.ok) {
          await memberResp.text();
          console.log(`Permission ${permission} test succeeded`);
          return true;
        }
        const memberErr = await memberResp.text();
        console.log(`Permission ${permission} test failed (${memberResp.status}): ${memberErr.substring(0, 200)}`);
        return false;
      }
      case 'SharePointTenantSettings.Read.All':
        url = 'https://graph.microsoft.com/beta/admin/sharepoint/settings';
        break;
      default:
        if (testUrl) {
          url = testUrl;
          break;
        }
        console.log(`Permission ${permission}: no test URL configured`);
        return false;
    }

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    // Always consume response body to prevent resource leaks
    if (!response.ok) {
      const errorText = await response.text();
      const errorLower = errorText.toLowerCase();
      
      // Parse error code from JSON body if possible
      let errCode = '';
      try {
        const parsed = JSON.parse(errorText);
        errCode = (parsed?.error?.code || '').toLowerCase();
      } catch { /* not JSON */ }
      
      const isSecurityEndpoint = url.includes('/security/');
      const isAdminSharepoint = url.includes('/admin/sharepoint');
      const isBetaEndpoint = url.includes('/beta/');
      
      // Treat license/service-not-available errors as "granted" — the permission
      // consent is correct, but the service (Intune, MIP, etc.) is not licensed
      if (response.status === 400 && (
        errorLower.includes('not applicable to target tenant') ||
        errorLower.includes('service principal for resource') ||
        (errorLower.includes('service principal') && errorLower.includes('disabled'))
      )) {
        console.log(`Permission ${permission}: service not available in tenant (400) — treating as granted`);
        return true;
      }
      
      // 412 Precondition Failed or 400 not supported — endpoint doesn't support app-only context
      if (response.status === 412 || (response.status === 400 && errorLower.includes('not supported'))) {
        console.log(`Permission ${permission}: endpoint not supported in app-only context (${response.status}) — treating as granted`);
        return true;
      }
      
      // 403 — unified tolerance logic
      if (response.status === 403) {
        const isMissingRoles = errorLower.includes('missing application roles') || errorLower.includes('missing role');
        
        if (!isMissingRoles) {
          const isKnownLicenseError = (
            errCode.includes('nonpremiumtenant') ||
            errorLower.includes('license') ||
            errorLower.includes('premium') ||
            errCode === 'forbidden' ||
            errCode === 'unknownerror'
          );
          const isSecurityLicenseIssue = isSecurityEndpoint && !errorLower.includes('insufficient privileges');
          const isAdminLicenseIssue = (isAdminSharepoint || isBetaEndpoint) && !errorLower.includes('insufficient privileges');
          
          if (isKnownLicenseError || isSecurityLicenseIssue || isAdminLicenseIssue) {
            console.log(`Permission ${permission}: 403 license/service issue — treating as granted`);
            return true;
          }
        } else {
          console.log(`Permission ${permission}: 403 missing application roles — NOT treating as granted`);
        }
      }
      
      // 404 on beta endpoints — feature not available in tenant
      if (response.status === 404 && isBetaEndpoint) {
        console.log(`Permission ${permission}: 404 on beta endpoint — treating as granted`);
        return true;
      }
      
      console.log(`Permission ${permission} test failed (${response.status}): ${errorText.substring(0, 200)}`);
      return false;
    } else {
      await response.text(); // Consume body
      console.log(`Permission ${permission} test succeeded`);
    }

    return true;
  } catch (error) {
    console.error(`Error testing permission ${permission}:`, error);
    return false;
  }
}

async function validatePermissions(
  tenantId: string,
  appId: string,
  clientSecret: string,
  appObjectId?: string,
  supabaseClient?: SupabaseClient
): Promise<PermissionStatus[]> {
  console.log('Getting access token for tenant:', tenantId);
  
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
    body: tokenBody,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Failed to get access token:', errorText);
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  
  console.log('Access token obtained, testing permissions...');

  // Fetch permissions from database
  const { data: dbPermissions } = await supabaseClient!
    .from('m365_required_permissions')
    .select('permission_name, test_url, is_required')
    .order('permission_name');

  const results: PermissionStatus[] = [];

  for (const dbPerm of (dbPermissions || [])) {
    const granted = await testPermission(accessToken, dbPerm.permission_name, appObjectId, dbPerm.test_url || undefined);
    results.push({ 
      name: dbPerm.permission_name, 
      granted, 
      type: dbPerm.is_required ? 'required' : 'recommended' 
    });
    console.log(`Permission ${dbPerm.permission_name}: ${granted ? 'granted' : 'denied'}`);
  }

  // Only test certificate permissions if app_object_id is provided and not already in results
  if (appObjectId && !results.find(r => r.name === 'Application.ReadWrite.All')) {
    console.log('Testing certificate upload permissions with app_object_id:', appObjectId);
    const granted = await testPermission(accessToken, 'Application.ReadWrite.All', appObjectId);
    results.push({ name: 'Application.ReadWrite.All', granted, type: 'recommended' });
    console.log(`Permission Application.ReadWrite.All: ${granted ? 'granted' : 'denied'}`);
  }

  // Test Exchange Administrator Role assignment (required for PowerShell CBA)
  console.log('Testing Exchange Administrator role assignment...');
  const exchangeAdminRoleGranted = await testExchangeAdminRole(accessToken, appId);
  results.push({ 
    name: 'Exchange Administrator Role', 
    granted: exchangeAdminRoleGranted, 
    type: 'recommended' 
  });
  console.log(`Exchange Administrator Role: ${exchangeAdminRoleGranted ? 'assigned' : 'not assigned'}`);

  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createOrUpdateAlert(
  supabase: SupabaseClient,
  options: {
    alertType: string;
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    metadata?: Record<string, unknown>;
    // Se definido, controla quem pode ver o alerta via RLS (system_alerts.target_role).
    // null => visível para qualquer role (o frontend ainda pode filtrar quem renderiza o banner).
    targetRole?: string | null;
  }
) {
  // Verificar se já existe um alerta ativo do mesmo tipo E com o mesmo target_role.
  // (Necessário para permitir 2 alertas M365 do mesmo tipo: um p/ super_admin e outro p/ super_suporte)
  let existingQuery = supabase
    .from('system_alerts')
    .select('id')
    .eq('alert_type', options.alertType)
    .eq('is_active', true);

  if (options.targetRole === null || options.targetRole === undefined) {
    existingQuery = existingQuery.is('target_role', null);
  } else {
    existingQuery = existingQuery.eq('target_role', options.targetRole);
  }

  const { data: existingAlert } = await existingQuery.maybeSingle();

  if (existingAlert) {
    // Atualizar alerta existente
    await supabase
      .from('system_alerts')
      .update({
        title: options.title,
        message: options.message,
        severity: options.severity,
        metadata: options.metadata || {},
        target_role: options.targetRole ?? null,
        dismissed_by: [], // Reset dismissed users on update
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingAlert.id);
  } else {
    // Criar novo alerta
    await supabase
      .from('system_alerts')
      .insert({
        alert_type: options.alertType,
        title: options.title,
        message: options.message,
        severity: options.severity,
        target_role: options.targetRole ?? null,
        metadata: options.metadata || {},
      });
  }
}

async function deactivateAlerts(
  supabase: SupabaseClient,
  alertTypes: string[]
) {
  await supabase
    .from('system_alerts')
    .update({ is_active: false })
    .in('alert_type', alertTypes)
    .eq('is_active', true);
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting M365 permissions validation...');

    // Buscar configuração M365 do banco
    const { data: configData, error: configError } = await supabase
      .from('m365_global_config')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (configError) {
      console.error('Error fetching M365 config:', configError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch M365 config' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!configData) {
      console.log('No M365 configuration found, skipping validation');
      return new Response(
        JSON.stringify({ success: true, message: 'No M365 configuration found', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if tenant_id and app_object_id were passed via body (manual call) or use saved one (cron)
    let tenantId = configData.validation_tenant_id;
    let appObjectId = configData.app_object_id;
    
    try {
      const body = await req.json();
      if (body.tenant_id) {
        tenantId = body.tenant_id;
        console.log('Tenant ID received from request body:', tenantId);
        
        // Update the tenant_id in database for future automatic validations
        const { error: updateTenantError } = await supabase
          .from('m365_global_config')
          .update({ validation_tenant_id: tenantId })
          .eq('id', configData.id);
          
        if (updateTenantError) {
          console.error('Error updating validation_tenant_id:', updateTenantError);
        } else {
          console.log('Saved tenant_id for future automatic validations');
        }
      }
      // Also accept app_object_id from body for manual validation
      if (body.app_object_id) {
        appObjectId = body.app_object_id;
        console.log('App Object ID received from request body:', appObjectId);
      }
    } catch {
      // Empty body is OK for automatic cron calls
      console.log('No body provided, using saved tenant_id and app_object_id');
    }

    if (!tenantId) {
      console.log('No validation tenant ID configured, skipping validation');
      return new Response(
        JSON.stringify({ success: true, message: 'No validation tenant ID configured', skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appId = configData.app_id;
    const clientSecret = await decryptSecret(configData.client_secret_encrypted);
    const previousPermissions = configData.validated_permissions || [];

    console.log('Validating permissions for app:', appId, appObjectId ? `with app_object_id: ${appObjectId}` : '(no app_object_id)');

    // Validar permissões
    let newPermissions: PermissionStatus[];
    try {
      newPermissions = await validatePermissions(tenantId, appId, clientSecret, appObjectId, supabase);
    } catch (error) {
      console.error('Failed to validate permissions:', error);
      
      // Alerta M365: deve ser visível apenas para super_admin e super_suporte
      await Promise.all([
        createOrUpdateAlert(supabase, {
          alertType: 'm365_connection_failure',
          title: 'Falha na Conexão M365',
          message: 'Não foi possível conectar à API Microsoft Graph para validar permissões.',
          severity: 'error',
          targetRole: 'super_admin',
          metadata: { error: String(error), tenantId },
        }),
        createOrUpdateAlert(supabase, {
          alertType: 'm365_connection_failure',
          title: 'Falha na Conexão M365',
          message: 'Não foi possível conectar à API Microsoft Graph para validar permissões.',
          severity: 'error',
          targetRole: 'super_suporte',
          metadata: { error: String(error), tenantId },
        }),
      ]);

      // Return error but indicate the tenant_id was saved
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to validate permissions. Check if the Tenant ID is correct and the app has admin consent.',
          tenantIdSaved: true,
          validationTenantId: tenantId,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atualizar configuração com novas permissões
    const { error: updateError } = await supabase
      .from('m365_global_config')
      .update({
        validated_permissions: newPermissions,
        last_validated_at: new Date().toISOString(),
      })
      .eq('id', configData.id);

    if (updateError) {
      console.error('Error updating M365 config:', updateError);
    }

    // Verificar se alguma permissão falhou
    const failedRequired = newPermissions.filter(p => p.type === 'required' && !p.granted);
    const failedRecommended = newPermissions.filter(p => p.type === 'recommended' && !p.granted);

    // Verificar mudanças em relação ao estado anterior
    const previouslyGranted = (previousPermissions as PermissionStatus[]).filter(p => p.granted).map(p => p.name);
    const nowFailed = newPermissions.filter(p => !p.granted && previouslyGranted.includes(p.name));

    if (failedRequired.length > 0) {
      // Permissões obrigatórias falhando - alerta de erro
      await Promise.all([
        createOrUpdateAlert(supabase, {
          alertType: 'm365_permission_failure',
          title: 'Permissões M365 Críticas Faltando',
          message: `${failedRequired.length} permissão(ões) obrigatória(s) não está(ão) configurada(s): ${failedRequired.map(p => p.name).join(', ')}`,
          severity: 'error',
          targetRole: 'super_admin',
          metadata: {
            failedRequired: failedRequired.map(p => p.name),
            failedRecommended: failedRecommended.map(p => p.name),
            newlyFailed: nowFailed.map(p => p.name),
          },
        }),
        createOrUpdateAlert(supabase, {
          alertType: 'm365_permission_failure',
          title: 'Permissões M365 Críticas Faltando',
          message: `${failedRequired.length} permissão(ões) obrigatória(s) não está(ão) configurada(s): ${failedRequired.map(p => p.name).join(', ')}`,
          severity: 'error',
          targetRole: 'super_suporte',
          metadata: {
            failedRequired: failedRequired.map(p => p.name),
            failedRecommended: failedRecommended.map(p => p.name),
            newlyFailed: nowFailed.map(p => p.name),
          },
        }),
      ]);

      console.log('Created/updated error alert for missing required permissions');
    } else if (failedRecommended.length > 0 && nowFailed.length > 0) {
      // Apenas recomendadas falhando E houve mudança - alerta de warning
      await Promise.all([
        createOrUpdateAlert(supabase, {
          alertType: 'm365_permission_failure',
          title: 'Permissões M365 Recomendadas Faltando',
          message: `${failedRecommended.length} permissão(ões) recomendada(s) não está(ão) configurada(s): ${failedRecommended.map(p => p.name).join(', ')}`,
          severity: 'warning',
          targetRole: 'super_admin',
          metadata: {
            failedRecommended: failedRecommended.map(p => p.name),
            newlyFailed: nowFailed.map(p => p.name),
          },
        }),
        createOrUpdateAlert(supabase, {
          alertType: 'm365_permission_failure',
          title: 'Permissões M365 Recomendadas Faltando',
          message: `${failedRecommended.length} permissão(ões) recomendada(s) não está(ão) configurada(s): ${failedRecommended.map(p => p.name).join(', ')}`,
          severity: 'warning',
          targetRole: 'super_suporte',
          metadata: {
            failedRecommended: failedRecommended.map(p => p.name),
            newlyFailed: nowFailed.map(p => p.name),
          },
        }),
      ]);

      console.log('Created/updated warning alert for missing recommended permissions');
    } else if (failedRequired.length === 0 && nowFailed.length === 0) {
      // Tudo OK - desativar alertas existentes
      await deactivateAlerts(supabase, ['m365_permission_failure', 'm365_connection_failure']);
      console.log('All permissions granted, deactivated any existing alerts');
    }

    return new Response(
      JSON.stringify({
        success: true,
        permissions: newPermissions,
        failedRequired: failedRequired.length,
        failedRecommended: failedRecommended.length,
        validatedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
