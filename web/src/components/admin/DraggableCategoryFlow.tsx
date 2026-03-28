import { useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield,
  CheckCircle,
  Layers,
  Terminal,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CategoryConfigPopover } from './CategoryConfigPopover';
import { CreateCategoryDialog } from './CreateCategoryDialog';
import { 
  useCategoryConfigs, 
  getCategoryConfig, 
  AVAILABLE_COLORS,
  type CategoryConfig 
} from '@/hooks/useCategoryConfig';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ComplianceRuleBasic } from '@/types/complianceRule';

// Types
interface CollectionStep {
  id: string;
  executor: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
}

interface Blueprint {
  id: string;
  name: string;
  description: string | null;
  collection_steps: {
    steps: CollectionStep[];
  };
}

// Using simplified type for visualization
type ComplianceRule = ComplianceRuleBasic;

interface DraggableCategoryFlowProps {
  blueprint: Blueprint;
  rules: ComplianceRule[];
  hideSummary?: boolean;
  deviceTypeId?: string;
  onRulesChange?: () => void;
}

// Dynamic icon component
function DynamicCategoryIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const iconName = name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') as keyof typeof LucideIcons;
  
  const IconComponent = LucideIcons[iconName] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  
  if (!IconComponent) {
    return <Shield className={className} style={style} />;
  }
  
  return <IconComponent className={className} style={style} />;
}

// Severity colors
const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  info: 'bg-muted text-muted-foreground border-border',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Info',
};

// Draggable Rule Card
interface DraggableRuleCardProps {
  rule: ComplianceRule;
  index: number;
}

function DraggableRuleCard({ rule, index }: DraggableRuleCardProps) {
  return (
    <Draggable draggableId={rule.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "border rounded-lg bg-card p-3 flex items-center gap-3 transition-shadow",
            snapshot.isDragging && "shadow-lg ring-2 ring-primary"
          )}
        >
          <div
            {...provided.dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="w-4 h-4" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs font-mono font-semibold text-foreground">
                {rule.code}
              </code>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm font-medium text-foreground truncate">
                {rule.name}
              </span>
            </div>
          </div>
          
          <Badge 
            className={cn(
              "text-xs border shrink-0",
              SEVERITY_COLORS[rule.severity] || SEVERITY_COLORS.info
            )}
          >
            {SEVERITY_LABELS[rule.severity] || rule.severity}
          </Badge>
          
          {!rule.is_active && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Inativa
            </Badge>
          )}
        </div>
      )}
    </Draggable>
  );
}

// Droppable Category Section
interface DroppableCategorySectionProps {
  category: string;
  rules: ComplianceRule[];
  deviceTypeId?: string;
  categoryConfigs?: CategoryConfig[];
  onCategoryDeleted?: () => void;
}

