import { Activity, Shield, ShieldAlert, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { AnalyzerSnapshot } from '@/types/analyzerInsights';

interface AnalyzerStatsCardsProps {
  snapshot: AnalyzerSnapshot;
}

export function AnalyzerStatsCards({ snapshot }: AnalyzerStatsCardsProps) {
  const metrics = snapshot.metrics;
  const totalEvents = metrics.totalEvents || 0;
  const totalDenied = metrics.totalDenied || 0;
  const authSuccesses = (metrics.firewallAuthSuccesses || 0) + (metrics.vpnSuccesses || 0);
  const authFailures = (metrics.firewallAuthFailures || 0) + (metrics.vpnFailures || 0);
  const totalAuth = authSuccesses + authFailures;

  const blockRate = totalEvents > 0 ? ((totalDenied / totalEvents) * 100).toFixed(1) : '0.0';
  const authSuccessRate = totalAuth > 0 ? ((authSuccesses / totalAuth) * 100).toFixed(0) : '0';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Eventos Totais */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-4 flex items-center gap-3">
          <Activity className="w-8 h-8 text-teal-400" />
          <div>
            <p className="text-2xl font-bold">{totalEvents.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Eventos Totais</p>
          </div>
        </CardContent>
      </Card>

      {/* Taxa de Bloqueio */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-4 flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-red-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{blockRate}%</p>
              <p className="text-xs text-muted-foreground">({totalDenied.toLocaleString()})</p>
            </div>
            <p className="text-xs text-muted-foreground">Taxa de Bloqueio</p>
          </div>
        </CardContent>
      </Card>

      {/* Autenticações */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-4 flex items-center gap-3">
          <Shield className="w-8 h-8 text-amber-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{totalAuth.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{authSuccessRate}% OK</p>
            </div>
            <p className="text-xs text-muted-foreground">Autenticações</p>
          </div>
        </CardContent>
      </Card>

      {/* Score de Segurança */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-green-500" />
          <div>
            <p className="text-2xl font-bold">{snapshot.score || 0}</p>
            <p className="text-xs text-muted-foreground">Score de Segurança</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
