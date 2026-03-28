import { Card, CardContent } from '@/components/ui/card';
import { ScoreGauge } from '@/components/ScoreGauge';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Bug, Forward, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExchangeDashboardData } from '@/hooks/useExchangeDashboard';

interface EmailSecurityScoreCardProps {
  data: ExchangeDashboardData | null;
  loading?: boolean;
}

interface ScoreFactor {
  label: string;
  icon: React.ElementType;
  score: number;
  status: 'Bom' | 'Moderado' | 'Crítico';
  color: string;
}

function computeScore(data: ExchangeDashboardData): { total: number; factors: ScoreFactor[] } {
  const totalTraffic = Math.max(1, data.traffic.sent + data.traffic.received);

  // Phishing protection (30%)
  const phishingRatio = (data.security.phishing / totalTraffic) * 10000;
  const phishingScore = Math.max(0, Math.min(100, 100 - phishingRatio));

  // Malware detection (25%)
  const malwareRatio = (data.security.malware / totalTraffic) * 10000;
  const malwareScore = Math.max(0, Math.min(100, 100 - malwareRatio));

  // Forwarding exposure (25%)
  const forwardingScore = data.mailboxes.forwardingEnabled > 0
    ? Math.max(0, 100 - data.mailboxes.forwardingEnabled * 10)
    : 100;

  // Mailbox activity (20%)
  const inactiveRatio = data.mailboxes.total > 0
    ? (data.mailboxes.notLoggedIn30d / data.mailboxes.total) * 200
    : 0;
  const activityScore = Math.max(0, Math.min(100, 100 - inactiveRatio));

  const total = Math.round(
    phishingScore * 0.3 + malwareScore * 0.25 + forwardingScore * 0.25 + activityScore * 0.2
  );

  const getStatus = (s: number): 'Bom' | 'Moderado' | 'Crítico' =>
    s >= 75 ? 'Bom' : s >= 50 ? 'Moderado' : 'Crítico';
  const getColor = (s: number) =>
    s >= 75
      ? 'bg-green-500/15 text-green-400 border-green-500/30'
      : s >= 50
        ? 'bg-warning/15 text-warning border-warning/30'
        : 'bg-destructive/15 text-destructive border-destructive/30';

  return {
    total,
    factors: [
      { label: 'Proteção Phishing', icon: ShieldAlert, score: Math.round(phishingScore), status: getStatus(phishingScore), color: getColor(phishingScore) },
      { label: 'Detecção Malware', icon: Bug, score: Math.round(malwareScore), status: getStatus(malwareScore), color: getColor(malwareScore) },
      { label: 'Exposição Forwarding', icon: Forward, score: Math.round(forwardingScore), status: getStatus(forwardingScore), color: getColor(forwardingScore) },
      { label: 'Atividade Mailboxes', icon: Activity, score: Math.round(activityScore), status: getStatus(activityScore), color: getColor(activityScore) },
    ],
  };
}

export function EmailSecurityScoreCard({ data, loading }: EmailSecurityScoreCardProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="py-8 flex flex-col items-center gap-6">
          <Skeleton className="w-[160px] h-[160px] rounded-full" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { total, factors } = computeScore(data);

  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="py-8">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          <div className="flex flex-col items-center gap-3 shrink-0">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Email Security Score</h3>
            <ScoreGauge score={total} size="md" />
            <Progress value={total} className="w-40 h-2" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
            {factors.map((f) => (
              <div key={f.label} className="rounded-lg border border-border/50 bg-secondary/30 p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <f.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">{f.label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold tabular-nums text-foreground">{f.score}</span>
                  <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', f.color)}>
                    {f.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
