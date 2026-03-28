import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  XCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  Building2,
  FileText,
  Layers,
  Server,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  type SurfaceFinding,
  type SurfaceFindingSeverity,
  SEVERITY_LABELS,
} from '@/lib/surfaceFindings';

// ─── Severity colors ────────────────────────────────────────

const SEVERITY_COLORS_FAIL: Record<SurfaceFindingSeverity, string> = {
  critical: 'bg-red-500/20 text-red-500 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  low: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
};

const SEVERITY_COLORS_NEUTRAL = 'bg-muted text-muted-foreground border-border';

// ─── Status config ──────────────────────────────────────────

const STATUS_CONFIG = {
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
  pass: {
    icon: XCircle, // unused in practice
    iconClass: 'text-primary',
    bgClass: 'bg-primary/10 border-primary/30',
  },
};

// ─── Section subcomponent ───────────────────────────────────

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

// ─── Hover classes ──────────────────────────────────────────

const CATEGORY_HOVER_CLASSES: Record<string, { border: string; text: string }> = {
  'red-500': { border: 'hover:border-red-500/50', text: 'group-hover:text-red-500' },
  'orange-500': { border: 'hover:border-orange-500/50', text: 'group-hover:text-orange-500' },
  'rose-500': { border: 'hover:border-rose-500/50', text: 'group-hover:text-rose-500' },
  'amber-500': { border: 'hover:border-amber-500/50', text: 'group-hover:text-amber-500' },
  'purple-500': { border: 'hover:border-purple-500/50', text: 'group-hover:text-purple-500' },
  'sky-500': { border: 'hover:border-sky-500/50', text: 'group-hover:text-sky-500' },
  'cyan-500': { border: 'hover:border-cyan-500/50', text: 'group-hover:text-cyan-500' },
};

// ─── Props ──────────────────────────────────────────────────

interface SurfaceFindingCardProps {
  finding: SurfaceFinding;
  categoryColorKey?: string;
  hideAffectedAssets?: boolean;
}

// ─── Component ──────────────────────────────────────────────

export function SurfaceFindingCard({ finding, categoryColorKey, hideAffectedAssets }: SurfaceFindingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusConfig = STATUS_CONFIG[finding.status];
  const StatusIcon = statusConfig.icon;

  const isFailed = finding.status === 'fail' || finding.status === 'warning';

  const severityBadgeClass = isFailed
    ? SEVERITY_COLORS_FAIL[finding.severity] || SEVERITY_COLORS_NEUTRAL
    : SEVERITY_COLORS_NEUTRAL;

  const hoverClasses = categoryColorKey
    ? CATEGORY_HOVER_CLASSES[categoryColorKey]
    : null;

  return (
    <div
      className={cn(
        'glass-card rounded-lg transition-all duration-200 group animate-fade-in',
        hoverClasses?.border || 'hover:border-primary/50'
      )}
    >
      {/* ═══ LEVEL 1 — Quick view (always visible) ═══ */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={cn('p-2 rounded-lg border flex-shrink-0', statusConfig.bgClass)}>
              <StatusIcon className={cn('w-4 h-4', statusConfig.iconClass)} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">
                  {finding.name}
                </span>
                <Badge className={cn('text-xs border ml-auto flex-shrink-0', severityBadgeClass)}>
                  {SEVERITY_LABELS[finding.severity]}
                </Badge>
              </div>

              {finding.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {finding.description}
                </p>
              )}

              {/* ═══ LEVEL 2 — Strategic Context ═══ */}
              {isFailed && finding.recommendation && (
                <p className="text-xs text-primary mt-2 flex items-start gap-1">
                  <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>{finding.recommendation}</span>
                </p>
              )}

              {/* Affected assets count */}
              {!hideAffectedAssets && finding.affectedAssets.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-400 mt-2">
                  <Server className="w-3.5 h-3.5" />
                  <span>
                    {finding.affectedAssets.length} {finding.affectedAssets.length === 1 ? 'ativo afetado' : 'ativos afetados'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ LEVEL 3 — Expandable Details ═══ */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button className="w-full px-4 pb-2 text-left">
            <div className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className={cn(
                  'w-3.5 h-3.5 transition-colors',
                  hoverClasses?.text || 'group-hover:text-primary'
                )} />
              )}
              <span>Detalhes</span>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3 mx-4 mb-2">

            {/* RISCO TÉCNICO */}
            {finding.technicalRisk && (
              <Section title="RISCO TÉCNICO" icon={ShieldAlert} variant="warning">
                {finding.technicalRisk}
              </Section>
            )}

            {/* IMPACTO NO NEGÓCIO */}
            {finding.businessImpact && (
              <Section title="IMPACTO NO NEGÓCIO" icon={Building2} variant="destructive">
                {finding.businessImpact}
              </Section>
            )}

            {/* ATIVOS AFETADOS */}
            {!hideAffectedAssets && finding.affectedAssets.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Server className="w-3 h-3 text-muted-foreground" />
                  ATIVOS AFETADOS ({finding.affectedAssets.length})
                </h5>
                <div className="flex flex-wrap gap-1.5">
                  {finding.affectedAssets.map(a => (
                    <Badge key={a.ip} variant="outline" className="text-xs font-mono px-2 py-0.5">
                      {a.hostname !== a.ip ? `${a.hostname} (${a.ip})` : a.ip}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* EVIDÊNCIAS */}
            {finding.evidence.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-muted-foreground" />
                  EVIDÊNCIAS COLETADAS
                </h5>
                <div className="space-y-1">
                  {finding.evidence.map((ev, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs bg-muted/30 rounded px-2.5 py-1.5 border border-border/30">
                      <span className="text-muted-foreground font-mono shrink-0">{ev.label}:</span>
                      <span className="text-foreground break-all">{ev.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
