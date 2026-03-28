import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  M365AnalyzerSnapshot,
  M365AnalyzerInsight,
  M365AnalyzerSummary,
  M365AnalyzerMetrics,
} from '@/types/m365AnalyzerInsights';

const defaultMetrics: M365AnalyzerMetrics = {
  phishing: { totalBlocked: 0, quarantined: 0, topAttackedUsers: [], topSenderDomains: [] },
  mailbox: { totalMailboxes: 0, above80Pct: 0, above90Pct: 0, topMailboxes: [] },
  behavioral: { anomalousUsers: 0, deviations: [] },
  compromise: { suspiciousLogins: 0, correlatedAlerts: 0, topRiskUsers: [] },
  rules: { externalForwards: 0, autoDelete: 0, suspiciousRules: [] },
  exfiltration: { highVolumeExternal: 0, topExternalDomains: [] },
  operational: { smtpAuthEnabled: 0, legacyProtocols: 0, inactiveWithActivity: 0, fullAccessGrants: 0 },
  securityRisk: { highRiskSignIns: 0, mfaFailures: 0, impossibleTravel: 0, blockedAccounts: 0, riskyUsers: 0 },
  identity: { newUsers: 0, disabledUsers: 0, noMfaUsers: 0, noConditionalAccess: 0, serviceAccountInteractive: 0, recentAppRegistrations: 0 },
  conditionalAccess: { disabledPolicies: 0, reportOnlyPolicies: 0, excludedUsers: 0, recentlyCreated: 0 },
  exchangeHealth: { serviceIncidents: 0, messageTraceFailures: 0, sharedMailboxesNoOwner: 0, connectorFailures: 0 },
  audit: { mailboxAuditAlerts: 0, adminAuditChanges: 0, newDelegations: 0, activeEdiscovery: 0 },
  threatProtection: {
    spamBlocked: 0, phishingDetected: 0, malwareBlocked: 0, quarantined: 0,
    totalDelivered: 0, totalFiltered: 0,
    topSpamSenderDomains: [], topPhishingTargets: [], topMalwareSenders: [], topSpamRecipients: [],
    deliveryBreakdown: [],
    policyStatus: { antiSpam: 'disabled', antiPhish: 'disabled', safeLinks: 'disabled', safeAttach: 'disabled', malwareFilter: 'disabled' },
  },
};

function safeArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? val : [];
}

function safeNum(val: unknown): number {
  return typeof val === 'number' ? val : 0;
}

