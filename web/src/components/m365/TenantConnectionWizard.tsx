import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePreview } from '@/contexts/PreviewContext';
import { supabase } from '@/integrations/supabase/client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { 
  Building, 
  Globe, 
  Shield, 
  CheckCircle, 
  ArrowRight, 
  ArrowLeft,
  Loader2,
  AlertCircle,
  Info,
  ExternalLink,
  Key,
  Server,
  Download,
  Terminal
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TenantConnectionWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Client {
  id: string;
  name: string;
}

interface Agent {
  id: string;
  name: string;
  certificate_thumbprint: string | null;
  certificate_public_key: string | null;
  capabilities: string[] | null;
  last_seen: string | null;
  client_id: string | null;
}

interface ConnectionResult {
  status: 'success' | 'partial' | 'error';
  missingPermissions: string[];
  errorMessage?: string;
}

type WizardStep = 'client' | 'tenant' | 'agent' | 'authorize' | 'result';

const STEPS: { key: WizardStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'client', label: 'Cliente', icon: Building },
  { key: 'tenant', label: 'Tenant', icon: Globe },
  { key: 'agent', label: 'Agent', icon: Server },
  { key: 'authorize', label: 'Autorizar', icon: Shield },
];

export function TenantConnectionWizard({ open, onOpenChange, onSuccess }: TenantConnectionWizardProps) {
  const { user } = useAuth();
  const { isPreviewMode, previewTarget } = usePreview();
  
  const [step, setStep] = useState<WizardStep>('client');
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [authorizing, setAuthorizing] = useState(false);
  
  // Form data
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [tenantId, setTenantId] = useState('');
  const [tenantDomain, setTenantDomain] = useState('');
  const [pendingTenantRecordId, setPendingTenantRecordId] = useState<string | null>(null);
  const [waitingForAuth, setWaitingForAuth] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [connectionResult, setConnectionResult] = useState<ConnectionResult | null>(null);
  
  // Agent selection for PowerShell
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [loadingAgents, setLoadingAgents] = useState(false);
  
  useEffect(() => {
    if (open) {
      fetchClients();
    }
  }, [open, isPreviewMode, previewTarget]);

  useEffect(() => {
    if (!open) {
      // Reset form when closing
      setStep('client');
      setSelectedClientId('');
      setTenantId('');
      setTenantDomain('');
      setAuthorizing(false);
      setPendingTenantRecordId(null);
      setWaitingForAuth(false);
      setVerifying(false);
      setConnectionResult(null);
      setSelectedAgentId('');
      setAgents([]);
    }
  }, [open]);

  // Fetch agents when client is selected
  useEffect(() => {
    if (selectedClientId) {
      fetchAgents(selectedClientId);
    }
  }, [selectedClientId]);

  const fetchAgents = async (clientId: string) => {
    setLoadingAgents(true);
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, certificate_thumbprint, certificate_public_key, capabilities, last_seen, client_id')
        .eq('client_id', clientId)
        .eq('revoked', false)
        .order('name');

      if (error) throw error;
      
      // Filter to only show agents with M365 certificate capability
      const m365Agents = (data || []).filter(
        agent => agent.certificate_thumbprint && 
          (agent.capabilities as unknown as string[] | null)?.includes('m365_powershell')
      ).map(agent => ({
        ...agent,
        capabilities: agent.capabilities as unknown as string[] | null,
      }));
      
      setAgents(m365Agents);
    } catch (error) {
      console.error('Error fetching agents:', error);
      setAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  };

  // Listen for messages from popup window
  useEffect(() => {
    if (!waitingForAuth) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'm365-oauth-callback') return;
      
      const { success, partial, tenantId: msgTenantId, missingPermissions, error, errorDescription } = event.data;
      
      if (success && !partial) {
        setConnectionResult({
          status: 'success',
          missingPermissions: [],
        });
        setStep('result');
        setWaitingForAuth(false);
        onSuccess();
      } else if (partial) {
        setConnectionResult({
          status: 'partial',
          missingPermissions: missingPermissions || [],
        });
        setStep('result');
        setWaitingForAuth(false);
        onSuccess();
      } else if (error) {
        setConnectionResult({
          status: 'error',
          missingPermissions: [],
          errorMessage: errorDescription || error || 'Ocorreu um erro durante a autorização.',
        });
        setStep('result');
        setWaitingForAuth(false);
        setPendingTenantRecordId(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [waitingForAuth, onSuccess]);

  useEffect(() => {
    if (clients.length === 1 && !selectedClientId) {
      setSelectedClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

  const fetchClients = async () => {
    try {
      let query = supabase
        .from('clients')
        .select('id, name')
        .order('name');

      // Apply workspace filter if in preview mode
      if (isPreviewMode && previewTarget?.workspaces) {
        const workspaceIds = previewTarget.workspaces.map(w => w.id);
        if (workspaceIds.length > 0) {
          query = query.in('id', workspaceIds);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const currentStepIndex = STEPS.findIndex(s => s.key === step);

  const canProceed = () => {
    switch (step) {
      case 'client':
        return !!selectedClientId;
      case 'tenant':
        return !!tenantId.trim();
      case 'agent':
        return true; // Agent step is optional
      case 'authorize':
        return true;
      default:
        return false;
    }
  };

  const downloadCertificate = () => {
    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent?.certificate_public_key) {
      toast({
        title: 'Certificado não disponível',
        description: 'O agent selecionado não possui certificado público disponível.',
        variant: 'destructive',
      });
      return;
    }

    const blob = new Blob([agent.certificate_public_key], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iscope-agent-${agent.name.replace(/\s+/g, '-').toLowerCase()}.crt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Certificado baixado',
      description: 'Faça upload do arquivo .crt no Azure App Registration.',
    });
  };

  const handleAuthorize = async () => {
    setAuthorizing(true);
    
    try {
      // 1. Create pending tenant record first
      const { data: tenant, error: tenantError } = await supabase
        .from('m365_tenants')
        .insert({
          client_id: selectedClientId,
          tenant_id: tenantId.trim(),
          tenant_domain: tenantDomain.trim() || null,
          connection_status: 'pending',
          created_by: user?.id,
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // 2. Link agent to tenant if selected
      if (selectedAgentId) {
        const { error: linkError } = await supabase
          .from('m365_tenant_agents')
          .insert({
            tenant_record_id: tenant.id,
            agent_id: selectedAgentId,
            enabled: true,
          });

        if (linkError) {
          console.warn('Failed to link agent to tenant:', linkError);
          // Don't fail the whole process, just log warning
        } else {
          console.log(`[TenantConnectionWizard] Agent ${selectedAgentId} linked to tenant ${tenant.id}`);
        }
      }

      // 3. Write initial audit log
      await supabase.from('m365_audit_logs').insert({
        tenant_record_id: tenant.id,
        client_id: selectedClientId,
        user_id: user?.id,
        action: 'connect_initiated',
        action_details: {
          tenant_id: tenantId.trim(),
          connection_method: 'multi_tenant_app',
          agent_id: selectedAgentId || null,
        },
      });

      // 3. Get the app ID from secrets (we'll use a placeholder and the edge function will use the real one)
      // The actual app ID is stored in secrets and used by the edge function
      const appId = import.meta.env.VITE_M365_APP_ID || ''; // This will be empty in frontend, callback handles it
      
      // 4. Build the state payload for the callback
      // Use published URL to avoid cross-domain session issues
      const getAppBaseUrl = () => {
        const publishedUrl = 'https://iscope360.lovable.app';
        if (import.meta.env.DEV) {
          return window.location.origin;
        }
        return publishedUrl;
      };
      
      const statePayload = {
        tenant_record_id: tenant.id,
        client_id: selectedClientId,
        tenant_id: tenantId.trim(),
        redirect_url: `${getAppBaseUrl()}/scope-m365/tenant-connection`,
      };
      const state = btoa(JSON.stringify(statePayload));
      
      // 5. Build Admin Consent URL
      // Note: For multi-tenant apps, we need to use the /adminconsent endpoint
      // The callback URL must be registered in the Azure App Registration
      const callbackUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/m365-oauth-callback`;
      
      // We need the App ID - since it's in secrets, we'll need to get it via an edge function
      // For now, we'll create a simple endpoint or use a known value
      const { data: configData, error: configError } = await supabase.functions.invoke('get-m365-config', {
        body: {},
      });
      
      let multiTenantAppId = '';
      
      if (configError || !configData?.app_id) {
        // Fallback: Try to get from environment or show error
        console.warn('Could not get M365 app config, attempting direct consent URL');
        
        toast({
          title: 'Configuração pendente',
          description: 'O App ID do iScope 360 precisa ser configurado. Contate o administrador.',
          variant: 'destructive',
        });
        setAuthorizing(false);
        return;
      }
      
      multiTenantAppId = configData.app_id;
      
      // Ensure Exchange.ManageAsApp and Sites.FullControl.All are in App Registration
      const { error: ensureError } = await supabase.functions.invoke('ensure-exchange-permission');
      if (ensureError) {
        console.warn('Could not ensure Exchange permission:', ensureError);
      }

      // Build the admin consent URL
      const adminConsentUrl = new URL(`https://login.microsoftonline.com/${tenantId.trim()}/adminconsent`);
      adminConsentUrl.searchParams.set('client_id', multiTenantAppId);
      adminConsentUrl.searchParams.set('redirect_uri', callbackUrl);
      adminConsentUrl.searchParams.set('state', state);
      
      // 6. Store tenant record ID for verification
      setPendingTenantRecordId(tenant.id);
      
      // 7. Open Microsoft login in new window/tab
      window.open(
        adminConsentUrl.toString(),
        'microsoft_auth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      
      // 8. Show waiting state
      setAuthorizing(false);
      setWaitingForAuth(true);
      
    } catch (error: any) {
      console.error('Error initiating authorization:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Ocorreu um erro ao iniciar a autorização.',
        variant: 'destructive',
      });
      setAuthorizing(false);
    }
  };

  const handleVerifyConnection = async () => {
    if (!pendingTenantRecordId) return;
    
    setVerifying(true);
    
    try {
      const { data: tenant, error } = await supabase
        .from('m365_tenants')
        .select('connection_status')
        .eq('id', pendingTenantRecordId)
        .single();
      
      if (error) throw error;
      
      if (tenant.connection_status === 'connected') {
        toast({
          title: 'Conexão estabelecida!',
          description: 'O tenant Microsoft 365 foi conectado com sucesso.',
        });
        onSuccess();
        onOpenChange(false);
      } else if (tenant.connection_status === 'partial') {
        toast({
          title: 'Conexão parcial',
          description: 'O tenant foi conectado, mas algumas permissões estão faltando.',
          variant: 'default',
        });
        onSuccess();
        onOpenChange(false);
      } else if (tenant.connection_status === 'failed') {
        toast({
          title: 'Erro na conexão',
          description: 'Ocorreu um erro durante a autorização. Tente novamente.',
          variant: 'destructive',
        });
        setWaitingForAuth(false);
        setPendingTenantRecordId(null);
      } else {
        toast({
          title: 'Aguardando autorização',
          description: 'A autorização ainda não foi concluída. Complete o processo na janela da Microsoft.',
          variant: 'default',
        });
      }
    } catch (error: any) {
      console.error('Error verifying connection:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível verificar o status da conexão.',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex].key);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex].key);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'client':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selecione o Cliente</Label>
              <p className="text-sm text-muted-foreground">
                O tenant Microsoft 365 será associado a este cliente.
              </p>
            </div>
            
            {clients.length === 0 ? (
              <Card className="border-dashed border-border/50">
                <CardContent className="py-6 text-center">
                  <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum cliente disponível. Crie um cliente primeiro.
                  </p>
                </CardContent>
              </Card>
            ) : clients.length === 1 ? (
              <Card className="border-primary/50 bg-primary/5">
                <CardContent className="py-4 flex items-center gap-3">
                  <Building className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">{clients[0].name}</p>
                    <p className="text-xs text-muted-foreground">Cliente selecionado automaticamente</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
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
            )}

            <Card className="bg-muted/30 border border-border/50">
              <CardContent className="py-3">
                <div className="flex gap-2 items-start">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Conexão Simplificada</p>
                    <p className="mt-1">
                      O iScope 360 usa um modelo de App Multi-Tenant. O administrador do tenant 
                      apenas precisa autorizar o acesso - sem criar App Registration manualmente.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'tenant':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenantId">Tenant ID (Directory ID) *</Label>
              <Input
                id="tenantId"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                Azure Portal → Microsoft Entra ID → Overview → Tenant ID
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tenantDomain">Domínio do Tenant (opcional)</Label>
              <Input
                id="tenantDomain"
                value={tenantDomain}
                onChange={(e) => setTenantDomain(e.target.value)}
                placeholder="contoso.onmicrosoft.com"
              />
              <p className="text-xs text-muted-foreground">
                Será detectado automaticamente durante a autorização.
              </p>
            </div>

            <Card className="bg-muted/30 border border-border/50">
              <CardContent className="py-3">
                <div className="flex gap-2 items-start">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p>
                      Você pode encontrar o Tenant ID no Azure Portal, ou usar o domínio 
                      principal do tenant (ex: contoso.onmicrosoft.com).
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'agent':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agent para Análise Avançada (Opcional)</Label>
              <p className="text-sm text-muted-foreground">
                Para análises via PowerShell (Transport Rules, DLP, Audit Logs avançados), 
                selecione um Agent e configure o certificado no Azure.
              </p>
            </div>

            {loadingAgents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : agents.length === 0 ? (
              <Card className="bg-muted/30 border-dashed border-border/50">
                <CardContent className="py-6 text-center">
                  <Terminal className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Nenhum agent com suporte a PowerShell disponível.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Instale um agent com a versão mais recente para habilitar análises avançadas.
                    Você pode pular esta etapa e usar apenas a Graph API.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um agent (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Pular (usar apenas Graph API)</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          <Server className="w-4 h-4" />
                          {agent.name}
                          <span className="text-xs text-muted-foreground">
                            ({agent.certificate_thumbprint?.substring(0, 8)}...)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedAgentId && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="py-4 space-y-4">
                      <div className="flex items-start gap-3">
                        <Shield className="w-5 h-5 text-primary mt-0.5" />
                        <div>
                          <h4 className="font-medium text-sm">Configurar Certificado no Azure</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Para habilitar análises via PowerShell, você precisa fazer upload do 
                            certificado do agent no Azure App Registration.
                          </p>
                        </div>
                      </div>

                      <ol className="text-sm text-muted-foreground space-y-2 pl-2">
                        <li className="flex items-start gap-2">
                          <span className="font-medium text-foreground">1.</span>
                          Baixe o certificado público do agent abaixo
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="font-medium text-foreground">2.</span>
                          No Azure Portal, vá em <strong>App Registrations</strong> → iScope 360
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="font-medium text-foreground">3.</span>
                          Em <strong>Certificates & Secrets</strong>, clique em <strong>Upload certificate</strong>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="font-medium text-foreground">4.</span>
                          Faça upload do arquivo .crt baixado
                        </li>
                      </ol>

                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={downloadCertificate}
                        className="w-full gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Baixar Certificado (.crt)
                      </Button>

                      <div className="flex items-start gap-2 pt-2 border-t border-border/30">
                        <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          Thumbprint: <code className="font-mono bg-muted px-1 rounded">
                            {agents.find(a => a.id === selectedAgentId)?.certificate_thumbprint}
                          </code>
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Card className="bg-muted/30 border border-border/50">
              <CardContent className="py-3">
                <div className="flex gap-2 items-start">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Análises via PowerShell</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      <li>• Transport Rules (Exchange)</li>
                      <li>• DLP Policies</li>
                      <li>• Advanced Audit Logs</li>
                      <li>• Message Trace</li>
                    </ul>
                    <p className="mt-2 text-xs">
                      A maioria das análises funciona sem PowerShell via Graph API.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'authorize':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Autorizar Acesso</Label>
              <p className="text-sm text-muted-foreground">
                {waitingForAuth 
                  ? 'Complete a autorização na janela da Microsoft e clique em verificar.'
                  : 'Clique no botão abaixo para autorizar o iScope 360 a acessar o tenant Microsoft 365.'
                }
              </p>
            </div>

            <Card className="bg-muted/30 border border-border/50">
              <CardContent className="py-4">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    {waitingForAuth ? (
                      <Loader2 className="w-7 h-7 text-primary animate-spin" />
                    ) : (
                      <Key className="w-7 h-7 text-primary" />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <p className="font-medium">
                      {waitingForAuth ? 'Aguardando Autorização' : 'Consentimento do Administrador'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {waitingForAuth 
                        ? 'Uma nova janela foi aberta para o login da Microsoft. Complete o processo e clique em "Verificar Conexão".'
                        : 'Uma nova janela será aberta para o login da Microsoft. Um administrador do tenant precisa autorizar o acesso.'
                      }
                    </p>
                    {waitingForAuth && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        ⏳ A propagação do Admin Consent pode levar alguns minutos. Se a verificação falhar, aguarde 2-3 minutos e tente novamente.
                      </p>
                    )}
                  </div>
                  
                  {waitingForAuth ? (
                    <div className="flex flex-col gap-2 w-full max-w-[250px]">
                      <Button 
                        onClick={handleVerifyConnection}
                        size="default"
                        disabled={verifying}
                        className="gap-2 w-full"
                      >
                        {verifying ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Verificando...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Verificar Conexão
                          </>
                        )}
                      </Button>
                      <Button 
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setWaitingForAuth(false);
                          setPendingTenantRecordId(null);
                        }}
                        className="gap-2"
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      onClick={handleAuthorize}
                      disabled={authorizing}
                      className="gap-2"
                    >
                      {authorizing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Abrindo janela...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-4 h-4" />
                          Autorizar com Microsoft
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/30 border border-border/50">
              <CardContent className="py-3">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Permissões solicitadas (somente leitura):</p>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Obrigatórias:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        User.Read.All - Ler todos os usuários
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Directory.Read.All - Ler diretório (roles, unidades)
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Group.Read.All - Ler todos os grupos
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Application.Read.All - Ler aplicativos
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        AuditLog.Read.All - Ler logs de auditoria
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Policy.Read.All - Ler políticas de segurança
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <p className="text-xs font-medium text-muted-foreground">Exchange Online:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        MailboxSettings.Read - Ler configurações de mailbox
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Mail.Read - Ler regras de inbox
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <p className="text-xs font-medium text-muted-foreground">Opcionais (requer Azure AD Premium):</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-muted-foreground" />
                        Reports.Read.All - Relatórios de MFA
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/30 border border-border/50">
              <CardContent className="py-3">
                <div className="flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-amber-700 dark:text-amber-400">Requisitos</p>
                    <p className="mt-1">
                      O usuário que autorizar precisa ser um <strong>Administrador Global</strong> ou 
                      ter a role <strong>Privileged Role Administrator</strong> no Azure AD.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'result':
        return (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              {/* Status Icon */}
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center",
                connectionResult?.status === 'success' && "bg-green-500/10",
                connectionResult?.status === 'partial' && "bg-yellow-500/10",
                connectionResult?.status === 'error' && "bg-red-500/10"
              )}>
                {connectionResult?.status === 'success' && (
                  <CheckCircle className="w-10 h-10 text-green-500" />
                )}
                {connectionResult?.status === 'partial' && (
                  <AlertCircle className="w-10 h-10 text-yellow-500" />
                )}
                {connectionResult?.status === 'error' && (
                  <AlertCircle className="w-10 h-10 text-red-500" />
                )}
              </div>

              {/* Status Title */}
              <div className="space-y-2">
                <h3 className={cn(
                  "text-lg font-semibold",
                  connectionResult?.status === 'success' && "text-green-500",
                  connectionResult?.status === 'partial' && "text-yellow-500",
                  connectionResult?.status === 'error' && "text-red-500"
                )}>
                  {connectionResult?.status === 'success' && 'Conexão Estabelecida!'}
                  {connectionResult?.status === 'partial' && 'Conexão Parcial'}
                  {connectionResult?.status === 'error' && 'Falha na Conexão'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {connectionResult?.status === 'success' && 
                    'Todas as permissões foram validadas com sucesso. O tenant está pronto para uso.'}
                  {connectionResult?.status === 'partial' && 
                    'O tenant foi conectado, mas algumas permissões não puderam ser validadas.'}
                  {connectionResult?.status === 'error' && 
                    (connectionResult.errorMessage || 'Ocorreu um erro durante o processo de autorização.')}
                </p>
              </div>
            </div>

            {/* Missing Permissions Details */}
            {connectionResult?.status === 'partial' && connectionResult.missingPermissions.length > 0 && (
              <Card className="bg-yellow-500/5 border-yellow-500/30">
                <CardContent className="py-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                      Permissões pendentes:
                    </p>
                    <ul className="space-y-2">
                      {connectionResult.missingPermissions.map((perm) => (
                        <li key={perm} className="flex items-start gap-2 text-sm">
                          <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-mono text-xs">{perm}</span>
                            {(perm === 'Reports.Read.All' || perm === 'AuditLog.Read.All') && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Requer Azure AD Premium P1/P2
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {connectionResult?.status === 'partial' && (
              <Card className="bg-muted/30 border border-border/50">
                <CardContent className="py-3">
                  <div className="flex gap-2 items-start">
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p>
                        As funcionalidades que dependem das permissões pendentes podem não funcionar corretamente.
                        Você pode atualizar as permissões posteriormente através do botão "Upgrade" no card do tenant.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {connectionResult?.status === 'error' && (
              <Card className="bg-muted/30 border border-border/50">
                <CardContent className="py-3">
                  <div className="flex gap-2 items-start">
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p>
                        Verifique se você tem permissões de Administrador Global no tenant e tente novamente.
                        O Admin Consent pode levar alguns minutos para propagar - aguarde e tente novamente.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border/50">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Conectar Tenant Microsoft 365
          </DialogTitle>
          <DialogDescription>
            Conecte o tenant Microsoft 365 do cliente para coletar dados via Microsoft Graph.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator - Hide on result step */}
        {step !== 'result' && (
          <div className="flex items-center justify-center py-2">
            {STEPS.map((s, index) => {
              const Icon = s.icon;
              const isActive = s.key === step;
              const isCompleted = index < currentStepIndex;
              
              return (
                <div key={s.key} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[70px]">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                        isActive && "border-primary bg-primary text-primary-foreground",
                        isCompleted && "border-primary bg-primary/10 text-primary",
                        !isActive && !isCompleted && "border-muted bg-muted/30 text-muted-foreground"
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <span className={cn(
                      "text-xs mt-1 whitespace-nowrap",
                      isActive && "text-primary font-medium",
                      !isActive && "text-muted-foreground"
                    )}>
                      {s.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div 
                      className={cn(
                        "w-10 h-0.5 mx-1 mt-[-16px]",
                        isCompleted ? "bg-primary" : "bg-muted"
                      )} 
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Step Content */}
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 px-1 py-2">
            {renderStepContent()}
          </div>
        </ScrollArea>

        {/* Actions */}
        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          {step === 'result' ? (
            <Button 
              onClick={() => onOpenChange(false)} 
              className="w-full gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Concluir
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStepIndex === 0 || loading || authorizing}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              
              {step !== 'authorize' && (
                <Button 
                  onClick={handleNext} 
                  disabled={!canProceed() || loading}
                  className="gap-2"
                >
                  Próximo
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
