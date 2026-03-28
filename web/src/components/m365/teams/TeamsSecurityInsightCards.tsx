import type { M365AnalyzerInsight } from '@/types/m365AnalyzerInsights';
import { SecurityInsightCards } from '@/components/m365/shared/SecurityInsightCard';

interface TeamsSecurityInsightCardsProps {
  insights: M365AnalyzerInsight[];
  loading?: boolean;
}

export function TeamsSecurityInsightCards({ insights, loading }: TeamsSecurityInsightCardsProps) {
  return <SecurityInsightCards insights={insights} loading={loading} />;
}
