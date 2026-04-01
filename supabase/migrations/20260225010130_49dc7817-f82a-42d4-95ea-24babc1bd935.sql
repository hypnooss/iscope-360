
-- Create m365_tenant_licenses table
CREATE TABLE public.m365_tenant_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_record_id uuid NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sku_id text NOT NULL,
  sku_part_number text NOT NULL,
  display_name text NOT NULL,
  capability_status text NOT NULL DEFAULT 'Enabled',
  total_units integer NOT NULL DEFAULT 0,
  consumed_units integer NOT NULL DEFAULT 0,
  warning_units integer NOT NULL DEFAULT 0,
  suspended_units integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.m365_tenant_licenses ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view licenses of accessible clients
CREATE POLICY "Users can view licenses of accessible clients"
  ON public.m365_tenant_licenses
  FOR SELECT
  TO authenticated
  USING (has_client_access(auth.uid(), client_id));

-- RLS: Service role can manage all licenses
CREATE POLICY "Service role can manage all licenses"
  ON public.m365_tenant_licenses
  FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Index for faster lookups
CREATE INDEX idx_m365_tenant_licenses_client_id ON public.m365_tenant_licenses(client_id);
CREATE INDEX idx_m365_tenant_licenses_tenant_record_id ON public.m365_tenant_licenses(tenant_record_id);
