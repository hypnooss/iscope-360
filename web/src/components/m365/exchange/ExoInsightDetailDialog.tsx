import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info,
  Mail,
  Lightbulb,
  ArrowRightLeft,
  Users,
  Shield,
  Sparkles,
  Scale,
} from 'lucide-react';
import { ExchangeInsight, EXO_SEVERITY_CONFIG, EXO_CATEGORY_LABELS, EXO_CATEGORY_COLORS, ExoInsightCategory } from '@/types/exchangeInsights';

interface ExoInsightDetailDialogProps {
  insight: ExchangeInsight;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const severityIcons = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
  info: Info,
};

const categoryIcons: Record<ExoInsightCategory, React.ElementType> = {
  mail_flow: ArrowRightLeft,
  mailbox_access: Users,
  security_policies: Shield,
  security_hygiene: Sparkles,
  governance: Scale,
};

export function ExoInsightDetailDialog({ insight, open, onOpenChange }: ExoInsightDetailDialogProps) {
  const severityConfig = EXO_SEVERITY_CONFIG[insight.severity];
  const categoryColors = EXO_CATEGORY_COLORS[insight.category];
  const SeverityIcon = severityIcons[insight.severity];
  const CategoryIcon = categoryIcons[insight.category];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge 
              variant="outline" 
              className={`${severityConfig.color} ${severityConfig.borderColor}`}
            >
              {severityConfig.label}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">
              {insight.code}
            </span>
            <Badge 
              variant="outline" 
              className={`${categoryColors.text} ${categoryColors.border}`}
            >
              <CategoryIcon className="w-3 h-3 mr-1" />
              {EXO_CATEGORY_LABELS[insight.category]}
            </Badge>
          </div>
          <DialogTitle className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${severityConfig.bgColor}`}>
              <SeverityIcon className={`w-5 h-5 ${severityConfig.color}`} />
            </div>
            {insight.title}
          </DialogTitle>
          <DialogDescription>{insight.description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Criteria */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2">Critério de Detecção</h4>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                {insight.criteria}
              </p>
            </div>

            {/* Recommendation */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Recomendação
              </h4>
              <p className="text-sm text-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                {insight.recommendation}
              </p>
            </div>

            {/* Affected Mailboxes */}
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                Mailboxes Afetadas ({insight.affectedCount})
              </h4>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {insight.affectedMailboxes.map((mailbox) => (
                  <Card key={mailbox.id} className="border-muted">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-foreground truncate">
                            {mailbox.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {mailbox.userPrincipalName}
                          </p>
                          
                          {/* Details */}
                          {mailbox.details && (
                            <div className="mt-2 text-xs space-y-1">
                              {mailbox.details.ruleName && (
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Regra:</span> {mailbox.details.ruleName}
                                </p>
                              )}
                              {mailbox.details.forwardTo && mailbox.details.forwardTo.length > 0 && (
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Encaminha para:</span>{' '}
                                  {(mailbox.details.forwardTo as string[]).join(', ')}
                                </p>
                              )}
                              {mailbox.details.redirectTo && mailbox.details.redirectTo.length > 0 && (
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Redireciona para:</span>{' '}
                                  {(mailbox.details.redirectTo as string[]).join(', ')}
                                </p>
                              )}
                              {mailbox.details.ruleCount && (
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Quantidade de regras:</span> {mailbox.details.ruleCount}
                                </p>
                              )}
                              {mailbox.details.autoReplyStatus && (
                                <p className="text-muted-foreground">
                                  <span className="font-medium">Status:</span> {mailbox.details.autoReplyStatus}
                                  {mailbox.details.externalAudience && ` (${mailbox.details.externalAudience})`}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
