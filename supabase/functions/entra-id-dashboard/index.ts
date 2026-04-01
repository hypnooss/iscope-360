import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { getCorsHeaders } from '../_shared/cors.ts';

// Encryption utilities
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex) throw new Error('M365_ENCRYPTION_KEY não está configurada');
  const keyBytes = fromHex(keyHex);
  return await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
}

function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

async function decryptSecret(encrypted: string): Promise<string> {
  if (!encrypted.includes(':')) {
    try { return atob(encrypted); } catch { return encrypted; }
  }
  const [ivHex, ciphertextHex] = encrypted.split(':');
  const iv = fromHex(ivHex);
  const ciphertext = fromHex(ciphertextHex);
  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, ciphertext.buffer as ArrayBuffer);
  return new TextDecoder().decode(decrypted);
}

async function getAccessToken(tenantId: string, appId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`Token error: ${response.status}`);
  const data = await response.json();
  return data.access_token;
}

async function graphGet(accessToken: string, url: string, headers?: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, ...headers },
  });
  if (!res.ok) {
    console.warn(`Graph GET ${url} failed: ${res.status}`);
    return null;
  }
  return await res.json();
}

async function graphGetAllPages(accessToken: string, url: string, maxPages = 5, headers?: Record<string, string>): Promise<any[]> {
  const allValues: any[] = [];
  let nextLink: string | null = url;
  let page = 0;
  while (nextLink && page < maxPages) {
    const data = await graphGet(accessToken, nextLink, headers);
    if (!data) break;
    allValues.push(...(data.value || []));
    nextLink = data['@odata.nextLink'] || null;
    page++;
  }
  return allValues;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    let userId: string | null = null;
    if (!isServiceRole) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ success: false, error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = user.id;
    }

    const { tenant_record_id } = await req.json();
    if (!tenant_record_id) {
      return new Response(JSON.stringify({ success: false, error: 'tenant_record_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tenant } = await supabase.from('m365_tenants').select('id, tenant_id, tenant_domain, client_id, entra_dashboard_cached_at').eq('id', tenant_record_id).single();
    if (!tenant) {
      return new Response(JSON.stringify({ success: false, error: 'Tenant not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!isServiceRole && userId) {
      const { data: hasAccess } = await supabase.rpc('has_client_access', { _user_id: userId, _client_id: tenant.client_id });
      if (!hasAccess) {
        return new Response(JSON.stringify({ success: false, error: 'Access denied' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { data: globalConfig } = await supabase.from('m365_global_config').select('app_id, client_secret_encrypted').order('created_at', { ascending: false }).limit(1).single();
    if (!globalConfig) {
      return new Response(JSON.stringify({ success: false, error: 'M365 config not found' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const clientSecret = await decryptSecret(globalConfig.client_secret_encrypted);
    const accessToken = await getAccessToken(tenant.tenant_id, globalConfig.app_id, clientSecret);

    const now = new Date();
    const periodStart = (tenant as any).entra_dashboard_cached_at
      ? new Date((tenant as any).entra_dashboard_cached_at).toISOString()
      : new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    console.log(`[entra-id-dashboard] Contiguous window: ${periodStart} → ${now.toISOString()}`);

    // Fetch all data in parallel (including new detail queries)
    const [
      usersCountData,
      guestCountData,
      disabledCountData,
      syncedCountData,
      directoryRoles,
      mfaRegistration,
      signInLogs,
      auditLogs,
      auditLogs7d,
      riskyUsersData,
      disabledUsersList,
      guestUsersList,
    ] = await Promise.all([
      graphGet(accessToken, 'https://graph.microsoft.com/v1.0/users/$count', { 'ConsistencyLevel': 'eventual', 'Accept': 'text/plain' }).catch(() => null),
      graphGet(accessToken, "https://graph.microsoft.com/v1.0/users/$count?$filter=userType eq 'Guest'", { 'ConsistencyLevel': 'eventual', 'Accept': 'text/plain' }).catch(() => null),
      graphGet(accessToken, "https://graph.microsoft.com/v1.0/users/$count?$filter=accountEnabled eq false", { 'ConsistencyLevel': 'eventual', 'Accept': 'text/plain' }).catch(() => null),
      graphGet(accessToken, "https://graph.microsoft.com/v1.0/users/$count?$filter=onPremisesSyncEnabled eq true", { 'ConsistencyLevel': 'eventual', 'Accept': 'text/plain' }).catch(() => null),
      graphGet(accessToken, 'https://graph.microsoft.com/v1.0/directoryRoles?$expand=members').catch(() => ({ value: [] })),
      graphGetAllPages(accessToken, "https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?$top=999", 10, { 'ConsistencyLevel': 'eventual' }).catch(() => []),
      graphGetAllPages(accessToken, `https://graph.microsoft.com/v1.0/auditLogs/signIns?$filter=createdDateTime ge ${periodStart}&$top=500&$orderby=createdDateTime desc`, 2).catch(() => []),
      graphGetAllPages(accessToken, `https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?$filter=activityDateTime ge ${periodStart}&$top=500&$orderby=activityDateTime desc`, 2).catch(() => []),
      graphGetAllPages(accessToken, `https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?$filter=activityDateTime ge ${periodStart}&$top=500&$orderby=activityDateTime desc`, 2).catch(() => []),
      graphGet(accessToken, 'https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?$top=100').catch(() => null),
      // New: disabled users list
      graphGetAllPages(accessToken, "https://graph.microsoft.com/v1.0/users?$filter=accountEnabled eq false&$select=displayName,userPrincipalName,createdDateTime&$top=999&$count=true", 3).catch(() => []),
      // New: guest users list
      graphGetAllPages(accessToken, "https://graph.microsoft.com/v1.0/users?$filter=userType eq 'Guest'&$select=displayName,userPrincipalName,mail,createdDateTime&$top=999&$count=true", 3).catch(() => []),
    ]);

    const parseCount = (val: any): number => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') return parseInt(val, 10) || 0;
      return 0;
    };

    const totalUsers = parseCount(usersCountData);
    const guestUsers = parseCount(guestCountData);
    const disabledUsers = parseCount(disabledCountData);
    const syncedUsers = parseCount(syncedCountData);
    const signInEnabled = totalUsers - disabledUsers;

    // Admins calculation + detail mapping
    const roles = directoryRoles?.value || [];
    const adminRoleNames = ['Global Administrator', 'Privileged Role Administrator', 'Security Administrator',
      'Exchange Administrator', 'SharePoint Administrator', 'User Administrator', 'Application Administrator'];
    const adminUserMap = new Map<string, { displayName: string; upn: string; roles: string[] }>();
    let globalAdminCount = 0;

    roles.forEach((role: any) => {
      const members = (role.members || []).filter((m: any) => m['@odata.type'] === '#microsoft.graph.user');
      if (adminRoleNames.some(ar => role.displayName?.includes(ar))) {
        members.forEach((m: any) => {
          const existing = adminUserMap.get(m.id);
          if (existing) {
            existing.roles.push(role.displayName);
          } else {
            adminUserMap.set(m.id, {
              displayName: m.displayName || '',
              upn: m.userPrincipalName || '',
              roles: [role.displayName],
            });
          }
        });
      }
      if (role.displayName === 'Global Administrator') {
        globalAdminCount = members.length;
      }
    });

    const adminDetails = Array.from(adminUserMap.values());

    // Fetch shared mailbox UPNs from Exchange analyzer snapshot (needed before MFA calc)
    let sharedMailboxUpns = new Set<string>();
    let sharedMailboxNames = new Set<string>();
    try {
      const { data: exoSnapshot } = await supabase
        .from('m365_analyzer_snapshots')
        .select('metrics')
        .eq('tenant_record_id', tenant_record_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (exoSnapshot?.metrics) {
        const metrics = exoSnapshot.metrics as any;
        const sharedMailboxes = metrics?.exoSharedMailboxes || metrics?.shared_mailboxes || [];
        sharedMailboxes.forEach((m: any) => {
          const upn = m.UserPrincipalName || m.userPrincipalName || m.upn || '';
          if (upn) sharedMailboxUpns.add(upn.toLowerCase());
          const name = m.DisplayName || m.displayName || '';
          if (name) sharedMailboxNames.add(name.toLowerCase().trim());
        });
        console.log(`[entra-id-dashboard] Found ${sharedMailboxUpns.size} shared mailbox UPNs and ${sharedMailboxNames.size} DisplayNames from Exchange snapshot`);
      }
    } catch (e) {
      console.warn('[entra-id-dashboard] Could not fetch shared mailbox data:', e);
    }

    // MFA calculation — filter out guests and shared mailboxes (aligned with m365-analyzer)
    const mfaAllRaw = mfaRegistration || [];
    const mfaGuests = mfaAllRaw.filter((u: any) => (u.userType || '').toLowerCase() === 'guest');
    const mfaMembers = mfaAllRaw.filter((u: any) => (u.userType || '').toLowerCase() !== 'guest');
    const mfaUsers = mfaMembers.filter((u: any) => {
      const upn = (u.userPrincipalName || '').toLowerCase();
      const name = (u.userDisplayName || '').toLowerCase().trim();
      return !sharedMailboxUpns.has(upn) && !sharedMailboxNames.has(name);
    });
    const sharedExcluded = mfaMembers.length - mfaUsers.length;
    console.log(`[entra-id-dashboard] MFA breakdown: ${mfaAllRaw.length} raw total, ${mfaGuests.length} guests excluded, ${mfaMembers.length} members, ${sharedExcluded} shared mailboxes excluded → ${mfaUsers.length} final`);

    // mfaEnabled = any registered method (aligns with hasMfa in userDetails)
    const STRONG_METHODS = ['microsoftAuthenticatorPush', 'softwareOneTimePasscode', 'hardwareOneTimePasscode', 'windowsHelloForBusiness', 'passKeyDeviceBound', 'microsoftAuthenticatorPasswordless', 'fido2'];
    const mfaEnabled = mfaUsers.filter((u: any) => (u.methodsRegistered || []).length > 0).length;
    const mfaDisabled = mfaUsers.length - mfaEnabled;
    const mfaStrong = mfaUsers.filter((u: any) => (u.methodsRegistered || []).some((m: string) => STRONG_METHODS.includes(m))).length;
    const mfaWeak = mfaEnabled - mfaStrong;

    const mfaMethodCounts: Record<string, number> = {};
    mfaUsers.forEach((u: any) => {
      (u.methodsRegistered || []).forEach((m: string) => {
        mfaMethodCounts[m] = (mfaMethodCounts[m] || 0) + 1;
      });
    });

    // Risks + detail mapping
    const riskyUsers = riskyUsersData?.value || [];
    const riskyAtRisk = riskyUsers.filter((u: any) => u.riskState === 'atRisk').length;
    const riskyConfirmedCompromised = riskyUsers.filter((u: any) => u.riskState === 'confirmedCompromised').length;

    const riskDetails = riskyUsers.map((u: any) => ({
      displayName: u.userDisplayName || '',
      upn: u.userPrincipalName || '',
      riskLevel: u.riskLevel || 'unknown',
      riskState: u.riskState || 'unknown',
      lastUpdated: u.riskLastUpdatedDateTime || '',
    }));

    // Sign-in activity aggregation + detail mapping
    const successLogins = signInLogs.filter((l: any) => !l.status?.errorCode || l.status.errorCode === 0).length;
    const failedLogins = signInLogs.filter((l: any) => l.status?.errorCode && l.status.errorCode !== 0).length;
    const mfaRequiredLogins = signInLogs.filter((l: any) =>
      l.conditionalAccessStatus === 'success' && l.authenticationRequirement === 'multiFactorAuthentication'
    ).length;
    const blockedLogins = signInLogs.filter((l: any) =>
      l.conditionalAccessStatus === 'failure' || l.status?.errorCode === 53003
    ).length;

    const loginDetails = signInLogs.map((l: any) => {
      const errorCode = l.status?.errorCode || 0;
      const isBlocked = l.conditionalAccessStatus === 'failure' || errorCode === 53003;
      const isSuccess = !errorCode || errorCode === 0;
      return {
        displayName: l.userDisplayName || '',
        upn: l.userPrincipalName || '',
        status: isBlocked ? 'blocked' : isSuccess ? 'success' : 'failed',
        errorCode,
        location: l.location?.countryOrRegion || '',
        city: l.location?.city || '',
        app: l.appDisplayName || '',
        createdDateTime: l.createdDateTime || '',
      };
    });

    // Countries aggregation
    const successByCountry: Record<string, number> = {};
    const failedByCountry: Record<string, number> = {};
    signInLogs.forEach((l: any) => {
      const country = l.location?.countryOrRegion;
      if (!country) return;
      if (!l.status?.errorCode || l.status.errorCode === 0) {
        successByCountry[country] = (successByCountry[country] || 0) + 1;
      } else {
        failedByCountry[country] = (failedByCountry[country] || 0) + 1;
      }
    });
    const loginCountriesSuccess = Object.entries(successByCountry).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    const loginCountriesFailed = Object.entries(failedByCountry).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 20);

    // Audit activity aggregation
    const userChangeActivities: Record<string, string[]> = {
      'Update user': [], 'Add user': [], 'Enable account': [], 'Disable account': [], 'Delete user': [],
    };
    auditLogs.forEach((log: any) => {
      const activity = log.activityDisplayName;
      if (activity in userChangeActivities) {
        userChangeActivities[activity].push(log.id);
      }
    });

    // Password activity + detail mapping
    const passwordActivities = { resets: 0, forcedChanges: 0, selfService: 0 };
    const passwordDetails: any[] = [];

    auditLogs7d.forEach((log: any) => {
      const activity = log.activityDisplayName;
      let type: string | null = null;
      if (activity === 'Reset password (by admin)' || activity === 'Reset user password') {
        passwordActivities.resets++;
        type = 'reset';
      } else if (activity === 'Change password (self-service)' || activity === 'Change user password') {
        passwordActivities.selfService++;
        type = 'selfService';
      } else if (activity === 'Force change password') {
        passwordActivities.forcedChanges++;
        type = 'forced';
      }
      if (type) {
        const targets = log.targetResources || [];
        const initiator = log.initiatedBy?.user?.displayName || log.initiatedBy?.app?.displayName || '';
        passwordDetails.push({
          activity: activity,
          type,
          targetUser: targets[0]?.userPrincipalName || targets[0]?.displayName || '',
          initiatedBy: initiator,
          activityDateTime: log.activityDateTime || '',
        });
      }
    });

    // Disabled users details
    const disabledDetails = (disabledUsersList || []).map((u: any) => ({
      displayName: u.displayName || '',
      upn: u.userPrincipalName || '',
      createdDateTime: u.createdDateTime || '',
    }));

    // Guest users details
    const guestDetails = (guestUsersList || []).map((u: any) => ({
      displayName: u.displayName || '',
      upn: u.userPrincipalName || '',
      mail: u.mail || '',
      createdDateTime: u.createdDateTime || '',
    }));

    const result = {
      success: true,
      users: {
        total: totalUsers,
        signInEnabled,
        disabled: disabledUsers,
        guests: guestUsers,
        onPremSynced: syncedUsers,
        disabledDetails,
        guestDetails,
      },
      admins: {
        total: adminUserMap.size,
        globalAdmins: globalAdminCount,
        details: adminDetails,
      },
      mfa: {
        total: mfaUsers.length,
        enabled: mfaEnabled,
        disabled: mfaDisabled,
        strong: mfaStrong,
        weak: mfaWeak,
        methodBreakdown: mfaMethodCounts,
      userDetails: mfaUsers.map((u: any) => {
          const methods = u.methodsRegistered || [];
          const hasMfa = methods.length > 0;
          return {
            displayName: u.userDisplayName || '',
            upn: u.userPrincipalName || '',
            methods,
            hasMfa,
            defaultMethod: u.systemPreferredAuthenticationMethods?.[0] || null,
          };
        }),
      },
      risks: {
        riskyUsers: riskyUsers.length,
        atRisk: riskyAtRisk,
        compromised: riskyConfirmedCompromised,
        details: riskDetails,
      },
      loginActivity: {
        total: signInLogs.length,
        success: successLogins,
        failed: failedLogins,
        mfaRequired: mfaRequiredLogins,
        blocked: blockedLogins,
        details: loginDetails,
      },
      userChanges: {
        updated: userChangeActivities['Update user'].length,
        new: userChangeActivities['Add user'].length,
        enabled: userChangeActivities['Enable account'].length,
        disabled: userChangeActivities['Disable account'].length,
        deleted: userChangeActivities['Delete user'].length,
      },
      passwordActivity: {
        resets: passwordActivities.resets,
        forcedChanges: passwordActivities.forcedChanges,
        selfService: passwordActivities.selfService,
        details: passwordDetails,
      },
      loginCountriesSuccess,
      loginCountriesFailed,
      analyzedAt: now.toISOString(),
      periodStart,
      periodEnd: now.toISOString(),
    };

    // Save snapshot
    const { error: snapError } = await supabase.from('m365_dashboard_snapshots').insert({
      tenant_record_id,
      client_id: tenant.client_id,
      dashboard_type: 'entra_id',
      data: result,
      period_start: periodStart,
      period_end: now.toISOString(),
    });
    if (snapError) console.error('Failed to save entra dashboard snapshot:', snapError);

    // Save legacy cache
    const { error: updateError } = await supabase.from('m365_tenants').update({
      entra_dashboard_cache: result,
      entra_dashboard_cached_at: now.toISOString(),
    }).eq('id', tenant_record_id);
    if (updateError) console.error('Failed to save entra dashboard cache:', updateError);

    console.log('Entra ID Dashboard data aggregated and cached successfully');

    return new Response(JSON.stringify({ ...result, success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('entra-id-dashboard error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
