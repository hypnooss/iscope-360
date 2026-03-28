import { Users, Eye, UserPlus, Share2, HardDrive } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DataSourceDot } from '@/components/m365/shared';
import type { CollaborationDashboardData } from '@/hooks/useCollaborationDashboard';

interface TeamsAnalyzerStatsCardsProps {
  data: CollaborationDashboardData;
}

export function TeamsAnalyzerStatsCards({ data }: TeamsAnalyzerStatsCardsProps) {
  const { teams, sharepoint } = data;

  const publicPct = teams.total > 0 ? ((teams.public / teams.total) * 100).toFixed(1) : '0.0';
  const guestPct = teams.total > 0 ? ((teams.withGuests / teams.total) * 100).toFixed(1) : '0.0';
  const extSharingPct = sharepoint.totalSites > 0 ? ((sharepoint.externalSharingEnabled / sharepoint.totalSites) * 100).toFixed(1) : '0.0';

  const storageUsed = sharepoint.storageUsedGB ?? 0;
  const storageAllocated = sharepoint.storageAllocatedGB ?? 0;
  const quotaReliable = storageAllocated > 0 && storageAllocated < storageUsed * 100;
  const storagePct = quotaReliable ? Math.min((storageUsed / storageAllocated) * 100, 100) : 0;

  const formatStorage = (gb: number): string => {
    if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`;
    return `${gb.toFixed(1)} GB`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Total Teams */}
      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex items-center gap-3">
          <Users className="w-8 h-8 text-teal-400" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{teams.total.toLocaleString()}</p>
            </div>
            <p className="text-xs text-muted-foreground">Total de Teams</p>
          </div>
        </CardContent>
      </Card>

      {/* Teams Públicas */}
      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex items-center gap-3">
          <Eye className="w-8 h-8 text-red-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{publicPct}%</p>
              <p className="text-xs text-muted-foreground">({teams.public})</p>
            </div>
            <p className="text-xs text-muted-foreground">Teams Públicas</p>
          </div>
        </CardContent>
      </Card>

      {/* Convidados Externos */}
      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex items-center gap-3">
          <UserPlus className="w-8 h-8 text-amber-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{guestPct}%</p>
              <p className="text-xs text-muted-foreground">({teams.withGuests})</p>
            </div>
            <p className="text-xs text-muted-foreground">Teams com Convidados</p>
          </div>
        </CardContent>
      </Card>

      {/* Compartilhamento Externo SPO */}
      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex items-center gap-3">
          <Share2 className="w-8 h-8 text-orange-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{extSharingPct}%</p>
              <p className="text-xs text-muted-foreground">({sharepoint.externalSharingEnabled})</p>
            </div>
            <p className="text-xs text-muted-foreground">Compartilhamento Externo SPO</p>
          </div>
        </CardContent>
      </Card>

      {/* Storage SharePoint */}
      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <HardDrive className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">
                {formatStorage(storageUsed)}
                {quotaReliable && <span className="text-sm font-normal text-muted-foreground"> / {formatStorage(storageAllocated)}</span>}
              </p>
              <p className="text-xs text-muted-foreground">Storage SharePoint</p>
            </div>
          </div>
          {quotaReliable && (
            <>
              <Progress value={storagePct} className="h-2" />
              <p className="text-xs text-muted-foreground text-right">{storagePct.toFixed(1)}% utilizado</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
