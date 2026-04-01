
-- Add supervisor_version column to agents table
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS supervisor_version text;

-- Add supervisor settings to system_settings
INSERT INTO public.system_settings (key, value)
VALUES 
  ('supervisor_latest_version', '"1.0.0"'),
  ('supervisor_update_checksum', '""'),
  ('supervisor_force_update', 'false')
ON CONFLICT (key) DO NOTHING;
