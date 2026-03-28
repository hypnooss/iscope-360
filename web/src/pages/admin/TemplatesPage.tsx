import { useEffect, useState, useMemo } from 'react';
import { formatDateTimeBR } from '@/lib/dateUtils';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { TemplatePipelineFlow } from '@/components/admin/TemplatePipelineFlow';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import {
  Shield,
  Globe,
  Server,
  Layers,
  Loader2,
  Eye,
  Pencil,
  Plus,
  Cloud,
  Network,
  Lock,
  Cpu,
  HardDrive,
  Wifi,
  Database,
  Monitor,
  Activity,
  Router,
  Box,
  Package,
  Search,
  type LucideIcon,
} from 'lucide-react';

// Map icon names to components
const iconComponents: Record<string, LucideIcon> = {
  Shield,
  Server,
  Cloud,
  Network,
  Lock,
  Cpu,
  HardDrive,
  Wifi,
  Globe,
  Database,
  Monitor,
  Activity,
  Router,
  Layers,
  Box,
  Package,
};

const ICON_OPTIONS = Object.keys(iconComponents);

// Helper to get icon component by name
const getIconComponent = (iconName: string | null, className = 'w-4 h-4') => {
  const Icon = iconComponents[iconName || 'Layers'] || Layers;
  return <Icon className={className} />;
};

// Map categories to display names
const categoryDisplayMap: Record<string, string> = {
  firewall: 'Firewall',
  switch: 'Switch',
  router: 'Router',
  wlc: 'Wireless Controller',
  server: 'Server',
  other: 'Outros',
};

const categoryOptions = [
  { value: 'firewall', label: 'Firewall' },
  { value: 'switch', label: 'Switch' },
  { value: 'router', label: 'Router' },
  { value: 'wlc', label: 'Wireless Controller' },
  { value: 'server', label: 'Server' },
  { value: 'other', label: 'Outros' },
];

type DeviceCategory = 'firewall' | 'switch' | 'router' | 'wlc' | 'server' | 'other';

interface DeviceType {
  id: string;
  name: string;
  code: string;
  vendor: string;
  category: DeviceCategory;
  is_active: boolean;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateTemplateForm {
  name: string;
  vendor: string;
  code: string;
  category: DeviceCategory;
  icon: string;
  is_active: boolean;
}

const initialCreateForm: CreateTemplateForm = {
  name: '',
  vendor: '',
  code: '',
  category: 'firewall',
  icon: 'Shield',
  is_active: true,
};

export default function TemplatesPage() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // States for dialogs
  const [viewingTemplate, setViewingTemplate] = useState<DeviceType | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<DeviceType | null>(null);
  const [editForm, setEditForm] = useState<Partial<DeviceType & { icon: string }>>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateTemplateForm>(initialCreateForm);
  const [templateSearch, setTemplateSearch] = useState('');

