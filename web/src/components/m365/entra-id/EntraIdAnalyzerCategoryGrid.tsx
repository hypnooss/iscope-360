import { ExternalLink, Users, ShieldCheck, AlertTriangle, LogIn, UserCog, UserX, UserPlus, KeyRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DataSourceDot } from '@/components/m365/shared';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';

export type EntraIdOperationalCategory =
  | 'active_users'
  | 'mfa_coverage'
  | 'identity_risk'
  | 'failed_logins'
  | 'administrators'
  | 'disabled_accounts'
  | 'guest_users'
  | 'password_activity';

interface CategoryInfo {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colorHex: string;
}

const CATEGORY_INFO: Record<EntraIdOperationalCategory, CategoryInfo> = {
  active_users:      { label: 'Usuários Ativos',       icon: Users,       colorHex: '#14b8a6' },
  mfa_coverage:      { label: 'Cobertura MFA',         icon: ShieldCheck, colorHex: '#10b981' },
  identity_risk:     { label: 'Risco de Identidade',   icon: AlertTriangle, colorHex: '#ef4444' },
  failed_logins:     { label: 'Logins com Falha',      icon: LogIn,       colorHex: '#f59e0b' },
  administrators:    { label: 'Administradores',       icon: UserCog,     colorHex: '#8b5cf6' },
  disabled_accounts: { label: 'Contas Desabilitadas',  icon: UserX,       colorHex: '#6366f1' },
  guest_users:       { label: 'Convidados',            icon: UserPlus,    colorHex: '#ec4899' },
  password_activity: { label: 'Atividade de Senhas',   icon: KeyRound,    colorHex: '#f97316' },
};

const CATEGORY_ORDER: EntraIdOperationalCategory[] = [
  'active_users', 'mfa_coverage', 'identity_risk', 'failed_logins',
  'administrators', 'disabled_accounts', 'guest_users', 'password_activity',
];

interface CategoryStats {
  total: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  pct?: number;
  badgeLabel?: string;
  splitA?: { label: string; value: number; color: string };
  splitB?: { label: string; value: number; color: string };
  splits?: Array<{ label: string; value: number; color: string }>;
}

const SEVERITY_COLORS = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
  none: 'bg-muted/30',
};

