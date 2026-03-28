/**
 * M365InsightCard — wrapper over UnifiedComplianceCard
 * Mantém os dialogs de Remediação e Entidades Afetadas.
 */
import { useState } from 'react';
import { M365Insight } from '@/types/m365Insights';
import { UnifiedComplianceCard } from '@/components/compliance/UnifiedComplianceCard';
import { mapM365Insight } from '@/lib/complianceMappers';
import { M365RemediationDialog } from './M365RemediationDialog';
import { M365AffectedEntitiesDialog } from './M365AffectedEntitiesDialog';

interface M365InsightCardProps {
  insight: M365Insight;
}

export function M365InsightCard({ insight }: M365InsightCardProps) {
  const [showRemediation, setShowRemediation] = useState(false);
  const [showAffected, setShowAffected] = useState(false);

  const item = mapM365Insight(insight);

  return (
    <>
      <UnifiedComplianceCard
        item={item}
        onShowAffectedEntities={() => setShowAffected(true)}
        onShowRemediation={() => setShowRemediation(true)}
      />

      <M365RemediationDialog
        insight={insight}
        open={showRemediation}
        onOpenChange={setShowRemediation}
      />

      <M365AffectedEntitiesDialog
        insight={insight}
        open={showAffected}
        onOpenChange={setShowAffected}
      />
    </>
  );
}
