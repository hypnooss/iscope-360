import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AlertOctagon, AlertTriangle, Shield, CheckCircle2 } from 'lucide-react';
import { useExternalMovementData, useBaselineMaturity } from '@/hooks/useExternalMovementData';
import { ExternalMovementCard } from './ExternalMovementCard';
import { BaselineMaturityCard } from './BaselineMaturityCard';
import type { ExternalMovementAlert, ExternalMovementSeverity } from '@/types/externalMovement';

const SEV_CFG = {
  critical: { label: 'Critical', icon: AlertOctagon, border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400' },
  high: { label: 'High', icon: AlertTriangle, border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  medium: { label: 'Medium', icon: Shield, border: 'border-warning/40', bg: 'bg-warning/10', text: 'text-warning' },
} as const;

function SeverityColumn({ severity, alerts, compact }: {
  severity: ExternalMovementSeverity;
  alerts: ExternalMovementAlert[];
  compact?: boolean;
}) {
  const cfg = SEV_CFG[severity];
  return (
    <div className="space-y-2">
      <div className={cn('flex items-center gap-2 px-2 py-1.5 rounded-lg', cfg.bg)}>
        <cfg.icon className={cn('w-4 h-4', cfg.text)} />
        <span className={cn('text-sm font-bold', cfg.text)}>{cfg.label}</span>
        <Badge variant="outline" className={cn('ml-auto text-[10px]', cfg.text, cfg.border)}>{alerts.length}</Badge>
      </div>
      {alerts.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">—</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <ExternalMovementCard key={a.id} alert={a} compact={compact} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  tenantRecordId: string | undefined;
  compact?: boolean;
}

export function ExternalMovementTab({ tenantRecordId, compact }: Props) {
  const { data, isLoading } = useExternalMovementData(tenantRecordId);
  const { data: baselineDays = 0 } = useBaselineMaturity(tenantRecordId);
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!data || data.totalAlerts === 0) {
    return (
      <Card className="glass-card border-emerald-500/20">
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
          <h3 className="text-sm font-semibold text-foreground mb-1">Sem alertas de movimento externo</h3>
          <p className="text-xs text-muted-foreground">Nenhum comportamento anômalo de envio externo detectado.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <BaselineMaturityCard daysCollected={baselineDays} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SeverityColumn severity="critical" alerts={data.bySeverity.critical} compact={compact} />
        <SeverityColumn severity="high" alerts={data.bySeverity.high} compact={compact} />
        <SeverityColumn severity="medium" alerts={data.bySeverity.medium} compact={compact} />
      </div>
    </div>
  );
}
