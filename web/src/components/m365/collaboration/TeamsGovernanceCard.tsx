import { Card, CardContent } from '@/components/ui/card';
import { ShieldCheck, Globe, UserCheck, Share2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CollaborationDashboardData } from '@/hooks/useCollaborationDashboard';

interface TeamsGovernanceCardProps {
  data: CollaborationDashboardData | null;
  loading?: boolean;
}

interface GovernanceItem {
  label: string;
  description: string;
  icon: React.ElementType;
  value: number;
  total: number;
  isWarning: boolean;
}

export function TeamsGovernanceCard({ data, loading }: TeamsGovernanceCardProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="py-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const teamsTotal = Math.max(1, data.teams.total);

  const items: GovernanceItem[] = [
    {
      label: 'Teams Públicas',
      description: 'Equipes visíveis e acessíveis a todos no tenant',
      icon: Globe,
      value: data.teams.public,
      total: teamsTotal,
      isWarning: data.teams.public > 0,
    },
    {
      label: 'Teams com Convidados',
      description: 'Equipes que possuem membros externos convidados',
      icon: UserCheck,
      value: data.teams.withGuests,
      total: teamsTotal,
      isWarning: data.teams.withGuests > 0,
    },
    {
      label: 'Canais Compartilhados',
      description: 'Canais compartilhados entre equipes ou organizações',
      icon: Share2,
      value: data.teams.sharedChannels,
      total: teamsTotal,
      isWarning: data.teams.sharedChannels > 0,
    },
  ];

  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Teams Governance</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Indicadores de exposição de colaboração</p>

        <div className="space-y-3">
          {items.map((item) => {
            const pct = Math.round((item.value / item.total) * 100);
            return (
              <div
                key={item.label}
                className={cn(
                  'p-4 rounded-lg border transition-colors cursor-pointer',
                  item.isWarning
                    ? 'border-warning/30 bg-warning/5 hover:border-warning/50'
                    : 'border-border/50 bg-secondary/20 hover:border-primary/30'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <item.icon className={cn('w-5 h-5', item.isWarning ? 'text-warning' : 'text-green-400')} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <span className={cn('text-2xl font-bold tabular-nums', item.isWarning ? 'text-warning' : 'text-green-400')}>
                    {item.value}
                  </span>
                </div>
                <div className="w-full bg-secondary/40 rounded-full h-1.5">
                  <div
                    className={cn('h-1.5 rounded-full transition-all', item.isWarning ? 'bg-warning' : 'bg-green-400')}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
