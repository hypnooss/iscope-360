import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface Preferences {
  m365_analyzer_critical: boolean;
  m365_general: boolean;
  firewall_analysis: boolean;
  external_domain_analysis: boolean;
  attack_surface: boolean;
}

const DEFAULT_PREFS: Preferences = {
  m365_analyzer_critical: true,
  m365_general: true,
  firewall_analysis: true,
  external_domain_analysis: true,
  attack_surface: true,
};

const PREF_ITEMS: { key: keyof Preferences; label: string; description: string }[] = [
  { key: 'm365_analyzer_critical', label: 'Incidentes Críticos M365', description: 'Alertas de incidentes críticos detectados pelo Analyzer' },
  { key: 'm365_general', label: 'Alertas Gerais M365', description: 'Notificações de sincronização e configuração do M365' },
  { key: 'firewall_analysis', label: 'Análise de Firewall', description: 'Alertas quando análises de firewall são concluídas' },
  { key: 'external_domain_analysis', label: 'Análise de Domínio Externo', description: 'Alertas quando análises de domínios externos são concluídas' },
  { key: 'attack_surface', label: 'Superfície de Ataque', description: 'Alertas de monitoramento de superfície de ataque' },
];

export function NotificationPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('m365_analyzer_critical, m365_general, firewall_analysis, external_domain_analysis, attack_surface')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setPrefs(data as Preferences);
      } else {
        // Insert defaults
        await supabase.from('notification_preferences').insert({ user_id: user.id, ...DEFAULT_PREFS });
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const persistPrefs = useCallback(
    (updated: Preferences) => {
      if (!user?.id) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const { error } = await supabase
          .from('notification_preferences')
          .update({ ...updated, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        if (error) {
          toast({ title: 'Erro ao salvar preferências', description: error.message, variant: 'destructive' });
        }
      }, 500);
    },
    [user?.id, toast],
  );

  const toggle = (key: keyof Preferences) => {
    setPrefs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      persistPrefs(updated);
      return updated;
    });
  };

  if (!user?.id) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Preferências de Notificação
        </CardTitle>
        <CardDescription>Personalize quais alertas você deseja receber no banner do sistema.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Carregando preferências...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {PREF_ITEMS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div className="space-y-0.5 min-w-0">
                  <Label className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch checked={prefs[key]} onCheckedChange={() => toggle(key)} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
