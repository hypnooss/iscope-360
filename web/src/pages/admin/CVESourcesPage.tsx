import { useState, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCVESources, useCVESyncHistory, CVESource, CVESyncHistoryRow } from '@/hooks/useCVECache';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RefreshCw, CheckCircle2, XCircle, Clock, Database,
  Shield, AlertTriangle, Activity, Layers, ArrowLeft,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatShortDateTimeBR } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

// ── Constants ──

const MODULE_LABELS: Record<string, string> = {
  firewall: 'Firewall',
  m365: 'Microsoft 365',
  external_domain: 'Domínio Externo',
};

const MODULE_COLORS: Record<string, string> = {
  firewall: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  m365: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  external_domain: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; label: string; className: string }> = {
  success: { icon: CheckCircle2, label: 'Sincronizado', className: 'text-emerald-400' },
  error: { icon: XCircle, label: 'Erro', className: 'text-rose-400' },
  syncing: { icon: RefreshCw, label: 'Sincronizando...', className: 'text-blue-400 animate-spin' },
  pending: { icon: Clock, label: 'Pendente', className: 'text-muted-foreground' },
};

const TIMELINE_STATUS_LABELS: Record<string, string> = {
  success: 'Sucesso',
  error: 'Erro',
  partial: 'Parcial',
};

const STATUS_BAR_COLORS: Record<string, string> = {
  success: '#10b981',
  error: '#ef4444',
  partial: '#f59e0b',
};

// ── Helpers ──