function DroppableCategorySection({ 
  category, 
  rules, 
  deviceTypeId, 
  categoryConfigs,
  onCategoryDeleted
}: DroppableCategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const config = getCategoryConfig(categoryConfigs, category);
  const colorOption = AVAILABLE_COLORS.find(c => c.name === config.color);
  const colorHex = colorOption?.hex || '#64748b';
  
  const activeRules = rules.filter(r => r.is_active).length;
  
  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div 
        className="border-l-4 rounded-lg"
        style={{ 
          borderLeftColor: colorHex,
          backgroundColor: `${colorHex}10`
        }}
      >
        {/* Category Header */}
        <CollapsibleTrigger asChild>
          <button className="w-full p-4 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DynamicCategoryIcon 
                  name={config.icon} 
                  className="w-5 h-5" 
                  style={{ color: colorHex }}
                />
                <span className="font-semibold" style={{ color: colorHex }}>
                  {config.displayName}
                </span>
                <Badge variant="outline" className="text-xs">
                  {activeRules}/{rules.length} regras
                </Badge>
                {deviceTypeId && (
                  <CategoryConfigPopover
                    categoryName={category}
                    deviceTypeId={deviceTypeId}
                    configs={categoryConfigs}
                    rulesCount={rules.length}
                    onDeleted={onCategoryDeleted}
                  />
                )}
              </div>
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        
        {/* Rules List - Droppable */}
        <CollapsibleContent>
          <Droppable droppableId={category}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  "px-4 pb-4 space-y-2 min-h-[60px] transition-colors rounded-b-lg",
                  snapshot.isDraggingOver && "bg-primary/5"
                )}
              >
                {rules.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground border-2 border-dashed border-border/50 rounded-lg">
                    Arraste regras para esta categoria
                  </div>
                ) : (
                  rules
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map((rule, index) => (
                      <DraggableRuleCard 
                        key={rule.id} 
                        rule={rule} 
                        index={index}
                      />
                    ))
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function DraggableCategoryFlow({ 
  blueprint, 
  rules, 
  hideSummary, 
  deviceTypeId,
  onRulesChange 
}: DraggableCategoryFlowProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [localRules, setLocalRules] = useState(rules);
  const steps = blueprint.collection_steps?.steps || [];
  
  // Fetch category configs from database
  const { data: categoryConfigs, refetch: refetchConfigs } = useCategoryConfigs(deviceTypeId);
  
  // Update local rules when props change
  useMemo(() => {
    setLocalRules(rules);
  }, [rules]);
  
  // Group rules by category
  const rulesByCategory = useMemo(() => {
    const map: Record<string, ComplianceRule[]> = {};
    
    // Include empty categories from configs
    if (categoryConfigs) {
      categoryConfigs.forEach(config => {
        if (!map[config.name]) {
          map[config.name] = [];
        }
      });
    }
    
    localRules.forEach((rule) => {
      const category = rule.category;
      if (!map[category]) {
        map[category] = [];
      }
      map[category].push(rule);
    });
    
    return map;
  }, [localRules, categoryConfigs]);
  
  // Get sorted categories
  const sortedCategories = useMemo(() => {
    const categories = Object.keys(rulesByCategory);
    
    // Sort by display_order from configs, then alphabetically
    return categories.sort((a, b) => {
      const configA = categoryConfigs?.find(c => c.name === a);
      const configB = categoryConfigs?.find(c => c.name === b);
      
      const orderA = configA?.display_order ?? 999;
      const orderB = configB?.display_order ?? 999;
      
      if (orderA !== orderB) return orderA - orderB;
      return a.localeCompare(b);
    });
  }, [rulesByCategory, categoryConfigs]);
  
  // Count active rules
  const activeRulesCount = useMemo(() => {
    return localRules.filter(r => r.is_active).length;
  }, [localRules]);
  
  // Handle drag end
  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    
    // Dropped outside a droppable
    if (!destination) return;
    
    // Same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) return;
    
    // Find the rule
    const rule = localRules.find(r => r.id === draggableId);
    if (!rule) return;
    
    const newCategory = destination.droppableId;
    
    // If category changed, update in database
    if (newCategory !== source.droppableId) {
      // Optimistic update
      setLocalRules(prev => 
        prev.map(r => 
          r.id === draggableId 
            ? { ...r, category: newCategory }
            : r
        )
      );
      
      try {
        const { error } = await supabase
          .from('compliance_rules')
          .update({ category: newCategory })
          .eq('id', draggableId);
        
        if (error) throw error;
        
        toast.success(`Regra movida para "${newCategory}"`);
        onRulesChange?.();
      } catch (error: any) {
        // Revert on error
        setLocalRules(rules);
        toast.error('Erro ao mover regra: ' + error.message);
      }
    }
  };
  
  if (rules.length === 0 && (!categoryConfigs || categoryConfigs.length === 0)) {
    return (
      <div className="space-y-4">
        {deviceTypeId && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nova Categoria
            </Button>
          </div>
        )}
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Nenhuma regra de compliance configurada para este dispositivo.</p>
        </div>
        
        {deviceTypeId && (
          <CreateCategoryDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            deviceTypeId={deviceTypeId}
            existingCategories={sortedCategories}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with New Category button */}
      <div className="flex items-center justify-between">
        {!hideSummary && (
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span><strong className="text-foreground">{localRules.length}</strong> regras</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <span><strong className="text-foreground">{activeRulesCount}</strong> ativas</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span><strong className="text-foreground">{sortedCategories.length}</strong> categorias</span>
            </div>
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              <span><strong className="text-foreground">{steps.length}</strong> steps</span>
            </div>
          </div>
        )}
        
        {deviceTypeId && (
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nova Categoria
          </Button>
        )}
      </div>
      
      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Arraste as regras entre categorias para reorganizá-las. As alterações são salvas automaticamente.
      </p>

      {/* Categories List with Drag and Drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {sortedCategories.map((category) => (
            <DroppableCategorySection
              key={category}
              category={category}
              rules={rulesByCategory[category]}
              deviceTypeId={deviceTypeId}
              categoryConfigs={categoryConfigs}
              onCategoryDeleted={refetchConfigs}
            />
          ))}
        </div>
      </DragDropContext>
      
      {/* Create Category Dialog */}
      {deviceTypeId && (
        <CreateCategoryDialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) refetchConfigs();
          }}
          deviceTypeId={deviceTypeId}
          existingCategories={sortedCategories}
        />
      )}
    </div>
  );
}
