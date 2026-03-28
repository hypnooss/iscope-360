import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { M365RiskCategory, M365Severity, SeveritySummary } from '@/types/m365Insights';

interface UseEntraIdInsightsOptions {
  tenantRecordId: string | null;
}

/**
 * Entra ID Insight - uses unified M365 model
 * Same structure as M365AgentInsight but with product filter for entra_id
 */
export interface EntraIdInsight {
  id: string;
  category: M365RiskCategory;
  product: 'entra_id';
  name: string;
  description: string;
  severity: M365Severity;
  status: 'pass' | 'fail' | 'warn' | 'not_found' | 'unknown';
  details?: string;
  recommendation?: string;
  affectedEntities?: Array<{ name: string; type: string; details?: string }>;
  rawData?: Record<string, unknown>;
  detectedAt: string;
  // Static rule metadata
  criteria?: string;
  passDescription?: string;
  failDescription?: string;
  notFoundDescription?: string;
  technicalRisk?: string;
  businessImpact?: string;
  apiEndpoint?: string;
}

interface UseEntraIdInsightsResult {
  insights: EntraIdInsight[];
  summary: SeveritySummary;
  analyzedAt: string | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  refresh: () => Promise<void>;
  triggerAnalysis: () => Promise<{ success: boolean; analysisId?: string }>;
}

const defaultSummary: SeveritySummary = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  info: 0,
  total: 0,
};

/**
 * Categories relevant to Entra ID product
 */
const ENTRA_ID_CATEGORIES: M365RiskCategory[] = [
  'identities',
  'auth_access',
  'admin_privileges',
  'apps_integrations',
];

export function useEntraIdInsights({
  tenantRecordId,
}: UseEntraIdInsightsOptions): UseEntraIdInsightsResult {
  const [insights, setInsights] = useState<EntraIdInsight[]>([]);
  const [summary, setSummary] = useState<SeveritySummary>(defaultSummary);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

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

      const record = liteData as any;

      const allInsights = [
        ...((record.insights as any[]) || []),
        ...((record.agent_insights as any[]) || []),
      ];

      // Filter insights by product OR category for Entra ID
      const entraIdInsights: EntraIdInsight[] = allInsights
        .filter((insight: any) => {
          if (insight.product === 'entra_id') return true;
          if (ENTRA_ID_CATEGORIES.includes(insight.category)) return true;
          // Legacy: check for Entra ID-related ID prefixes
          if (insight.id?.startsWith('IDT-') || insight.id?.startsWith('AUT-') ||
              insight.id?.startsWith('ADM-') || insight.id?.startsWith('APP-')) {
            return true;
          }
          return false;
        })
        .map((insight: any) => {
          const category = mapLegacyCategoryToRiskCategory(insight.category);
          return {
            id: insight.id,
            category,
            product: 'entra_id' as const,
            name: insight.name || insight.titulo || insight.title || '',
            description: insight.description || insight.descricaoExecutiva || '',
            severity: insight.severity || 'info',
            status: mapStatusToUnified(insight.status),
            details: insight.details || insight.descricaoExecutiva || '',
            recommendation: insight.recommendation || insight.remediacao?.passosDetalhados?.join(' ') || '',
            affectedEntities: (insight._entitiesPreview || []).map((name: string) => ({
              name: name || '',
              type: '',
            })),
            rawData: insight.rawData || {},
            detectedAt: record.completed_at || new Date().toISOString(),
            criteria: insight.criteria || '',
            passDescription: insight.passDescription || '',
            failDescription: insight.failDescription || '',
            notFoundDescription: insight.notFoundDescription || '',
            technicalRisk: insight.technicalRisk || insight.riscoTecnico || '',
            businessImpact: insight.businessImpact || insight.impactoNegocio || '',
            apiEndpoint: insight.apiEndpoint || insight.endpointUsado || '',
          };
        });

      const calculatedSummary: SeveritySummary = {
        critical: entraIdInsights.filter(i => i.severity === 'critical').length,
        high: entraIdInsights.filter(i => i.severity === 'high').length,
        medium: entraIdInsights.filter(i => i.severity === 'medium').length,
        low: entraIdInsights.filter(i => i.severity === 'low').length,
        info: entraIdInsights.filter(i => i.severity === 'info').length,
        total: entraIdInsights.length,
      };

      setInsights(entraIdInsights);
      setSummary(calculatedSummary);
      setAnalyzedAt(record.completed_at);
    } catch (err) {
      console.error('Error fetching Entra ID insights from history:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar insights');
      setInsights([]);
      setSummary(defaultSummary);
    } finally {
      setLoading(false);
    }
  }, [tenantRecordId]);

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
        { body: { tenant_record_id: tenantRecordId, scope: 'entra_id' } }
      );

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Erro ao disparar análise');

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

      await refresh();
      return { success: true, analysisId };
    } catch (err) {
      console.error('Error triggering Entra ID analysis:', err);
      setError(err instanceof Error ? err.message : 'Erro ao disparar análise');
      return { success: false };
    } finally {
      setLoading(false);
    }
  }, [tenantRecordId, refresh]);

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

function mapLegacyCategoryToRiskCategory(category: string): M365RiskCategory {
  const mapping: Record<string, M365RiskCategory> = {
    // Legacy Entra ID categories
    'identity': 'identities',
    'authentication': 'auth_access',
    'access': 'auth_access',
    'admin': 'admin_privileges',
    'privileges': 'admin_privileges',
    'applications': 'apps_integrations',
    'integrations': 'apps_integrations',
    // Already correct
    'identities': 'identities',
    'auth_access': 'auth_access',
    'admin_privileges': 'admin_privileges',
    'apps_integrations': 'apps_integrations',
  };
  return mapping[category] || 'identities';
}

function mapStatusToUnified(status: string): 'pass' | 'fail' | 'warn' | 'not_found' | 'unknown' {
  const statusMap: Record<string, 'pass' | 'fail' | 'warn' | 'not_found' | 'unknown'> = {
    'pass': 'pass',
    'fail': 'fail',
    'warn': 'warn',
    'warning': 'warn',
    'not_found': 'not_found',
    'unknown': 'unknown',
  };
  return statusMap[status] || 'unknown';
}
