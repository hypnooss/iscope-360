import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  MinusCircle,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileText,
  ShieldAlert,
  Building2,
  Code,
  Layers,
  Users,
  Wrench,
} from 'lucide-react';
import {
  UnifiedComplianceItem,
  UnifiedComplianceStatus,
  UnifiedComplianceSeverity,
  UNIFIED_SEVERITY_LABELS,
  UNIFIED_SEVERITY_COLORS_FAIL,
  UNIFIED_SEVERITY_COLORS_NEUTRAL,
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
  label: string;
}> = {
  pass: {
    icon: CheckCircle,
    iconClass: 'text-primary',
    bgClass: 'bg-primary/10 border-primary/30',
    label: 'Aprovado',
  },
  fail: {
    icon: XCircle,
    iconClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10 border-rose-500/30',
    label: 'Falha',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-warning',
    bgClass: 'bg-warning/10 border-warning/30',
    label: 'Atenção',
  },
  not_found: {
    icon: MinusCircle,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50 border-border',
    label: 'Não Encontrado',
  },
  unknown: {
    icon: HelpCircle,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50 border-border',
    label: 'Indisponível',
  },
};

// ============================================================
// SECTION COMPONENT (reusável internamente)
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

interface UnifiedComplianceCardProps {
  item: UnifiedComplianceItem;

  /** Cor da categoria para hover (ex: "sky-500") */
  categoryColorKey?: string;

  /** Callback ao clicar no card para abrir detalhes na sheet lateral */
  onClick?: () => void;

  /** Callback ao clicar nas entidades afetadas */
  onShowAffectedEntities?: () => void;

  /** Callback ao clicar em "Como Corrigir" */
  onShowRemediation?: () => void;
}

// Mapa de classes de hover (Tailwind purge-safe)
const CATEGORY_HOVER_CLASSES: Record<string, { border: string; text: string }> = {
  'sky-500': { border: 'hover:border-sky-500/50', text: 'group-hover:text-sky-500' },
  'blue-500': { border: 'hover:border-blue-500/50', text: 'group-hover:text-blue-500' },
  'violet-500': { border: 'hover:border-violet-500/50', text: 'group-hover:text-violet-500' },
  'teal-500': { border: 'hover:border-teal-500/50', text: 'group-hover:text-teal-500' },
  'purple-500': { border: 'hover:border-purple-500/50', text: 'group-hover:text-purple-500' },
  'slate-500': { border: 'hover:border-slate-500/50', text: 'group-hover:text-slate-500' },
  'cyan-600': { border: 'hover:border-cyan-600/50', text: 'group-hover:text-cyan-600' },
  'emerald-600': { border: 'hover:border-emerald-600/50', text: 'group-hover:text-emerald-600' },
  'pink-500': { border: 'hover:border-pink-500/50', text: 'group-hover:text-pink-500' },
  'amber-500': { border: 'hover:border-amber-500/50', text: 'group-hover:text-amber-500' },
  'red-500': { border: 'hover:border-red-500/50', text: 'group-hover:text-red-500' },
  'green-500': { border: 'hover:border-green-500/50', text: 'group-hover:text-green-500' },
  'orange-500': { border: 'hover:border-orange-500/50', text: 'group-hover:text-orange-500' },
  'indigo-500': { border: 'hover:border-indigo-500/50', text: 'group-hover:text-indigo-500' },
  'rose-500': { border: 'hover:border-rose-500/50', text: 'group-hover:text-rose-500' },
};

// ============================================================
// COMPONENT
// ============================================================

