import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ApplicationInsight, AppInsightsSummary } from '@/types/applicationInsights';

interface UseEntraIdApplicationInsightsOptions {
  tenantRecordId: string | null;
}

interface UseEntraIdApplicationInsightsResult {
  insights: ApplicationInsight[];
  summary: AppInsightsSummary;
  analyzedAt: string | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  refresh: () => Promise<void>;
  triggerAnalysis: () => Promise<{ success: boolean; analysisId?: string }>;
}

const defaultSummary: AppInsightsSummary = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
  total: 0,
  expiredCredentials: 0,
  expiringIn30Days: 0,
  privilegedApps: 0,
};

export function useEntraIdApplicationInsights({
  tenantRecordId,
}: UseEntraIdApplicationInsightsOptions): UseEntraIdApplicationInsightsResult {
  const [insights, setInsights] = useState<ApplicationInsight[]>([]);
  const [summary, setSummary] = useState<AppInsightsSummary>(defaultSummary);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Fetch latest analysis from history (no API call)
  const refresh = useCallback(async () => {
    if (!tenantRecordId) {
      setError('Tenant não selecionado');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      // Use RPC to get insights without full affectedEntities
      const { data: liteData, error: rpcError } = await supabase.rpc('get_posture_insights_lite', {
        p_tenant_record_id: tenantRecordId,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      if (!liteData) {
        setInsights([]);
        setSummary(defaultSummary);
        setAnalyzedAt(null);
        setError('Nenhuma análise encontrada. Clique em "Reanalisar" para executar.');
        setErrorCode('NO_ANALYSIS');
        return;
      }

      const data = liteData as any;

      // Filter insights related to Applications
      const allInsights = (data.insights as any[]) || [];
      
      const appCategories = [
        'credential_expiration',
        'privileged_permissions',
        'security_hygiene',
        'applications',
      ];

      const appInsights: ApplicationInsight[] = allInsights.filter(
        (insight: any) =>
          appCategories.includes(insight.category) ||
          insight.product === 'applications' ||
          insight.product === 'apps'
      );

      // Calculate summary based on severity and affectedCount
      const calculatedSummary: AppInsightsSummary = {
        critical: appInsights.filter(i => i.severity === 'critical' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        high: appInsights.filter(i => i.severity === 'high' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        medium: appInsights.filter(i => i.severity === 'medium' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        low: appInsights.filter(i => i.severity === 'low' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        info: appInsights.filter(i => i.severity === 'info').length,
        total: appInsights.length,
        expiredCredentials: appInsights.filter(i => i.category === 'credential_expiration' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        expiringIn30Days: appInsights.filter(i => i.category === 'credential_expiration' && i.severity === 'medium').length,
        privilegedApps: appInsights.filter(i => i.category === 'privileged_permissions').length,
      };

      setInsights(appInsights);
      setSummary(calculatedSummary);
      setAnalyzedAt(data.completed_at);
    } catch (err) {
      console.error('Error fetching Application insights from history:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar insights');
      setInsights([]);
      setSummary(defaultSummary);
    } finally {
      setLoading(false);
    }
  }, [tenantRecordId]);

  // Trigger a new analysis (calls edge function)
  const triggerAnalysis = useCallback(async (): Promise<{ success: boolean; analysisId?: string }> => {
    if (!tenantRecordId) {
      setError('Tenant não selecionado');
      return { success: false };
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'trigger-m365-posture-analysis',
        { body: { tenant_record_id: tenantRecordId } }
      );

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao disparar análise');
      }

      // Poll for completion
      const analysisId = data.analysis_id;
      let attempts = 0;
      const maxAttempts = 60;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: historyRecord } = await supabase
          .from('m365_posture_history')
          .select('status')
          .eq('id', analysisId)
          .single();

        if (historyRecord?.status === 'completed' || historyRecord?.status === 'failed') {
          break;
        }
        attempts++;
      }

      // Refetch to get latest data
      await refresh();
      return { success: true, analysisId };
    } catch (err) {
      console.error('Error triggering analysis:', err);
      setError(err instanceof Error ? err.message : 'Erro ao disparar análise');
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [tenantRecordId, refresh]);

  // Auto-fetch when tenant changes
  useEffect(() => {
    if (tenantRecordId) {
      refresh();
    }
  }, [tenantRecordId, refresh]);

  return {
    insights,
    summary,
    analyzedAt,
    loading,
    error,
    errorCode,
    refresh,
    triggerAnalysis,
  };
}
