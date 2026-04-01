
ALTER TABLE public.analysis_schedules ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.analyzer_schedules ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.external_domain_schedules ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.m365_analyzer_schedules ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.m365_compliance_schedules ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE public.attack_surface_schedules ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
