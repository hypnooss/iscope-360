ALTER TABLE m365_tenants ADD COLUMN IF NOT EXISTS entra_dashboard_cache jsonb;
ALTER TABLE m365_tenants ADD COLUMN IF NOT EXISTS entra_dashboard_cached_at timestamptz;