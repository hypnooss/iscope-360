/**
 * @deprecated Use UnifiedComplianceCard with mapComplianceCheck instead.
 * This file is kept as a thin wrapper for backwards compatibility.
 */
import { ComplianceCheck } from '@/types/compliance';
import { UnifiedComplianceCard } from '@/components/compliance/UnifiedComplianceCard';
import { mapComplianceCheck } from '@/lib/complianceMappers';

interface ComplianceCardProps {
  check: ComplianceCheck;
  onClick?: () => void;
  /** UI variant to specialize behavior per report type */
  variant?: 'default' | 'external_domain';
  /** Category color key for hover effects (e.g., "sky-500", "purple-500") */
  categoryColorKey?: string;
}

export function ComplianceCard({ check, categoryColorKey, onClick }: ComplianceCardProps) {
  const item = mapComplianceCheck(check);
  return (
    <UnifiedComplianceCard
      item={item}
      categoryColorKey={categoryColorKey}
      onClick={onClick}
    />
  );
}
