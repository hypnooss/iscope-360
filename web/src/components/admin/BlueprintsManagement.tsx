import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FileCode, Loader2, ChevronDown, ChevronRight, Copy, Eye } from 'lucide-react';

interface DeviceType {
  id: string;
  vendor: string;
  name: string;
  code: string;
}

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
  device_types?: DeviceType;
}

type DeviceCategory = 'firewall' | 'cloud' | 'external';
type DbDeviceCategory = 'firewall' | 'router' | 'switch' | 'server' | 'wlc' | 'other';

const categoryToDbCategory: Record<DeviceCategory, DbDeviceCategory> = {
  firewall: 'firewall',
  cloud: 'server',
  external: 'other',
};

interface Props {
  category: DeviceCategory;
}

export function BlueprintsManagement({ category }: Props) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  const [expandedBlueprints, setExpandedBlueprints] = useState<Record<string, boolean>>({});

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    device_type_id: '',
    version: 'any',
    collection_steps: '{"steps": []}',
    is_active: true,
  });

  useEffect(() => {
    fetchData();
  }, [category]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch device types for this category
      const dbCategory = categoryToDbCategory[category];
      const { data: types, error: typesError } = await supabase
        .from('device_types')
        .select('id, vendor, name, code')
        .eq('category', dbCategory)
        .eq('is_active', true)
        .order('vendor', { ascending: true });

      if (typesError) throw typesError;
      setDeviceTypes(types || []);

      // Fetch blueprints for device types in this category
      if (types && types.length > 0) {
        const typeIds = types.map(t => t.id);
        const { data: bps, error: bpsError } = await supabase
          .from('device_blueprints')
          .select('*, device_types(id, vendor, name, code)')
          .in('device_type_id', typeIds)
          .order('name', { ascending: true });

        if (bpsError) throw bpsError;
        // Cast to handle JSON type from Supabase
        setBlueprints((bps || []).map(bp => ({
          ...bp,
          collection_steps: bp.collection_steps as unknown as CollectionSteps,
        })));
      } else {
        setBlueprints([]);
      }
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
      device_type_id: deviceTypes[0]?.id || '',
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
      device_type_id: blueprint.device_type_id,
      version: blueprint.version,
      collection_steps: JSON.stringify(blueprint.collection_steps, null, 2),
      is_active: blueprint.is_active,
    });
    setDialogOpen(true);
  };

  const openViewDialog = (blueprint: Blueprint) => {
    setSelectedBlueprint(blueprint);
    setViewDialogOpen(true);
  };

  const openDeleteDialog = (blueprint: Blueprint) => {
    setSelectedBlueprint(blueprint);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.device_type_id) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    let parsedSteps;
    try {
      parsedSteps = JSON.parse(formData.collection_steps);
    } catch (e) {
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
            device_type_id: formData.device_type_id,
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
            device_type_id: formData.device_type_id,
            version: formData.version,
            collection_steps: parsedSteps,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast.success('Blueprint criado');
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
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
      fetchData();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (blueprint: Blueprint) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('device_blueprints')
        .insert({
          name: `${blueprint.name} (Cópia)`,
          description: blueprint.description,
          device_type_id: blueprint.device_type_id,
          version: blueprint.version,
          collection_steps: blueprint.collection_steps as unknown as Record<string, any>,
          is_active: false,
        });

      if (error) throw error;
      toast.success('Blueprint duplicado');
      fetchData();
    } catch (error: any) {
      toast.error('Erro ao duplicar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedBlueprints(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const getStepsCount = (blueprint: Blueprint | null) => {
    if (!blueprint) return 0;
    return blueprint.collection_steps?.steps?.length || 0;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <FileCode className="w-5 h-5 text-primary" />
          Blueprints de Coleta
        </CardTitle>
        <Button onClick={openCreateDialog} size="sm" disabled={deviceTypes.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Blueprint
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : deviceTypes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Cadastre um tipo de dispositivo primeiro para criar blueprints.
          </div>
        ) : blueprints.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum blueprint cadastrado para esta categoria.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Dispositivo</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blueprints.map((blueprint) => (
                <>
                  <TableRow key={blueprint.id}>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6"
                        onClick={() => toggleExpanded(blueprint.id)}
                      >
                        {expandedBlueprints[blueprint.id] ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{blueprint.name}</TableCell>
                    <TableCell>
                      {blueprint.device_types?.name || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{blueprint.version}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getStepsCount(blueprint)} steps</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={blueprint.is_active ? 'default' : 'secondary'}>
                        {blueprint.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openViewDialog(blueprint)}
                          title="Visualizar"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(blueprint)}
                          title="Duplicar"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(blueprint)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(blueprint)}
                          className="text-destructive hover:text-destructive"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedBlueprints[blueprint.id] && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/30">
                        <div className="p-3">
                          <p className="text-sm text-muted-foreground mb-2">
                            {blueprint.description || 'Sem descrição'}
                          </p>
                          <div className="text-xs font-mono bg-background p-2 rounded border max-h-40 overflow-auto">
                            <pre>{JSON.stringify(blueprint.collection_steps, null, 2)}</pre>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: FortiGate Standard Compliance"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="device_type_id">Tipo de Dispositivo *</Label>
                  <Select
                    value={formData.device_type_id}
                    onValueChange={(value) => setFormData({ ...formData, device_type_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {deviceTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.vendor} - {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="version">Versão Compatível</Label>
                  <Input
                    id="version"
                    value={formData.version}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    placeholder="Ex: any, 7.x, 6.4"
                  />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label htmlFor="is_active">Ativo</Label>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="collection_steps">Collection Steps (JSON)</Label>
                <Textarea
                  id="collection_steps"
                  value={formData.collection_steps}
                  onChange={(e) => setFormData({ ...formData, collection_steps: e.target.value })}
                  placeholder='{"steps": [...]}'
                  rows={12}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Estrutura: {`{"steps": [{"id": "step_name", "executor": "http_request|ssh|snmp", "config": {...}}]}`}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {selectedBlueprint ? 'Salvar Alterações' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Blueprint: {selectedBlueprint?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Dispositivo:</span>{' '}
                  <strong>{selectedBlueprint?.device_types?.name}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Versão:</span>{' '}
                  <code className="bg-muted px-2 py-0.5 rounded">{selectedBlueprint?.version}</code>
                </div>
              </div>
              {selectedBlueprint?.description && (
                <p className="text-sm text-muted-foreground">{selectedBlueprint.description}</p>
              )}
              <div className="space-y-2">
                <Label>Collection Steps ({getStepsCount(selectedBlueprint!)} steps)</Label>
                <div className="font-mono text-xs bg-muted p-4 rounded-lg border overflow-auto max-h-96">
                  <pre>{JSON.stringify(selectedBlueprint?.collection_steps, null, 2)}</pre>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">
              Tem certeza que deseja excluir o blueprint{' '}
              <strong>{selectedBlueprint?.name}</strong>?
            </p>
            <p className="text-sm text-destructive">
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
      </CardContent>
    </Card>
  );
}