function parseMetrics(raw: unknown): M365AnalyzerMetrics {
  if (!raw || typeof raw !== 'object') return { ...defaultMetrics };
  const m = raw as Record<string, any>;

  const ph = m.phishing ?? {};
  const mb = m.mailbox ?? {};
  const bh = m.behavioral ?? {};
  const co = m.compromise ?? {};
  const ru = m.rules ?? {};
  const ex = m.exfiltration ?? {};
  const op = m.operational ?? {};
  const sr = m.securityRisk ?? m.security_risk ?? {};
  const id = m.identity ?? m.identity_access ?? {};
  const ca = m.conditionalAccess ?? m.conditional_access ?? {};
  const eh = m.exchangeHealth ?? m.exchange_health ?? {};
  const au = m.audit ?? m.audit_compliance ?? {};
  const tp = m.threatProtection ?? m.threat_protection ?? {};

  return {
    phishing: {
      totalBlocked: safeNum(ph.totalBlocked ?? ph.totalPhishing),
      quarantined: safeNum(ph.quarantined),
      topAttackedUsers: safeArray(ph.topAttackedUsers),
      topSenderDomains: safeArray(ph.topSenderDomains),
    },
    mailbox: {
      totalMailboxes: safeNum(mb.totalMailboxes),
      above80Pct: safeNum(mb.above80Pct ?? mb.above80),
      above90Pct: safeNum(mb.above90Pct ?? mb.above90),
      topMailboxes: safeArray(mb.topMailboxes),
    },
    behavioral: {
      anomalousUsers: safeNum(bh.anomalousUsers),
      deviations: safeArray(bh.deviations),
    },
    compromise: {
      suspiciousLogins: safeNum(co.suspiciousLogins ?? co.suspiciousSignIns),
      correlatedAlerts: safeNum(co.correlatedAlerts ?? co.potentiallyCompromised),
      topRiskUsers: safeArray(co.topRiskUsers),
    },
    rules: {
      externalForwards: safeNum(ru.externalForwards ?? ru.suspiciousRules),
      autoDelete: safeNum(ru.autoDelete),
      suspiciousRules: safeArray(ru.suspiciousRules),
    },
    exfiltration: {
      highVolumeExternal: safeNum(ex.highVolumeExternal ?? ex.exfiltrationRisk),
      topExternalDomains: safeArray(ex.topExternalDomains),
    },
    operational: {
      smtpAuthEnabled: safeNum(op.smtpAuthEnabled),
      legacyProtocols: safeNum(op.legacyProtocols ?? op.legacyAuthUsers),
      inactiveWithActivity: safeNum(op.inactiveWithActivity),
      fullAccessGrants: safeNum(op.fullAccessGrants),
    },
    securityRisk: {
      highRiskSignIns: safeNum(sr.highRiskSignIns),
      mfaFailures: safeNum(sr.mfaFailures),
      impossibleTravel: safeNum(sr.impossibleTravel),
      blockedAccounts: safeNum(sr.blockedAccounts),
      riskyUsers: safeNum(sr.riskyUsers),
    },
    identity: {
      newUsers: safeNum(id.newUsers),
      disabledUsers: safeNum(id.disabledUsers),
      noMfaUsers: safeNum(id.noMfaUsers),
      noConditionalAccess: safeNum(id.noConditionalAccess),
      serviceAccountInteractive: safeNum(id.serviceAccountInteractive),
      recentAppRegistrations: safeNum(id.recentAppRegistrations),
    },
    conditionalAccess: {
      disabledPolicies: safeNum(ca.disabledPolicies),
      reportOnlyPolicies: safeNum(ca.reportOnlyPolicies),
      excludedUsers: safeNum(ca.excludedUsers),
      recentlyCreated: safeNum(ca.recentlyCreated),
    },
    exchangeHealth: {
      serviceIncidents: safeNum(eh.serviceIncidents),
      messageTraceFailures: safeNum(eh.messageTraceFailures),
      sharedMailboxesNoOwner: safeNum(eh.sharedMailboxesNoOwner),
      connectorFailures: safeNum(eh.connectorFailures),
    },
    audit: {
      mailboxAuditAlerts: safeNum(au.mailboxAuditAlerts),
      adminAuditChanges: safeNum(au.adminAuditChanges),
      newDelegations: safeNum(au.newDelegations),
      activeEdiscovery: safeNum(au.activeEdiscovery),
    },
    threatProtection: {
      spamBlocked: safeNum(tp.spamBlocked),
      phishingDetected: safeNum(tp.phishingDetected),
      malwareBlocked: safeNum(tp.malwareBlocked),
      quarantined: safeNum(tp.quarantined),
      totalDelivered: safeNum(tp.totalDelivered),
      totalFiltered: safeNum(tp.totalFiltered),
      topSpamSenderDomains: safeArray(tp.topSpamSenderDomains),
      topPhishingTargets: safeArray(tp.topPhishingTargets),
      topMalwareSenders: safeArray(tp.topMalwareSenders),
      topSpamRecipients: safeArray(tp.topSpamRecipients),
      deliveryBreakdown: safeArray(tp.deliveryBreakdown),
      policyStatus: {
        antiSpam: tp.policyStatus?.antiSpam ?? 'disabled',
        antiPhish: tp.policyStatus?.antiPhish ?? 'disabled',
        safeLinks: tp.policyStatus?.safeLinks ?? 'disabled',
        safeAttach: tp.policyStatus?.safeAttach ?? 'disabled',
        malwareFilter: tp.policyStatus?.malwareFilter ?? 'disabled',
      },
    },
    emailTraffic: (() => {
      const et = m.emailTraffic ?? m.email_traffic;
      if (!et) return undefined;
      return {
        sent: safeNum(et.sent),
        received: safeNum(et.received),
        totalMessages: safeNum(et.totalMessages),
      };
    })(),
    emailTrafficRankings: (() => {
      const etr = m.emailTrafficRankings ?? m.email_traffic_rankings;
      if (!etr) return undefined;
      return {
        topSenders: safeArray(etr.topSenders),
        topRecipients: safeArray(etr.topRecipients),
        topDestinationDomains: safeArray(etr.topDestinationDomains),
        topSourceDomains: safeArray(etr.topSourceDomains),
      };
    })(),
    mailboxRankings: (() => {
      const mbr = m.mailboxRankings ?? m.mailbox_rankings;
      if (!mbr) return undefined;
      return {
        topForwarding: safeArray(mbr.topForwarding),
        topInactive: safeArray(mbr.topInactive),
        topOverQuota: safeArray(mbr.topOverQuota),
      };
    })(),
  };
}

