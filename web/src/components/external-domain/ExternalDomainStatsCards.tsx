import { Card, CardContent } from '@/components/ui/card';
import { Globe, AlertTriangle, TrendingUp, Shield } from 'lucide-react';

interface ExternalDomainStatsCardsProps {
  totalDomains: number;
  averageScore: number;
  criticalAlerts: number;
  criticalFailures: number;
}

export function ExternalDomainStatsCards({
  totalDomains,
  averageScore,
  criticalAlerts,
  criticalFailures,
}: ExternalDomainStatsCardsProps) {
  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const scoreBg = averageScore >= 75 ? 'bg-success/10' : averageScore >= 50 ? 'bg-warning/10' : 'bg-destructive/10';
  const scoreText = averageScore >= 75 ? 'text-success' : averageScore >= 50 ? 'text-warning' : 'text-destructive';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Globe className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Domínios</p>
              <p className="text-2xl font-bold text-foreground">{totalDomains}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${scoreBg}`}>
              <TrendingUp className={`w-6 h-6 ${scoreText}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Score Médio</p>
              <p className={`text-2xl font-bold ${getScoreColor(averageScore)}`}>{averageScore}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-warning/10">
              <AlertTriangle className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Alertas Críticos</p>
              <p className="text-2xl font-bold text-warning">{criticalAlerts}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-destructive/10">
              <Shield className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Falhas Críticas</p>
              <p className="text-2xl font-bold text-destructive">{criticalFailures}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
