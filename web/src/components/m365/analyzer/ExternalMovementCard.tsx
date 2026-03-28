import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  AlertOctagon, AlertTriangle, Shield, Eye, Users, Activity,
  Lightbulb, Sparkles, TrendingUp,
} from 'lucide-react';
import type { ExternalMovementAlert } from '@/types/externalMovement';
import { riskScoreLabel } from '@/types/externalMovement';
import { ExternalMovementDetailSheet } from './ExternalMovementDetailSheet';

const SEV_CFG = {
  critical: { label: 'Critical', icon: AlertOctagon, border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400', glow: 'shadow-[0_0_12px_hsl(350_70%_50%/0.15)]' },
  high: { label: 'High', icon: AlertTriangle, border: 'border-orange-500/40', bg: 'bg-orange-500/10', text: 'text-orange-400', glow: '' },
  medium: { label: 'Medium', icon: Shield, border: 'border-warning/40', bg: 'bg-warning/10', text: 'text-warning', glow: '' },
} as const;

interface Props {
  alert: ExternalMovementAlert;
  compact?: boolean;
}

export function ExternalMovementCard({ alert, compact }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const sev = SEV_CFG[alert.severity] ?? SEV_CFG.medium;
  const isCritical = alert.severity === 'critical';
  const risk = riskScoreLabel(alert.risk_score);

  return (
    <>
      <Card className={cn(
        'glass-card border transition-all',
        sev.border,
        isCritical && sev.glow,
        isCritical && 'bg-rose-500/5',
      )}>
        <CardContent className={cn('space-y-1.5', compact ? 'p-2' : 'p-3')}>
          {/* Row 1: Title + severity */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <sev.icon className={cn('w-4 h-4 shrink-0', sev.text, isCritical && 'animate-pulse')} />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <h4 className="text-sm font-semibold text-foreground truncate cursor-default">{alert.title}</h4>
                  </TooltipTrigger>
                  {alert.description && (
                    <TooltipContent side="top" className="max-w-xs text-xs">{alert.description}</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
            <Badge variant="outline" className={cn(
              'shrink-0 border',
              sev.bg, sev.text, sev.border,
              isCritical ? 'text-sm font-bold' : 'text-[10px]',
            )}>
              {sev.label}
            </Badge>
          </div>

          {/* Row 2: Metrics */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {alert.user_id}
            </span>
            {alert.z_score !== null && alert.z_score !== undefined && (
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Z: {alert.z_score.toFixed(1)}
              </span>
            )}
            {alert.is_new && (
              <Badge variant="secondary" className="text-[10px] h-4">Novo</Badge>
            )}
            {alert.is_anomalous && (
              <Badge variant="outline" className="text-[10px] h-4 border-rose-500/40 text-rose-400">
                <Sparkles className="w-2.5 h-2.5 mr-0.5" />Anômalo
              </Badge>
            )}
            {/* Risk Score */}
            <span className={cn('font-mono font-bold text-[10px]', risk.color)}>
              Risk: {alert.risk_score}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-0.5 text-primary/70 cursor-help">
                    <Lightbulb className="w-3 h-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {alert.description || 'Sem informações adicionais'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Row 3: Details button */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1 px-2" onClick={() => setDetailOpen(true)}>
              <Eye className="w-3 h-3" /> Detalhes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <ExternalMovementDetailSheet alert={alert} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}
