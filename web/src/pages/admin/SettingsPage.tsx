import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, CheckCircle, AlertCircle, RefreshCw, Bot, Key, Layers, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ModulesManagement } from '@/components/admin/ModulesManagement';
import { M365PermissionsManagement } from '@/components/admin/M365PermissionsManagement';
import { UpdateManagementCard } from '@/components/admin/UpdateManagementCard';

interface ApiKeyStatus {
  name: string;
  label: string;
  description: string;
  configured: boolean;
  source: string;
  maskedValue: string;
  updatedAt: string | null;
}

export default function SettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("agents");
  const initialLoadDone = useRef(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyStatus[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [apiKeyValues, setApiKeyValues] = useState<Record<string, string>>({});
  const [savingApiKey, setSavingApiKey] = useState<string | null>(null);

  // Agent settings
  const [agentHeartbeatInterval, setAgentHeartbeatInterval] = useState<number>(120);
  const [loadingAgentSettings, setLoadingAgentSettings] = useState(false);
  const [savingAgentSettings, setSavingAgentSettings] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
    if (!authLoading && role !== 'super_admin') {
      navigate('/dashboard');
      toast.error('Acesso restrito a Super Administradores');
    }
  }, [user, role, authLoading, navigate]);

  useEffect(() => {
    if (user && role === 'super_admin' && !initialLoadDone.current) {
      initialLoadDone.current = true;
      loadApiKeys();
      loadAgentSettings();
      setLoading(false);
    }
  }, [user, role]);

  // ==========================================
  // API Keys Management
  // ==========================================

  const loadApiKeys = async () => {
    setLoadingApiKeys(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', { method: 'GET' });
      if (error) throw error;
      if (data?.keys) setApiKeys(data.keys);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast.error('Erro ao carregar chaves de API');
    } finally {
      setLoadingApiKeys(false);
    }
  };

  const handleSaveApiKey = async (keyName: string) => {
    const value = apiKeyValues[keyName];
    if (!value?.trim()) {
      toast.error('Informe o valor da chave de API');
      return;
    }

    setSavingApiKey(keyName);
    try {
      const { data, error } = await supabase.functions.invoke('manage-api-keys', {
        method: 'POST',
        body: { key_name: keyName, value: value.trim() }
      });
      if (error) throw error;
      toast.success(data?.message || 'Chave salva com sucesso');
      setApiKeyValues((prev) => ({ ...prev, [keyName]: '' }));
      await loadApiKeys();
    } catch (error: any) {
      console.error('Error saving API key:', error);
      toast.error('Erro ao salvar chave de API');
    } finally {
      setSavingApiKey(null);
    }
  };

  // ==========================================
  // Agent Settings
  // ==========================================

  const loadAgentSettings = async () => {
    setLoadingAgentSettings(true);
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'agent_heartbeat_interval')
        .maybeSingle();
      if (data?.value) setAgentHeartbeatInterval(Number(data.value) || 120);
    } catch (error) {
      console.error('Error loading agent settings:', error);
    } finally {
      setLoadingAgentSettings(false);
    }
  };

  const handleSaveAgentSettings = async () => {
    if (agentHeartbeatInterval < 60 || agentHeartbeatInterval > 300) {
      toast.error('O intervalo deve estar entre 60 e 300 segundos');
      return;
    }

    setSavingAgentSettings(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ value: agentHeartbeatInterval, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('key', 'agent_heartbeat_interval');
      if (error) throw error;
      toast.success('Configurações de agents salvas com sucesso');
    } catch (error) {
      console.error('Error saving agent settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSavingAgentSettings(false);
    }
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb items={[{ label: 'Administração' }, { label: 'Configurações' }]} />
        
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Configurações</h1>
          <p className="text-muted-foreground">Gerencie as configurações globais do sistema</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="agents" className="gap-2"><Bot className="w-4 h-4" />Agents</TabsTrigger>
            <TabsTrigger value="api-keys" className="gap-2"><Key className="w-4 h-4" />Chaves de API</TabsTrigger>
            <TabsTrigger value="modules" className="gap-2"><Layers className="w-4 h-4" />Módulos</TabsTrigger>
            <TabsTrigger value="m365" className="gap-2"><Shield className="w-4 h-4" />Microsoft 365</TabsTrigger>
          </TabsList>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-6">
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="w-5 h-5" />
                      Chaves de API de Terceiros
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Gerencie as chaves de API de serviços externos usados pelo sistema.
                      Os valores são armazenados de forma encriptada.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadApiKeys} disabled={loadingApiKeys}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingApiKeys ? 'animate-spin' : ''}`} />
                    Atualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingApiKeys ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : apiKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhuma chave de API configurável encontrada</p>
                ) : (
                  apiKeys.map((key) => (
                    <div key={key.name} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium">{key.label}</h4>
                          {key.configured ? (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />Configurada
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="w-3 h-3 mr-1" />Não Configurada
                            </Badge>
                          )}
                          {key.configured && key.source === 'environment' && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">via variável de ambiente</Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{key.description}</p>
                      {key.configured && key.maskedValue && (
                        <p className="text-xs font-mono text-green-600">Valor atual: {key.maskedValue}</p>
                      )}
                      <div className="flex gap-2">
                        <PasswordInput
                          placeholder={key.configured ? 'Novo valor (deixe em branco para manter)' : 'Cole a chave de API aqui'}
                          value={apiKeyValues[key.name] || ''}
                          onChange={(e) => setApiKeyValues((prev) => ({ ...prev, [key.name]: e.target.value }))}
                          className="flex-1"
                        />
                        <Button onClick={() => handleSaveApiKey(key.name)} disabled={savingApiKey === key.name || !apiKeyValues[key.name]?.trim()} size="default">
                          {savingApiKey === key.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modules"><ModulesManagement /></TabsContent>
          <TabsContent value="m365"><M365PermissionsManagement /></TabsContent>

          <TabsContent value="agents" className="space-y-6">
            {/* Card 1: Update Management (extracted component) */}
            <UpdateManagementCard userId={user?.id} />

            {/* Card 2: Configurações dos Agents */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Configurações dos Agents</CardTitle>
                <CardDescription>Configure o comportamento global dos agents de coleta</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loadingAgentSettings ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="heartbeatInterval">Intervalo de Heartbeat (segundos)</Label>
                        <Input
                          id="heartbeatInterval"
                          type="number"
                          min={60}
                          max={300}
                          value={agentHeartbeatInterval}
                          onChange={(e) => setAgentHeartbeatInterval(Number(e.target.value))}
                          className="w-[200px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          Define o intervalo entre check-ins dos agents. Valores menores detectam problemas 
                          mais rapidamente, mas aumentam o uso de recursos. Recomendado: 60-120 segundos.
                        </p>
                      </div>

                      <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                        <h4 className="font-medium text-sm">Sobre o Heartbeat</h4>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Agents reportam status e verificam tarefas pendentes a cada intervalo</li>
                          <li>Intervalos menores = detecção mais rápida de agents offline</li>
                          <li>Intervalos maiores = menor carga no servidor</li>
                          <li>A alteração afeta todos os agents na próxima sincronização</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={handleSaveAgentSettings} disabled={savingAgentSettings}>
                        {savingAgentSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        Salvar Configurações
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
