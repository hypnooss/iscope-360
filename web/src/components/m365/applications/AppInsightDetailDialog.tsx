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
  Package,
  Lightbulb,
  FileSearch,
  Key,
  Calendar,
  Shield,
} from 'lucide-react';
import { ApplicationInsight, APP_SEVERITY_CONFIG, APP_CATEGORY_LABELS } from '@/types/applicationInsights';
import { formatDateTimeLongBR } from '@/lib/dateUtils';

interface AppInsightDetailDialogProps {
  insight: ApplicationInsight;
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

export function AppInsightDetailDialog({ insight, open, onOpenChange }: AppInsightDetailDialogProps) {
  const severityConfig = APP_SEVERITY_CONFIG[insight.severity];
  const SeverityIcon = SEVERITY_ICONS[insight.severity];

  const formatDate = (dateStr: string) => {
    return formatDateTimeLongBR(dateStr);
  };

  const formatDaysLeft = (days: number | undefined) => {
    if (days === undefined) return '';
    if (days < 0) return `Vencido há ${Math.abs(days)} dias`;
    if (days === 0) return 'Vence hoje';
    return `${days} dias restantes`;
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
                  {APP_CATEGORY_LABELS[insight.category]}
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

            <Separator />

            {/* Aplicativos afetados */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-muted-foreground" />
                <h4 className="font-medium text-sm">
                  Aplicativos Afetados ({insight.affectedCount})
                </h4>
              </div>
              
              {insight.affectedApplications.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {insight.affectedApplications.map((app, index) => (
                    <div 
                      key={app.id || index}
                      className="flex items-start justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">
                            {app.displayName}
                          </p>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {app.appType === 'AppRegistration' ? 'App Registration' : 'Enterprise App'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          App ID: {app.appId}
                        </p>
                        
                        {/* Details based on insight type */}
                        {app.details && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {app.details.credentialType && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Key className="w-3 h-3" />
                                {app.details.credentialType}
                              </Badge>
                            )}
                            {app.details.expiresAt && (
                              <Badge 
                                variant="outline" 
                                className={`text-xs gap-1 ${
                                  (app.details.daysUntilExpiration ?? 0) < 0 
                                    ? 'text-red-500 border-red-500/30' 
                                    : (app.details.daysUntilExpiration ?? 0) <= 30 
                                      ? 'text-orange-500 border-orange-500/30'
                                      : ''
                                }`}
                              >
                                <Calendar className="w-3 h-3" />
                                {formatDate(app.details.expiresAt)}
                                {app.details.daysUntilExpiration !== undefined && (
                                  <span className="ml-1">
                                    ({formatDaysLeft(app.details.daysUntilExpiration)})
                                  </span>
                                )}
                              </Badge>
                            )}
                            {app.details.permissions && app.details.permissions.length > 0 && (
                              <Badge variant="outline" className="text-xs gap-1 text-purple-500 border-purple-500/30">
                                <Shield className="w-3 h-3" />
                                {app.details.permissions.slice(0, 2).join(', ')}
                                {app.details.permissions.length > 2 && ` +${app.details.permissions.length - 2}`}
                              </Badge>
                            )}
                            {app.details.hasAdminConsent && (
                              <Badge className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/20">
                                Admin Consent
                              </Badge>
                            )}
                            {app.details.ownerCount === 0 && (
                              <Badge className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20">
                                Sem Owner
                              </Badge>
                            )}
                            {app.details.credentialCount === 1 && (
                              <Badge className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20">
                                1 credencial
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {insight.affectedCount > insight.affectedApplications.length && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      ... e mais {insight.affectedCount - insight.affectedApplications.length} aplicativo(s)
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  Detalhes dos aplicativos não disponíveis
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
