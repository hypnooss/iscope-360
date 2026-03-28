import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserCog, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';

interface GovernanceCardsProps {
  data: EntraIdDashboardData | null;
  loading?: boolean;
}

interface StatRow {
  label: string;
  value: number;
  color?: string;
}

function GovernanceCard({ title, icon: Icon, rows, loading }: {
  title: string;
  icon: React.ElementType;
  rows: StatRow[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-4 w-full" />)}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className={cn('font-semibold tabular-nums', row.color || 'text-foreground')}>
              {row.value.toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function GovernanceCards({ data, loading }: GovernanceCardsProps) {
  const userChangeRows: StatRow[] = [
    { label: 'Atualizados', value: data?.userChanges.updated ?? 0, color: 'text-primary' },
    { label: 'Novos usuários', value: data?.userChanges.new ?? 0, color: 'text-green-400' },
    { label: 'Habilitados', value: data?.userChanges.enabled ?? 0 },
    { label: 'Desabilitados', value: data?.userChanges.disabled ?? 0, color: 'text-warning' },
    { label: 'Deletados', value: data?.userChanges.deleted ?? 0, color: 'text-destructive' },
  ];

  const passwordRows: StatRow[] = [
    { label: 'Reset por Admin', value: data?.passwordActivity.resets ?? 0 },
    { label: 'Alterações Forçadas', value: data?.passwordActivity.forcedChanges ?? 0, color: 'text-warning' },
    { label: 'Self-Service', value: data?.passwordActivity.selfService ?? 0, color: 'text-primary' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <GovernanceCard title="Alterações de Usuário" icon={UserCog} rows={userChangeRows} loading={loading} />
      <GovernanceCard title="Atividade de Senhas" icon={Lock} rows={passwordRows} loading={loading} />
    </div>
  );
}
