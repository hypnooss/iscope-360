
-- ============================================
-- Analyzer Snapshots
-- ============================================
CREATE TABLE public.analyzer_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firewall_id uuid NOT NULL REFERENCES public.firewalls(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  agent_task_id uuid REFERENCES public.agent_tasks(id),
  status text NOT NULL DEFAULT 'pending',
  period_start timestamptz,
  period_end timestamptz,
  score integer,
  summary jsonb DEFAULT '{"critical":0,"high":0,"medium":0,"low":0,"info":0}'::jsonb,
  insights jsonb DEFAULT '[]'::jsonb,
  metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_analyzer_snapshots_firewall ON public.analyzer_snapshots(firewall_id);
CREATE INDEX idx_analyzer_snapshots_client ON public.analyzer_snapshots(client_id);
CREATE INDEX idx_analyzer_snapshots_created ON public.analyzer_snapshots(created_at DESC);

-- RLS
ALTER TABLE public.analyzer_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analyzer snapshots of accessible firewalls"
  ON public.analyzer_snapshots FOR SELECT
  USING (has_client_access(auth.uid(), client_id));

CREATE POLICY "Users with edit permission can insert analyzer snapshots"
  ON public.analyzer_snapshots FOR INSERT
  WITH CHECK (
    has_client_access(auth.uid(), client_id)
    AND get_module_permission(auth.uid(), 'firewall') = ANY(ARRAY['edit'::module_permission, 'full'::module_permission])
  );

CREATE POLICY "Service role can manage analyzer snapshots"
  ON public.analyzer_snapshots FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- ============================================
-- Analyzer Schedules
-- ============================================
CREATE TABLE public.analyzer_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firewall_id uuid NOT NULL REFERENCES public.firewalls(id) ON DELETE CASCADE,
  frequency public.schedule_frequency NOT NULL DEFAULT 'daily',
  scheduled_hour integer DEFAULT 0,
  scheduled_day_of_week integer DEFAULT 1,
  scheduled_day_of_month integer DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analyzer_schedules_firewall ON public.analyzer_schedules(firewall_id);
CREATE INDEX idx_analyzer_schedules_next_run ON public.analyzer_schedules(next_run_at) WHERE is_active = true;

-- RLS
ALTER TABLE public.analyzer_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analyzer schedules of accessible firewalls"
  ON public.analyzer_schedules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM firewalls f
    WHERE f.id = analyzer_schedules.firewall_id
    AND has_client_access(auth.uid(), f.client_id)
  ));

CREATE POLICY "Users with edit permission can manage analyzer schedules"
  ON public.analyzer_schedules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM firewalls f
    WHERE f.id = analyzer_schedules.firewall_id
    AND has_client_access(auth.uid(), f.client_id)
    AND get_module_permission(auth.uid(), 'firewall') = ANY(ARRAY['edit'::module_permission, 'full'::module_permission])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM firewalls f
    WHERE f.id = analyzer_schedules.firewall_id
    AND has_client_access(auth.uid(), f.client_id)
    AND get_module_permission(auth.uid(), 'firewall') = ANY(ARRAY['edit'::module_permission, 'full'::module_permission])
  ));

-- Update trigger
CREATE TRIGGER update_analyzer_schedules_updated_at
  BEFORE UPDATE ON public.analyzer_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Add firewall_analyzer to agent_task_type enum
-- ============================================
ALTER TYPE public.agent_task_type ADD VALUE IF NOT EXISTS 'firewall_analyzer';