function parseSnapshot(row: Record<string, unknown>): M365AnalyzerSnapshot {
  const rawSummary = (row.summary ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 }) as unknown as M365AnalyzerSummary;
  const insights = (Array.isArray(row.insights) ? row.insights : []) as unknown as M365AnalyzerInsight[];
  const metrics = parseMetrics(row.metrics);

  return {
    id: row.id as string,
    tenant_record_id: row.tenant_record_id as string,
    client_id: row.client_id as string,
    agent_task_id: (row.agent_task_id as string) ?? undefined,
    status: (row.status as M365AnalyzerSnapshot['status']) ?? 'pending',
    period_start: (row.period_start as string) ?? undefined,
    period_end: (row.period_end as string) ?? undefined,
    score: (row.score as number) ?? undefined,
    summary: rawSummary,
    insights,
    metrics,
    created_at: row.created_at as string,
  };
}

function deduplicateInsights(insights: M365AnalyzerInsight[]): M365AnalyzerInsight[] {
  // Group by category::name to merge identical incident types into single cards
  const grouped = new Map<string, M365AnalyzerInsight>();

  for (const ins of insights) {
    const key = `${ins.category}::${ins.name}`;
    const existing = grouped.get(key);

    if (!existing) {
      // Clone to avoid mutating original
      grouped.set(key, {
        ...ins,
        affectedUsers: ins.affectedUsers ? [...ins.affectedUsers] : undefined,
        count: ins.count ?? (ins.affectedUsers?.length || 0),
      });
    } else {
      // Merge affected users (deduplicated)
      if (ins.affectedUsers?.length) {
        const existingUsers = new Set(existing.affectedUsers || []);
        for (const u of ins.affectedUsers) existingUsers.add(u);
        existing.affectedUsers = Array.from(existingUsers);
      }
      // Sum counts
      existing.count = (existing.count || 0) + (ins.count ?? (ins.affectedUsers?.length || 1));
      // Keep highest severity
      const sevOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      if ((sevOrder[ins.severity] ?? 0) > (sevOrder[existing.severity] ?? 0)) {
        existing.severity = ins.severity;
      }
      // Merge metadata
      if (ins.metadata) {
        existing.metadata = { ...existing.metadata, ...ins.metadata };
      }
    }
  }

  return Array.from(grouped.values());
}

export interface ScoreHistoryPoint {
  date: string;
  score: number;
}

function mergeRankingArrays(
  snapshots: M365AnalyzerSnapshot[],
  path: string[],
  labelField: string,
  top = 10,
): any[] {
  const map = new Map<string, any>();
  for (const s of snapshots) {
    let obj: any = s.metrics;
    for (const k of path) obj = obj?.[k];
    if (!Array.isArray(obj)) continue;
    for (const item of obj) {
      const key = String(item[labelField] ?? '').toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...item, count: item.count ?? 1 });
      } else {
        existing.count = (existing.count ?? 0) + (item.count ?? 1);
      }
    }
  }
  return Array.from(map.values())
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, top);
}

