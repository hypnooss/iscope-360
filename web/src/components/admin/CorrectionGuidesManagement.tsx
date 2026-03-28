import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Edit2, Plus, Trash2, BookOpen, Clock, Gauge, CheckCircle2 } from 'lucide-react';
import { Json } from '@/integrations/supabase/types';

interface CorrectionGuidesManagementProps {
  deviceTypeId: string;
}

interface CorrectionGuide {
  id: string;
  rule_id: string;
  friendly_title: string | null;
  what_is: string | null;
  why_matters: string | null;
  impacts: string[];
  how_to_fix: string[];
  provider_examples: string[];
  difficulty: 'low' | 'medium' | 'high' | null;
  time_estimate: string | null;
  created_at: string;
  updated_at: string;
}

interface ComplianceRule {
  id: string;
  code: string;
  name: string;
  category: string;
}

interface GuideFormData {
  friendly_title: string;
  what_is: string;
  why_matters: string;
  impacts: string;
  how_to_fix: string;
  provider_examples: string;
  difficulty: 'low' | 'medium' | 'high';
  time_estimate: string;
}

const difficultyLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  low: { label: 'Baixa', variant: 'default' },
  medium: { label: 'Média', variant: 'secondary' },
  high: { label: 'Alta', variant: 'destructive' },
};

