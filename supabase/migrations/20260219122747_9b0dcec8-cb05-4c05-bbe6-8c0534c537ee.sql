CREATE UNIQUE INDEX IF NOT EXISTS attack_surface_schedules_client_id_key
  ON public.attack_surface_schedules (client_id);