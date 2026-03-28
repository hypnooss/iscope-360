import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export interface StatsRow {
  label: string;
  value: number;
  color?: string;
}

interface M365StatsCardProps {
  title: string;
  icon: LucideIcon;
  rows: StatsRow[];
  loading?: boolean;
  className?: string;
}

export function M365StatsCard({ title, icon: Icon, rows, loading, className }: M365StatsCardProps) {
  if (loading) {
    return (
      <Card className={cn('border-border/50', className)}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-4 w-full" />)}
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
