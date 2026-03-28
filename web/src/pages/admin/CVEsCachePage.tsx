import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { StatCard } from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useCVECache, useCVESources, CachedCVE } from '@/hooks/useCVECache';
import { useNavigate } from 'react-router-dom';
import {
  Bug, Search, AlertTriangle, ShieldAlert, Shield, RefreshCw,
  ChevronDown, ChevronRight, ExternalLink, Info, Settings, Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PAGE_SIZE = 20;

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-destructive text-destructive-foreground',
  HIGH: 'bg-orange-600 text-white',
  MEDIUM: 'bg-warning text-warning-foreground',
  LOW: 'bg-muted text-muted-foreground',
  UNKNOWN: 'bg-muted text-muted-foreground',
};

const MODULE_COLORS: Record<string, string> = {
  firewall: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  m365: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  external_domain: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const MODULE_LABELS: Record<string, string> = {
  firewall: 'Firewall',
  m365: 'M365',
  external_domain: 'Domínio Externo',
};

function CVECard({ cve }: { cve: CachedCVE }) {
  const [open, setOpen] = useState(false);

  const isNew = (() => {
    if (!cve.published_date) return false;
    const published = new Date(cve.published_date);
    const now = new Date();
    return (now.getTime() - published.getTime()) / (1000 * 3600 * 24) <= 30;
  })();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border border-border/50">
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn('text-xs font-bold', SEVERITY_COLORS[cve.severity] || SEVERITY_COLORS.UNKNOWN)}>
                      {cve.severity}
                    </Badge>
                    <Badge variant="outline" className={cn('text-xs', MODULE_COLORS[cve.module_code] || '')}>
                      {MODULE_LABELS[cve.module_code] || cve.module_code}
                    </Badge>
                    {isNew && (
                      <Badge className="text-xs font-bold bg-emerald-500 text-white border-emerald-500 animate-pulse">
                        NEW
                      </Badge>
                    )}
                    {cve.score != null && (
                      <span className="text-xs font-mono text-muted-foreground">
                        CVSS {Number(cve.score).toFixed(1)}
                      </span>
                    )}
                    <a
                      href={cve.advisory_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
                    >
                      {cve.cve_id}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <CardTitle className="text-sm font-medium leading-snug">
                    {cve.title || cve.cve_id}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {cve.products.slice(0, 4).map((p) => (
                      <Badge key={String(p)} variant="outline" className="text-[10px] py-0">
                        {String(p)}
                      </Badge>
                    ))}
                    {cve.products.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{cve.products.length - 4}</span>
                    )}
                    {cve.published_date && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {new Date(cve.published_date).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="pt-1">
                  {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="text-sm text-muted-foreground leading-relaxed border-t pt-3">
              {cve.description || 'Descrição não disponível.'}
            </div>
            <a
              href={cve.advisory_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1 mt-2"
            >
              Ver advisory completo
              <ExternalLink className="w-3 h-3" />
            </a>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function CVEsCachePage() {
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data: cves, isLoading, refetch } = useCVECache();
  const { data: sources } = useCVESources();

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, filterModule, severityFilter]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    if (!cves) return { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
    return {
      total: cves.length,
      critical: cves.filter(c => c.severity === 'CRITICAL').length,
      high: cves.filter(c => c.severity === 'HIGH').length,
      medium: cves.filter(c => c.severity === 'MEDIUM').length,
      low: cves.filter(c => c.severity === 'LOW').length,
    };
  }, [cves]);

  const filtered = useMemo(() => {
    if (!cves) return [];
    return cves.filter(cve => {
      if (filterModule !== 'all' && cve.module_code !== filterModule) return false;
      if (severityFilter !== 'all' && cve.severity !== severityFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !cve.cve_id.toLowerCase().includes(q) &&
          !(cve.title || '').toLowerCase().includes(q) &&
          !(cve.description || '').toLowerCase().includes(q)
        ) return false;
      }
    return true;
    });
  }, [cves, filterModule, severityFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const displayed = useMemo(() => {
    return filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filtered, page]);

  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filtered.length);

  // Determine last sync time from sources
  const lastSync = useMemo(() => {
    if (!sources || sources.length === 0) return null;
    const synced = sources.filter(s => s.last_sync_at).map(s => new Date(s.last_sync_at!).getTime());
    return synced.length > 0 ? new Date(Math.max(...synced)) : null;
  }, [sources]);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        <PageBreadcrumb items={[
          { label: 'Administração' },
          { label: 'CVEs' },
        ]} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">CVEs</h1>
            <p className="text-muted-foreground">Central de vulnerabilidades da plataforma</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate('/cves/sources')} variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Gerenciar Fontes
            </Button>
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className={cn("w-4 h-4 mr-2", "animate-spin")} />
              Atualizando...
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard title="Total CVEs" value={stats.total} icon={Bug} variant="default" delay={0} compact
            onClick={() => setSeverityFilter('all')} active={severityFilter === 'all'} />
          <StatCard title="Críticos" value={stats.critical} icon={ShieldAlert} variant="destructive" delay={0.05} compact
            onClick={() => setSeverityFilter(prev => prev === 'CRITICAL' ? 'all' : 'CRITICAL')} active={severityFilter === 'CRITICAL'} />
          <StatCard title="Altos" value={stats.high} icon={AlertTriangle} variant="warning" delay={0.1} compact
            onClick={() => setSeverityFilter(prev => prev === 'HIGH' ? 'all' : 'HIGH')} active={severityFilter === 'HIGH'} />
          <StatCard title="Médios" value={stats.medium} icon={Info} variant="warning" delay={0.15} compact
            onClick={() => setSeverityFilter(prev => prev === 'MEDIUM' ? 'all' : 'MEDIUM')} active={severityFilter === 'MEDIUM'} />
          <StatCard title="Baixos" value={stats.low} icon={Shield} variant="default" delay={0.2} compact
            onClick={() => setSeverityFilter(prev => prev === 'LOW' ? 'all' : 'LOW')} active={severityFilter === 'LOW'} />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por CVE ID ou descrição..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Módulo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os módulos</SelectItem>
              <SelectItem value="firewall">Firewall</SelectItem>
              <SelectItem value="m365">Microsoft 365</SelectItem>
              <SelectItem value="external_domain">Domínio Externo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* CVE List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Database className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {(cves?.length ?? 0) === 0
                ? 'Nenhuma CVE no cache. Clique em "Configurar Fontes" e sincronize.'
                : 'Nenhuma CVE encontrada para os filtros selecionados.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Mostrando {rangeStart}-{rangeEnd} de {filtered.length} CVEs
              {filtered.length !== (cves?.length ?? 0) && ` (total: ${cves?.length ?? 0})`}
              {lastSync && (
                <> · Última sincronização {formatDistanceToNow(lastSync, { addSuffix: true, locale: ptBR })}</>
              )}
            </p>
            {displayed.map((cve) => (
              <CVECard key={cve.id} cve={cve} />
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

    </AppLayout>
  );
}
