import { useState } from 'react';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Shield, UserX, Scale } from 'lucide-react';
import { SecurityInsight, InsightCategory, CATEGORY_LABELS } from '@/types/securityInsights';
import { InsightCard } from './InsightCard';

interface InsightCategorySectionProps {
  category: InsightCategory;
  insights: SecurityInsight[];
  defaultOpen?: boolean;
}

const CATEGORY_ICONS: Record<InsightCategory, React.ElementType> = {
  identity_security: Shield,
  behavior_risk: UserX,
  governance: Scale,
};

const CATEGORY_COLORS: Record<InsightCategory, { bg: string; text: string; border: string }> = {
  identity_security: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-500',
    border: 'border-blue-500/30',
  },
  behavior_risk: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-500',
    border: 'border-purple-500/30',
  },
  governance: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
    border: 'border-emerald-500/30',
  },
};

export function InsightCategorySection({ 
  category, 
  insights, 
  defaultOpen = true 
}: InsightCategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const Icon = CATEGORY_ICONS[category];
  const colors = CATEGORY_COLORS[category];
  const label = CATEGORY_LABELS[category];

  const criticalCount = insights.filter(i => i.severity === 'critical').length;
  const highCount = insights.filter(i => i.severity === 'high').length;

  if (insights.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className={`w-full justify-between h-auto py-3 px-4 ${colors.bg} hover:${colors.bg} border ${colors.border} rounded-lg`}
        >
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 ${colors.text}`} />
            <span className="font-semibold text-foreground">{label}</span>
            <Badge variant="secondary" className="text-xs">
              {insights.length} insight{insights.length !== 1 ? 's' : ''}
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
          </div>
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4 space-y-4">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
