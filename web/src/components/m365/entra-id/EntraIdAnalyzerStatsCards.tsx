import { Users, ShieldCheck, AlertTriangle, UserCog } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { DataSourceDot } from '@/components/m365/shared';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';

interface EntraIdAnalyzerStatsCardsProps {
  data: EntraIdDashboardData;
}

export function EntraIdAnalyzerStatsCards({ data }: EntraIdAnalyzerStatsCardsProps) {
  const { users, mfa, risks, admins } = data;

  const mfaPct = mfa.total > 0 ? ((mfa.enabled / mfa.total) * 100).toFixed(1) : '0.0';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex items-center gap-3">
          <Users className="w-8 h-8 text-teal-400" />
          <div>
            <p className="text-xs text-muted-foreground">Usuários Ativos</p>
            <p className="text-2xl font-bold">{users.total.toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-emerald-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{mfaPct}%</p>
              <p className="text-xs text-muted-foreground">({mfa.enabled}/{mfa.total})</p>
            </div>
            <p className="text-xs text-muted-foreground">Cobertura MFA</p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{risks.riskyUsers.toLocaleString()}</p>
              {risks.compromised > 0 && (
                <p className="text-xs text-red-400">({risks.compromised} comprometidos)</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Usuários em Risco</p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-border/50 relative">
        <DataSourceDot source="snapshot" className="absolute top-3 right-3" />
        <CardContent className="p-4 flex items-center gap-3">
          <UserCog className="w-8 h-8 text-amber-500" />
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{admins.globalAdmins}</p>
              <p className="text-xs text-muted-foreground">({admins.total} total)</p>
            </div>
            <p className="text-xs text-muted-foreground">Admins Globais</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
