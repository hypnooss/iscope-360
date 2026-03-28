import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  M365PostureResponse, 
  M365Insight,
  M365RiskCategory,
  M365AgentInsight,
} from '@/types/m365Insights';
import { useToast } from '@/hooks/use-toast';

interface UseM365SecurityPostureOptions {
  tenantRecordId: string;
  dateFrom?: string;
  dateTo?: string;
}

interface UseM365SecurityPostureReturn {
  data: M365PostureResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  triggerAnalysis: () => Promise<{ success: boolean; analysisId?: string; agentTaskId?: string | null }>;
  getInsightsByCategory: (category: M365RiskCategory) => M365Insight[];
  getFailedInsights: () => M365Insight[];
  getCriticalInsights: () => M365Insight[];
  agentInsights: M365AgentInsight[];
  agentStatus: string | null;
  isAgentPending: boolean;
}

export const M365_POSTURE_QUERY_KEY = 'm365-security-posture';

async function fetchPostureData(
  tenantRecordId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<M365PostureResponse | null> {
  const { data: liteData, error: rpcError } = await supabase.rpc('get_posture_insights_lite', {
    p_tenant_record_id: tenantRecordId,
  });

  if (rpcError) throw new Error(rpcError.message);
  if (!liteData) return null;

  const historyRecord = liteData as any;

  return {
    success: true,
    score: historyRecord.score ?? 0,
    classification: historyRecord.classification as any ?? 'critical',
    summary: historyRecord.summary ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
    categoryBreakdown: historyRecord.category_breakdown ?? [],
    insights: historyRecord.insights ?? [],
    agentInsights: historyRecord.agent_insights ?? [],
    agentStatus: historyRecord.agent_status as M365PostureResponse['agentStatus'],
    tenant: { id: tenantRecordId, domain: '', displayName: '' },
    analyzedAt: historyRecord.completed_at ?? historyRecord.created_at ?? new Date().toISOString(),
    analyzedPeriod: { from: dateFrom ?? '', to: dateTo ?? '' },
    errors: historyRecord.errors?.errors ?? [],
    _historyId: historyRecord.id,
  };
}

export function useM365SecurityPosture({
  tenantRecordId,
  dateFrom,
  dateTo,
}: UseM365SecurityPostureOptions): UseM365SecurityPostureReturn {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: queryData,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: [M365_POSTURE_QUERY_KEY, tenantRecordId],
    queryFn: () => fetchPostureData(tenantRecordId, dateFrom, dateTo),
    enabled: !!tenantRecordId,
    staleTime: 1000 * 60 * 5,
  });

  const data = queryData ?? null;
  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Erro ao buscar postura de segurança') : (!data && !isLoading && tenantRecordId ? 'Nenhuma análise encontrada. Clique em "Executar Análise" para iniciar.' : null);

  // Trigger a new analysis (calls edge function)
  const triggerAnalysis = useCallback(async (): Promise<{ success: boolean; analysisId?: string; agentTaskId?: string | null }> => {
    if (!tenantRecordId) return { success: false };

    try {
      const { data: triggerData, error: triggerError } = await supabase.functions.invoke(
        'trigger-m365-posture-analysis',
        { body: { tenant_record_id: tenantRecordId } }
      );

      if (triggerError) throw new Error(triggerError.message || 'Erro ao disparar análise');
      if (!triggerData.success) throw new Error(triggerData.error || 'Erro desconhecido');

      console.log('[useM365SecurityPosture] Analysis triggered:', triggerData.analysis_id, 'agent_task:', triggerData.agent_task_id);
      return { success: true, analysisId: triggerData.analysis_id, agentTaskId: triggerData.agent_task_id ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao analisar postura de segurança';
      toast({ title: 'Erro na análise', description: message, variant: 'destructive' });
      return { success: false };
    }
  }, [tenantRecordId, toast]);

  const getInsightsByCategory = useCallback(
    (category: M365RiskCategory): M365Insight[] => {
      return data?.insights?.filter((i) => i.category === category) ?? [];
    },
    [data]
  );

  const getFailedInsights = useCallback((): M365Insight[] => {
    return data?.insights?.filter((i) => i.status === 'fail') ?? [];
  }, [data]);

  const getCriticalInsights = useCallback((): M365Insight[] => {
    return data?.insights?.filter((i) => i.status === 'fail' && i.severity === 'critical') ?? [];
  }, [data]);

  const agentInsights = data?.agentInsights ?? [];
  const agentStatus = data?.agentStatus ?? null;
  const isAgentPending = agentStatus === 'pending' || agentStatus === 'running';

  return {
    data,
    isLoading,
    error,
    refetch: () => refetch(),
    triggerAnalysis,
    getInsightsByCategory,
    getFailedInsights,
    getCriticalInsights,
    agentInsights,
    agentStatus,
    isAgentPending,
  };
}
