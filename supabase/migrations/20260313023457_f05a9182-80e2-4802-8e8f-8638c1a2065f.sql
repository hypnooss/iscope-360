
-- Create m365_dashboard_snapshots table
CREATE TABLE public.m365_dashboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_record_id uuid REFERENCES public.m365_tenants(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES public.clients(id),
  dashboard_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Index for efficient queries by tenant + type + time
CREATE INDEX idx_dash_snap_tenant_type ON public.m365_dashboard_snapshots(tenant_record_id, dashboard_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.m365_dashboard_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role can manage all
CREATE POLICY "Service role can manage dashboard snapshots"
  ON public.m365_dashboard_snapshots FOR ALL
  TO public
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Users can view snapshots of accessible clients
CREATE POLICY "Users can view dashboard snapshots of accessible clients"
  ON public.m365_dashboard_snapshots FOR SELECT
  TO public
  USING (has_client_access(auth.uid(), client_id));

-- Super admins can manage all
CREATE POLICY "Super admins can manage dashboard snapshots"
  ON public.m365_dashboard_snapshots FOR ALL
  TO public
  USING (has_role(auth.uid(), 'super_admin'::app_role));
