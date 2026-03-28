import { Card, CardContent } from '@/components/ui/card';
import { HardDrive, Globe, FolderX, Share2, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CollaborationDashboardData } from '@/hooks/useCollaborationDashboard';

interface SharePointCardsProps {
  data: CollaborationDashboardData | null;
  loading?: boolean;
}

export function SharePointOverviewCard({ data, loading }: SharePointCardsProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="py-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const sitesTotal = Math.max(1, data.sharepoint.totalSites);

  const rows = [
    { label: 'Total de Sites', value: data.sharepoint.totalSites, color: 'text-primary', pct: 100 },
    { label: 'Sites Ativos', value: data.sharepoint.activeSites, color: 'text-green-400', pct: Math.round((data.sharepoint.activeSites / sitesTotal) * 100) },
    { label: 'Sites Inativos', value: data.sharepoint.inactiveSites, color: 'text-warning', pct: Math.round((data.sharepoint.inactiveSites / sitesTotal) * 100) },
  ];

  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">SharePoint Overview</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Estatísticas dos sites SharePoint</p>

        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className={cn('text-xl font-bold tabular-nums', row.color)}>{row.value.toLocaleString('pt-BR')}</span>
              </div>
              <div className="w-full bg-secondary/40 rounded-full h-2">
                <div
                  className={cn('h-2 rounded-full transition-all', row.color === 'text-primary' ? 'bg-primary' : row.color === 'text-green-400' ? 'bg-green-400' : 'bg-warning')}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SharePointGovernanceCard({ data, loading }: SharePointCardsProps) {
  if (loading || !data) {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="py-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const items = [
    {
      label: 'Compartilhamento Externo',
      description: 'Sites com compartilhamento externo habilitado',
      icon: Share2,
      value: data.sharepoint.externalSharingEnabled,
      isWarning: data.sharepoint.externalSharingEnabled > 0,
    },
    {
      label: 'Sites Inativos',
      description: 'Sites sem atividade recente',
      icon: FolderX,
      value: data.sharepoint.inactiveSites,
      isWarning: data.sharepoint.inactiveSites > 0,
    },
  ];

  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="py-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">SharePoint Governance</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Indicadores de governança e exposição</p>

        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.label}
              className={cn(
                'flex items-center justify-between p-4 rounded-lg border transition-colors cursor-pointer',
                item.isWarning
                  ? 'border-warning/30 bg-warning/5 hover:border-warning/50'
                  : 'border-border/50 bg-secondary/20 hover:border-primary/30'
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn('w-5 h-5', item.isWarning ? 'text-warning' : 'text-green-400')} />
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <span className={cn('text-2xl font-bold tabular-nums', item.isWarning ? 'text-warning' : 'text-green-400')}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
