import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SnapshotDiff {
  newCount: number;
  resolvedCount: number;
  escalatedCount: number;
}

interface Props {
  diff: SnapshotDiff;
}

export function SnapshotDiffBanner({ diff }: Props) {
  const { newCount, resolvedCount, escalatedCount } = diff;
  const total = newCount + resolvedCount + escalatedCount;
  if (total === 0) return null;

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="py-2 px-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Desde a última coleta:</span>
        {newCount > 0 && (
          <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-400 text-xs gap-1">
            <TrendingUp className="w-3 h-3" />
            +{newCount} novo{newCount > 1 ? 's' : ''}
          </Badge>
        )}
        {resolvedCount > 0 && (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {resolvedCount} resolvido{resolvedCount > 1 ? 's' : ''}
          </Badge>
        )}
        {escalatedCount > 0 && (
          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning text-xs gap-1">
            <AlertTriangle className="w-3 h-3" />
            {escalatedCount} escalou
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
