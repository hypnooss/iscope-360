import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { getCorsHeaders } from '../_shared/cors.ts';

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

async function graphGetText(accessToken: string, url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn(`Graph GET text ${url} failed: ${res.status}`);
    return null;
  }
  return await res.text();
}

async function graphGetAllPages(accessToken: string, url: string, maxPages = 5): Promise<any[]> {
  const allValues: any[] = [];
  let nextLink: string | null = url;
  let page = 0;
  while (nextLink && page < maxPages) {
    const data = await graphGet(accessToken, nextLink);
    if (!data) break;
    allValues.push(...(data.value || []));
    nextLink = data['@odata.nextLink'] || null;
    page++;
  }
  return allValues;
}

function parseCsvReport(csvText: string): any[] {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim().replace(/"/g, ''));
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row: any = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return rows;
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

    const { data: tenant } = await supabase.from('m365_tenants').select('id, tenant_id, tenant_domain, client_id').eq('id', tenant_record_id).single();
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

    // === TEAMS ===
    // Get all teams (groups with Team resource)
    const allTeamGroups = await graphGetAllPages(
      accessToken,
      "https://graph.microsoft.com/v1.0/groups?$filter=resourceProvisioningOptions/any(x:x eq 'Team')&$select=id,displayName,visibility&$top=999",
      5
    ).catch(() => []);

    const totalTeams = allTeamGroups.length;
    const publicTeams = allTeamGroups.filter((g: any) => g.visibility === 'Public').length;
    const privateTeams = allTeamGroups.filter((g: any) => g.visibility === 'Private').length;

    // Check for guest members (sample first 50 teams for performance)
    let teamsWithGuests = 0;
    const teamsToCheck = allTeamGroups.slice(0, 50);
    const teamGuestMap = new Map<string, boolean>();
    const teamMemberCountMap = new Map<string, number>();
    
    const guestChecks = await Promise.allSettled(
      teamsToCheck.map(async (team: any) => {
        const members = await graphGet(accessToken, `https://graph.microsoft.com/v1.0/groups/${team.id}/members?$select=id,userType&$top=100`);
        const memberList = members?.value || [];
        teamMemberCountMap.set(team.id, memberList.length);
        const hasGuest = memberList.some((m: any) => m.userType === 'Guest');
        teamGuestMap.set(team.id, hasGuest);
        return hasGuest;
      })
    );
    
    teamsWithGuests = guestChecks.filter(r => r.status === 'fulfilled' && r.value === true).length;
    // Extrapolate if we sampled
    if (allTeamGroups.length > 50 && teamsToCheck.length > 0) {
      teamsWithGuests = Math.round((teamsWithGuests / teamsToCheck.length) * allTeamGroups.length);
    }

    // Build teamDetails array
    const teamDetails = allTeamGroups.map((g: any) => ({
      displayName: g.displayName || '',
      visibility: g.visibility === 'Public' ? 'Public' : 'Private',
      hasGuests: teamGuestMap.get(g.id) ?? false,
      memberCount: teamMemberCountMap.get(g.id) ?? null,
    }));

    // Channels (sample first 30 teams)
    let privateChannels = 0;
    let sharedChannels = 0;
    const channelTeams = allTeamGroups.slice(0, 30);
    
    const channelChecks = await Promise.allSettled(
      channelTeams.map(async (team: any) => {
        const channels = await graphGet(accessToken, `https://graph.microsoft.com/v1.0/teams/${team.id}/channels?$select=id,membershipType`);
        const chans = channels?.value || [];
        return {
          private: chans.filter((c: any) => c.membershipType === 'private').length,
          shared: chans.filter((c: any) => c.membershipType === 'shared').length,
        };
      })
    );
    
    channelChecks.forEach(r => {
      if (r.status === 'fulfilled') {
        privateChannels += r.value.private;
        sharedChannels += r.value.shared;
      }
    });

    // === SHAREPOINT ===
    // Get sites via search
    const allSites = await graphGetAllPages(
      accessToken,
      'https://graph.microsoft.com/v1.0/sites?$select=id,displayName,webUrl,isPersonalSite&$top=999',
      5
    ).catch(() => []);

    const totalSites = allSites.length;

    // SharePoint site usage report
    let activeSites = 0;
    let inactiveSites = 0;
    let storageUsedBytes = 0;
    const siteDetails: Array<{ displayName: string; webUrl: string; lastActivity: string | null; storageUsedGB: number; externalSharing: boolean }> = [];

    // SharePoint usage report — state data, D7 to avoid duplication across cache refreshes
    const siteUsageText = await graphGetText(
      accessToken,
      "https://graph.microsoft.com/v1.0/reports/getSharePointSiteUsageDetail(period='D7')"
    ).catch(() => null);

    if (siteUsageText) {
      const rows = parseCsvReport(siteUsageText);
      console.log(`SharePoint report parsed: ${rows.length} rows`);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      rows.forEach((row: any) => {
        const used = parseInt(row['Storage Used (Byte)'] || '0', 10);
        if (!isNaN(used)) storageUsedBytes += used;
        const lastActivityDate = row['Last Activity Date'] || null;
        if (lastActivityDate) {
          const lastActivity = new Date(lastActivityDate);
          if (lastActivity >= sevenDaysAgo) activeSites++;
          else inactiveSites++;
        } else {
          inactiveSites++;
        }
        siteDetails.push({
          displayName: row['Site URL']?.split('/').pop() || row['Owner Display Name'] || 'Site',
          webUrl: row['Site URL'] || '',
          lastActivity: lastActivityDate,
          storageUsedGB: parseFloat(((used || 0) / (1024 ** 3)).toFixed(4)),
          externalSharing: false, // will be enriched if admin API available
        });
      });
      console.log(`SharePoint storage: usedBytes=${storageUsedBytes}, active=${activeSites}, inactive=${inactiveSites}`);
    } else {
      console.warn('SharePoint site usage report returned null - check Reports.Read.All permission on tenant');
    }

    // Try to get tenant-level storage quota
    let storageAllocatedBytes = 0;

    // 1. Try agent-collected SPO quota from latest m365_analyzer snapshot
    try {
      const { data: latestSnapshot } = await supabase
        .from('m365_analyzer_snapshots')
        .select('agent_task_id')
        .eq('tenant_record_id', tenant_record_id)
        .eq('status', 'completed')
        .not('agent_task_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSnapshot?.agent_task_id) {
        const { data: taskData } = await supabase
          .from('agent_tasks')
          .select('step_results')
          .eq('id', latestSnapshot.agent_task_id)
          .maybeSingle();

        const stepResults = taskData?.step_results as Record<string, any> | null;
        const spoQuotaResult = stepResults?.spo_tenant_quota;
        
        if (spoQuotaResult?.success) {
          const quotaData = typeof spoQuotaResult.data === 'string' 
            ? JSON.parse(spoQuotaResult.data) 
            : spoQuotaResult.data;
          const quotaMB = quotaData?.StorageQuota || (Array.isArray(quotaData) ? quotaData[0]?.StorageQuota : 0) || 0;
          if (quotaMB > 0) {
            storageAllocatedBytes = quotaMB * 1024 * 1024; // MB → bytes
            console.log(`Agent SPO quota: ${quotaMB} MB (${(quotaMB / 1024).toFixed(2)} GB)`);
          }
        }
      }
    } catch (e) {
      console.log(`Agent SPO quota lookup failed: ${e instanceof Error ? e.message : e}`);
    }

    // 2. Fallback: try SPO Admin REST API
    const tenantDomain = tenant.tenant_domain?.replace('.onmicrosoft.com', '') || '';
    if (storageAllocatedBytes === 0 && tenantDomain) {
      try {
        const spoAdminUrl = `https://${tenantDomain}-admin.sharepoint.com/_api/StorageQuota()`;
        const quotaRes = await fetch(spoAdminUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json;odata=nometadata',
          },
        });
        if (quotaRes.ok) {
          const quotaData = await quotaRes.json();
          const totalMB = quotaData?.Total || quotaData?.GeoAvailableStorageMB || 0;
          if (totalMB > 0) {
            storageAllocatedBytes = totalMB * 1024 * 1024;
            console.log(`SPO Admin quota: ${totalMB} MB (${(totalMB / 1024).toFixed(2)} GB)`);
          }
        } else {
          console.log(`SPO Admin quota unavailable (${quotaRes.status}) - quota will be 0`);
        }
      } catch (e) {
        console.log(`SPO Admin quota fetch failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    // External sharing - check site count (requires admin-level scope)
    const externalSharingEnabled = 0; // Requires SPO admin API, placeholder

    const storageUsedGB = parseFloat((storageUsedBytes / (1024 ** 3)).toFixed(2));
    const storageAllocatedGB = parseFloat((storageAllocatedBytes / (1024 ** 3)).toFixed(2));

    // ── Fetch compliance correlation data ──────────────────────────────────
    let failedComplianceCodes = new Set<string>();
    try {
      const { data: lastCompliance } = await supabase
        .from('m365_posture_history')
        .select('insights')
        .eq('tenant_record_id', tenant_record_id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();

      if (lastCompliance?.insights && Array.isArray(lastCompliance.insights)) {
        failedComplianceCodes = new Set(
          (lastCompliance.insights as any[])
            .filter((r: any) => r.status === 'fail')
            .map((r: any) => r.code || r.id)
            .filter(Boolean)
        );
        console.log(`Compliance correlation: ${failedComplianceCodes.size} failed codes found`);
      }
    } catch (e) {
      console.warn('Failed to fetch compliance data for correlation:', e);
    }

    function enrichCollabInsight(insight: any, codes: string[], context: string): any {
      const matchedCodes = codes.filter(c => failedComplianceCodes.has(c));
      if (matchedCodes.length > 0) {
        insight.description += `\n\n⚠️ Correlação de Compliance: ${context}`;
        insight.metadata = {
          ...(insight.metadata || {}),
          complianceCorrelation: true,
          complianceCodes: matchedCodes,
          complianceContext: context,
        };
      }
      return insight;
    }

    // === GENERATE COLLABORATION INSIGHTS ===
    const collaborationInsights: any[] = [];

    // Teams governance
    if (publicTeams > 0 && publicTeams > totalTeams * 0.5) {
      const insight = {
        id: 'teams_public_majority',
        category: 'teams_governance',
        name: 'Maioria dos Teams são Públicos',
        description: `${publicTeams} de ${totalTeams} teams (${Math.round(publicTeams / totalTeams * 100)}%) são públicos, permitindo acesso irrestrito.`,
        severity: publicTeams > totalTeams * 0.7 ? 'high' : 'medium',
        status: 'fail',
        count: publicTeams,
        recommendation: 'Revise a visibilidade dos teams e restrinja aqueles com dados sensíveis para privado.',
      };
      collaborationInsights.push(enrichCollabInsight(insight, ['TMS-001', 'TMS-002'], 'Sem política de governança de Teams restringindo visibilidade (TMS-001/002).'));
    } else {
      collaborationInsights.push({
        id: 'teams_governance_ok',
        category: 'teams_governance',
        name: 'Governança de Teams Adequada',
        description: `${privateTeams} de ${totalTeams} teams são privados. Configuração de visibilidade adequada.`,
        severity: 'info',
        status: 'pass',
      });
    }

    // Guest access
    if (teamsWithGuests > 0) {
      const guestInsight = {
        id: 'teams_with_guests',
        category: 'guest_access',
        name: 'Teams com Convidados Externos',
        description: `${teamsWithGuests} team(s) possuem membros convidados (guests) com acesso a conteúdo interno.`,
        severity: teamsWithGuests > 10 ? 'high' : 'medium',
        status: 'fail',
        count: teamsWithGuests,
        recommendation: 'Revise periodicamente os convidados e remova acessos desnecessários.',
      };
      collaborationInsights.push(enrichCollabInsight(guestInsight, ['TMS-003', 'TMS-005'], 'Sem política de revisão periódica de convidados externos (TMS-003/005).'));
    } else {
      collaborationInsights.push({
        id: 'guest_access_ok',
        category: 'guest_access',
        name: 'Sem Convidados Externos em Teams',
        description: 'Nenhum team possui membros convidados externos.',
        severity: 'info',
        status: 'pass',
      });
    }

    // Private/shared channels
    if (privateChannels > 0 || sharedChannels > 0) {
      collaborationInsights.push({
        id: 'channels_special',
        category: 'collaboration_risk',
        name: 'Canais Privados e Compartilhados',
        description: `${privateChannels} canais privados e ${sharedChannels} canais compartilhados detectados.`,
        severity: sharedChannels > 5 ? 'medium' : 'info',
        status: sharedChannels > 5 ? 'fail' : 'pass',
        count: privateChannels + sharedChannels,
        recommendation: 'Canais compartilhados entre organizações devem ser monitorados para vazamento de dados.',
      });
    }

    // SharePoint exposure
    if (inactiveSites > activeSites && inactiveSites > 10) {
      const inactiveInsight = {
        id: 'sharepoint_inactive',
        category: 'sharepoint_exposure',
        name: 'Sites SharePoint Inativos',
        description: `${inactiveSites} sites inativos de ${totalSites} totais. Sites abandonados podem conter dados sensíveis sem supervisão.`,
        severity: 'medium',
        status: 'fail',
        count: inactiveSites,
        recommendation: 'Revise e arquive sites inativos para reduzir superfície de exposição.',
      };
      collaborationInsights.push(enrichCollabInsight(inactiveInsight, ['SPO-001', 'SPO-002'], 'Sem política de lifecycle para sites inativos (SPO-001/002).'));
    } else {
      collaborationInsights.push({
        id: 'sharepoint_exposure_ok',
        category: 'sharepoint_exposure',
        name: 'Sites SharePoint Ativos',
        description: `${activeSites} de ${totalSites} sites estão ativos. Boa higiene de sites.`,
        severity: 'info',
        status: 'pass',
      });
    }

    // Storage usage
    if (storageAllocatedGB > 0 && storageUsedGB / storageAllocatedGB > 0.85) {
      collaborationInsights.push({
        id: 'sharepoint_storage_high',
        category: 'sharepoint_exposure',
        name: 'Storage SharePoint Próximo do Limite',
        description: `${storageUsedGB} GB de ${storageAllocatedGB} GB utilizados (${Math.round(storageUsedGB / storageAllocatedGB * 100)}%).`,
        severity: storageUsedGB / storageAllocatedGB > 0.95 ? 'high' : 'medium',
        status: 'fail',
        recommendation: 'Considere expandir a quota ou limpar dados desnecessários.',
      });
    } else if (storageAllocatedGB > 0) {
      collaborationInsights.push({
        id: 'sharepoint_storage_ok',
        category: 'external_sharing',
        name: 'Storage SharePoint Adequado',
        description: `${storageUsedGB} GB de ${storageAllocatedGB} GB utilizados (${Math.round(storageUsedGB / storageAllocatedGB * 100)}%).`,
        severity: 'info',
        status: 'pass',
      });
    }

    const result = {
      success: true,
      teams: {
        total: totalTeams,
        public: publicTeams,
        private: privateTeams,
        withGuests: teamsWithGuests,
        privateChannels,
        sharedChannels,
        teamDetails,
      },
      sharepoint: {
        totalSites,
        activeSites: activeSites || totalSites, // fallback
        inactiveSites,
        externalSharingEnabled,
        totalLists: 0,
        storageUsedGB,
        storageAllocatedGB,
        siteDetails,
      },
      insights: collaborationInsights,
      analyzedAt: now.toISOString(),
    };

    // Save snapshot to m365_dashboard_snapshots
    const { error: snapError } = await supabase.from('m365_dashboard_snapshots').insert({
      tenant_record_id,
      client_id: tenant.client_id,
      dashboard_type: 'collaboration',
      data: result,
      period_start: now.toISOString(),
      period_end: now.toISOString(),
    });
    if (snapError) console.error('Failed to save collaboration dashboard snapshot:', snapError);

    // Save legacy cache (backward compat)
    const { error: updateError } = await supabase.from('m365_tenants').update({
      collaboration_dashboard_cache: result,
      collaboration_dashboard_cached_at: now.toISOString(),
    }).eq('id', tenant_record_id);
    if (updateError) console.error('Failed to save collaboration dashboard cache:', updateError);

    console.log('Collaboration Dashboard data aggregated and cached successfully');

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('collaboration-dashboard error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
