ALTER TABLE public.m365_tenants ADD COLUMN exchange_dashboard_cache jsonb;
ALTER TABLE public.m365_tenants ADD COLUMN exchange_dashboard_cached_at timestamptz;
ALTER TABLE public.m365_tenants ADD COLUMN collaboration_dashboard_cache jsonb;
ALTER TABLE public.m365_tenants ADD COLUMN collaboration_dashboard_cached_at timestamptz;