function getCategoryStats(cat: EntraIdOperationalCategory, data: EntraIdDashboardData): CategoryStats {
  const { users, mfa, risks, loginActivity, admins, passwordActivity } = data;
  const totalUsers = users.total || 1;

  switch (cat) {
    case 'active_users': {
      return {
        total: users.signInEnabled,
        severity: 'low',
        splitA: { label: 'Habilitados', value: users.signInEnabled, color: '#10b981' },
        splitB: { label: 'Desabilitados', value: users.disabled, color: '#6366f1' },
      };
    }
    case 'mfa_coverage': {
      const pct = mfa.total > 0 ? (mfa.enabled / mfa.total) * 100 : 0;
      let strong = mfa.strong;
      let weak = mfa.weak;
      if (strong == null || weak == null) {
        const STRONG_METHODS = ['microsoftAuthenticatorPush', 'softwareOneTimePasscode', 'hardwareOneTimePasscode', 'windowsHelloForBusiness', 'passKeyDeviceBound', 'microsoftAuthenticatorPasswordless', 'fido2'];
        const details = mfa.userDetails || [];
        const strongCount = details.filter(u => u.hasMfa && u.methods.some(m => STRONG_METHODS.includes(m))).length;
        strong = strongCount;
        weak = Math.max(0, mfa.enabled - strongCount);
      }
      return {
        total: mfa.enabled,
        pct,
        severity: pct < 50 ? 'critical' : pct < 70 ? 'high' : pct < 85 ? 'medium' : pct < 100 ? 'low' : 'none',
        splits: [
          { label: 'MFA Forte', value: strong, color: '#10b981' },
          { label: 'MFA Fraco', value: weak, color: '#f59e0b' },
          { label: 'Sem MFA', value: mfa.disabled, color: '#ef4444' },
        ],
      };
    }
    case 'identity_risk': {
      const v = risks.riskyUsers;
      return {
        total: v,
        severity: risks.compromised > 0 ? 'critical' : v > 10 ? 'critical' : v > 5 ? 'high' : v > 0 ? 'medium' : 'none',
        splits: [
          { label: 'Em Risco', value: risks.atRisk, color: '#f97316' },
          { label: 'Comprometidos', value: risks.compromised, color: '#ef4444' },
        ],
      };
    }
    case 'failed_logins': {
      return {
        total: loginActivity.total,
        severity: loginActivity.failed > 100 ? 'high' : loginActivity.failed > 30 ? 'medium' : loginActivity.failed > 0 ? 'low' : 'none',
        splits: [
          { label: 'Sucesso', value: loginActivity.success, color: '#10b981' },
          { label: 'Falhas', value: loginActivity.failed, color: '#f59e0b' },
          { label: 'Bloqueados', value: loginActivity.blocked, color: '#ef4444' },
        ],
      };
    }
    case 'administrators': {
      const ga = admins.globalAdmins;
      const others = Math.max(0, admins.total - ga);
      return {
        total: admins.total,
        severity: ga > 5 ? 'high' : ga > 3 ? 'medium' : 'low',
        splits: [
          { label: 'Global', value: ga, color: '#f59e0b' },
          { label: 'Outros', value: others, color: '#8b5cf6' },
        ],
      };
    }
    case 'disabled_accounts': {
      const v = users.disabled;
      const pct = (v / totalUsers) * 100;
      return {
        total: v,
        pct,
        severity: pct > 20 ? 'medium' : v > 0 ? 'low' : 'none',
        splits: [
          { label: 'Habilitados', value: users.signInEnabled, color: '#10b981' },
          { label: 'Desabilitados', value: v, color: '#6366f1' },
        ],
      };
    }
    case 'guest_users': {
      const v = users.guests;
      return {
        total: v,
        severity: v > 50 ? 'medium' : v > 0 ? 'low' : 'none',
        splits: [
          { label: 'Membros', value: users.total - v, color: '#14b8a6' },
          { label: 'Convidados', value: v, color: '#ec4899' },
        ],
      };
    }
    case 'password_activity': {
      const v = passwordActivity.resets + passwordActivity.forcedChanges + passwordActivity.selfService;
      return {
        total: v,
        severity: v > 20 ? 'medium' : v > 0 ? 'low' : 'none',
        splits: [
          { label: 'Resets', value: passwordActivity.resets, color: '#f97316' },
          { label: 'Self-Service', value: passwordActivity.selfService, color: '#3b82f6' },
          { label: 'Forçados', value: passwordActivity.forcedChanges, color: '#ef4444' },
        ],
      };
    }
    default:
      return { total: 0, severity: 'none' };
  }
}

interface EntraIdAnalyzerCategoryGridProps {
  data: EntraIdDashboardData;
  onCategoryClick?: (category: EntraIdOperationalCategory) => void;
}

export function EntraIdAnalyzerCategoryGrid({ data, onCategoryClick }: EntraIdAnalyzerCategoryGridProps) {
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
          const hasSplit = !hasSplits && stats.splitA && stats.splitB;
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
                ) : hasSplit && hasData ? (
                  <div className="w-full h-2 rounded-full bg-muted/50 overflow-hidden flex">
                    <div className="h-full transition-all" style={{ width: `${(stats.splitA!.value / (stats.splitA!.value + stats.splitB!.value)) * 100}%`, backgroundColor: stats.splitA!.color }} />
                    <div className="h-full transition-all" style={{ width: `${(stats.splitB!.value / (stats.splitA!.value + stats.splitB!.value)) * 100}%`, backgroundColor: stats.splitB!.color }} />
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
