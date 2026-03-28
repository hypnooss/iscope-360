import { useEffect, useState, useCallback } from 'react';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useModules } from '@/contexts/ModuleContext';
import { useEffectiveModules } from '@/hooks/useEffectiveModules';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useDashboardStats, ModuleHealth, SeverityBlock } from '@/hooks/useDashboardStats';
import { useTopCVEs, TopCVE } from '@/hooks/useTopCVEs';

import { MODULE_DASHBOARD_CONFIG } from '@/config/moduleDashboardConfig';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreSparkline } from '@/components/dashboard/ScoreSparkline';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Shield, Cloud, Layers, Server, ArrowRight,
  AlertTriangle, ShieldAlert, LucideIcon, Building2, Bot,
  Globe, Network, CheckCircle2, Info, ExternalLink, Users,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

// ─── Icon map: resolves DB string → Lucide component ────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Shield, Cloud, Layers, Globe, Server, Network, Bot,
};

// ─── Static color maps for Tailwind JIT ──
const BORDER_COLOR_MAP: Record<string, string> = {
  'orange-500': 'border-l-orange-500',
  'blue-500': 'border-l-blue-500',
  'green-500': 'border-l-green-500',
  'primary': 'border-l-primary',
  'red-500': 'border-l-red-500',
  'violet-500': 'border-l-violet-500',
  'yellow-500': 'border-l-yellow-500',
  'cyan-500': 'border-l-cyan-500',
};

const ICON_BG_MAP: Record<string, string> = {
  'orange-500': 'bg-orange-500/10',
  'blue-500': 'bg-blue-500/10',
  'green-500': 'bg-green-500/10',
  'primary': 'bg-primary/10',
  'red-500': 'bg-red-500/10',
  'violet-500': 'bg-violet-500/10',
  'yellow-500': 'bg-yellow-500/10',
  'cyan-500': 'bg-cyan-500/10',
};

const PROGRESS_COLOR_MAP: Record<string, string> = {
  'orange-500': 'bg-orange-500',
  'blue-500': 'bg-blue-500',
  'green-500': 'bg-green-500',
  'primary': 'bg-primary',
};

function getScoreHslColor(score: number | null): string {
  if (score == null) return 'hsl(0, 0%, 50%)';
  if (score >= 90) return 'hsl(175, 80%, 45%)';
  if (score >= 75) return 'hsl(158, 64%, 52%)';
  if (score >= 60) return 'hsl(48, 96%, 53%)';
  return 'hsl(351, 95%, 72%)';
}

// ─── Score color helper ───────────────────────────────────────────────────────
function getScoreColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 90) return 'text-primary';
  if (score >= 75) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-500';
  return 'text-rose-400';
}

function getScoreProgressColor(score: number | null): string {
  if (score == null) return 'bg-muted-foreground';
  if (score >= 90) return 'bg-primary';
  if (score >= 75) return 'bg-emerald-400';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-rose-400';
}

// ─── Severity Badge Row ───────────────────────────────────────────────────────

