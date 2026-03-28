import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  KeyRound, 
  Crown, 
  AppWindow, 
  Mail, 
  AlertTriangle,
  ChevronRight,
  LucideIcon,
  Smartphone,
  ShieldCheck,
  HardDrive,
  MessageSquare,
  Shield
} from 'lucide-react';
import { M365RiskCategory, CATEGORY_LABELS, CATEGORY_ICONS } from '@/types/m365Insights';

interface CategoryStats {
  count: number;
  score: number;
  criticalCount: number;
  highCount: number;
}

interface M365CategoryCardProps {
  category: M365RiskCategory;
  stats: CategoryStats;
  onClick?: () => void;
  loading?: boolean;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Users,
  KeyRound,
  Crown,
  AppWindow,
  Mail,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  HardDrive,
  MessageSquare,
  Shield,
};

const CATEGORY_COLORS: Record<M365RiskCategory, { bg: string; border: string; icon: string }> = {
  identities: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: 'text-blue-400',
  },
  auth_access: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    icon: 'text-violet-400',
  },
  admin_privileges: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: 'text-amber-400',
  },
  apps_integrations: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    icon: 'text-cyan-400',
  },
  email_exchange: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    icon: 'text-purple-400',
  },
  threats_activity: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    icon: 'text-rose-400',
  },
  intune_devices: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: 'text-emerald-400',
  },
  pim_governance: {
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    icon: 'text-orange-400',
  },
  sharepoint_onedrive: {
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    icon: 'text-teal-400',
  },
  teams_collaboration: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    icon: 'text-indigo-400',
  },
  defender_security: {
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/30',
    icon: 'text-pink-400',
  },
};

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-primary';
  if (score >= 70) return 'text-emerald-400';
  if (score >= 50) return 'text-warning';
  return 'text-rose-400';
}

export function M365CategoryCard({ 
  category, 
  stats, 
  onClick,
  loading = false 
}: M365CategoryCardProps) {
  const label = CATEGORY_LABELS[category];
  const iconName = CATEGORY_ICONS[category];
  const colors = CATEGORY_COLORS[category];
  const Icon = ICON_MAP[iconName] || Users;

  return (
    <Card 
      className={cn(
        'glass-card border cursor-pointer transition-all duration-200',
        'hover:shadow-lg hover:scale-[1.02]',
        colors.border,
        loading && 'animate-pulse'
      )}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={cn('p-2.5 rounded-lg', colors.bg)}>
            <Icon className={cn('w-5 h-5', colors.icon)} />
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
        
        <h3 className="font-semibold text-foreground mb-1">{label}</h3>
        
        <div className="flex items-baseline gap-1 mb-3">
          <span className={cn('text-2xl font-bold', loading ? 'text-muted-foreground' : getScoreColor(stats.score))}>
            {loading ? '--' : stats.score}
          </span>
          <span className="text-sm text-muted-foreground">/100</span>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {stats.criticalCount > 0 && (
            <Badge variant="outline" className="status-fail text-xs">
              {stats.criticalCount} crítico{stats.criticalCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {stats.highCount > 0 && (
            <Badge variant="outline" className="status-warning text-xs">
              {stats.highCount} alto{stats.highCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {stats.criticalCount === 0 && stats.highCount === 0 && (
            <Badge variant="outline" className="status-pass text-xs">
              {stats.count} verificação{stats.count !== 1 ? 'ões' : ''}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
