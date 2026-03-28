import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Edit, Trash2, Layers, Shield, Cloud, Network, Server, LayoutDashboard, Globe, Database, Lock, Zap, Activity, Monitor, Cpu, HardDrive, Wifi } from 'lucide-react';
import { toast } from 'sonner';

interface Module {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
}

const ICON_OPTIONS = [
  { value: 'Shield', label: 'Shield (Segurança)', icon: Shield },
  { value: 'Cloud', label: 'Cloud (Nuvem)', icon: Cloud },
  { value: 'Network', label: 'Network (Rede)', icon: Network },
  { value: 'Server', label: 'Server (Servidor)', icon: Server },
  { value: 'Layers', label: 'Layers (Camadas)', icon: Layers },
  { value: 'LayoutDashboard', label: 'Dashboard', icon: LayoutDashboard },
  { value: 'Globe', label: 'Globe (Globo)', icon: Globe },
  { value: 'Database', label: 'Database (Banco de Dados)', icon: Database },
  { value: 'Lock', label: 'Lock (Cadeado)', icon: Lock },
  { value: 'Zap', label: 'Zap (Raio)', icon: Zap },
  { value: 'Activity', label: 'Activity (Atividade)', icon: Activity },
  { value: 'Monitor', label: 'Monitor', icon: Monitor },
  { value: 'Cpu', label: 'CPU', icon: Cpu },
  { value: 'HardDrive', label: 'Hard Drive (Disco)', icon: HardDrive },
  { value: 'Wifi', label: 'Wifi', icon: Wifi },
];

const COLOR_OPTIONS = [
  { value: 'text-primary', label: 'Primário', preview: 'bg-primary' },
  { value: 'text-orange-500', label: 'Laranja', preview: 'bg-orange-500' },
  { value: 'text-blue-500', label: 'Azul', preview: 'bg-blue-500' },
  { value: 'text-cyan-500', label: 'Ciano', preview: 'bg-cyan-500' },
  { value: 'text-purple-500', label: 'Roxo', preview: 'bg-purple-500' },
  { value: 'text-green-500', label: 'Verde', preview: 'bg-green-500' },
  { value: 'text-red-500', label: 'Vermelho', preview: 'bg-red-500' },
  { value: 'text-yellow-500', label: 'Amarelo', preview: 'bg-yellow-500' },
  { value: 'text-pink-500', label: 'Rosa', preview: 'bg-pink-500' },
  { value: 'text-indigo-500', label: 'Índigo', preview: 'bg-indigo-500' },
  { value: 'text-teal-500', label: 'Teal', preview: 'bg-teal-500' },
];

const getIconComponent = (iconName: string | null) => {
  const iconOption = ICON_OPTIONS.find(opt => opt.value === iconName);
  if (iconOption) {
    const IconComponent = iconOption.icon;
    return <IconComponent className="w-4 h-4" />;
  }
  return <Layers className="w-4 h-4" />;
};

export function ModulesManagement() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIcon, setFormIcon] = useState('Shield');
  const [formColor, setFormColor] = useState('text-primary');
  const [formIsActive, setFormIsActive] = useState(true);

  useEffect(() => {
    fetchModules();
  }, []);

  const fetchModules = async () => {
    try {
      const { data, error } = await supabase
        .from('modules')
        .select('*')
        .order('name');

      if (error) throw error;
      setModules(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar módulos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormIcon('Shield');
    setFormColor('text-primary');
    setFormIsActive(true);
    setEditingModule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (module: Module) => {
    setEditingModule(module);
    setFormCode(module.code);
    setFormName(module.name);
    setFormDescription(module.description || '');
    setFormIcon(module.icon || 'Shield');
    setFormColor(module.color || 'text-primary');
    setFormIsActive(module.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formCode.trim() || !formName.trim()) {
      toast.error('Código e Nome são obrigatórios');
      return;
    }

    // Validate code format
    if (!/^scope_[a-z0-9_]+$/.test(formCode)) {
      toast.error('Código deve começar com "scope_" e conter apenas letras minúsculas, números e underscores');
      return;
    }

    setSaving(true);
    try {
      if (editingModule) {
        // Update existing module
        const { error } = await supabase
          .from('modules')
          .update({
            name: formName.trim(),
            description: formDescription.trim() || null,
            icon: formIcon,
            color: formColor,
            is_active: formIsActive,
          })
          .eq('id', editingModule.id);

        if (error) throw error;
        toast.success('Módulo atualizado com sucesso!');
      } else {
        // Create new module - using type assertion since code is validated
        const { error } = await supabase
          .from('modules')
          .insert({
            code: formCode.trim() as any, // Type assertion needed for dynamic codes
            name: formName.trim(),
            description: formDescription.trim() || null,
            icon: formIcon,
            color: formColor,
            is_active: formIsActive,
          });

        if (error) throw error;
        toast.success('Módulo criado com sucesso!');
      }

      setDialogOpen(false);
      resetForm();
      fetchModules();
    } catch (error: any) {
      toast.error('Erro ao salvar módulo: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (module: Module) => {
    try {
      const { error } = await supabase
        .from('modules')
        .update({ is_active: !module.is_active })
        .eq('id', module.id);

      if (error) throw error;
      toast.success(`Módulo ${!module.is_active ? 'ativado' : 'desativado'}`);
      fetchModules();
    } catch (error: any) {
      toast.error('Erro ao atualizar módulo: ' + error.message);
    }
  };

  const handleDelete = async (module: Module) => {
    if (!confirm(`Tem certeza que deseja excluir o módulo "${module.name}"? Usuários perderão acesso.`)) {
      return;
    }

    try {
      // First delete user_modules associations
      await supabase.from('user_modules').delete().eq('module_id', module.id);

      // Then delete the module
      const { error } = await supabase.from('modules').delete().eq('id', module.id);

      if (error) throw error;
      toast.success('Módulo excluído com sucesso!');
      fetchModules();
    } catch (error: any) {
      toast.error('Erro ao excluir módulo: ' + error.message);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Módulos do Sistema
            </CardTitle>
            <CardDescription>
              Gerencie os módulos disponíveis na plataforma
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Módulo
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : modules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum módulo cadastrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Módulo</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((module) => (
                <TableRow key={module.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={module.color || 'text-primary'}>
                        {getIconComponent(module.icon)}
                      </span>
                      <span className="font-medium">{module.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{module.code}</code>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {module.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={module.is_active ? 'default' : 'secondary'}>
                      {module.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(module)}
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(module)}
                        title={module.is_active ? 'Desativar' : 'Ativar'}
                      >
                        <Switch
                          checked={module.is_active}
                          className="pointer-events-none"
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(module)}
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
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
              <DialogTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                {editingModule ? 'Editar Módulo' : 'Novo Módulo'}
              </DialogTitle>
              <DialogDescription>
                {editingModule 
                  ? 'Altere as informações do módulo'
                  : 'Preencha os dados para criar um novo módulo'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código</Label>
                <Input
                  id="code"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toLowerCase())}
                  placeholder="scope_nome_modulo"
                  disabled={!!editingModule}
                />
                <p className="text-xs text-muted-foreground">
                  Deve começar com "scope_" (ex: scope_firewall, scope_network)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome do módulo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Descrição do módulo (opcional)"
                />
              </div>

              <div className="space-y-2">
                <Label>Ícone</Label>
                <Select value={formIcon} onValueChange={setFormIcon}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <option.icon className="w-4 h-4" />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cor</Label>
                <Select value={formColor} onValueChange={setFormColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded ${option.preview}`} />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Módulos inativos não aparecem para os usuários
                  </p>
                </div>
                <Switch
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingModule ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
