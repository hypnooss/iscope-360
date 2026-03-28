import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AnalyzerSnapshot, AnalyzerInsight, AnalyzerMetrics, AnalyzerSummary, TopBlockedIP, TopCountry, TopCategory, TopUserIP } from '@/types/analyzerInsights';

function parseSnapshot(row: Record<string, unknown>): AnalyzerSnapshot {
  const rawSummary = (row.summary ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 }) as unknown as AnalyzerSummary;
  const insights = (Array.isArray(row.insights) ? row.insights : []) as unknown as AnalyzerInsight[];
  const metrics = (row.metrics ?? {}) as Record<string, unknown>;

  return {
    id: row.id as string,
    firewall_id: row.firewall_id as string,
    client_id: row.client_id as string,
    agent_task_id: (row.agent_task_id as string) ?? undefined,
    status: (row.status as AnalyzerSnapshot['status']) ?? 'pending',
    period_start: (row.period_start as string) ?? undefined,
    period_end: (row.period_end as string) ?? undefined,
    score: (row.score as number) ?? undefined,
    summary: rawSummary,
    insights,
    metrics: {
      topBlockedIPs: (metrics.topBlockedIPs as AnalyzerMetrics['topBlockedIPs']) ?? [],
      topCountries: (metrics.topCountries as AnalyzerMetrics['topCountries']) ?? [],
      vpnFailures: (metrics.vpnFailures as number) ?? 0,
      firewallAuthFailures: (metrics.firewallAuthFailures as number) ?? 0,
      firewallAuthSuccesses: (metrics.firewallAuthSuccesses as number) ?? 0,
      vpnSuccesses: (metrics.vpnSuccesses as number) ?? 0,
      topAuthIPs: (metrics.topAuthIPs as AnalyzerMetrics['topAuthIPs']) ?? [],
      topAuthCountries: (metrics.topAuthCountries as AnalyzerMetrics['topAuthCountries']) ?? [],
      topAuthIPsSuccess: (metrics.topAuthIPsSuccess as AnalyzerMetrics['topAuthIPsSuccess']) ?? [],
      topAuthIPsFailed: (metrics.topAuthIPsFailed as AnalyzerMetrics['topAuthIPsFailed']) ?? [],
      topAuthCountriesSuccess: (metrics.topAuthCountriesSuccess as AnalyzerMetrics['topAuthCountriesSuccess']) ?? [],
      topAuthCountriesFailed: (metrics.topAuthCountriesFailed as AnalyzerMetrics['topAuthCountriesFailed']) ?? [],
      // Separated FW auth
      topFwAuthIPsFailed: (metrics.topFwAuthIPsFailed as AnalyzerMetrics['topFwAuthIPsFailed']) ?? [],
      topFwAuthIPsSuccess: (metrics.topFwAuthIPsSuccess as AnalyzerMetrics['topFwAuthIPsSuccess']) ?? [],
      topFwAuthCountriesFailed: (metrics.topFwAuthCountriesFailed as AnalyzerMetrics['topFwAuthCountriesFailed']) ?? [],
      topFwAuthCountriesSuccess: (metrics.topFwAuthCountriesSuccess as AnalyzerMetrics['topFwAuthCountriesSuccess']) ?? [],
      // Separated VPN auth
      topVpnAuthIPsFailed: (metrics.topVpnAuthIPsFailed as AnalyzerMetrics['topVpnAuthIPsFailed']) ?? [],
      topVpnAuthIPsSuccess: (metrics.topVpnAuthIPsSuccess as AnalyzerMetrics['topVpnAuthIPsSuccess']) ?? [],
      topVpnAuthCountriesFailed: (metrics.topVpnAuthCountriesFailed as AnalyzerMetrics['topVpnAuthCountriesFailed']) ?? [],
      topVpnAuthCountriesSuccess: (metrics.topVpnAuthCountriesSuccess as AnalyzerMetrics['topVpnAuthCountriesSuccess']) ?? [],
      // VPN user rankings
      topVpnUsersFailed: (metrics.topVpnUsersFailed as AnalyzerMetrics['topVpnUsersFailed']) ?? [],
      topVpnUsersSuccess: (metrics.topVpnUsersSuccess as AnalyzerMetrics['topVpnUsersSuccess']) ?? [],
      // Outbound (allowed)
      topOutboundIPs: (metrics.topOutboundIPs as AnalyzerMetrics['topOutboundIPs']) ?? [],
      topOutboundCountries: (metrics.topOutboundCountries as AnalyzerMetrics['topOutboundCountries']) ?? [],
      outboundConnections: (metrics.outboundConnections as number) ?? 0,
      // Outbound (blocked)
      topOutboundBlockedIPs: (metrics.topOutboundBlockedIPs as AnalyzerMetrics['topOutboundBlockedIPs']) ?? [],
      topOutboundBlockedCountries: (metrics.topOutboundBlockedCountries as AnalyzerMetrics['topOutboundBlockedCountries']) ?? [],
      outboundBlocked: (metrics.outboundBlocked as number) ?? 0,
      ipsEvents: (metrics.ipsEvents as number) ?? 0,
      configChanges: (metrics.configChanges as number) ?? 0,
      configChangeDetails: (metrics.configChangeDetails as AnalyzerMetrics['configChangeDetails']) ?? [],
      totalDenied: (metrics.totalDenied as number) ?? 0,
      totalEvents: (metrics.totalEvents as number) ?? 0,
      topWebFilterCategories: (metrics.topWebFilterCategories as AnalyzerMetrics['topWebFilterCategories']) ?? [],
      topWebFilterUsers: (metrics.topWebFilterUsers as AnalyzerMetrics['topWebFilterUsers']) ?? [],
      topAppControlApps: (metrics.topAppControlApps as AnalyzerMetrics['topAppControlApps']) ?? [],
      topAppControlUsers: (metrics.topAppControlUsers as AnalyzerMetrics['topAppControlUsers']) ?? [],
      webFilterBlocked: (metrics.webFilterBlocked as number) ?? 0,
      appControlBlocked: (metrics.appControlBlocked as number) ?? 0,
      anomalyEvents: (metrics.anomalyEvents as number) ?? 0,
      anomalyDropped: (metrics.anomalyDropped as number) ?? 0,
      topAnomalySources: (metrics.topAnomalySources as AnalyzerMetrics['topAnomalySources']) ?? [],
      topAnomalyTypes: (metrics.topAnomalyTypes as AnalyzerMetrics['topAnomalyTypes']) ?? [],
      // IPS metrics
      topIpsAttackTypes: (metrics.topIpsAttackTypes as AnalyzerMetrics['topIpsAttackTypes']) ?? [],
      topIpsSrcIPs: (metrics.topIpsSrcIPs as AnalyzerMetrics['topIpsSrcIPs']) ?? [],
      topIpsSrcCountries: (metrics.topIpsSrcCountries as AnalyzerMetrics['topIpsSrcCountries']) ?? [],
      topIpsDstIPs: (metrics.topIpsDstIPs as AnalyzerMetrics['topIpsDstIPs']) ?? [],
      // Inbound traffic
      topInboundBlockedIPs: (metrics.topInboundBlockedIPs as AnalyzerMetrics['topInboundBlockedIPs']) ?? [],
      topInboundBlockedCountries: (metrics.topInboundBlockedCountries as AnalyzerMetrics['topInboundBlockedCountries']) ?? [],
      inboundBlocked: (metrics.inboundBlocked as number) ?? 0,
      topInboundAllowedIPs: (metrics.topInboundAllowedIPs as AnalyzerMetrics['topInboundAllowedIPs']) ?? [],
      topInboundAllowedCountries: (metrics.topInboundAllowedCountries as AnalyzerMetrics['topInboundAllowedCountries']) ?? [],
      inboundAllowed: (metrics.inboundAllowed as number) ?? 0,
      // Fase 2
      activeSessions: (metrics.activeSessions as number) ?? 0,
      interfaceBandwidth: (metrics.interfaceBandwidth as AnalyzerMetrics['interfaceBandwidth']) ?? [],
      botnetDetections: (metrics.botnetDetections as number) ?? 0,
      botnetDomains: (metrics.botnetDomains as AnalyzerMetrics['botnetDomains']) ?? [],
    },
    created_at: row.created_at as string,
  };
}

