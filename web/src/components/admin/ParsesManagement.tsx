import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Pencil, Trash2, Loader2, Eye, EyeOff, Languages } from 'lucide-react';

type ParseType = 'text' | 'boolean' | 'time' | 'list' | 'json' | 'number';

interface EvidenceParse {
  id: string;
  device_type_id: string;
  source_field: string;
  display_label: string;
  parse_type: ParseType;
  value_transformations: Record<string, string>;
  format_options: Record<string, unknown>;
  is_hidden: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const PARSE_TYPE_OPTIONS: { value: ParseType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'boolean', label: 'Booleano' },
  { value: 'time', label: 'Tempo' },
  { value: 'list', label: 'Lista' },
  { value: 'json', label: 'JSON' },
  { value: 'number', label: 'Número' },
];

interface Props {
  deviceTypeId: string;
}

export function ParsesManagement({ deviceTypeId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parses, setParses] = useState<EvidenceParse[]>([]);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedParse, setSelectedParse] = useState<EvidenceParse | null>(null);
  
  // Form data
  const [formData, setFormData] = useState({
    source_field: '',
    display_label: '',
    parse_type: 'text' as ParseType,
    value_transformations: '{}',
    format_options: '{}',
    is_hidden: false,
    display_order: 0,
    is_active: true,
  });

  useEffect(() => {
    fetchParses();
  }, [deviceTypeId]);

  const fetchParses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('evidence_parses')
        .select('*')
        .eq('device_type_id', deviceTypeId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setParses((data || []).map(p => ({
        ...p,
        parse_type: p.parse_type as ParseType,
        value_transformations: p.value_transformations as Record<string, string>,
        format_options: p.format_options as Record<string, unknown>,
      })));
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao carregar parses: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      source_field: '',
      display_label: '',
      parse_type: 'text',
      value_transformations: '{}',
      format_options: '{}',
      is_hidden: false,
      display_order: 0,
      is_active: true,
    });
    setSelectedParse(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setFormData(prev => ({
      ...prev,
      display_order: parses.length,
    }));
    setDialogOpen(true);
  };

  const openEditDialog = (parse: EvidenceParse) => {
    setSelectedParse(parse);
    setFormData({
      source_field: parse.source_field,
      display_label: parse.display_label,
      parse_type: parse.parse_type,
      value_transformations: JSON.stringify(parse.value_transformations, null, 2),
      format_options: JSON.stringify(parse.format_options, null, 2),
      is_hidden: parse.is_hidden,
      display_order: parse.display_order,
      is_active: parse.is_active,
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (parse: EvidenceParse) => {
    setSelectedParse(parse);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.source_field || !formData.display_label) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    let parsedTransformations;
    let parsedOptions;
    try {
      parsedTransformations = JSON.parse(formData.value_transformations);
      parsedOptions = JSON.parse(formData.format_options);
    } catch {
      toast.error('JSON inválido nas transformações ou opções');
      return;
    }

    setSaving(true);
    try {
      if (selectedParse) {
        const { error } = await supabase
          .from('evidence_parses')
          .update({
            source_field: formData.source_field,
            display_label: formData.display_label,
            parse_type: formData.parse_type,
            value_transformations: parsedTransformations,
            format_options: parsedOptions,
            is_hidden: formData.is_hidden,
            display_order: formData.display_order,
            is_active: formData.is_active,
          })
          .eq('id', selectedParse.id);

        if (error) throw error;
        toast.success('Parse atualizado');
      } else {
        const { error } = await supabase
          .from('evidence_parses')
          .insert({
            device_type_id: deviceTypeId,
            source_field: formData.source_field,
            display_label: formData.display_label,
            parse_type: formData.parse_type,
            value_transformations: parsedTransformations,
            format_options: parsedOptions,
            is_hidden: formData.is_hidden,
            display_order: formData.display_order,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast.success('Parse criado');
      }

      setDialogOpen(false);
      resetForm();
      fetchParses();
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedParse) return;

    setSaving(true);
    try {
      // Verificar se alguma regra usa este campo no evaluation_logic
      const { data: rules } = await supabase
        .from('compliance_rules')
        .select('code, name, evaluation_logic')
        .eq('device_type_id', deviceTypeId)
        .eq('is_active', true);

      const rulesUsingParse = rules?.filter(rule => {
        const logic = rule.evaluation_logic as Record<string, unknown>;
        const logicStr = JSON.stringify(logic);
        return logicStr.includes(selectedParse.source_field);
      });

      if (rulesUsingParse && rulesUsingParse.length > 0) {
        const rulesCodes = rulesUsingParse.map(r => r.code).join(', ');
        toast.error(`Parse em uso por ${rulesUsingParse.length} regra(s): ${rulesCodes}`);
        setSaving(false);
        setDeleteDialogOpen(false);
        return;
      }

      const { error } = await supabase
        .from('evidence_parses')
        .delete()
        .eq('id', selectedParse.id);

      if (error) throw error;
      toast.success('Parse excluído');
      setDeleteDialogOpen(false);
      setSelectedParse(null);
      fetchParses();
    } catch (error: unknown) {
      const err = error as { message: string };
      toast.error('Erro ao excluir: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const getParseTypeBadge = (type: ParseType) => {
    const colors: Record<ParseType, string> = {
      text: 'bg-blue-500/20 text-blue-400',
      boolean: 'bg-purple-500/20 text-purple-400',
      time: 'bg-amber-500/20 text-amber-400',
      list: 'bg-cyan-500/20 text-cyan-400',
      json: 'bg-emerald-500/20 text-emerald-400',
      number: 'bg-rose-500/20 text-rose-400',
    };
    const label = PARSE_TYPE_OPTIONS.find(o => o.value === type)?.label || type;
    return <Badge className={colors[type]}>{label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Traduções e formatações para humanizar dados técnicos nas evidências.
        </p>
        <Button onClick={openCreateDialog} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Novo Parse
        </Button>
      </div>

      {parses.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-border/50 rounded-lg">
          <Languages className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>Nenhum parse configurado.</p>
          <p className="text-xs mt-1">Parses são usados para traduzir campos técnicos para labels legíveis.</p>
        </div>
      ) : (
        <div className="border rounded-lg border-border/50 overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Campo Origem</TableHead>
                <TableHead>Label Exibido</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Visível</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parses.map((parse) => (
                <TableRow key={parse.id} className="border-border/50">
                  <TableCell>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {parse.source_field}
                    </code>
                  </TableCell>
                  <TableCell className="font-medium">
                    {parse.display_label}
                  </TableCell>
                  <TableCell>
                    {getParseTypeBadge(parse.parse_type)}
                  </TableCell>
                  <TableCell>
                    {parse.is_hidden ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-primary" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={parse.is_active ? 'default' : 'secondary'}>
                      {parse.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(parse)}
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDeleteDialog(parse)}
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
        <DialogContent className="border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedParse ? 'Editar Parse' : 'Novo Parse'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="source_field">Campo Origem *</Label>
              <Input
                id="source_field"
                value={formData.source_field}
                onChange={(e) => setFormData({ ...formData, source_field: e.target.value })}
                placeholder="Ex: data.has_dnskey"
              />
              <p className="text-xs text-muted-foreground">
                Caminho do campo no JSON de evidências
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_label">Label de Exibição *</Label>
              <Input
                id="display_label"
                value={formData.display_label}
                onChange={(e) => setFormData({ ...formData, display_label: e.target.value })}
                placeholder="Ex: Status DNSSEC"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parse_type">Tipo de Parse</Label>
              <Select
                value={formData.parse_type}
                onValueChange={(value: ParseType) => setFormData({ ...formData, parse_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARSE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="value_transformations">Transformações de Valor</Label>
              <Textarea
                id="value_transformations"
                value={formData.value_transformations}
                onChange={(e) => setFormData({ ...formData, value_transformations: e.target.value })}
                placeholder='{"true": "Ativado", "false": "Desativado"}'
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                JSON com mapeamento de valores técnicos para legíveis
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="format_options">Opções de Formatação</Label>
              <Textarea
                id="format_options"
                value={formData.format_options}
                onChange={(e) => setFormData({ ...formData, format_options: e.target.value })}
                placeholder='{"time_unit": "seconds"}'
                rows={2}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_hidden">Ocultar na UI</Label>
                <p className="text-xs text-muted-foreground">
                  Se marcado, este campo não será exibido
                </p>
              </div>
              <Switch
                id="is_hidden"
                checked={formData.is_hidden}
                onCheckedChange={(checked) => setFormData({ ...formData, is_hidden: checked })}
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

            <div className="space-y-2">
              <Label htmlFor="display_order">Ordem de Exibição</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {selectedParse ? 'Salvar' : 'Criar'}
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
            Tem certeza que deseja excluir o parse <strong>{selectedParse?.source_field}</strong>?
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
