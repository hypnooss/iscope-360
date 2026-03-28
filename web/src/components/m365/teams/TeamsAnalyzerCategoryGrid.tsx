import { ExternalLink, Eye, Lock, UserPlus, Hash, Share, Globe, Share2, FolderX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DataSourceDot } from '@/components/m365/shared';
import type { CollaborationDashboardData } from '@/hooks/useCollaborationDashboard';

export type TeamsOperationalCategory =
  | 'public_teams'
  | 'private_teams'
  | 'guest_access'
  | 'private_channels'
  | 'shared_channels'
  | 'sharepoint_sites'
  | 'external_sharing'
  | 'inactive_sites';

interface CategoryInfo {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colorHex: string;
}

const CATEGORY_INFO: Record<TeamsOperationalCategory, CategoryInfo> = {
  public_teams:     { label: 'Teams Públicas',           icon: Eye,       colorHex: '#ef4444' },
  private_teams:    { label: 'Teams Privadas',           icon: Lock,      colorHex: '#14b8a6' },
  guest_access:     { label: 'Convidados Externos',      icon: UserPlus,  colorHex: '#f59e0b' },
  private_channels: { label: 'Canais Privados',          icon: Hash,      colorHex: '#8b5cf6' },
  shared_channels:  { label: 'Canais Compartilhados',    icon: Share,     colorHex: '#f97316' },
  sharepoint_sites: { label: 'Sites SharePoint',         icon: Globe,     colorHex: '#3b82f6' },
  external_sharing: { label: 'Compartilhamento Externo', icon: Share2,    colorHex: '#dc2626' },
  inactive_sites:   { label: 'Sites Inativos',           icon: FolderX,   colorHex: '#6366f1' },
};

const CATEGORY_ORDER: TeamsOperationalCategory[] = [
  'public_teams', 'private_teams', 'guest_access', 'private_channels',
  'shared_channels', 'sharepoint_sites', 'external_sharing', 'inactive_sites',
];

interface CategoryStats {
  total: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  pct?: number;
  splits?: Array<{ label: string; value: number; color: string }>;
}

const SEVERITY_COLORS = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
  none: 'bg-muted/30',
};

