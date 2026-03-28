import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Copy, FileCode } from 'lucide-react';

interface CollectionSteps {
  steps: Array<{
    id: string;
    executor: string;
    config: Record<string, unknown>;
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
  blueprints: Blueprint[];
  onRefresh: () => void;
}

export function BlueprintsTable({ deviceTypeId, blueprints, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    version: 'any',
    collection_steps: '{"steps": []}',
    is_active: true,
  });

  const getStepsCount = (blueprint: Blueprint) => {
    return blueprint.collection_steps?.steps?.length || 0;
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

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (blueprint: Blueprint) => {
    setSelectedBlueprint(blueprint);
    setFormData({
      name: blueprint.name,
      description: blueprint.description || '',
      version: blueprint.version,
      collection_steps: JSON.stringify(blueprint.collection_steps, null, 2),
      is_active: blueprint.is_active,
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (blueprint: Blueprint) => {
    setSelectedBlueprint(blueprint);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Preencha o nome do blueprint');
      return;
    }

    let parsedSteps;
    try {
      parsedSteps = JSON.parse(formData.collection_steps);
    } catch {
      toast.error('JSON de collection_steps inválido');
      return;
    }

    setSaving(true);
    try {
      if (selectedBlueprint) {
        const { error } = await supabase
          .from('device_blueprints')
          .update({
            name: formData.name,
            description: formData.description || null,
            version: formData.version,
            collection_steps: parsedSteps,
            is_active: formData.is_active,
          })
          .eq('id', selectedBlueprint.id);

        if (error) throw error;
        toast.success('Blueprint atualizado');
      } else {
        const { error } = await supabase
          .from('device_blueprints')
          .insert({
            name: formData.name,
            description: formData.description || null,
            device_type_id: deviceTypeId,
            version: formData.version,
            collection_steps: parsedSteps,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast.success('Blueprint criado');
      }

      setDialogOpen(false);
      resetForm();
      onRefresh();
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBlueprint) return;

    // Verificar se é o único blueprint ativo
    const activeBlueprintsCount = blueprints.filter(bp => bp.is_active).length;
    if (selectedBlueprint.is_active && activeBlueprintsCount === 1) {
      toast.error('Não é possível excluir o único blueprint ativo. Desative-o ou crie outro blueprint ativo primeiro.');
      setDeleteDialogOpen(false);
      return;
    }

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
      onRefresh();
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao excluir: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (blueprint: Blueprint) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('device_blueprints')
        .insert([{
          name: `${blueprint.name} (Cópia)`,
          description: blueprint.description,
          device_type_id: blueprint.device_type_id,
          version: blueprint.version,
          collection_steps: JSON.parse(JSON.stringify(blueprint.collection_steps)),
          is_active: false,
        }]);

      if (error) throw error;
      toast.success('Blueprint duplicado');
      onRefresh();
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao duplicar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure os blueprints de coleta de dados para esta tarefa.
        </p>
        <Button onClick={openCreateDialog} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Novo Blueprint
        </Button>
      </div>

      {blueprints.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-border/50 rounded-lg">
          <FileCode className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>Nenhum blueprint cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {blueprints.map((blueprint) => (
            <div key={blueprint.id} className="border rounded-lg border-border/50 p-4 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">{blueprint.name}</h4>
                  {blueprint.description && (
                    <p className="text-sm text-muted-foreground mt-1">{blueprint.description}</p>
                  )}
                </div>
                <Badge variant={blueprint.is_active ? 'default' : 'secondary'}>
                  {blueprint.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              
              {/* Metadados */}
              <div className="flex items-center gap-4 text-sm">
                <span>Versão: <code className="bg-muted px-2 py-0.5 rounded">{blueprint.version}</code></span>
                <Badge variant="outline">{getStepsCount(blueprint)} steps</Badge>
              </div>
              
              {/* JSON Content */}
              <ScrollArea className="h-[200px] rounded-md border border-border/50 bg-muted/30 p-3">
                <pre className="text-xs font-mono">
                  {JSON.stringify(blueprint.collection_steps, null, 2)}
                </pre>
              </ScrollArea>
              
              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleDuplicate(blueprint)} disabled={saving}>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEditDialog(blueprint)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar
                </Button>
                <Button variant="outline" size="sm" onClick={() => openDeleteDialog(blueprint)} className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedBlueprint ? 'Editar Blueprint' : 'Novo Blueprint'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: External DNS Collection"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="version">Versão</Label>
                <Input
                  id="version"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="Ex: any, 7.x, 1.0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição do blueprint..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="collection_steps">Collection Steps (JSON)</Label>
              <Textarea
                id="collection_steps"
                value={formData.collection_steps}
                onChange={(e) => setFormData({ ...formData, collection_steps: e.target.value })}
                className="font-mono text-xs"
                rows={10}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="border-border">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            Tem certeza que deseja excluir o blueprint <strong>{selectedBlueprint?.name}</strong>?
            Esta ação não pode ser desfeita.
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
