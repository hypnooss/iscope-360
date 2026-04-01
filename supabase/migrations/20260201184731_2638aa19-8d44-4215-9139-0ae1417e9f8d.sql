-- Insert missing Fortigate categories with appropriate icons and colors
INSERT INTO public.rule_categories (device_type_id, name, icon, color, display_order)
VALUES 
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Segurança de Interfaces', 'shield', 'blue-500', 1),
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Regras de Entrada', 'network', 'orange-500', 2),
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Configuração de Rede', 'server', 'purple-500', 3),
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Políticas de Segurança', 'lock', 'red-500', 4),
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Perfis UTM', 'shield-check', 'teal-500', 5),
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Configuração VPN', 'key', 'indigo-500', 6),
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Logging e Monitoramento', 'activity', 'slate-500', 7),
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Licenciamento', 'check-circle', 'emerald-600', 8),
  ('c2d829a3-4f86-49cd-851f-fa3f10c4fcf6', 'Backup e Recovery', 'hard-drive', 'amber-500', 9)
ON CONFLICT DO NOTHING;

-- Update existing categories with proper display_order
UPDATE public.rule_categories SET display_order = 10 WHERE name = 'Alta Disponibilidade' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';
UPDATE public.rule_categories SET display_order = 11 WHERE name = 'Atualizações e Firmware' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';
UPDATE public.rule_categories SET display_order = 12 WHERE name = 'Autenticação' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';