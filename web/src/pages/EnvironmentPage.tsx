import { useEffect, useState, useMemo, useCallback } from 'react';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePreview } from '@/contexts/PreviewContext';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { AssetCategorySection } from '@/components/environment/AssetCategorySection';
import { DeleteEnvironmentDomainDialog } from '@/components/environment/DeleteEnvironmentDomainDialog';
import { Button } from '@/components/ui/button';
import {
  Monitor, Search, Building2, Globe, Shield, Cloud, Plus, Pencil, Trash2,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

type AssetType = 'firewall' | 'external_domain' | 'm365_tenant';

interface UnifiedAsset {
  id: string;
  name: string;
  type: AssetType;
  workspaceId: string;
  workspaceName: string;
  score: number | null;
  status: string;
  agentName: string | null;
  navigationUrl: string;
  scheduleFrequency?: string | null;
  scheduleHour?: number;
  scheduleDayOfWeek?: number;
  scheduleDayOfMonth?: number;
}

export default function EnvironmentPage() {
  const { user, loading: authLoading } = useAuth();
  const { isPreviewMode, previewTarget } = usePreview();
  const { effectiveRole } = useEffectiveAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isSuperRole = effectiveRole === 'super_admin' || effectiveRole === 'super_suporte';
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteFirewallTarget, setDeleteFirewallTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteFirewallLoading, setDeleteFirewallLoading] = useState(false);
  const [deleteM365Target, setDeleteM365Target] = useState<{ id: string; name: string } | null>(null);
  const [deleteM365Loading, setDeleteM365Loading] = useState(false);

  // Fetch workspaces
  const { data: allWorkspaces } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuperRole && !isPreviewMode,
    staleTime: 1000 * 60 * 5,
  });

  const { selectedWorkspaceId, setSelectedWorkspaceId } = useWorkspaceSelector(allWorkspaces, isSuperRole);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  // Determine workspace filter
  const workspaceFilter = useMemo(() => {
    if (isPreviewMode && previewTarget?.workspaces) {
      return previewTarget.workspaces.map((w) => w.id);
    }
    if (isSuperRole && selectedWorkspaceId) {
      return [selectedWorkspaceId];
    }
    return null;
  }, [isPreviewMode, previewTarget, isSuperRole, selectedWorkspaceId]);

  // Fetch all assets with agent info
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['environment-assets', workspaceFilter],
    queryFn: async () => {
      let fwQuery = supabase.from('firewalls').select('id, name, client_id, last_score, agent_id, agents(name)');
      let edQuery = supabase.from('external_domains').select('id, name, domain, client_id, last_score, status, agent_id, agents(name)');
      let m365Query = supabase.from('m365_tenants').select('id, display_name, tenant_domain, client_id, connection_status, m365_tenant_agents(agent_id, agents(name))');
      let clientsQuery = supabase.from('clients').select('id, name');
      let fwScheduleQuery = supabase.from('analysis_schedules').select('firewall_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month').eq('is_active', true);
      let edScheduleQuery = supabase.from('external_domain_schedules').select('domain_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month').eq('is_active', true);
      const m365ScheduleQuery = supabase.from('m365_compliance_schedules').select('tenant_record_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month').eq('is_active', true);

      if (workspaceFilter && workspaceFilter.length > 0) {
        fwQuery = fwQuery.in('client_id', workspaceFilter);
        edQuery = edQuery.in('client_id', workspaceFilter);
        m365Query = m365Query.in('client_id', workspaceFilter);
        clientsQuery = clientsQuery.in('id', workspaceFilter);
      }

      const [fwRes, edRes, m365Res, clientsRes, fwScheduleRes, edScheduleRes, m365ScheduleRes] = await Promise.all([
        fwQuery, edQuery, m365Query, clientsQuery, fwScheduleQuery, edScheduleQuery, m365ScheduleQuery,
      ]);

      if (fwRes.error) throw fwRes.error;
      if (edRes.error) throw edRes.error;
      if (m365Res.error) throw m365Res.error;
      if (clientsRes.error) throw clientsRes.error;

      const clientMap = new Map((clientsRes.data || []).map(c => [c.id, c.name]));
      const fwScheduleMap = new Map((fwScheduleRes.data || []).map((s: any) => [s.firewall_id, s]));
      const edScheduleMap = new Map((edScheduleRes.data || []).map((s: any) => [s.domain_id, s]));
      const m365ScheduleMap = new Map((m365ScheduleRes.data || []).map((s: any) => [s.tenant_record_id, s]));

      const unified: UnifiedAsset[] = [
        ...(fwRes.data || []).map((fw: any) => ({
          id: fw.id,
          name: fw.name,
          type: 'firewall' as AssetType,
          workspaceId: fw.client_id,
          workspaceName: clientMap.get(fw.client_id) || '—',
          score: fw.last_score,
          status: fw.last_score !== null ? 'analyzed' : 'pending',
          agentName: fw.agents?.name || null,
          navigationUrl: `/environment/firewall/${fw.id}/edit`,
          scheduleFrequency: fwScheduleMap.get(fw.id)?.frequency ?? null,
          scheduleHour: fwScheduleMap.get(fw.id)?.scheduled_hour ?? 0,
          scheduleDayOfWeek: fwScheduleMap.get(fw.id)?.scheduled_day_of_week ?? 1,
          scheduleDayOfMonth: fwScheduleMap.get(fw.id)?.scheduled_day_of_month ?? 1,
        })),
        ...(edRes.data || []).map((ed: any) => ({
          id: ed.id,
          name: ed.name || ed.domain,
          type: 'external_domain' as AssetType,
          workspaceId: ed.client_id,
          workspaceName: clientMap.get(ed.client_id) || '—',
          score: ed.last_score,
          status: ed.last_score !== null ? 'analyzed' : ed.status,
          agentName: ed.agents?.name || null,
          navigationUrl: `/environment/external-domain/${ed.id}/edit`,
          scheduleFrequency: edScheduleMap.get(ed.id)?.frequency ?? null,
          scheduleHour: edScheduleMap.get(ed.id)?.scheduled_hour ?? 0,
          scheduleDayOfWeek: edScheduleMap.get(ed.id)?.scheduled_day_of_week ?? 1,
          scheduleDayOfMonth: edScheduleMap.get(ed.id)?.scheduled_day_of_month ?? 1,
        })),
        ...(m365Res.data || []).map((t: any) => {
          const tenantAgent = t.m365_tenant_agents?.[0];
          return {
            id: t.id,
            name: t.display_name || t.tenant_domain || t.id,
            type: 'm365_tenant' as AssetType,
            workspaceId: t.client_id,
            workspaceName: clientMap.get(t.client_id) || '—',
            score: null,
            status: t.connection_status,
            agentName: tenantAgent?.agents?.name || null,
            navigationUrl: `/environment/m365/${t.id}/edit`,
            scheduleFrequency: m365ScheduleMap.get(t.id)?.frequency ?? null,
            scheduleHour: m365ScheduleMap.get(t.id)?.scheduled_hour ?? 0,
            scheduleDayOfWeek: m365ScheduleMap.get(t.id)?.scheduled_day_of_week ?? 1,
            scheduleDayOfMonth: m365ScheduleMap.get(t.id)?.scheduled_day_of_month ?? 1,
          };
        }),
      ];

      return unified;
    },
    enabled: !!user && (isSuperRole ? !!selectedWorkspaceId || isPreviewMode : true),
    staleTime: 1000 * 30,
  });

  // Stats
  const stats = useMemo(() => {
    const firewalls = assets.filter(a => a.type === 'firewall').length;
    const domains = assets.filter(a => a.type === 'external_domain').length;
    const tenants = assets.filter(a => a.type === 'm365_tenant').length;
    return { total: assets.length, firewalls, domains, tenants };
  }, [assets]);

  // Filtered by search
  const filtered = useMemo(() => {
    if (!search) return assets;
    const q = search.toLowerCase();
    return assets.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.workspaceName.toLowerCase().includes(q) ||
      (a.agentName && a.agentName.toLowerCase().includes(q))
    );
  }, [assets, search]);

  const filteredFirewalls = useMemo(() => filtered.filter(a => a.type === 'firewall'), [filtered]);
  const filteredDomains = useMemo(() => filtered.filter(a => a.type === 'external_domain'), [filtered]);
  const filteredTenants = useMemo(() => filtered.filter(a => a.type === 'm365_tenant'), [filtered]);

  const handleDeleteFirewall = useCallback(async () => {
    if (!deleteFirewallTarget) return;
    setDeleteFirewallLoading(true);
    try {
      const { error } = await supabase.from('firewalls').delete().eq('id', deleteFirewallTarget.id);
      if (error) throw error;
      toast.success('Firewall excluído com sucesso');
      queryClient.invalidateQueries({ queryKey: ['environment-assets'] });
      setDeleteFirewallTarget(null);
    } catch (err: any) {
      toast.error('Erro ao excluir firewall: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setDeleteFirewallLoading(false);
    }
  }, [deleteFirewallTarget, queryClient]);

  const handleDeleteM365 = useCallback(async () => {
    if (!deleteM365Target) return;
    setDeleteM365Loading(true);
    try {
      await supabase.from('m365_tenant_agents').delete().eq('tenant_record_id', deleteM365Target.id);
      await supabase.from('m365_tenant_permissions').delete().eq('tenant_record_id', deleteM365Target.id);
      const { error } = await supabase.from('m365_tenants').delete().eq('id', deleteM365Target.id);
      if (error) throw error;
      toast.success('Tenant M365 excluído com sucesso');
      queryClient.invalidateQueries({ queryKey: ['environment-assets'] });
      setDeleteM365Target(null);
    } catch (err: any) {
      toast.error('Erro ao excluir tenant: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setDeleteM365Loading(false);
    }
  }, [deleteM365Target, queryClient]);

  const handleDeleteDomain = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await supabase.from('external_domain_schedules').delete().eq('domain_id', deleteTarget.id);
      await supabase.from('external_domain_analysis_history').delete().eq('domain_id', deleteTarget.id);
      await supabase.from('agent_tasks').delete().eq('target_id', deleteTarget.id).eq('target_type', 'external_domain');
      const { error } = await supabase.from('external_domains').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Domínio excluído com sucesso');
      queryClient.invalidateQueries({ queryKey: ['environment-assets'] });
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error('Erro ao excluir domínio: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteTarget, queryClient]);

  if (authLoading) return null;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb items={[{ label: 'Ambiente' }]} />

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerenciamento do Ambiente</h1>
            <p className="text-muted-foreground">Gerencie todos os sistemas monitorados</p>
          </div>
          <div className="flex items-center gap-3">
            {isSuperRole && !isPreviewMode && allWorkspaces && allWorkspaces.length > 0 && (
              <Select value={selectedWorkspaceId ?? ''} onValueChange={setSelectedWorkspaceId}>
                <SelectTrigger className="w-[220px]">
                  <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Selecione o workspace" />
                </SelectTrigger>
                <SelectContent>
                  {allWorkspaces.map(ws => (
                    <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button className="gap-2" onClick={() => navigate('/environment/new')}>
              <Plus className="w-4 h-4" />
              Novo Item
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Monitor className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{isLoading ? '—' : stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total de Ativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Globe className="w-8 h-8 text-teal-400" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{isLoading ? '—' : stats.domains}</p>
                  <p className="text-xs text-muted-foreground">Domínios Externos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Shield className="w-8 h-8 text-orange-400" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{isLoading ? '—' : stats.firewalls}</p>
                  <p className="text-xs text-muted-foreground">Firewalls</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Cloud className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{isLoading ? '—' : stats.tenants}</p>
                  <p className="text-xs text-muted-foreground">Tenants M365</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar ativo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Category Sections */}
        <div className="space-y-8">
          <AssetCategorySection
            title="Domínios Externos"
            icon={Globe}
            iconColor="text-teal-400"
            items={filteredDomains}
            totalCount={stats.domains}
            isLoading={isLoading}
            renderActions={(asset) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/environment/external-domain/${asset.id}/edit`)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: asset.id, name: asset.name })}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          />
          <AssetCategorySection
            title="Firewalls"
            icon={Shield}
            iconColor="text-orange-400"
            items={filteredFirewalls}
            totalCount={stats.firewalls}
            isLoading={isLoading}
            renderActions={(asset) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/environment/firewall/${asset.id}/edit`)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteFirewallTarget({ id: asset.id, name: asset.name })}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          />
          <AssetCategorySection
            title="Tenants M365"
            icon={Cloud}
            iconColor="text-blue-400"
            items={filteredTenants}
            totalCount={stats.tenants}
            isLoading={isLoading}
            renderActions={(asset) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/environment/m365/${asset.id}/edit`)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteM365Target({ id: asset.id, name: asset.name })}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          />
        </div>
      </div>

      <DeleteEnvironmentDomainDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        domainName={deleteTarget?.name || ''}
        onConfirm={handleDeleteDomain}
        loading={deleteLoading}
      />
      <DeleteEnvironmentDomainDialog
        open={!!deleteFirewallTarget}
        onOpenChange={(open) => { if (!open) setDeleteFirewallTarget(null); }}
        domainName={deleteFirewallTarget?.name || ''}
        onConfirm={handleDeleteFirewall}
        loading={deleteFirewallLoading}
      />
      <DeleteEnvironmentDomainDialog
        open={!!deleteM365Target}
        onOpenChange={(open) => { if (!open) setDeleteM365Target(null); }}
        domainName={deleteM365Target?.name || ''}
        onConfirm={handleDeleteM365}
        loading={deleteM365Loading}
      />
    </AppLayout>
  );
}
