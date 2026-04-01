
-- Create separate compliance schedules table for M365 Compliance (posture analysis)
CREATE TABLE public.m365_compliance_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_record_id UUID NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
  frequency public.schedule_frequency NOT NULL DEFAULT 'weekly'::public.schedule_frequency,
  scheduled_hour INTEGER DEFAULT 0,
  scheduled_day_of_week INTEGER DEFAULT 1,
  scheduled_day_of_month INTEGER DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tenant_record_id)
);

-- Enable RLS
ALTER TABLE public.m365_compliance_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as m365_analyzer_schedules)
CREATE POLICY "Service role can manage m365 compliance schedules"
  ON public.m365_compliance_schedules FOR ALL
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE POLICY "Super admins can manage m365 compliance schedules"
  ON public.m365_compliance_schedules FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view m365 compliance schedules of accessible tenants"
  ON public.m365_compliance_schedules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.m365_tenants t
    WHERE t.id = m365_compliance_schedules.tenant_record_id
    AND public.has_client_access(auth.uid(), t.client_id)
  ));

CREATE POLICY "Users with edit permission can manage m365 compliance schedules"
  ON public.m365_compliance_schedules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.m365_tenants t
    WHERE t.id = m365_compliance_schedules.tenant_record_id
    AND public.has_client_access(auth.uid(), t.client_id)
    AND public.get_module_permission(auth.uid(), 'm365') = ANY(ARRAY['edit'::public.module_permission, 'full'::public.module_permission])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.m365_tenants t
    WHERE t.id = m365_compliance_schedules.tenant_record_id
    AND public.has_client_access(auth.uid(), t.client_id)
    AND public.get_module_permission(auth.uid(), 'm365') = ANY(ARRAY['edit'::public.module_permission, 'full'::public.module_permission])
  ));

-- Updated_at trigger
CREATE TRIGGER update_m365_compliance_schedules_updated_at
  BEFORE UPDATE ON public.m365_compliance_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
