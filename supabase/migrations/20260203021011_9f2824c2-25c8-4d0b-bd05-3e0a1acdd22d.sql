-- Insert version settings for agent auto-update
INSERT INTO public.system_settings (key, value, description) VALUES
  ('agent_latest_version', '"1.0.0"', 'Latest available agent version'),
  ('agent_update_checksum', '""', 'SHA256 checksum of latest agent package'),
  ('agent_force_update', 'false', 'Force immediate update on all agents')
ON CONFLICT (key) DO NOTHING;