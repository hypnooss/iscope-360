import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, AlertCircle, Info, Shield } from 'lucide-react';

interface SeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

interface M365SeverityBreakdownProps {
  summary: SeveritySummary;
  loading?: boolean;
}

const SEVERITY_CONFIG = [
  {
    key: 'critical',
    label: 'Críticos',
    icon: AlertTriangle,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
  },
  {
    key: 'high',
    label: 'Alta',
    icon: AlertTriangle,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
  {
    key: 'medium',
    label: 'Média',
    icon: AlertCircle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  {
    key: 'low',
    label: 'Baixa',
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  {
    key: 'total',
    label: 'Total',
    icon: Shield,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
  },
] as const;

export function M365SeverityBreakdown({ summary, loading = false }: M365SeverityBreakdownProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {SEVERITY_CONFIG.map((config) => {
        const Icon = config.icon;
        const value = summary[config.key as keyof SeveritySummary];
        
        return (
          <Card 
            key={config.key}
            className={cn('glass-card border', config.border, loading && 'animate-pulse')}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{config.label}</p>
                  <p className={cn('text-xl font-bold', config.color)}>
                    {loading ? '-' : value}
                  </p>
                </div>
                <div className={cn('p-2 rounded-lg', config.bg)}>
                  <Icon className={cn('w-4 h-4', config.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
