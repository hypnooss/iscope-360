import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';

interface IdentityRiskCardProps {
  data: EntraIdDashboardData | null;
  loading?: boolean;
}

export function IdentityRiskCard({ data, loading }: IdentityRiskCardProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80 h-full">
        <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  const chartData = [
    { name: 'Em Risco', value: data.risks.riskyUsers, fill: 'hsl(38, 92%, 50%)' },
    { name: 'Ativos', value: data.risks.atRisk, fill: 'hsl(25, 95%, 53%)' },
    { name: 'Comprometidos', value: data.risks.compromised, fill: 'hsl(0, 72%, 51%)' },
  ];

  const hasRisks = chartData.some(d => d.value > 0);

  return (
    <Card className="border-border/50 bg-card/80 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldAlert className="w-4 h-4 text-warning" />
          Visão de Risco de Identidade
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasRisks ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={32}>
              <XAxis dataKey="name" tick={{ fill: 'hsl(215, 15%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide allowDecimals={false} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground">
            <ShieldAlert className="w-10 h-10 mb-2 text-green-400" />
            <p className="text-sm font-medium text-green-400">Nenhum risco detectado</p>
            <p className="text-xs">Todas as identidades estão seguras</p>
          </div>
        )}

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {chartData.map((d) => (
            <div key={d.name} className="text-center rounded-lg border border-border/50 bg-secondary/30 py-2">
              <p className="text-lg font-bold tabular-nums text-foreground">{d.value}</p>
              <p className="text-[10px] text-muted-foreground">{d.name}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
