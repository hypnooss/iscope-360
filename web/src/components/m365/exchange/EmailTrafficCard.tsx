import { Card, CardContent } from '@/components/ui/card';
import { Send } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExchangeDashboardData } from '@/hooks/useExchangeDashboard';

interface EmailTrafficCardProps {
  data: ExchangeDashboardData | null;
  loading?: boolean;
}

interface TrafficRow {
  label: string;
  value: number;
  color: string;
  max: number;
}

export function EmailTrafficCard({ data, loading }: EmailTrafficCardProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="py-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.traffic.sent + data.traffic.received;
  const max = Math.max(data.traffic.sent, data.traffic.received, 1);

  const rows: TrafficRow[] = [
    { label: 'Enviados', value: data.traffic.sent, color: 'bg-primary', max },
    { label: 'Recebidos', value: data.traffic.received, color: 'bg-green-500', max },
    { label: 'Total', value: total, color: 'bg-muted-foreground', max: total },
  ];

  return (
    <Card className="border-border/50 bg-card/80 h-full">
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-1">
          <Send className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tráfego de Email</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-6">Últimos 30 dias</p>

        <div className="space-y-5">
          {rows.map((row) => (
            <div key={row.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="text-xl font-bold tabular-nums text-foreground">{row.value.toLocaleString('pt-BR')}</span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary/50 overflow-hidden">
                <div
                  className={`h-full rounded-full ${row.color} transition-all duration-700`}
                  style={{ width: `${Math.max(2, (row.value / row.max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
