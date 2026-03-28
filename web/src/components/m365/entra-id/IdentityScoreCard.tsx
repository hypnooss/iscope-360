import { Card, CardContent } from '@/components/ui/card';
import { ScoreGauge } from '@/components/ScoreGauge';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, KeyRound, Users, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';

interface IdentityScoreCardProps {
  data: EntraIdDashboardData | null;
  loading?: boolean;
}

interface ScoreFactor {
  label: string;
  icon: React.ElementType;
  score: number;
  status: 'Bom' | 'Moderado' | 'Crítico';
  color: string;
}

function computeScore(data: EntraIdDashboardData): { total: number; factors: ScoreFactor[] } {
  // MFA Coverage (40% weight)
  const mfaCoverage = data.mfa.total > 0 ? (data.mfa.enabled / data.mfa.total) * 100 : 0;
  const mfaScore = Math.min(100, mfaCoverage);

  // Admin Exposure (20% weight) — fewer global admins = better
  const adminRatio = data.users.total > 0 ? (data.admins.globalAdmins / data.users.total) * 100 : 0;
  const adminScore = adminRatio > 5 ? 30 : adminRatio > 2 ? 60 : adminRatio > 0.5 ? 85 : 100;

  // Identity Risk (25% weight)
  const riskPenalty = (data.risks.riskyUsers * 5) + (data.risks.compromised * 20);
  const riskScore = Math.max(0, 100 - riskPenalty);

  // Password Security (15% weight)
  const totalPwdActivity = data.passwordActivity.resets + data.passwordActivity.forcedChanges + data.passwordActivity.selfService;
  const selfServiceRatio = totalPwdActivity > 0 ? (data.passwordActivity.selfService / totalPwdActivity) * 100 : 50;
  const pwdScore = Math.min(100, selfServiceRatio + 20);

  const total = Math.round(mfaScore * 0.4 + adminScore * 0.2 + riskScore * 0.25 + pwdScore * 0.15);

  const getStatus = (s: number): 'Bom' | 'Moderado' | 'Crítico' => s >= 75 ? 'Bom' : s >= 50 ? 'Moderado' : 'Crítico';
  const getColor = (s: number) => s >= 75 ? 'bg-green-500/15 text-green-400 border-green-500/30' : s >= 50 ? 'bg-warning/15 text-warning border-warning/30' : 'bg-destructive/15 text-destructive border-destructive/30';

  return {
    total,
    factors: [
      { label: 'Cobertura MFA', icon: KeyRound, score: Math.round(mfaScore), status: getStatus(mfaScore), color: getColor(mfaScore) },
      { label: 'Exposição de Admins', icon: Users, score: Math.round(adminScore), status: getStatus(adminScore), color: getColor(adminScore) },
      { label: 'Risco de Identidade', icon: ShieldCheck, score: Math.round(riskScore), status: getStatus(riskScore), color: getColor(riskScore) },
      { label: 'Segurança de Senhas', icon: Lock, score: Math.round(pwdScore), status: getStatus(pwdScore), color: getColor(pwdScore) },
    ],
  };
}

export function IdentityScoreCard({ data, loading }: IdentityScoreCardProps) {
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
          {/* Score Gauge */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Score de Segurança de Identidade</h3>
            <ScoreGauge score={total} size="md" />
            <Progress value={total} className="w-40 h-2" />
          </div>

          {/* Factors */}
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