// --- Aggregation helpers ---

function mergeIPRankings(ips: TopBlockedIP[]): TopBlockedIP[] {
  const map = new Map<string, TopBlockedIP>();
  for (const ip of ips) {
    const existing = map.get(ip.ip);
    if (existing) {
      existing.count += ip.count;
      existing.targetPorts = [...new Set([...(existing.targetPorts ?? []), ...(ip.targetPorts ?? [])])];
    } else {
      map.set(ip.ip, { ...ip, targetPorts: [...(ip.targetPorts ?? [])] });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 15);
}

function mergeCountryRankings(countries: TopCountry[]): TopCountry[] {
  const map = new Map<string, { count: number; code?: string }>();
  for (const c of countries) {
    const existing = map.get(c.country);
    if (existing) {
      existing.count += c.count;
    } else {
      map.set(c.country, { count: c.count, code: c.code });
    }
  }
  return [...map.entries()]
    .map(([country, v]) => ({ country, count: v.count, code: v.code }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function mergeCategoryRankings(items: TopCategory[]): TopCategory[] {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.category, (map.get(item.category) ?? 0) + item.count);
  }
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function mergeUserRankings(items: { user: string; ip?: string; count: number }[]): { user: string; ip?: string; count: number }[] {
  const map = new Map<string, { ip?: string; count: number }>();
  for (const item of items) {
    const existing = map.get(item.user);
    if (existing) {
      existing.count += item.count;
    } else {
      map.set(item.user, { ip: item.ip, count: item.count });
    }
  }
  return [...map.entries()]
    .map(([user, v]) => ({ user, ip: v.ip, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function deduplicateInsights(insights: AnalyzerInsight[]): AnalyzerInsight[] {
  const seen = new Set<string>();
  return insights.filter(ins => {
    const key = `${ins.category}::${ins.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Aggregates multiple snapshots (each covering 1h) into a single consolidated snapshot
 * representing the full time range. Numeric counters are summed, IP/country rankings
 * are merged and re-ranked by total count across all snapshots.
 */
function aggregateSnapshots(snapshots: AnalyzerSnapshot[]): AnalyzerSnapshot & { snapshotCount: number } | null {
  if (!snapshots.length) return null;

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  // Sum all severity counts
  const summary: AnalyzerSummary = snapshots.reduce(
    (acc, s) => ({
      critical: acc.critical + (s.summary?.critical ?? 0),
      high: acc.high + (s.summary?.high ?? 0),
      medium: acc.medium + (s.summary?.medium ?? 0),
      low: acc.low + (s.summary?.low ?? 0),
      info: acc.info + (s.summary?.info ?? 0),
    }),
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  );

  // Sum numeric metrics
  const sum = (key: keyof AnalyzerMetrics) =>
    snapshots.reduce((acc, s) => acc + ((s.metrics[key] as number) ?? 0), 0);

  const metrics: AnalyzerMetrics = {
    totalEvents: sum('totalEvents'),
    totalDenied: sum('totalDenied'),
    vpnFailures: sum('vpnFailures'),
    vpnSuccesses: sum('vpnSuccesses'),
    firewallAuthFailures: sum('firewallAuthFailures'),
    firewallAuthSuccesses: sum('firewallAuthSuccesses'),
    outboundConnections: sum('outboundConnections'),
    outboundBlocked: sum('outboundBlocked'),
    ipsEvents: sum('ipsEvents'),
    configChanges: sum('configChanges'),
    webFilterBlocked: sum('webFilterBlocked'),
    appControlBlocked: sum('appControlBlocked'),
    anomalyEvents: sum('anomalyEvents'),
    anomalyDropped: sum('anomalyDropped'),

    // Merged rankings
    topBlockedIPs: mergeIPRankings(snapshots.flatMap(s => s.metrics.topBlockedIPs ?? [])),
    topCountries: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topCountries ?? [])),
    topAuthIPs: mergeIPRankings(snapshots.flatMap(s => s.metrics.topAuthIPs ?? [])),
    topAuthCountries: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topAuthCountries ?? [])),
    topAuthIPsSuccess: mergeIPRankings(snapshots.flatMap(s => s.metrics.topAuthIPsSuccess ?? [])),
    topAuthIPsFailed: mergeIPRankings(snapshots.flatMap(s => s.metrics.topAuthIPsFailed ?? [])),
    topAuthCountriesSuccess: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topAuthCountriesSuccess ?? [])),
    topAuthCountriesFailed: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topAuthCountriesFailed ?? [])),
    topFwAuthIPsFailed: mergeIPRankings(snapshots.flatMap(s => s.metrics.topFwAuthIPsFailed ?? [])),
    topFwAuthIPsSuccess: mergeIPRankings(snapshots.flatMap(s => s.metrics.topFwAuthIPsSuccess ?? [])),
    topFwAuthCountriesFailed: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topFwAuthCountriesFailed ?? [])),
    topFwAuthCountriesSuccess: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topFwAuthCountriesSuccess ?? [])),
    topVpnAuthIPsFailed: mergeIPRankings(snapshots.flatMap(s => s.metrics.topVpnAuthIPsFailed ?? [])),
    topVpnAuthIPsSuccess: mergeIPRankings(snapshots.flatMap(s => s.metrics.topVpnAuthIPsSuccess ?? [])),
    topVpnAuthCountriesFailed: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topVpnAuthCountriesFailed ?? [])),
    topVpnAuthCountriesSuccess: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topVpnAuthCountriesSuccess ?? [])),
    topVpnUsersFailed: mergeUserRankings(snapshots.flatMap(s => s.metrics.topVpnUsersFailed ?? [])) as any,
    topVpnUsersSuccess: mergeUserRankings(snapshots.flatMap(s => s.metrics.topVpnUsersSuccess ?? [])) as any,
    topOutboundIPs: mergeIPRankings(snapshots.flatMap(s => s.metrics.topOutboundIPs ?? [])),
    topOutboundCountries: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topOutboundCountries ?? [])),
    topOutboundBlockedIPs: mergeIPRankings(snapshots.flatMap(s => s.metrics.topOutboundBlockedIPs ?? [])),
    topOutboundBlockedCountries: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topOutboundBlockedCountries ?? [])),
    topWebFilterCategories: mergeCategoryRankings(snapshots.flatMap(s => s.metrics.topWebFilterCategories ?? [])),
    topWebFilterUsers: mergeUserRankings(snapshots.flatMap(s => s.metrics.topWebFilterUsers ?? [])) as any,
    topAppControlApps: mergeCategoryRankings(snapshots.flatMap(s => s.metrics.topAppControlApps ?? [])),
    topAppControlUsers: mergeUserRankings(snapshots.flatMap(s => s.metrics.topAppControlUsers ?? [])) as any,
    topAnomalySources: mergeIPRankings(snapshots.flatMap(s => s.metrics.topAnomalySources ?? [])),
    topAnomalyTypes: mergeCategoryRankings(snapshots.flatMap(s => s.metrics.topAnomalyTypes ?? [])),
    configChangeDetails: snapshots.flatMap(s => s.metrics.configChangeDetails ?? []).slice(0, 50),
    // IPS metrics
    topIpsAttackTypes: mergeCategoryRankings(snapshots.flatMap(s => s.metrics.topIpsAttackTypes ?? [])),
    topIpsSrcIPs: mergeIPRankings(snapshots.flatMap(s => s.metrics.topIpsSrcIPs ?? [])),
    topIpsSrcCountries: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topIpsSrcCountries ?? [])),
    topIpsDstIPs: mergeIPRankings(snapshots.flatMap(s => s.metrics.topIpsDstIPs ?? [])),
    // Inbound traffic
    topInboundBlockedIPs: mergeIPRankings(snapshots.flatMap(s => s.metrics.topInboundBlockedIPs ?? [])),
    topInboundBlockedCountries: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topInboundBlockedCountries ?? [])),
    inboundBlocked: sum('inboundBlocked'),
    topInboundAllowedIPs: mergeIPRankings(snapshots.flatMap(s => s.metrics.topInboundAllowedIPs ?? [])),
    topInboundAllowedCountries: mergeCountryRankings(snapshots.flatMap(s => s.metrics.topInboundAllowedCountries ?? [])),
    inboundAllowed: sum('inboundAllowed'),
    // Fase 2: use latest snapshot values (not aggregatable)
    activeSessions: latest.metrics.activeSessions ?? 0,
    interfaceBandwidth: latest.metrics.interfaceBandwidth ?? [],
    botnetDetections: sum('botnetDetections'),
    botnetDomains: latest.metrics.botnetDomains ?? [],
  };

  return {
    ...latest,
    // Expand period to cover the oldest snapshot's start
    period_start: oldest.period_start ?? latest.period_start,
    period_end: latest.period_end,
    summary,
    insights: deduplicateInsights(snapshots.flatMap(s => s.insights ?? [])),
    metrics,
    snapshotCount: snapshots.length,
  };
}

export function useAnalyzerData(firewallId?: string) {
  return useQuery({
    queryKey: ['analyzer-snapshots', firewallId],
    queryFn: async () => {
      let query = supabase
        .from('analyzer_snapshots' as any)
        .select('*')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10);

      if (firewallId) {
        query = query.eq('firewall_id', firewallId);
      }

      const { data, error } = await query as any;
      if (error) throw error;
      return ((data as any[]) || []).map((r) => parseSnapshot(r as Record<string, unknown>));
    },
    enabled: true,
    staleTime: 1000 * 60 * 2,
  });
}

export function useAnalyzerProgress(firewallId?: string) {
  return useQuery({
    queryKey: ['analyzer-progress', firewallId],
    queryFn: async () => {
      if (!firewallId) return null;
      const { data } = await supabase
        .from('analyzer_snapshots' as any)
        .select('id, status, created_at, agent_task_id')
        .eq('firewall_id', firewallId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as any;

      if (!data) return null;
      const snap = data as any;
      if (snap.status === 'completed' || snap.status === 'failed' || snap.status === 'cancelled' || snap.status === 'timeout') {
        return { status: snap.status as string, elapsed: null as number | null };
      }

      // Cross-check: if the associated agent_task is already done, treat snapshot as expired
      if (snap.agent_task_id) {
        const { data: task } = await supabase
          .from('agent_tasks')
          .select('status')
          .eq('id', snap.agent_task_id)
          .maybeSingle();
        if (task && ['timeout', 'failed', 'completed'].includes(task.status)) {
          // Fire-and-forget: sync snapshot status
          supabase.from('analyzer_snapshots' as any)
            .update({ status: 'failed' })
            .eq('id', snap.id)
            .then(() => {});
          return { status: 'timeout' as string, elapsed: null as number | null };
        }
      }

      const elapsed = Math.floor((Date.now() - new Date(snap.created_at).getTime()) / 1000);
      // Treat snapshots stuck for more than 60 minutes as timed out
      if (elapsed > 3600) {
        return { status: 'timeout' as string, elapsed: null as number | null };
      }
      return { status: snap.status as string, elapsed, snapshotId: snap.id as string };
    },
    enabled: !!firewallId,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

export function useLatestAnalyzerSnapshot(firewallId?: string) {
  return useQuery({
    queryKey: ['analyzer-latest', firewallId],
    queryFn: async () => {
      if (!firewallId) return null;

      // 1) Fetch light columns (no insights/metrics) for last 24 snapshots
      const lightCols = 'id, firewall_id, client_id, agent_task_id, status, period_start, period_end, score, summary, created_at';
      const { data: lightRows, error: lightError } = await supabase
        .from('analyzer_snapshots' as any)
        .select(lightCols)
        .eq('firewall_id', firewallId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(24) as any;

      if (lightError) throw lightError;
      const rows = (lightRows as any[]) || [];
      if (rows.length === 0) return null;

      // 2a) Fetch insights only for the latest snapshot
      const latestId = rows[0].id;
      const ids = rows.map((r: any) => r.id);

      const [insightsRes, metricsRes] = await Promise.all([
        supabase
          .from('analyzer_snapshots' as any)
          .select('insights')
          .eq('id', latestId)
          .single() as any,
        // 2b) Fetch metrics for ALL snapshots (no insights = much lighter, avoids timeout)
        supabase
          .from('analyzer_snapshots' as any)
          .select('id, metrics')
          .in('id', ids) as any,
      ]);

      if (insightsRes.error) throw insightsRes.error;
      if (metricsRes.error) throw metricsRes.error;

      // 3) Build snapshots merging metrics from all rows, insights only for latest
      const metricsMap = new Map((metricsRes.data as any[] || []).map((r: any) => [r.id, r.metrics]));
      const snapshots = rows.map((r: any, idx: number) => {
        const m = metricsMap.get(r.id) ?? {};
        const ins = idx === 0 ? insightsRes.data?.insights : [];
        return parseSnapshot({ ...r, insights: ins, metrics: m } as Record<string, unknown>);
      });

      return aggregateSnapshots(snapshots);
    },
    enabled: !!firewallId,
    staleTime: 1000 * 30,
  });
}
