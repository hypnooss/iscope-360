
-- Table 1: Daily stats per user
CREATE TABLE public.m365_user_external_daily_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_record_id uuid NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  user_id text NOT NULL,
  date date NOT NULL,
  total_external_emails integer NOT NULL DEFAULT 0,
  total_external_mb numeric NOT NULL DEFAULT 0,
  unique_domains integer NOT NULL DEFAULT 0,
  mean_hour numeric,
  std_hour numeric,
  hour_distribution jsonb DEFAULT '{}'::jsonb,
  domains_list text[] DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_record_id, user_id, date)
);

ALTER TABLE public.m365_user_external_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on daily stats"
  ON public.m365_user_external_daily_stats FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Users can view daily stats of accessible clients"
  ON public.m365_user_external_daily_stats FOR SELECT
  USING (has_client_access(auth.uid(), client_id));

-- Table 2: Domain history per user
CREATE TABLE public.m365_user_external_domain_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_record_id uuid NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  user_id text NOT NULL,
  domain text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  total_emails integer NOT NULL DEFAULT 0,
  total_mb numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_record_id, user_id, domain)
);

ALTER TABLE public.m365_user_external_domain_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on domain history"
  ON public.m365_user_external_domain_history FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Users can view domain history of accessible clients"
  ON public.m365_user_external_domain_history FOR SELECT
  USING (has_client_access(auth.uid(), client_id));

-- Table 3: External movement alerts
CREATE TABLE public.m365_external_movement_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_record_id uuid NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  snapshot_id uuid REFERENCES public.m365_analyzer_snapshots(id) ON DELETE SET NULL,
  user_id text NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  description text,
  risk_score integer NOT NULL DEFAULT 0,
  z_score numeric,
  pct_increase numeric,
  is_new boolean NOT NULL DEFAULT false,
  is_anomalous boolean NOT NULL DEFAULT false,
  affected_domains text[] DEFAULT '{}'::text[],
  evidence jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.m365_external_movement_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on movement alerts"
  ON public.m365_external_movement_alerts FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Users can view movement alerts of accessible clients"
  ON public.m365_external_movement_alerts FOR SELECT
  USING (has_client_access(auth.uid(), client_id));

-- Indexes for performance
CREATE INDEX idx_daily_stats_tenant_user ON public.m365_user_external_daily_stats(tenant_record_id, user_id, date DESC);
CREATE INDEX idx_domain_history_tenant_user ON public.m365_user_external_domain_history(tenant_record_id, user_id);
CREATE INDEX idx_movement_alerts_tenant ON public.m365_external_movement_alerts(tenant_record_id, created_at DESC);
CREATE INDEX idx_movement_alerts_severity ON public.m365_external_movement_alerts(tenant_record_id, severity);
