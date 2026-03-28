import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, X, Settings, Info, AlertCircle, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { getAlertAgeMs, getAlertLifetimeMs } from './alertLifetime';
import { useAlertAutoHide } from './useAlertAutoHide';

interface SystemAlert {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  severity: string;
  metadata: Record<string, unknown>;
  created_at: string;
  dismissed_by?: string[];
}

async function fetchActiveAlerts(userId: string, role: string | null): Promise<SystemAlert[]> {
  const { data, error } = await supabase
    .from('system_alerts')
    .select('id, alert_type, title, message, severity, metadata, created_at, dismissed_by')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching alerts:', error);
    return [];
  }

  // Filter dismissed by current user
  const filteredData = (data || []).filter(alert => {
    const dismissedBy = alert.dismissed_by || [];
    return !dismissedBy.includes(userId);
  });

  // Role-based filtering
  const canSeeM365 = ['super_admin', 'super_suporte'].includes(role || '');
  const roleFiltered = filteredData.filter((alert) => {
    if (alert.alert_type?.startsWith('m365_')) return canSeeM365;
    if (alert.alert_type?.startsWith('attack_surface_')) return canSeeM365;
    return true;
  });

  // Filter expired alerts by UI lifetime
  const nowMs = Date.now();
  const notExpired = roleFiltered.filter((alert) => {
    const ageMs = getAlertAgeMs(alert.created_at, nowMs);
    const lifetimeMs = getAlertLifetimeMs(alert.alert_type);
    return ageMs < lifetimeMs;
  });

  // Sort by severity (error > warning > success > info)
  const severityOrder: Record<string, number> = { error: 0, warning: 1, success: 2, info: 3 };
  return notExpired.sort((a, b) =>
    (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
  ) as SystemAlert[];
}

const ALERT_QUERY_KEY = ['system-alerts-active'];
const PREFS_QUERY_KEY = ['notification-preferences'];

interface NotifPrefs {
  m365_analyzer_critical: boolean;
  m365_general: boolean;
  firewall_analysis: boolean;
  external_domain_analysis: boolean;
  attack_surface: boolean;
}

function alertMatchesPrefs(alertType: string, prefs: NotifPrefs): boolean {
  if (alertType === 'm365_analyzer_critical') return prefs.m365_analyzer_critical;
  if (alertType.startsWith('m365_')) return prefs.m365_general;
  if (alertType.startsWith('firewall_')) return prefs.firewall_analysis;
  if (alertType.startsWith('external_domain_')) return prefs.external_domain_analysis;
  if (alertType.startsWith('attack_surface_')) return prefs.attack_surface;
  return true; // unknown types always shown
}

