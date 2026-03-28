import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users, ShieldCheck, AlertTriangle, LogIn, UserCog, UserX, UserPlus, KeyRound, User,
  Cloud, RefreshCw, Download,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import type { EntraIdDashboardData } from '@/hooks/useEntraIdDashboard';
import type { EntraIdOperationalCategory } from './EntraIdAnalyzerCategoryGrid';
import { MfaUserList } from './MfaUserList';
import { GenericDetailList } from './GenericDetailList';

interface EntraIdCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: EntraIdOperationalCategory | null;
  dashboardData: EntraIdDashboardData | null;
}

const CATEGORY_META: Record<EntraIdOperationalCategory, {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colorHex: string;
  description: string;
}> = {
  active_users:      { label: 'Usuários Ativos',       icon: Users,         colorHex: '#14b8a6', description: 'Visão geral dos usuários ativos e desabilitados no diretório.' },
  mfa_coverage:      { label: 'Cobertura MFA',         icon: ShieldCheck,   colorHex: '#10b981', description: 'Detalhes da cobertura de autenticação multifator.' },
  identity_risk:     { label: 'Risco de Identidade',   icon: AlertTriangle, colorHex: '#ef4444', description: 'Usuários sinalizados como em risco ou comprometidos.' },
  failed_logins:     { label: 'Logins com Falha',      icon: LogIn,         colorHex: '#f59e0b', description: 'Análise de tentativas de login que falharam nos últimos 30 dias.' },
  administrators:    { label: 'Administradores',       icon: UserCog,       colorHex: '#8b5cf6', description: 'Usuários com funções administrativas privilegiadas.' },
  disabled_accounts: { label: 'Contas Desabilitadas',  icon: UserX,         colorHex: '#6366f1', description: 'Contas com login desabilitado no diretório.' },
  guest_users:       { label: 'Convidados',            icon: UserPlus,      colorHex: '#ec4899', description: 'Usuários externos convidados ao diretório.' },
  password_activity: { label: 'Atividade de Senhas',   icon: KeyRound,      colorHex: '#f97316', description: 'Resets, alterações e atividades de senha nos últimos 7 dias.' },
};