function aggregateThreatProtection(snapshots: M365AnalyzerSnapshot[]): M365AnalyzerMetrics['threatProtection'] {
  const base = snapshots[0]?.metrics?.threatProtection ?? defaultMetrics.threatProtection;

  let spamBlocked = 0, phishingDetected = 0, malwareBlocked = 0, quarantined = 0, totalDelivered = 0, totalFiltered = 0;
  for (const s of snapshots) {
    const tp = s.metrics?.threatProtection;
    if (!tp) continue;
    spamBlocked += tp.spamBlocked ?? 0;
    phishingDetected += tp.phishingDetected ?? 0;
    malwareBlocked += tp.malwareBlocked ?? 0;
    quarantined += tp.quarantined ?? 0;
    totalDelivered += tp.totalDelivered ?? 0;
    totalFiltered += tp.totalFiltered ?? 0;
  }

  return {
    spamBlocked,
    phishingDetected,
    malwareBlocked,
    quarantined,
    totalDelivered,
    totalFiltered,
    topSpamSenderDomains: mergeRankingArrays(snapshots, ['threatProtection', 'topSpamSenderDomains'], 'domain'),
    topPhishingTargets: mergeRankingArrays(snapshots, ['threatProtection', 'topPhishingTargets'], 'user'),
    topMalwareSenders: mergeRankingArrays(snapshots, ['threatProtection', 'topMalwareSenders'], 'domain'),
    topSpamRecipients: mergeRankingArrays(snapshots, ['threatProtection', 'topSpamRecipients'], 'user'),
    deliveryBreakdown: base.deliveryBreakdown,
    policyStatus: base.policyStatus,
  };
}

function aggregateSnapshots(snapshots: M365AnalyzerSnapshot[]): M365AnalyzerSnapshot & { snapshotCount: number; scoreHistory: ScoreHistoryPoint[] } | null {
  if (!snapshots.length) return null;

  const latest = snapshots[0];
  const oldest = snapshots[snapshots.length - 1];

  const summary: M365AnalyzerSummary = snapshots.reduce(
    (acc, s) => ({
      critical: acc.critical + (s.summary?.critical ?? 0),
      high: acc.high + (s.summary?.high ?? 0),
      medium: acc.medium + (s.summary?.medium ?? 0),
      low: acc.low + (s.summary?.low ?? 0),
      info: acc.info + (s.summary?.info ?? 0),
    }),
    { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  );

  // Use latest metrics as base but aggregate threatProtection and emailTraffic across all snapshots
  const aggregatedEmailTraffic = (() => {
    let sent = 0, received = 0, totalMessages = 0;
    for (const s of snapshots) {
      const et = s.metrics?.emailTraffic;
      if (et) {
        sent += et.sent ?? 0;
        received += et.received ?? 0;
        totalMessages += et.totalMessages ?? 0;
      }
    }
    return { sent, received, totalMessages };
  })();

  const metrics: M365AnalyzerMetrics = {
    ...latest.metrics,
    threatProtection: aggregateThreatProtection(snapshots),
    emailTraffic: aggregatedEmailTraffic,
  };

  const scoreHistory: ScoreHistoryPoint[] = snapshots
    .filter(s => s.score != null)
    .map(s => ({ date: s.created_at, score: s.score! }))
    .reverse();

  return {
    ...latest,
    period_start: oldest.period_start ?? latest.period_start,
    period_end: latest.period_end,
    summary,
    insights: deduplicateInsights(snapshots.flatMap(s => s.insights ?? [])),
    metrics,
    snapshotCount: snapshots.length,
    scoreHistory,
  };
}

export function useLatestM365AnalyzerSnapshot(tenantRecordId?: string) {
  return useQuery({
    queryKey: ['m365-analyzer-latest', tenantRecordId],
    queryFn: async () => {
      if (!tenantRecordId) return null;

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('m365_analyzer_snapshots' as any)
        .select('id, tenant_record_id, client_id, agent_task_id, status, period_start, period_end, score, summary, metrics, created_at')
        .eq('tenant_record_id', tenantRecordId)
        .eq('status', 'completed')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false }) as any;

      if (error) throw error;
      const rows = (data as any[]) || [];
      if (rows.length === 0) return null;

      const snapshots = rows.map((r) => parseSnapshot(r as Record<string, unknown>));
      const aggregated = aggregateSnapshots(snapshots);
      if (!aggregated) return null;

      // Load insights only from the latest snapshot
      const { data: latestInsightsData } = await supabase
        .from('m365_analyzer_snapshots' as any)
        .select('insights')
        .eq('id', rows[0].id)
        .single() as any;

      const rawInsights = Array.isArray(latestInsightsData?.insights) ? latestInsightsData.insights : [];
      aggregated.insights = deduplicateInsights(rawInsights as M365AnalyzerInsight[]);

      // Store snapshot IDs for diff
      (aggregated as any)._snapshotIds = rows.map((r: any) => r.id);

      return aggregated;
    },
    enabled: !!tenantRecordId,
    staleTime: 1000 * 30,
  });
}

