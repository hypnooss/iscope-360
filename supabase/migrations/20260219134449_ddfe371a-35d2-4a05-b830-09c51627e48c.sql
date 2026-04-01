ALTER TABLE public.analyzer_schedules
  ADD CONSTRAINT analyzer_schedules_firewall_id_key UNIQUE (firewall_id);