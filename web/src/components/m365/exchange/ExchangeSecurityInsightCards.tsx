import type { M365AnalyzerInsight } from '@/types/m365AnalyzerInsights';
import { SecurityInsightCards } from '@/components/m365/shared/SecurityInsightCard';

interface ExchangeSecurityInsightCardsProps {
  insights: M365AnalyzerInsight[];
  loading?: boolean;
}

export function ExchangeSecurityInsightCards({ insights, loading }: ExchangeSecurityInsightCardsProps) {
  return <SecurityInsightCards insights={insights} loading={loading} />;
}
