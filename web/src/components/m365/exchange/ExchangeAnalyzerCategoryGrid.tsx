import { ExternalLink, Mail, ShieldBan, ShieldAlert, Bug, Forward, Reply, UserX, HardDrive } from 'lucide-react';
import { DataSourceDot } from '@/components/m365/shared/DataSourceDot';
import type { DataSourceType } from '@/components/m365/shared/DataSourceDot';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ExchangeDashboardData } from '@/hooks/useExchangeDashboard';

export type ExchangeOperationalCategory =
  | 'email_traffic'
  | 'anti_spam'
  | 'phishing'
  | 'malware'
  | 'forwarding'
  | 'auto_reply'
  | 'inactive_mailboxes'
  | 'over_quota';

interface CategoryInfo {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colorHex: string;
}

const CATEGORY_INFO: Record<ExchangeOperationalCategory, CategoryInfo> = {
  email_traffic:      { label: 'Tráfego de Email',    icon: Mail,        colorHex: '#14b8a6' },
  anti_spam:          { label: 'Proteção Anti-Spam',   icon: ShieldBan,   colorHex: '#8b5cf6' },
  phishing:           { label: 'Detecção Phishing',    icon: ShieldAlert, colorHex: '#ef4444' },
  malware:            { label: 'Detecção Malware',     icon: Bug,         colorHex: '#f59e0b' },
  forwarding:         { label: 'Forwarding Ativo',     icon: Forward,     colorHex: '#f97316' },
  auto_reply:         { label: 'Auto-Reply Externo',   icon: Reply,       colorHex: '#ec4899' },
  inactive_mailboxes: { label: 'Mailboxes Inativas',   icon: UserX,       colorHex: '#6366f1' },
  over_quota:         { label: 'Caixas Over Quota',    icon: HardDrive,   colorHex: '#dc2626' },
};

const CATEGORY_ORDER: ExchangeOperationalCategory[] = [
  'email_traffic', 'anti_spam', 'phishing', 'malware',
  'forwarding', 'auto_reply', 'inactive_mailboxes', 'over_quota',
];

interface CategoryStats {
  total: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  splitA?: { label: string; value: number; color: string };
  splitB?: { label: string; value: number; color: string };
  pct?: number;
  badgeLabel?: string;
  inactiveBadges?: { label: string; value: number; colorClass: string }[];
}

const SEVERITY_COLORS = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
  none: 'bg-muted/30',
};

function getCategoryStats(cat: ExchangeOperationalCategory, data: ExchangeDashboardData): CategoryStats {
  const { mailboxes, traffic, security } = data;
  const totalMb = mailboxes.total || 1;

  switch (cat) {
    case 'email_traffic': {
      const total = traffic.sent + traffic.received;
      return {
        total,
        severity: total > 0 ? 'low' : 'none',
        splitA: { label: 'Enviados', value: traffic.sent, color: '#10b981' },
        splitB: { label: 'Recebidos', value: traffic.received, color: '#3b82f6' },
      };
    }
    case 'anti_spam': {
      const v = security.spam;
      return { total: v, severity: v > 500 ? 'critical' : v > 100 ? 'high' : v > 20 ? 'medium' : v > 0 ? 'low' : 'none', badgeLabel: `${v.toLocaleString()} bloqueados` };
    }
    case 'phishing': {
      const v = security.phishing;
      return { total: v, severity: v > 100 ? 'critical' : v > 30 ? 'high' : v > 5 ? 'medium' : v > 0 ? 'low' : 'none', badgeLabel: `${v.toLocaleString()} detecções` };
    }
    case 'malware': {
      const v = security.malware;
      return { total: v, severity: v > 50 ? 'critical' : v > 10 ? 'high' : v > 2 ? 'medium' : v > 0 ? 'low' : 'none', badgeLabel: `${v.toLocaleString()} detecções` };
    }
    case 'forwarding': {
      const v = mailboxes.forwardingEnabled;
      const pct = (v / totalMb) * 100;
      return { total: v, pct, severity: pct > 20 ? 'critical' : pct > 10 ? 'high' : pct > 3 ? 'medium' : v > 0 ? 'low' : 'none', badgeLabel: `${v} habilitados` };
    }
    case 'auto_reply': {
      const v = mailboxes.autoReplyExternal;
      const pct = (v / totalMb) * 100;
      return { total: v, pct, severity: pct > 15 ? 'high' : pct > 5 ? 'medium' : v > 0 ? 'low' : 'none', badgeLabel: `${v} configurados` };
    }
    case 'inactive_mailboxes': {
      const v30 = mailboxes.notLoggedIn30d;
      const v60 = mailboxes.notLoggedIn60d || 0;
      const v90 = mailboxes.notLoggedIn90d || 0;
      const v = v30 + v60 + v90;
      const pct = (v / totalMb) * 100;
      return {
        total: v, pct,
        severity: pct > 30 ? 'high' : pct > 15 ? 'medium' : v > 0 ? 'low' : 'none',
        inactiveBadges: [
          { label: `30d: ${v30}`, value: v30, colorClass: 'bg-orange-500/20 text-orange-500 border-orange-500/30' },
          { label: `60d: ${v60}`, value: v60, colorClass: 'bg-orange-600/20 text-orange-600 border-orange-600/30' },
          { label: `90d: ${v90}`, value: v90, colorClass: 'bg-red-500/20 text-red-500 border-red-500/30' },
        ],
      };
    }
    case 'over_quota': {
      const v = mailboxes.overQuota;
      const pct = (v / totalMb) * 100;
      return { total: v, pct, severity: pct > 10 ? 'critical' : pct > 5 ? 'high' : v > 0 ? 'medium' : 'none', badgeLabel: `${v} acima da cota` };
    }
    default:
      return { total: 0, severity: 'none' };
  }
}

