-- Inserir o módulo Domínio Externo na tabela modules
INSERT INTO public.modules (code, name, description, icon, color, is_active)
VALUES (
  'scope_external_domain',
  'Domínio Externo',
  'Monitoramento e análise de segurança de domínios externos',
  'Globe',
  'text-teal-500',
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  is_active = EXCLUDED.is_active;