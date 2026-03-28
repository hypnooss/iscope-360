import { useEffect, useState, useCallback } from "react";
import { formatDateTimeBR } from '@/lib/dateUtils';
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageBreadcrumb } from "@/components/layout/PageBreadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Bot,
  Building,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  Key,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldX,
  Trash2,
  Ban,
  Cpu,
  Fingerprint,
  Activity,
  Settings,
  BarChart3,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AgentInstallInstructions } from "@/components/agents/AgentInstallInstructions";
import { RemoteTerminal } from "@/components/agents/RemoteTerminal";
import { AgentMonitorPanel } from "@/components/agents/AgentMonitorPanel";

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
  capabilities: string[] | null;
  certificate_thumbprint: string | null;
  certificate_public_key: string | null;
  azure_certificate_key_id: string | null;
  check_components: boolean;
  clients?: { name: string } | null;
}

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading, isSuperAdmin, isAdmin } = useAuth();

  // States
  const [generatingCode, setGeneratingCode] = useState(false);
  const [checkingComponents, setCheckingComponents] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteCertDialogOpen, setDeleteCertDialogOpen] = useState(false);
  const [deletingCert, setDeletingCert] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const canAccessPage = isSuperAdmin() || isAdmin();

  // Fetch agent data
  const { data: agent, isLoading, error, refetch } = useQuery({
    queryKey: ['agent', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select(`
          *,
          clients!client_id(name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      // Parse capabilities if it's a JSON string
      const agentData = data as any;
      if (agentData.capabilities && typeof agentData.capabilities === 'string') {
        try {
          agentData.capabilities = JSON.parse(agentData.capabilities);
        } catch {
          agentData.capabilities = [];
        }
      }
      
      return agentData as Agent;
    },
    enabled: !!id && !!user && canAccessPage,
    refetchInterval: 15000, // Poll every 15 seconds
  });

  // Fetch latest monitor version from agent_metrics
  const { data: monitorVersion } = useQuery({
    queryKey: ['agent-monitor-version', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_metrics')
        .select('monitor_version')
        .eq('agent_id', id!)
        .not('monitor_version', 'is', null)
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.monitor_version ?? null;
    },
    enabled: !!id && !!user && canAccessPage,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    } else if (!authLoading && !canAccessPage) {
      navigate("/dashboard");
      toast.error("Acesso não autorizado");
    }
  }, [user, authLoading, navigate, canAccessPage]);

  const getAgentStatus = (agent: Agent): { 
    label: string; 
    variant: "success" | "warning" | "destructive" | "default";
    icon: React.ReactNode;
  } => {
    if (agent.revoked) {
      return { label: "Revogado", variant: "destructive", icon: <ShieldX className="w-4 h-4" /> };
    }
    if (!agent.last_seen) {
      return { label: "Pendente", variant: "warning", icon: <Clock className="w-4 h-4" /> };
    }
    const lastSeenDate = new Date(agent.last_seen);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (lastSeenDate > fiveMinutesAgo) {
      return { label: "Online", variant: "success", icon: <Activity className="w-4 h-4" /> };
    }
    return { label: "Offline", variant: "default", icon: <Clock className="w-4 h-4" /> };
  };

  const getCertificateStatus = (): { 
    label: string; 
    variant: "success" | "warning" | "default";
    description: string;
  } => {
    if (!agent?.certificate_thumbprint) {
      return { 
        label: "Sem certificado", 
        variant: "default",
        description: "Nenhum certificado M365 foi gerado para este agent"
      };
    }
    if (agent.azure_certificate_key_id) {
      return { 
        label: "Registrado", 
        variant: "success",
        description: "Certificado registrado no Azure AD e pronto para uso"
      };
    }
    return { 
      label: "Pendente", 
      variant: "warning",
      description: "Certificado gerado, aguardando registro no Azure AD via heartbeat"
    };
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

  const handleGenerateNewCode = async () => {
    if (!agent) return;

    setGeneratingCode(true);
    try {
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const code = generateActivationCode();

      const { error: updateError } = await (supabase
        .from("agents" as any)
        .update({
          activation_code: code,
          activation_code_expires_at: expiresAt,
        })
        .eq("id", agent.id) as any);

      if (updateError) throw updateError;

      toast.success("Novo código de ativação gerado!");
      refetch();
    } catch (error: any) {
      toast.error("Erro ao gerar código: " + error.message);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyCode = async () => {
    if (agent?.activation_code) {
      await navigator.clipboard.writeText(agent.activation_code);
      setCodeCopied(true);
      toast.success("Código copiado!");
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleCopyId = async () => {
    if (agent?.id) {
      await navigator.clipboard.writeText(agent.id);
      toast.success("ID copiado!");
    }
  };

  const handleCopyThumbprint = async () => {
    if (agent?.certificate_thumbprint) {
      await navigator.clipboard.writeText(agent.certificate_thumbprint);
      toast.success("Thumbprint copiado!");
    }
  };

  const handleDownloadCertificate = () => {
    if (!agent?.certificate_public_key) return;

    const blob = new Blob([agent.certificate_public_key], {
      type: 'application/x-pem-file'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${agent.name.replace(/\s+/g, '-')}-cert.pem`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Certificado baixado!");
  };

  const handleCheckComponents = async () => {
    if (!agent) return;

    setCheckingComponents(true);
    try {
      const { error } = await (supabase
        .from("agents" as any)
        .update({ check_components: true })
        .eq("id", agent.id) as any);

      if (error) throw error;

      toast.success("Verificação de componentes agendada! O agent executará no próximo heartbeat.");
      refetch();
    } catch (error: any) {
      toast.error("Erro ao agendar verificação: " + error.message);
    } finally {
      setCheckingComponents(false);
    }
  };

  const handleRevokeAgent = async () => {
    if (!agent) return;

    setRevoking(true);
    try {
      const { error: agentError } = await (supabase
        .from("agents" as any)
        .update({
          revoked: true,
          activation_code: null,
          activation_code_expires_at: null,
        })
        .eq("id", agent.id) as any);

      if (agentError) throw agentError;

      toast.success("Agent revogado com sucesso!");
      setRevokeDialogOpen(false);
      navigate("/agents");
    } catch (error: any) {
      toast.error("Erro ao revogar agent: " + error.message);
    } finally {
      setRevoking(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!agent || deleteConfirmName !== agent.name) return;

    setDeleting(true);
    try {
      const { error } = await (supabase
        .from("agents" as any)
        .delete()
        .eq("id", agent.id) as any);

      if (error) throw error;

      toast.success("Agent deletado com sucesso!");
      setDeleteDialogOpen(false);
      navigate("/agents");
    } catch (error: any) {
      toast.error("Erro ao deletar agent: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCertificate = async () => {
    if (!agent) return;

    setDeletingCert(true);
    try {
      const { error } = await (supabase
        .from("agents" as any)
        .update({
          certificate_thumbprint: null,
          certificate_public_key: null,
          azure_certificate_key_id: null,
        })
        .eq("id", agent.id) as any);

      if (error) throw error;

      toast.success("Certificado removido! O agent gerará um novo certificado no próximo heartbeat.");
      setDeleteCertDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast.error("Erro ao remover certificado: " + error.message);
    } finally {
      setDeletingCert(false);
    }
  };

  if (authLoading || !canAccessPage) return null;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-64 lg:col-span-2" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !agent) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8">
          <div className="text-center py-12">
            <Bot className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold mb-2">Agent não encontrado</h2>
            <p className="text-muted-foreground mb-4">O agent solicitado não existe ou você não tem permissão para visualizá-lo.</p>
            <Button onClick={() => navigate("/agents")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Agents
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const status = getAgentStatus(agent);
  const certStatus = getCertificateStatus();
  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8">
        {/* Breadcrumb */}
        <PageBreadcrumb items={[
          { label: 'Agents', href: '/agents' },
          { label: agent.name }
        ]} />

        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/agents")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">{agent.name}</h1>
                <Badge
                  variant={status.variant === "success" ? "default" : status.variant === "destructive" ? "destructive" : "secondary"}
                  className={
                    status.variant === "success"
                      ? "bg-success/10 text-success"
                      : status.variant === "warning"
                        ? "bg-warning/10 text-warning"
                        : ""
                  }
                >
                  {status.icon}
                  <span className="ml-1">{status.label}</span>
                </Badge>
              </div>
              {agent.clients?.name && (
                <p className="text-muted-foreground flex items-center gap-1 mt-1">
                  <Building className="w-4 h-4" />
                  {agent.clients.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="config" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="config" className="flex items-center gap-1.5">
              <Settings className="w-4 h-4" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="monitor" className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4" />
              Monitoramento
            </TabsTrigger>
            <TabsTrigger value="remote" className="flex items-center gap-1.5">
              <Terminal className="w-4 h-4" />
              Acesso Remoto
            </TabsTrigger>
          </TabsList>

          {/* ── Configuração Tab ── */}
          <TabsContent value="config" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Status Card */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Activity className="w-5 h-5" />
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Estado</span>
                    <Badge
                      variant={status.variant === "success" ? "default" : status.variant === "destructive" ? "destructive" : "secondary"}
                      className={
                        status.variant === "success"
                          ? "bg-success/10 text-success"
                          : status.variant === "warning"
                            ? "bg-warning/10 text-warning"
                            : ""
                      }
                    >
                      {status.icon}
                      <span className="ml-1">{status.label}</span>
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Versão Agent</span>
                    {agent.agent_version ? (
                      <code className="text-sm bg-muted px-2 py-0.5 rounded">v{agent.agent_version}</code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Versão Supervisor</span>
                    {(agent as any).supervisor_version ? (
                      <code className="text-sm bg-muted px-2 py-0.5 rounded">v{(agent as any).supervisor_version}</code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Versão Monitor</span>
                    {monitorVersion ? (
                      <code className="text-sm bg-muted px-2 py-0.5 rounded">v{monitorVersion}</code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Último heartbeat</span>
                    <span className="text-sm">
                      {agent.last_seen
                        ? formatDistanceToNow(new Date(agent.last_seen), { locale: ptBR, addSuffix: true })
                        : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* General Info Card */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Bot className="w-5 h-5" />
                    Informações Gerais
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Nome</span>
                    <span className="font-medium">{agent.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cliente</span>
                    <span>{agent.clients?.name || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Criado em</span>
                    <span className="text-sm">{formatDateTimeBR(agent.created_at)}</span>
                  </div>
                  <div className="space-y-2">
                    <span className="text-muted-foreground text-sm">Agent ID</span>
                    <div className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-border/50">
                      <code className="flex-1 text-xs font-mono break-all text-muted-foreground">{agent.id}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopyId}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Certificate Card */}
              <Card className="glass-card lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Shield className="w-5 h-5" />
                    Certificado M365
                  </CardTitle>
                  <CardDescription>{certStatus.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status do Registro</span>
                    <Badge
                      variant={certStatus.variant === "success" ? "default" : "secondary"}
                      className={
                        certStatus.variant === "success"
                          ? "bg-success/10 text-success"
                          : certStatus.variant === "warning"
                            ? "bg-warning/10 text-warning"
                            : ""
                      }
                    >
                      {certStatus.variant === "success" ? (
                        <ShieldCheck className="w-3 h-3 mr-1" />
                      ) : certStatus.variant === "warning" ? (
                        <Clock className="w-3 h-3 mr-1" />
                      ) : (
                        <ShieldX className="w-3 h-3 mr-1" />
                      )}
                      {certStatus.label}
                    </Badge>
                  </div>

                  {agent.certificate_thumbprint && (
                    <>
                      <div className="space-y-2">
                        <span className="text-muted-foreground text-sm flex items-center gap-1">
                          <Fingerprint className="w-4 h-4" />
                          Thumbprint (SHA-1)
                        </span>
                        <div className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-border/50">
                          <code className="flex-1 text-xs font-mono break-all">{agent.certificate_thumbprint}</code>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCopyThumbprint}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {agent.azure_certificate_key_id && (
                        <div className="space-y-2">
                          <span className="text-muted-foreground text-sm flex items-center gap-1">
                            <Key className="w-4 h-4" />
                            Azure Key ID
                          </span>
                          <div className="p-2 rounded bg-muted/30 border border-border/50">
                            <code className="text-xs font-mono break-all text-muted-foreground">{agent.azure_certificate_key_id}</code>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-2">
                        {agent.certificate_public_key && (
                          <Button variant="outline" size="sm" onClick={handleDownloadCertificate}>
                            <Download className="w-4 h-4 mr-2" />
                            Baixar Certificado Público (.pem)
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="text-destructive border-destructive/50 hover:bg-destructive/10"
                          onClick={() => setDeleteCertDialogOpen(true)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remover Certificado
                        </Button>
                      </div>
                    </>
                  )}

                  {!agent.certificate_thumbprint && (
                    <p className="text-sm text-muted-foreground">
                      O certificado será gerado automaticamente durante a instalação do agent com suporte a M365.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Capabilities Card */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Cpu className="w-5 h-5" />
                    Capabilities
                  </CardTitle>
                  <CardDescription>Recursos disponíveis neste agent</CardDescription>
                </CardHeader>
                <CardContent>
                  {capabilities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {capabilities.map((cap, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma capability registrada ainda.</p>
                  )}
                </CardContent>
              </Card>

              {/* Activation Code Card */}
              {!agent.revoked && (
                <Card className="glass-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Key className="w-5 h-5" />
                      Código de Ativação
                    </CardTitle>
                    <CardDescription>Use para instalar ou reinstalar o agent</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {agent.activation_code ? (
                      <>
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                          <code className="flex-1 text-sm font-mono break-all">{agent.activation_code}</code>
                          <Button size="icon" variant="ghost" onClick={handleCopyCode}>
                            {codeCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                        {agent.activation_code_expires_at && (
                          <p className="text-xs text-warning flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Expira {formatDistanceToNow(new Date(agent.activation_code_expires_at), { locale: ptBR, addSuffix: true })}
                          </p>
                        )}
                        <AgentInstallInstructions activationCode={agent.activation_code} isSuperAgent={!agent.client_id} />
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhum código ativo. Gere um novo código para reinstalar o agent.
                      </p>
                    )}

                    <Button size="sm" variant="outline" onClick={handleGenerateNewCode} disabled={generatingCode}>
                      {generatingCode ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Gerar novo código
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Actions Card */}
              <Card className="glass-card lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    Ações
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {agent.last_seen && !agent.revoked && (
                      <Button variant="outline" onClick={handleCheckComponents} disabled={checkingComponents}>
                        {checkingComponents ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        Verificar Componentes
                      </Button>
                    )}

                    {!agent.revoked && (
                      <Button variant="destructive" onClick={() => setRevokeDialogOpen(true)}>
                        <Ban className="w-4 h-4 mr-2" />
                        Revogar Agent
                      </Button>
                    )}

                    {agent.revoked && (
                      <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Deletar Agent
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Monitoramento Tab ── */}
          <TabsContent value="monitor">
            <AgentMonitorPanel agentId={agent.id} />
          </TabsContent>

          {/* ── Acesso Remoto Tab ── */}
          <TabsContent value="remote">
            <RemoteTerminal agentId={agent.id} agentName={agent.name} />
          </TabsContent>
        </Tabs>
        {/* Revoke Confirmation Dialog */}
        <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revogar Agent</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja revogar o agent "{agent.name}"? Esta ação invalidará todos os tokens do
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
                <p className="text-sm font-mono mt-1">{agent.name}</p>
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
                  setDeleteConfirmName("");
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAgent}
                disabled={deleting || deleteConfirmName !== agent.name}
              >
                {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Deletar Agent
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Certificate Confirmation Dialog */}
        <AlertDialog open={deleteCertDialogOpen} onOpenChange={setDeleteCertDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover Certificado M365?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    Esta ação irá remover o certificado M365 deste agent. O agent precisará 
                    gerar um novo certificado e registrá-lo no Azure AD novamente.
                  </p>
                  <p className="font-medium">
                    Nota: Se o agent tiver tenants vinculados, eles perderão 
                    a capacidade de executar análises via PowerShell até que um novo 
                    certificado seja registrado.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteCertificate}
                disabled={deletingCert}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingCert ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