  // Access control - only super_admin and super_suporte
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (!authLoading && role !== 'super_admin' && role !== 'super_suporte') {
      navigate('/dashboard');
      toast.error('Acesso restrito a Super Administradores');
    }
  }, [user, role, authLoading, navigate]);

  // Fetch device_types (templates)
  const { data: templates, isLoading } = useQuery({
    queryKey: ['device-types-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_types')
        .select('*')
        .order('vendor', { ascending: true });

      if (error) throw error;
      return data as DeviceType[];
    },
    enabled: !!user && (role === 'super_admin' || role === 'super_suporte'),
  });

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (!templateSearch) return templates;
    const q = templateSearch.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.vendor.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q)
    );
  }, [templates, templateSearch]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateTemplateForm) => {
      const { error } = await supabase
        .from('device_types')
        .insert({
          name: data.name,
          vendor: data.vendor,
          code: data.code,
          category: data.category,
          icon: data.icon,
          is_active: data.is_active,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-types-templates'] });
      setCreateDialogOpen(false);
      setCreateForm(initialCreateForm);
      toast.success('Template criado com sucesso!');
    },
    onError: (error: Error) => {
      console.error('Error creating template:', error);
      toast.error('Erro ao criar template: ' + error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<DeviceType> }) => {
      const { error } = await supabase
        .from('device_types')
        .update(data.updates)
        .eq('id', data.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-types-templates'] });
      setEditingTemplate(null);
      setEditForm({});
      toast.success('Template atualizado com sucesso!');
    },
    onError: (error) => {
      console.error('Error updating template:', error);
      toast.error('Erro ao atualizar template');
    },
  });

  const handleOpenEdit = (template: DeviceType) => {
    setEditingTemplate(template);
    setEditForm({
      name: template.name,
      vendor: template.vendor,
      category: template.category,
      icon: template.icon || 'Layers',
      is_active: template.is_active,
    });
  };

  const handleSaveEdit = () => {
    if (!editingTemplate) return;
    updateMutation.mutate({
      id: editingTemplate.id,
      updates: {
        name: editForm.name,
        vendor: editForm.vendor,
        category: editForm.category as DeviceType['category'],
        icon: editForm.icon,
        is_active: editForm.is_active,
      },
    });
  };

  const handleCreateTemplate = () => {
    if (!createForm.name || !createForm.vendor || !createForm.code) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    createMutation.mutate(createForm);
  };

  // Generate code from vendor + name
  const generateCode = (vendor: string, name: string) => {
    return `${vendor}_${name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'Administração' },
            { label: 'Gerenciamento de Templates' },
          ]}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Gerenciamento de Templates</h1>
            <p className="text-muted-foreground">
              Gerencie os templates de dispositivos disponíveis no sistema
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Template
          </Button>
        </div>

        <TemplatePipelineFlow />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar template..."
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            className="pl-10 max-w-sm"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card className="glass-card">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTemplates.map((template) => {
                    const categoryDisplay = categoryDisplayMap[template.category] || template.category;

                    return (
                      <TableRow key={template.id} className="group">
                        <TableCell>
                          <div className="p-1.5 rounded bg-primary/10 w-fit">
                            {getIconComponent(template.icon)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link 
                            to={`/templates/${template.id}`}
                            className="hover:text-primary hover:underline"
                          >
                            {template.name}
                          </Link>
                        </TableCell>
                        <TableCell>{template.vendor}</TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                            {template.code}
                          </code>
                        </TableCell>
                        <TableCell>{categoryDisplay}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={template.is_active ? 'default' : 'secondary'}>
                            {template.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setViewingTemplate(template)}
                              title="Visualizar"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleOpenEdit(template)}
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredTemplates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum template encontrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* View Dialog */}
      <Dialog open={!!viewingTemplate} onOpenChange={() => setViewingTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingTemplate && (
                <>
                  <div className="p-1 rounded bg-primary/10">
                    {getIconComponent(viewingTemplate.icon, 'w-5 h-5 text-primary')}
                  </div>
                  {viewingTemplate.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Detalhes do template de dispositivo
            </DialogDescription>
          </DialogHeader>

          {viewingTemplate && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Código</Label>
                  <p className="font-mono text-sm bg-muted px-2 py-1 rounded mt-1">
                    {viewingTemplate.code}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Vendor</Label>
                  <p className="text-sm mt-1">{viewingTemplate.vendor}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Categoria</Label>
                  <p className="text-sm mt-1">
                    {categoryDisplayMap[viewingTemplate.category] || viewingTemplate.category}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={viewingTemplate.is_active ? 'default' : 'secondary'}>
                      {viewingTemplate.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Criado em</Label>
                <p className="text-sm mt-1">
                  {formatDateTimeBR(viewingTemplate.created_at)}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Atualizado em</Label>
                <p className="text-sm mt-1">
                  {formatDateTimeBR(viewingTemplate.updated_at)}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingTemplate(null)}>
              Fechar
            </Button>
            {viewingTemplate && (
              <Button onClick={() => navigate(`/templates/${viewingTemplate.id}`)}>
                Abrir Configurações
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={() => setEditingTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Template</DialogTitle>
            <DialogDescription>
              Altere as informações do template
            </DialogDescription>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input
                  id="edit-name"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-vendor">Vendor</Label>
                <Input
                  id="edit-vendor"
                  value={editForm.vendor || ''}
                  onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-code">Código</Label>
                <Input
                  id="edit-code"
                  value={editingTemplate.code}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  O código não pode ser alterado
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-category">Categoria</Label>
                <Select
                  value={editForm.category}
                  onValueChange={(value) => setEditForm({ ...editForm, category: value as DeviceCategory })}
                >
                  <SelectTrigger id="edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-icon">Ícone</Label>
                <Select
                  value={editForm.icon || 'Layers'}
                  onValueChange={(value) => setEditForm({ ...editForm, icon: value })}
                >
                  <SelectTrigger id="edit-icon">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        {getIconComponent(editForm.icon || 'Layers')}
                        <span>{editForm.icon || 'Layers'}</span>
                      </div>
                    </SelectValue>
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
                <Label htmlFor="edit-active">Ativo</Label>
                <Switch
                  id="edit-active"
                  checked={editForm.is_active}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Template</DialogTitle>
            <DialogDescription>
              Crie um novo template de dispositivo
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-vendor">Fabricante *</Label>
              <Input
                id="create-vendor"
                placeholder="Ex: Fortinet, Cisco, Palo Alto"
                value={createForm.vendor}
                onChange={(e) => {
                  const vendor = e.target.value;
                  setCreateForm({ 
                    ...createForm, 
                    vendor,
                    code: generateCode(vendor, createForm.name),
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-name">Nome *</Label>
              <Input
                id="create-name"
                placeholder="Ex: FortiGate, Meraki MX"
                value={createForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setCreateForm({ 
                    ...createForm, 
                    name,
                    code: generateCode(createForm.vendor, name),
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-code">Código (gerado automaticamente)</Label>
              <Input
                id="create-code"
                value={createForm.code}
                onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                placeholder="fortinet_fortigate"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Identificador único. Pode ser editado manualmente.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-category">Categoria</Label>
              <Select
                value={createForm.category}
                onValueChange={(value) => setCreateForm({ ...createForm, category: value as DeviceCategory })}
              >
                <SelectTrigger id="create-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-icon">Ícone</Label>
              <Select
                value={createForm.icon}
                onValueChange={(value) => setCreateForm({ ...createForm, icon: value })}
              >
                <SelectTrigger id="create-icon">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      {getIconComponent(createForm.icon)}
                      <span>{createForm.icon}</span>
                    </div>
                  </SelectValue>
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
              <Label htmlFor="create-active">Ativo</Label>
              <Switch
                id="create-active"
                checked={createForm.is_active}
                onCheckedChange={(checked) => setCreateForm({ ...createForm, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateTemplate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Criando...
                </>
              ) : (
                'Criar Template'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
