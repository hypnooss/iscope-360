import { Card, CardContent } from '@/components/ui/card';
import { Users, Globe, Lock, UserCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CollaborationDashboardData } from '@/hooks/useCollaborationDashboard';

interface TeamsOverviewCardsProps {
  data: CollaborationDashboardData | null;
  loading?: boolean;
}

interface OverviewItem {
  label: string;
  icon: React.ElementType;
  value: number;
  sub: string;
  iconColor: string;
}

export function TeamsOverviewCards({ data, loading }: TeamsOverviewCardsProps) {
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
    { label: 'Total Teams', icon: Users, value: data.teams.total, sub: 'Equipes no tenant', iconColor: 'text-primary' },
    { label: 'Públicas', icon: Globe, value: data.teams.public, sub: 'Acessíveis a todos', iconColor: 'text-warning' },
    { label: 'Privadas', icon: Lock, value: data.teams.private, sub: 'Acesso restrito', iconColor: 'text-green-400' },
    { label: 'Com Convidados', icon: UserCheck, value: data.teams.withGuests, sub: 'Membros externos', iconColor: 'text-orange-400' },
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
