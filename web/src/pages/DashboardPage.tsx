import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreSparkline } from '@/components/dashboard/ScoreSparkline';
import {
  Shield, Cloud, Layers, Globe, Server, ArrowRight,
  CheckCircle2, LucideIcon, Bot,
  Users, ExternalLink, Cpu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Health Block Type ────────────────────────────────────────────────────────

interface SeverityBlock {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface ModuleHealth {
  score: number | null;
  assetCount: number;
  lastAnalysisDate: string | null;
  severities: SeverityBlock;
  scoreHistory: { date: string; score: number }[];
  hasCves?: boolean;
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {SEVERITY_ITEMS.map(({ key, label, badgeCn }) => (
        <Badge
          key={key}
          className={cn(
            'text-[10px] gap-1 px-2 py-0.5 justify-center font-medium',
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
  health: ModuleHealth;
  loading?: boolean;
}

function getScoreColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground';
  if (score >= 90) return 'text-primary';
  if (score >= 75) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-500';
  return 'text-rose-400';
}

function ModuleHealthCard({
  title, icon: Icon, iconColor, iconBg, borderColor, health, loading
}: ModuleHealthCardProps) {
  return (
    <Card className={cn('glass-card border-l-4 transition-all duration-200 hover:shadow-lg bg-card/40 border-l-primary', borderColor)}>
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
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

            <div className="flex items-center gap-6">
              <div className="flex-1 min-w-0">
                <ScoreSparkline data={health.scoreHistory} />
              </div>
              <div className="shrink-0 flex flex-col items-center">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Score</span>
                <span className={cn('text-lg font-bold tabular-nums leading-tight', getScoreColor(health.score))}>
                  {health.score != null ? `${health.score}` : '—'}
                  <span className="text-[10px] font-normal text-muted-foreground">/100</span>
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">Postura</span>
              <SeverityBadgeRow severities={health.severities} />
            </div>

            <div className="flex gap-2 pt-1 mt-auto">
              <Button variant="outline" size="sm" className="w-full text-xs h-7 border-border/50">
                Ver Detalhes
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_STATS: Record<string, ModuleHealth> = {
  scope_m365: {
    score: 85,
    assetCount: 1240,
    lastAnalysisDate: new Date(Date.now() - 3600000).toISOString(),
    severities: { critical: 2, high: 5, medium: 12, low: 34 },
    scoreHistory: Array.from({ length: 30 }, (_, _index) => ({ date: '', score: 70 + Math.random() * 20 }))
  },
  scope_compliance: {
    score: 92,
    assetCount: 8,
    lastAnalysisDate: new Date(Date.now() - 86400000).toISOString(),
    severities: { critical: 0, high: 1, medium: 3, low: 10 },
    scoreHistory: Array.from({ length: 30 }, (_, _index) => ({ date: '', score: 85 + Math.random() * 10 }))
  },
  scope_domains: {
    score: 64,
    assetCount: 42,
    lastAnalysisDate: new Date(Date.now() - 7200000).toISOString(),
    severities: { critical: 1, high: 4, medium: 8, low: 15 },
    scoreHistory: Array.from({ length: 30 }, (_, _index) => ({ date: '', score: 60 + Math.random() * 15 }))
  },
  scope_firewall: {
    score: 78,
    assetCount: 15,
    lastAnalysisDate: new Date(Date.now() - 14400000).toISOString(),
    severities: { critical: 0, high: 2, medium: 5, low: 20 },
    scoreHistory: Array.from({ length: 30 }, (_, _index) => ({ date: '', score: 75 + Math.random() * 8 }))
  }
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [loading] = useState(false);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
        <PageBreadcrumb items={[{ label: 'Dashboard' }]} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">Visão consolidada da postura de segurança V2.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Sistema Operacional</span>
          </div>
        </div>

        {/* Health Cards Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ModuleHealthCard
            title="Microsoft 365"
            icon={Cloud}
            iconColor="text-blue-400"
            iconBg="bg-blue-400/10"
            borderColor="border-l-blue-500"
            health={MOCK_STATS.scope_m365}
            loading={loading}
          />
          <ModuleHealthCard
            title="Compliance"
            icon={Shield}
            iconColor="text-primary"
            iconBg="bg-primary/10"
            borderColor="border-l-primary"
            health={MOCK_STATS.scope_compliance}
            loading={loading}
          />
          <ModuleHealthCard
            title="External Domains"
            icon={Globe}
            iconColor="text-orange-400"
            iconBg="bg-orange-400/10"
            borderColor="border-l-orange-500"
            health={MOCK_STATS.scope_domains}
            loading={loading}
          />
          <ModuleHealthCard
            title="Cloud Proxy"
            icon={Layers}
            iconColor="text-violet-400"
            iconBg="bg-violet-400/10"
            borderColor="border-l-violet-500"
            health={MOCK_STATS.scope_firewall}
            loading={loading}
          />
        </section>

        {/* Infrastructure & Agents */}
        <section>
          <Card className="glass-card border-t-2 border-t-primary/40 bg-card/30">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Server className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-lg text-foreground">Infraestrutura Local</h3>
                  </div>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Monitoramento em tempo real de Agents e Super Agents distribuídos no ambiente cliente e proxy distribuído.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 lg:gap-12 shrink-0">
                  <div className="flex flex-col items-center lg:items-start gap-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Bot className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Agents</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">12</span>
                      <span className="text-xs text-muted-foreground">/ 12 online</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center lg:items-start gap-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Cpu className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">Super Agents</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">4</span>
                      <span className="text-xs text-muted-foreground">/ 4 online</span>
                    </div>
                  </div>

                  <div className="hidden sm:flex flex-col items-center lg:items-start gap-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span className="text-xs font-medium uppercase tracking-wider">M365 Users</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">1.2k+</span>
                    </div>
                  </div>
                </div>

                <Button variant="ghost" className="shrink-0 group hover:bg-primary/5">
                  Expandir Infraestrutura
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}
