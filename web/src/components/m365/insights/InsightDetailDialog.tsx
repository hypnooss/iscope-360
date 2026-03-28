import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Users,
  Lightbulb,
  FileSearch,
  Clock,
} from 'lucide-react';
import { SecurityInsight, SEVERITY_CONFIG, CATEGORY_LABELS } from '@/types/securityInsights';
import { formatDateTimeLongBR } from '@/lib/dateUtils';

interface InsightDetailDialogProps {
  insight: SecurityInsight;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SEVERITY_ICONS = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
  info: Info,
};

export function InsightDetailDialog({ insight, open, onOpenChange }: InsightDetailDialogProps) {
  const severityConfig = SEVERITY_CONFIG[insight.severity];
  const SeverityIcon = SEVERITY_ICONS[insight.severity];

  const formatDate = (dateStr: string) => {
    return formatDateTimeLongBR(dateStr);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${severityConfig.bgColor}`}>
              <SeverityIcon className={`w-5 h-5 ${severityConfig.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge 
                  variant="outline" 
                  className={`${severityConfig.bgColor} ${severityConfig.color} border-0 text-xs font-medium`}
                >
                  {severityConfig.label}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {insight.code}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[insight.category]}
                </Badge>
              </div>
              <DialogTitle className="text-lg">{insight.title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="mt-2">
            {insight.description}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {/* Critério */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileSearch className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">Critério de Detecção</h4>
              </div>
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                {insight.criteria}
              </p>
            </div>

            {/* Recomendação */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <h4 className="font-medium text-sm">Recomendação</h4>
              </div>
              <p className="text-sm text-muted-foreground bg-amber-500/5 border border-amber-500/20 p-3 rounded-lg">
                {insight.recommendation}
              </p>
            </div>

            {/* Período analisado */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">Período Analisado</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(insight.timeRange.from)} até {formatDate(insight.timeRange.to)}
              </p>
            </div>

            <Separator />

            {/* Usuários afetados */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">
                  Usuários Afetados ({insight.affectedCount})
                </h4>
              </div>
              
              {insight.affectedUsers.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {insight.affectedUsers.map((user, index) => (
                    <div 
                      key={user.id || index}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {user.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.userPrincipalName}
                        </p>
                      </div>
                      {user.details && Object.keys(user.details).length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-4">
                          {Object.entries(user.details).slice(0, 2).map(([key, value]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {typeof value === 'object' 
                                ? Array.isArray(value) 
                                  ? value.join(', ') 
                                  : JSON.stringify(value)
                                : String(value)
                              }
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {insight.affectedCount > insight.affectedUsers.length && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      ... e mais {insight.affectedCount - insight.affectedUsers.length} usuário(s)
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Detalhes dos usuários não disponíveis
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
