import { Card, CardContent } from '@/components/ui/card';
import { Users, ShieldAlert, UserPlus, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';

interface IdentityOverviewCardsProps {
  data: EntraIdDashboardData | null;
  loading?: boolean;
}

interface OverviewItem {
  label: string;
  icon: React.ElementType;
  value: number;
  sub: string;
  iconColor: string;
}

export function IdentityOverviewCards({ data, loading }: IdentityOverviewCardsProps) {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="border-border/50"><CardContent className="py-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const items: OverviewItem[] = [
    {
      label: 'Usuários',
      icon: Users,
      value: data.users.total,
      sub: `${data.users.signInEnabled.toLocaleString('pt-BR')} ativos · ${data.users.disabled.toLocaleString('pt-BR')} desabilitados`,
      iconColor: 'text-primary',
    },
    {
      label: 'Administradores',
      icon: ShieldAlert,
      value: data.admins.total,
      sub: `${data.admins.globalAdmins} Global Admins`,
      iconColor: 'text-destructive',
    },
    {
      label: 'Convidados',
      icon: UserPlus,
      value: data.users.guests,
      sub: 'Usuários externos',
      iconColor: 'text-warning',
    },
    {
      label: 'Sincronização AD',
      icon: RefreshCw,
      value: data.users.onPremSynced,
      sub: 'On-premises sync',
      iconColor: 'text-primary',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label} className="border-border/50 bg-card/80 hover:border-primary/30 transition-colors cursor-pointer">
          <CardContent className="py-5 px-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</span>
              <item.icon className={cn('w-5 h-5', item.iconColor)} />
            </div>
            <p className="text-3xl font-bold tabular-nums text-foreground">{item.value.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground mt-1">{item.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