function formatDurationMs(ms: number | null): string {
  if (!ms) return '—';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

// ── SyncTimeline component ──

function SyncTimeline({ sourceId, history }: { sourceId: string; history: CVESyncHistoryRow[] }) {
  const [period, setPeriod] = useState<'24h' | '48h' | '7d'>('24h');

  const cutoff = useMemo(() => {
    const hours = period === '24h' ? 24 : period === '48h' ? 48 : 168;
    return new Date(Date.now() - hours * 60 * 60 * 1000);
  }, [period]);

  const filtered = useMemo(() => {
    return history
      .filter(h => h.source_id === sourceId && new Date(h.created_at) >= cutoff)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [history, sourceId, cutoff]);

  const counts = useMemo(() => {
    let success = 0, fail = 0;
    for (const t of filtered) {
      if (t.status === 'success') success++;
      else if (t.status === 'error') fail++;
    }
    return { total: filtered.length, success, fail };
  }, [filtered]);

  return (
    <div className="pl-16 pr-6 py-6 bg-muted/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          {(['24h', '48h', '7d'] as const).map(p => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                "h-7 px-3 text-xs font-medium",
                period === p && "bg-primary text-primary-foreground shadow-sm"
              )}
              onClick={() => setPeriod(p)}
            >
              {p === '7d' ? '7 dias' : p}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{counts.total} sincronizações</span>
          {counts.success > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              {counts.success} ✓
            </span>
          )}
          {counts.fail > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              {counts.fail} ✗
            </span>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nenhuma sincronização neste período.</p>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="flex w-full h-5 rounded-md overflow-hidden bg-muted/30">
            {filtered.map((t, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <button
                    className="h-full flex-1 min-w-[2px] transition-opacity hover:opacity-75 focus:outline-none focus:ring-1 focus:ring-ring focus:ring-inset"
                    style={{ backgroundColor: STATUS_BAR_COLORS[t.status] || '#6b7280' }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs max-w-[250px]">
                  <div className="font-medium">{TIMELINE_STATUS_LABELS[t.status] || t.status}</div>
                  <div className="text-muted-foreground">{formatShortDateTimeBR(t.created_at)}</div>
                  <div className="text-muted-foreground">Duração: {formatDurationMs(t.duration_ms)}</div>
                  {t.cve_count > 0 && (
                    <div className="text-muted-foreground">{t.cve_count} CVEs</div>
                  )}
                  {t.error_message && (
                    <div className="text-rose-400 mt-1 line-clamp-2">{t.error_message}</div>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

// ── Main Page ──

export default function CVESourcesPage() {
  const { data: sources, isLoading } = useCVESources();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const expandedSourceIds = useMemo(() => {
    return Array.from(expandedIds);
  }, [expandedIds]);

  const { data: syncHistory } = useCVESyncHistory(expandedSourceIds);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stats = useMemo(() => {
    if (!sources) return { total: 0, active: 0, errors: 0, totalCves: 0 };
    return {
      total: sources.length,
      active: sources.filter(s => s.is_active).length,
      errors: sources.filter(s => s.last_sync_status === 'error').length,
      totalCves: sources.reduce((acc, s) => acc + (s.last_sync_count || 0), 0),
    };
  }, [sources]);

  const handleToggle = async (source: CVESource) => {
    const { error } = await supabase
      .from('cve_sources')
      .update({ is_active: !source.is_active })
      .eq('id', source.id);

    if (error) {
      toast.error('Erro ao atualizar fonte');
    } else {
      toast.success(`Fonte ${!source.is_active ? 'ativada' : 'desativada'}`);
      queryClient.invalidateQueries({ queryKey: ['cve-sources'] });
    }
  };

  const handleSync = async (source: CVESource) => {
    setSyncingId(source.id);
    try {
      const { error } = await supabase.functions.invoke('refresh-cve-cache', {
        body: { source_id: source.id },
      });
      if (error) throw error;
      toast.success(`Sincronização de "${source.source_label}" iniciada`);
      queryClient.invalidateQueries({ queryKey: ['cve-sources'] });
      queryClient.invalidateQueries({ queryKey: ['cve-cache'] });
      queryClient.invalidateQueries({ queryKey: ['cve-sync-history'] });
    } catch {
      toast.error('Erro ao iniciar sincronização');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const { error } = await supabase.functions.invoke('refresh-cve-cache', {
        body: {},
      });
      if (error) throw error;
      toast.success('Sincronização de todas as fontes iniciada');
      queryClient.invalidateQueries({ queryKey: ['cve-sources'] });
      queryClient.invalidateQueries({ queryKey: ['cve-cache'] });
      queryClient.invalidateQueries({ queryKey: ['cve-sync-history'] });
    } catch {
      toast.error('Erro ao iniciar sincronização');
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <PageBreadcrumb items={[
          { label: 'Administração' },
          { label: 'CVEs', href: '/cves' },
          { label: 'Fontes' },
        ]} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/cves')} className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fontes de CVE</h1>
              <p className="text-muted-foreground">Gerencie as fontes de sincronização de vulnerabilidades por produto</p>
            </div>
          </div>
          <Button onClick={handleSyncAll} disabled={syncingAll} variant="outline" size="sm">
            <RefreshCw className={cn('w-4 h-4 mr-2', syncingAll && 'animate-spin')} />
            Sincronizar Todas
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total Fontes" value={stats.total} icon={Layers} variant="default" delay={0} compact />
          <StatCard title="Ativas" value={stats.active} icon={Activity} variant="default" delay={0.05} compact />
          <StatCard title="CVEs Sincronizados" value={stats.totalCves} icon={Shield} variant="default" delay={0.1} compact />
          <StatCard title="Com Erro" value={stats.errors} icon={AlertTriangle} variant={stats.errors > 0 ? 'destructive' : 'default'} delay={0.15} compact />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !sources || sources.length === 0 ? (
          <Card className="p-12 text-center">
            <Database className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma fonte configurada.</p>
          </Card>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead>Fonte</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Sync</TableHead>
                  <TableHead>Próxima Execução</TableHead>
                  <TableHead className="text-right">CVEs</TableHead>
                  <TableHead className="w-24 text-center">Ativa</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map(source => {
                  const isExpanded = expandedIds.has(source.id);
                  const statusConfig = STATUS_CONFIG[source.last_sync_status || 'pending'] || STATUS_CONFIG.pending;
                  const StatusIcon = statusConfig.icon;
                  const isSyncing = syncingId === source.id;

                  return (
                    <Fragment key={source.id}>
                      <TableRow
                        className={cn("cursor-pointer", isExpanded && "bg-muted/30")}
                        onClick={() => toggleExpand(source.id)}
                      >
                        <TableCell className="w-10">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {source.source_label}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', MODULE_COLORS[source.module_code] || '')}>
                            {MODULE_LABELS[source.module_code] || source.module_code}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusIcon className={cn('w-4 h-4', statusConfig.className)} />
                            <span className="text-sm text-muted-foreground">{statusConfig.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {source.last_sync_at
                            ? formatDistanceToNow(new Date(source.last_sync_at), { addSuffix: true, locale: ptBR })
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {source.next_run_at
                            ? renderNextRun(source.next_run_at)
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {source.last_sync_count || 0}
                        </TableCell>
                        <TableCell className="text-center" onClick={e => e.stopPropagation()}>
                          <Switch
                            checked={source.is_active}
                            onCheckedChange={() => handleToggle(source)}
                          />
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!source.is_active || isSyncing}
                            onClick={() => handleSync(source)}
                          >
                            <RefreshCw className={cn('w-4 h-4 mr-1', isSyncing && 'animate-spin')} />
                            Sync
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${source.id}-timeline`}>
                          <TableCell colSpan={9} className="p-0 pb-2 border-b border-border/50">
                            <SyncTimeline
                              sourceId={source.id}
                              history={syncHistory || []}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ── Next run renderer ──

function renderNextRun(nextRunAt: string) {
  const next = new Date(nextRunAt);
  const now = new Date();
  const diffMin = Math.round((next.getTime() - now.getTime()) / 60000);

  if (diffMin < -5) {
    return <span className="text-destructive font-medium">Atrasado</span>;
  }
  if (diffMin < 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
        </span>
        <span className="text-amber-400 font-medium">Executando...</span>
      </div>
    );
  }
  const relative = formatDistanceToNow(next, { addSuffix: true, locale: ptBR });
  return <span className="text-foreground">{relative}</span>;
}
