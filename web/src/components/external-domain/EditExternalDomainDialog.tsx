import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Pencil } from 'lucide-react';
import type { ExternalDomainRow } from '@/components/external-domain/ExternalDomainTable';

interface Agent {
  id: string;
  name: string;
  client_id: string | null;
}

interface Client {
  id: string;
  name: string;
}

interface EditExternalDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: ExternalDomainRow | null;
  clients: Client[];
  isSuperAdmin: boolean;
  onSave: (payload: { client_id?: string; agent_id: string }) => Promise<void>;
}

export function EditExternalDomainDialog({ 
  open, 
  onOpenChange, 
  domain, 
  clients,
  isSuperAdmin,
  onSave 
}: EditExternalDomainDialogProps) {
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  const [formData, setFormData] = useState({
    client_id: '',
    agent_id: '',
  });

  useEffect(() => {
    if (!open || !domain) return;

    setFormData({
      client_id: domain.client_id || '',
      agent_id: domain.agent_id || '',
    });
  }, [open, domain]);

  // Fetch agents when client_id changes
  useEffect(() => {
    const fetchAgents = async () => {
      const clientId = formData.client_id;
      if (!open || !clientId) {
        setAgents([]);
        return;
      }

      const { data, error } = await supabase
        .from('agents')
        .select('id, name, client_id')
        .eq('client_id', clientId)
        .eq('revoked', false)
        .order('name');

      if (error) {
        console.error('Error fetching agents:', error);
        setAgents([]);
        return;
      }

      setAgents((data || []) as Agent[]);
    };

    fetchAgents();
  }, [open, formData.client_id]);

  // Clear agent when workspace changes (only if changing to different workspace)
  const handleWorkspaceChange = (newClientId: string) => {
    if (newClientId !== formData.client_id) {
      setFormData((prev) => ({ 
        ...prev, 
        client_id: newClientId,
        agent_id: '' // Reset agent when workspace changes
      }));
    }
  };

  const canSubmit = useMemo(() => {
    return !!formData.agent_id;
  }, [formData.agent_id]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const payload: { client_id?: string; agent_id: string } = {
        agent_id: formData.agent_id,
      };
      
      // Include client_id only if super admin changed it
      if (isSuperAdmin && formData.client_id !== domain?.client_id) {
        payload.client_id = formData.client_id;
      }
      
      await onSave(payload);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const currentWorkspaceName = useMemo(() => {
    return clients.find(c => c.id === domain?.client_id)?.name || domain?.client_name || 'N/A';
  }, [clients, domain]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5" />
            Editar Domínio Externo
          </DialogTitle>
          <DialogDescription>Atualize o agent e a frequência de análise.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2 px-6">
            <div className="space-y-2">
              <Label>Workspace</Label>
              {isSuperAdmin ? (
                <Select
                  value={formData.client_id}
                  onValueChange={handleWorkspaceChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={currentWorkspaceName} disabled />
              )}
            </div>

            <div className="space-y-2">
              <Label>Domínio</Label>
              <Input value={domain?.domain || ''} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-ext-agent">Agent *</Label>
              <Select
                value={formData.agent_id}
                onValueChange={(v) => setFormData((p) => ({ ...p, agent_id: v }))}
                disabled={!formData.client_id}
              >
                <SelectTrigger id="edit-ext-agent">
                  <SelectValue placeholder={formData.client_id ? 'Selecione o agent' : 'Selecione um workspace primeiro'} />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.client_id && agents.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum agent disponível para este workspace</p>
              )}
            </div>

          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSubmit}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
