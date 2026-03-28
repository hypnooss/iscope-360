import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import type { ExchangeDashboardData } from '@/hooks/useExchangeDashboard';

interface EmailSecurityPostureCardProps {
  data: ExchangeDashboardData | null;
  loading?: boolean;
}

export function EmailSecurityPostureCard({ data, loading }: EmailSecurityPostureCardProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="py-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const chartData = [
    { name: 'Spam', value: data.security.spam, color: 'hsl(45, 93%, 47%)' },
    { name: 'Malware', value: data.security.malware, color: 'hsl(25, 95%, 53%)' },
    { name: 'Phishing', value: data.security.phishing, color: 'hsl(0, 84%, 60%)' },
  ];

  const total = data.security.spam + data.security.malware + data.security.phishing;

  return (
    <Card className="border-border/50 bg-card/80 h-full">
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Postura de Segurança</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Emails maliciosos detectados (30 dias)</p>

        <div className="text-center mb-4">
          <span className="text-3xl font-bold tabular-nums text-foreground">{total.toLocaleString('pt-BR')}</span>
          <span className="text-xs text-muted-foreground ml-2">total detectados</span>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} barSize={40}>
            <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
