import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Database, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  daysCollected: number;
  requiredDays?: number;
}

export function BaselineMaturityCard({ daysCollected, requiredDays = 7 }: Props) {
  if (daysCollected >= requiredDays) return null;

  const pct = Math.round((daysCollected / requiredDays) * 100);

  return (
    <Card className="glass-card border-primary/20 mb-4">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">
                Baseline: {daysCollected}/{requiredDays} dias coletados
              </span>
              <span className="text-xs text-muted-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
            <div className="flex items-center gap-1.5 mt-1.5">
              <Info className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                O motor de detecção de anomalias requer no mínimo {requiredDays} dias de dados para gerar alertas confiáveis.
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
