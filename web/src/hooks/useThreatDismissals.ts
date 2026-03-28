import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ThreatDismissal {
  id: string;
  tenant_record_id: string;
  type: string;
  label: string;
  dismissed_by: string;
  reason: string | null;
  created_at: string;
}

export function useThreatDismissals(tenantRecordId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['threat-dismissals', tenantRecordId];

  const { data: dismissals = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!tenantRecordId) return [];
      const { data, error } = await supabase
        .from('m365_threat_dismissals' as any)
        .select('*')
        .eq('tenant_record_id', tenantRecordId);
      if (error) throw error;
      return (data ?? []) as unknown as ThreatDismissal[];
    },
    enabled: !!tenantRecordId,
  });

  const dismissedKeys = new Set(
    dismissals.map((d) => `${d.type}::${d.label}`)
  );

  const dismissMutation = useMutation({
    mutationFn: async ({ type, label, reason }: { type: string; label: string; reason?: string }) => {
      if (!tenantRecordId || !user?.id) throw new Error('Missing context');
      const { error } = await supabase
        .from('m365_threat_dismissals' as any)
        .insert({
          tenant_record_id: tenantRecordId,
          type,
          label,
          dismissed_by: user.id,
          reason: reason || null,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Item marcado como falso positivo');
    },
    onError: () => toast.error('Erro ao marcar como falso positivo'),
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ type, label }: { type: string; label: string }) => {
      if (!tenantRecordId) throw new Error('Missing context');
      const { error } = await supabase
        .from('m365_threat_dismissals' as any)
        .delete()
        .eq('tenant_record_id', tenantRecordId)
        .eq('type', type)
        .eq('label', label);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Item restaurado');
    },
    onError: () => toast.error('Erro ao restaurar item'),
  });

  return {
    dismissals,
    dismissedKeys,
    isLoading,
    dismiss: (type: string, label: string, reason?: string) => dismissMutation.mutate({ type, label, reason }),
    restore: (type: string, label: string) => restoreMutation.mutate({ type, label }),
    isDismissing: dismissMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}
