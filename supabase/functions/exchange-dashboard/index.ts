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

async function graphGet(accessToken: string, url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`Graph GET ${url} failed: ${res.status} - ${body.substring(0, 200)}`);
    return null;
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/plain') || contentType.includes('text/csv') || contentType.includes('application/octet-stream')) {
    return { _csv: await res.text() };
  }
  return await res.json();
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

    // ── Fetch disabled users + mail-enabled groups to build exclusion Set ──
    const nonUserUpnSet = new Set<string>();
    try {
      const [disabledUsers, mailGroups] = await Promise.all([
        graphGetAllPages(accessToken, "https://graph.microsoft.com/v1.0/users?$filter=accountEnabled eq false&$select=userPrincipalName&$top=999", 5),
        graphGetAllPages(accessToken, "https://graph.microsoft.com/v1.0/groups?$filter=mailEnabled eq true and securityEnabled eq false&$select=mail&$top=999", 5),
      ]);
      disabledUsers.forEach((u: any) => { if (u.userPrincipalName) nonUserUpnSet.add(u.userPrincipalName.toLowerCase()); });
      mailGroups.forEach((g: any) => { if (g.mail) nonUserUpnSet.add(g.mail.toLowerCase()); });
      console.log(`Non-user exclusion set: ${nonUserUpnSet.size} entries (${disabledUsers.length} disabled users, ${mailGroups.length} mail groups)`);
    } catch (e) {
      console.warn('Failed to build non-user exclusion set:', e);
    }

    // Fetch mailbox usage report (state data — D7 to avoid duplication across snapshots)
    const mailboxUsageResult = await graphGet(accessToken, "https://graph.microsoft.com/v1.0/reports/getMailboxUsageDetail(period='D7')").catch(e => { console.warn('mailboxUsage error:', e); return null; });

    // Parse mailbox usage data
    let totalMailboxes = 0;
    let overQuota = 0;
    const overQuotaUsers: { name: string; usedGB: number; quotaGB: number; usagePct: number }[] = [];
    let newLast30d = 0;
    let notLoggedIn30d = 0;
    let notLoggedIn60d = 0;
    let notLoggedIn90d = 0;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const inactiveUsers30: { name: string; lastActivity: string }[] = [];
    const inactiveUsers60: { name: string; lastActivity: string }[] = [];
    const inactiveUsers90: { name: string; lastActivity: string }[] = [];

    // Reports return CSV via _csv wrapper
    if (mailboxUsageResult?._csv) {
      const rows = parseCsvReport(mailboxUsageResult._csv);
      console.log(`Mailbox usage report: ${rows.length} rows, headers: ${rows.length > 0 ? Object.keys(rows[0]).join(', ') : 'none'}`);
      rows.forEach((row: any) => {
        const isDeleted = (row['Is Deleted'] || '').toLowerCase() === 'true';
        if (isDeleted) return;
        totalMailboxes++;
        const upn = row['User Principal Name'] || row['Display Name'] || '';
        // Check storage quota (CSV field names)
        const used = parseInt(row['Storage Used (Byte)'] || '0', 10);
        const quota = parseInt(row['Prohibit Send/Receive Quota (Byte)'] || '0', 10);
        if (quota > 0 && used >= quota * 0.9) {
          overQuota++;
          overQuotaUsers.push({
            name: upn,
            usedGB: Math.round(used / (1024**3) * 100) / 100,
            quotaGB: Math.round(quota / (1024**3) * 100) / 100,
            usagePct: Math.round((used / quota) * 1000) / 10,
          });
        }
        
        if (row['Created Date']) {
          const created = new Date(row['Created Date']);
          if (created >= thirtyDaysAgo) newLast30d++;
        }
        const upnLower = (row['User Principal Name'] || '').toLowerCase();
        const isNonUserMailbox = nonUserUpnSet.has(upnLower);
        if (!isNonUserMailbox) {
          if (row['Last Activity Date']) {
            const lastActivity = new Date(row['Last Activity Date']);
            const lastStr = row['Last Activity Date'];
            if (lastActivity < ninetyDaysAgo) {
              notLoggedIn90d++;
              inactiveUsers90.push({ name: upn, lastActivity: lastStr });
            } else if (lastActivity < sixtyDaysAgo) {
              notLoggedIn60d++;
              inactiveUsers60.push({ name: upn, lastActivity: lastStr });
            } else if (lastActivity < thirtyDaysAgo) {
              notLoggedIn30d++;
              inactiveUsers30.push({ name: upn, lastActivity: lastStr });
            }
          } else {
            notLoggedIn90d++;
            inactiveUsers90.push({ name: upn, lastActivity: 'Nunca' });
          }
        }
      });
    } else if (mailboxUsageResult?.value) {
      const rows = mailboxUsageResult.value || [];
      console.log(`Mailbox usage JSON: ${rows.length} rows`);
      rows.forEach((row: any) => {
        if (row.isDeleted) return;
        totalMailboxes++;
        const upnJ = row.userPrincipalName || row.displayName || '';
        const used = row.storageUsedInBytes || 0;
        const quota = row.prohibitSendReceiveQuotaInBytes || 0;
        if (quota > 0 && used >= quota * 0.9) {
          overQuota++;
          overQuotaUsers.push({
            name: upnJ,
            usedGB: Math.round(used / (1024**3) * 100) / 100,
            quotaGB: Math.round(quota / (1024**3) * 100) / 100,
            usagePct: Math.round((used / quota) * 1000) / 10,
          });
        }
        if (row.createdDateTime) {
          if (new Date(row.createdDateTime) >= thirtyDaysAgo) newLast30d++;
        }
        const upnLowerJ = (row.userPrincipalName || '').toLowerCase();
        const isNonUserMailboxJ = nonUserUpnSet.has(upnLowerJ);
        if (!isNonUserMailboxJ) {
          if (row.lastActivityDate) {
            const la = new Date(row.lastActivityDate);
            if (la < ninetyDaysAgo) { notLoggedIn90d++; inactiveUsers90.push({ name: upnJ, lastActivity: row.lastActivityDate }); }
            else if (la < sixtyDaysAgo) { notLoggedIn60d++; inactiveUsers60.push({ name: upnJ, lastActivity: row.lastActivityDate }); }
            else if (la < thirtyDaysAgo) { notLoggedIn30d++; inactiveUsers30.push({ name: upnJ, lastActivity: row.lastActivityDate }); }
          } else {
            notLoggedIn90d++;
            inactiveUsers90.push({ name: upnJ, lastActivity: 'Nunca' });
          }
        }
      });
    } else {
      console.warn('Mailbox usage report returned no data. Check Reports.Read.All permission.');
    }

    // Email traffic and rankings — aggregate from analyzer snapshots (last 24h only)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    let sent = 0;
    let received = 0;
    const senderMap: Record<string, number> = {};
    const recipientMap: Record<string, number> = {};

    try {
      const { data: trafficSnapshots } = await supabase
        .from('m365_analyzer_snapshots')
        .select('metrics')
        .eq('tenant_record_id', tenant_record_id)
        .eq('status', 'completed')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false });

      if (trafficSnapshots && trafficSnapshots.length > 0) {
        for (const snap of trafficSnapshots) {
          const m = snap.metrics as any;
          // Aggregate emailTraffic totals
          const et = m?.emailTraffic;
          if (et) {
            sent += et.sent || 0;
            received += et.received || 0;
          }
          // Aggregate emailTrafficRankings
          const etr = m?.emailTrafficRankings;
          if (etr) {
            for (const s of (etr.topSenders || [])) {
              if (s.name) senderMap[s.name] = (senderMap[s.name] || 0) + (s.count || 0);
            }
            for (const r of (etr.topRecipients || [])) {
              if (r.name) recipientMap[r.name] = (recipientMap[r.name] || 0) + (r.count || 0);
            }
          }
        }
        console.log(`Traffic aggregated from ${trafficSnapshots.length} snapshots - sent: ${sent}, received: ${received}`);
      }
    } catch (e) {
      console.warn('Failed to aggregate traffic from snapshots:', e);
    }

    const senderRanking = Object.entries(senderMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const recipientRanking = Object.entries(recipientMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Fetch auto-reply and forwarding info - use simple query (no $filter/$count)
    let forwardingEnabled = 0;
    let autoReplyExternal = 0;
    const autoReplyUsers: { name: string; status: string; externalAudience: string }[] = [];

    try {
      const users = await graphGetAllPages(accessToken, 'https://graph.microsoft.com/v1.0/users?$select=id,userPrincipalName&$top=100', 2);
      console.log(`Users for mailbox settings check: ${users.length}`);

      if (users.length > 0) {
        const usersToCheck = users.slice(0, 50);
        const settingsPromises = usersToCheck.map(async (u: any) => {
          try {
            const settings = await graphGet(accessToken, `https://graph.microsoft.com/v1.0/users/${u.id}/mailboxSettings`);
            if (settings) {
              if (settings.automaticRepliesSetting?.status === 'alwaysEnabled' || settings.automaticRepliesSetting?.status === 'scheduled') {
                if (settings.automaticRepliesSetting?.externalAudience === 'all' || settings.automaticRepliesSetting?.externalAudience === 'contactsOnly') {
                  autoReplyExternal++;
                  autoReplyUsers.push({
                    name: u.userPrincipalName || u.id,
                    status: settings.automaticRepliesSetting.status,
                    externalAudience: settings.automaticRepliesSetting.externalAudience,
                  });
                }
              }
            }
          } catch { /* skip individual user errors */ }
        });
        await Promise.all(settingsPromises);
      }
    } catch (e) {
      console.warn('Failed to fetch user mailbox settings:', e);
    }

    // Security data from M365 Analyzer snapshots — aggregate last 24h only
    let maliciousInbound = 0;
    let phishing = 0;
    let malware = 0;
    let spam = 0;

    try {
      const { data: secSnapshots } = await supabase
        .from('m365_analyzer_snapshots')
        .select('metrics')
        .eq('tenant_record_id', tenant_record_id)
        .eq('status', 'completed')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false });

      if (secSnapshots && secSnapshots.length > 0) {
        for (const snap of secSnapshots) {
          const tp = (snap.metrics as any)?.threatProtection;
          if (tp) {
            spam += tp.spamBlocked || 0;
            phishing += tp.phishingDetected || 0;
            malware += tp.malwareBlocked || 0;
          }
        }
        maliciousInbound = phishing + malware;
        console.log(`Security aggregated from ${secSnapshots.length} snapshots (all) - spam: ${spam}, phishing: ${phishing}, malware: ${malware}`);
      } else {
        console.warn('No completed M365 analyzer snapshots found for tenant');
      }
    } catch (e) {
      console.warn('Failed to fetch analyzer snapshots for security data:', e);
    }

    const result = {
      success: true,
      mailboxes: {
        total: totalMailboxes,
        overQuota,
        overQuotaUsers: overQuotaUsers.slice(0, 50),
        forwardingEnabled,
        autoReplyExternal,
        autoReplyUsers,
        newLast30d,
        notLoggedIn30d,
        notLoggedIn60d,
        notLoggedIn90d,
        inactiveUsers30: inactiveUsers30.slice(0, 50),
        inactiveUsers60: inactiveUsers60.slice(0, 50),
        inactiveUsers90: inactiveUsers90.slice(0, 50),
      },
      traffic: { sent, received },
      trafficRankings: {
        topSenders: senderRanking.slice(0, 15),
        topRecipients: recipientRanking.slice(0, 15),
      },
      security: {
        maliciousInbound,
        phishing,
        malware,
        spam,
      },
      analyzedAt: now.toISOString(),
    };

    console.log('Exchange Dashboard result:', JSON.stringify({ mailboxes: result.mailboxes, traffic: result.traffic, security: result.security }));

    // Save snapshot to m365_dashboard_snapshots
    const { error: snapError } = await supabase.from('m365_dashboard_snapshots').insert({
      tenant_record_id,
      client_id: tenant.client_id,
      dashboard_type: 'exchange',
      data: result,
      period_start: now.toISOString(),
      period_end: now.toISOString(),
    });
    if (snapError) console.error('Failed to save exchange dashboard snapshot:', snapError);

    // Save legacy cache (backward compat)
    const { error: updateError } = await supabase.from('m365_tenants').update({
      exchange_dashboard_cache: result,
      exchange_dashboard_cached_at: now.toISOString(),
    }).eq('id', tenant_record_id);
    if (updateError) console.error('Failed to save exchange dashboard cache:', updateError);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('exchange-dashboard error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
