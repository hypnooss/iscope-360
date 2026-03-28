import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Plus, Pencil, Trash2, CheckCircle, Loader2, Search, Copy, Eye } from 'lucide-react';
import { useCategoryConfigs } from '@/hooks/useCategoryConfig';
import { ComplianceRuleDB, RuleSeverity } from '@/types/complianceRule';

// Using centralized type from @/types/complianceRule
type ComplianceRule = ComplianceRuleDB;

interface Props {
  deviceTypeId: string;
  onRefresh?: () => void;
}

const SEVERITY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'critical', label: 'Crítico', color: 'bg-red-500' },
  { value: 'high', label: 'Alto', color: 'bg-orange-500' },
  { value: 'medium', label: 'Médio', color: 'bg-yellow-500' },
  { value: 'low', label: 'Baixo', color: 'bg-blue-500' },
  { value: 'info', label: 'Info', color: 'bg-gray-500' },
];

// Fallback categories when none exist in DB
const DEFAULT_CATEGORY_OPTIONS = [
  'Segurança',
  'Autenticação',
  'Rede',
  'Configuração',
  'Logging',
  'Performance',
  'Backup',
  'Criptografia',
  'Alta Disponibilidade',
  'VPN',
  'Segurança DNS',
  'Email',
  'SSL/TLS',
  'Web',
];

