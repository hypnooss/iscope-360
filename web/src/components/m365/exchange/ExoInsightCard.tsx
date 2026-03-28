import { ExchangeInsight } from '@/types/exchangeInsights';
import { UnifiedComplianceCard } from '@/components/compliance/UnifiedComplianceCard';
import { mapExchangeInsight } from '@/lib/complianceMappers';

interface ExoInsightCardProps {
  insight: ExchangeInsight;
}

export function ExoInsightCard({ insight }: ExoInsightCardProps) {
  const item = mapExchangeInsight(insight);
  return <UnifiedComplianceCard item={item} />;
}
