
-- Create CVE severity cache table for dashboard performance
CREATE TABLE public.cve_severity_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_code text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  critical integer NOT NULL DEFAULT 0,
  high integer NOT NULL DEFAULT 0,
  medium integer NOT NULL DEFAULT 0,
  low integer NOT NULL DEFAULT 0,
  total_cves integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (module_code, client_id)
);

-- Handle NULL client_id uniqueness (for global M365 CVEs)
CREATE UNIQUE INDEX cve_severity_cache_module_global ON public.cve_severity_cache (module_code) WHERE client_id IS NULL;

-- Enable RLS
ALTER TABLE public.cve_severity_cache ENABLE ROW LEVEL SECURITY;

-- Users can view cache for their accessible clients or global (NULL client_id)
CREATE POLICY "Users can view CVE cache for accessible clients"
  ON public.cve_severity_cache
  FOR SELECT
  USING (client_id IS NULL OR has_client_access(auth.uid(), client_id));

-- Service role can manage all cache entries
CREATE POLICY "Service role can manage CVE cache"
  ON public.cve_severity_cache
  FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);
