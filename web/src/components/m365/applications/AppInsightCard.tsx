import { ApplicationInsight } from '@/types/applicationInsights';
import { UnifiedComplianceCard } from '@/components/compliance/UnifiedComplianceCard';
import { mapApplicationInsight } from '@/lib/complianceMappers';

interface AppInsightCardProps {
  insight: ApplicationInsight;
}

export function AppInsightCard({ insight }: AppInsightCardProps) {
  const item = mapApplicationInsight(insight);
  return <UnifiedComplianceCard item={item} />;
}
