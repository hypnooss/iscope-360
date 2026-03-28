import { Card, CardContent } from '@/components/ui/card';
import { ScoreGauge } from '@/components/ScoreGauge';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Globe, UserCheck, Share2, FolderX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { CollaborationDashboardData } from '@/hooks/useCollaborationDashboard';

interface CollaborationScoreCardProps {
  data: CollaborationDashboardData | null;
  loading?: boolean;
}

interface ScoreFactor {
  label: string;
  icon: React.ElementType;
  score: number;
  status: 'Bom' | 'Moderado' | 'Crítico';
  color: string;
}

function computeScore(data: CollaborationDashboardData): { total: number; factors: ScoreFactor[] } {
  const teamsTotal = Math.max(1, data.teams.total);
  const sitesTotal = Math.max(1, data.sharepoint.totalSites);

  // Teams Públicas (30%) — penaliza pela proporção public/total
  const publicRatio = (data.teams.public / teamsTotal) * 100;
  const publicScore = Math.max(0, Math.min(100, 100 - publicRatio * 1.5));

  // Teams com Convidados (25%) — penaliza pela proporção withGuests/total
  const guestRatio = (data.teams.withGuests / teamsTotal) * 100;
  const guestScore = Math.max(0, Math.min(100, 100 - guestRatio * 1.2));

  // Compartilhamento Externo (25%) — penaliza por número de sites com sharing
  const externalScore = data.sharepoint.externalSharingEnabled > 0
    ? Math.max(0, 100 - (data.sharepoint.externalSharingEnabled / sitesTotal) * 150)
    : 100;

  // Sites Inativos (20%) — penaliza pela proporção inactiveSites/totalSites
  const inactiveRatio = (data.sharepoint.inactiveSites / sitesTotal) * 200;
  const inactiveScore = Math.max(0, Math.min(100, 100 - inactiveRatio));

  const total = Math.round(
    publicScore * 0.3 + guestScore * 0.25 + externalScore * 0.25 + inactiveScore * 0.2
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
      { label: 'Teams Públicas', icon: Globe, score: Math.round(publicScore), status: getStatus(publicScore), color: getColor(publicScore) },
      { label: 'Teams com Convidados', icon: UserCheck, score: Math.round(guestScore), status: getStatus(guestScore), color: getColor(guestScore) },
      { label: 'Compartilhamento Externo', icon: Share2, score: Math.round(externalScore), status: getStatus(externalScore), color: getColor(externalScore) },
      { label: 'Sites Inativos', icon: FolderX, score: Math.round(inactiveScore), status: getStatus(inactiveScore), color: getColor(inactiveScore) },
    ],
  };
}

export function CollaborationScoreCard({ data, loading }: CollaborationScoreCardProps) {
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
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Collaboration Security Score</h3>
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
