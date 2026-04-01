CREATE TABLE public.agent_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  cpu_percent numeric(5,2),
  cpu_count integer,
  load_avg_1m numeric(6,2),
  load_avg_5m numeric(6,2),
  load_avg_15m numeric(6,2),
  ram_total_mb integer,
  ram_used_mb integer,
  ram_percent numeric(5,2),
  disk_total_gb numeric(8,2),
  disk_used_gb numeric(8,2),
  disk_percent numeric(5,2),
  disk_path text DEFAULT '/',
  net_bytes_sent bigint,
  net_bytes_recv bigint,
  uptime_seconds bigint,
  hostname text,
  os_info text,
  process_count integer,
  monitor_version text,
  collected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_agent_metrics_agent_time ON public.agent_metrics(agent_id, collected_at DESC);

ALTER TABLE public.agent_metrics ENABLE ROW LEVEL SECURITY;

-- RLS: agents can insert their own metrics (via service_role from edge function)
-- Authenticated users can read metrics for agents they have access to
CREATE POLICY "Service role can insert metrics"
  ON public.agent_metrics FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can select metrics"
  ON public.agent_metrics FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Authenticated users can read metrics"
  ON public.agent_metrics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      JOIN public.user_clients uc ON uc.client_id = a.client_id
      WHERE a.id = agent_metrics.agent_id
      AND uc.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Auto-cleanup: function to delete metrics older than 7 days
CREATE OR REPLACE FUNCTION public.cleanup_old_agent_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.agent_metrics
  WHERE collected_at < NOW() - INTERVAL '7 days';
END;
$$;