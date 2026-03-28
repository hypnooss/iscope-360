import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  History,
  UserPlus,
  Shield,
  Settings,
  Building,
  AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toBRT } from '@/lib/dateUtils';

interface Administrator {
  id: string;
  email: string;
  full_name: string | null;
}

interface ActivityLog {
  id: string;
  action: string;
  action_type: string;
  target_type: string | null;
  target_name: string | null;
  details: unknown;
  created_at: string;
}

interface AdminActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admin: Administrator | null;
}

const ACTION_TYPE_CONFIG: Record<string, { icon: typeof History; color: string; label: string }> = {
  user_management: { icon: UserPlus, color: "text-blue-500", label: "Usuários" },
  admin_management: { icon: Shield, color: "text-amber-500", label: "Administração" },
  client_management: { icon: Building, color: "text-green-500", label: "Clientes" },
  system: { icon: Settings, color: "text-purple-500", label: "Sistema" },
  general: { icon: AlertCircle, color: "text-muted-foreground", label: "Geral" },
};

export function AdminActivityDialog({
  open,
  onOpenChange,
  admin,
}: AdminActivityDialogProps) {
  const [loading, setLoading] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (admin && open) {
      fetchActivityLogs();
    }
  }, [admin, open]);

  const fetchActivityLogs = async () => {
    if (!admin) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin_activity_logs")
        .select("*")
        .eq("admin_id", admin.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setActivityLogs(data || []);
    } catch (error) {
      console.error("Error fetching activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    const config = ACTION_TYPE_CONFIG[actionType] || ACTION_TYPE_CONFIG.general;
    const Icon = config.icon;
    return <Icon className={`w-4 h-4 ${config.color}`} />;
  };

  if (!admin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Atividades Recentes
          </DialogTitle>
          <DialogDescription>
            {admin.full_name || admin.email}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2 px-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <History className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma atividade registrada
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  As ações realizadas por este administrador aparecerão aqui
                </p>
              </div>
            ) : (
              activityLogs.map((log) => (
                <div key={log.id} className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {getActionIcon(log.action_type)}
                      <div>
                        <p className="text-sm">{log.action}</p>
                        {log.target_name && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Alvo: {log.target_name}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(toBRT(new Date(log.created_at)), "HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
