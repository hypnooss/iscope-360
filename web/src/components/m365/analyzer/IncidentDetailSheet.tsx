import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertOctagon, AlertTriangle, Shield, Info,
  Search, Layers, FileText, Wrench, Users, UserX,
  Activity, TrendingUp, TrendingDown, Minus, Lightbulb,
  Building2, Link2,
} from 'lucide-react';
import type { M365AnalyzerInsight, M365AnalyzerCategory } from '@/types/m365AnalyzerInsights';
import { M365_ANALYZER_CATEGORY_LABELS } from '@/types/m365AnalyzerInsights';

// ─── Severity config ─────────────────────────────────────────────────────────
const SEV_CFG = {
  critical: { label: 'Critical', icon: AlertOctagon, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  high: { label: 'High', icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  medium: { label: 'Medium', icon: Shield, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
  low: { label: 'Low', icon: Info, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
} as const;

// ─── Severity labels in PT ───────────────────────────────────────────────────
const SEV_LABELS_PT: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
  info: 'Informativa',
};

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, variant = 'default', children }: {
  title: string; icon: typeof FileText; variant?: 'default' | 'warning' | 'destructive'; children: React.ReactNode;
}) {
  const styles = variant === 'warning'
    ? { bg: 'bg-warning/10 border-warning/30', icon: 'text-warning' }
    : variant === 'destructive'
    ? { bg: 'bg-destructive/10 border-destructive/30', icon: 'text-destructive' }
    : { bg: 'bg-muted/30 border-border/30', icon: 'text-muted-foreground' };
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Icon className={cn('w-3 h-3', styles.icon)} />
        {title}
      </h5>
      <div className={cn('rounded-md p-3 border', styles.bg)}>
        <p className="text-sm text-foreground whitespace-pre-line">{children}</p>
      </div>
    </div>
  );
}

// ─── Fallback generators ─────────────────────────────────────────────────────
function generateAnalysisFallback(insight: M365AnalyzerInsight): string {
  const sevPt = SEV_LABELS_PT[insight.severity] || insight.severity;
  const catLabel = M365_ANALYZER_CATEGORY_LABELS[insight.category] || insight.category;
  const userCount = insight.affectedUsers?.length || 0;
  const parts: string[] = [];

  if (insight.count && insight.count > 0) {
    parts.push(`Foram identificadas ${insight.count} ocorrência(s) classificadas como severidade ${sevPt}.`);
  } else {
    parts.push(`Incidente classificado como severidade ${sevPt}.`);
  }

  parts.push(`A análise correlacionou dados de telemetria na categoria "${catLabel}" para identificar este padrão.`);

  if (userCount > 0) {
    parts.push(`${userCount} usuário(s) foram identificados como afetados durante o período de coleta.`);
  }

  const prevCount = (insight.metadata as any)?.previousCount;
  if (prevCount !== undefined && insight.count !== undefined) {
    if (insight.count > prevCount) {
      parts.push(`Houve um aumento de ${insight.count - prevCount} ocorrência(s) em relação à análise anterior, indicando tendência de crescimento.`);
    } else if (insight.count < prevCount) {
      parts.push(`Houve uma redução de ${prevCount - insight.count} ocorrência(s) em relação à análise anterior.`);
    } else {
      parts.push(`O número de ocorrências permanece estável em relação à análise anterior.`);
    }
  }

  return parts.join(' ');
}

function generateBusinessImpactFallback(insight: M365AnalyzerInsight): string {
  const sevMap: Record<string, string> = {
    critical: 'Este incidente apresenta risco crítico para a organização. A exploração ativa pode resultar em comprometimento total do ambiente, perda de dados sensíveis e violação de conformidade regulatória. Ação imediata é necessária.',
    high: 'Este incidente apresenta alto risco operacional. Se não tratado, pode resultar em interrupção de serviços, exposição de dados corporativos e impacto na produtividade dos usuários.',
    medium: 'Este incidente apresenta risco moderado. Embora não represente uma ameaça imediata, pode escalar se não for monitorado e tratado dentro do ciclo operacional.',
    low: 'Este incidente apresenta baixo risco direto, porém indica oportunidades de melhoria na postura de segurança da organização.',
    info: 'Este item é informativo e não apresenta risco direto, mas deve ser considerado para melhoria contínua.',
  };

  return insight.businessImpact || sevMap[insight.severity] || sevMap.medium;
}

