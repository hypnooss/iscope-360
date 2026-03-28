import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  ShieldAlert, KeyRound, Globe, AlertTriangle, Search, Activity,
} from 'lucide-react';
import type { M365AnalyzerMetrics } from '@/types/m365AnalyzerInsights';

export type KPIFilterKey = 'highRiskSignIns' | 'mfaFailures' | 'impossibleTravel' | 'correlatedAlerts' | 'suspiciousLogins' | 'anomalousUsers';

interface KPIItem {
  key: KPIFilterKey;
  label: string;
  value: number;
  icon: React.ElementType;
  threshold: { warn: number; critical: number };
}

function getColor(value: number, t: { warn: number; critical: number }): string {
  if (value >= t.critical) return 'text-rose-400';
  if (value >= t.warn) return 'text-orange-400';
  if (value > 0) return 'text-warning';
  return 'text-emerald-400';
}

function getBg(value: number, t: { warn: number; critical: number }): string {
  if (value >= t.critical) return 'border-rose-500/30 bg-rose-500/5';
  if (value >= t.warn) return 'border-orange-500/30 bg-orange-500/5';
  if (value > 0) return 'border-warning/30 bg-warning/5';
  return 'border-emerald-500/20 bg-emerald-500/5';
}

interface Props {
  metrics: M365AnalyzerMetrics;
  activeFilter?: KPIFilterKey | null;
  onFilter?: (key: KPIFilterKey | null) => void;
}

export function AnalyzerKPIRow({ metrics, activeFilter, onFilter }: Props) {
  const kpis: KPIItem[] = [
    { key: 'highRiskSignIns', label: 'Logins de Risco', value: metrics.securityRisk.highRiskSignIns, icon: ShieldAlert, threshold: { warn: 5, critical: 20 } },
    { key: 'mfaFailures', label: 'Falhas MFA', value: metrics.securityRisk.mfaFailures, icon: KeyRound, threshold: { warn: 10, critical: 50 } },
    { key: 'impossibleTravel', label: 'Login Geo. Anômalo', value: metrics.securityRisk.impossibleTravel, icon: Globe, threshold: { warn: 1, critical: 3 } },
    { key: 'correlatedAlerts', label: 'Alertas Correlac.', value: metrics.compromise.correlatedAlerts, icon: AlertTriangle, threshold: { warn: 2, critical: 5 } },
    { key: 'suspiciousLogins', label: 'Logins Suspeitos', value: metrics.compromise.suspiciousLogins, icon: Search, threshold: { warn: 3, critical: 10 } },
    { key: 'anomalousUsers', label: 'Usuários Anômalos', value: metrics.behavioral.anomalousUsers, icon: Activity, threshold: { warn: 2, critical: 5 } },
  ];

  const allZero = kpis.every(k => k.value === 0);
  if (allZero) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {kpis.map((kpi) => {
        const color = getColor(kpi.value, kpi.threshold);
        const bg = getBg(kpi.value, kpi.threshold);
        const isActive = activeFilter === kpi.key;
        const isClickable = !!onFilter && kpi.value > 0;
        return (
          <Card
            key={kpi.key}
            className={cn(
              'glass-card border transition-all',
              bg,
              isActive && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
              isClickable && 'cursor-pointer hover:scale-[1.02]',
            )}
            onClick={() => {
              if (!isClickable) return;
              onFilter(isActive ? null : kpi.key);
            }}
          >
            <CardContent className="p-3 flex items-center gap-2.5">
              <kpi.icon className={cn('w-4 h-4 shrink-0', color)} />
              <div className="min-w-0">
                <p className={cn('text-lg font-bold leading-none', color)}>{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
