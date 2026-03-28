import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SEVERITY_CONFIG } from '@/types/m365Insights';
import { M365_ANALYZER_CATEGORY_LABELS } from '@/types/m365AnalyzerInsights';
import type { M365AnalyzerInsight } from '@/types/m365AnalyzerInsights';
import {
  AlertTriangle, AlertCircle, Info, Shield, CheckCircle2,
  TrendingUp, TrendingDown, Users, Hash, Tag, MinusCircle, Link2,
} from 'lucide-react';
import { DataSourceDot } from './DataSourceDot';
import { IncidentDetailSheet } from '@/components/m365/analyzer/IncidentDetailSheet';

// ─── Exact same pattern as AssetHealthGrid CARD_STYLES ───────────────────────

const CARD_STYLES: Record<string, { borderL: string; border: string; hover: string }> = {
  critical: { borderL: 'border-l-red-500', border: 'border-red-500/20', hover: 'hover:bg-muted/30' },
  high:     { borderL: 'border-l-orange-500', border: 'border-orange-500/20', hover: 'hover:bg-muted/30' },
  medium:   { borderL: 'border-l-yellow-500', border: 'border-yellow-500/20', hover: 'hover:bg-muted/30' },
  low:      { borderL: 'border-l-blue-400', border: 'border-blue-400/20', hover: 'hover:bg-muted/30' },
  info:     { borderL: 'border-l-slate-400', border: 'border-slate-400/20', hover: 'hover:bg-muted/30' },
  pass:     { borderL: 'border-l-emerald-500', border: 'border-emerald-500/20', hover: 'hover:bg-muted/30' },
  na:       { borderL: 'border-l-slate-400', border: 'border-slate-400/20', hover: 'hover:bg-muted/30' },
};

const severityBadgeStyles: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-500 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  low: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
  info: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const trendIcons: Record<string, React.ElementType> = {
  up: TrendingUp,
  down: TrendingDown,
};

const trendStyles: Record<string, string> = {
  up: 'bg-red-500/15 text-red-400 border-red-500/30',
  down: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

interface SecurityInsightCardsProps {
  insights: M365AnalyzerInsight[];
  loading?: boolean;
  title?: string;
  hideHeader?: boolean;
}

function isNAInsight(insight: M365AnalyzerInsight): boolean {
  if (insight.status === 'pass') return false;
  if (insight.status === 'fail') return false;
  if (insight.status === 'not_applicable') return true;
  const name = insight.name.toLowerCase();
  const configKeywords = ['desabilitado', 'disabled', 'configuração', 'configuracao', 'policy', 'habilitado', 'enabled'];
  if (configKeywords.some(kw => name.includes(kw))) return true;
  if ((insight.count === undefined || insight.count === 0) && (!insight.affectedUsers || insight.affectedUsers.length === 0)) return true;
  return false;
}

export function SecurityInsightCards({ insights, loading, title = 'Insights de Segurança', hideHeader }: SecurityInsightCardsProps) {
  const [selectedInsight, setSelectedInsight] = useState<M365AnalyzerInsight | null>(null);

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

  const failInsights = insights
    .filter(i => i.status !== 'pass' && !isNAInsight(i))
    .sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5));
  const passInsights = insights.filter(i => i.status === 'pass');
  const naInsights = insights.filter(i => i.status !== 'pass' && isNAInsight(i));
  const sorted = [...failInsights, ...passInsights, ...naInsights];

  const failCount = failInsights.length;
  const passCount = passInsights.length;
  const naCount = naInsights.length;

  if (loading || sorted.length === 0) return null;

  return (
    <div className="space-y-4 mb-6">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</h2>
          <div className="flex items-center gap-2">
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
            {naCount > 0 && (
              <Badge variant="outline" className="text-xs bg-slate-500/10 text-slate-400 border-slate-500/30">
                {naCount} N/A
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {sorted.map(insight => {
          const isPass = insight.status === 'pass';
          const isNA = !isPass && isNAInsight(insight);
          const sevConfig = SEVERITY_CONFIG[insight.severity];
          const styleKey = isNA ? 'na' : isPass ? 'pass' : (insight.severity in CARD_STYLES ? insight.severity : 'info');
          const cs = CARD_STYLES[styleKey];
          const categoryLabel = M365_ANALYZER_CATEGORY_LABELS[insight.category];
          const trend = insight.metadata?.trend as string | undefined;
          const TrendIcon = trend ? trendIcons[trend] : undefined;

          // Bypass cn/twMerge for border classes — use template literal like AssetHealthGrid
          return (
            <div
              key={insight.id}
              className={`rounded-lg border bg-card pl-5 pr-3 py-3 border-l-4 cursor-pointer transition-colors ${cs.border} ${cs.hover} ${cs.borderL}`}
              onClick={() => setSelectedInsight(insight)}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm font-medium text-foreground truncate">{insight.name}</span>
                <DataSourceDot source="analyzed" className="ml-auto" />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {categoryLabel && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-secondary/50 text-muted-foreground border-border/60">
                    <Tag className="w-3 h-3 mr-0.5" />
                    {categoryLabel}
                  </Badge>
                )}

                {!isPass && insight.count != null && insight.count > 0 && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-secondary/50 text-muted-foreground border-border/60">
                    <Hash className="w-3 h-3 mr-0.5" />
                    {insight.count} ocorrências
                  </Badge>
                )}

                {!isPass && insight.affectedUsers && insight.affectedUsers.length > 0 && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-secondary/50 text-muted-foreground border-border/60">
                    <Users className="w-3 h-3 mr-0.5" />
                    {insight.affectedUsers.length} usuários
                  </Badge>
                )}

                {!isPass && (insight.metadata as any)?.complianceCorrelation && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 bg-violet-500/15 text-violet-400 border-violet-500/30">
                    <Link2 className="w-3 h-3 mr-0.5" />
                    Compliance
                  </Badge>
                )}

                {!isPass && insight.metadata && Object.entries(insight.metadata).map(([key, value]) => {
                  if (key === 'trend') return null;
                  if (typeof value === 'number' || (typeof value === 'string' && !isNaN(Number(value)))) {
                    return (
                      <Badge key={key} variant="outline" className="text-[11px] px-1.5 py-0 bg-secondary/50 text-muted-foreground border-border/60">
                        {key.replace(/_/g, ' ')}: {String(value)}
                      </Badge>
                    );
                  }
                  return null;
                })}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                {isNA ? (
                  <Badge variant="outline" className="text-[11px] px-2 py-0.5 bg-slate-500/15 text-slate-400 border-slate-500/30">
                    <MinusCircle className="w-3 h-3 mr-0.5" />
                    N/A
                  </Badge>
                ) : isPass ? (
                  <Badge variant="outline" className="text-[11px] px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3 mr-0.5" />
                    OK
                  </Badge>
                ) : (
                  <Badge variant="outline" className={cn('text-[11px] px-2 py-0.5', severityBadgeStyles[insight.severity])}>
                    {sevConfig?.label ?? insight.severity}
                  </Badge>
                )}

                {!isPass && trend && TrendIcon && (
                  <Badge variant="outline" className={cn('text-[11px] px-1.5 py-0', trendStyles[trend])}>
                    <TrendIcon className="w-3 h-3 mr-0.5" />
                    {trend === 'up' ? 'Crescente' : 'Decrescente'}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <IncidentDetailSheet
        insight={selectedInsight}
        open={!!selectedInsight}
        onOpenChange={(open) => !open && setSelectedInsight(null)}
      />
    </div>
  );
}
