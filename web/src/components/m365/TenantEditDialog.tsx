import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Monitor, CheckCircle2, AlertCircle, Play, Mail } from 'lucide-react';
import { TenantConnection } from '@/hooks/useTenantConnection';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface Agent {
  id: string;
  name: string;
  certificate_thumbprint: string | null;
  azure_certificate_key_id: string | null;
}

interface LinkedAgent {
  id: string;
  agent_id: string;
  enabled: boolean;
  agents: Agent | null;
}

interface TenantEditDialogProps {
  tenant: TenantConnection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tenantId: string, updates: { display_name?: string; tenant_domain?: string }) => Promise<{ success: boolean; error?: string }>;
  onLinkAgent?: (tenantId: string, agentId: string) => Promise<{ success: boolean; error?: string }>;
  onUnlinkAgent?: (tenantId: string) => Promise<{ success: boolean; error?: string }>;
}

export function TenantEditDialog({ 
  tenant, 
  open, 
  onOpenChange, 
  onSave,
  onLinkAgent,
  onUnlinkAgent,
}: TenantEditDialogProps) {
  const [displayName, setDisplayName] = useState('');
  const [tenantDomain, setTenantDomain] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Agent linking state
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [linkedAgent, setLinkedAgent] = useState<LinkedAgent | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('none');
  const [loadingAgents, setLoadingAgents] = useState(false);
  
  // Exchange test state
  const [testingExchange, setTestingExchange] = useState(false);

  useEffect(() => {
    if (tenant && open) {
      setDisplayName(tenant.display_name || '');
      setTenantDomain(tenant.tenant_domain || '');
      fetchAgentsData();
    }
  }, [tenant, open]);

  const fetchAgentsData = async () => {
    if (!tenant) return;

    setLoadingAgents(true);
    try {
      // Fetch available agents from the same workspace
      const { data: agents } = await supabase
        .from('agents')
        .select('id, name, certificate_thumbprint, azure_certificate_key_id')
        .eq('client_id', tenant.client.id)
        .eq('revoked', false)
        .order('name');

      setAvailableAgents(agents || []);

      // Fetch currently linked agent
      const { data: linked } = await supabase
        .from('m365_tenant_agents')
        .select(`
          id,
          agent_id,
          enabled,
          agents(id, name, certificate_thumbprint, azure_certificate_key_id)
        `)
        .eq('tenant_record_id', tenant.id)
        .maybeSingle();

      setLinkedAgent(linked as LinkedAgent | null);
      setSelectedAgentId(linked?.agent_id || 'none');
    } catch (error) {
      console.error('Error fetching agents:', error);
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleSave = async () => {
    if (!tenant) return;
    
    setSaving(true);
    
    // Save tenant info
    const result = await onSave(tenant.id, {
      display_name: displayName.trim() || null,
      tenant_domain: tenantDomain.trim() || null,
    });

    if (!result.success) {
      setSaving(false);
      return;
    }

    // Handle agent linking changes
    const currentLinkedId = linkedAgent?.agent_id || 'none';
    
    if (selectedAgentId !== currentLinkedId) {
      if (selectedAgentId === 'none' && onUnlinkAgent) {
        await onUnlinkAgent(tenant.id);
      } else if (selectedAgentId !== 'none' && onLinkAgent) {
        await onLinkAgent(tenant.id, selectedAgentId);
      }
    }

    setSaving(false);
    onOpenChange(false);
  };

  const handleTestExchangeConnection = async () => {
    if (!tenant) return;
    
    setTestingExchange(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-m365-exchange-connection', {
        body: { tenant_record_id: tenant.id }
      });

      if (error) {
        toast({
          title: 'Erro ao iniciar teste',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      if (data.success) {
        toast({
          title: 'Teste iniciado',
          description: `Task ${data.task_id} criada. O agent ${data.agent?.name} irá processar em breve.`,
        });
      } else {
        toast({
          title: 'Não foi possível iniciar',
          description: data.error || data.message,
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      console.error('Exchange test error:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setTestingExchange(false);
    }
  };

  const isConnected = tenant?.connection_status === 'connected' || tenant?.connection_status === 'partial';
  
  const selectedAgent = availableAgents.find(a => a.id === selectedAgentId);
  const hasCertificate = selectedAgent?.azure_certificate_key_id;
  
  // Can test Exchange if there's a linked agent with certificate
  const canTestExchange = linkedAgent?.agents?.azure_certificate_key_id && isConnected;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Tenant</DialogTitle>
          <DialogDescription>
            Atualize as informações do tenant Microsoft 365.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="tenant-id">Tenant ID</Label>
            <Input
              id="tenant-id"
              value={tenant?.tenant_id || ''}
              disabled
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              O Tenant ID não pode ser alterado.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Nome de Exibição</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: Contoso Corporation"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant-domain">Domínio do Tenant</Label>
            <Input
              id="tenant-domain"
              value={tenantDomain}
              onChange={(e) => setTenantDomain(e.target.value)}
              placeholder="contoso.onmicrosoft.com"
              disabled={isConnected}
            />
            {isConnected && (
              <p className="text-xs text-muted-foreground">
                O domínio não pode ser alterado enquanto o tenant está conectado.
              </p>
            )}
          </div>

          <Separator className="my-4" />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Agent para Análise PowerShell</Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="agent-select" className="text-xs text-muted-foreground">
                Agent Vinculado
              </Label>
              
              {loadingAgents ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando agents...
                </div>
              ) : availableAgents.length === 0 ? (
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  Nenhum agent disponível neste workspace.
                </div>
              ) : (
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger id="agent-select">
                    <SelectValue placeholder="Selecione um agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">Nenhum</span>
                    </SelectItem>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <span>{agent.name}</span>
                          {agent.azure_certificate_key_id ? (
                            <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Cert OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Pendente
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {selectedAgentId !== 'none' && selectedAgent && (
                <div className="rounded-md bg-muted/30 p-3 space-y-1">
                  {hasCertificate ? (
                    <div className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-success mt-0.5" />
                      <div>
                        <p className="font-medium text-success">Certificado registrado no Azure</p>
                        <p className="text-muted-foreground font-mono">
                          {selectedAgent.azure_certificate_key_id}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-xs">
                      <AlertCircle className="h-4 w-4 text-warning mt-0.5" />
                      <div>
                        <p className="font-medium text-warning">Certificado pendente</p>
                        <p className="text-muted-foreground">
                          O agent ainda não registrou o certificado no Azure.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Exchange Online Test Section */}
          {linkedAgent && (
            <>
              <Separator className="my-4" />
              
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Testar Conexão Exchange Online</Label>
                </div>
                
                <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Teste a autenticação CBA (Certificate-Based Authentication) com o Exchange Online 
                    usando o agent vinculado.
                  </p>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestExchangeConnection}
                    disabled={!canTestExchange || testingExchange}
                    className="w-full"
                  >
                    {testingExchange ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Iniciando teste...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Testar Connect-ExchangeOnline
                      </>
                    )}
                  </Button>
                  
                  {!canTestExchange && linkedAgent && (
                    <p className="text-xs text-warning">
                      {!linkedAgent.agents?.azure_certificate_key_id 
                        ? 'Aguarde o agent registrar o certificado no Azure.'
                        : 'O tenant precisa estar conectado para testar.'}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <Separator className="my-4" />

          <div className="space-y-2">
            <Label>Cliente Associado</Label>
            <Input
              value={tenant?.client.name || ''}
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Para alterar o cliente, exclua e recrie a conexão.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
