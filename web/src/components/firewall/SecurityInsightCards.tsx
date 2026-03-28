import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Link2 } from 'lucide-react';
import { useFirewallSecurityInsights } from '@/hooks/useFirewallSecurityInsights';
import { useComplianceCorrelatedInsights } from '@/hooks/useComplianceCorrelatedInsights';
import { SecurityInsightCards as SharedSecurityInsightCards } from '@/components/m365/shared/SecurityInsightCard';
import type { AnalyzerSnapshot } from '@/types/analyzerInsights';
import type { FirewallSecurityInsight } from '@/types/firewallSecurityInsights';
import type { M365AnalyzerInsight } from '@/types/m365AnalyzerInsights';

interface SecurityInsightCardsProps {
  snapshot: AnalyzerSnapshot;
}

function mapFirewallToAnalyzerInsight(fw: FirewallSecurityInsight): M365AnalyzerInsight {
  return {
    id: fw.id,
    category: 'firewall_security',
    name: fw.title,
    description: fw.what,
    severity: fw.severity === 'low' ? 'low' : fw.severity,
    analysis: fw.why,
    recommendation: fw.bestPractice.join('\n'),
    businessImpact: fw.businessImpact,
    status: fw.status || 'fail',
    metadata: {
      ...Object.fromEntries(fw.metrics.map(m => [m.label, m.value])),
      source: fw.source,
      complianceCode: fw.complianceCode,
    },
  };
}

export function SecurityInsightCards({ snapshot }: SecurityInsightCardsProps) {
  const trafficInsights = useFirewallSecurityInsights(snapshot);
  const { insights: complianceInsights } = useComplianceCorrelatedInsights(snapshot, snapshot.firewall_id);

  const allFirewallInsights: FirewallSecurityInsight[] = useMemo(() => {
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [
      ...complianceInsights,
      ...trafficInsights.map(i => ({ ...i, source: 'traffic' as const })),
    ].sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4));
  }, [complianceInsights, trafficInsights]);

  const mappedInsights: M365AnalyzerInsight[] = useMemo(
    () => allFirewallInsights.map(mapFirewallToAnalyzerInsight),
    [allFirewallInsights]
  );

  if (mappedInsights.length === 0) return null;

  const complianceCount = complianceInsights.length;
  const failCount = mappedInsights.filter(i => i.status === 'fail').length;
  const passCount = mappedInsights.filter(i => i.status === 'pass').length;

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Insights de Segurança
        </h2>
        <div className="flex items-center gap-2">
          {complianceCount > 0 && (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/30">
              <Link2 className="w-3 h-3 mr-1" />
              {complianceCount} correlação{complianceCount > 1 ? 'ões' : ''}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {mappedInsights.length} {mappedInsights.length === 1 ? 'insight' : 'insights'}
          </Badge>
          {failCount > 0 && (
            <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">
              {failCount} {failCount === 1 ? 'alerta' : 'alertas'}
            </Badge>
          )}
          {passCount > 0 && (
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              {passCount} OK
            </Badge>
          )}
        </div>
      </div>

      <SharedSecurityInsightCards insights={mappedInsights} hideHeader />
    </div>
  );
}