function MetricCard({ label, value, color, icon: Icon }: { label: string; value: string | number; color?: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="bg-secondary/30 p-3 rounded-lg">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <div className={`font-bold text-lg ${color ?? ''}`}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function ProportionalBar({ segments }: { segments: { label: string; value: number; colorClass: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-secondary/40">
        {segments.map((seg) => (
          <div key={seg.label} className={`${seg.colorClass} transition-all`} style={{ width: `${(seg.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${seg.colorClass}`} />
            {seg.label}: {seg.value.toLocaleString()} ({total > 0 ? ((seg.value / total) * 100).toFixed(1) : 0}%)
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={onClick}>
      <Download className="w-3.5 h-3.5" />
      Exportar
    </Button>
  );
}

function downloadXlsx(rows: Record<string, any>[], sheetName: string, fileName: string, colWidths?: number[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

const TAB_CLASS = "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-xs";

export function EntraIdCategorySheet({ open, onOpenChange, category, dashboardData }: EntraIdCategorySheetProps) {
  
  
  if (!category || !dashboardData) return null;

  const meta = CATEGORY_META[category];
  const IconComp = meta.icon;
  const { users, mfa, risks, loginActivity, admins, passwordActivity } = dashboardData;
  const date = new Date().toISOString().slice(0, 10);

  const renderContent = () => {
    switch (category) {
      case 'active_users': {
        const cloudOnly = Math.max(0, users.total - users.onPremSynced - users.guests);
        const internalUsers = users.total - users.guests;
        const enabledPct = internalUsers > 0 ? (users.signInEnabled / internalUsers) * 100 : 0;

        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Badge variant="outline" className="text-xs">Resumo do Diretório</Badge>
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Total" value={users.total} icon={Users} />
                <MetricCard label="Habilitados" value={users.signInEnabled} color="text-emerald-500" icon={User} />
                <MetricCard label="Desabilitados" value={users.disabled} color="text-indigo-500" icon={UserX} />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sign-in habilitado</span>
                  <span>{enabledPct.toFixed(1)}%</span>
                </div>
                <Progress value={enabledPct} className="h-2" />
              </div>
            </div>

            <div className="space-y-3">
              <Badge variant="outline" className="text-xs">Composição do Diretório</Badge>
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Cloud-Only" value={cloudOnly} icon={Cloud} color="text-sky-500" />
                <MetricCard label="Sincronizados" value={users.onPremSynced} icon={RefreshCw} color="text-violet-500" />
                <MetricCard label="Convidados" value={users.guests} icon={UserPlus} color="text-pink-500" />
              </div>
              <ProportionalBar segments={[
                { label: 'Cloud-Only', value: cloudOnly, colorClass: 'bg-sky-500' },
                { label: 'Sincronizados', value: users.onPremSynced, colorClass: 'bg-violet-500' },
                { label: 'Convidados', value: users.guests, colorClass: 'bg-pink-500' },
              ]} />
            </div>
          </div>
        );
      }

      case 'mfa_coverage': {
        const methodLabels: Record<string, { label: string; colorClass: string }> = {
          microsoftAuthenticatorPush: { label: 'Microsoft Authenticator', colorClass: 'bg-blue-500' },
          softwareOneTimePasscode: { label: 'Software OTP', colorClass: 'bg-violet-500' },
          mobilePhone: { label: 'Mobile Phone', colorClass: 'bg-amber-500' },
          email: { label: 'Email', colorClass: 'bg-cyan-500' },
          windowsHelloForBusiness: { label: 'Windows Hello', colorClass: 'bg-teal-500' },
          passKeyDeviceBound: { label: 'Passkey', colorClass: 'bg-indigo-500' },
          hardwareOneTimePasscode: { label: 'Hardware OTP', colorClass: 'bg-orange-500' },
          microsoftAuthenticatorPasswordless: { label: 'Authenticator Passwordless', colorClass: 'bg-emerald-500' },
          fido2: { label: 'FIDO2', colorClass: 'bg-rose-500' },
        };
        const breakdown = mfa.methodBreakdown || {};
        const methodEntries = Object.entries(breakdown).map(([key, value]) => ({
          key, label: methodLabels[key]?.label || key, colorClass: methodLabels[key]?.colorClass || 'bg-muted-foreground', value,
        })).sort((a, b) => b.value - a.value);

        const userDetails = mfa.userDetails || [];
        const enabledUsers = userDetails.filter((u) => u.hasMfa);
        const disabledUsersDetail = userDetails.filter((u) => !u.hasMfa);
        const WEAK_METHODS = new Set(['mobilePhone', 'email']);
        const weakUsers = enabledUsers.filter((u) => u.methods.length > 0 && u.methods.every((m) => WEAK_METHODS.has(m)));
        const strongUsers = enabledUsers.filter((u) => !u.methods.every((m) => WEAK_METHODS.has(m)));
        const filteredTotal = userDetails.length;

        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <TabsTrigger value="enabled" className={TAB_CLASS}>MFA Forte ({strongUsers.length})</TabsTrigger>
              <TabsTrigger value="weak" className={`${TAB_CLASS} text-amber-500 data-[state=active]:border-amber-500`}>MFA Fraco ({weakUsers.length})</TabsTrigger>
              <TabsTrigger value="disabled" className={TAB_CLASS}>MFA Desativado ({disabledUsersDetail.length})</TabsTrigger>
              <ExportButton onClick={() => {
                const rows = userDetails.map((u) => {
                  const isWeak = u.hasMfa && u.methods.length > 0 && u.methods.every((m) => WEAK_METHODS.has(m));
                  const isStrong = u.hasMfa && !isWeak;
                  return {
                    'Nome': u.displayName, 'UPN': u.upn,
                    'Classificação': isStrong ? 'MFA Forte' : isWeak ? 'MFA Fraco' : 'Sem MFA',
                    'Métodos': u.methods.map((m) => methodLabels[m]?.label || m).join(', '),
                    'Método Padrão': u.defaultMethod ? (methodLabels[u.defaultMethod]?.label || u.defaultMethod) : '',
                  };
                });
                downloadXlsx(rows, 'Cobertura MFA', `cobertura-mfa-${date}.xlsx`, [30, 35, 14, 40, 28]);
              }} />
            </TabsList>

            <TabsContent value="overview">
              <div className="space-y-6">
                <div className="space-y-3">
                  <Badge variant="outline" className="text-xs">Resumo MFA</Badge>
                  <div className="grid grid-cols-4 gap-3">
                    <MetricCard label="Membros Analisados" value={filteredTotal} icon={Users} />
                    <MetricCard label="MFA Forte" value={strongUsers.length} color="text-emerald-500" icon={ShieldCheck} />
                    <MetricCard label="MFA Fraco" value={weakUsers.length} color="text-amber-500" icon={AlertTriangle} />
                    <MetricCard label="Sem MFA" value={disabledUsersDetail.length} color="text-destructive" icon={UserX} />
                  </div>
                  <ProportionalBar segments={[
                    { label: 'MFA Forte', value: strongUsers.length, colorClass: 'bg-emerald-500' },
                    { label: 'MFA Fraco', value: weakUsers.length, colorClass: 'bg-amber-500' },
                    { label: 'Sem MFA', value: disabledUsersDetail.length, colorClass: 'bg-destructive' },
                  ]} />
                </div>
                <div className="space-y-3">
                  <Badge variant="outline" className="text-xs">Distribuição MFA por Método</Badge>
                  {methodEntries.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">{methodEntries.map((m) => <MetricCard key={m.key} label={m.label} value={m.value} />)}</div>
                      <ProportionalBar segments={methodEntries.map((m) => ({ label: m.label, value: m.value, colorClass: m.colorClass }))} />
                    </>
                  ) : (
                    <ProportionalBar segments={[
                      { label: 'Com MFA', value: mfa.enabled, colorClass: 'bg-emerald-500' },
                      { label: 'Sem MFA', value: mfa.disabled, colorClass: 'bg-destructive' },
                    ]} />
                  )}
                  <p className="text-xs text-muted-foreground">Exclui contas Guest e caixas compartilhadas. Um usuário pode ter mais de um método.</p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="enabled"><MfaUserList users={strongUsers} showMethods /></TabsContent>
            <TabsContent value="weak"><MfaUserList users={weakUsers} showMethods /></TabsContent>
            <TabsContent value="disabled"><MfaUserList users={disabledUsersDetail} /></TabsContent>
          </Tabs>
        );
      }

      case 'identity_risk': {
        const details = risks.details || [];
        const atRiskUsers = details.filter(u => u.riskState === 'atRisk');
        const compromisedUsers = details.filter(u => u.riskState === 'confirmedCompromised');

        const RISK_LABELS: Record<string, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto', hidden: 'Oculto', none: 'Nenhum', unknownFutureValue: 'Desconhecido' };

        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <TabsTrigger value="atRisk" className={`${TAB_CLASS} text-orange-500 data-[state=active]:border-orange-500`}>Em Risco ({atRiskUsers.length})</TabsTrigger>
              <TabsTrigger value="compromised" className={`${TAB_CLASS} text-red-500 data-[state=active]:border-red-500`}>Comprometidos ({compromisedUsers.length})</TabsTrigger>
              <ExportButton onClick={() => {
                const rows = details.map(u => ({
                  'Nome': u.displayName, 'UPN': u.upn,
                  'Nível de Risco': RISK_LABELS[u.riskLevel] || u.riskLevel,
                  'Estado': u.riskState === 'atRisk' ? 'Em Risco' : u.riskState === 'confirmedCompromised' ? 'Comprometido' : u.riskState,
                  'Última Atualização': u.lastUpdated ? new Date(u.lastUpdated).toLocaleString('pt-BR') : '',
                }));
                downloadXlsx(rows, 'Risco Identidade', `risco-identidade-${date}.xlsx`, [30, 35, 15, 18, 22]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Riscos</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total em Risco" value={risks.riskyUsers} icon={AlertTriangle} />
                  <MetricCard label="Em Risco Ativo" value={risks.atRisk} color="text-orange-500" />
                  <MetricCard label="Comprometidos" value={risks.compromised} color="text-red-500" />
                </div>
                <ProportionalBar segments={[
                  { label: 'Em Risco', value: risks.atRisk, colorClass: 'bg-orange-500' },
                  { label: 'Comprometidos', value: risks.compromised, colorClass: 'bg-red-500' },
                ]} />
              </div>
            </TabsContent>
            <TabsContent value="atRisk">
              <GenericDetailList
                items={atRiskUsers}
                columns={[
                  { label: 'Nome', accessor: u => u.displayName },
                  { label: 'UPN', accessor: u => u.upn },
                  { label: 'Nível', accessor: u => RISK_LABELS[u.riskLevel] || u.riskLevel, badge: true, badgeColor: '#f97316' },
                ]}
                searchKeys={[u => u.displayName, u => u.upn]}
                icon={AlertTriangle}
                iconColor="text-orange-500"
              />
            </TabsContent>
            <TabsContent value="compromised">
              <GenericDetailList
                items={compromisedUsers}
                columns={[
                  { label: 'Nome', accessor: u => u.displayName },
                  { label: 'UPN', accessor: u => u.upn },
                  { label: 'Nível', accessor: u => RISK_LABELS[u.riskLevel] || u.riskLevel, badge: true, badgeColor: '#ef4444' },
                ]}
                searchKeys={[u => u.displayName, u => u.upn]}
                icon={AlertTriangle}
                iconColor="text-red-500"
              />
            </TabsContent>
          </Tabs>
        );
      }

      case 'failed_logins': {
        const details = loginActivity.details || [];
        const successItems = details.filter(l => l.status === 'success');
        const failedItems = details.filter(l => l.status === 'failed');
        const blockedItems = details.filter(l => l.status === 'blocked');

        const STATUS_LABELS: Record<string, string> = { success: 'Sucesso', failed: 'Falha', blocked: 'Bloqueado' };

        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <TabsTrigger value="success" className={`${TAB_CLASS} text-emerald-500 data-[state=active]:border-emerald-500`}>Sucesso ({successItems.length})</TabsTrigger>
              <TabsTrigger value="failed" className={`${TAB_CLASS} text-amber-500 data-[state=active]:border-amber-500`}>Falhas ({failedItems.length})</TabsTrigger>
              <TabsTrigger value="blocked" className={`${TAB_CLASS} text-red-500 data-[state=active]:border-red-500`}>Bloqueados ({blockedItems.length})</TabsTrigger>
              <ExportButton onClick={() => {
                const rows = details.map(l => ({
                  'Usuário': l.displayName, 'UPN': l.upn, 'Status': STATUS_LABELS[l.status] || l.status,
                  'Código Erro': l.errorCode, 'País': l.location, 'Cidade': l.city, 'Aplicação': l.app,
                  'Data/Hora': l.createdDateTime ? new Date(l.createdDateTime).toLocaleString('pt-BR') : '',
                }));
                downloadXlsx(rows, 'Logins', `logins-${date}.xlsx`, [25, 35, 12, 12, 15, 15, 25, 20]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Logins</Badge>
                <div className="grid grid-cols-4 gap-3">
                  <MetricCard label="Total" value={loginActivity.total} icon={LogIn} />
                  <MetricCard label="Sucesso" value={loginActivity.success} color="text-emerald-500" />
                  <MetricCard label="Falhas" value={loginActivity.failed} color="text-amber-500" />
                  <MetricCard label="Bloqueados" value={loginActivity.blocked} color="text-red-500" />
                </div>
                <ProportionalBar segments={[
                  { label: 'Sucesso', value: loginActivity.success, colorClass: 'bg-emerald-500' },
                  { label: 'Falhas', value: loginActivity.failed, colorClass: 'bg-amber-500' },
                  { label: 'Bloqueados', value: loginActivity.blocked, colorClass: 'bg-red-500' },
                ]} />
                <MetricCard label="MFA Exigido" value={loginActivity.mfaRequired} icon={ShieldCheck} />
              </div>
            </TabsContent>
            {(['success', 'failed', 'blocked'] as const).map(status => (
              <TabsContent key={status} value={status}>
                <GenericDetailList
                  items={status === 'success' ? successItems : status === 'failed' ? failedItems : blockedItems}
                  columns={[
                    { label: 'Usuário', accessor: l => l.displayName || l.upn },
                    { label: 'UPN', accessor: l => l.upn },
                    { label: 'App', accessor: l => l.app },
                    { label: 'Local', accessor: l => [l.city, l.location].filter(Boolean).join(', '), badge: true },
                  ]}
                  searchKeys={[l => l.displayName, l => l.upn, l => l.app]}
                  icon={LogIn}
                  iconColor={status === 'success' ? 'text-emerald-500' : status === 'failed' ? 'text-amber-500' : 'text-red-500'}
                />
              </TabsContent>
            ))}
          </Tabs>
        );
      }

      case 'administrators': {
        const details = admins.details || [];
        const globalAdmins = details.filter(u => u.roles.includes('Global Administrator'));
        const otherAdmins = details.filter(u => !u.roles.includes('Global Administrator'));

        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <TabsTrigger value="all" className={TAB_CLASS}>Todos ({details.length})</TabsTrigger>
              <TabsTrigger value="global" className={`${TAB_CLASS} text-amber-500 data-[state=active]:border-amber-500`}>Global Admins ({globalAdmins.length})</TabsTrigger>
              <ExportButton onClick={() => {
                const rows = details.map(u => ({
                  'Nome': u.displayName, 'UPN': u.upn, 'Roles': u.roles.join(', '),
                }));
                downloadXlsx(rows, 'Administradores', `administradores-${date}.xlsx`, [30, 35, 60]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Administradores</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total de Admins" value={admins.total} icon={UserCog} />
                  <MetricCard label="Global Admins" value={admins.globalAdmins} color="text-amber-500" />
                  <MetricCard label="Outros Admins" value={Math.max(0, admins.total - admins.globalAdmins)} color="text-violet-500" />
                </div>
                <ProportionalBar segments={[
                  { label: 'Global Admins', value: admins.globalAdmins, colorClass: 'bg-amber-500' },
                  { label: 'Outros', value: Math.max(0, admins.total - admins.globalAdmins), colorClass: 'bg-violet-500' },
                ]} />
              </div>
            </TabsContent>
            <TabsContent value="all">
              <GenericDetailList
                items={details}
                columns={[
                  { label: 'Nome', accessor: u => u.displayName },
                  { label: 'UPN', accessor: u => u.upn },
                  { label: 'Roles', accessor: u => u.roles.join(', ') },
                ]}
                searchKeys={[u => u.displayName, u => u.upn, u => u.roles.join(' ')]}
                icon={UserCog}
                iconColor="text-violet-500"
              />
            </TabsContent>
            <TabsContent value="global">
              <GenericDetailList
                items={globalAdmins}
                columns={[
                  { label: 'Nome', accessor: u => u.displayName },
                  { label: 'UPN', accessor: u => u.upn },
                  { label: 'Roles', accessor: u => u.roles.join(', ') },
                ]}
                searchKeys={[u => u.displayName, u => u.upn]}
                icon={UserCog}
                iconColor="text-amber-500"
              />
            </TabsContent>
          </Tabs>
        );
      }

      case 'disabled_accounts': {
        const details = users.disabledDetails || [];
        const pctStr = users.total > 0 ? ((users.disabled / users.total) * 100).toFixed(1) : '0.0';

        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <TabsTrigger value="list" className={TAB_CLASS}>Lista ({details.length})</TabsTrigger>
              <ExportButton onClick={() => {
                const rows = details.map(u => ({
                  'Nome': u.displayName, 'UPN': u.upn,
                  'Criado em': u.createdDateTime ? new Date(u.createdDateTime).toLocaleString('pt-BR') : '',
                }));
                downloadXlsx(rows, 'Contas Desabilitadas', `contas-desabilitadas-${date}.xlsx`, [30, 35, 22]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total Diretório" value={users.total} icon={Users} />
                  <MetricCard label="Desabilitadas" value={users.disabled} color="text-indigo-500" icon={UserX} />
                  <MetricCard label="% do Total" value={`${pctStr}%`} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Habilitados', value: users.signInEnabled, colorClass: 'bg-emerald-500' },
                  { label: 'Desabilitados', value: users.disabled, colorClass: 'bg-indigo-500' },
                ]} />
              </div>
            </TabsContent>
            <TabsContent value="list">
              <GenericDetailList
                items={details}
                columns={[
                  { label: 'Nome', accessor: u => u.displayName },
                  { label: 'UPN', accessor: u => u.upn },
                  { label: 'Criado em', accessor: u => u.createdDateTime ? new Date(u.createdDateTime).toLocaleDateString('pt-BR') : '' },
                ]}
                searchKeys={[u => u.displayName, u => u.upn]}
                icon={UserX}
                iconColor="text-indigo-500"
              />
            </TabsContent>
          </Tabs>
        );
      }

      case 'guest_users': {
        const details = users.guestDetails || [];
        const pctStr = users.total > 0 ? ((users.guests / users.total) * 100).toFixed(1) : '0.0';

        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <TabsTrigger value="list" className={TAB_CLASS}>Lista ({details.length})</TabsTrigger>
              <ExportButton onClick={() => {
                const rows = details.map(u => ({
                  'Nome': u.displayName, 'UPN': u.upn, 'Email': u.mail,
                  'Criado em': u.createdDateTime ? new Date(u.createdDateTime).toLocaleString('pt-BR') : '',
                }));
                downloadXlsx(rows, 'Convidados', `convidados-${date}.xlsx`, [30, 35, 35, 22]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total Diretório" value={users.total} icon={Users} />
                  <MetricCard label="Convidados" value={users.guests} color="text-pink-500" icon={UserPlus} />
                  <MetricCard label="% do Diretório" value={`${pctStr}%`} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Membros', value: users.total - users.guests, colorClass: 'bg-teal-500' },
                  { label: 'Convidados', value: users.guests, colorClass: 'bg-pink-500' },
                ]} />
              </div>
            </TabsContent>
            <TabsContent value="list">
              <GenericDetailList
                items={details}
                columns={[
                  { label: 'Nome', accessor: u => u.displayName },
                  { label: 'UPN', accessor: u => u.upn },
                  { label: 'Email', accessor: u => u.mail },
                ]}
                searchKeys={[u => u.displayName, u => u.upn, u => u.mail]}
                icon={UserPlus}
                iconColor="text-pink-500"
              />
            </TabsContent>
          </Tabs>
        );
      }

      case 'password_activity': {
        const details = passwordActivity.details || [];
        const resetItems = details.filter(d => d.type === 'reset');
        const selfServiceItems = details.filter(d => d.type === 'selfService');
        const forcedItems = details.filter(d => d.type === 'forced');
        const total = passwordActivity.resets + passwordActivity.forcedChanges + passwordActivity.selfService;

        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <TabsTrigger value="resets" className={`${TAB_CLASS} text-orange-500 data-[state=active]:border-orange-500`}>Resets ({resetItems.length})</TabsTrigger>
              <TabsTrigger value="selfService" className={`${TAB_CLASS} text-blue-500 data-[state=active]:border-blue-500`}>Self-Service ({selfServiceItems.length})</TabsTrigger>
              <TabsTrigger value="forced" className={`${TAB_CLASS} text-red-500 data-[state=active]:border-red-500`}>Forçados ({forcedItems.length})</TabsTrigger>
              <ExportButton onClick={() => {
                const TYPE_LABELS: Record<string, string> = { reset: 'Reset por Admin', selfService: 'Self-Service', forced: 'Forçado' };
                const rows = details.map(d => ({
                  'Atividade': d.activity, 'Tipo': TYPE_LABELS[d.type] || d.type,
                  'Usuário Alvo': d.targetUser, 'Iniciado por': d.initiatedBy,
                  'Data/Hora': d.activityDateTime ? new Date(d.activityDateTime).toLocaleString('pt-BR') : '',
                }));
                downloadXlsx(rows, 'Atividade Senhas', `atividade-senhas-${date}.xlsx`, [30, 18, 30, 25, 22]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo (Período)</Badge>
                <div className="grid grid-cols-4 gap-3">
                  <MetricCard label="Total" value={total} icon={KeyRound} />
                  <MetricCard label="Resets" value={passwordActivity.resets} color="text-orange-500" />
                  <MetricCard label="Self-Service" value={passwordActivity.selfService} color="text-blue-500" />
                  <MetricCard label="Forçados" value={passwordActivity.forcedChanges} color="text-red-500" />
                </div>
                <ProportionalBar segments={[
                  { label: 'Resets', value: passwordActivity.resets, colorClass: 'bg-orange-500' },
                  { label: 'Self-Service', value: passwordActivity.selfService, colorClass: 'bg-blue-500' },
                  { label: 'Forçados', value: passwordActivity.forcedChanges, colorClass: 'bg-red-500' },
                ]} />
              </div>
            </TabsContent>
            {(['resets', 'selfService', 'forced'] as const).map(type => (
              <TabsContent key={type} value={type}>
                <GenericDetailList
                  items={type === 'resets' ? resetItems : type === 'selfService' ? selfServiceItems : forcedItems}
                  columns={[
                    { label: 'Usuário Alvo', accessor: d => d.targetUser },
                    { label: 'Atividade', accessor: d => d.activity },
                    { label: 'Iniciado por', accessor: d => d.initiatedBy },
                    { label: 'Data', accessor: d => d.activityDateTime ? new Date(d.activityDateTime).toLocaleString('pt-BR') : '' },
                  ]}
                  searchKeys={[d => d.targetUser, d => d.initiatedBy, d => d.activity]}
                  icon={KeyRound}
                  iconColor={type === 'resets' ? 'text-orange-500' : type === 'selfService' ? 'text-blue-500' : 'text-red-500'}
                />
              </TabsContent>
            ))}
          </Tabs>
        );
      }

      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: `${meta.colorHex}15` }}>
              <IconComp className="w-5 h-5" style={{ color: meta.colorHex }} />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg">{meta.label}</SheetTitle>
              <SheetDescription className="text-xs">{meta.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6">
            {renderContent()}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