export function TemplateRulesManagement({ deviceTypeId, onRefresh }: Props) {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  // Fetch category configs from database
  const { data: categoryConfigs } = useCategoryConfigs(deviceTypeId);
  
  // Build category options from DB configs + rules + defaults
  const categoryOptions = useMemo(() => {
    const categoriesSet = new Set<string>();
    
    // Add categories from DB configs
    categoryConfigs?.forEach(c => categoriesSet.add(c.name));
    
    // Add categories from existing rules
    rules.forEach(r => categoriesSet.add(r.category));
    
    // Add defaults if no categories exist
    if (categoriesSet.size === 0) {
      DEFAULT_CATEGORY_OPTIONS.forEach(c => categoriesSet.add(c));
    }
    
    return Array.from(categoriesSet).sort();
  }, [categoryConfigs, rules]);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: '',
    severity: 'medium' as RuleSeverity,
    weight: 1,
    recommendation: '',
    pass_description: '',
    fail_description: '',
    not_found_description: '',
    evaluation_logic: '{}',
    is_active: true,
    technical_risk: '',
    business_impact: '',
    api_endpoint: '',
  });

  useEffect(() => {
    fetchRules();
  }, [deviceTypeId]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('compliance_rules')
        .select('*')
        .eq('device_type_id', deviceTypeId)
        .order('category', { ascending: true });

      if (error) throw error;
      setRules((data || []).map(r => ({
        ...r,
        evaluation_logic: r.evaluation_logic as Record<string, any>,
      })));
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
      category: '',
      severity: 'medium',
      weight: 1,
      recommendation: '',
      pass_description: '',
      fail_description: '',
      not_found_description: '',
      evaluation_logic: '{}',
      is_active: true,
      technical_risk: '',
      business_impact: '',
      api_endpoint: '',
    });
    setSelectedRule(null);
  };

  const handleOpenDialog = (rule?: ComplianceRule) => {
    if (rule) {
      setSelectedRule(rule);
      setFormData({
        code: rule.code,
        name: rule.name,
        description: rule.description || '',
        category: rule.category,
        severity: rule.severity as RuleSeverity,
        weight: rule.weight,
        recommendation: rule.recommendation || '',
        pass_description: rule.pass_description || '',
        fail_description: rule.fail_description || '',
        not_found_description: rule.not_found_description || '',
        evaluation_logic: JSON.stringify(rule.evaluation_logic, null, 2),
        is_active: rule.is_active,
        technical_risk: rule.technical_risk || '',
        business_impact: rule.business_impact || '',
        api_endpoint: rule.api_endpoint || '',
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleDuplicate = (rule: ComplianceRule) => {
    setSelectedRule(null);
    setFormData({
      code: `${rule.code}_copy`,
      name: `${rule.name} (Cópia)`,
      description: rule.description || '',
      category: rule.category,
      severity: rule.severity as RuleSeverity,
      weight: rule.weight,
      recommendation: rule.recommendation || '',
      pass_description: rule.pass_description || '',
      fail_description: rule.fail_description || '',
      not_found_description: rule.not_found_description || '',
      evaluation_logic: JSON.stringify(rule.evaluation_logic, null, 2),
      is_active: false,
      technical_risk: rule.technical_risk || '',
      business_impact: rule.business_impact || '',
      api_endpoint: rule.api_endpoint || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name || !formData.category) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    let parsedLogic;
    try {
      parsedLogic = JSON.parse(formData.evaluation_logic);
    } catch {
      toast.error('Lógica de avaliação inválida (JSON malformado)');
      return;
    }

    setSaving(true);
    try {
      const ruleData = {
        code: formData.code,
        name: formData.name,
        description: formData.description || null,
        category: formData.category,
        severity: formData.severity,
        weight: formData.weight,
        recommendation: formData.recommendation || null,
        pass_description: formData.pass_description || null,
        fail_description: formData.fail_description || null,
        not_found_description: formData.not_found_description || null,
        evaluation_logic: parsedLogic,
        is_active: formData.is_active,
        device_type_id: deviceTypeId,
        technical_risk: formData.technical_risk || null,
        business_impact: formData.business_impact || null,
        api_endpoint: formData.api_endpoint || null,
      };

      if (selectedRule) {
        const { error } = await supabase
          .from('compliance_rules')
          .update(ruleData)
          .eq('id', selectedRule.id);
        if (error) throw error;
        toast.success('Regra atualizada');
      } else {
        const { error } = await supabase
          .from('compliance_rules')
          .insert(ruleData);
        if (error) throw error;
        toast.success('Regra criada');
      }

      setDialogOpen(false);
      resetForm();
      fetchRules();
      onRefresh?.();
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
      fetchRules();
      onRefresh?.();
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    const option = SEVERITY_OPTIONS.find(o => o.value === severity);
    return (
      <Badge variant="outline" className="gap-1">
        <span className={`w-2 h-2 rounded-full ${option?.color || 'bg-gray-500'}`} />
        {option?.label || severity}
      </Badge>
    );
  };

  const categories = [...new Set(rules.map(r => r.category))];
  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || rule.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar regras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      {filteredRules.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border/50 rounded-lg">
          <CheckCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Nenhuma regra encontrada</p>
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {rule.code}
                    </code>
                  </TableCell>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{rule.category}</TableCell>
                  <TableCell>{getSeverityBadge(rule.severity)}</TableCell>
                  <TableCell>
                    <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                      {rule.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedRule(rule);
                          setViewDialogOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDuplicate(rule)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(rule)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedRule(rule);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedRule ? 'Editar Regra' : 'Nova Regra'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Ex: sec-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Categoria *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome da regra"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição da regra"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="severity">Severidade</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(v) => setFormData({ ...formData, severity: v as RuleSeverity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight">Peso</Label>
                <Input
                  id="weight"
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) || 1 })}
                  min={1}
                  max={10}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recommendation">Recomendação</Label>
              <Textarea
                id="recommendation"
                value={formData.recommendation}
                onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                placeholder="O que fazer para corrigir"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pass_description">Mensagem de Sucesso</Label>
                <Textarea
                  id="pass_description"
                  value={formData.pass_description}
                  onChange={(e) => setFormData({ ...formData, pass_description: e.target.value })}
                  placeholder="Exibida quando a regra passa"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fail_description">Mensagem de Falha</Label>
                <Textarea
                  id="fail_description"
                  value={formData.fail_description}
                  onChange={(e) => setFormData({ ...formData, fail_description: e.target.value })}
                  placeholder="Exibida quando a regra falha"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="not_found_description">Mensagem Não Encontrado</Label>
                <Textarea
                  id="not_found_description"
                  value={formData.not_found_description}
                  onChange={(e) => setFormData({ ...formData, not_found_description: e.target.value })}
                  placeholder="Ex: Nenhum servidor RADIUS configurado"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Exibida quando o recurso não está configurado
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="evaluation_logic">Lógica de Avaliação (JSON)</Label>
              <Textarea
                id="evaluation_logic"
                value={formData.evaluation_logic}
                onChange={(e) => setFormData({ ...formData, evaluation_logic: e.target.value })}
                placeholder="{}"
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            
            {/* Novos campos: Risco Técnico e Impacto no Negócio */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="technical_risk">Risco Técnico</Label>
                <Textarea
                  id="technical_risk"
                  value={formData.technical_risk}
                  onChange={(e) => setFormData({ ...formData, technical_risk: e.target.value })}
                  placeholder="Descreva o risco técnico caso esta regra falhe..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business_impact">Impacto no Negócio</Label>
                <Textarea
                  id="business_impact"
                  value={formData.business_impact}
                  onChange={(e) => setFormData({ ...formData, business_impact: e.target.value })}
                  placeholder="Descreva o impacto no negócio se não corrigido..."
                  rows={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_endpoint">Endpoint da API</Label>
              <Input
                id="api_endpoint"
                value={formData.api_endpoint}
                onChange={(e) => setFormData({ ...formData, api_endpoint: e.target.value })}
                placeholder="Ex: /api/v2/cmdb/system/global"
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
              {selectedRule ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Regra</DialogTitle>
          </DialogHeader>
          {selectedRule && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Código</Label>
                  <p className="font-mono">{selectedRule.code}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Categoria</Label>
                  <p>{selectedRule.category}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Nome</Label>
                <p className="font-medium">{selectedRule.name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Descrição</Label>
                <p>{selectedRule.description || '-'}</p>
              </div>
              
              {/* Novos campos de metadados */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Risco Técnico</Label>
                  <p className="text-sm">{selectedRule.technical_risk || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Impacto no Negócio</Label>
                  <p className="text-sm">{selectedRule.business_impact || '-'}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Endpoint da API</Label>
                <p className="font-mono text-xs">{selectedRule.api_endpoint || '-'}</p>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Lógica de Avaliação</Label>
                <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
                  {JSON.stringify(selectedRule.evaluation_logic, null, 2)}
                </pre>
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
            <DialogTitle>Excluir Regra</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            Tem certeza que deseja excluir a regra <strong>{selectedRule?.name}</strong>?
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
