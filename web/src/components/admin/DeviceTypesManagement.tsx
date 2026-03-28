import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Package, Loader2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

interface DeviceType {
  id: string;
  vendor: string;
  name: string;
  code: string;
  category: string;
  icon: string | null;
  is_active: boolean;
  created_at: string;
}

type DeviceCategory = 'firewall' | 'cloud' | 'external';
type DbDeviceCategory = 'firewall' | 'router' | 'switch' | 'server' | 'wlc' | 'other';

// Map our UI categories to database categories
const categoryToDbCategory: Record<DeviceCategory, DbDeviceCategory> = {
  firewall: 'firewall',
  cloud: 'server', // Map cloud to server for now
  external: 'other', // Map external to other
};

interface Props {
  category: DeviceCategory;
}

const ICON_OPTIONS = [
  'Shield', 'Server', 'Cloud', 'Network', 'Lock', 'Cpu', 
  'HardDrive', 'Wifi', 'Globe', 'Database', 'Monitor', 'Activity'
];

export function DeviceTypesManagement({ category }: Props) {
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceType | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    vendor: '',
    name: '',
    code: '',
    icon: 'Shield',
    is_active: true,
  });

  useEffect(() => {
    fetchDeviceTypes();
  }, [category]);

  const fetchDeviceTypes = async () => {
    setLoading(true);
    try {
      const dbCategory = categoryToDbCategory[category];
      const { data, error } = await supabase
        .from('device_types')
        .select('*')
        .eq('category', dbCategory)
        .order('vendor', { ascending: true });

      if (error) throw error;
      setDeviceTypes(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar tipos de dispositivo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      vendor: '',
      name: '',
      code: '',
      icon: 'Shield',
      is_active: true,
    });
    setSelectedDevice(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (device: DeviceType) => {
    setSelectedDevice(device);
    setFormData({
      vendor: device.vendor,
      name: device.name,
      code: device.code,
      icon: device.icon || 'Shield',
      is_active: device.is_active,
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (device: DeviceType) => {
    setSelectedDevice(device);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.vendor || !formData.name || !formData.code) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      if (selectedDevice) {
        const { error } = await supabase
          .from('device_types')
          .update({
            vendor: formData.vendor,
            name: formData.name,
            code: formData.code,
            icon: formData.icon,
            is_active: formData.is_active,
          })
          .eq('id', selectedDevice.id);

        if (error) throw error;
        toast.success('Tipo de dispositivo atualizado');
      } else {
        const dbCategory = categoryToDbCategory[category];
        const { error } = await supabase
          .from('device_types')
          .insert({
            vendor: formData.vendor,
            name: formData.name,
            code: formData.code,
            category: dbCategory,
            icon: formData.icon,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast.success('Tipo de dispositivo criado');
      }

      setDialogOpen(false);
      resetForm();
      fetchDeviceTypes();
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDevice) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('device_types')
        .delete()
        .eq('id', selectedDevice.id);

      if (error) throw error;
      toast.success('Tipo de dispositivo excluído');
      setDeleteDialogOpen(false);
      setSelectedDevice(null);
      fetchDeviceTypes();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getIconComponent = (iconName: string | null) => {
    if (!iconName) return <Package className="w-5 h-5" />;
    const Icon = (LucideIcons as any)[iconName];
    return Icon ? <Icon className="w-5 h-5" /> : <Package className="w-5 h-5" />;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Tipos de Dispositivos
        </CardTitle>
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Novo Tipo
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : deviceTypes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum tipo de dispositivo cadastrado para esta categoria.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ícone</TableHead>
                <TableHead>Fabricante</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deviceTypes.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>{getIconComponent(device.icon)}</TableCell>
                  <TableCell className="font-medium">{device.vendor}</TableCell>
                  <TableCell>{device.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{device.code}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={device.is_active ? 'default' : 'secondary'}>
                      {device.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(device)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(device)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedDevice ? 'Editar Tipo de Dispositivo' : 'Novo Tipo de Dispositivo'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="vendor">Fabricante *</Label>
                <Input
                  id="vendor"
                  value={formData.vendor}
                  onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                  placeholder="Ex: Fortinet, Palo Alto, Microsoft"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Dispositivo *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: FortiGate, Azure AD"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Código Único *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  placeholder="Ex: fortigate, entra_id"
                />
                <p className="text-xs text-muted-foreground">
                  Identificador único usado internamente
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="icon">Ícone</Label>
                <Select
                  value={formData.icon}
                  onValueChange={(value) => setFormData({ ...formData, icon: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>
                        <div className="flex items-center gap-2">
                          {getIconComponent(icon)}
                          <span>{icon}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                {selectedDevice ? 'Salvar Alterações' : 'Criar'}
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
              Tem certeza que deseja excluir o tipo de dispositivo{' '}
              <strong>{selectedDevice?.name}</strong>?
            </p>
            <p className="text-sm text-destructive">
              Esta ação não pode ser desfeita. Blueprints e regras associados também podem ser afetados.
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
