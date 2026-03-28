import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, RefreshCw, Shield, Upload, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Permission {
  id: string;
  permission_name: string;
  submodule: string;
  permission_type: string;
  description: string | null;
  test_url: string | null;
  is_required: boolean;
  created_at: string;
}

const SUBMODULE_LABELS: Record<string, string> = {
  entra_id: 'Entra ID',
  sharepoint: 'SharePoint',
  exchange: 'Exchange Online',
  defender: 'Defender',
  intune: 'Intune',
  teams: 'Teams',
};

const SUBMODULES = Object.keys(SUBMODULE_LABELS);

export function M365PermissionsManagement() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingManifest, setUpdatingManifest] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // New permission form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSubmodule, setNewSubmodule] = useState('entra_id');
  const [newDescription, setNewDescription] = useState('');
  const [newRequired, setNewRequired] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTestUrl, setNewTestUrl] = useState('');

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('m365_required_permissions')
        .select('*')
        .order('submodule')
        .order('permission_name');
      if (error) throw error;
      setPermissions(data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar permissões');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPermissions(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) { toast.error('Informe o nome da permissão'); return; }
    setAdding(true);
    try {
      const { error } = await supabase
        .from('m365_required_permissions')
        .insert([{
          permission_name: newName.trim(),
          submodule: newSubmodule as any,
          permission_type: 'Application',
          description: newDescription.trim() || null,
          test_url: newTestUrl.trim() || null,
          is_required: newRequired,
        }]);
      if (error) throw error;
      toast.success(`Permissão ${newName} adicionada`);
      setNewName(''); setNewDescription(''); setNewTestUrl(''); setShowForm(false);
      await loadPermissions();
    } catch (err: any) {
      toast.error(err.message?.includes('duplicate') ? 'Permissão já existe' : 'Erro ao adicionar');
    } finally {
      setAdding(false);
    }
  };

  const handleToggleRequired = async (id: string, current: boolean) => {
    setTogglingId(id);
    try {
      const { error } = await supabase
        .from('m365_required_permissions')
        .update({ is_required: !current })
        .eq('id', id);
      if (error) throw error;
      setPermissions(prev => prev.map(p => p.id === id ? { ...p, is_required: !current } : p));
    } catch {
      toast.error('Erro ao atualizar');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('m365_required_permissions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success(`${name} removida`);
      setPermissions(prev => prev.filter(p => p.id !== id));
    } catch {
      toast.error('Erro ao excluir');
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdateManifest = async () => {
    setUpdatingManifest(true);
    try {
      const { data, error } = await supabase.functions.invoke('ensure-exchange-permission');
      if (error) throw error;
      if (data?.added) {
        toast.success(`Manifesto atualizado: ${data.permissions?.join(', ')}`);
      } else {
        toast.info('Manifesto já está atualizado');
      }
    } catch (err: any) {
      toast.error('Erro ao atualizar manifesto: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setUpdatingManifest(false);
    }
  };

  // Group by submodule
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.submodule] = acc[p.submodule] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Permissões Microsoft 365
              </CardTitle>
              <CardDescription className="mt-2">
                Gerencie as permissões do Graph API e Directory Roles necessárias para conexão com tenants M365.
                Ao adicionar uma nova permissão, clique em "Atualizar Manifesto" para sincronizar com o Azure.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadPermissions} disabled={loading}>
                <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />
                Atualizar
              </Button>
              <Button size="sm" onClick={handleUpdateManifest} disabled={updatingManifest}>
                {updatingManifest ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Atualizar Manifesto
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{permissions.length} permissões configuradas</span>
                <span>•</span>
                <span className="text-green-500">{permissions.filter(p => p.is_required).length} obrigatórias</span>
                <span>•</span>
                <span>{permissions.filter(p => !p.is_required).length} opcionais</span>
              </div>

              {/* Grouped permissions */}
              {SUBMODULES.filter(s => grouped[s]?.length).map(submodule => (
                <div key={submodule} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{SUBMODULE_LABELS[submodule]}</h4>
                  <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                    {grouped[submodule].map(perm => (
                      <div key={perm.id} className="rounded-lg py-2.5 px-3 bg-muted/50 border border-border/50 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", perm.is_required ? "bg-green-500" : "bg-muted-foreground")} />
                            <span className="text-xs font-mono font-medium text-foreground truncate">{perm.permission_name}</span>
                            {perm.is_required ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/30 text-green-500">Obrigatória</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Opcional</Badge>
                            )}
                          </div>
                          {perm.description && <p className="text-xs text-muted-foreground pl-4 truncate">{perm.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Switch
                            checked={perm.is_required}
                            onCheckedChange={() => handleToggleRequired(perm.id, perm.is_required)}
                            disabled={togglingId === perm.id}
                            className="scale-75"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(perm.id, perm.permission_name)}
                            disabled={deletingId === perm.id}
                          >
                            {deletingId === perm.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Add form */}
              {showForm ? (
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="text-sm font-medium">Nova Permissão</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome da Permissão</Label>
                      <Input placeholder="Ex: Mail.Read" value={newName} onChange={e => setNewName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Submódulo</Label>
                      <Select value={newSubmodule} onValueChange={setNewSubmodule}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SUBMODULES.map(s => (
                            <SelectItem key={s} value={s}>{SUBMODULE_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input placeholder="Descrição da permissão" value={newDescription} onChange={e => setNewDescription(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>URL de Teste (Graph API)</Label>
                    <Input 
                      placeholder="https://graph.microsoft.com/v1.0/..." 
                      value={newTestUrl} 
                      onChange={e => setNewTestUrl(e.target.value)} 
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL do endpoint Graph API para validar esta permissão. Ex: https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/healthOverviews?$top=1
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={newRequired} onCheckedChange={setNewRequired} />
                    <Label>Obrigatória</Label>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAdd} disabled={adding}>
                      {adding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                      Adicionar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                      <XCircle className="w-4 h-4 mr-1" />Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Adicionar Permissão
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