// ─── Component ───────────────────────────────────────────────────────────────
interface IncidentDetailSheetProps {
  insight: M365AnalyzerInsight | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IncidentDetailSheet({ insight, open, onOpenChange }: IncidentDetailSheetProps) {
  if (!insight) return null;

  const sev = SEV_CFG[insight.severity as keyof typeof SEV_CFG] ?? SEV_CFG.medium;
  const Icon = sev.icon;
  const prevCount = (insight.metadata as any)?.previousCount;
  const hasEvidence = (insight.affectedUsers && insight.affectedUsers.length > 0) ||
    ((insight.metadata as any)?.userDetails?.length > 0) ||
    (insight.metadata && Object.keys(insight.metadata).filter(k => k !== 'previousCount' && k !== 'userDetails').length > 0);

  const analysisText = insight.analysis || generateAnalysisFallback(insight);
  const businessImpactText = insight.businessImpact || generateBusinessImpactFallback(insight);
  const impactVariant = insight.severity === 'critical' || insight.severity === 'high' ? 'destructive' as const : 'warning' as const;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] overflow-y-auto p-0">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-start gap-3">
            <div className={cn('p-2.5 rounded-lg border flex-shrink-0', sev.bg, sev.border)}>
              <Icon className={cn('w-5 h-5', sev.color)} />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <SheetTitle className="text-base font-semibold text-foreground leading-tight">
                {insight.name}
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn('text-xs', sev.bg, sev.color, sev.border)}>
                  {sev.label}
                </Badge>
                {insight.count !== undefined && insight.count > 0 && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    {insight.count} ocorrências
                  </Badge>
                )}
                {insight.affectedUsers && insight.affectedUsers.length > 0 && (
                  <Badge variant="secondary" className="text-xs font-mono">
                    <Users className="w-3 h-3 mr-1" />
                    {insight.affectedUsers.length} usuário{insight.affectedUsers.length > 1 ? 's' : ''}
                  </Badge>
                )}
                {prevCount !== undefined && insight.count !== undefined && (
                  <Badge variant="outline" className={cn('text-xs font-mono',
                    insight.count > prevCount ? 'text-rose-400 border-rose-500/30' :
                    insight.count < prevCount ? 'text-emerald-400 border-emerald-500/30' :
                    'text-muted-foreground border-border'
                  )}>
                    {insight.count > prevCount ? <TrendingUp className="w-3 h-3 mr-0.5" /> :
                     insight.count < prevCount ? <TrendingDown className="w-3 h-3 mr-0.5" /> :
                     <Minus className="w-3 h-3 mr-0.5" />}
                    {insight.count > prevCount ? `+${insight.count - prevCount}` :
                     insight.count < prevCount ? `${insight.count - prevCount}` : '='} vs anterior
                  </Badge>
                )}
                {prevCount === undefined && insight.count !== undefined && insight.count > 0 && (
                  <Badge variant="secondary" className="text-[10px]">Novo</Badge>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs defaultValue="analise" className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-6 h-auto py-0">
            <TabsTrigger value="analise" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
              <Search className="w-3.5 h-3.5 mr-1.5" />
              Análise
            </TabsTrigger>
            {hasEvidence && (
              <TabsTrigger value="evidencias" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                Evidências
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab: Análise */}
          <TabsContent value="analise" className="p-6 space-y-4 mt-0">
            <Section title="DESCRIÇÃO" icon={FileText}>
              {insight.description || 'Sem descrição disponível.'}
            </Section>

            <Section title="ANÁLISE EFETUADA" icon={Search}>
              {analysisText}
            </Section>

            <Section title="IMPACTO NO NEGÓCIO" icon={Building2} variant={impactVariant}>
              {businessImpactText}
            </Section>

            {insight.recommendation && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-primary" />
                  RECOMENDAÇÃO
                </h5>
                <div className="rounded-md p-3 border bg-primary/5 border-primary/20">
                  <p className="text-sm text-foreground">{insight.recommendation}</p>
                </div>
              </div>
            )}

            {/* Compliance Correlation Section */}
            {(insight.metadata as any)?.complianceCorrelation && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Link2 className="w-3 h-3 text-violet-400" />
                  CORRELAÇÃO DE COMPLIANCE
                </h5>
                <div className="rounded-md p-3 border bg-violet-500/10 border-violet-500/30">
                  <p className="text-sm text-foreground whitespace-pre-line">
                    {(insight.metadata as any)?.complianceContext || 'Este insight está correlacionado com falhas detectadas no módulo de Compliance.'}
                  </p>
                  {(insight.metadata as any)?.complianceCodes && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {((insight.metadata as any).complianceCodes as string[]).map((code: string) => (
                        <Badge key={code} variant="outline" className="text-xs bg-violet-500/15 text-violet-400 border-violet-500/30 font-mono">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab: Evidências */}
          {hasEvidence && (
          <TabsContent value="evidencias" className="p-6 space-y-4 mt-0">
              {/* Per-user detail cards (from consolidated insights) */}
              {(insight.metadata as any)?.userDetails && (insight.metadata as any).userDetails.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    DETALHAMENTO POR USUÁRIO
                  </h5>
                  <div className="rounded-md border border-border/50 divide-y divide-border/30">
                    {((insight.metadata as any).userDetails as { user: string; description: string; count: number }[]).map((ud, i) => (
                      <div key={i} className="px-3 py-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground flex items-center gap-2">
                            <UserX className="w-3 h-3 text-muted-foreground shrink-0" />
                            {ud.user}
                          </span>
                          {ud.count > 0 && (
                            <Badge variant="secondary" className="text-[10px] font-mono">{ud.count} ocorrências</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground pl-5">{ud.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Simple affected users list (fallback when no userDetails) */}
              {insight.affectedUsers && insight.affectedUsers.length > 0 && !(insight.metadata as any)?.userDetails && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    USUÁRIOS AFETADOS
                  </h5>
                  <div className="rounded-md border border-border/50 divide-y divide-border/30">
                    {insight.affectedUsers.map((u, i) => (
                      <div key={i} className="px-3 py-2 text-sm text-foreground flex items-center gap-2">
                        <UserX className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{u}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insight.metadata && Object.keys(insight.metadata).filter(k => k !== 'previousCount' && k !== 'userDetails').length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Info className="w-3 h-3 text-muted-foreground" />
                    DETALHES ADICIONAIS
                  </h5>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(insight.metadata)
                      .filter(([k]) => k !== 'previousCount' && k !== 'userDetails')
                      .map(([key, value]) => (
                        <div key={key} className="p-2.5 rounded-md border border-border/50 bg-muted/30 text-sm">
                          <span className="text-muted-foreground text-xs block mb-0.5">{key}</span>
                          <p className="font-medium truncate text-foreground">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
