import { useEffect, useState, useCallback, useMemo } from "react";
import { useWorkspaceSelector } from "@/hooks/useWorkspaceSelector";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePreview } from "@/contexts/PreviewContext";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageBreadcrumb } from "@/components/layout/PageBreadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  Bot,
  Plus,
  Loader2,
  Eye,
  Ban,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Building,
  Building2,
  Trash2,
  Search,
  Shield,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AgentInstallInstructions } from "@/components/agents/AgentInstallInstructions";
import { useQuery } from "@tanstack/react-query";

interface Agent {
  id: string;
  name: string;
  client_id: string | null;
  created_at: string;
  last_seen: string | null;
  revoked: boolean;
  activation_code: string | null;
  activation_code_expires_at: string | null;
  agent_version: string | null;
  client_name?: string;
}

interface Client {
  id: string;
  name: string;
}

export default function AgentsPage() {
  const { user, loading: authLoading, isSuperAdmin, isAdmin } = useAuth();
  const { isPreviewMode, previewTarget } = usePreview();
  const { effectiveRole } = useEffectiveAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Workspace selector for super roles
  const isSuperRole = effectiveRole === 'super_admin' || effectiveRole === 'super_suporte';
  const [search, setSearch] = useState('');

  // Fetch workspaces for super roles
  const { data: allWorkspaces } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuperRole && !isPreviewMode,
    staleTime: 1000 * 60 * 5,
  });

  const { selectedWorkspaceId, setSelectedWorkspaceId } = useWorkspaceSelector(allWorkspaces, isSuperRole);

  // Create agent dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentClientId, setNewAgentClientId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [activationExpiresAt, setActivationExpiresAt] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Instructions dialog (pending agents)
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsAgent, setInstructionsAgent] = useState<Agent | null>(null);

  // Revoke dialog
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [agentToRevoke, setAgentToRevoke] = useState<Agent | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canAccessPage = isSuperAdmin() || isAdmin();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (!authLoading && !canAccessPage) {
      navigate("/dashboard");
      toast.error("Acesso não autorizado");
    }
  }, [user, authLoading, navigate, canAccessPage]);

  const fetchData = useCallback(async () => {
    try {
      // Get workspace IDs to filter by
      const workspaceIds = isPreviewMode && previewTarget?.workspaces
        ? previewTarget.workspaces.map(w => w.id)
        : (isSuperRole && selectedWorkspaceId ? [selectedWorkspaceId] : null);

      // Build queries with optional workspace filtering
      let agentsQuery = supabase
        .from("agents")
        .select("*")
        .eq('is_system_agent', false)
        .order("created_at", { ascending: false });
        
      let clientsQuery = supabase
        .from("clients")
        .select("id, name")
        .order("name");

      // Apply workspace filter
      if (workspaceIds && workspaceIds.length > 0) {
        agentsQuery = agentsQuery.in('client_id', workspaceIds);
        clientsQuery = clientsQuery.in('id', workspaceIds);
      }

      const [agentsRes, clientsRes] = await Promise.all([agentsQuery, clientsQuery]);

      if (agentsRes.error) throw agentsRes.error;
      if (clientsRes.error) throw clientsRes.error;

      // Map client names to agents
      const clientMap = new Map((clientsRes.data || []).map((c) => [c.id, c.name]));
      const agentsWithClientNames = ((agentsRes.data as any[]) || []).map((agent) => ({
        ...agent,
        client_name: agent.client_id ? clientMap.get(agent.client_id) : undefined,
      })) as Agent[];

      setAgents(agentsWithClientNames);
      setClients(clientsRes.data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar agents: " + error.message);
    } finally {
      setLoading(false);
    }
  }, [isPreviewMode, previewTarget, isSuperRole, selectedWorkspaceId]);

  useEffect(() => {
    if (user && canAccessPage) {
      // Super roles must wait for workspace selection before fetching
      if (isSuperRole && !isPreviewMode && !selectedWorkspaceId) return;
      fetchData();
      
      // Polling every 5 seconds to keep data synchronized
      const interval = setInterval(() => {
        fetchData();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [user, canAccessPage, fetchData, isSuperRole, isPreviewMode, selectedWorkspaceId]);

  // Stats
  const stats = useMemo(() => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    return {
      total: agents.length,
      online: agents.filter(a => !a.revoked && a.last_seen && new Date(a.last_seen) > fiveMinAgo).length,
      pending: agents.filter(a => !a.revoked && !a.last_seen).length,
      revoked: agents.filter(a => a.revoked).length,
    };
  }, [agents]);

  // Search filter
  const filtered = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.client_name?.toLowerCase().includes(q)
    );
  }, [agents, search]);

  // Sorting
  type AgentSortKey = 'name' | 'client_name' | 'agent_version' | 'status' | 'last_seen';
  type SortDir = 'asc' | 'desc' | null;
  const SORT_STORAGE_KEY = 'agents-sort';

  const [sortKey, setSortKey] = useState<AgentSortKey | null>(() => {
    try { const s = localStorage.getItem(SORT_STORAGE_KEY); return s ? JSON.parse(s).key : null; } catch { return null; }
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try { const s = localStorage.getItem(SORT_STORAGE_KEY); return s ? JSON.parse(s).dir : null; } catch { return null; }
  });

  const handleSort = (key: AgentSortKey) => {
    let newKey: AgentSortKey | null, newDir: SortDir;
    if (sortKey !== key) { newKey = key; newDir = 'asc'; }
    else if (sortDir === 'asc') { newKey = key; newDir = 'desc'; }
    else { newKey = null; newDir = null; }
    setSortKey(newKey); setSortDir(newDir);
    if (newKey && newDir) localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ key: newKey, dir: newDir }));
    else localStorage.removeItem(SORT_STORAGE_KEY);
  };

  const sortedAgents = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'last_seen') {
        const da = a.last_seen ? new Date(a.last_seen).getTime() : (sortDir === 'asc' ? Infinity : -Infinity);
        const db = b.last_seen ? new Date(b.last_seen).getTime() : (sortDir === 'asc' ? Infinity : -Infinity);
        return (da - db) * mul;
      }
      if (sortKey === 'status') {
        const sa = getAgentStatus(a).label;
        const sb = getAgentStatus(b).label;
        return sa.localeCompare(sb, 'pt-BR', { sensitivity: 'base' }) * mul;
      }
      const va = (a[sortKey] ?? '') as string;
      const vb = (b[sortKey] ?? '') as string;
      return va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' }) * mul;
    });
  }, [filtered, sortKey, sortDir]);

  const getAgentStatus = (
    agent: Agent,
  ): { label: string; variant: "default" | "success" | "warning" | "destructive" } => {
    if (agent.revoked) {
      return { label: "Revogado", variant: "destructive" };
    }
    if (!agent.last_seen) {
      return { label: "Pendente", variant: "warning" };
    }
    const lastSeenDate = new Date(agent.last_seen);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (lastSeenDate > fiveMinutesAgo) {
      return { label: "Online", variant: "success" };
    }
    return { label: "Offline", variant: "default" };
  };

  const generateActivationCode = (): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) code += "-";
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) {
      toast.error("Nome do agent é obrigatório");
      return;
    }
    if (!newAgentClientId) {
      toast.error("Cliente é obrigatório");
      return;
    }

    setCreating(true);
    try {
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const code = generateActivationCode();

      const { data: agentData, error: agentError } = await (supabase
        .from("agents" as any)
        .insert({
          name: newAgentName.trim(),
          client_id: newAgentClientId || null,
          created_by: user!.id,
          activation_code: code,
          activation_code_expires_at: expiresAt,
        })
        .select()
        .single() as any);

      if (agentError) throw agentError;

      toast.success("Agent criado com sucesso!");
      navigate(`/agents/${agentData.id}`);
    } catch (error: any) {
      toast.error("Erro ao criar agent: " + error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = async () => {
    if (activationCode) {
      await navigator.clipboard.writeText(activationCode);
      setCodeCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const openInstructions = (agent: Agent) => {
    setInstructionsAgent(agent);
    setInstructionsOpen(true);
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setNewAgentName("");
    setNewAgentClientId("");
    setActivationCode(null);
    setActivationExpiresAt(null);
    setCodeCopied(false);
  };

  const handleRevokeAgent = async () => {
    if (!agentToRevoke) return;

    setRevoking(true);
    try {
      const { error: agentError } = await (supabase
        .from("agents" as any)
        .update({
          revoked: true,
          activation_code: null,
          activation_code_expires_at: null,
        })
        .eq("id", agentToRevoke.id) as any);

      if (agentError) throw agentError;

      toast.success("Agent revogado com sucesso!");
      setRevokeDialogOpen(false);
      setAgentToRevoke(null);
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao revogar agent: " + error.message);
    } finally {
      setRevoking(false);
    }
  };

  const openRevokeDialog = (agent: Agent) => {
    setAgentToRevoke(agent);
    setRevokeDialogOpen(true);
  };

  const openDeleteDialog = (agent: Agent) => {
    setAgentToDelete(agent);
    setDeleteConfirmName("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteAgent = async () => {
    if (!agentToDelete || deleteConfirmName !== agentToDelete.name) return;

    setDeleting(true);
    try {
      const { error } = await (supabase
        .from("agents" as any)
        .delete()
        .eq("id", agentToDelete.id) as any);

      if (error) throw error;

      toast.success("Agent deletado com sucesso!");
      setDeleteDialogOpen(false);
      setAgentToDelete(null);
      setDeleteConfirmName("");
      fetchData();
    } catch (error: any) {
      toast.error("Erro ao deletar agent: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || !canAccessPage) return null;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb items={[{ label: 'Gerenciamento de Agents' }]} />
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Agents</h1>
            <p className="text-muted-foreground">Gerencie todos os agents externos do sistema</p>
          </div>
          <div className="flex items-center gap-3">
            {isSuperRole && !isPreviewMode && allWorkspaces && allWorkspaces.length > 0 && (
              <Select value={selectedWorkspaceId ?? ''} onValueChange={setSelectedWorkspaceId}>
                <SelectTrigger className="w-[220px]">
                  <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Selecione o workspace" />
                </SelectTrigger>
                <SelectContent>
                  {allWorkspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Agent
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Agent</DialogTitle>
                  <DialogDescription>
                    {activationCode
                      ? "Agent criado! Copie o código de ativação abaixo."
                      : "Preencha as informações para criar um novo agent."}
                  </DialogDescription>
                </DialogHeader>

                {!activationCode ? (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="agent-name">Nome do Agent *</Label>
                      <Input
                        id="agent-name"
                        placeholder="Ex: Firewall Agent - Matriz"
                        value={newAgentName}
                        onChange={(e) => setNewAgentName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agent-client">Cliente *</Label>
                      <Select
                        value={newAgentClientId}
                        onValueChange={(val) => setNewAgentClientId(val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Código de Ativação</Label>
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-sm font-mono break-all">{activationCode}</code>
                          <Button size="icon" variant="ghost" onClick={handleCopyCode}>
                            {codeCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <AgentInstallInstructions activationCode={activationCode} />

                    <div className="flex items-center gap-2 text-sm text-warning">
                      <Clock className="w-4 h-4" />
                      <span>
                        Este código expira em{" "}
                        {formatDistanceToNow(new Date(activationExpiresAt!), { locale: ptBR, addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Use este código durante a instalação do agent. Após a ativação, o código não poderá mais ser
                      utilizado.
                    </p>
                  </div>
                )}

                <DialogFooter>
                  {!activationCode ? (
                    <>
                      <Button variant="outline" onClick={handleCloseCreateDialog}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateAgent} disabled={creating}>
                        {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Criar Agent
                      </Button>
                    </>
                  ) : (
                    <Button onClick={handleCloseCreateDialog}>Fechar</Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{loading ? '—' : stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Agents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Check className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{loading ? '—' : stats.online}</p>
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{loading ? '—' : stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10">
                  <Ban className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{loading ? '—' : stats.revoked}</p>
                  <p className="text-xs text-muted-foreground">Revogados</p>
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
              placeholder="Buscar agent..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Agents Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum agent encontrado</p>
                <p className="text-sm">Crie um agent para começar</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {([['Nome', 'name'], ['Cliente', 'client_name'], ['Versão', 'agent_version'], ['Status', 'status'], ['Last Seen', 'last_seen']] as [string, AgentSortKey][]).map(([label, key]) => {
                      const isActive = sortKey === key;
                      const SortIcon = isActive && sortDir === 'asc' ? ArrowUp : isActive && sortDir === 'desc' ? ArrowDown : ChevronsUpDown;
                      return (
                        <TableHead key={key}>
                          <button
                            type="button"
                            className="flex items-center gap-1 hover:text-foreground transition-colors -my-1"
                            onClick={() => handleSort(key)}
                          >
                            {label}
                            <SortIcon className={`w-3 h-3 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} />
                          </button>
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAgents.map((agent) => {
                    const status = getAgentStatus(agent);
                    const isPendingWithCode =
                      !agent.revoked && !agent.last_seen && !!agent.activation_code;
                    return (
                      <TableRow key={agent.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{agent.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {agent.client_name ? (
                            <Badge variant="secondary" className="text-xs">
                              <Building className="w-3 h-3 mr-1" />
                              {agent.client_name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {agent.agent_version ? (
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded w-fit">
                                Agent v{agent.agent_version}
                              </code>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                            {(agent as any).supervisor_version && (
                              <code className="text-xs bg-muted/60 px-1.5 py-0.5 rounded w-fit text-muted-foreground">
                                Sup v{(agent as any).supervisor_version}
                              </code>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              status.variant === "success"
                                ? "default"
                                : status.variant === "destructive"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className={
                              status.variant === "success"
                                ? "bg-success/10 text-success hover:bg-success/20"
                                : status.variant === "warning"
                                  ? "bg-warning/10 text-warning hover:bg-warning/20"
                                  : ""
                            }
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {agent.last_seen
                            ? formatDistanceToNow(new Date(agent.last_seen), { locale: ptBR, addSuffix: true })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isPendingWithCode && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openInstructions(agent)}
                                title="Instruções"
                              >
                                <Bot className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/agents/${agent.id}`)}
                              title="Ver detalhes"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {!agent.revoked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openRevokeDialog(agent)}
                                title="Revogar agent"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Ban className="w-4 h-4" />
                              </Button>
                            )}
                            {agent.revoked && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDeleteDialog(agent)}
                                title="Deletar agent"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Revoke Confirmation Dialog */}
        <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revogar Agent</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja revogar o agent "{agentToRevoke?.name}"? Esta ação invalidará todos os tokens do
                agent e ele não poderá mais se conectar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevokeAgent}
                disabled={revoking}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {revoking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Revogar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Deletar Agent
              </DialogTitle>
              <DialogDescription>
                Esta ação é permanente e não pode ser desfeita. Todos os dados do agent serão removidos.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">Para confirmar, digite o nome do agent:</p>
                <p className="text-sm font-mono mt-1">{agentToDelete?.name}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="delete-confirm-name">Nome do Agent</Label>
                <Input
                  id="delete-confirm-name"
                  placeholder="Digite o nome para confirmar"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setAgentToDelete(null);
                  setDeleteConfirmName("");
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAgent}
                disabled={deleting || deleteConfirmName !== agentToDelete?.name}
              >
                {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Deletar Agent
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Instructions Dialog */}
        <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Instruções de Instalação</DialogTitle>
              <DialogDescription>
                Copie e cole o comando abaixo no servidor Linux para ativar o agent.
              </DialogDescription>
            </DialogHeader>

            {instructionsAgent?.activation_code && (
              <div className="py-2">
                <AgentInstallInstructions activationCode={instructionsAgent.activation_code} />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setInstructionsOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