interface ExchangeAnalyzerCategoryGridProps {
  data: ExchangeDashboardData;
  onCategoryClick?: (category: ExchangeOperationalCategory) => void;
}

export function ExchangeAnalyzerCategoryGrid({ data, onCategoryClick }: ExchangeAnalyzerCategoryGridProps) {
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
          const hasSplit = stats.splitA && stats.splitB;

          return (
            <Card
              key={catKey}
              className={cn(
                'border cursor-pointer transition-all duration-200 hover:shadow-md group relative',
                !hasData ? 'opacity-50 border-border/30' : 'border-border/50 hover:border-border'
              )}
              onClick={() => onCategoryClick?.(catKey)}
            >
              <div className="absolute top-3 right-3">
                <DataSourceDot source={(['email_traffic','anti_spam','phishing','malware'] as ExchangeOperationalCategory[]).includes(catKey) ? 'aggregated' : 'snapshot'} />
              </div>
              <CardContent className="p-4 space-y-3">
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

                {hasSplit && hasData ? (
                  <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden flex">
                    <div className="h-full transition-all" style={{ width: `${(stats.splitA!.value / stats.total) * 100}%`, backgroundColor: stats.splitA!.color }} />
                    <div className="h-full transition-all" style={{ width: `${(stats.splitB!.value / stats.total) * 100}%`, backgroundColor: stats.splitB!.color }} />
                  </div>
                ) : (
                  <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden">
                    {hasData && <div className={cn('h-full rounded-full transition-all', SEVERITY_COLORS[stats.severity])} style={{ width: '100%' }} />}
                  </div>
                )}

                {hasData && hasSplit && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: `${stats.splitA!.color}20`, color: stats.splitA!.color, borderColor: `${stats.splitA!.color}40` }}>
                      {stats.splitA!.value.toLocaleString()} {stats.splitA!.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: `${stats.splitB!.color}20`, color: stats.splitB!.color, borderColor: `${stats.splitB!.color}40` }}>
                      {stats.splitB!.value.toLocaleString()} {stats.splitB!.label}
                    </Badge>
                  </div>
                )}

                {hasData && !hasSplit && stats.inactiveBadges && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {stats.inactiveBadges.map((b, i) => (
                      <Badge key={i} variant="outline" className={cn("text-[10px] px-1.5 py-0", b.colorClass)}>
                        {b.label}
                      </Badge>
                    ))}
                  </div>
                )}

                {hasData && !hasSplit && stats.badgeLabel && !stats.inactiveBadges && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={cn(
                      "text-[10px] px-1.5 py-0",
                      stats.severity === 'critical' && "bg-red-500/20 text-red-500 border-red-500/30",
                      stats.severity === 'high' && "bg-orange-500/20 text-orange-500 border-orange-500/30",
                      stats.severity === 'medium' && "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
                      stats.severity === 'low' && "bg-blue-400/20 text-blue-400 border-blue-400/30",
                    )}>
                      {stats.badgeLabel}
                    </Badge>
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