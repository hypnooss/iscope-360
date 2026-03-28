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
  AlertOctagon, AlertTriangle, Shield,
  Search, Layers, FileText, Wrench, Users,
  TrendingUp, Globe, Sparkles,
} from 'lucide-react';
import type { ExternalMovementAlert } from '@/types/externalMovement';
import { riskScoreLabel } from '@/types/externalMovement';

// ─── Severity config ─────────────────────────────────────────────────────────
const SEV_CFG = {
  critical: { label: 'Critical', icon: AlertOctagon, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  high: { label: 'High', icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  medium: { label: 'Medium', icon: Shield, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
} as const;

// ─── Section ─────────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, variant = 'default', children }: {
  title: string; icon: typeof FileText; variant?: 'default' | 'warning'; children: React.ReactNode;
}) {
  const styles = variant === 'warning'
    ? { bg: 'bg-warning/10 border-warning/30', icon: 'text-warning' }
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

// ─── Component ───────────────────────────────────────────────────────────────
interface ExternalMovementDetailSheetProps {
  alert: ExternalMovementAlert | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExternalMovementDetailSheet({ alert, open, onOpenChange }: ExternalMovementDetailSheetProps) {
  if (!alert) return null;

  const sev = SEV_CFG[alert.severity] ?? SEV_CFG.medium;
  const Icon = sev.icon;
  const risk = riskScoreLabel(alert.risk_score);
  const hasEvidence = (alert.affected_domains && alert.affected_domains.length > 0) ||
    (alert.evidence && Object.keys(alert.evidence).length > 0);

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
                {alert.title}
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn('text-xs', sev.bg, sev.color, sev.border)}>
                  {sev.label}
                </Badge>
                <Badge variant="secondary" className={cn('text-xs font-mono font-bold', risk.color)}>
                  Risk: {alert.risk_score}/100
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {alert.alert_type}
                </Badge>
                {alert.is_new && (
                  <Badge variant="secondary" className="text-[10px]">Novo</Badge>
                )}
                {alert.is_anomalous && (
                  <Badge variant="outline" className="text-[10px] border-rose-500/40 text-rose-400">
                    <Sparkles className="w-2.5 h-2.5 mr-0.5" />Anômalo
                  </Badge>
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
              {alert.description || 'Sem descrição disponível.'}
            </Section>

            {/* Metrics */}
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3 text-muted-foreground" />
                MÉTRICAS
              </h5>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-md border border-border/50 bg-muted/30 text-sm">
                  <span className="text-muted-foreground text-xs block mb-0.5">Usuário</span>
                  <p className="font-medium text-foreground truncate">{alert.user_id}</p>
                </div>
                <div className="p-2.5 rounded-md border border-border/50 bg-muted/30 text-sm">
                  <span className="text-muted-foreground text-xs block mb-0.5">Risk Score</span>
                  <p className={cn('font-bold', risk.color)}>{alert.risk_score}/100</p>
                </div>
                {alert.z_score !== null && alert.z_score !== undefined && (
                  <div className="p-2.5 rounded-md border border-border/50 bg-muted/30 text-sm">
                    <span className="text-muted-foreground text-xs block mb-0.5">Z-Score</span>
                    <p className="font-bold text-foreground">{alert.z_score.toFixed(2)}</p>
                  </div>
                )}
                {alert.pct_increase !== null && alert.pct_increase !== undefined && (
                  <div className="p-2.5 rounded-md border border-border/50 bg-muted/30 text-sm">
                    <span className="text-muted-foreground text-xs block mb-0.5">Aumento %</span>
                    <p className="font-bold text-foreground">{alert.pct_increase.toFixed(0)}%</p>
                  </div>
                )}
                <div className="p-2.5 rounded-md border border-border/50 bg-muted/30 text-sm">
                  <span className="text-muted-foreground text-xs block mb-0.5">Tipo</span>
                  <p className="font-medium text-foreground">{alert.alert_type}</p>
                </div>
              </div>
            </div>

            {/* Impact */}
            <Section title="IMPACTO" icon={FileText} variant="warning">
              {`Alerta de ${alert.alert_type} com risk score ${alert.risk_score}/100 para o usuário ${alert.user_id}.`}
              {alert.affected_domains && alert.affected_domains.length > 0
                ? ` ${alert.affected_domains.length} domínio(s) externo(s) envolvido(s).`
                : ''}
              {alert.is_anomalous ? ' Comportamento anômalo detectado em relação ao baseline do usuário.' : ''}
            </Section>

            {/* Recommendation */}
            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Wrench className="w-3 h-3 text-primary" />
                RECOMENDAÇÃO
              </h5>
              <div className="rounded-md p-3 border bg-primary/5 border-primary/20">
                <p className="text-sm text-foreground">
                  {alert.severity === 'critical'
                    ? `Investigue imediatamente a atividade do usuário ${alert.user_id}. Verifique se há exfiltração de dados e considere bloquear temporariamente o acesso até a conclusão da investigação.`
                    : alert.severity === 'high'
                    ? `Revise as atividades recentes do usuário ${alert.user_id} e verifique se os domínios externos envolvidos são legítimos. Considere reforçar as políticas de DLP.`
                    : `Monitore a atividade do usuário ${alert.user_id} para detectar padrões recorrentes. Avalie se os domínios externos são parceiros conhecidos.`
                  }
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Tab: Evidências */}
          {hasEvidence && (
            <TabsContent value="evidencias" className="p-6 space-y-4 mt-0">
              {alert.affected_domains && alert.affected_domains.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-muted-foreground" />
                    DOMÍNIOS AFETADOS
                  </h5>
                  <div className="rounded-md border border-border/50 divide-y divide-border/30">
                    {alert.affected_domains.map((d, i) => (
                      <div key={i} className="px-3 py-2 text-sm text-foreground flex items-center gap-2">
                        <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {alert.evidence && Object.keys(alert.evidence).length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    EVIDÊNCIAS
                  </h5>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(alert.evidence).map(([key, value]) => (
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
