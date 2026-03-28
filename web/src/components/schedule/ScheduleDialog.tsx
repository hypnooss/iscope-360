import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { formatDateTimeBR, getUserTimezone, getUtcOffsetHours } from '@/lib/dateUtils';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from 'lucide-react';

type ScheduleTable = 'analysis_schedules' | 'external_domain_schedules' | 'm365_analyzer_schedules' | 'm365_compliance_schedules';

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The ID of the entity (firewall_id, domain_id, or tenant_record_id) */
  entityId: string;
  /** Which schedule table to use */
  table: ScheduleTable;
  /** The foreign key column name in the schedule table */
  entityColumn: 'firewall_id' | 'domain_id' | 'tenant_record_id';
  /** Dialog title */
  title?: string;
  /** Dialog description */
  description?: string;
  /** Optional recommendation text shown as info alert */
  recommendation?: string;
  /** Whether to show the hourly frequency option (default: true) */
  allowHourly?: boolean;
}

/**
 * Calculate next run date. The `hour` parameter is in the user's timezone.
 * We convert to UTC dynamically based on the user's timezone preference.
 */
function calculateNextRun(freq: string, hour: number, dayOfWeek: number, dayOfMonth: number): Date {
  const now = new Date();
  const tz = getUserTimezone();
  const offsetHours = getUtcOffsetHours(tz);
  
  // Convert user's local hour to UTC hour
  const utcHourRaw = hour - offsetHours;
  const hourUTC = ((utcHourRaw % 24) + 24) % 24;
  const dayOffset = utcHourRaw < 0 ? -1 : utcHourRaw >= 24 ? 1 : 0;

  if (freq === 'hourly') {
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }

  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + dayOffset,
    hourUTC, 0, 0
  ));

  if (freq === 'daily') {
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else if (freq === 'weekly') {
    const currentDay = next.getUTCDay();
    let diff = dayOfWeek - currentDay;
    if (diff < 0 || (diff === 0 && next <= now)) diff += 7;
    next.setUTCDate(next.getUTCDate() + diff);
  } else if (freq === 'monthly') {
    next.setUTCDate(dayOfMonth + dayOffset);
    if (next <= now) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(dayOfMonth + dayOffset);
    }
  }

  return next;
}

export function ScheduleDialog({
  open,
  onOpenChange,
  entityId,
  table,
  entityColumn,
  title = 'Agendamento de Análise',
  description = 'Configure a frequência de execução automática.',
  recommendation,
  allowHourly = true,
}: ScheduleDialogProps) {
  const [scheduleFreq, setScheduleFreq] = useState<string>('daily');
  const [scheduleHour, setScheduleHour] = useState<number>(15);
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState<number>(1);
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState<number>(1);
  const [scheduleActive, setScheduleActive] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const { data: currentSchedule, refetch } = useQuery({
    queryKey: ['schedule-dialog', table, entityId],
    queryFn: async () => {
      if (!entityId) return null;
      const { data } = await (supabase
        .from(table) as any)
        .select('*')
        .eq(entityColumn, entityId)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!entityId && open,
  });

  // Sync form when schedule loads
  useEffect(() => {
    if (currentSchedule && open) {
      setScheduleFreq((currentSchedule as any).frequency ?? 'daily');
      setScheduleHour((currentSchedule as any).scheduled_hour ?? 15);
      setScheduleDayOfWeek((currentSchedule as any).scheduled_day_of_week ?? 1);
      setScheduleDayOfMonth((currentSchedule as any).scheduled_day_of_month ?? 1);
      setScheduleActive((currentSchedule as any).is_active ?? true);
    }
  }, [currentSchedule, open]);

  const handleSave = async () => {
    if (!entityId) return;
    setSaving(true);
    try {
      const nextRunAt = calculateNextRun(scheduleFreq, scheduleHour, scheduleDayOfWeek, scheduleDayOfMonth);
      const payload = {
        [entityColumn]: entityId,
        frequency: scheduleFreq,
        scheduled_hour: scheduleHour,
        scheduled_day_of_week: scheduleDayOfWeek,
        scheduled_day_of_month: scheduleDayOfMonth,
        is_active: scheduleActive,
        next_run_at: nextRunAt.toISOString(),
        timezone: getUserTimezone(),
      };

      const { error } = await (supabase
        .from(table) as any)
        .upsert(payload, { onConflict: entityColumn });

      if (error) throw error;
      toast.success('Agendamento salvo com sucesso!');
      await refetch();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Erro ao salvar agendamento', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {recommendation && (
          <Alert className="border-blue-500/30 bg-blue-500/5">
            <Info className="h-4 w-4 text-blue-500" />
            <AlertDescription className="text-sm text-muted-foreground">
              {recommendation}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-5 py-2">
          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="sched-active" className="text-sm font-medium">Agendamento ativo</Label>
            <Switch id="sched-active" checked={scheduleActive} onCheckedChange={setScheduleActive} />
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Frequência</Label>
            <Select value={scheduleFreq} onValueChange={setScheduleFreq}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowHourly && <SelectItem value="hourly">Por Hora</SelectItem>}
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Hour (hidden for hourly) */}
          {scheduleFreq !== 'hourly' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Hora de execução</Label>
              <Select value={String(scheduleHour)} onValueChange={v => setScheduleHour(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Day of week (weekly only) */}
          {scheduleFreq === 'weekly' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Dia da semana</Label>
              <Select value={String(scheduleDayOfWeek)} onValueChange={v => setScheduleDayOfWeek(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d, i) => (
                    <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Day of month (monthly only) */}
          {scheduleFreq === 'monthly' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Dia do mês</Label>
              <Select value={String(scheduleDayOfMonth)} onValueChange={v => setScheduleDayOfMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>Dia {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Next run preview */}
          <div className="rounded-md bg-muted/20 border border-border/50 px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Próxima execução estimada: </span>
            {formatDateTimeBR(calculateNextRun(scheduleFreq, scheduleHour, scheduleDayOfWeek, scheduleDayOfMonth))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
