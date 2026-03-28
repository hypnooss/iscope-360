import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';

interface LoginActivityCardProps {
  data: EntraIdDashboardData | null;
  loading?: boolean;
}

const PERIODS = ['30 dias'] as const;

interface BarItem {
  label: string;
  value: number;
  color: string;
  bgColor: string;
}

export function LoginActivityCard({ data, loading }: LoginActivityCardProps) {
  const [period] = useState(PERIODS[0]);

  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80 h-full">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</CardContent>
      </Card>
    );
  }

  const total = data.loginActivity.total || 1;
  const bars: BarItem[] = [
    { label: 'Sucesso', value: data.loginActivity.success, color: 'bg-green-500', bgColor: 'bg-green-500/15' },
    { label: 'Falhas', value: data.loginActivity.failed, color: 'bg-destructive', bgColor: 'bg-destructive/15' },
    { label: 'MFA Requerido', value: data.loginActivity.mfaRequired, color: 'bg-primary', bgColor: 'bg-primary/15' },
    { label: 'Bloqueados', value: data.loginActivity.blocked, color: 'bg-warning', bgColor: 'bg-warning/15' },
  ];

  return (
    <Card className="border-border/50 bg-card/80 h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="w-4 h-4 text-primary" />
          Atividade de Login
        </CardTitle>
        <span className="text-[10px] text-muted-foreground border border-border/50 rounded px-2 py-0.5">
          {period}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {bars.map((bar) => {
          const pct = Math.max(1, (bar.value / total) * 100);
          return (
            <div key={bar.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{bar.label}</span>
                <span className="font-semibold tabular-nums text-foreground">{bar.value.toLocaleString('pt-BR')}</span>
              </div>
              <div className={cn('h-2 rounded-full overflow-hidden', bar.bgColor)}>
                <div className={cn('h-full rounded-full transition-all duration-700', bar.color)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}

        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Total de logins</span>
            <span className="text-lg font-bold tabular-nums text-foreground">{data.loginActivity.total.toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