export function CorrectionGuidesManagement({ deviceTypeId }: CorrectionGuidesManagementProps) {
  const queryClient = useQueryClient();
  const [editingGuide, setEditingGuide] = useState<CorrectionGuide | null>(null);
  const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteGuideId, setDeleteGuideId] = useState<string | null>(null);
  const [formData, setFormData] = useState<GuideFormData>({
    friendly_title: '',
    what_is: '',
    why_matters: '',
    impacts: '',
    how_to_fix: '',
    provider_examples: '',
    difficulty: 'medium',
    time_estimate: '30 min',
  });

  // Fetch all compliance rules for this device type
  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['compliance-rules-for-guides', deviceTypeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_rules')
        .select('id, code, name, category')
        .eq('device_type_id', deviceTypeId)
        .order('category')
        .order('code');

      if (error) throw error;
      return data as ComplianceRule[];
    },
  });

  // Fetch all correction guides for this device type
  const { data: guides = [], isLoading: guidesLoading } = useQuery({
    queryKey: ['correction-guides', deviceTypeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rule_correction_guides')
        .select(`
          *,
          compliance_rules!inner(id, code, name, category, device_type_id)
        `)
        .eq('compliance_rules.device_type_id', deviceTypeId);

      if (error) throw error;
      
      return (data || []).map(g => ({
        ...g,
        impacts: Array.isArray(g.impacts) ? g.impacts : [],
        how_to_fix: Array.isArray(g.how_to_fix) ? g.how_to_fix : [],
        provider_examples: Array.isArray(g.provider_examples) ? g.provider_examples : [],
      })) as (CorrectionGuide & { compliance_rules: ComplianceRule })[];
    },
  });

  // Create guide mutation
  const createMutation = useMutation({
    mutationFn: async (data: { rule_id: string } & Partial<GuideFormData>) => {
      const { error } = await supabase.from('rule_correction_guides').insert({
        rule_id: data.rule_id,
        friendly_title: data.friendly_title || null,
        what_is: data.what_is || null,
        why_matters: data.why_matters || null,
        impacts: parseTextareaToArray(data.impacts || '') as unknown as Json,
        how_to_fix: parseTextareaToArray(data.how_to_fix || '') as unknown as Json,
        provider_examples: parseTextareaToArray(data.provider_examples || '') as unknown as Json,
        difficulty: data.difficulty || 'medium',
        time_estimate: data.time_estimate || '30 min',
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correction-guides', deviceTypeId] });
      toast.success('Guia de correção criado com sucesso');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Erro ao criar guia: ' + error.message);
    },
  });

  // Update guide mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string } & Partial<GuideFormData>) => {
      const { error } = await supabase
        .from('rule_correction_guides')
        .update({
          friendly_title: data.friendly_title || null,
          what_is: data.what_is || null,
          why_matters: data.why_matters || null,
          impacts: parseTextareaToArray(data.impacts || '') as unknown as Json,
          how_to_fix: parseTextareaToArray(data.how_to_fix || '') as unknown as Json,
          provider_examples: parseTextareaToArray(data.provider_examples || '') as unknown as Json,
          difficulty: data.difficulty || 'medium',
          time_estimate: data.time_estimate || '30 min',
        })
        .eq('id', data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correction-guides', deviceTypeId] });
      toast.success('Guia de correção atualizado');
      handleCloseDialog();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar guia: ' + error.message);
    },
  });

  // Delete guide mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rule_correction_guides').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['correction-guides', deviceTypeId] });
      toast.success('Guia de correção removido');
      setDeleteGuideId(null);
    },
    onError: (error) => {
      toast.error('Erro ao remover guia: ' + error.message);
    },
  });

  const parseTextareaToArray = (text: string): string[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const arrayToTextarea = (arr: string[] | undefined): string => {
    return (arr || []).join('\n');
  };

  const handleEdit = (guide: CorrectionGuide & { compliance_rules: ComplianceRule }) => {
    setEditingGuide(guide);
    setSelectedRule(guide.compliance_rules);
    setFormData({
      friendly_title: guide.friendly_title || '',
      what_is: guide.what_is || '',
      why_matters: guide.why_matters || '',
      impacts: arrayToTextarea(guide.impacts),
      how_to_fix: arrayToTextarea(guide.how_to_fix),
      provider_examples: arrayToTextarea(guide.provider_examples),
      difficulty: guide.difficulty || 'medium',
      time_estimate: guide.time_estimate || '30 min',
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = (rule: ComplianceRule) => {
    setEditingGuide(null);
    setSelectedRule(rule);
    setFormData({
      friendly_title: rule.name,
      what_is: '',
      why_matters: '',
      impacts: '',
      how_to_fix: '',
      provider_examples: '',
      difficulty: 'medium',
      time_estimate: '30 min',
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingGuide(null);
    setSelectedRule(null);
    setFormData({
      friendly_title: '',
      what_is: '',
      why_matters: '',
      impacts: '',
      how_to_fix: '',
      provider_examples: '',
      difficulty: 'medium',
      time_estimate: '30 min',
    });
  };

  const handleSubmit = () => {
    if (editingGuide) {
      updateMutation.mutate({ id: editingGuide.id, ...formData });
    } else if (selectedRule) {
      createMutation.mutate({ rule_id: selectedRule.id, ...formData });
    }
  };

  // Group rules by category and mark which have guides
  const guidesByRuleId = new Map(guides.map((g) => [g.rule_id, g]));
  const rulesByCategory = rules.reduce(
    (acc, rule) => {
      if (!acc[rule.category]) {
        acc[rule.category] = [];
      }
      acc[rule.category].push(rule);
      return acc;
    },
    {} as Record<string, ComplianceRule[]>
  );

  const isLoading = rulesLoading || guidesLoading;
  const guidesCount = guides.length;
  const rulesWithoutGuide = rules.filter((r) => !guidesByRuleId.has(r.id)).length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Guia de Correções</h3>
            <p className="text-sm text-muted-foreground">
              Configure os textos explicativos para cada regra de compliance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            {guidesCount} configurados
          </span>
          {rulesWithoutGuide > 0 && (
            <span className="flex items-center gap-1 text-amber-500">
              <Plus className="w-4 h-4" />
              {rulesWithoutGuide} pendentes
            </span>
          )}
        </div>
      </div>

      {/* Rules table grouped by category */}
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[120px]">Código</TableHead>
              <TableHead>Título Amigável</TableHead>
              <TableHead className="w-[100px]">Dificuldade</TableHead>
              <TableHead className="w-[100px]">Tempo</TableHead>
              <TableHead className="w-[100px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(rulesByCategory).map(([category, categoryRules]) => (
              <>
                {/* Category header row */}
                <TableRow key={`category-${category}`} className="bg-muted/30">
                  <TableCell colSpan={5} className="font-medium text-muted-foreground py-2">
                    {category}
                  </TableCell>
                </TableRow>
                {/* Rules in this category */}
                {categoryRules.map((rule) => {
                  const guide = guidesByRuleId.get(rule.id) as (CorrectionGuide & { compliance_rules: ComplianceRule }) | undefined;
                  const hasGuide = !!guide;

                  return (
                    <TableRow key={rule.id} className={!hasGuide ? 'opacity-60' : ''}>
                      <TableCell>
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                          {rule.code}
                        </code>
                      </TableCell>
                      <TableCell>
                        {hasGuide ? (
                          <span className="font-medium">{guide.friendly_title || rule.name}</span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            (sem guia configurado)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasGuide && guide.difficulty ? (
                          <Badge variant={difficultyLabels[guide.difficulty]?.variant || 'secondary'}>
                            {difficultyLabels[guide.difficulty]?.label || guide.difficulty}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hasGuide && guide.time_estimate ? (
                          <span className="flex items-center gap-1 text-sm">
                            <Clock className="w-3 h-3" />
                            {guide.time_estimate}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasGuide ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(guide)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteGuideId(guide.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddNew(rule)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Adicionar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {editingGuide ? 'Editar' : 'Criar'} Guia de Correção
              {selectedRule && (
                <code className="ml-2 bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                  {selectedRule.code}
                </code>
              )}
            </DialogTitle>
            <DialogDescription>
              Configure os textos que aparecerão no relatório PDF para esta regra
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="friendly_title">Título Amigável *</Label>
                <Input
                  id="friendly_title"
                  value={formData.friendly_title}
                  onChange={(e) =>
                    setFormData({ ...formData, friendly_title: e.target.value })
                  }
                  placeholder="Ex: Proteção contra emails falsos (DMARC)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="what_is">O que é *</Label>
                <Textarea
                  id="what_is"
                  value={formData.what_is}
                  onChange={(e) => setFormData({ ...formData, what_is: e.target.value })}
                  placeholder="Explicação simples do que é esta verificação"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="why_matters">Por que importa *</Label>
                <Textarea
                  id="why_matters"
                  value={formData.why_matters}
                  onChange={(e) =>
                    setFormData({ ...formData, why_matters: e.target.value })
                  }
                  placeholder="Por que o usuário deve se preocupar com isso"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="impacts">Impactos Possíveis (um por linha)</Label>
                <Textarea
                  id="impacts"
                  value={formData.impacts}
                  onChange={(e) => setFormData({ ...formData, impacts: e.target.value })}
                  placeholder="Clientes podem receber emails fraudulentos&#10;Perda de confiança e danos à reputação&#10;Emails legítimos podem ir para spam"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="how_to_fix">Como Corrigir (passos, um por linha)</Label>
                <Textarea
                  id="how_to_fix"
                  value={formData.how_to_fix}
                  onChange={(e) =>
                    setFormData({ ...formData, how_to_fix: e.target.value })
                  }
                  placeholder="Acesse o painel DNS do seu domínio&#10;Adicione um novo registro do tipo TXT&#10;Configure o valor conforme instruções"
                  rows={5}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Dificuldade</Label>
                  <Select
                    value={formData.difficulty}
                    onValueChange={(value: 'low' | 'medium' | 'high') =>
                      setFormData({ ...formData, difficulty: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">
                        <span className="flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-green-500" />
                          Baixa
                        </span>
                      </SelectItem>
                      <SelectItem value="medium">
                        <span className="flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-amber-500" />
                          Média
                        </span>
                      </SelectItem>
                      <SelectItem value="high">
                        <span className="flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-red-500" />
                          Alta
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="time_estimate">Tempo Estimado</Label>
                  <Input
                    id="time_estimate"
                    value={formData.time_estimate}
                    onChange={(e) =>
                      setFormData({ ...formData, time_estimate: e.target.value })
                    }
                    placeholder="30 min"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider_examples">Provedores (um por linha)</Label>
                  <Input
                    id="provider_examples"
                    value={formData.provider_examples}
                    onChange={(e) =>
                      setFormData({ ...formData, provider_examples: e.target.value })
                    }
                    placeholder="Cloudflare, AWS..."
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Salvando...'
                : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteGuideId} onOpenChange={() => setDeleteGuideId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este guia de correção? O relatório PDF usará
              textos genéricos para esta regra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGuideId && deleteMutation.mutate(deleteGuideId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
