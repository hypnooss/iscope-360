import { AlertTriangle, ShieldAlert, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { FindingsStats } from '@/lib/surfaceFindings';

interface SeverityCardsProps {
  stats: FindingsStats;
  onSeverityClick?: (severity: string) => void;
}

const SEVERITY_CONFIG = [
  {
    key: 'critical' as const,
    label: 'Crítico',
    icon: ShieldAlert,
    bg: 'bg-red-500/10 border-red-500/30 hover:border-red-500/60',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-500',
    valueColor: 'text-red-500',
  },
  {
    key: 'high' as const,
    label: 'Alto',
    icon: AlertTriangle,
    bg: 'bg-orange-500/10 border-orange-500/30 hover:border-orange-500/60',
    iconBg: 'bg-orange-500/15',
    iconColor: 'text-orange-500',
    valueColor: 'text-orange-500',
  },
  {
    key: 'medium' as const,
    label: 'Médio',
    icon: AlertCircle,
    bg: 'bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-500/60',
    iconBg: 'bg-yellow-500/15',
    iconColor: 'text-yellow-500',
    valueColor: 'text-yellow-500',
  },
  {
    key: 'low' as const,
    label: 'Baixo',
    icon: Info,
    bg: 'bg-blue-400/10 border-blue-400/30 hover:border-blue-400/60',
    iconBg: 'bg-blue-400/15',
    iconColor: 'text-blue-400',
    valueColor: 'text-blue-400',
  },
];

export function SeverityCards({ stats, onSeverityClick }: SeverityCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {SEVERITY_CONFIG.map(sev => {
        const count = stats[sev.key];
        const Icon = sev.icon;
        return (
          <Card
            key={sev.key}
            className={cn(
              'border cursor-pointer transition-all duration-200',
              sev.bg,
              count === 0 && 'opacity-50'
            )}
            onClick={() => onSeverityClick?.(sev.key)}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', sev.iconBg)}>
                <Icon className={cn('w-5 h-5', sev.iconColor)} />
              </div>
              <div>
                <p className={cn('text-2xl font-bold leading-tight', sev.valueColor)}>{count}</p>
                <p className="text-xs text-muted-foreground">{sev.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
