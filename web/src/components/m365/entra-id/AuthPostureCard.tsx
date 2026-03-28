import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { KeyRound, ShieldCheck, ShieldX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';

interface AuthPostureCardProps {
  data: EntraIdDashboardData | null;
  loading?: boolean;
}

export function AuthPostureCard({ data, loading }: AuthPostureCardProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent className="space-y-4"><Skeleton className="h-6 w-full" /><Skeleton className="h-4 w-3/4" /></CardContent>
      </Card>
    );
  }

  const coverage = data.mfa.total > 0 ? Math.round((data.mfa.enabled / data.mfa.total) * 100) : 0;
  const barColor = coverage >= 80 ? 'bg-green-500' : coverage >= 50 ? 'bg-warning' : 'bg-destructive';
  const statusText = coverage >= 80 ? 'Bom' : coverage >= 50 ? 'Atenção' : 'Crítico';
  const statusColor = coverage >= 80 ? 'text-green-400' : coverage >= 50 ? 'text-warning' : 'text-destructive';

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound className="w-4 h-4 text-primary" />
          Postura de Autenticação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Coverage bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cobertura MFA</span>
            <div className="flex items-center gap-2">
              <span className={cn('text-2xl font-bold tabular-nums', statusColor)}>{coverage}%</span>
              <span className={cn('text-xs font-medium', statusColor)}>{statusText}</span>
            </div>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div className={cn('h-full rounded-full transition-all duration-700', barColor)} style={{ width: `${coverage}%` }} />
          </div>
        </div>

        {/* MFA stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary/30 p-3">
            <ShieldCheck className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{data.mfa.enabled.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">Com MFA</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary/30 p-3">
            <ShieldX className="w-5 h-5 text-destructive" />
            <div>
              <p className="text-lg font-bold tabular-nums text-foreground">{data.mfa.disabled.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">Sem MFA</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
