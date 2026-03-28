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
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Copy, Eye, CheckCircle } from 'lucide-react';

type RuleSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface ComplianceRule {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  severity: string;
  weight: number;
  recommendation: string | null;
  pass_description: string | null;
  fail_description: string | null;
  evaluation_logic: Record<string, unknown>;
  device_type_id: string;
  is_active: boolean;
  created_at: string;
  technical_risk: string | null;
  business_impact: string | null;
  api_endpoint: string | null;
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
  'Segurança de Rede',
  'Proteção Avançada',
  'Inspeção SSL',
  'Auditoria',
  'DNS',
  'SPF',
  'DKIM',
  'DMARC',
  'MX',
  'Email',
];

interface Props {
  deviceTypeId: string;
  rules: ComplianceRule[];
  onRefresh: () => void;
}

export function ComplianceRulesTable({ deviceTypeId, rules, onRefresh }: Props) {
  const [saving, setSaving] = useState(false);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
  
  // Form data
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
    is_active: true,
    technical_risk: '',
    business_impact: '',
    api_endpoint: '',
  });

  const getSeverityBadge = (severity: string) => {
    const config = SEVERITY_OPTIONS.find(s => s.value === severity);
    return (
      <Badge className={`${config?.color || 'bg-gray-500'} text-white`}>
        {config?.label || severity}
      </Badge>
    );
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
      is_active: true,
      technical_risk: '',
      business_impact: '',
      api_endpoint: '',
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
      is_active: rule.is_active,
      technical_risk: rule.technical_risk || '',
      business_impact: rule.business_impact || '',
      api_endpoint: rule.api_endpoint || '',
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
    if (!formData.code || !formData.name) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    let parsedLogic;
    try {
      parsedLogic = JSON.parse(formData.evaluation_logic);
    } catch {
      toast.error('JSON de evaluation_logic inválido');
      return;
    }

    setSaving(true);
    try {
      const severityValue = formData.severity as RuleSeverity;
      
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
            is_active: formData.is_active,
            technical_risk: formData.technical_risk || null,
            business_impact: formData.business_impact || null,
            api_endpoint: formData.api_endpoint || null,
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
            device_type_id: deviceTypeId,
            is_active: formData.is_active,
            technical_risk: formData.technical_risk || null,
            business_impact: formData.business_impact || null,
            api_endpoint: formData.api_endpoint || null,
          });

        if (error) throw error;
        toast.success('Regra criada');
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
    if (!selectedRule) return;

    setSaving(true);
    try {
      // Verificar se há análises usando esta regra
      const { count: historyCount } = await supabase
        .from('external_domain_analysis_history')
        .select('id', { count: 'exact', head: true });

      if (historyCount && historyCount > 0) {
        // Verificar se esta regra específica está em algum relatório
        const { data: histories } = await supabase
          .from('external_domain_analysis_history')
          .select('report_data')
          .limit(100);

        const usedInReports = histories?.some(h => {
          const reportData = h.report_data as { results?: Array<{ code?: string }> };
          return reportData?.results?.some(r => r.code === selectedRule.code);
        });

        if (usedInReports) {
          toast.error(`Não é possível excluir: esta regra está sendo usada em relatórios de análise existentes.`);
          setSaving(false);
          setDeleteDialogOpen(false);
          return;
        }
      }

      const { error } = await supabase
        .from('compliance_rules')
        .delete()
        .eq('id', selectedRule.id);

      if (error) throw error;
      toast.success('Regra excluída');
      setDeleteDialogOpen(false);
      setSelectedRule(null);
      onRefresh();
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao excluir: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (rule: ComplianceRule) => {
    setSaving(true);
    try {
      const severityValue = rule.severity as RuleSeverity;
      const { error } = await supabase
        .from('compliance_rules')
        .insert([{
          code: `${rule.code}_copy`,
          name: `${rule.name} (Cópia)`,
          description: rule.description,
          category: rule.category,
          severity: severityValue,
          weight: rule.weight,
          recommendation: rule.recommendation,
          pass_description: rule.pass_description,
          fail_description: rule.fail_description,
          evaluation_logic: JSON.parse(JSON.stringify(rule.evaluation_logic)),
          device_type_id: rule.device_type_id,
          is_active: false,
        }]);

      if (error) throw error;
      toast.success('Regra duplicada');
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
          Configure as regras de compliance para esta tarefa.
        </p>
        <Button onClick={openCreateDialog} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-border/50 rounded-lg">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>Nenhuma regra cadastrada.</p>
        </div>
      ) : (
        <div className="border rounded-lg border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Severidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className="border-border/50">
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">{rule.code}</code>
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate" title={rule.name}>
                    {rule.name}
                  </TableCell>
                  <TableCell>{rule.category}</TableCell>
                  <TableCell>{getSeverityBadge(rule.severity)}</TableCell>
                  <TableCell>
                    <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                      {rule.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openViewDialog(rule)} title="Visualizar">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDuplicate(rule)} title="Duplicar" disabled={saving}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(rule)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(rule)} className="text-destructive hover:text-destructive" title="Excluir">
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
        <DialogContent className="border-border max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedRule ? 'Editar Regra' : 'Nova Regra'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="Ex: DNS-001"
                  />
                </div>
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: DNSSEC Habilitado"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descrição da regra..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="severity">Severidade</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) => setFormData({ ...formData, severity: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((sev) => (
                        <SelectItem key={sev.value} value={sev.value}>{sev.label}</SelectItem>
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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recommendation">Recomendação</Label>
                <Textarea
                  id="recommendation"
                  value={formData.recommendation}
                  onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                  placeholder="Recomendação de correção..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pass_description">Descrição (Passou)</Label>
                  <Textarea
                    id="pass_description"
                    value={formData.pass_description}
                    onChange={(e) => setFormData({ ...formData, pass_description: e.target.value })}
                    placeholder="Mensagem quando a regra passa..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fail_description">Descrição (Falhou)</Label>
                  <Textarea
                    id="fail_description"
                    value={formData.fail_description}
                    onChange={(e) => setFormData({ ...formData, fail_description: e.target.value })}
                    placeholder="Mensagem quando a regra falha..."
                    rows={2}
                  />
                </div>
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

              <div className="space-y-2">
                <Label htmlFor="evaluation_logic">Lógica de Avaliação (JSON)</Label>
                <Textarea
                  id="evaluation_logic"
                  value={formData.evaluation_logic}
                  onChange={(e) => setFormData({ ...formData, evaluation_logic: e.target.value })}
                  className="font-mono text-xs"
                  rows={6}
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
          </ScrollArea>
          <DialogFooter className="pt-4 border-t border-border/50">
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
        <DialogContent className="border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <code className="text-sm bg-muted px-2 py-1 rounded">{selectedRule?.code}</code>
              {selectedRule?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4 text-sm">
                <span>Categoria: <Badge variant="outline">{selectedRule?.category}</Badge></span>
                {selectedRule && getSeverityBadge(selectedRule.severity)}
                <span>Peso: {selectedRule?.weight}</span>
                <Badge variant={selectedRule?.is_active ? 'default' : 'secondary'}>
                  {selectedRule?.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>

              {selectedRule?.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">Descrição</Label>
                  <p className="text-sm">{selectedRule.description}</p>
                </div>
              )}

              {selectedRule?.recommendation && (
                <div>
                  <Label className="text-xs text-muted-foreground">Recomendação</Label>
                  <p className="text-sm">{selectedRule.recommendation}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {selectedRule?.pass_description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Quando Passa</Label>
                    <p className="text-sm text-primary">{selectedRule.pass_description}</p>
                  </div>
                )}
                {selectedRule?.fail_description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Quando Falha</Label>
                    <p className="text-sm text-destructive">{selectedRule.fail_description}</p>
                  </div>
                )}
              </div>

              {/* Novos campos: Risco Técnico e Impacto no Negócio */}
              <div className="grid grid-cols-2 gap-4">
                {selectedRule?.technical_risk && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Risco Técnico</Label>
                    <p className="text-sm">{selectedRule.technical_risk}</p>
                  </div>
                )}
                {selectedRule?.business_impact && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Impacto no Negócio</Label>
                    <p className="text-sm">{selectedRule.business_impact}</p>
                  </div>
                )}
              </div>

              {selectedRule?.api_endpoint && (
                <div>
                  <Label className="text-xs text-muted-foreground">Endpoint da API</Label>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{selectedRule.api_endpoint}</code>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">Lógica de Avaliação</Label>
                <div className="mt-2 rounded-md border border-border/50 p-4 bg-muted/30">
                  <pre className="text-xs font-mono overflow-x-auto">
                    {JSON.stringify(selectedRule?.evaluation_logic, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Fechar
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
            Tem certeza que deseja excluir a regra <strong>{selectedRule?.code} - {selectedRule?.name}</strong>?
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
