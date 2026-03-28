import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  Shield,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Layers,
  Terminal
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  useCategoryConfigs, 
  getCategoryConfig, 
  AVAILABLE_COLORS,
  type CategoryConfig 
} from '@/hooks/useCategoryConfig';
import { ComplianceRuleBasic } from '@/types/complianceRule';
import { RulePreviewCard } from './RulePreviewCard';

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

interface BlueprintFlowVisualizationProps {
  blueprint: Blueprint;
  rules: ComplianceRule[];
  hideSummary?: boolean;
  deviceTypeId?: string;
}

// Dynamic icon component for categories
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

// Helper to get category display order from configs
function getCategoryDisplayOrder(categoryConfigs: CategoryConfig[] | undefined, categoryName: string): number {
  const config = categoryConfigs?.find(c => c.name === categoryName);
  return config?.display_order ?? 999;
}

// Category Section Component
interface AdminCategorySectionProps {
  category: string;
  rules: ComplianceRule[];
  deviceTypeId?: string;
  categoryConfigs?: CategoryConfig[];
}

function AdminCategorySection({ category, rules, deviceTypeId, categoryConfigs }: AdminCategorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Get config from database or use defaults
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
              </div>
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        
        {/* Rules List */}
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3">
            {rules
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((rule) => (
                <RulePreviewCard 
                  key={rule.id} 
                  rule={rule}
                />
              ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function BlueprintFlowVisualization({ blueprint, rules, hideSummary, deviceTypeId }: BlueprintFlowVisualizationProps) {
  const steps = blueprint.collection_steps?.steps || [];
  
  // Fetch category configs from database
  const { data: categoryConfigs } = useCategoryConfigs(deviceTypeId);
  
  // Group rules by category
  const rulesByCategory = useMemo(() => {
    const map: Record<string, ComplianceRule[]> = {};
    
    rules.forEach((rule) => {
      const category = rule.category;
      if (!map[category]) {
        map[category] = [];
      }
      map[category].push(rule);
    });
    
    return map;
  }, [rules]);
  
  // Get sorted categories based on display_order from database
  const sortedCategories = useMemo(() => {
    const categories = Object.keys(rulesByCategory);
    return categories.sort((a, b) => {
      const orderA = getCategoryDisplayOrder(categoryConfigs, a);
      const orderB = getCategoryDisplayOrder(categoryConfigs, b);
      
      // If both have explicit order, use it
      if (orderA !== orderB) return orderA - orderB;
      
      // Fallback to alphabetical
      return a.localeCompare(b);
    });
  }, [rulesByCategory, categoryConfigs]);
  
  // Count active rules
  const activeRulesCount = useMemo(() => {
    return rules.filter(r => r.is_active).length;
  }, [rules]);
  
  if (rules.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Nenhuma regra de compliance configurada para este dispositivo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      {!hideSummary && (
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span><strong className="text-foreground">{rules.length}</strong> regras de compliance</span>
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
            <span><strong className="text-foreground">{steps.length}</strong> steps de coleta</span>
          </div>
        </div>
      )}
      
      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Visualização organizada por regras de compliance, espelhando o relatório exibido ao cliente. 
        Cada regra mostra os steps de coleta que a alimentam e os parses usados para traduzir os dados técnicos.
      </p>

      {/* Categories List */}
      <div className="space-y-4">
        {sortedCategories.map((category) => (
          <AdminCategorySection
            key={category}
            category={category}
            rules={rulesByCategory[category]}
            deviceTypeId={deviceTypeId}
            categoryConfigs={categoryConfigs}
          />
        ))}
      </div>
    </div>
  );
}