export function UnifiedComplianceCard({
  item,
  categoryColorKey,
  onClick,
  onShowAffectedEntities,
  onShowRemediation,
}: UnifiedComplianceCardProps) {
  const { role } = useAuth();

  const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.unknown;
  const StatusIcon = statusConfig.icon;

  const isFailed = item.status === 'fail' || item.status === 'warning';
  const isNeutral = item.status === 'pass' || item.status === 'not_found' || item.status === 'unknown';

  // RBAC: apenas super_admin e super_suporte veem endpoint e JSON bruto
  const canViewAdminDetails = role === 'super_admin' || role === 'super_suporte';

  // Mensagem contextual baseada no status
  const contextualMessage = (() => {
    switch (item.status) {
      case 'pass': return item.passDescription || item.description;
      case 'fail': return item.failDescription || item.description;
      case 'not_found': return item.notFoundDescription || item.description;
      default: return item.description;
    }
  })();

  // Severidade: cor apenas em falha/warning
  const severityBadgeClass = isFailed
    ? UNIFIED_SEVERITY_COLORS_FAIL[item.severity] || UNIFIED_SEVERITY_COLORS_NEUTRAL
    : UNIFIED_SEVERITY_COLORS_NEUTRAL;

  // Hover baseado na cor da categoria
  const hoverClasses = categoryColorKey
    ? CATEGORY_HOVER_CLASSES[categoryColorKey]
    : null;

  // Determina se há conteúdo expandível
  const hasExpandableContent =
    item.description || item.details ||
    (isFailed && item.technicalRisk) ||
    (isFailed && item.businessImpact) ||
    (item.evidence && item.evidence.length > 0) ||
    (canViewAdminDetails && item.apiEndpoint) ||
    (canViewAdminDetails && item.rawData && Object.keys(item.rawData).length > 0) ||
    (isFailed && item.remediation);

  return (
    <div
      className={cn(
        'glass-card rounded-lg transition-all duration-200 group animate-fade-in flex flex-col',
        hoverClasses?.border || 'hover:border-primary/50',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* ═══════════════════════════════════════════════════════
          NÍVEL 1 — Visão Rápida (sempre visível)
          ═══════════════════════════════════════════════════════ */}
      <div className="p-4 flex-1 space-y-2">
        {/* Linha 1: Ícone + Título + Badge (centralizados verticalmente) */}
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg border flex-shrink-0', statusConfig.bgClass)}>
            <StatusIcon className={cn('w-4 h-4', statusConfig.iconClass)} />
          </div>
          <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
            {item.name}
          </span>
          <Badge className={cn('text-xs border flex-shrink-0', severityBadgeClass)}>
            {UNIFIED_SEVERITY_LABELS[item.severity]}
          </Badge>
        </div>

        {/* Conteúdo abaixo (fora do flex do ícone) */}
        {contextualMessage && (
          <p className="text-sm text-muted-foreground line-clamp-2 pr-2 ml-[2.85rem]">
            {contextualMessage}
          </p>
        )}

      </div>

      {/* Link "Detalhes" — abre sheet lateral quando onClick presente */}
      {onClick && hasExpandableContent && (
        <div className="px-4 pb-3 mt-auto">
          <div className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className={cn(
              'w-3.5 h-3.5 transition-colors',
              hoverClasses?.text || 'group-hover:text-primary'
            )} />
            <span>Detalhes</span>
          </div>
        </div>
      )}

      {/* Fallback: Collapsible inline quando NÃO tem onClick (ex: M365 Posture) */}
      {!onClick && hasExpandableContent && (
        <details className="group/details">
          <summary className="w-full px-4 pb-2 text-left cursor-pointer list-none">
            <div className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className={cn(
                'w-3.5 h-3.5 transition-colors group-open/details:rotate-90',
                hoverClasses?.text || 'group-hover:text-primary'
              )} />
              <span>Detalhes</span>
            </div>
          </summary>
          <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3 mx-4 mb-2">
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
            {(item.details || item.description) && (
              <Section title="ANÁLISE EFETUADA" icon={FileText}>
                {item.details || item.description}
              </Section>
            )}
            {isFailed && item.technicalRisk && (
              <Section title="RISCO TÉCNICO" icon={ShieldAlert} variant="warning">
                {item.technicalRisk}
              </Section>
            )}
            {isFailed && item.businessImpact && (
              <Section title="IMPACTO NO NEGÓCIO" icon={Building2} variant="destructive">
                {item.businessImpact}
              </Section>
            )}
            {item.evidence && item.evidence.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-muted-foreground" />
                  EVIDÊNCIAS COLETADAS
                </h5>
                <div className="space-y-2">
                  {item.evidence.map((ev, index) => (
                    <EvidenceItemDisplay key={index} item={ev} />
                  ))}
                </div>
              </div>
            )}
            {canViewAdminDetails && item.rawData && Object.keys(item.rawData).length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <Code className="w-3 h-3" />
                  Ver dados brutos (JSON)
                </summary>
                <pre className="mt-2 bg-muted/50 p-3 rounded-md overflow-x-auto text-[10px] text-muted-foreground">
                  {JSON.stringify(item.rawData, null, 2)}
                </pre>
              </details>
            )}
            {isFailed && item.remediation && onShowRemediation && (
              <div className="pt-2 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowRemediation();
                  }}
                >
                  <Wrench className="w-4 h-4 mr-2" />
                  Como Corrigir
                </Button>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
