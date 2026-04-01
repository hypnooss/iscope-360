
-- Add m365_analyzer to agent_task_type enum
ALTER TYPE public.agent_task_type ADD VALUE IF NOT EXISTS 'm365_analyzer';

-- ========================================
-- Table: m365_analyzer_snapshots
-- ========================================
CREATE TABLE public.m365_analyzer_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_record_id uuid NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  period_start timestamptz,
  period_end timestamptz,
  score integer,
  summary jsonb DEFAULT '{"low": 0, "high": 0, "info": 0, "medium": 0, "critical": 0}'::jsonb,
  insights jsonb DEFAULT '[]'::jsonb,
  metrics jsonb DEFAULT '{}'::jsonb,
  agent_task_id uuid REFERENCES public.agent_tasks(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.m365_analyzer_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage m365 analyzer snapshots"
  ON public.m365_analyzer_snapshots FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Users can view m365 analyzer snapshots of accessible clients"
  ON public.m365_analyzer_snapshots FOR SELECT
  USING (has_client_access(auth.uid(), client_id));

CREATE POLICY "Users with edit permission can insert m365 analyzer snapshots"
  ON public.m365_analyzer_snapshots FOR INSERT
  WITH CHECK (has_client_access(auth.uid(), client_id) AND get_module_permission(auth.uid(), 'm365') = ANY(ARRAY['edit'::module_permission, 'full'::module_permission]));

CREATE INDEX idx_m365_analyzer_snapshots_tenant ON public.m365_analyzer_snapshots(tenant_record_id, status);
CREATE INDEX idx_m365_analyzer_snapshots_client ON public.m365_analyzer_snapshots(client_id);

-- ========================================
-- Table: m365_analyzer_schedules
-- ========================================
CREATE TABLE public.m365_analyzer_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_record_id uuid NOT NULL UNIQUE REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  frequency public.schedule_frequency NOT NULL DEFAULT 'hourly',
  scheduled_hour integer DEFAULT 0,
  scheduled_day_of_week integer DEFAULT 1,
  scheduled_day_of_month integer DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.m365_analyzer_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage m365 analyzer schedules"
  ON public.m365_analyzer_schedules FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Super admins can manage m365 analyzer schedules"
  ON public.m365_analyzer_schedules FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view m365 analyzer schedules of accessible tenants"
  ON public.m365_analyzer_schedules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM m365_tenants t WHERE t.id = m365_analyzer_schedules.tenant_record_id AND has_client_access(auth.uid(), t.client_id)
  ));

CREATE POLICY "Users with edit permission can manage m365 analyzer schedules"
  ON public.m365_analyzer_schedules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM m365_tenants t WHERE t.id = m365_analyzer_schedules.tenant_record_id AND has_client_access(auth.uid(), t.client_id) AND get_module_permission(auth.uid(), 'm365') = ANY(ARRAY['edit'::module_permission, 'full'::module_permission])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM m365_tenants t WHERE t.id = m365_analyzer_schedules.tenant_record_id AND has_client_access(auth.uid(), t.client_id) AND get_module_permission(auth.uid(), 'm365') = ANY(ARRAY['edit'::module_permission, 'full'::module_permission])
  ));

-- ========================================
-- Table: m365_user_baselines
-- ========================================
CREATE TABLE public.m365_user_baselines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_record_id uuid NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  user_principal_name text NOT NULL,
  avg_sent_daily numeric DEFAULT 0,
  avg_received_daily numeric DEFAULT 0,
  avg_recipients_per_msg numeric DEFAULT 0,
  typical_send_hours jsonb DEFAULT '[]'::jsonb,
  baseline_date date NOT NULL DEFAULT CURRENT_DATE,
  sample_days integer DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_record_id, user_principal_name)
);

ALTER TABLE public.m365_user_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage m365 user baselines"
  ON public.m365_user_baselines FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Users can view m365 user baselines of accessible tenants"
  ON public.m365_user_baselines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM m365_tenants t WHERE t.id = m365_user_baselines.tenant_record_id AND has_client_access(auth.uid(), t.client_id)
  ));

CREATE INDEX idx_m365_user_baselines_tenant ON public.m365_user_baselines(tenant_record_id);
