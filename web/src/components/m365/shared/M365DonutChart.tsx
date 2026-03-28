import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export interface DonutSegment {
  name: string;
  value: number;
  color: string;
}

interface M365DonutChartProps {
  title: string;
  icon: LucideIcon;
  segments: DonutSegment[];
  centerLabel?: string;
  centerValue?: number;
  loading?: boolean;
  className?: string;
}

export function M365DonutChart({ title, icon: Icon, segments, centerLabel, centerValue, loading, className }: M365DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (loading) {
    return (
      <Card className={cn('border-border/50', className)}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-border/50', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="relative w-32 h-32 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segments.filter(s => s.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {segments.filter(s => s.value > 0).map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px', color: 'hsl(var(--foreground))' }}
                  formatter={(value: number, name: string) => [`${value.toLocaleString('pt-BR')}`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            {centerValue !== undefined && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-bold text-foreground">{centerValue.toLocaleString('pt-BR')}</span>
                {centerLabel && <span className="text-[10px] text-muted-foreground">{centerLabel}</span>}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            {segments.map((seg) => (
              <div key={seg.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  <span className="text-muted-foreground text-xs">{seg.name}</span>
                </div>
                <span className="font-semibold tabular-nums text-foreground text-xs">
                  {seg.value.toLocaleString('pt-BR')}
                  {total > 0 && <span className="text-muted-foreground ml-1">({Math.round((seg.value / total) * 100)}%)</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
