import { useState, useEffect, useMemo } from 'react';
import { getDeviceUrlError } from '@/lib/urlValidation';
import { resolveGeoFromUrl } from '@/lib/geolocation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PasswordInput } from '@/components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Server, MapPin, Loader2, Cloud } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
}

interface DeviceType {
  id: string;
  name: string;
  vendor: string;
  code: string;
}

interface Agent {
  id: string;
  name: string;
  client_id: string;
}

type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'manual';

interface AddFirewallDialogProps {
  clients: Client[];
  onFirewallAdded: (firewall: {
    name: string;
    description: string;
    fortigate_url: string;
    api_key: string;
    auth_username?: string;
    auth_password?: string;
    client_id: string;
    schedule: ScheduleFrequency;
    device_type_id: string;
    agent_id: string;
    geo_latitude?: number | null;
    geo_longitude?: number | null;
  }) => Promise<void>;
}

// Device types that use session-based auth (username/password) instead of API key
const SESSION_AUTH_DEVICE_CODES = ['sonicwall_tz', 'sonicwall_nsa', 'sonicwall'];

export function AddFirewallDialog({ clients, onFirewallAdded }: AddFirewallDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    fortigate_url: '',
    api_key: '',
    auth_username: '',
    auth_password: '',
    client_id: '',
    schedule: 'manual' as ScheduleFrequency,
    device_type_id: '',
    agent_id: '',
    geo_latitude: '',
    geo_longitude: '',
    cloud_public_ip: '',
  });

  const [showCloudIP, setShowCloudIP] = useState(false);

  // Determine if selected device uses session auth
  const selectedDeviceType = useMemo(() => {
    return deviceTypes.find(dt => dt.id === formData.device_type_id);
  }, [deviceTypes, formData.device_type_id]);

  const usesSessionAuth = useMemo(() => {
    return selectedDeviceType && SESSION_AUTH_DEVICE_CODES.some(code => 
      selectedDeviceType.code.toLowerCase().includes(code.toLowerCase())
    );
  }, [selectedDeviceType]);

  // Fetch device types on mount
  useEffect(() => {
    const fetchDeviceTypes = async () => {
      const { data } = await supabase
        .from('device_types')
        .select('id, name, vendor, code')
        .eq('is_active', true)
        .eq('category', 'firewall')
        .order('vendor');
      if (data) setDeviceTypes(data);
    };
    fetchDeviceTypes();
  }, []);

  // Fetch agents when client changes
  useEffect(() => {
    const fetchAgents = async () => {
      if (!formData.client_id) {
        setAgents([]);
        return;
      }
      const { data } = await supabase
        .from('agents')
        .select('id, name, client_id')
        .eq('client_id', formData.client_id)
        .eq('revoked', false)
        .order('name');
      if (data) setAgents(data);
    };
    fetchAgents();
  }, [formData.client_id]);

  // Reset auth fields when device type changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      api_key: '',
      auth_username: '',
      auth_password: '',
    }));
  }, [formData.device_type_id]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      fortigate_url: '',
      api_key: '',
      auth_username: '',
      auth_password: '',
      client_id: '',
      schedule: 'manual',
      device_type_id: '',
      agent_id: '',
      geo_latitude: '',
      geo_longitude: '',
      cloud_public_ip: '',
    });
    setShowCloudIP(false);
  };

  const handleFetchLocation = async () => {
    if (!formData.fortigate_url) {
      toast.error('Preencha a URL do dispositivo primeiro');
      return;
    }
    setGeoLoading(true);
    try {
      const geo = await resolveGeoFromUrl(formData.fortigate_url);
      if (geo) {
        setFormData(prev => ({ ...prev, geo_latitude: String(geo.lat), geo_longitude: String(geo.lng) }));
        toast.success('Localização encontrada');
      } else {
        toast.error('Não foi possível determinar a localização');
      }
    } catch {
      toast.error('Erro ao buscar localização');
    } finally {
      setGeoLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onFirewallAdded({
        ...formData,
        api_key: usesSessionAuth ? '' : formData.api_key,
        auth_username: usesSessionAuth ? formData.auth_username : undefined,
        auth_password: usesSessionAuth ? formData.auth_password : undefined,
        geo_latitude: formData.geo_latitude ? parseFloat(formData.geo_latitude) : null,
        geo_longitude: formData.geo_longitude ? parseFloat(formData.geo_longitude) : null,
        cloud_public_ip: formData.cloud_public_ip?.trim() || undefined,
      } as any);
      setOpen(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const getUrlLabel = () => {
    if (selectedDeviceType?.vendor?.toLowerCase().includes('sonicwall')) {
      return 'URL do SonicWall';
    }
    return 'URL do FortiGate';
  };

  const getUrlPlaceholder = () => {
    if (selectedDeviceType?.vendor?.toLowerCase().includes('sonicwall')) {
      return 'https://192.168.1.1:4444';
    }
    return 'https://192.168.1.1:8443';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Firewall
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Adicionar Firewall
          </DialogTitle>
          <DialogDescription>
            Cadastre um novo dispositivo para monitoramento
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2 px-6">
            {/* Cliente */}
            <div className="space-y-2">
              <Label htmlFor="fw-client">Cliente *</Label>
              <Select
                value={formData.client_id}
                onValueChange={(v) => setFormData({ ...formData, client_id: v, agent_id: '' })}
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

            {/* Device Type */}
            <div className="space-y-2">
              <Label htmlFor="fw-device-type">Tipo de Dispositivo *</Label>
              <Select
                value={formData.device_type_id}
                onValueChange={(v) => setFormData({ ...formData, device_type_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {deviceTypes.map((dt) => (
                    <SelectItem key={dt.id} value={dt.id}>
                      {dt.vendor} - {dt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agent */}
            <div className="space-y-2">
              <Label htmlFor="fw-agent">Agent *</Label>
              <Select
                value={formData.agent_id}
                onValueChange={(v) => setFormData({ ...formData, agent_id: v })}
                disabled={!formData.client_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formData.client_id ? "Selecione o agent" : "Selecione um cliente primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.client_id && agents.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum agent disponível para este cliente</p>
              )}
            </div>

            {/* Nome */}
            <div className="space-y-2">
              <Label htmlFor="fw-name">Nome do Firewall *</Label>
              <Input
                id="fw-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: FW-HQ-01"
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="fw-url">{getUrlLabel()} *</Label>
              <Input
                id="fw-url"
                value={formData.fortigate_url}
                onChange={(e) => {
                  const newUrl = e.target.value;
                  setFormData({ ...formData, fortigate_url: newUrl });
                  setUrlError(getDeviceUrlError(newUrl));
                }}
                placeholder={getUrlPlaceholder()}
                className={urlError ? 'border-destructive' : ''}
              />
              {urlError && (
                <p className="text-sm text-destructive">{urlError}</p>
              )}
              {/* Cloud Public IP toggle */}
              {!showCloudIP && (
                <button
                  type="button"
                  onClick={() => setShowCloudIP(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                >
                  <Cloud className="w-3 h-3" />
                  Firewall em Cloud?
                </button>
              )}
              {showCloudIP && (
                <div className="space-y-1.5 mt-2 p-3 rounded-lg border border-border bg-muted/20">
                  <Label className="text-xs">IP Público da Cloud</Label>
                  <Input
                    value={formData.cloud_public_ip}
                    onChange={(e) => setFormData({ ...formData, cloud_public_ip: e.target.value })}
                    placeholder="Ex: 203.0.113.50"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Informe o IP público atribuído pela cloud provider.
                  </p>
                </div>
              )}
            </div>

            {/* Geolocation */}
            <div className="space-y-2">
              <Label>Localização (opcional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="any"
                  value={formData.geo_latitude}
                  onChange={(e) => setFormData({ ...formData, geo_latitude: e.target.value })}
                  placeholder="Latitude"
                  className="flex-1"
                />
                <Input
                  type="number"
                  step="any"
                  value={formData.geo_longitude}
                  onChange={(e) => setFormData({ ...formData, geo_longitude: e.target.value })}
                  placeholder="Longitude"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleFetchLocation}
                  disabled={geoLoading || !formData.fortigate_url}
                  title="Buscar localização a partir da URL"
                >
                  {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                </Button>
              </div>
              {formData.geo_latitude && formData.geo_longitude && (
                <p className="text-xs text-muted-foreground">📍 {formData.geo_latitude}, {formData.geo_longitude}</p>
              )}
            </div>

            {/* Conditional Auth Fields */}
            {usesSessionAuth ? (
              <>
                {/* Username */}
                <div className="space-y-2">
                  <Label htmlFor="fw-username">Usuário *</Label>
                  <Input
                    id="fw-username"
                    value={formData.auth_username}
                    onChange={(e) => setFormData({ ...formData, auth_username: e.target.value })}
                    placeholder="admin"
                  />
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="fw-password">Senha *</Label>
                  <PasswordInput
                    id="fw-password"
                    value={formData.auth_password}
                    onChange={(e) => setFormData({ ...formData, auth_password: e.target.value })}
                    placeholder="Senha do dispositivo"
                  />
                </div>
              </>
            ) : (
              /* API Key */
              <div className="space-y-2">
                <Label htmlFor="fw-api">API Key *</Label>
                <PasswordInput
                  id="fw-api"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="Token da REST API"
                />
              </div>
            )}

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="fw-desc">Descrição</Label>
              <Textarea
                id="fw-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição opcional do firewall"
              />
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <Label htmlFor="fw-schedule">Frequência de Análise</Label>
              <Select
                value={formData.schedule}
                onValueChange={(v) => setFormData({ ...formData, schedule: v as ScheduleFrequency })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="daily">Diário</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !!urlError || !formData.fortigate_url}>
            {saving ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
