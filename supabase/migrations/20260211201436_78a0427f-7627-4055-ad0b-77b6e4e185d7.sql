ALTER TABLE public.external_domain_schedules
ADD COLUMN scheduled_hour integer DEFAULT 0,
ADD COLUMN scheduled_day_of_week integer DEFAULT 1,
ADD COLUMN scheduled_day_of_month integer DEFAULT 1;