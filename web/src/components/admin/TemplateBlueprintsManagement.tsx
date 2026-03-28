import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FileCode, Loader2, Copy, Eye } from 'lucide-react';

interface CollectionSteps {
  steps: Array<{
    id: string;
    executor: string;
    config: Record<string, any>;
  }>;
}

interface Blueprint {
  id: string;
  name: string;
  description: string | null;
  device_type_id: string;
  version: string;
  collection_steps: CollectionSteps;
  is_active: boolean;
  created_at: string;
}

interface Props {
  deviceTypeId: string;
  deviceTypeName: string;
  onRefresh?: () => void;
}

export function TemplateBlueprintsManagement({ deviceTypeId, deviceTypeName, onRefresh }: Props) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: 'any',
    collection_steps: '{"steps": []}',
    is_active: true,
  });

  useEffect(() => {
    fetchBlueprints();
  }, [deviceTypeId]);

  const fetchBlueprints = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('device_blueprints')
        .select('*')
        .eq('device_type_id', deviceTypeId)
        .order('name', { ascending: true });

      if (error) throw error;
      setBlueprints((data || []).map(bp => ({
        ...bp,
        collection_steps: bp.collection_steps as unknown as CollectionSteps,
      })));
    } catch (error: any) {
      toast.error('Erro ao carregar blueprints: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      version: 'any',
      collection_steps: '{"steps": []}',
      is_active: true,
    });
    setSelectedBlueprint(null);
  };

  const handleOpenDialog = (blueprint?: Blueprint) => {
    if (blueprint) {
      setSelectedBlueprint(blueprint);
      setFormData({
        name: blueprint.name,
        description: blueprint.description || '',
        version: blueprint.version,
        collection_steps: JSON.stringify(blueprint.collection_steps, null, 2),
        is_active: blueprint.is_active,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleDuplicate = (blueprint: Blueprint) => {
    setSelectedBlueprint(null);
    setFormData({
      name: `${blueprint.name} (Cópia)`,
      description: blueprint.description || '',
      version: blueprint.version,
      collection_steps: JSON.stringify(blueprint.collection_steps, null, 2),
      is_active: false,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Nome é obrigatório');
      return;
    }

    let parsedSteps;
    try {
      parsedSteps = JSON.parse(formData.collection_steps);
    } catch {
      toast.error('JSON de steps inválido');
      return;
    }

    setSaving(true);
    try {
      const blueprintData = {
        name: formData.name,
        description: formData.description || null,
        version: formData.version,
        collection_steps: parsedSteps,
        is_active: formData.is_active,
        device_type_id: deviceTypeId,
      };

      if (selectedBlueprint) {
        const { error } = await supabase
          .from('device_blueprints')
          .update(blueprintData)
          .eq('id', selectedBlueprint.id);
        if (error) throw error;
        toast.success('Blueprint atualizado');
      } else {
        const { error } = await supabase
          .from('device_blueprints')
          .insert(blueprintData);
        if (error) throw error;
        toast.success('Blueprint criado');
      }

      setDialogOpen(false);
      resetForm();
      fetchBlueprints();
      onRefresh?.();
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBlueprint) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('device_blueprints')
        .delete()
        .eq('id', selectedBlueprint.id);

      if (error) throw error;
      toast.success('Blueprint excluído');
      setDeleteDialogOpen(false);
      setSelectedBlueprint(null);
      fetchBlueprints();
      onRefresh?.();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Novo Blueprint
        </Button>
      </div>

      {blueprints.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-lg">
          <FileCode className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Nenhum blueprint encontrado</p>
          <Button variant="outline" className="mt-4" onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Criar primeiro blueprint
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {blueprints.map((blueprint) => (
            <Card key={blueprint.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileCode className="w-5 h-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">{blueprint.name}</CardTitle>
                      {blueprint.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {blueprint.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{blueprint.version}</Badge>
                    <Badge variant={blueprint.is_active ? 'default' : 'secondary'}>
                      {blueprint.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedBlueprint(blueprint);
                          setViewDialogOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDuplicate(blueprint)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(blueprint)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedBlueprint(blueprint);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xs text-muted-foreground mb-2">
                  {blueprint.collection_steps.steps.length} steps de coleta
                </div>
                <ScrollArea className="h-64 w-full rounded border bg-muted/30">
                  <pre className="p-3 text-xs font-mono">
                    {JSON.stringify(blueprint.collection_steps, null, 2)}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedBlueprint ? 'Editar Blueprint' : 'Novo Blueprint'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={`Ex: ${deviceTypeName} - Coleta Padrão`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do blueprint"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="version">Versão</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="Ex: any, 7.0+, 6.4"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collection_steps">Collection Steps (JSON)</Label>
              <Textarea
                id="collection_steps"
                value={formData.collection_steps}
                onChange={(e) => setFormData({ ...formData, collection_steps: e.target.value })}
                placeholder='{"steps": []}'
                rows={12}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Ativo</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {selectedBlueprint ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Blueprint</DialogTitle>
          </DialogHeader>
          {selectedBlueprint && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Nome</Label>
                  <p className="font-medium">{selectedBlueprint.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Versão</Label>
                  <p>{selectedBlueprint.version}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Descrição</Label>
                <p>{selectedBlueprint.description || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Collection Steps</Label>
                <ScrollArea className="h-64 w-full rounded border bg-muted/30 mt-2">
                  <pre className="p-3 text-xs font-mono">
                    {JSON.stringify(selectedBlueprint.collection_steps, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Blueprint</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Tem certeza que deseja excluir o blueprint <strong>{selectedBlueprint?.name}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
