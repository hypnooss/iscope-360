-- =========================================================================================
-- MASTER SEED DE DEPENDENCIAS CRONOLOGICAS DO PROJETO V1
-- Supre a falha do supabase no qual as "regras de compliance" de janeiro pediam IDs fixos 
-- para tipos de dispositivos que só eram gerados em fevereiro.
-- =========================================================================================

INSERT INTO public.device_types (id, code, name, vendor, category, icon, is_active)
VALUES 
  ('22d07d7d-7b53-4ad4-8061-f1c6ad81da48', 'sonicwall', 'SonicWall TZ', 'SonicWall', 'firewall', 'Shield', true),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'external_domain', 'External Domain', 'Generic', 'other', 'Cloud', true)
ON CONFLICT (id) DO NOTHING;
