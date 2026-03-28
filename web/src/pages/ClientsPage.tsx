import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageBreadcrumb } from "@/components/layout/PageBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Building, Plus, Loader2, Pencil, Trash2, Eye, Shield, Cloud, Bot, Globe, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Client {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  scopes_count?: number;
  agents_count?: number;
}

interface Firewall {
  id: string;
  name: string;
  description: string | null;
  last_score: number | null;
}

interface M365Tenant {
  id: string;
  display_name: string | null;
  tenant_domain: string | null;
  connection_status: string;
}

interface Agent {
  id: string;
  name: string;
  last_seen: string | null;
  revoked: boolean;
}

interface ExternalDomain {
  id: string;
  name: string;
  domain: string;
  last_score: number | null;
  status: string;
}

interface WorkspaceDetails {
  firewalls: Firewall[];
  tenants: M365Tenant[];
  agents: Agent[];
  externalDomains: ExternalDomain[];
}

export default function ClientsPage() {
  const { user, loading: authLoading, isSuperAdmin, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Create client dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientDescription, setNewClientDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editClientName, setEditClientName] = useState("");
  const [editClientDescription, setEditClientDescription] = useState("");
  const [editing, setEditing] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // View dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [workspaceDetails, setWorkspaceDetails] = useState<WorkspaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [search, setSearch] = useState("");

  const stats = useMemo(() => ({
    total: clients.length,
    scopes: clients.reduce((sum, c) => sum + (c.scopes_count || 0), 0),
    agents: clients.reduce((sum, c) => sum + (c.agents_count || 0), 0),
    noScopes: clients.filter((c) => (c.scopes_count || 0) === 0).length,
  }), [clients]);

  const filteredClients = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)
    );
  }, [clients, search]);

  const canAccessPage = isSuperAdmin() || isAdmin();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (!authLoading && !canAccessPage) {
      navigate("/dashboard");
      toast.error("Acesso não autorizado");
    }
  }, [user, authLoading, navigate, canAccessPage]);

  useEffect(() => {
    if (user && canAccessPage) {
      fetchData();
    }
  }, [user, canAccessPage]);

  const fetchData = async () => {
    try {
      const { data: clientsData, error: clientsError } = await supabase.from("clients").select("*").order("name");

      if (clientsError) throw clientsError;

      const clientsWithCounts = await Promise.all(
        (clientsData || []).map(async (client) => {
          const [firewallsResult, tenantsResult, agentsResult, domainsResult] = await Promise.all([
            supabase.from("firewalls").select("id", { count: "exact", head: true }).eq("client_id", client.id),
            supabase.from("m365_tenants").select("id", { count: "exact", head: true }).eq("client_id", client.id),
            supabase.from("agents").select("id", { count: "exact", head: true }).eq("client_id", client.id),
            supabase.from("external_domains").select("id", { count: "exact", head: true }).eq("client_id", client.id),
          ]);

          return {
            ...client,
            scopes_count: (firewallsResult.count || 0) + (tenantsResult.count || 0) + (domainsResult.count || 0),
            agents_count: agentsResult.count || 0,
          };
        }),
      );

      setClients(clientsWithCounts);
    } catch (error: unknown) {
      console.error("Erro ao buscar dados:", error);
      toast.error("Erro ao carregar workspaces");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase.from("clients").insert({
        name: newClientName.trim(),
        description: newClientDescription.trim() || null,
      });

      if (error) throw error;

      toast.success("Workspace criado com sucesso");
      setCreateDialogOpen(false);
      setNewClientName("");
      setNewClientDescription("");
      fetchData();
    } catch (error: unknown) {
      console.error("Erro ao criar workspace:", error);
      toast.error("Erro ao criar workspace");
    } finally {
      setCreating(false);
    }
  };

  const openEditDialog = (client: Client) => {
    setEditingClient(client);
    setEditClientName(client.name);
    setEditClientDescription(client.description || "");
    setEditDialogOpen(true);
  };

  const handleEditClient = async () => {
    if (!editingClient || !editClientName.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    setEditing(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          name: editClientName.trim(),
          description: editClientDescription.trim() || null,
        })
        .eq("id", editingClient.id);

      if (error) throw error;

      toast.success("Workspace atualizado com sucesso");
      setEditDialogOpen(false);
      setEditingClient(null);
      fetchData();
    } catch (error: unknown) {
      console.error("Erro ao atualizar workspace:", error);
      toast.error("Erro ao atualizar workspace");
    } finally {
      setEditing(false);
    }
  };

  const openDeleteDialog = (client: Client) => {
    setClientToDelete(client);
    setDeleteConfirmName("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;

    if (deleteConfirmName !== clientToDelete.name) {
      toast.error("Nome do workspace não confere");
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase.from("clients").delete().eq("id", clientToDelete.id);

      if (error) throw error;

      toast.success("Workspace deletado com sucesso");
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      setDeleteConfirmName("");
      fetchData();
    } catch (error: unknown) {
      console.error("Erro ao deletar workspace:", error);
      toast.error("Erro ao deletar workspace. Verifique se não há escopos ou agents associados.");
    } finally {
      setDeleting(false);
    }
  };

  const openViewDialog = async (client: Client) => {
    setViewingClient(client);
    setViewDialogOpen(true);
    setLoadingDetails(true);

    try {
      const [firewallsRes, tenantsRes, agentsRes, domainsRes] = await Promise.all([
        supabase
          .from("firewalls")
          .select("id, name, description, last_score")
          .eq("client_id", client.id)
          .order("name"),
        supabase
          .from("m365_tenants")
          .select("id, display_name, tenant_domain, connection_status")
          .eq("client_id", client.id)
          .order("display_name"),
        supabase
          .from("agents")
          .select("id, name, last_seen, revoked")
          .eq("client_id", client.id)
          .order("name"),
        supabase
          .from("external_domains")
          .select("id, name, domain, last_score, status")
          .eq("client_id", client.id)
          .order("name"),
      ]);

      setWorkspaceDetails({
        firewalls: firewallsRes.data || [],
        tenants: tenantsRes.data || [],
        agents: agentsRes.data || [],
        externalDomains: domainsRes.data || [],
      });
    } catch (error) {
      console.error("Erro ao buscar detalhes:", error);
      toast.error("Erro ao carregar detalhes do workspace");
    } finally {
      setLoadingDetails(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      connected: "default",
      pending: "secondary",
      partial: "outline",
      failed: "destructive",
      disconnected: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb items={[{ label: 'Administração' }, { label: 'Gerenciamento de Workspaces' }]} />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Workspaces</h1>
            <p className="text-muted-foreground">Gerencie todos os workspaces do sistema</p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Workspace
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg border-border">
              <DialogHeader>
                <DialogTitle>Novo Workspace</DialogTitle>
                <DialogDescription>Adicione um novo workspace à plataforma</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 px-6 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="client-name">Nome *</Label>
                    <Input
                      id="client-name"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Ex: Empresa ABC"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="client-description">Descrição</Label>
                    <Textarea
                      id="client-description"
                      value={newClientDescription}
                      onChange={(e) => setNewClientDescription(e.target.value)}
                      placeholder="Descrição opcional do workspace"
                      rows={3}
                    />
                  </div>
                </div>
              </ScrollArea>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreateClient} disabled={creating}>
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Building className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Workspaces</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Escopos</p>
                  <p className="text-2xl font-bold">{stats.scopes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Agents</p>
                  <p className="text-2xl font-bold">{stats.agents}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sem Escopos</p>
                  <p className="text-2xl font-bold">{stats.noScopes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar workspace..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 max-w-sm"
          />
        </div>

        {/* Workspaces Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            {filteredClients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum workspace encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-center">Escopos</TableHead>
                    <TableHead className="text-center">Agents</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead className="w-[120px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id} className="border-border/50">
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell className="text-center">{client.scopes_count}</TableCell>
                      <TableCell className="text-center">{client.agents_count}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(client.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openViewDialog(client)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Visualizar</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(client)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Editar</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => openDeleteDialog(client)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Deletar</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* View Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="sm:max-w-2xl border-border">
            <DialogHeader>
              <DialogTitle>Detalhes do Workspace</DialogTitle>
              <DialogDescription>Informações e objetos vinculados a este workspace</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6 px-6 py-4">
                {/* Workspace Info */}
                <div className="space-y-3">
                  <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">Nome</p>
                    <p className="font-medium">{viewingClient?.name}</p>
                  </div>
                  {viewingClient?.description && (
                    <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                      <p className="text-xs text-muted-foreground">Descrição</p>
                      <p className="text-sm">{viewingClient.description}</p>
                    </div>
                  )}
                  <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                    <p className="text-xs text-muted-foreground">ID do Workspace</p>
                    <p className="font-mono text-sm">{viewingClient?.id}</p>
                  </div>
                </div>

                {loadingDetails ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    {/* Firewalls */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" />
                        <h4 className="font-medium">Firewalls ({workspaceDetails?.firewalls.length || 0})</h4>
                      </div>
                      {workspaceDetails?.firewalls.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-6">Nenhum firewall vinculado</p>
                      ) : (
                        <div className="space-y-2 pl-6">
                          {workspaceDetails?.firewalls.map((fw) => (
                            <div key={fw.id} className="p-3 rounded-md bg-muted/30 border border-border/50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{fw.name}</p>
                                  {fw.description && (
                                    <p className="text-xs text-muted-foreground">{fw.description}</p>
                                  )}
                                </div>
                                {fw.last_score !== null && (
                                  <Badge variant={fw.last_score >= 70 ? "default" : fw.last_score >= 40 ? "secondary" : "destructive"}>
                                    Score: {fw.last_score}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* M365 Tenants */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-primary" />
                        <h4 className="font-medium">Microsoft 365 Tenants ({workspaceDetails?.tenants.length || 0})</h4>
                      </div>
                      {workspaceDetails?.tenants.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-6">Nenhum tenant vinculado</p>
                      ) : (
                        <div className="space-y-2 pl-6">
                          {workspaceDetails?.tenants.map((tenant) => (
                            <div key={tenant.id} className="p-3 rounded-md bg-muted/30 border border-border/50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{tenant.display_name || tenant.tenant_domain || "Tenant"}</p>
                                  {tenant.tenant_domain && (
                                    <p className="text-xs text-muted-foreground">{tenant.tenant_domain}</p>
                                  )}
                                </div>
                                {getStatusBadge(tenant.connection_status)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* External Domains */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-primary" />
                        <h4 className="font-medium">Domínios Externos ({workspaceDetails?.externalDomains.length || 0})</h4>
                      </div>
                      {workspaceDetails?.externalDomains.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-6">Nenhum domínio externo vinculado</p>
                      ) : (
                        <div className="space-y-2 pl-6">
                          {workspaceDetails?.externalDomains.map((domain) => (
                            <div key={domain.id} className="p-3 rounded-md bg-muted/30 border border-border/50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{domain.name}</p>
                                  <p className="text-xs text-muted-foreground">{domain.domain}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {domain.last_score !== null && (
                                    <Badge variant={domain.last_score >= 70 ? "default" : domain.last_score >= 40 ? "secondary" : "destructive"}>
                                      Score: {domain.last_score}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Agents */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-primary" />
                        <h4 className="font-medium">Agents ({workspaceDetails?.agents.length || 0})</h4>
                      </div>
                      {workspaceDetails?.agents.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-6">Nenhum agent vinculado</p>
                      ) : (
                        <div className="space-y-2 pl-6">
                          {workspaceDetails?.agents.map((agent) => (
                            <div key={agent.id} className="p-3 rounded-md bg-muted/30 border border-border/50">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{agent.name}</p>
                                  {agent.last_seen && (
                                    <p className="text-xs text-muted-foreground">
                                      Última atividade: {formatDistanceToNow(new Date(agent.last_seen), { addSuffix: true, locale: ptBR })}
                                    </p>
                                  )}
                                </div>
                                <Badge variant={agent.revoked ? "destructive" : "default"}>
                                  {agent.revoked ? "Revogado" : "Ativo"}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-lg border-border">
            <DialogHeader>
              <DialogTitle>Editar Workspace</DialogTitle>
              <DialogDescription>Atualize as informações do workspace</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 px-6 py-4">
                <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                  <p className="text-xs text-muted-foreground">ID do Workspace</p>
                  <p className="font-mono text-sm">{editingClient?.id}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-client-name">Nome *</Label>
                  <Input
                    id="edit-client-name"
                    value={editClientName}
                    onChange={(e) => setEditClientName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-client-description">Descrição</Label>
                  <Textarea
                    id="edit-client-description"
                    value={editClientDescription}
                    onChange={(e) => setEditClientDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleEditClient} disabled={editing}>
                {editing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-lg border-border">
            <DialogHeader>
              <DialogTitle>Deletar Workspace</DialogTitle>
              <DialogDescription>
                Esta ação não pode ser desfeita. Para confirmar, digite o nome do workspace.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 px-6 py-4">
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30">
                  <p className="text-sm text-destructive font-medium">
                    Você está prestes a deletar: <strong>{clientToDelete?.name}</strong>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm-name">Digite o nome do workspace para confirmar</Label>
                  <Input
                    id="delete-confirm-name"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={clientToDelete?.name}
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteClient}
                disabled={deleting || deleteConfirmName !== clientToDelete?.name}
              >
                {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Deletar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