export function SystemAlertBanner() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dismissedLocally, setDismissedLocally] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch notification preferences
  const { data: notifPrefs } = useQuery({
    queryKey: PREFS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('m365_analyzer_critical, m365_general, firewall_analysis, external_domain_analysis, attack_surface')
        .eq('user_id', user!.id)
        .maybeSingle();
      return (data as NotifPrefs | null) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 120_000,
  });

  // Single useQuery replaces manual fetching + polling
  const { data: alerts = [] } = useQuery({
    queryKey: ALERT_QUERY_KEY,
    queryFn: () => fetchActiveAlerts(user!.id, role),
    enabled: !!user?.id,
    staleTime: 60_000,        // 1 min — won't re-fetch within this window
    refetchInterval: 120_000, // 2 min passive polling (backup)
    retry: 1,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 30_000),
  });

  // Single Realtime subscription with debounced invalidation
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('system-alerts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_alerts' },
        () => {
          // Debounce: only invalidate once per 2s window
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ALERT_QUERY_KEY });
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const dismissAlert = async (alertId: string) => {
    if (!user?.id) return;
    // Optimistic local dismiss
    setDismissedLocally(prev => [...prev, alertId]);

    try {
      const { data: currentAlert } = await supabase
        .from('system_alerts')
        .select('dismissed_by')
        .eq('id', alertId)
        .single();

      if (currentAlert) {
        const dismissedBy = currentAlert.dismissed_by || [];
        if (!dismissedBy.includes(user.id)) {
          dismissedBy.push(user.id);
          await supabase
            .from('system_alerts')
            .update({ dismissed_by: dismissedBy })
            .eq('id', alertId);
        }
      }
    } catch (error) {
      console.error('Error dismissing alert:', error);
    }
  };

  const handleViewAnalysis = async (alertId: string) => {
    await dismissAlert(alertId);
    navigate(`/scope-firewall/compliance`);
  };

  const handleViewAnalyzer = async (alertId: string) => {
    await dismissAlert(alertId);
    navigate('/scope-m365/analyzer');
  };

  const handleViewExternalDomainReport = async (alertId: string, domainId: string, reportId: string) => {
    await dismissAlert(alertId);
    navigate(`/scope-external-domain/domains/${domainId}/report/${reportId}`);
  };

  const handleViewSettings = async (alertId: string) => {
    await dismissAlert(alertId);
    navigate('/settings');
  };

  // Filter locally dismissed + user preferences
  const visibleAlerts = alerts.filter(alert => {
    if (dismissedLocally.includes(alert.id)) return false;
    if (notifPrefs && !alertMatchesPrefs(alert.alert_type, notifPrefs)) return false;
    return true;
  });
  const primaryAlert = visibleAlerts[0] ?? null;

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'error':
        return {
          border: 'border-destructive/50', text: 'text-destructive',
          iconBg: 'bg-gradient-to-br from-destructive/20 to-destructive/5 border-destructive/30',
          buttonClass: 'border-destructive/50 text-destructive hover:bg-destructive/10',
          Icon: AlertCircle,
        };
      case 'warning':
        return {
          border: 'border-yellow-500/50', text: 'text-yellow-400',
          iconBg: 'bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 border-yellow-500/30',
          buttonClass: 'border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10',
          Icon: AlertTriangle,
        };
      case 'success':
        return {
          border: 'border-teal-500/50', text: 'text-teal-400',
          iconBg: 'bg-gradient-to-br from-teal-500/20 to-teal-500/5 border-teal-500/30',
          buttonClass: 'border-teal-500/50 text-teal-400 hover:bg-teal-500/10',
          Icon: Shield,
        };
      default:
        return {
          border: 'border-blue-500/50', text: 'text-blue-400',
          iconBg: 'bg-gradient-to-br from-blue-500/20 to-blue-500/5 border-blue-500/30',
          buttonClass: 'border-blue-500/50 text-blue-400 hover:bg-blue-500/10',
          Icon: Info,
        };
    }
  };

  const expireAlertLocally = useCallback(
    (alertId: string) => {
      setDismissedLocally((prev) => (prev.includes(alertId) ? prev : [...prev, alertId]));
    },
    []
  );

  useAlertAutoHide(primaryAlert, expireAlertLocally);

  if (!user?.id || !primaryAlert) return null;

  const styles = getSeverityStyles(primaryAlert.severity);
  const IconComponent = styles.Icon;

  return (
    <div className="w-full animate-in slide-in-from-top duration-300">
      <div className={cn("border-b shadow-lg", "bg-[hsl(222,47%,8%)]", styles.border)}>
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={cn("flex items-center justify-center w-10 h-10 rounded-full border", styles.iconBg)}>
              <IconComponent className={cn("h-5 w-5", styles.text)} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className={cn("font-semibold text-sm", styles.text)}>{primaryAlert.title}</span>
              <span className="text-xs text-muted-foreground truncate">{primaryAlert.message}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {primaryAlert.alert_type.startsWith('m365_') && primaryAlert.alert_type !== 'm365_analyzer_critical' && (
              <Button variant="outline" size="sm" className={cn("h-8 px-4 text-xs font-medium", styles.buttonClass)}
                onClick={() => handleViewSettings(primaryAlert.id)}>
                <Settings className="h-3.5 w-3.5 mr-1.5" />Ver Configurações
              </Button>
            )}
            {primaryAlert.alert_type === 'm365_analyzer_critical' && (
              <Button variant="outline" size="sm" className={cn("h-8 px-4 text-xs font-medium", styles.buttonClass)}
                onClick={() => handleViewAnalyzer(primaryAlert.id)}>
                <AlertCircle className="h-3.5 w-3.5 mr-1.5" />Ver Analyzer
              </Button>
            )}
            {primaryAlert.alert_type === 'firewall_analysis_completed' &&
              (primaryAlert.metadata as Record<string, unknown>)?.firewall_id && (
              <Button variant="outline" size="sm" className={cn("h-8 px-4 text-xs font-medium", styles.buttonClass)}
                onClick={() => handleViewAnalysis(primaryAlert.id)}>
                Ver Análise
              </Button>
            )}
            {primaryAlert.alert_type === 'external_domain_analysis_completed' &&
              (primaryAlert.metadata as Record<string, unknown>)?.domain_id &&
              (primaryAlert.metadata as Record<string, unknown>)?.report_id && (
              <Button variant="outline" size="sm" className={cn("h-8 px-4 text-xs font-medium", styles.buttonClass)}
                onClick={() => handleViewExternalDomainReport(
                  primaryAlert.id,
                  (primaryAlert.metadata as Record<string, unknown>).domain_id as string,
                  (primaryAlert.metadata as Record<string, unknown>).report_id as string
                )}>
                Ver Relatório
              </Button>
            )}
            <Button variant="ghost" size="icon" className={cn("h-8 w-8", styles.text)}
              onClick={() => dismissAlert(primaryAlert.id)} title="Dispensar alerta">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {visibleAlerts.length > 1 && (
          <div className="border-t border-border/50 px-6 py-1.5 text-center">
            <span className="text-xs text-muted-foreground">+{visibleAlerts.length - 1} outro(s) alerta(s)</span>
          </div>
        )}
      </div>
    </div>
  );
}
