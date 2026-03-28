import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SurfaceFinding, SurfaceFindingSeverity } from '@/lib/surfaceFindings';

const SEV_BADGE: Record<SurfaceFindingSeverity, string> = {
  critical: 'bg-red-500/20 text-red-500 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  low: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
};

const SEV_BAR: Record<SurfaceFindingSeverity, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
};

const SEV_LABELS: Record<SurfaceFindingSeverity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
};

interface TopFindingsListProps {
  findings: SurfaceFinding[];
  maxItems?: number;
  onViewAll: () => void;
  onFindingClick?: (finding: SurfaceFinding) => void;
}

export function TopFindingsList({ findings, maxItems = 7, onViewAll, onFindingClick }: TopFindingsListProps) {
  const navigate = useNavigate();
  // Only critical + high, already sorted by severity
  const topFindings = findings
    .filter(f => f.severity === 'critical' || f.severity === 'high')
    .slice(0, maxItems);

  const maxAffected = Math.max(...topFindings.map(f => f.affectedAssets.length), 1);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-destructive" />
          Vulnerabilidades Encontradas
          {topFindings.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto bg-red-500/10 text-red-500 border-red-500/20">
              {topFindings.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {topFindings.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum achado crítico ou alto</p>
        ) : (
          <>
            {topFindings.map((finding, idx) => {
              const barWidth = (finding.affectedAssets.length / maxAffected) * 100;
              return (
                <div
                  key={finding.id}
                  className="flex items-center gap-3 group cursor-pointer hover:bg-muted/30 rounded-lg px-2 py-1.5 transition-colors"
                  onClick={() => onFindingClick?.(finding)}
                >
                  <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">
                    {idx + 1}.
                  </span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{finding.name}</span>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', SEV_BADGE[finding.severity])}>
                        {SEV_LABELS[finding.severity]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', SEV_BAR[finding.severity])}
                          style={{ width: `${Math.max(barWidth, 8)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {finding.affectedAssets.length} {finding.affectedAssets.length === 1 ? 'ativo' : 'ativos'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground mt-1"
              onClick={() => navigate('/scope-external-domain/analyzer/findings')}
            >
              Ver todas as vulnerabilidades →
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
