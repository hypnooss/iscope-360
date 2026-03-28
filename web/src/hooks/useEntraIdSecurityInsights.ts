import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SecurityInsight, InsightsSummary } from '@/types/securityInsights';

interface UseEntraIdSecurityInsightsOptions {
  tenantRecordId: string | null;
  dateRange?: { from: Date; to: Date };
}

interface UseEntraIdSecurityInsightsResult {
  insights: SecurityInsight[];
  summary: InsightsSummary;
  analyzedPeriod: { from: string; to: string } | null;
  analyzedAt: string | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  refresh: () => Promise<void>;
  triggerAnalysis: () => Promise<{ success: boolean; analysisId?: string }>;
}

const defaultSummary: InsightsSummary = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
  total: 0,
};

export function useEntraIdSecurityInsights({
  tenantRecordId,
}: UseEntraIdSecurityInsightsOptions): UseEntraIdSecurityInsightsResult {
  const [insights, setInsights] = useState<SecurityInsight[]>([]);
  const [summary, setSummary] = useState<InsightsSummary>(defaultSummary);
  const [analyzedPeriod, setAnalyzedPeriod] = useState<{ from: string; to: string } | null>(null);
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

      // Filter insights related to Entra ID Security
      const allInsights = (data.insights as any[]) || [];
      
      const entraIdCategories = [
        'identity_security',
        'behavior_risk',
        'governance',
        'identities',
        'authentication',
        'privileges',
      ];

      const securityInsights: SecurityInsight[] = allInsights.filter(
        (insight: any) =>
          entraIdCategories.includes(insight.category) ||
          insight.product === 'entra_id' ||
          insight.product === 'identity'
      );

      // Calculate summary based on severity and affectedCount
      const calculatedSummary: InsightsSummary = {
        critical: securityInsights.filter(i => i.severity === 'critical' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        high: securityInsights.filter(i => i.severity === 'high' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        medium: securityInsights.filter(i => i.severity === 'medium' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        low: securityInsights.filter(i => i.severity === 'low' && (i.affectedCount > 0 || (i as any).status === 'fail')).length,
        info: securityInsights.filter(i => i.severity === 'info').length,
        total: securityInsights.length,
      };

      setInsights(securityInsights);
      setSummary(calculatedSummary);
      setAnalyzedAt(data.completed_at);
      
      // Set analyzed period based on completed_at
      if (data.completed_at) {
        const completedDate = new Date(data.completed_at);
        const fromDate = new Date(completedDate);
        fromDate.setDate(fromDate.getDate() - 30);
        setAnalyzedPeriod({
          from: fromDate.toISOString(),
          to: completedDate.toISOString(),
        });
      }
    } catch (err) {
      console.error('Error fetching Entra ID Security insights from history:', err);
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
    analyzedPeriod,
    analyzedAt,
    loading,
    error,
    errorCode,
    refresh,
    triggerAnalysis,
  };
}