export interface SnapshotDiffResult {
  newCount: number;
  resolvedCount: number;
  escalatedCount: number;
}

export function useM365AnalyzerDiff(tenantRecordId?: string, latestSnapshotData?: any) {
  const snapshotIds: string[] = latestSnapshotData?._snapshotIds ?? [];
  const secondId = snapshotIds.length >= 2 ? snapshotIds[1] : undefined;

  return useQuery<SnapshotDiffResult | null>({
    queryKey: ['m365-analyzer-diff', secondId],
    queryFn: async () => {
      if (!secondId) return null;

      const { data } = await supabase
        .from('m365_analyzer_snapshots' as any)
        .select('insights')
        .eq('id', secondId)
        .single() as any;

      const prevInsights = Array.isArray(data?.insights) ? (data.insights as M365AnalyzerInsight[]) : [];
      const currentInsights = latestSnapshotData?.insights ?? [];

      const prevKeys = new Set<string>(prevInsights.map((i: any) => `${i.category}::${i.name}`));
      const currKeys = new Set<string>(currentInsights.map((i: any) => `${i.category}::${i.name}`));
      const prevSevMap = new Map<string, string>(prevInsights.map((i: any) => [`${i.category}::${i.name}`, i.severity] as [string, string]));

      let newCount = 0;
      let resolvedCount = 0;
      let escalatedCount = 0;
      const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

      currKeys.forEach((key) => {
        if (!prevKeys.has(key)) newCount++;
        else {
          const prevSev = prevSevMap.get(key);
          const curr = currentInsights.find((i: any) => `${i.category}::${i.name}` === key);
          if (curr && prevSev && (sevOrder[curr.severity] ?? 0) > (sevOrder[prevSev] ?? 0)) escalatedCount++;
        }
      });
      prevKeys.forEach((key) => {
        if (!currKeys.has(key)) resolvedCount++;
      });

      return { newCount, resolvedCount, escalatedCount };
    },
    enabled: !!secondId && !!latestSnapshotData?.insights,
    staleTime: 1000 * 60,
  });
}

export function useM365AnalyzerProgress(tenantRecordId?: string) {
  return useQuery({
    queryKey: ['m365-analyzer-progress', tenantRecordId],
    queryFn: async () => {
      if (!tenantRecordId) return null;
      const { data } = await supabase
        .from('m365_analyzer_snapshots' as any)
        .select('id, status, created_at, agent_task_id')
        .eq('tenant_record_id', tenantRecordId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as any;

      if (!data) return null;
      const snap = data as any;
      if (snap.status === 'completed' || snap.status === 'failed' || snap.status === 'cancelled') {
        return { status: snap.status as string, elapsed: null as number | null };
      }

      if (snap.agent_task_id && (snap.status === 'pending' || snap.status === 'processing')) {
        const { data: taskData } = await supabase
          .from('agent_tasks')
          .select('status')
          .eq('id', snap.agent_task_id)
          .maybeSingle();

        const taskStatus = (taskData as any)?.status;
        if (taskStatus && ['completed', 'failed', 'timeout', 'cancelled'].includes(taskStatus)) {
          await supabase
            .from('m365_analyzer_snapshots' as any)
            .update({ status: 'failed', metrics: { recovered_reason: `orphan_task_${taskStatus}` } })
            .eq('id', snap.id);
          return { status: 'failed' as string, elapsed: null as number | null, snapshotId: snap.id as string, wasOrphan: true };
        }
      }

      const elapsed = Math.floor((Date.now() - new Date(snap.created_at).getTime()) / 1000);
      return { status: snap.status as string, elapsed, snapshotId: snap.id as string };
    },
    enabled: !!tenantRecordId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'processing') return 5000;
      return 30000;
    },
    staleTime: 5000,
  });
}
