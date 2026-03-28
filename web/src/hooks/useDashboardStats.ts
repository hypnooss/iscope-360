import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MODULE_DASHBOARD_CONFIG } from '@/config/moduleDashboardConfig';
import { usePreview } from '@/contexts/PreviewContext';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SeverityBlock = {
  critical: number;
  high: number;
  medium: number;
  low: number;
};

export interface ScoreHistoryPoint {
  date: string;
  score: number;
}

export interface ModuleHealth {
  score: number | null;
  assetCount: number;
  lastAnalysisDate: string | null;
  severities: SeverityBlock;
  cveSeverities?: SeverityBlock | null;
  scoreHistory: ScoreHistoryPoint[];
  activeUsers?: number | null;
}

const emptyHealth: ModuleHealth = {
  score: null,
  assetCount: 0,
  lastAnalysisDate: null,
  severities: { critical: 0, high: 0, medium: 0, low: 0 },
  scoreHistory: [],
};

export interface DashboardStats {
  modules: Record<string, ModuleHealth>;
  agentsOnline: number;
  agentsTotal: number;
  m365ActiveUsers: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aggregateScoreHistory(
  rows: { score: number | null; created_at: string | null }[],
): ScoreHistoryPoint[] {
  const dayMap = new Map<string, number>();
  for (const r of rows) {
    if (r.score == null || !r.created_at) continue;
    const day = r.created_at.slice(0, 10);
    dayMap.set(day, r.score); // last value wins (data sorted ASC)
  }
  const points: ScoreHistoryPoint[] = [];
  for (const [date, score] of dayMap) {
    points.push({ date, score });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points.slice(-30);
}


// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchDashboardStats(
  selectedWorkspaceId: string | null | undefined,
  workspaceIds: string[] | null,
): Promise<DashboardStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // ── 1. Asset counts + IDs (sequential to reduce connection pool pressure) ──
  let fwQuery = supabase.from('firewalls').select('id, client_id', { count: 'exact' });
  let m365Query = supabase.from('m365_tenants').select('id, client_id', { count: 'exact' })
    .in('connection_status', ['connected', 'partial']);
  let extQuery = supabase.from('external_domains').select('id, client_id', { count: 'exact' });
  let agentsQuery = supabase.from('agents').select('id, client_id, last_seen, revoked')
    .eq('revoked', false);

  if (selectedWorkspaceId) {
    fwQuery = fwQuery.eq('client_id', selectedWorkspaceId);
    m365Query = m365Query.eq('client_id', selectedWorkspaceId);
    extQuery = extQuery.eq('client_id', selectedWorkspaceId);
    agentsQuery = agentsQuery.eq('client_id', selectedWorkspaceId);
  } else if (workspaceIds && workspaceIds.length > 0) {
    fwQuery = fwQuery.in('client_id', workspaceIds);
    m365Query = m365Query.in('client_id', workspaceIds);
    extQuery = extQuery.in('client_id', workspaceIds);
    agentsQuery = agentsQuery.in('client_id', workspaceIds);
  }

  // Stage 1: assets + agents (max 2 parallel)
  const [fwRes, agentsRes] = await Promise.all([fwQuery, agentsQuery]);
  const [m365Res, extRes] = await Promise.all([m365Query, extQuery]);

  const agents = agentsRes.data || [];
  const agentsTotal = agents.length;
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const agentsOnline = agents.filter(a => a.last_seen && a.last_seen > fiveMinAgo).length;

  const firewallIds = (fwRes.data || []).map(f => f.id);
  const tenantIds = (m365Res.data || []).map(t => t.id);
  const extDomainIds = (extRes.data || []).map(d => d.id);

