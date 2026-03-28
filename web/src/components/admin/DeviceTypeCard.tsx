import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Pencil, Trash2, Loader2, Package, 
  FileCode, CheckCircle, GitBranch, Languages
} from 'lucide-react';
import { BlueprintFlowVisualization } from './BlueprintFlowVisualization';
import { BlueprintsTable } from './BlueprintsTable';
import { ComplianceRulesTable } from './ComplianceRulesTable';
import { ParsesManagement } from './ParsesManagement';
import * as LucideIcons from 'lucide-react';
import { ComplianceRuleDB } from '@/types/complianceRule';

// Types
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

// Using centralized type from @/types/complianceRule
type ComplianceRule = ComplianceRuleDB;

const ICON_OPTIONS = [
  'Shield', 'Server', 'Cloud', 'Network', 'Lock', 'Cpu', 
  'HardDrive', 'Wifi', 'Globe', 'Database', 'Monitor', 'Activity'
];

interface Props {
  deviceType: DeviceType;
  blueprints: Blueprint[];
  rules: ComplianceRule[];
  onRefresh: () => void;
}

export function DeviceTypeCard({ deviceType, blueprints, rules, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('flow');
  const [parsesCount, setParsesCount] = useState(0);

  // Fetch parses count for badge
  useEffect(() => {
    const fetchParsesCount = async () => {
      const { count } = await supabase
        .from('evidence_parses')
        .select('*', { count: 'exact', head: true })
        .eq('device_type_id', deviceType.id);
      setParsesCount(count || 0);
    };
    fetchParsesCount();
  }, [deviceType.id]);
  
  // Device Type dialogs
  const [editDeviceDialogOpen, setEditDeviceDialogOpen] = useState(false);
  const [deleteDeviceDialogOpen, setDeleteDeviceDialogOpen] = useState(false);
  const [deviceFormData, setDeviceFormData] = useState({
    vendor: deviceType.vendor,
    name: deviceType.name,
    code: deviceType.code,
    icon: deviceType.icon || 'Shield',
    is_active: deviceType.is_active,
  });

  const getIconComponent = (iconName: string | null) => {
    if (!iconName) return <Package className="w-5 h-5" />;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Icon = (LucideIcons as any)[iconName];
    return Icon ? <Icon className="w-5 h-5" /> : <Package className="w-5 h-5" />;
  };

  // Device Type handlers
  const handleEditDevice = () => {
    setDeviceFormData({
      vendor: deviceType.vendor,
      name: deviceType.name,
      code: deviceType.code,
      icon: deviceType.icon || 'Shield',
      is_active: deviceType.is_active,
    });
    setEditDeviceDialogOpen(true);
  };

  const handleSaveDevice = async () => {
    if (!deviceFormData.vendor || !deviceFormData.name || !deviceFormData.code) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('device_types')
        .update({
          vendor: deviceFormData.vendor,
          name: deviceFormData.name,
          code: deviceFormData.code,
          icon: deviceFormData.icon,
          is_active: deviceFormData.is_active,
        })
        .eq('id', deviceType.id);

      if (error) throw error;
      toast.success('Tarefa atualizada');
      setEditDeviceDialogOpen(false);
      onRefresh();
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDevice = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('device_types')
        .delete()
        .eq('id', deviceType.id);

      if (error) throw error;
      toast.success('Tarefa excluída');
      setDeleteDeviceDialogOpen(false);
      onRefresh();
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao excluir: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Get active blueprint for flow visualization
  const activeBlueprint = blueprints.find(bp => bp.is_active) || blueprints[0];

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                {getIconComponent(deviceType.icon)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">
                    {deviceType.vendor} - {deviceType.name}
                  </h3>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                    {deviceType.code}
                  </code>
                  <Badge variant={deviceType.is_active ? 'default' : 'secondary'}>
                    {deviceType.is_active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleEditDevice} title="Editar">
                <Pencil className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setDeleteDeviceDialogOpen(true)}
                className="text-destructive hover:text-destructive"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start mb-4 bg-muted/50">
              <TabsTrigger value="flow" className="gap-2">
                <GitBranch className="w-4 h-4" />
                Fluxo de Análise
              </TabsTrigger>
              <TabsTrigger value="blueprints" className="gap-2">
                <FileCode className="w-4 h-4" />
                Blueprints
                <Badge variant="outline" className="ml-1 text-xs">{blueprints.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="rules" className="gap-2">
                <CheckCircle className="w-4 h-4" />
                Regras
                <Badge variant="outline" className="ml-1 text-xs">{rules.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="parses" className="gap-2">
                <Languages className="w-4 h-4" />
                Parses
                <Badge variant="outline" className="ml-1 text-xs">{parsesCount}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Flow Visualization */}
            <TabsContent value="flow" className="mt-0">
              {activeBlueprint ? (
                <div className="bg-muted/20 rounded-lg border border-border/50 p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <h4 className="text-sm font-medium">Blueprint Ativo: {activeBlueprint.name}</h4>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">{activeBlueprint.version}</code>
                  </div>
                  <BlueprintFlowVisualization
                    blueprint={activeBlueprint}
                    rules={rules}
                  />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border border-dashed border-border/50 rounded-lg">
                  <FileCode className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>Nenhum blueprint configurado.</p>
                  <p className="text-xs mt-1">Crie um blueprint na aba "Blueprints" para visualizar o fluxo.</p>
                </div>
              )}
            </TabsContent>

            {/* Tab 2: Blueprints */}
            <TabsContent value="blueprints" className="mt-0">
              <BlueprintsTable
                deviceTypeId={deviceType.id}
                blueprints={blueprints}
                onRefresh={onRefresh}
              />
            </TabsContent>

            {/* Tab 3: Compliance Rules */}
            <TabsContent value="rules" className="mt-0">
              <ComplianceRulesTable
                deviceTypeId={deviceType.id}
                rules={rules}
                onRefresh={onRefresh}
              />
            </TabsContent>

            {/* Tab 4: Parses */}
            <TabsContent value="parses" className="mt-0">
              <ParsesManagement deviceTypeId={deviceType.id} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit Task Dialog */}
      <Dialog open={editDeviceDialogOpen} onOpenChange={setEditDeviceDialogOpen}>
        <DialogContent className="border-border">
          <DialogHeader>
            <DialogTitle>Editar Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">Fabricante *</Label>
              <Input
                id="vendor"
                value={deviceFormData.vendor}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, vendor: e.target.value })}
                placeholder="Ex: Fortinet, Palo Alto, Microsoft"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Tarefa *</Label>
              <Input
                id="name"
                value={deviceFormData.name}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, name: e.target.value })}
                placeholder="Ex: FortiGate, Azure AD"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Código Único *</Label>
              <Input
                id="code"
                value={deviceFormData.code}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="Ex: fortigate, entra_id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Ícone</Label>
              <Select
                value={deviceFormData.icon}
                onValueChange={(value) => setDeviceFormData({ ...deviceFormData, icon: value })}
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
                checked={deviceFormData.is_active}
                onCheckedChange={(checked) => setDeviceFormData({ ...deviceFormData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDeviceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveDevice} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Task Dialog */}
      <Dialog open={deleteDeviceDialogOpen} onOpenChange={setDeleteDeviceDialogOpen}>
        <DialogContent className="border-border">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            Tem certeza que deseja excluir a tarefa <strong>{deviceType.vendor} - {deviceType.name}</strong>?
            <br /><br />
            Isso também excluirá todos os blueprints, regras e parses associados.
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDeviceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteDevice} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
