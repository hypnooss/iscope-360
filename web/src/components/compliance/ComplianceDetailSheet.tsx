import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  MinusCircle,
  HelpCircle,
  ExternalLink,
  FileText,
  ShieldAlert,
  Building2,
  Code,
  Layers,
  Wrench,
  Search,
} from 'lucide-react';
import {
  UnifiedComplianceItem,
  UnifiedComplianceStatus,
  UNIFIED_SEVERITY_LABELS,
  UNIFIED_SEVERITY_COLORS_FAIL,
  UNIFIED_SEVERITY_COLORS_NEUTRAL,
  UNIFIED_STATUS_LABELS,
} from '@/types/unifiedCompliance';
import { useAuth } from '@/contexts/AuthContext';
import { EvidenceItemDisplay } from '@/components/compliance/EvidenceDisplay';

// ============================================================
// STATUS CONFIG
// ============================================================

const STATUS_CONFIG: Record<UnifiedComplianceStatus, {
  icon: typeof CheckCircle;
  iconClass: string;
  bgClass: string;
}> = {
  pass: {
    icon: CheckCircle,
    iconClass: 'text-primary',
    bgClass: 'bg-primary/10 border-primary/30',
  },
  fail: {
    icon: XCircle,
    iconClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10 border-rose-500/30',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    bgClass: 'bg-warning/10 border-warning/30',
  },
  not_found: {
    icon: MinusCircle,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50 border-border',
  },
  unknown: {
    icon: HelpCircle,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50 border-border',
  },
};

// ============================================================
// SECTION (internal)
// ============================================================

interface SectionProps {
  title: string;
  icon: typeof FileText;
  variant?: 'default' | 'warning' | 'destructive';
  children: React.ReactNode;
}

const SECTION_STYLES = {
  default: { bg: 'bg-muted/30 border-border/30', icon: 'text-muted-foreground' },
  warning: { bg: 'bg-warning/10 border-warning/30', icon: 'text-warning' },
  destructive: { bg: 'bg-destructive/10 border-destructive/30', icon: 'text-destructive' },
};

function Section({ title, icon: Icon, variant = 'default', children }: SectionProps) {
  const styles = SECTION_STYLES[variant];
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

// ============================================================
// PROPS
// ============================================================

interface ComplianceDetailSheetProps {
  item: UnifiedComplianceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================
// COMPONENT
// ============================================================

export function ComplianceDetailSheet({ item, open, onOpenChange }: ComplianceDetailSheetProps) {
  const { role } = useAuth();

  if (!item) return null;

  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.unknown;
  const StatusIcon = statusConfig.icon;
  const isFailed = item.status === 'fail' || item.status === 'warning';
  const canViewAdminDetails = role === 'super_admin' || role === 'super_suporte';

  const severityBadgeClass = isFailed
    ? UNIFIED_SEVERITY_COLORS_FAIL[item.severity] || UNIFIED_SEVERITY_COLORS_NEUTRAL
    : UNIFIED_SEVERITY_COLORS_NEUTRAL;

  // Mensagem contextual
  const contextualMessage = (() => {
    switch (item.status) {
      case 'pass': return item.passDescription || item.description;
      case 'fail': return item.failDescription || item.description;
      case 'not_found': return item.notFoundDescription || item.description;
      default: return item.description;
    }
  })();

  // Determine available tabs
  const hasEvidence = (item.evidence && item.evidence.length > 0) || (item.affectedEntities && item.affectedEntities.length > 0);
  const hasAdminData = canViewAdminDetails && (item.apiEndpoint || (item.rawData && Object.keys(item.rawData).length > 0));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] overflow-y-auto p-0">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-start gap-3">
            <div className={cn('p-2.5 rounded-lg border flex-shrink-0', statusConfig.bgClass)}>
              <StatusIcon className={cn('w-5 h-5', statusConfig.iconClass)} />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <SheetTitle className="text-base font-semibold text-foreground leading-tight">
                {item.name}
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {UNIFIED_STATUS_LABELS[item.status]}
                </Badge>
                <Badge className={cn('text-xs border', severityBadgeClass)}>
                  {UNIFIED_SEVERITY_LABELS[item.severity]}
                </Badge>
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
            {hasAdminData && (
              <TabsTrigger value="dados" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 text-xs">
                <Code className="w-3.5 h-3.5 mr-1.5" />
                Dados
              </TabsTrigger>
            )}
          </TabsList>

          {/* Tab: Análise */}
          <TabsContent value="analise" className="p-6 space-y-4 mt-0">
            {/* Contextual message */}
            {contextualMessage && (
              <Section title="DESCRIÇÃO" icon={FileText}>
                {contextualMessage}
              </Section>
            )}

            {/* Analysis performed */}
            {item.details && (
              <Section title="ANÁLISE EFETUADA" icon={FileText}>
                {item.details}
              </Section>
            )}

            {/* Business Impact */}
            {isFailed && item.businessImpact && (
              <Section title="IMPACTO NO NEGÓCIO" icon={Building2} variant="destructive">
                {item.businessImpact}
              </Section>
            )}
            {/* Technical Risk */}
            {isFailed && item.technicalRisk && (
              <Section title="RISCO TÉCNICO" icon={ShieldAlert} variant="warning">
                {item.technicalRisk}
              </Section>
            )}
            {/* Recommendation */}
            {isFailed && item.recommendation && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Wrench className="w-3 h-3 text-primary" />
                  RECOMENDAÇÃO
                </h5>
                <div className="rounded-md p-3 border bg-primary/5 border-primary/20">
                  <p className="text-sm text-foreground">{item.recommendation}</p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab: Evidências */}
          {hasEvidence && (
            <TabsContent value="evidencias" className="p-6 space-y-4 mt-0">
              <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-muted-foreground" />
                EVIDÊNCIAS COLETADAS
              </h5>
              <div className="space-y-2">
                {item.evidence && item.evidence.map((ev, index) => (
                  <EvidenceItemDisplay key={index} item={ev} />
                ))}
                {/* Fallback: show affectedEntities when no formal evidence */}
                {(!item.evidence || item.evidence.length === 0) && item.affectedEntities && item.affectedEntities.length > 0 && (
                  <>
                    <EvidenceItemDisplay item={{ label: 'Itens afetados', value: `${item.affectedEntities.length} item(ns)`, type: 'text' }} />
                    <EvidenceItemDisplay item={{ label: 'Entidades afetadas', value: item.affectedEntities.map(e => e.displayName).join('\n'), type: 'list' }} />
                  </>
                )}
              </div>
            </TabsContent>
          )}

          {/* Tab: Dados (admin only) */}
          {hasAdminData && (
            <TabsContent value="dados" className="p-6 space-y-4 mt-0">
              {canViewAdminDetails && item.apiEndpoint && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ExternalLink className="w-3 h-3" />
                  <span>
                    Endpoint consultado:{' '}
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                      {item.apiEndpoint}
                    </code>
                  </span>
                </div>
              )}

              {canViewAdminDetails && item.rawData && Object.keys(item.rawData).length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Code className="w-3 h-3 text-muted-foreground" />
                    DADOS BRUTOS (JSON)
                  </h5>
                  <pre className="bg-muted/50 p-3 rounded-md overflow-x-auto text-[10px] text-muted-foreground max-h-[400px] overflow-y-auto">
                    {JSON.stringify(item.rawData, null, 2)}
                  </pre>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
