import type { M365AnalyzerInsight } from '@/types/m365AnalyzerInsights';
import { SecurityInsightCards } from '@/components/m365/shared/SecurityInsightCard';

interface EntraIdSecurityInsightCardsProps {
  insights: M365AnalyzerInsight[];
  loading?: boolean;
}

export function EntraIdSecurityInsightCards({ insights, loading }: EntraIdSecurityInsightCardsProps) {
  return <SecurityInsightCards insights={insights} loading={loading} />;
}
