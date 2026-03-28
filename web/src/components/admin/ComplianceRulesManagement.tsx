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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, CheckCircle, Loader2, Search, Filter, Copy, Eye } from 'lucide-react';
import { ComplianceRuleDB, RuleSeverity } from '@/types/complianceRule';

interface DeviceType {
  id: string;
  vendor: string;
  name: string;
  code: string;
}

// Extend base type with optional device_types relation
interface ComplianceRule extends ComplianceRuleDB {
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

const SEVERITY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'critical', label: 'Crítico', color: 'bg-red-500' },
  { value: 'high', label: 'Alto', color: 'bg-orange-500' },
  { value: 'medium', label: 'Médio', color: 'bg-yellow-500' },
  { value: 'low', label: 'Baixo', color: 'bg-blue-500' },
  { value: 'info', label: 'Info', color: 'bg-gray-500' },
];

const CATEGORY_OPTIONS = [
  'Segurança',
  'Autenticação',
  'Rede',
  'Configuração',
  'Logging',
  'Performance',
  'Backup',
  'Criptografia',
];

export function ComplianceRulesManagement({ category }: Props) {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: 'Segurança',
    severity: 'medium',
    weight: 1,
    recommendation: '',
    pass_description: '',
    fail_description: '',
    evaluation_logic: '{}',
    device_type_id: '',
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

      // Fetch rules for device types in this category
      if (types && types.length > 0) {
        const typeIds = types.map(t => t.id);
        const { data: rulesData, error: rulesError } = await supabase
          .from('compliance_rules')
          .select('*, device_types(id, vendor, name, code)')
          .in('device_type_id', typeIds)
          .order('category', { ascending: true });

        if (rulesError) throw rulesError;
        // Cast to handle type differences
        setRules((rulesData || []).map(r => ({
          ...r,
          evaluation_logic: r.evaluation_logic as Record<string, any>,
        })));
      } else {
        setRules([]);
      }
    } catch (error: any) {
      toast.error('Erro ao carregar regras: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      category: 'Segurança',
      severity: 'medium',
      weight: 1,
      recommendation: '',
      pass_description: '',
      fail_description: '',
      evaluation_logic: '{}',
      device_type_id: deviceTypes[0]?.id || '',
      is_active: true,
    });
    setSelectedRule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (rule: ComplianceRule) => {
    setSelectedRule(rule);
    setFormData({
      code: rule.code,
      name: rule.name,
      description: rule.description || '',
      category: rule.category,
      severity: rule.severity,
      weight: rule.weight,
      recommendation: rule.recommendation || '',
      pass_description: rule.pass_description || '',
      fail_description: rule.fail_description || '',
      evaluation_logic: JSON.stringify(rule.evaluation_logic, null, 2),
      device_type_id: rule.device_type_id,
      is_active: rule.is_active,
    });
    setDialogOpen(true);
  };

  const openViewDialog = (rule: ComplianceRule) => {
    setSelectedRule(rule);
    setViewDialogOpen(true);
  };

  const openDeleteDialog = (rule: ComplianceRule) => {
    setSelectedRule(rule);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name || !formData.device_type_id) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    let parsedLogic;
    try {
      parsedLogic = JSON.parse(formData.evaluation_logic);
    } catch (e) {
      toast.error('JSON de evaluation_logic inválido');
      return;
    }

    setSaving(true);
    try {
      const severityValue = formData.severity as 'critical' | 'high' | 'medium' | 'low' | 'info';
      
      if (selectedRule) {
        const { error } = await supabase
          .from('compliance_rules')
          .update({
            code: formData.code,
            name: formData.name,
            description: formData.description || null,
            category: formData.category,
            severity: severityValue,
            weight: formData.weight,
            recommendation: formData.recommendation || null,
            pass_description: formData.pass_description || null,
            fail_description: formData.fail_description || null,
            evaluation_logic: parsedLogic,
            device_type_id: formData.device_type_id,
            is_active: formData.is_active,
          })
          .eq('id', selectedRule.id);

        if (error) throw error;
        toast.success('Regra atualizada');
      } else {
        const { error } = await supabase
          .from('compliance_rules')
          .insert({
            code: formData.code,
            name: formData.name,
            description: formData.description || null,
            category: formData.category,
            severity: severityValue,
            weight: formData.weight,
            recommendation: formData.recommendation || null,
            pass_description: formData.pass_description || null,
            fail_description: formData.fail_description || null,
            evaluation_logic: parsedLogic,
            device_type_id: formData.device_type_id,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast.success('Regra criada');
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
    if (!selectedRule) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('compliance_rules')
        .delete()
        .eq('id', selectedRule.id);

      if (error) throw error;
      toast.success('Regra excluída');
      setDeleteDialogOpen(false);
      setSelectedRule(null);
      fetchData();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (rule: ComplianceRule) => {
    setSaving(true);
    try {
      const severityValue = rule.severity as 'critical' | 'high' | 'medium' | 'low' | 'info';
      const { error } = await supabase
        .from('compliance_rules')
        .insert({
          code: `${rule.code}_copy`,
          name: `${rule.name} (Cópia)`,
          description: rule.description,
          category: rule.category,
          severity: severityValue,
          weight: rule.weight,
          recommendation: rule.recommendation,
          pass_description: rule.pass_description,
          fail_description: rule.fail_description,
          evaluation_logic: rule.evaluation_logic,
          device_type_id: rule.device_type_id,
          is_active: false,
        });

      if (error) throw error;
      toast.success('Regra duplicada');
      fetchData();
    } catch (error: any) {
      toast.error('Erro ao duplicar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    const config = SEVERITY_OPTIONS.find(s => s.value === severity);
    return (
      <Badge className={`${config?.color || 'bg-gray-500'} text-white`}>
        {config?.label || severity}
      </Badge>
    );
  };

  // Filter rules
  const filteredRules = rules.filter(rule => {
    const matchesSearch = 
      rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rule.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSeverity = severityFilter === 'all' || rule.severity === severityFilter;
    const matchesDeviceType = deviceTypeFilter === 'all' || rule.device_type_id === deviceTypeFilter;
    
    return matchesSearch && matchesSeverity && matchesDeviceType;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-primary" />
          Regras de Compliance ({rules.length})
        </CardTitle>
        <Button onClick={openCreateDialog} size="sm" disabled={deviceTypes.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Regra
        </Button>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, código ou categoria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Severidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {SEVERITY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {deviceTypes.length > 1 && (
            <Select value={deviceTypeFilter} onValueChange={setDeviceTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Dispositivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {deviceTypes.map(type => (
                  <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : deviceTypes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Cadastre um tipo de dispositivo primeiro para criar regras.
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {rules.length === 0 
              ? 'Nenhuma regra cadastrada para esta categoria.'
              : 'Nenhuma regra encontrada com os filtros aplicados.'}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Peso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{rule.code}</code>
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate" title={rule.name}>
                      {rule.name}
                    </TableCell>
                    <TableCell>{rule.category}</TableCell>
                    <TableCell>{getSeverityBadge(rule.severity)}</TableCell>
                    <TableCell>{rule.weight}</TableCell>
                    <TableCell>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                        {rule.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openViewDialog(rule)}
                          title="Visualizar"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(rule)}
                          title="Duplicar"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(rule)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(rule)}
                          className="text-destructive hover:text-destructive"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedRule ? 'Editar Regra de Compliance' : 'Nova Regra de Compliance'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="Ex: admin_timeout"
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
                <Label htmlFor="name">Nome da Regra *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Timeout de Sessão Administrativa"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição detalhada da regra..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="severity">Severidade</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) => setFormData({ ...formData, severity: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Peso no Score</Label>
                  <Input
                    id="weight"
                    type="number"
                    min={1}
                    max={10}
                    value={formData.weight}
                    onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recommendation">Recomendação de Correção</Label>
                <Textarea
                  id="recommendation"
                  value={formData.recommendation}
                  onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                  placeholder="Passos para corrigir quando a regra falhar..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pass_description">Mensagem de Sucesso</Label>
                  <Textarea
                    id="pass_description"
                    value={formData.pass_description}
                    onChange={(e) => setFormData({ ...formData, pass_description: e.target.value })}
                    placeholder="Mensagem quando a regra passa..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fail_description">Mensagem de Falha</Label>
                  <Textarea
                    id="fail_description"
                    value={formData.fail_description}
                    onChange={(e) => setFormData({ ...formData, fail_description: e.target.value })}
                    placeholder="Mensagem quando a regra falha..."
                    rows={2}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="evaluation_logic">Lógica de Avaliação (JSON)</Label>
                <Textarea
                  id="evaluation_logic"
                  value={formData.evaluation_logic}
                  onChange={(e) => setFormData({ ...formData, evaluation_logic: e.target.value })}
                  placeholder='{"source_key": "system_config", "field_path": "value", "conditions": [...]}'
                  rows={8}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Estrutura: {`{"source_key": "step_id", "field_path": "path.to.value", "conditions": [{"operator": ">=", "value": 300, "result": "pass"}], "default_result": "fail"}`}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">Regra Ativa</Label>
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
                {selectedRule ? 'Salvar Alterações' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded">{selectedRule?.code}</code>
                {selectedRule?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Categoria:</span>{' '}
                  <strong>{selectedRule?.category}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Severidade:</span>{' '}
                  {selectedRule && getSeverityBadge(selectedRule.severity)}
                </div>
                <div>
                  <span className="text-muted-foreground">Peso:</span>{' '}
                  <strong>{selectedRule?.weight}</strong>
                </div>
              </div>
              
              {selectedRule?.description && (
                <div>
                  <Label className="text-muted-foreground">Descrição</Label>
                  <p className="text-sm mt-1">{selectedRule.description}</p>
                </div>
              )}
              
              {selectedRule?.recommendation && (
                <div>
                  <Label className="text-muted-foreground">Recomendação</Label>
                  <p className="text-sm mt-1">{selectedRule.recommendation}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                {selectedRule?.pass_description && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <Label className="text-green-600">✓ Quando Passa</Label>
                    <p className="text-sm mt-1">{selectedRule.pass_description}</p>
                  </div>
                )}
                {selectedRule?.fail_description && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <Label className="text-red-600">✗ Quando Falha</Label>
                    <p className="text-sm mt-1">{selectedRule.fail_description}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Lógica de Avaliação</Label>
                <div className="font-mono text-xs bg-muted p-4 rounded-lg border overflow-auto max-h-64">
                  <pre>{JSON.stringify(selectedRule?.evaluation_logic, null, 2)}</pre>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                Fechar
              </Button>
              <Button onClick={() => {
                setViewDialogOpen(false);
                if (selectedRule) openEditDialog(selectedRule);
              }}>
                Editar
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
              Tem certeza que deseja excluir a regra{' '}
              <strong>{selectedRule?.name}</strong>?
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
