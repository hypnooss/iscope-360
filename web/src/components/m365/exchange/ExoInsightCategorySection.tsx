import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ChevronDown, 
  ArrowRightLeft,
  Users,
  Shield,
  Sparkles,
  Scale,
} from 'lucide-react';
import { ExchangeInsight, ExoInsightCategory, EXO_CATEGORY_LABELS, EXO_CATEGORY_COLORS, EXO_SEVERITY_CONFIG } from '@/types/exchangeInsights';
import { ExoInsightCard } from './ExoInsightCard';

interface ExoInsightCategorySectionProps {
  category: ExoInsightCategory;
  insights: ExchangeInsight[];
  defaultOpen?: boolean;
}

const categoryIcons: Record<ExoInsightCategory, React.ElementType> = {
  mail_flow: ArrowRightLeft,
  mailbox_access: Users,
  security_policies: Shield,
  security_hygiene: Sparkles,
  governance: Scale,
};

export function ExoInsightCategorySection({ 
  category, 
  insights, 
  defaultOpen = true 
}: ExoInsightCategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  if (insights.length === 0) return null;

  const categoryColors = EXO_CATEGORY_COLORS[category];
  const CategoryIcon = categoryIcons[category];

  // Count by severity
  const severityCounts = {
    critical: insights.filter(i => i.severity === 'critical').length,
    high: insights.filter(i => i.severity === 'high').length,
    medium: insights.filter(i => i.severity === 'medium').length,
    low: insights.filter(i => i.severity === 'low').length,
    info: insights.filter(i => i.severity === 'info').length,
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={`glass-card border ${categoryColors.border}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${categoryColors.bg}`}>
                  <CategoryIcon className={`w-5 h-5 ${categoryColors.text}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">
                    {EXO_CATEGORY_LABELS[category]}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {insights.length} insight(s) encontrado(s)
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Severity badges */}
                {severityCounts.critical > 0 && (
                  <Badge variant="outline" className={`text-xs ${EXO_SEVERITY_CONFIG.critical.color} ${EXO_SEVERITY_CONFIG.critical.borderColor}`}>
                    {severityCounts.critical} Crítico
                  </Badge>
                )}
                {severityCounts.high > 0 && (
                  <Badge variant="outline" className={`text-xs ${EXO_SEVERITY_CONFIG.high.color} ${EXO_SEVERITY_CONFIG.high.borderColor}`}>
                    {severityCounts.high} Alto
                  </Badge>
                )}
                {severityCounts.medium > 0 && (
                  <Badge variant="outline" className={`text-xs ${EXO_SEVERITY_CONFIG.medium.color} ${EXO_SEVERITY_CONFIG.medium.borderColor}`}>
                    {severityCounts.medium} Médio
                  </Badge>
                )}
                
                <ChevronDown 
                  className={`w-5 h-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} 
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-3">
            {insights.map((insight) => (
              <ExoInsightCard key={insight.id} insight={insight} />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
