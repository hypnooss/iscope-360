import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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
import { supabase } from "@/integrations/supabase/client";
import {
  Bot,
  Plus,
  Loader2,
  Eye,
  Ban,
  Copy,
  Check,
  Clock,
  Trash2,
  Search,
  Cpu,
  Activity,
  ListChecks,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AgentInstallInstructions } from "@/components/agents/AgentInstallInstructions";
import { useQuery } from "@tanstack/react-query";

interface SuperAgent {
  id: string;
  name: string;
  created_at: string;
  last_seen: string | null;
  revoked: boolean;
  activation_code: string | null;
  activation_code_expires_at: string | null;
  agent_version: string | null;
  is_system_agent: boolean;
}

export default function SuperAgentsPage() {
  const { user, loading: authLoading, isSuperAdmin } = useAuth();
  const { effectiveRole } = useEffectiveAuth();
  const navigate = useNavigate();
  const [agents, setAgents] = useState<SuperAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [creating, setCreating] = useState(false);
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [activationExpiresAt, setActivationExpiresAt] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Instructions dialog
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructionsAgent, setInstructionsAgent] = useState<SuperAgent | null>(null);

  // Revoke dialog
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [agentToRevoke, setAgentToRevoke] = useState<SuperAgent | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<SuperAgent | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canAccessPage = isSuperAdmin();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
    else if (!authLoading && !canAccessPage) {
      navigate("/dashboard");
      toast.error("Acesso não autorizado");
    }
  }, [user, authLoading, navigate, canAccessPage]);

  // Fetch queue stats
  const { data: queueStats } = useQuery({
    queryKey: ['super-agent-queue-stats'],
    queryFn: async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const [pendingRes, completedRes, totalRes] = await Promise.all([
        supabase.from('attack_surface_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('attack_surface_tasks').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('completed_at', today.toISOString()),
        supabase.from('attack_surface_tasks').select('id', { count: 'exact', head: true }),
      ]);

      return {
        pending: pendingRes.count ?? 0,
        completedToday: completedRes.count ?? 0,
        total: totalRes.count ?? 0,
      };
    },
    staleTime: 10000,
    refetchInterval: 30000,
  });

  const fetchAgents = useCallback(async () => {
    try {
      const { data, error } = await (supabase
        .from('agents' as any)
        .select('*')
        .eq('is_system_agent', true)
        .order('created_at', { ascending: false }) as any);

      if (error) throw error;
      setAgents((data as any[]) || []);
    } catch (error: any) {
      toast.error("Erro ao carregar Super Agents: " + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && canAccessPage) {
      fetchAgents();
      const interval = setInterval(fetchAgents, 5000);
      return () => clearInterval(interval);
    }
  }, [user, canAccessPage, fetchAgents]);

  const stats = useMemo(() => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    return {
      total: agents.length,
      online: agents.filter(a => !a.revoked && a.last_seen && new Date(a.last_seen) > fiveMinAgo).length,
      pending: agents.filter(a => !a.revoked && !a.last_seen).length,
      revoked: agents.filter(a => a.revoked).length,
    };
  }, [agents]);

  const filtered = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter(a => a.name.toLowerCase().includes(q));
  }, [agents, search]);

  const getAgentStatus = (agent: SuperAgent) => {
    if (agent.revoked) return { label: "Revogado", variant: "destructive" as const };
    if (!agent.last_seen) return { label: "Pendente", variant: "warning" as const };
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (new Date(agent.last_seen) > fiveMinAgo) return { label: "Online", variant: "success" as const };
    return { label: "Offline", variant: "default" as const };
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
      toast.error("Nome é obrigatório");
      return;
    }
    setCreating(true);
    try {
      const code = generateActivationCode();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const { error } = await (supabase
        .from("agents" as any)
        .insert({
          name: newAgentName.trim(),
          client_id: null,
          is_system_agent: true,
          created_by: user!.id,
          activation_code: code,
          activation_code_expires_at: expiresAt,
        }) as any);

      if (error) throw error;
      setActivationCode(code);
      setActivationExpiresAt(expiresAt);
      toast.success("Super Agent criado!");
      fetchAgents();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
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

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setNewAgentName("");
    setActivationCode(null);
    setActivationExpiresAt(null);
    setCodeCopied(false);
  };

  const handleRevokeAgent = async () => {
    if (!agentToRevoke) return;
    setRevoking(true);
    try {
      const { error } = await (supabase
        .from("agents" as any)
        .update({ revoked: true, activation_code: null, activation_code_expires_at: null })
        .eq("id", agentToRevoke.id) as any);
      if (error) throw error;
      toast.success("Super Agent revogado!");
      setRevokeDialogOpen(false);
      setAgentToRevoke(null);
      fetchAgents();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setRevoking(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!agentToDelete || deleteConfirmName !== agentToDelete.name) return;
    setDeleting(true);
    try {
      const { error } = await (supabase.from("agents" as any).delete().eq("id", agentToDelete.id) as any);
      if (error) throw error;
      toast.success("Super Agent deletado!");
      setDeleteDialogOpen(false);
      setAgentToDelete(null);
      setDeleteConfirmName("");
      fetchAgents();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || !canAccessPage) return null;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb items={[{ label: 'Administração' }, { label: 'Super Agents' }]} />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Cpu className="w-6 h-6 text-teal-400" />
              Gerenciamento de Super Agents
            </h1>
            <p className="text-muted-foreground text-sm">
              Agentes de sistema para scans automatizados de superfície de ataque
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" />Novo Super Agent</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Super Agent</DialogTitle>
                <DialogDescription>
                  {activationCode
                    ? "Super Agent criado! Copie o código de ativação."
                    : "Super Agents executam scans de superfície de ataque automaticamente."}
                </DialogDescription>
              </DialogHeader>

              {!activationCode ? (
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="sa-name">Nome *</Label>
                    <Input id="sa-name" placeholder="Ex: Super Agent 01" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} />
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
                          {codeCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <AgentInstallInstructions activationCode={activationCode} isSuperAgent />
                  <div className="flex items-center gap-2 text-sm text-warning">
                    <Clock className="w-4 h-4" />
                    <span>Expira {formatDistanceToNow(new Date(activationExpiresAt!), { locale: ptBR, addSuffix: true })}</span>
                  </div>
                </div>
              )}

              <DialogFooter>
                {!activationCode ? (
                  <>
                    <Button variant="outline" onClick={handleCloseCreateDialog}>Cancelar</Button>
                    <Button onClick={handleCreateAgent} disabled={creating}>
                      {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleCloseCreateDialog}>Fechar</Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-500/10"><Cpu className="w-5 h-5 text-teal-400" /></div>
                <div>
                  <p className="text-2xl font-bold">{loading ? '—' : stats.total}</p>
                  <p className="text-xs text-muted-foreground">Super Agents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10"><Zap className="w-5 h-5 text-emerald-400" /></div>
                <div>
                  <p className="text-2xl font-bold">{loading ? '—' : stats.online}</p>
                  <p className="text-xs text-muted-foreground">Online</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10"><ListChecks className="w-5 h-5 text-amber-400" /></div>
                <div>
                  <p className="text-2xl font-bold">{queueStats?.pending ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Fila Pendente</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10"><Activity className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <p className="text-2xl font-bold">{queueStats?.completedToday ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">Processadas Hoje</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar super agent..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Table */}
        <Card className="glass-card">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Cpu className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum Super Agent encontrado</p>
                <p className="text-sm">Crie um Super Agent para iniciar scans automáticos</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((agent) => {
                    const status = getAgentStatus(agent);
                    const isPending = !agent.revoked && !agent.last_seen && !!agent.activation_code;
                    return (
                      <TableRow key={agent.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-teal-400" />
                            <span className="font-medium">{agent.name}</span>
                            <Badge variant="outline" className="text-[10px] border-teal-500/30 text-teal-400">Sistema</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {agent.agent_version ? (
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">v{agent.agent_version}</code>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={status.variant === "destructive" ? "destructive" : "secondary"}
                            className={
                              status.variant === "success" ? "bg-emerald-500/10 text-emerald-400" :
                                status.variant === "warning" ? "bg-warning/10 text-warning" : ""
                            }
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {agent.last_seen ? formatDistanceToNow(new Date(agent.last_seen), { locale: ptBR, addSuffix: true }) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isPending && (
                              <Button variant="ghost" size="icon" onClick={() => { setInstructionsAgent(agent); setInstructionsOpen(true); }} title="Instruções">
                                <Bot className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/agents/${agent.id}`)} title="Ver detalhes">
                              <Eye className="w-4 h-4" />
                            </Button>
                            {!agent.revoked && (
                              <Button variant="ghost" size="icon" onClick={() => { setAgentToRevoke(agent); setRevokeDialogOpen(true); }} title="Revogar" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Ban className="w-4 h-4" />
                              </Button>
                            )}
                            {agent.revoked && (
                              <Button variant="ghost" size="icon" onClick={() => { setAgentToDelete(agent); setDeleteConfirmName(""); setDeleteDialogOpen(true); }} title="Deletar" className="text-destructive hover:text-destructive hover:bg-destructive/10">
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

        {/* Revoke Dialog */}
        <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revogar Super Agent</AlertDialogTitle>
              <AlertDialogDescription>Revogar "{agentToRevoke?.name}"? Ele não poderá mais processar tarefas.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleRevokeAgent} disabled={revoking} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {revoking && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Revogar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2"><Trash2 className="w-5 h-5" />Deletar Super Agent</DialogTitle>
              <DialogDescription>Ação permanente. Todos os dados serão removidos.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive font-medium">Para confirmar, digite o nome:</p>
                <p className="text-sm font-mono mt-1">{agentToDelete?.name}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="del-sa-name">Nome</Label>
                <Input id="del-sa-name" placeholder="Digite o nome para confirmar" value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setAgentToDelete(null); setDeleteConfirmName(""); }}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDeleteAgent} disabled={deleting || deleteConfirmName !== agentToDelete?.name}>
                {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Deletar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Instructions Dialog */}
        <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Instruções de Instalação</DialogTitle>
              <DialogDescription>Copie e cole o comando no servidor Linux para ativar o Super Agent.</DialogDescription>
            </DialogHeader>
            {instructionsAgent?.activation_code && (
              <div className="py-2"><AgentInstallInstructions activationCode={instructionsAgent.activation_code} isSuperAgent /></div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setInstructionsOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
