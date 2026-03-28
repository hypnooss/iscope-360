import { Card, CardContent } from '@/components/ui/card';
import { Settings, Forward, MailWarning, UserX } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ExchangeDashboardData } from '@/hooks/useExchangeDashboard';

interface MailboxHealthCardProps {
  data: ExchangeDashboardData | null;
  loading?: boolean;
}

interface HealthItem {
  label: string;
  description: string;
  icon: React.ElementType;
  value: number;
  isWarning: boolean;
}

export function MailboxHealthCard({ data, loading }: MailboxHealthCardProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="py-6">
          <Skeleton className="h-6 w-64 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const items: HealthItem[] = [
    {
      label: 'Forwarding Habilitado',
      description: 'Mailboxes com encaminhamento externo ativo',
      icon: Forward,
      value: data.mailboxes.forwardingEnabled,
      isWarning: data.mailboxes.forwardingEnabled > 0,
    },
    {
      label: 'Auto-Reply Externo',
      description: 'Respostas automáticas para destinatários externos',
      icon: MailWarning,
      value: data.mailboxes.autoReplyExternal,
      isWarning: data.mailboxes.autoReplyExternal > 0,
    },
    {
      label: 'Sem Login (30 dias)',
      description: 'Mailboxes inativas que podem indicar abandono',
      icon: UserX,
      value: data.mailboxes.notLoggedIn30d,
      isWarning: data.mailboxes.notLoggedIn30d > 0,
    },
  ];

  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Configuração e Saúde das Caixas</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Configurações que podem indicar exposição</p>

        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.label}
              className={cn(
                'flex items-center justify-between p-4 rounded-lg border transition-colors cursor-pointer',
                item.isWarning
                  ? 'border-warning/30 bg-warning/5 hover:border-warning/50'
                  : 'border-border/50 bg-secondary/20 hover:border-primary/30'
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn('w-5 h-5', item.isWarning ? 'text-warning' : 'text-green-400')} />
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <span className={cn(
                'text-2xl font-bold tabular-nums',
                item.isWarning ? 'text-warning' : 'text-green-400'
              )}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
