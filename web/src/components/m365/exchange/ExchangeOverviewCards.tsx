import { Card, CardContent } from '@/components/ui/card';
import { Mail, UserPlus, UserX, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ExchangeDashboardData } from '@/hooks/useExchangeDashboard';

interface ExchangeOverviewCardsProps {
  data: ExchangeDashboardData | null;
  loading?: boolean;
}

interface OverviewItem {
  label: string;
  icon: React.ElementType;
  value: number;
  sub: string;
  iconColor: string;
}

export function ExchangeOverviewCards({ data, loading }: ExchangeOverviewCardsProps) {
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
      label: 'Total Mailboxes',
      icon: Mail,
      value: data.mailboxes.total,
      sub: 'Caixas de correio ativas',
      iconColor: 'text-primary',
    },
    {
      label: 'Novas (30 dias)',
      icon: UserPlus,
      value: data.mailboxes.newLast30d,
      sub: 'Mailboxes criadas recentemente',
      iconColor: 'text-green-400',
    },
    {
      label: 'Sem Login (30d)',
      icon: UserX,
      value: data.mailboxes.notLoggedIn30d,
      sub: 'Inativas nos últimos 30 dias',
      iconColor: 'text-warning',
    },
    {
      label: 'Próximas do Limite',
      icon: AlertTriangle,
      value: data.mailboxes.overQuota,
      sub: 'Cota de armazenamento',
      iconColor: 'text-destructive',
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
