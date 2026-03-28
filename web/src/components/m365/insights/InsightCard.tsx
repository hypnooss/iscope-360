import { SecurityInsight } from '@/types/securityInsights';
import { UnifiedComplianceCard } from '@/components/compliance/UnifiedComplianceCard';
import { mapSecurityInsight } from '@/lib/complianceMappers';

interface InsightCardProps {
  insight: SecurityInsight;
}

export function InsightCard({ insight }: InsightCardProps) {
  const item = mapSecurityInsight(insight);
  return <UnifiedComplianceCard item={item} />;
}
