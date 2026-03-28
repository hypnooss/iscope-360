import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ExchangeDashboardData {
  mailboxes: { total: number; overQuota: number; overQuotaUsers?: { name: string; usedGB: number; quotaGB: number; usagePct: number }[]; forwardingEnabled: number; autoReplyExternal: number; newLast30d: number; notLoggedIn30d: number; notLoggedIn60d: number; notLoggedIn90d: number; inactiveUsers30?: { name: string; lastActivity: string }[]; inactiveUsers60?: { name: string; lastActivity: string }[]; inactiveUsers90?: { name: string; lastActivity: string }[] };
  traffic: { sent: number; received: number };
  trafficRankings?: { topSenders: { name: string; count: number }[]; topRecipients: { name: string; count: number }[] };
  security: { maliciousInbound: number; phishing: number; malware: number; spam: number };
  analyzedAt: string;
}

interface UseExchangeDashboardOptions {
  tenantRecordId: string | null;
}

export function useExchangeDashboard({ tenantRecordId }: UseExchangeDashboardOptions) {
  const [data, setData] = useState<ExchangeDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapToData = (cache: any, cachedAt?: string): ExchangeDashboardData => ({
    mailboxes: cache.mailboxes || { total: 0, overQuota: 0, forwardingEnabled: 0, autoReplyExternal: 0, newLast30d: 0, notLoggedIn30d: 0, notLoggedIn60d: 0, notLoggedIn90d: 0 },
    traffic: cache.traffic || { sent: 0, received: 0 },
    trafficRankings: cache.trafficRankings || undefined,
    security: cache.security || { maliciousInbound: 0, phishing: 0, malware: 0, spam: 0 },
    analyzedAt: cache.analyzedAt || cachedAt || '',
  });

  const loadCache = useCallback(async () => {
    if (!tenantRecordId) return;
    setLoading(true);
    setError(null);

    try {
      // Try loading from m365_dashboard_snapshots (new architecture)
      const { data: snapshot, error: snapError } = await supabase
        .from('m365_dashboard_snapshots')
        .select('data, created_at')
        .eq('tenant_record_id', tenantRecordId)
        .eq('dashboard_type', 'exchange')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!snapError && snapshot?.data) {
        const cache = snapshot.data as any;
        setData(mapToData(cache, snapshot.created_at));
      } else {
        // Fallback to legacy cache columns
        const { data: tenant, error: dbError } = await supabase
          .from('m365_tenants')
          .select('exchange_dashboard_cache, exchange_dashboard_cached_at')
          .eq('id', tenantRecordId)
          .single();

        if (dbError) throw new Error(dbError.message);

        if (tenant?.exchange_dashboard_cache) {
          const cache = tenant.exchange_dashboard_cache as any;
          setData(mapToData(cache, tenant.exchange_dashboard_cached_at));
        } else {
          setData(null);
        }
      }
    } catch (err) {
      console.error('useExchangeDashboard loadCache error:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [tenantRecordId]);

  const refresh = useCallback(async () => {
    if (!tenantRecordId) return;
    setRefreshing(true);
    setError(null);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('exchange-dashboard', {
        body: { tenant_record_id: tenantRecordId },
      });

      if (fnError) throw new Error(fnError.message);
      if (!result?.success) throw new Error(result?.error || 'Erro ao atualizar dashboard');

      setData(mapToData(result));
      loadCache().catch(() => {});
    } catch (err) {
      console.error('useExchangeDashboard refresh error:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setRefreshing(false);
    }
  }, [tenantRecordId, loadCache]);

  useEffect(() => {
    if (tenantRecordId) loadCache();
  }, [tenantRecordId, loadCache]);

  return { data, loading, refreshing, error, refresh };
}
