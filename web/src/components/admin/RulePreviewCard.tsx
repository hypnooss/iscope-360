/**
 * RulePreviewCard — wrapper over UnifiedComplianceCard with state toggle.
 * Permite ao admin alternar entre Sucesso/Falha/N/A para validar como
 * as descrições serão exibidas ao usuário final.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ComplianceRuleBasic } from '@/types/complianceRule';
import { UnifiedComplianceCard } from '@/components/compliance/UnifiedComplianceCard';
import {
  UnifiedComplianceItem,
  UnifiedComplianceSeverity,
} from '@/types/unifiedCompliance';

type PreviewState = 'pass' | 'fail' | 'not_found';

interface RulePreviewCardProps {
  rule: ComplianceRuleBasic;
}

function mapRuleToUnified(rule: ComplianceRuleBasic, state: PreviewState): UnifiedComplianceItem {
  return {
    id: rule.id,
    code: rule.code,
    name: rule.name,
    description: rule.description || undefined,
    category: rule.category,
    status: state,
    severity: (rule.severity as UnifiedComplianceSeverity) || 'info',
    passDescription: rule.pass_description || 'Configuração conforme esperado',
    failDescription: rule.fail_description || 'Configuração fora do esperado',
    notFoundDescription: rule.not_found_description || 'Recurso não configurado neste ambiente',
    recommendation: rule.recommendation || undefined,
    technicalRisk: rule.technical_risk || undefined,
    businessImpact: rule.business_impact || undefined,
    apiEndpoint: rule.api_endpoint || undefined,
    // Placeholder evidence for preview
    evidence: [],
  };
}

export function RulePreviewCard({ rule }: RulePreviewCardProps) {
  const [previewState, setPreviewState] = useState<PreviewState>('fail');

  const item = mapRuleToUnified(rule, previewState);

  return (
    <div className="relative">
      {/* Toggle Sucesso/Falha/N/A — posicionado acima do card */}
      <div className="flex items-center justify-end gap-1 mb-2">
        <Button
          size="sm"
          variant={previewState === 'pass' ? 'default' : 'outline'}
          className={cn(
            'h-7 px-2 text-xs',
            previewState === 'pass' && 'bg-primary hover:bg-primary/90'
          )}
          onClick={() => setPreviewState('pass')}
        >
          Sucesso
        </Button>
        <Button
          size="sm"
          variant={previewState === 'fail' ? 'destructive' : 'outline'}
          className="h-7 px-2 text-xs"
          onClick={() => setPreviewState('fail')}
        >
          Falha
        </Button>
        <Button
          size="sm"
          variant={previewState === 'not_found' ? 'secondary' : 'outline'}
          className="h-7 px-2 text-xs"
          onClick={() => setPreviewState('not_found')}
        >
          N/A
        </Button>
      </div>

      <UnifiedComplianceCard item={item} />
    </div>
  );
}
