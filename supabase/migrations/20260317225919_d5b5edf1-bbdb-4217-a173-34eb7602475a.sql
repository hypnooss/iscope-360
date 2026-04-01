
CREATE TABLE public.cve_sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES public.cve_sources(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL,
  cve_count integer DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cve_sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync history"
  ON public.cve_sync_history FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage sync history"
  ON public.cve_sync_history FOR ALL
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

CREATE INDEX idx_cve_sync_history_source_id ON public.cve_sync_history(source_id);
CREATE INDEX idx_cve_sync_history_created_at ON public.cve_sync_history(created_at DESC);
