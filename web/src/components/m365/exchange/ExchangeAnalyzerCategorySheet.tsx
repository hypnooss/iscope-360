import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { M365RiskCategory, CATEGORY_LABELS, SEVERITY_CONFIG } from '@/types/m365Insights';
import type { ExchangeInsight } from '@/hooks/useExchangeOnlineInsights';

interface ExchangeAnalyzerCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: M365RiskCategory | null;
  insights: ExchangeInsight[];
}

export function ExchangeAnalyzerCategorySheet({
  open,
  onOpenChange,
  category,
  insights,
}: ExchangeAnalyzerCategorySheetProps) {
  if (!category) return null;

  const catInsights = insights.filter(i => i.category === category);
  const failInsights = catInsights.filter(i => i.status === 'fail');
  const passInsights = catInsights.filter(i => i.status === 'pass');
  const warnInsights = catInsights.filter(i => i.status === 'warn');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle className="text-lg">{CATEGORY_LABELS[category]}</SheetTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{catInsights.length} insights</Badge>
            {failInsights.length > 0 && (
              <Badge variant="outline" className="text-xs text-red-500 border-red-500/30">
                {failInsights.length} em falha
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Tabs defaultValue="fail" className="px-6">
          <TabsList className="w-full">
            <TabsTrigger value="fail" className="flex-1">Falhas ({failInsights.length})</TabsTrigger>
            <TabsTrigger value="warn" className="flex-1">Alertas ({warnInsights.length})</TabsTrigger>
            <TabsTrigger value="pass" className="flex-1">OK ({passInsights.length})</TabsTrigger>
          </TabsList>

          {(['fail', 'warn', 'pass'] as const).map(status => {
            const list = status === 'fail' ? failInsights : status === 'warn' ? warnInsights : passInsights;
            return (
              <TabsContent key={status} value={status}>
                <ScrollArea className="h-[calc(100vh-220px)]">
                  <div className="space-y-3 pb-6">
                    {list.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">Nenhum insight nesta categoria</p>
                    )}
                    {list.map(insight => {
                      const sevConfig = SEVERITY_CONFIG[insight.severity];
                      return (
                        <Card key={insight.id} className={cn('border-l-4', `border-l-${sevConfig.color.replace('text-', '')}`)}>
                          <CardHeader className="pb-2 pt-3 px-4">
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle className="text-sm font-semibold">{insight.name}</CardTitle>
                              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 shrink-0', sevConfig.color)}>
                                {sevConfig.label}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="px-4 pb-3">
                            <p className="text-xs text-muted-foreground mb-2">{insight.description}</p>
                            {insight.recommendation && (
                              <div className="bg-amber-500/5 border border-amber-500/20 rounded p-2 mt-2">
                                <p className="text-xs text-foreground">💡 {insight.recommendation}</p>
                              </div>
                            )}
                            {insight.affectedEntities && insight.affectedEntities.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {insight.affectedEntities.length} entidade(s) afetada(s)
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
            );
          })}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