  // ── 2. Data queries in batches of 3 to reduce connection pool pressure ──
  // Batch A: Firewall + M365 history
  const [fwScoreHistoryRes, fwSummaryRes, m365HistoryRes] = await Promise.all([
    firewallIds.length > 0
      ? supabase
          .from('analysis_history')
          .select('firewall_id, score, created_at')
          .in('firewall_id', firewallIds)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    firewallIds.length > 0
      ? supabase.rpc('get_fw_dashboard_summary' as any, { p_firewall_ids: firewallIds })
      : Promise.resolve({ data: [] as any[] }),
    tenantIds.length > 0
      ? supabase
          .from('m365_posture_history')
          .select('tenant_record_id, score, summary, environment_metrics, created_at')
          .in('tenant_record_id', tenantIds)
          .eq('status', 'completed')
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // Batch B: External domain + CVE cache
  const [extScoreHistoryRes, extSummaryRes, cveCacheRes] = await Promise.all([
    extDomainIds.length > 0
      ? supabase
          .from('external_domain_analysis_history')
          .select('domain_id, score, created_at')
          .in('domain_id', extDomainIds)
          .eq('status', 'completed')
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    extDomainIds.length > 0
      ? supabase.rpc('get_ext_domain_dashboard_summary' as any, { p_domain_ids: extDomainIds })
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('cve_severity_cache').select('module_code, client_id, critical, high, medium, low'),
  ]);

  // ── 3. Process Firewall ───────────────────────────────────────────
  const fwHealth: ModuleHealth = {
    score: null,
    assetCount: fwRes.count || 0,
    lastAnalysisDate: null,
    severities: { critical: 0, high: 0, medium: 0, low: 0 },
    scoreHistory: [],
  };

  if (firewallIds.length > 0) {
    // Score history from lightweight query
    fwHealth.scoreHistory = aggregateScoreHistory(
      (fwScoreHistoryRes.data || []).map((h: any) => ({ score: h.score, created_at: h.created_at }))
    );

    // Severities + score from RPC (DISTINCT ON server-side)
    const fwSummaries = (fwSummaryRes.data || []) as any[];
    let latestDate: string | null = null;
    let latestScore: number | null = null;

    for (const s of fwSummaries) {
      if (!latestDate || s.analyzed_at > latestDate) {
        latestDate = s.analyzed_at;
        latestScore = s.score;
      }
      fwHealth.severities.critical += s.critical || 0;
      fwHealth.severities.high += s.high || 0;
      fwHealth.severities.medium += s.medium || 0;
      fwHealth.severities.low += s.low || 0;
    }

    fwHealth.score = latestScore;
    fwHealth.lastAnalysisDate = latestDate;
  }

  // ── 4. Process M365 ───────────────────────────────────────────────
  const m365Health: ModuleHealth = {
    score: null,
    assetCount: m365Res.count || 0,
    lastAnalysisDate: null,
    severities: { critical: 0, high: 0, medium: 0, low: 0 },
    scoreHistory: [],
  };

  if (tenantIds.length > 0) {
    const m365History = (m365HistoryRes.data || []) as any[];
    let latestDate: string | null = null;
    let latestScore: number | null = null;
    let totalActiveUsers = 0;

    // Com dados ASC, o ultimo registro por tenant e o mais recente
    const tenantLatest = new Map<string, any>();
    for (const h of m365History) {
      tenantLatest.set(h.tenant_record_id, h);
    }

    for (const [, h] of tenantLatest) {
      if (!latestDate || (h.created_at && h.created_at > latestDate)) {
        latestDate = h.created_at;
        if (h.score != null) latestScore = h.score;
      }
      const summary = h.summary as any;
      if (summary) {
        m365Health.severities.critical += summary.critical || 0;
        m365Health.severities.high += summary.high || 0;
        m365Health.severities.medium += summary.medium || 0;
        m365Health.severities.low += summary.low || 0;
      }
      const envMetrics = h.environment_metrics as any;
      if (envMetrics?.activeUsers != null) {
        totalActiveUsers += envMetrics.activeUsers;
      }
    }

    m365Health.score = latestScore;
    m365Health.lastAnalysisDate = latestDate;
    m365Health.scoreHistory = aggregateScoreHistory(
      m365History.map((h: any) => ({ score: h.score, created_at: h.created_at }))
    );
    m365Health.activeUsers = totalActiveUsers > 0 ? totalActiveUsers : null;
  }

  // ── 5. Process External Domain ────────────────────────────────────
  const extHealth: ModuleHealth = {
    score: null,
    assetCount: extRes.count || 0,
    lastAnalysisDate: null,
    severities: { critical: 0, high: 0, medium: 0, low: 0 },
    scoreHistory: [],
  };

  if (extDomainIds.length > 0) {
    // Score history from lightweight query
    extHealth.scoreHistory = aggregateScoreHistory(
      (extScoreHistoryRes.data || []).map((h: any) => ({ score: h.score, created_at: h.created_at }))
    );

    // Severities + score from RPC
    const extSummaries = (extSummaryRes.data || []) as any[];
    let latestDate: string | null = null;
    let latestScore: number | null = null;

    for (const s of extSummaries) {
      if (!latestDate || s.analyzed_at > latestDate) {
        latestDate = s.analyzed_at;
        if (s.score != null) latestScore = s.score;
      }
      extHealth.severities.critical += s.critical || 0;
      extHealth.severities.high += s.high || 0;
      extHealth.severities.medium += s.medium || 0;
      extHealth.severities.low += s.low || 0;
    }

    extHealth.score = latestScore;
    extHealth.lastAnalysisDate = latestDate;
  }

  // ── 6. Build modules record ───────────────────────────────────────
  const modulesRecord: Record<string, ModuleHealth> = {
    firewall: fwHealth,
    m365: m365Health,
    externalDomain: extHealth,
  };

  for (const config of Object.values(MODULE_DASHBOARD_CONFIG)) {
    if (!modulesRecord[config.statsKey]) {
      modulesRecord[config.statsKey] = { ...emptyHealth };
    }
  }

  // ── 7. CVE severity cache ─────────────────────────────────────────
  try {
    const cveCache = cveCacheRes.data;
    if (cveCache && cveCache.length > 0) {
      for (const row of cveCache) {
        const statsKey = row.module_code === 'firewall' ? 'firewall'
          : row.module_code === 'm365' ? 'm365'
          : row.module_code === 'external_domain' ? 'externalDomain'
          : null;
        if (!statsKey || !modulesRecord[statsKey]) continue;

        if ((row.module_code === 'firewall' || row.module_code === 'external_domain') && row.client_id) {
          if (selectedWorkspaceId && row.client_id !== selectedWorkspaceId) continue;
          if (workspaceIds && workspaceIds.length > 0 && !workspaceIds.includes(row.client_id)) continue;
        }

        const existing = modulesRecord[statsKey].cveSeverities || { critical: 0, high: 0, medium: 0, low: 0 };
        modulesRecord[statsKey].cveSeverities = {
          critical: existing.critical + (row.critical || 0),
          high: existing.high + (row.high || 0),
          medium: existing.medium + (row.medium || 0),
          low: existing.low + (row.low || 0),
        };
      }
    }
  } catch (cveErr) {
    console.warn('Error fetching CVE cache:', cveErr);
  }

  return {
    modules: modulesRecord,
    agentsOnline,
    agentsTotal,
    m365ActiveUsers: modulesRecord.m365?.activeUsers ?? null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboardStats(selectedWorkspaceId?: string | null) {
  const { user } = useAuth();
  const { isPreviewMode, previewTarget } = usePreview();

  const workspaceIds = isPreviewMode && previewTarget?.workspaces
    ? previewTarget.workspaces.map(w => w.id)
    : null;

  const { data: stats = null, isLoading: loading } = useQuery({
    queryKey: ['dashboard-stats', selectedWorkspaceId, isPreviewMode, workspaceIds],
    queryFn: () => fetchDashboardStats(selectedWorkspaceId, workspaceIds),
    enabled: !!user,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  return { stats, loading };
}
