
-- =============================================
-- Tabela: cve_sources (configuração de fontes)
-- =============================================
CREATE TABLE public.cve_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code text NOT NULL,
  source_type text NOT NULL,
  source_label text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_status text DEFAULT 'pending',
  last_sync_error text,
  last_sync_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cve_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage CVE sources"
  ON public.cve_sources FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated users can view CVE sources"
  ON public.cve_sources FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_cve_sources_updated_at
  BEFORE UPDATE ON public.cve_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: 2 fontes iniciais
INSERT INTO public.cve_sources (module_code, source_type, source_label, config) VALUES
  ('firewall', 'nist_nvd', 'NIST NVD - Firewalls', '{"months": 6}'::jsonb),
  ('m365', 'msrc', 'Microsoft Security Response Center', '{"months": 3}'::jsonb);

-- =============================================
-- Tabela: cve_cache (CVEs individuais)
-- =============================================
CREATE TABLE public.cve_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cve_id text NOT NULL,
  source_id uuid NOT NULL REFERENCES public.cve_sources(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  severity text,
  score numeric,
  title text,
  description text,
  products jsonb DEFAULT '[]'::jsonb,
  published_date date,
  advisory_url text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_cve_cache_cve_source ON public.cve_cache (cve_id, source_id);
CREATE INDEX idx_cve_cache_module ON public.cve_cache (module_code);
CREATE INDEX idx_cve_cache_severity ON public.cve_cache (severity);
CREATE INDEX idx_cve_cache_score ON public.cve_cache (score DESC NULLS LAST);

ALTER TABLE public.cve_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view CVE cache"
  ON public.cve_cache FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage CVE cache"
  ON public.cve_cache FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE TRIGGER update_cve_cache_updated_at
  BEFORE UPDATE ON public.cve_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