const SEVERITY_ITEMS = [
  { key: 'critical' as const, label: 'Crítico', badgeCn: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { key: 'high' as const, label: 'Alto', badgeCn: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  { key: 'medium' as const, label: 'Médio', badgeCn: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { key: 'low' as const, label: 'Baixo', badgeCn: 'bg-blue-400/15 text-blue-400 border-blue-400/30' },
] as const;

function SeverityBadgeRow({ severities }: { severities: SeverityBlock }) {
  const total = severities.critical + severities.high + severities.medium + severities.low;
  if (total === 0) {
    return (
      <div className="flex items-center gap-1.5 text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="text-xs">Nenhum alerta</span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-2">
      {SEVERITY_ITEMS.map(({ key, label, badgeCn }) => (
        <Badge
          key={key}
          className={cn(
            'text-xs gap-1 px-2 py-0.5 justify-center',
            badgeCn,
            severities[key] === 0 && 'opacity-40',
          )}
        >
          {severities[key]} {label}
        </Badge>
      ))}
    </div>
  );
}


// ─── Module Health Card ───────────────────────────────────────────────────────

interface ModuleHealthCardProps {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  borderColor: string;
  colorBase: string;
  health: ModuleHealth;
  loading: boolean;
  topCves?: TopCVE[];
  onAccessCompliance: () => void;
  onAccessCves?: () => void;
}

function CveSeverityIcon({ severity }: { severity: string }) {
  const color =
    severity === 'CRITICAL' ? 'text-red-400' :
    severity === 'HIGH' ? 'text-orange-400' :
    severity === 'MEDIUM' ? 'text-amber-400' : 'text-blue-400';
  return <AlertTriangle className={cn('w-3.5 h-3.5 shrink-0', color)} />;
}

function ModuleHealthCard({
  title, icon: Icon, iconColor, iconBg, borderColor, colorBase,
  health, loading, topCves, onAccessCompliance, onAccessCves,
}: ModuleHealthCardProps) {
  const hasCves = !!health.cveSeverities;
  

  return (
    <Card className={cn('glass-card border-l-4 transition-all duration-200 hover:shadow-lg', borderColor)}>
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Header: icon + title left, last analysis right */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className={cn('p-1.5 rounded-lg', iconBg)}>
                  <Icon className={cn('w-4 h-4', iconColor)} />
                </div>
                <h3 className="font-semibold text-foreground text-sm">{title}</h3>
              </div>
              {health.lastAnalysisDate ? (
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(health.lastAnalysisDate), { addSuffix: true, locale: ptBR })}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Sem análise</span>
              )}
            </div>

            {/* Sparkline + Score (horizontal) */}
            <div className="flex items-center gap-6">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-1 min-w-0">
                    <ScoreSparkline data={health.scoreHistory} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Score nos últimos 30 dias</TooltipContent>
              </Tooltip>
              <div className="shrink-0 flex flex-col items-center">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Score Atual</span>
                <span className={cn('text-lg font-bold tabular-nums leading-tight', getScoreColor(health.score))}>
                  {health.score != null ? `${health.score}` : '—'}
                  <span className="text-[10px] font-normal text-muted-foreground">/100</span>
                </span>
              </div>
            </div>

            {/* Conformidade severities */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Conformidade</span>
              <SeverityBadgeRow severities={health.severities} />
            </div>

            {/* Top CVEs list */}
            {topCves && topCves.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Alertas de CVE</span>
                <div className="space-y-1">
                  {topCves.map((cve) => (
                    <div key={cve.id} className="flex items-center gap-2 text-xs">
                      <CveSeverityIcon severity={cve.severity} />
                      <span className="text-foreground font-medium truncate flex-1">{cve.id}</span>
                      <span className="text-muted-foreground tabular-nums shrink-0">CVSS {cve.score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex gap-2 pt-1 mt-auto">
              <Button
                variant="outline"
                size="sm"
                className={cn('text-xs h-7', hasCves && onAccessCves ? 'flex-1' : 'w-full')}
                onClick={(e) => { e.stopPropagation(); onAccessCompliance(); }}
              >
                Conformidade
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
              {hasCves && onAccessCves && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-7"
                  onClick={(e) => { e.stopPropagation(); onAccessCves(); }}
                >
                  CVEs
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const emptyHealth: ModuleHealth = {
  score: null,
  assetCount: 0,
  lastAnalysisDate: null,
  severities: { critical: 0, high: 0, medium: 0, low: 0 },
  scoreHistory: [],
};

export default function GeneralDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { setActiveModule } = useModules();
  const { effectiveUserModules } = useEffectiveModules();
  const { effectiveRole } = useEffectiveAuth();
  const navigate = useNavigate();

  const isSuperRole = effectiveRole === 'super_admin' || effectiveRole === 'super_suporte';
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);

  const { selectedWorkspaceId, setSelectedWorkspaceId } = useWorkspaceSelector(workspaces.length > 0 ? workspaces : undefined, isSuperRole);

  const { stats, loading } = useDashboardStats(selectedWorkspaceId);
  const topCvesByModule = useTopCVEs(selectedWorkspaceId ? [selectedWorkspaceId] : undefined);

  // Fetch workspaces for super roles
  useEffect(() => {
    if (!isSuperRole) return;
    const fetchWorkspaces = async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (data && data.length > 0) {
        setWorkspaces(data);
      }
    };
    fetchWorkspaces();
  }, [isSuperRole]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const handleGoToModule = (moduleCode: string, path: string) => {
    setActiveModule(moduleCode as any);
    navigate(path);
  };

  // ─── Build dynamic module cards from effectiveUserModules + config ──────────

  type CardDef = {
    key: string;
    title: string;
    icon: LucideIcon;
    iconColor: string;
    iconBg: string;
    borderColor: string;
    colorBase: string;
    health: ModuleHealth;
    moduleCode: string;
    path: string;
    cvePath?: string;
    infraLabel: string;
  };

  const moduleCards: CardDef[] = effectiveUserModules
    .filter(um => um.permission !== 'none')
    .map(um => {
      const config = MODULE_DASHBOARD_CONFIG[um.module.code];
      if (!config) return null;

      const Icon = ICON_MAP[um.module.icon || ''] || Shield;
      const colorBase = um.module.color?.replace('text-', '') || 'primary';

      return {
        key: um.module.code,
        title: um.module.name,
        icon: Icon,
        iconColor: um.module.color || 'text-primary',
        iconBg: ICON_BG_MAP[colorBase] || 'bg-primary/10',
        borderColor: BORDER_COLOR_MAP[colorBase] || 'border-l-primary',
        colorBase,
        health: stats?.modules[config.statsKey] || emptyHealth,
        moduleCode: um.module.code,
        path: config.path,
        cvePath: config.cvePath,
        infraLabel: config.infraLabel,
      } as CardDef;
    })
    .filter(Boolean) as CardDef[];

  // ─── Derived metrics ───────────────────────────────────────────────────────

  const lastOverallScan = stats
    ? Object.values(stats.modules)
        .map(m => m.lastAnalysisDate)
        .filter(Boolean)
        .sort()
        .pop() || null
    : null;

  const agentStatusColor = stats
    ? stats.agentsTotal === 0
      ? 'bg-muted-foreground'
      : stats.agentsOnline === stats.agentsTotal
      ? 'bg-emerald-500'
      : stats.agentsOnline > 0
      ? 'bg-yellow-500'
      : 'bg-destructive'
    : 'bg-muted-foreground';

  const gridCols = moduleCards.length <= 2
    ? 'grid-cols-1 md:grid-cols-2'
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  // Infrastructure grid: modules + m365 users (if applicable) + agents (always present)
  const hasM365Module = moduleCards.some(c => c.moduleCode === 'scope_m365');
  const hasM365Users = hasM365Module && (stats?.m365ActiveUsers ?? 0) > 0;
  const infraColCount = moduleCards.length + (hasM365Users ? 1 : 0) + 1; // +1 for Agents
  const infraGridCols = infraColCount <= 2
    ? 'grid-cols-2'
    : infraColCount === 3
    ? 'grid-cols-2 lg:grid-cols-3'
    : infraColCount <= 4
    ? 'grid-cols-2 lg:grid-cols-4'
    : 'grid-cols-2 lg:grid-cols-5';

  if (authLoading) return null;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb items={[{ label: 'Dashboard' }]} />

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Postura de Compliance por Módulo</p>
          </div>
          {isSuperRole && workspaces.length > 0 && (
            <Select
              value={selectedWorkspaceId ?? ''}
              onValueChange={(v) => setSelectedWorkspaceId(v)}
            >
              <SelectTrigger className="w-[220px] bg-background">
                <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Selecione um workspace" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Module Health Cards */}
        <section>
          <div className={cn('grid gap-4', gridCols)}>
            {moduleCards.map((card) => {
              const config = MODULE_DASHBOARD_CONFIG[card.moduleCode];
              const statsKey = config?.statsKey;
              return (
                <ModuleHealthCard
                  key={card.key}
                  title={card.title}
                  icon={card.icon}
                  iconColor={card.iconColor}
                  iconBg={card.iconBg}
                  borderColor={card.borderColor}
                  colorBase={card.colorBase}
                  health={card.health}
                  loading={loading}
                  topCves={statsKey ? topCvesByModule[statsKey] : undefined}
                  onAccessCompliance={() => handleGoToModule(card.moduleCode, card.path)}
                  onAccessCves={card.cvePath ? () => handleGoToModule(card.moduleCode, card.cvePath!) : undefined}
                />
              );
            })}
          </div>
        </section>

        {/* Infrastructure Card */}
        <section>
          <Card
            className="glass-card border-t-4 border-t-violet-500 cursor-pointer hover:scale-[1.01] transition-all duration-200 hover:shadow-lg"
            onClick={() => navigate('/agents')}
          >
            <CardContent className="p-5">
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-60" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <div className="p-2 rounded-lg bg-violet-500/10">
                        <Server className="w-5 h-5 text-violet-500" />
                      </div>
                      <h3 className="font-semibold text-foreground">Infraestrutura</h3>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>

                  {/* Assets by module - dynamic */}
                  <div className={cn('grid gap-4', infraGridCols)}>
                    {moduleCards.map((card) => {
                      const CardIcon = card.icon;
                      return (
                        <div key={card.key} className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-1.5">
                            <CardIcon className={cn('w-4 h-4', card.iconColor)} />
                            <span className="text-base text-muted-foreground">{card.title}</span>
                          </div>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Total</span>
                          <span className="text-lg font-bold text-foreground">
                            {card.health.assetCount}
                          </span>
                        </div>
                      );
                    })}

                    {/* M365 Active Users - only when module is active and data exists */}
                    {hasM365Users && (
                      <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-violet-500" />
                          <span className="text-base text-muted-foreground">Usuários M365</span>
                        </div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Ativos</span>
                        <span className="text-lg font-bold text-foreground">
                          {stats?.m365ActiveUsers?.toLocaleString('pt-BR') ?? 0}
                        </span>
                      </div>
                    )}

                    {/* Agents - always present */}
                    <div className="flex flex-col items-center gap-0.5 p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-1.5">
                        <Bot className="w-4 h-4 text-violet-500" />
                        <span className="text-base text-muted-foreground">Agents</span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Online</span>
                      <span className="text-lg font-bold text-foreground">
                        {stats?.agentsOnline ?? 0}/{stats?.agentsTotal ?? 0}
                      </span>
                    </div>
                  </div>

                  {/* Last scan */}
                  {lastOverallScan && (
                    <p className="text-xs text-muted-foreground">
                      Último scan:{' '}
                      {formatDistanceToNow(new Date(lastOverallScan), { addSuffix: true, locale: ptBR })}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}
