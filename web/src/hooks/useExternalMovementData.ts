import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ExternalMovementAlert, ExternalMovementSeverity } from '@/types/externalMovement';

export interface ExternalMovementSummary {
  alerts: ExternalMovementAlert[];
  bySeverity: Record<ExternalMovementSeverity, ExternalMovementAlert[]>;
  totalAlerts: number;
  uniqueUsers: number;
  maxRiskScore: number;
}

export function useExternalMovementData(tenantRecordId: string | undefined) {
  return useQuery<ExternalMovementSummary>({
    queryKey: ['external-movement-alerts', tenantRecordId],
    queryFn: async () => {
      if (!tenantRecordId) throw new Error('No tenant');

      // Get alerts from last 48h
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('m365_external_movement_alerts')
        .select('*')
        .eq('tenant_record_id', tenantRecordId)
        .gte('created_at', cutoff)
        .order('risk_score', { ascending: false })
        .limit(200);

      if (error) throw error;

      const alerts = (data ?? []) as unknown as ExternalMovementAlert[];
      const bySeverity: Record<ExternalMovementSeverity, ExternalMovementAlert[]> = {
        critical: [],
        high: [],
        medium: [],
      };

      const userSet = new Set<string>();
      let maxRisk = 0;

      for (const a of alerts) {
        const sev = a.severity as ExternalMovementSeverity;
        if (bySeverity[sev]) bySeverity[sev].push(a);
        userSet.add(a.user_id);
        if (a.risk_score > maxRisk) maxRisk = a.risk_score;
      }

      return {
        alerts,
        bySeverity,
        totalAlerts: alerts.length,
        uniqueUsers: userSet.size,
        maxRiskScore: maxRisk,
      };
    },
    enabled: !!tenantRecordId,
    refetchInterval: 60_000,
  });
}

export function useBaselineMaturity(tenantRecordId: string | undefined) {
  return useQuery<number>({
    queryKey: ['baseline-maturity', tenantRecordId],
    queryFn: async () => {
      if (!tenantRecordId) return 0;
      const { data, error } = await supabase
        .from('m365_user_external_daily_stats' as any)
        .select('date')
        .eq('tenant_record_id', tenantRecordId)
        .order('date', { ascending: false })
        .limit(500) as any;

      if (error || !data) return 0;
      const uniqueDays = new Set((data as any[]).map((r: any) => r.date));
      return uniqueDays.size;
    },
    enabled: !!tenantRecordId,
    staleTime: 5 * 60_000,
  });
}
