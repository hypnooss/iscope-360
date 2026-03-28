import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Shield, Globe, Server, Layers, Workflow, FileCode, CheckCircle, Code2, Plus, ArrowLeft, Loader2, Settings, BookOpen, FileText } from 'lucide-react';
import { BlueprintFlowVisualization } from '@/components/admin/BlueprintFlowVisualization';
import { DraggableCategoryFlow } from '@/components/admin/DraggableCategoryFlow';
import { ParsesManagement } from '@/components/admin/ParsesManagement';
import { TemplateRulesManagement } from '@/components/admin/TemplateRulesManagement';
import { TemplateBlueprintsManagement } from '@/components/admin/TemplateBlueprintsManagement';
import { CorrectionGuidesManagement } from '@/components/admin/CorrectionGuidesManagement';
import { ApiDocsManagement } from '@/components/admin/ApiDocsManagement';
import { ComplianceRuleDB } from '@/types/complianceRule';

// Map device codes to icons
const deviceIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  fortigate: Shield,
  sonicwall: Server,
  external_domain: Globe,
};

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
}

// Using centralized type from @/types/complianceRule
type ComplianceRule = ComplianceRuleDB;

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('blueprints');

  // Access control - only super_admin and super_suporte
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (!authLoading && role !== 'super_admin' && role !== 'super_suporte') {
      navigate('/dashboard');
      toast.error('Acesso restrito a Super Administradores');
    }
  }, [user, role, authLoading, navigate]);

  // Fetch template (device_type)
  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ['device-type', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_types')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!id && (role === 'super_admin' || role === 'super_suporte'),
  });

  // Fetch blueprints for this template
  const { data: blueprints = [], refetch: refetchBlueprints } = useQuery({
    queryKey: ['blueprints', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('device_blueprints')
        .select('*')
        .eq('device_type_id', id)
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []).map(bp => ({
        ...bp,
        collection_steps: bp.collection_steps as unknown as CollectionSteps,
      })) as Blueprint[];
    },
    enabled: !!user && !!id && (role === 'super_admin' || role === 'super_suporte'),
  });

  // Fetch compliance rules for this template
  const { data: rules = [], refetch: refetchRules } = useQuery({
    queryKey: ['compliance-rules', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_rules')
        .select('*')
        .eq('device_type_id', id)
        .order('category', { ascending: true });

      if (error) throw error;
      return (data || []).map(r => ({
        ...r,
        evaluation_logic: r.evaluation_logic as Record<string, any>,
      })) as ComplianceRule[];
    },
    enabled: !!user && !!id && (role === 'super_admin' || role === 'super_suporte'),
  });

  // Fetch parses count for this template
  const { data: parsesCount = 0 } = useQuery({
    queryKey: ['parses-count', id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('evidence_parses')
        .select('*', { count: 'exact', head: true })
        .eq('device_type_id', id);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user && !!id && (role === 'super_admin' || role === 'super_suporte'),
  });

  // Fetch correction guides count for this template
  const { data: guidesCount = 0 } = useQuery({
    queryKey: ['guides-count', id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('rule_correction_guides')
        .select('*, compliance_rules!inner(device_type_id)', { count: 'exact', head: true })
        .eq('compliance_rules.device_type_id', id);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user && !!id && (role === 'super_admin' || role === 'super_suporte'),
  });

  // Fetch API docs count for this template
  const { data: apiDocsCount = 0 } = useQuery({
    queryKey: ['api-docs-count', id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('device_type_api_docs' as any)
        .select('*', { count: 'exact', head: true })
        .eq('device_type_id', id);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user && !!id && (role === 'super_admin' || role === 'super_suporte'),
  });

  if (authLoading || templateLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8 space-y-6">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Template não encontrado</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/templates')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Templates
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const IconComponent = deviceIconMap[template.code] || Layers;
  const activeBlueprint = blueprints.find(bp => bp.is_active);
  const activeRulesCount = rules.filter(r => r.is_active).length;
  const categories = [...new Set(rules.map(r => r.category))];
  const stepsCount = activeBlueprint?.collection_steps?.steps?.length || 0;

  // Virtual blueprint for templates without blueprints (like M365 that uses Graph API directly)
  const virtualBlueprint: Blueprint = {
    id: 'virtual',
    name: 'Virtual Blueprint',
    description: null,
    device_type_id: id!,
    version: '1.0',
    collection_steps: { steps: [] },
    is_active: false,
    created_at: new Date().toISOString(),
  };

  // Use virtual blueprint for visualization when there are rules but no active blueprint
  const blueprintForVisualization = activeBlueprint || (rules.length > 0 ? virtualBlueprint : null);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 space-y-6">
        <PageBreadcrumb
          items={[
            { label: 'Administração' },
            { label: 'Templates', href: '/templates' },
            { label: template.name },
          ]}
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <IconComponent className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">
                  {template.vendor} - {template.name}
                </h1>
                <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                  {template.code}
                </code>
                <Badge variant={template.is_active ? 'default' : 'secondary'}>
                  {template.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Active Blueprint Summary */}
        {activeBlueprint && (
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Blueprint Ativo:</span>
              <span>{activeBlueprint.name}</span>
              <Badge variant="outline" className="ml-2">{activeBlueprint.version}</Badge>
            </div>
            <div className="flex items-center gap-6 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                {rules.length} regras de compliance
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                {activeRulesCount} ativas
              </span>
              <span className="flex items-center gap-1">
                <Layers className="w-4 h-4" />
                {categories.length} categorias
              </span>
              <span className="flex items-center gap-1">
                <Code2 className="w-4 h-4" />
                {stepsCount} steps de coleta
              </span>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="blueprints" className="gap-2">
              <FileCode className="w-4 h-4" />
              Blueprints
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {blueprints.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <CheckCircle className="w-4 h-4" />
              Regras
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {rules.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="parses" className="gap-2">
              <Code2 className="w-4 h-4" />
              Parses
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {parsesCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="flow" className="gap-2">
              <Workflow className="w-4 h-4" />
              Fluxo de Análise
            </TabsTrigger>
            <TabsTrigger value="organize" className="gap-2">
              <Settings className="w-4 h-4" />
              Visualização
            </TabsTrigger>
            <TabsTrigger value="guides" className="gap-2">
              <BookOpen className="w-4 h-4" />
              Guia de Correções
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {guidesCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="api-docs" className="gap-2">
              <FileText className="w-4 h-4" />
              Documentação API
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {apiDocsCount}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blueprints" className="mt-6">
            <TemplateBlueprintsManagement
              deviceTypeId={id!}
              deviceTypeName={template.name}
              onRefresh={refetchBlueprints}
            />
          </TabsContent>

          <TabsContent value="rules" className="mt-6">
            <TemplateRulesManagement
              deviceTypeId={id!}
              onRefresh={refetchRules}
            />
          </TabsContent>

          <TabsContent value="parses" className="mt-6">
            <ParsesManagement deviceTypeId={id!} />
          </TabsContent>

          <TabsContent value="flow" className="mt-6">
            {activeBlueprint ? (
              <BlueprintFlowVisualization
                blueprint={activeBlueprint}
                rules={rules}
                hideSummary
                deviceTypeId={id}
              />
            ) : (
              <div className="text-center py-12 border border-dashed border-border/50 rounded-lg">
                <FileCode className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Nenhum blueprint ativo encontrado</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setActiveTab('blueprints')}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Blueprint
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="organize" className="mt-6">
            {blueprintForVisualization ? (
              <DraggableCategoryFlow
                blueprint={blueprintForVisualization}
                rules={rules}
                hideSummary
                deviceTypeId={id}
                onRulesChange={refetchRules}
              />
            ) : (
              <div className="text-center py-12 border border-dashed border-border/50 rounded-lg">
                <Settings className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Nenhuma regra de compliance configurada</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setActiveTab('rules')}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Regra
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="guides" className="mt-6">
            <CorrectionGuidesManagement deviceTypeId={id!} />
          </TabsContent>

          <TabsContent value="api-docs" className="mt-6">
            <ApiDocsManagement deviceTypeId={id!} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
