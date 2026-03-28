import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { M365RiskCategory, M365Severity, SeveritySummary } from '@/types/m365Insights';

interface UseExchangeOnlineInsightsOptions {
  tenantRecordId: string | null;
}

/**
 * Exchange Online Insight - uses unified M365 model
 * Same structure as M365AgentInsight but with product filter
 */
export interface ExchangeInsight {
  id: string;
  category: M365RiskCategory;
  product: 'exchange_online';
  name: string;
  description: string;
  severity: M365Severity;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
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

interface UseExchangeOnlineInsightsResult {
  insights: ExchangeInsight[];
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
 * Categories relevant to Exchange Online product
 * Used to filter insights for the Exchange Online page
 */
const EXCHANGE_CATEGORIES: M365RiskCategory[] = [
  'email_exchange',      // Fluxo de email, DKIM, regras
  'threats_activity',    // Anti-phish, Safe Links, etc.
  'pim_governance',      // Remote domains, OWA policies
];

export function useExchangeOnlineInsights({
  tenantRecordId,
}: UseExchangeOnlineInsightsOptions): UseExchangeOnlineInsightsResult {
  const [insights, setInsights] = useState<ExchangeInsight[]>([]);
  const [summary, setSummary] = useState<SeveritySummary>(defaultSummary);
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
      const { data: records, error: queryError } = await supabase
        .from('m365_posture_history')
        .select('insights, agent_insights, completed_at, status')
        .eq('tenant_record_id', tenantRecordId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(5);

      if (queryError) {
        throw new Error(queryError.message);
      }

      if (!records || records.length === 0) {
        setInsights([]);
        setSummary(defaultSummary);
        setAnalyzedAt(null);
        setError('Nenhuma análise encontrada. Clique em "Reanalisar" para executar.');
        setErrorCode('NO_ANALYSIS');
        return;
      }

      // Find the most recent record that contains Exchange insights
      let data = records[0]; // fallback to most recent
      for (const record of records) {
        const combined = [
          ...((record.insights as any[]) || []),
          ...((record.agent_insights as any[]) || []),
        ];
        const hasExchange = combined.some((i: any) =>
          i.product === 'exchange_online' ||
          EXCHANGE_CATEGORIES.includes(i.category) ||
          i.id?.startsWith('exo_')
        );
        if (hasExchange) {
          data = record;
          break;
        }
      }

      // Combine all insights from the selected record
      const allInsights = [
        ...((data.insights as any[]) || []),
        ...((data.agent_insights as any[]) || []),
      ];

      // Filter insights by product OR category (for backwards compatibility)
      const exchangeInsights: ExchangeInsight[] = allInsights
        .filter((insight: any) => {
          // New model: filter by product
          if (insight.product === 'exchange_online') {
            return true;
          }
          // Fallback: filter by category for older data
          if (EXCHANGE_CATEGORIES.includes(insight.category)) {
            return true;
          }
          // Legacy: check for Exchange-related IDs
          if (insight.id?.startsWith('exo_')) {
            return true;
          }
          return false;
        })
        .map((insight: any) => {
          const category = mapLegacyCategoryToRiskCategory(insight.category);
          
          return {
            id: insight.id,
            category,
            product: 'exchange_online' as const,
            name: insight.name || insight.title || '',
            description: insight.description || '',
            severity: insight.severity || 'info',
            status: mapStatusToUnified(insight.status),
            details: insight.details || '',
            recommendation: insight.recommendation || '',
            affectedEntities: insight.affectedEntities || [],
            rawData: insight.rawData || {},
            detectedAt: data.completed_at || new Date().toISOString(),
            // Static rule metadata
            criteria: insight.criteria || '',
            passDescription: insight.passDescription || '',
            failDescription: insight.failDescription || '',
            notFoundDescription: insight.notFoundDescription || '',
            technicalRisk: insight.technicalRisk || '',
            businessImpact: insight.businessImpact || '',
            apiEndpoint: insight.apiEndpoint || '',
          };
        });

      // Calculate summary based on severity
      const calculatedSummary: SeveritySummary = {
        critical: exchangeInsights.filter(i => i.severity === 'critical').length,
        high: exchangeInsights.filter(i => i.severity === 'high').length,
        medium: exchangeInsights.filter(i => i.severity === 'medium').length,
        low: exchangeInsights.filter(i => i.severity === 'low').length,
        info: exchangeInsights.filter(i => i.severity === 'info').length,
        total: exchangeInsights.length,
      };

      setInsights(exchangeInsights);
      setSummary(calculatedSummary);
      setAnalyzedAt(data.completed_at);
    } catch (err) {
      console.error('Error fetching Exchange Online insights from history:', err);
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
        { body: { tenant_record_id: tenantRecordId, scope: 'exchange_online' } }
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

/**
 * Maps legacy category names to M365RiskCategory
 */
function mapLegacyCategoryToRiskCategory(category: string): M365RiskCategory {
  const mapping: Record<string, M365RiskCategory> = {
    // Legacy Exchange categories
    'email': 'email_exchange',
    'mail_flow': 'email_exchange',
    'mailbox_access': 'email_exchange',
    'security_hygiene': 'email_exchange',
    // Threats
    'threats': 'threats_activity',
    'security_policies': 'threats_activity',
    // Governance
    'governance': 'pim_governance',
    // Already correct categories pass through
    'email_exchange': 'email_exchange',
    'threats_activity': 'threats_activity',
    'pim_governance': 'pim_governance',
  };

  return mapping[category] || 'email_exchange';
}

/**
 * Maps status to unified format
 */
function mapStatusToUnified(status: string): 'pass' | 'fail' | 'warn' | 'unknown' {
  const statusMap: Record<string, 'pass' | 'fail' | 'warn' | 'unknown'> = {
    'pass': 'pass',
    'fail': 'fail',
    'warn': 'warn',
    'warning': 'warn',
    'unknown': 'unknown',
  };
  return statusMap[status] || 'unknown';
}