function getCategoryStats(cat: TeamsOperationalCategory, data: CollaborationDashboardData): CategoryStats {
  const { teams, sharepoint } = data;
  const totalTeams = teams.total || 1;
  const totalSites = sharepoint.totalSites || 1;

  switch (cat) {
    case 'public_teams': {
      const pct = (teams.public / totalTeams) * 100;
      return {
        total: teams.public,
        pct,
        severity: pct > 50 ? 'critical' : pct > 30 ? 'high' : pct > 10 ? 'medium' : teams.public > 0 ? 'low' : 'none',
        splits: [
          { label: 'Públicas', value: teams.public, color: '#ef4444' },
          { label: 'Privadas', value: teams.private, color: '#14b8a6' },
        ],
      };
    }
    case 'private_teams': {
      return {
        total: teams.private,
        severity: 'none',
        splits: [
          { label: 'Privadas', value: teams.private, color: '#14b8a6' },
          { label: 'Públicas', value: teams.public, color: '#ef4444' },
        ],
      };
    }
    case 'guest_access': {
      const pct = (teams.withGuests / totalTeams) * 100;
      const withoutGuests = Math.max(0, teams.total - teams.withGuests);
      return {
        total: teams.withGuests,
        pct,
        severity: pct > 40 ? 'high' : pct > 20 ? 'medium' : teams.withGuests > 0 ? 'low' : 'none',
        splits: [
          { label: 'Com Convidados', value: teams.withGuests, color: '#f59e0b' },
          { label: 'Sem Convidados', value: withoutGuests, color: '#10b981' },
        ],
      };
    }
    case 'private_channels':
      return {
        total: teams.privateChannels,
        severity: teams.privateChannels > 50 ? 'medium' : teams.privateChannels > 0 ? 'low' : 'none',
        splits: [
          { label: 'Privados', value: teams.privateChannels, color: '#8b5cf6' },
          { label: 'Compartilhados', value: teams.sharedChannels, color: '#f97316' },
        ],
      };
    case 'shared_channels':
      return {
        total: teams.sharedChannels,
        severity: teams.sharedChannels > 20 ? 'high' : teams.sharedChannels > 5 ? 'medium' : teams.sharedChannels > 0 ? 'low' : 'none',
        splits: [
          { label: 'Compartilhados', value: teams.sharedChannels, color: '#f97316' },
          { label: 'Privados', value: teams.privateChannels, color: '#8b5cf6' },
        ],
      };
    case 'sharepoint_sites': {
      return {
        total: sharepoint.totalSites,
        severity: 'none',
        splits: [
          { label: 'Ativos', value: sharepoint.activeSites, color: '#10b981' },
          { label: 'Inativos', value: sharepoint.inactiveSites, color: '#6366f1' },
        ],
      };
    }
    case 'external_sharing': {
      const pct = (sharepoint.externalSharingEnabled / totalSites) * 100;
      const disabled = Math.max(0, sharepoint.totalSites - sharepoint.externalSharingEnabled);
      return {
        total: sharepoint.externalSharingEnabled,
        pct,
        severity: pct > 50 ? 'critical' : pct > 30 ? 'high' : pct > 10 ? 'medium' : sharepoint.externalSharingEnabled > 0 ? 'low' : 'none',
        splits: [
          { label: 'Habilitados', value: sharepoint.externalSharingEnabled, color: '#dc2626' },
          { label: 'Desabilitados', value: disabled, color: '#10b981' },
        ],
      };
    }
    case 'inactive_sites': {
      const pct = (sharepoint.inactiveSites / totalSites) * 100;
      return {
        total: sharepoint.inactiveSites,
        pct,
        severity: pct > 40 ? 'high' : pct > 20 ? 'medium' : sharepoint.inactiveSites > 0 ? 'low' : 'none',
        splits: [
          { label: 'Inativos', value: sharepoint.inactiveSites, color: '#6366f1' },
          { label: 'Ativos', value: sharepoint.activeSites, color: '#10b981' },
        ],
      };
    }
    default:
      return { total: 0, severity: 'none' };
  }
}

interface TeamsAnalyzerCategoryGridProps {
  data: CollaborationDashboardData;
  onCategoryClick?: (category: TeamsOperationalCategory) => void;
}

export function TeamsAnalyzerCategoryGrid({ data, onCategoryClick }: TeamsAnalyzerCategoryGridProps) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Panorama por Categoria</h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {CATEGORY_ORDER.map(catKey => {
          const info = CATEGORY_INFO[catKey];
          const stats = getCategoryStats(catKey, data);
          const hasData = stats.total > 0;
          const Icon = info.icon;
          const hasSplits = stats.splits && stats.splits.length > 0;

          return (
            <Card
              key={catKey}
              className={cn(
                'border cursor-pointer transition-all duration-200 hover:shadow-md group',
                !hasData ? 'opacity-50 border-border/30' : 'border-border/50 hover:border-border'
              )}
              onClick={() => onCategoryClick?.(catKey)}
            >
              <CardContent className="p-4 space-y-3 relative">
                <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: `${info.colorHex}15` }}>
                    <Icon className="w-4.5 h-4.5" style={{ color: info.colorHex }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{info.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {stats.total.toLocaleString()} {stats.pct !== undefined ? `(${stats.pct.toFixed(1)}%)` : ''}
                    </p>
                  </div>
                </div>

                {hasSplits && hasData ? (
                  <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden flex">
                    {stats.splits!.map((seg, i) => {
                      const splitsTotal = stats.splits!.reduce((s, x) => s + x.value, 0) || 1;
                      return <div key={i} className="h-full transition-all" style={{ width: `${(seg.value / splitsTotal) * 100}%`, backgroundColor: seg.color }} />;
                    })}
                  </div>
                ) : (
                  <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
                    {hasData && <div className={cn('h-full rounded-full transition-all', SEVERITY_COLORS[stats.severity])} style={{ width: '100%' }} />}
                  </div>
                )}

                {hasData && hasSplits && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {stats.splits!.map((seg, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: `${seg.color}20`, color: seg.color, borderColor: `${seg.color}40` }}>
                        {seg.value.toLocaleString()} {seg.label}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex justify-end mt-1">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
