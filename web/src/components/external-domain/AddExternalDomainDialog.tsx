import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { getExternalDomainError } from '@/lib/urlValidation';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Globe, Plus } from 'lucide-react';

interface Client {
  id: string;
  name: string;
}

interface Agent {
  id: string;
  name: string;
  client_id: string | null;
}

export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'manual';

export interface AddExternalDomainPayload {
  client_id: string;
  agent_id: string;
  domain: string;
}

interface AddExternalDomainDialogProps {
  clients: Client[];
  onDomainAdded: (payload: AddExternalDomainPayload) => Promise<void>;
}

function normalizeExternalDomain(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      return parsed.host; // hostname + :port (se houver)
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export function AddExternalDomainDialog({ clients, onDomainAdded }: AddExternalDomainDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [domainError, setDomainError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    client_id: '',
    agent_id: '',
    domain: '',
  });

  useEffect(() => {
    const fetchAgents = async () => {
      if (!formData.client_id) {
        setAgents([]);
        return;
      }

      const { data, error } = await supabase
        .from('agents')
        .select('id, name, client_id')
        .eq('client_id', formData.client_id)
        .eq('revoked', false)
        .order('name');

      if (error) {
        console.error('Error fetching agents:', error);
        setAgents([]);
        return;
      }

      setAgents(data || []);
    };

    fetchAgents();
  }, [formData.client_id]);

  const canSubmit = useMemo(() => {
    return (
      !!formData.client_id &&
      !!formData.agent_id &&
      !!formData.domain.trim() &&
      !domainError
    );
  }, [formData.client_id, formData.agent_id, formData.domain, domainError]);

  const resetForm = () => {
    setFormData({
      client_id: '',
      agent_id: '',
      domain: '',
    });
    setAgents([]);
    setDomainError(null);
  };

  const handleSubmit = async () => {
    const normalizedDomain = normalizeExternalDomain(formData.domain);
    const validationError = getExternalDomainError(formData.domain);
    setDomainError(validationError);

    if (validationError) {
      toast.error('Domínio inválido', { description: validationError });
      return;
    }

    if (!formData.client_id || !formData.agent_id || !normalizedDomain) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      await onDomainAdded({
        client_id: formData.client_id,
        agent_id: formData.agent_id,
        domain: normalizedDomain,
      });

      setOpen(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar Domínio
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Adicionar Domínio Externo
          </DialogTitle>
          <DialogDescription>
            Cadastre um domínio para monitoramento e análise.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2 px-6">
            {/* Cliente */}
            <div className="space-y-2">
              <Label htmlFor="ext-client">Cliente *</Label>
              <Select
                value={formData.client_id}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, client_id: v, agent_id: '' }))}
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

            {/* Agent */}
            <div className="space-y-2">
              <Label htmlFor="ext-agent">Agent *</Label>
              <Select
                value={formData.agent_id}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, agent_id: v }))}
                disabled={!formData.client_id}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={formData.client_id ? 'Selecione o agent' : 'Selecione um cliente primeiro'}
                  />
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

            {/* Domínio */}
            <div className="space-y-2">
              <Label htmlFor="ext-domain">Domínio Externo *</Label>
              <Input
                id="ext-domain"
                value={formData.domain}
                onChange={(e) => {
                  const next = e.target.value;
                  setFormData((prev) => ({ ...prev, domain: next }));
                  setDomainError(getExternalDomainError(next));
                }}
                placeholder="example.com ou https://example.com"
                className={domainError ? 'border-destructive' : ''}
              />
              {domainError && <p className="text-sm text-destructive">{domainError}</p>}
            </div>

          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
