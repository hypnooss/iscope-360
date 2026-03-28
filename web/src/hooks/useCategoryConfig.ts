import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CategoryConfig {
  id: string;
  device_type_id: string;
  name: string;
  display_name: string | null;
  icon: string;
  color: string;
  display_order: number;
  is_active: boolean;
}

export interface CategoryConfigInput {
  device_type_id: string;
  name: string;
  display_name?: string | null;
  icon: string;
  color: string;
  display_order?: number;
}

// Available icons for selection
export const AVAILABLE_ICONS = [
  { name: 'shield', label: 'Escudo' },
  { name: 'globe', label: 'Globo' },
  { name: 'mail', label: 'Email' },
  { name: 'lock', label: 'Cadeado' },
  { name: 'key', label: 'Chave' },
  { name: 'server', label: 'Servidor' },
  { name: 'network', label: 'Rede' },
  { name: 'activity', label: 'Atividade' },
  { name: 'alert-triangle', label: 'Alerta' },
  { name: 'check-circle', label: 'Verificado' },
  { name: 'database', label: 'Banco de Dados' },
  { name: 'hard-drive', label: 'Armazenamento' },
  { name: 'cpu', label: 'Processador' },
  { name: 'settings', label: 'Configurações' },
  { name: 'user', label: 'Usuário' },
  { name: 'shield-check', label: 'Escudo Check' },
  { name: 'shield-alert', label: 'Escudo Alerta' },
  { name: 'key-round', label: 'Chave Redonda' },
] as const;

// Available colors for selection
export const AVAILABLE_COLORS = [
  { name: 'cyan-600', label: 'Ciano', hex: '#0891b2' },
  { name: 'violet-500', label: 'Violeta', hex: '#8b5cf6' },
  { name: 'emerald-600', label: 'Esmeralda', hex: '#059669' },
  { name: 'pink-500', label: 'Rosa', hex: '#ec4899' },
  { name: 'amber-500', label: 'Âmbar', hex: '#f59e0b' },
  { name: 'blue-500', label: 'Azul', hex: '#3b82f6' },
  { name: 'red-500', label: 'Vermelho', hex: '#ef4444' },
  { name: 'green-500', label: 'Verde', hex: '#22c55e' },
  { name: 'orange-500', label: 'Laranja', hex: '#f97316' },
  { name: 'purple-500', label: 'Roxo', hex: '#a855f7' },
  { name: 'slate-500', label: 'Cinza', hex: '#64748b' },
  { name: 'teal-500', label: 'Teal', hex: '#14b8a6' },
  { name: 'indigo-500', label: 'Índigo', hex: '#6366f1' },
  { name: 'rose-500', label: 'Rosa Claro', hex: '#f43f5e' },
] as const;

// Default fallback configs for categories (used when no DB config exists)
export const DEFAULT_CATEGORY_CONFIGS: Record<string, { icon: string; color: string }> = {
  'Segurança DNS': { icon: 'globe', color: 'cyan-600' },
  'Infraestrutura de Email': { icon: 'mail', color: 'violet-500' },
  'Autenticação de Email - SPF': { icon: 'shield-check', color: 'emerald-600' },
  'Autenticação de Email - DKIM': { icon: 'key-round', color: 'pink-500' },
  'Autenticação de Email - DMARC': { icon: 'shield-alert', color: 'amber-500' },
  // Firewall categories
  'Segurança de Interfaces': { icon: 'shield', color: 'blue-500' },
  'Regras de Entrada': { icon: 'network', color: 'orange-500' },
  'Configuração de Rede': { icon: 'server', color: 'purple-500' },
  'Políticas de Segurança': { icon: 'lock', color: 'red-500' },
  'Atualização de Firmware': { icon: 'hard-drive', color: 'green-500' },
  'Perfis de Segurança UTM': { icon: 'shield-check', color: 'teal-500' },
  'Configuração VPN': { icon: 'key', color: 'indigo-500' },
  'Logging e Monitoramento': { icon: 'activity', color: 'slate-500' },
  'Licenciamento': { icon: 'check-circle', color: 'emerald-600' },
  'Alta Disponibilidade': { icon: 'server', color: 'blue-500' },
  'Backup e Recovery': { icon: 'hard-drive', color: 'amber-500' },
  'Atualizações': { icon: 'activity', color: 'green-500' },
  'Recomendações': { icon: 'check-circle', color: 'teal-500' },
};

// Fetch category configs for a device type
export function useCategoryConfigs(deviceTypeId: string | undefined) {
  return useQuery({
    queryKey: ['rule_categories', deviceTypeId],
    queryFn: async () => {
      if (!deviceTypeId) return [];
      
      const { data, error } = await supabase
        .from('rule_categories')
        .select('*')
        .eq('device_type_id', deviceTypeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data as CategoryConfig[];
    },
    enabled: !!deviceTypeId,
  });
}

// Get a config for a specific category, with fallback to defaults
export function getCategoryConfig(
  configs: CategoryConfig[] | undefined,
  categoryName: string
): { displayName: string; icon: string; color: string } {
  const dbConfig = configs?.find(c => c.name === categoryName);
  const defaultConfig = DEFAULT_CATEGORY_CONFIGS[categoryName] || { icon: 'shield', color: 'slate-500' };
  
  return {
    displayName: dbConfig?.display_name || categoryName,
    icon: dbConfig?.icon || defaultConfig.icon,
    color: dbConfig?.color || defaultConfig.color,
  };
}

// Upsert category config
export function useUpsertCategoryConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CategoryConfigInput) => {
      // Try to update first, if no rows affected, insert
      const { data: existing } = await supabase
        .from('rule_categories')
        .select('id')
        .eq('device_type_id', input.device_type_id)
        .eq('name', input.name)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('rule_categories')
          .update({
            display_name: input.display_name,
            icon: input.icon,
            color: input.color,
            display_order: input.display_order ?? 0,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('rule_categories')
          .insert({
            device_type_id: input.device_type_id,
            name: input.name,
            display_name: input.display_name,
            icon: input.icon,
            color: input.color,
            display_order: input.display_order ?? 0,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rule_categories', data.device_type_id] });
      toast.success('Configuração da categoria salva!');
    },
    onError: (error) => {
      console.error('Error saving category config:', error);
      toast.error('Erro ao salvar configuração da categoria');
    },
  });
}

// Helper to get Tailwind classes from color name
export function getColorClasses(colorName: string) {
  return {
    bg: `bg-${colorName}/5`,
    bgSolid: `bg-${colorName}`,
    text: `text-${colorName}`,
    border: `border-${colorName}`,
    borderLight: `border-${colorName}/30`,
  };
}

// Helper to get hex color value by color name (for PDF generation)
export function getColorHexByName(colorName: string): string {
  const colorOption = AVAILABLE_COLORS.find(c => c.name === colorName);
  return colorOption?.hex || '#64748b'; // slate-500 fallback
}
