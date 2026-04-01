ALTER TABLE public.external_domain_schedules
  ADD CONSTRAINT external_domain_schedules_domain_id_key UNIQUE (domain_id);