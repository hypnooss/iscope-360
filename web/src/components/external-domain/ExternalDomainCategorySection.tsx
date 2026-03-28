import { useState } from 'react';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Shield } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { ComplianceCategory, ComplianceCheck } from '@/types/compliance';
import { ComplianceCard } from '@/components/ComplianceCard';
import { ComplianceDetailSheet } from '@/components/compliance/ComplianceDetailSheet';
import { mapComplianceCheck } from '@/lib/complianceMappers';
import { 
  getCategoryConfig, 
  AVAILABLE_COLORS,
  type CategoryConfig,
  DEFAULT_CATEGORY_CONFIGS,
} from '@/hooks/useCategoryConfig';

interface ExternalDomainCategorySectionProps {
  category: ComplianceCategory;
  index: number;
  defaultOpen?: boolean;
  categoryConfigs?: CategoryConfig[];
}

// Dynamic icon component
function DynamicIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
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

export function ExternalDomainCategorySection({ 
  category, 
  index,
  defaultOpen = true,
  categoryConfigs
}: ExternalDomainCategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [selectedCheck, setSelectedCheck] = useState<ComplianceCheck | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  
  // Get config from database or use defaults
  const config = getCategoryConfig(categoryConfigs, category.name);
  const colorOption = AVAILABLE_COLORS.find(c => c.name === config.color);
  const colorHex = colorOption?.hex || '#64748b';

  // Count failures by severity (only active/failing items)
  const criticalCount = category.checks.filter(
    c => c.status === 'fail' && c.severity === 'critical'
  ).length;

  const highCount = category.checks.filter(
    c => c.status === 'fail' && c.severity === 'high'
  ).length;

  const mediumCount = category.checks.filter(
    c => c.status === 'fail' && c.severity === 'medium'
  ).length;

  const lowCount = category.checks.filter(
    c => c.status === 'fail' && c.severity === 'low'
  ).length;

  // Get pass rate color based on percentage
  const getPassRateColor = (passRate: number) => {
    if (passRate >= 80) return 'text-emerald-500';
    if (passRate >= 60) return 'text-amber-500';
    return 'text-red-500';
  };

  const handleCheckClick = (check: ComplianceCheck) => {
    setSelectedCheck(check);
    setSheetOpen(true);
  };

  if (category.checks.length === 0) return null;

  return (
    <div 
      className="animate-slide-in"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between h-auto py-4 px-4 rounded-lg"
            style={{
              backgroundColor: `${colorHex}10`,
              borderColor: `${colorHex}30`,
              borderWidth: '1px',
            }}
          >
            <div className="flex items-center gap-3">
              <div 
                className="p-2 rounded-lg"
                style={{ backgroundColor: `${colorHex}15` }}
              >
                <DynamicIcon 
                  name={config.icon} 
                  className="w-5 h-5" 
                  style={{ color: colorHex }}
                />
              </div>
              <span className="text-base font-semibold text-foreground">{config.displayName}</span>
              <Badge variant="secondary" className="text-xs">
                {category.checks.length} verificaç{category.checks.length !== 1 ? 'ões' : 'ão'}
              </Badge>
              {criticalCount > 0 && (
                <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">
                  {criticalCount} crítico{criticalCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {highCount > 0 && (
                <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs">
                  {highCount} alto{highCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {mediumCount > 0 && (
                <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-xs">
                  {mediumCount} médio{mediumCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {lowCount > 0 && (
                <Badge className="bg-blue-400/10 text-blue-400 border-blue-400/20 text-xs">
                  {lowCount} baixo{lowCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className={`text-lg font-semibold tabular-nums ${getPassRateColor(category.passRate)}`}>
                {category.passRate}%
              </span>
              {isOpen ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent 
          className="pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 pl-4 ml-6 mb-6"
          style={{ 
            borderLeftWidth: '2px',
            borderLeftColor: `${colorHex}30`,
          }}
        >
          {category.checks.map((check) => (
            <ComplianceCard 
              key={check.id} 
              check={check} 
              variant="external_domain" 
              categoryColorKey={config.color}
              onClick={() => handleCheckClick(check)}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      <ComplianceDetailSheet
        item={selectedCheck ? mapComplianceCheck(selectedCheck) : null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
