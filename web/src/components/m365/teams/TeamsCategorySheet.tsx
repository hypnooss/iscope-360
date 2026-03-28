import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Eye, Lock, UserPlus, Hash, Share, Globe, Share2, FolderX, Download,
  Users, HardDrive, Activity, Database,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { CollaborationDashboardData } from '@/hooks/useCollaborationDashboard';
import type { TeamsOperationalCategory } from './TeamsAnalyzerCategoryGrid';
import { GenericDetailList } from '@/components/m365/entra-id/GenericDetailList';

interface TeamsCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: TeamsOperationalCategory | null;
  dashboardData: CollaborationDashboardData | null;
}

const CATEGORY_META: Record<TeamsOperationalCategory, {
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colorHex: string;
  description: string;
}> = {
  public_teams:     { label: 'Teams Públicas',           icon: Eye,      colorHex: '#ef4444', description: 'Teams com visibilidade pública que podem ser descobertas e acessadas por qualquer membro da organização.' },
  private_teams:    { label: 'Teams Privadas',           icon: Lock,     colorHex: '#14b8a6', description: 'Teams com acesso restrito que requerem convite para participação.' },
  guest_access:     { label: 'Convidados Externos',      icon: UserPlus, colorHex: '#f59e0b', description: 'Teams que possuem usuários convidados externos à organização.' },
  private_channels: { label: 'Canais Privados',          icon: Hash,     colorHex: '#8b5cf6', description: 'Canais privados dentro das Teams com acesso limitado a membros específicos.' },
  shared_channels:  { label: 'Canais Compartilhados',    icon: Share,    colorHex: '#f97316', description: 'Canais compartilhados entre diferentes Teams ou organizações externas.' },
  sharepoint_sites: { label: 'Sites SharePoint',         icon: Globe,    colorHex: '#3b82f6', description: 'Visão geral dos sites SharePoint Online associados ao tenant.' },
  external_sharing: { label: 'Compartilhamento Externo', icon: Share2,   colorHex: '#dc2626', description: 'Sites SharePoint com compartilhamento externo habilitado.' },
  inactive_sites:   { label: 'Sites Inativos',           icon: FolderX,  colorHex: '#6366f1', description: 'Sites SharePoint sem atividade recente que podem representar risco ou desperdício.' },
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

export function TeamsCategorySheet({ open, onOpenChange, category, dashboardData }: TeamsCategorySheetProps) {
  if (!category) return null;

  const meta = CATEGORY_META[category];
  const IconComp = meta.icon;
  const teams = dashboardData?.teams;
  const sharepoint = dashboardData?.sharepoint;
  const date = new Date().toISOString().slice(0, 10);

  const renderContent = () => {
    if (!teams || !sharepoint) return <p className="text-xs text-muted-foreground py-2">Sem dados disponíveis</p>;

    const totalTeams = teams.total || 1;
    const totalSites = sharepoint.totalSites || 1;
    const teamDetails = teams.teamDetails || [];
    const siteDetails = sharepoint.siteDetails || [];
    const hasTeamDetails = teamDetails.length > 0;
    const hasSiteDetails = siteDetails.length > 0;

    switch (category) {
      case 'public_teams': {
        const publicDetails = teamDetails.filter(t => t.visibility === 'Public');
        const privateDetails = teamDetails.filter(t => t.visibility === 'Private');
        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              {hasTeamDetails && (
                <>
                  <TabsTrigger value="public" className={`${TAB_CLASS} text-red-500 data-[state=active]:border-red-500`}>Públicas ({publicDetails.length})</TabsTrigger>
                  <TabsTrigger value="private" className={`${TAB_CLASS} text-teal-500 data-[state=active]:border-teal-500`}>Privadas ({privateDetails.length})</TabsTrigger>
                </>
              )}
              <ExportButton onClick={() => {
                if (hasTeamDetails) {
                  const rows = teamDetails.map(t => ({
                    'Nome': t.displayName, 'Visibilidade': t.visibility === 'Public' ? 'Pública' : 'Privada',
                    'Convidados': t.hasGuests ? 'Sim' : 'Não', 'Membros': t.memberCount ?? '',
                  }));
                  downloadXlsx(rows, 'Teams', `teams-publicas-${date}.xlsx`, [30, 14, 12, 10]);
                } else {
                  downloadXlsx([
                    { 'Métrica': 'Teams Públicas', 'Valor': teams.public },
                    { 'Métrica': 'Teams Privadas', 'Valor': teams.private },
                    { 'Métrica': 'Total', 'Valor': teams.total },
                    { 'Métrica': '% Públicas', 'Valor': `${((teams.public / totalTeams) * 100).toFixed(1)}%` },
                  ], 'Teams Públicas', `teams-publicas-${date}.xlsx`, [22, 12]);
                }
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Visibilidade</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total de Teams" value={teams.total} icon={Users} />
                  <MetricCard label="Públicas" value={teams.public} color="text-red-500" icon={Eye} />
                  <MetricCard label="Privadas" value={teams.private} color="text-teal-500" icon={Lock} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Públicas', value: teams.public, colorClass: 'bg-red-500' },
                  { label: 'Privadas', value: teams.private, colorClass: 'bg-teal-500' },
                ]} />
              </div>
            </TabsContent>
            {hasTeamDetails && (
              <>
                <TabsContent value="public">
                  <GenericDetailList
                    items={publicDetails}
                    columns={[
                      { label: 'Nome', accessor: t => t.displayName },
                      { label: 'Membros', accessor: t => String(t.memberCount ?? '-') },
                      { label: 'Convidados', accessor: t => t.hasGuests ? 'Sim' : 'Não', badge: true, badgeColor: '#f59e0b' },
                    ]}
                    searchKeys={[t => t.displayName]}
                    icon={Eye}
                    iconColor="text-red-500"
                  />
                </TabsContent>
                <TabsContent value="private">
                  <GenericDetailList
                    items={privateDetails}
                    columns={[
                      { label: 'Nome', accessor: t => t.displayName },
                      { label: 'Membros', accessor: t => String(t.memberCount ?? '-') },
                      { label: 'Convidados', accessor: t => t.hasGuests ? 'Sim' : 'Não', badge: true, badgeColor: '#10b981' },
                    ]}
                    searchKeys={[t => t.displayName]}
                    icon={Lock}
                    iconColor="text-teal-500"
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
        );
      }

      case 'private_teams': {
        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <ExportButton onClick={() => {
                downloadXlsx([
                  { 'Métrica': 'Teams Privadas', 'Valor': teams.private },
                  { 'Métrica': 'Teams Públicas', 'Valor': teams.public },
                  { 'Métrica': 'Total', 'Valor': teams.total },
                  { 'Métrica': '% Privadas', 'Valor': `${((teams.private / totalTeams) * 100).toFixed(1)}%` },
                ], 'Teams Privadas', `teams-privadas-${date}.xlsx`, [22, 12]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Visibilidade</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total de Teams" value={teams.total} icon={Users} />
                  <MetricCard label="Privadas" value={teams.private} color="text-teal-500" icon={Lock} />
                  <MetricCard label="Públicas" value={teams.public} color="text-red-500" icon={Eye} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Privadas', value: teams.private, colorClass: 'bg-teal-500' },
                  { label: 'Públicas', value: teams.public, colorClass: 'bg-red-500' },
                ]} />
              </div>
            </TabsContent>
          </Tabs>
        );
      }

      case 'guest_access': {
        const withGuests = teamDetails.filter(t => t.hasGuests);
        const withoutGuests = teamDetails.filter(t => !t.hasGuests);
        const noGuestsCount = Math.max(0, teams.total - teams.withGuests);
        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              {hasTeamDetails && (
                <>
                  <TabsTrigger value="withGuests" className={`${TAB_CLASS} text-amber-500 data-[state=active]:border-amber-500`}>Com Convidados ({withGuests.length})</TabsTrigger>
                  <TabsTrigger value="withoutGuests" className={`${TAB_CLASS} text-emerald-500 data-[state=active]:border-emerald-500`}>Sem Convidados ({withoutGuests.length})</TabsTrigger>
                </>
              )}
              <ExportButton onClick={() => {
                if (hasTeamDetails) {
                  const rows = teamDetails.map(t => ({
                    'Nome': t.displayName, 'Visibilidade': t.visibility === 'Public' ? 'Pública' : 'Privada',
                    'Tem Convidados': t.hasGuests ? 'Sim' : 'Não', 'Membros': t.memberCount ?? '',
                  }));
                  downloadXlsx(rows, 'Convidados', `convidados-externos-${date}.xlsx`, [30, 14, 16, 10]);
                } else {
                  downloadXlsx([
                    { 'Métrica': 'Teams com Convidados', 'Valor': teams.withGuests },
                    { 'Métrica': 'Teams sem Convidados', 'Valor': noGuestsCount },
                    { 'Métrica': 'Total', 'Valor': teams.total },
                    { 'Métrica': '% com Convidados', 'Valor': `${((teams.withGuests / totalTeams) * 100).toFixed(1)}%` },
                  ], 'Convidados', `convidados-externos-${date}.xlsx`, [26, 12]);
                }
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Convidados</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total de Teams" value={teams.total} icon={Users} />
                  <MetricCard label="Com Convidados" value={teams.withGuests} color="text-amber-500" icon={UserPlus} />
                  <MetricCard label="Sem Convidados" value={noGuestsCount} color="text-emerald-500" icon={Lock} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Com Convidados', value: teams.withGuests, colorClass: 'bg-amber-500' },
                  { label: 'Sem Convidados', value: noGuestsCount, colorClass: 'bg-emerald-500' },
                ]} />
              </div>
            </TabsContent>
            {hasTeamDetails && (
              <>
                <TabsContent value="withGuests">
                  <GenericDetailList
                    items={withGuests}
                    columns={[
                      { label: 'Nome', accessor: t => t.displayName },
                      { label: 'Visibilidade', accessor: t => t.visibility === 'Public' ? 'Pública' : 'Privada' },
                      { label: 'Membros', accessor: t => String(t.memberCount ?? '-') },
                    ]}
                    searchKeys={[t => t.displayName]}
                    icon={UserPlus}
                    iconColor="text-amber-500"
                  />
                </TabsContent>
                <TabsContent value="withoutGuests">
                  <GenericDetailList
                    items={withoutGuests}
                    columns={[
                      { label: 'Nome', accessor: t => t.displayName },
                      { label: 'Visibilidade', accessor: t => t.visibility === 'Public' ? 'Pública' : 'Privada' },
                      { label: 'Membros', accessor: t => String(t.memberCount ?? '-') },
                    ]}
                    searchKeys={[t => t.displayName]}
                    icon={Lock}
                    iconColor="text-emerald-500"
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
        );
      }

      case 'private_channels':
      case 'shared_channels': {
        const isPrivate = category === 'private_channels';
        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <ExportButton onClick={() => {
                downloadXlsx([
                  { 'Métrica': 'Canais Privados', 'Valor': teams.privateChannels },
                  { 'Métrica': 'Canais Compartilhados', 'Valor': teams.sharedChannels },
                  { 'Métrica': 'Total de Teams', 'Valor': teams.total },
                ], isPrivate ? 'Canais Privados' : 'Canais Compartilhados', `canais-${isPrivate ? 'privados' : 'compartilhados'}-${date}.xlsx`, [28, 12]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Canais</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total de Teams" value={teams.total} icon={Users} />
                  <MetricCard label="Canais Privados" value={teams.privateChannels} color="text-violet-500" icon={Hash} />
                  <MetricCard label="Canais Compartilhados" value={teams.sharedChannels} color="text-orange-500" icon={Share} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Privados', value: teams.privateChannels, colorClass: 'bg-violet-500' },
                  { label: 'Compartilhados', value: teams.sharedChannels, colorClass: 'bg-orange-500' },
                ]} />
              </div>
            </TabsContent>
          </Tabs>
        );
      }

      case 'sharepoint_sites': {
        const activeDetails = siteDetails.filter(s => {
          if (!s.lastActivity) return false;
          const d = new Date(s.lastActivity);
          return d >= new Date(Date.now() - 7 * 86400000);
        });
        const inactiveDetails = siteDetails.filter(s => {
          if (!s.lastActivity) return true;
          const d = new Date(s.lastActivity);
          return d < new Date(Date.now() - 7 * 86400000);
        });
        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              {hasSiteDetails && (
                <>
                  <TabsTrigger value="active" className={`${TAB_CLASS} text-emerald-500 data-[state=active]:border-emerald-500`}>Ativos ({activeDetails.length})</TabsTrigger>
                  <TabsTrigger value="inactive" className={`${TAB_CLASS} text-indigo-500 data-[state=active]:border-indigo-500`}>Inativos ({inactiveDetails.length})</TabsTrigger>
                </>
              )}
              <ExportButton onClick={() => {
                if (hasSiteDetails) {
                  const rows = siteDetails.map(s => ({
                    'Nome': s.displayName, 'URL': s.webUrl ?? '',
                    'Última Atividade': s.lastActivity ? new Date(s.lastActivity).toLocaleDateString('pt-BR') : 'Nunca',
                    'Storage (GB)': s.storageUsedGB?.toFixed(2) ?? '',
                    'Compartilhamento Externo': s.externalSharing ? 'Habilitado' : 'Desabilitado',
                  }));
                  downloadXlsx(rows, 'Sites SharePoint', `sites-sharepoint-${date}.xlsx`, [30, 40, 18, 14, 22]);
                } else {
                  downloadXlsx([
                    { 'Métrica': 'Total de Sites', 'Valor': sharepoint.totalSites },
                    { 'Métrica': 'Sites Ativos', 'Valor': sharepoint.activeSites },
                    { 'Métrica': 'Sites Inativos', 'Valor': sharepoint.inactiveSites },
                    { 'Métrica': 'Storage Usado (GB)', 'Valor': sharepoint.storageUsedGB },
                    { 'Métrica': 'Storage Alocado (GB)', 'Valor': sharepoint.storageAllocatedGB },
                    { 'Métrica': 'Compartilhamento Externo', 'Valor': sharepoint.externalSharingEnabled },
                  ], 'Sites SharePoint', `sites-sharepoint-${date}.xlsx`, [28, 16]);
                }
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo SharePoint</Badge>
                <div className="grid grid-cols-4 gap-3">
                  <MetricCard label="Total de Sites" value={sharepoint.totalSites} icon={Globe} />
                  <MetricCard label="Ativos" value={sharepoint.activeSites} color="text-emerald-500" icon={Activity} />
                  <MetricCard label="Inativos" value={sharepoint.inactiveSites} color="text-indigo-500" icon={FolderX} />
                  <MetricCard label="Comp. Externo" value={sharepoint.externalSharingEnabled} color="text-red-500" icon={Share2} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Ativos', value: sharepoint.activeSites, colorClass: 'bg-emerald-500' },
                  { label: 'Inativos', value: sharepoint.inactiveSites, colorClass: 'bg-indigo-500' },
                ]} />
                <div className="space-y-3 pt-2">
                  <Badge variant="outline" className="text-xs">Armazenamento</Badge>
                  <div className="grid grid-cols-2 gap-3">
                    <MetricCard label="Usado (GB)" value={sharepoint.storageUsedGB.toFixed(2)} icon={HardDrive} color="text-sky-500" />
                    <MetricCard label="Alocado (GB)" value={sharepoint.storageAllocatedGB > 0 ? sharepoint.storageAllocatedGB.toFixed(2) : 'N/D'} icon={Database} />
                  </div>
                  {sharepoint.storageAllocatedGB > 0 && (
                    <ProportionalBar segments={[
                      { label: 'Usado', value: sharepoint.storageUsedGB, colorClass: 'bg-sky-500' },
                      { label: 'Livre', value: Math.max(0, sharepoint.storageAllocatedGB - sharepoint.storageUsedGB), colorClass: 'bg-secondary' },
                    ]} />
                  )}
                </div>
              </div>
            </TabsContent>
            {hasSiteDetails && (
              <>
                <TabsContent value="active">
                  <GenericDetailList
                    items={activeDetails}
                    columns={[
                      { label: 'Nome', accessor: s => s.displayName },
                      { label: 'Última Atividade', accessor: s => s.lastActivity ? new Date(s.lastActivity).toLocaleDateString('pt-BR') : 'N/D' },
                      { label: 'Storage (GB)', accessor: s => s.storageUsedGB?.toFixed(2) ?? '-' },
                    ]}
                    searchKeys={[s => s.displayName, s => s.webUrl ?? '']}
                    icon={Activity}
                    iconColor="text-emerald-500"
                  />
                </TabsContent>
                <TabsContent value="inactive">
                  <GenericDetailList
                    items={inactiveDetails}
                    columns={[
                      { label: 'Nome', accessor: s => s.displayName },
                      { label: 'Última Atividade', accessor: s => s.lastActivity ? new Date(s.lastActivity).toLocaleDateString('pt-BR') : 'Nunca' },
                      { label: 'Storage (GB)', accessor: s => s.storageUsedGB?.toFixed(2) ?? '-' },
                    ]}
                    searchKeys={[s => s.displayName, s => s.webUrl ?? '']}
                    icon={FolderX}
                    iconColor="text-indigo-500"
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
        );
      }

      case 'external_sharing': {
        const disabled = Math.max(0, sharepoint.totalSites - sharepoint.externalSharingEnabled);
        const enabledDetails = siteDetails.filter(s => s.externalSharing);
        const disabledDetails = siteDetails.filter(s => !s.externalSharing);
        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              {hasSiteDetails && (
                <>
                  <TabsTrigger value="enabled" className={`${TAB_CLASS} text-red-500 data-[state=active]:border-red-500`}>Habilitados ({enabledDetails.length})</TabsTrigger>
                  <TabsTrigger value="disabled" className={`${TAB_CLASS} text-emerald-500 data-[state=active]:border-emerald-500`}>Desabilitados ({disabledDetails.length})</TabsTrigger>
                </>
              )}
              <ExportButton onClick={() => {
                if (hasSiteDetails) {
                  const rows = siteDetails.map(s => ({
                    'Nome': s.displayName, 'URL': s.webUrl ?? '',
                    'Compartilhamento Externo': s.externalSharing ? 'Habilitado' : 'Desabilitado',
                    'Storage (GB)': s.storageUsedGB?.toFixed(2) ?? '',
                  }));
                  downloadXlsx(rows, 'Compartilhamento Externo', `compartilhamento-externo-${date}.xlsx`, [30, 40, 24, 14]);
                } else {
                  downloadXlsx([
                    { 'Métrica': 'Sites com Compartilhamento', 'Valor': sharepoint.externalSharingEnabled },
                    { 'Métrica': 'Sites sem Compartilhamento', 'Valor': disabled },
                    { 'Métrica': 'Total', 'Valor': sharepoint.totalSites },
                    { 'Métrica': '% Habilitados', 'Valor': `${((sharepoint.externalSharingEnabled / totalSites) * 100).toFixed(1)}%` },
                  ], 'Compartilhamento Externo', `compartilhamento-externo-${date}.xlsx`, [32, 12]);
                }
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Compartilhamento Externo</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total de Sites" value={sharepoint.totalSites} icon={Globe} />
                  <MetricCard label="Habilitados" value={sharepoint.externalSharingEnabled} color="text-red-500" icon={Share2} />
                  <MetricCard label="Desabilitados" value={disabled} color="text-emerald-500" icon={Lock} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Habilitados', value: sharepoint.externalSharingEnabled, colorClass: 'bg-red-500' },
                  { label: 'Desabilitados', value: disabled, colorClass: 'bg-emerald-500' },
                ]} />
              </div>
            </TabsContent>
            {hasSiteDetails && (
              <>
                <TabsContent value="enabled">
                  <GenericDetailList
                    items={enabledDetails}
                    columns={[
                      { label: 'Nome', accessor: s => s.displayName },
                      { label: 'URL', accessor: s => s.webUrl ?? '' },
                      { label: 'Storage (GB)', accessor: s => s.storageUsedGB?.toFixed(2) ?? '-' },
                    ]}
                    searchKeys={[s => s.displayName, s => s.webUrl ?? '']}
                    icon={Share2}
                    iconColor="text-red-500"
                  />
                </TabsContent>
                <TabsContent value="disabled">
                  <GenericDetailList
                    items={disabledDetails}
                    columns={[
                      { label: 'Nome', accessor: s => s.displayName },
                      { label: 'URL', accessor: s => s.webUrl ?? '' },
                      { label: 'Storage (GB)', accessor: s => s.storageUsedGB?.toFixed(2) ?? '-' },
                    ]}
                    searchKeys={[s => s.displayName, s => s.webUrl ?? '']}
                    icon={Lock}
                    iconColor="text-emerald-500"
                  />
                </TabsContent>
              </>
            )}
          </Tabs>
        );
      }

      case 'inactive_sites': {
        return (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-0 h-auto py-0">
              <TabsTrigger value="overview" className={TAB_CLASS}>Status Geral</TabsTrigger>
              <ExportButton onClick={() => {
                downloadXlsx([
                  { 'Métrica': 'Sites Inativos', 'Valor': sharepoint.inactiveSites },
                  { 'Métrica': 'Sites Ativos', 'Valor': sharepoint.activeSites },
                  { 'Métrica': 'Total', 'Valor': sharepoint.totalSites },
                  { 'Métrica': '% Inativos', 'Valor': `${((sharepoint.inactiveSites / totalSites) * 100).toFixed(1)}%` },
                ], 'Sites Inativos', `sites-inativos-${date}.xlsx`, [22, 12]);
              }} />
            </TabsList>
            <TabsContent value="overview">
              <div className="space-y-3">
                <Badge variant="outline" className="text-xs">Resumo de Atividade</Badge>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Total de Sites" value={sharepoint.totalSites} icon={Globe} />
                  <MetricCard label="Inativos" value={sharepoint.inactiveSites} color="text-indigo-500" icon={FolderX} />
                  <MetricCard label="Ativos" value={sharepoint.activeSites} color="text-emerald-500" icon={Activity} />
                </div>
                <ProportionalBar segments={[
                  { label: 'Inativos', value: sharepoint.inactiveSites, colorClass: 'bg-indigo-500' },
                  { label: 'Ativos', value: sharepoint.activeSites, colorClass: 'bg-emerald-500' },
                ]} />
              </div>
            </TabsContent>
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
              <SheetDescription className="text-xs mt-0.5">{meta.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-4">
            {renderContent()}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
