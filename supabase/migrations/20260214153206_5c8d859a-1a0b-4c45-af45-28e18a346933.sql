
-- Create attack_surface_schedules table
CREATE TABLE public.attack_surface_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  frequency public.schedule_frequency NOT NULL DEFAULT 'daily',
  scheduled_hour integer DEFAULT 15,
  scheduled_day_of_week integer DEFAULT 1,
  scheduled_day_of_month integer DEFAULT 1,
  is_active boolean DEFAULT true,
  next_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.attack_surface_schedules ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all
CREATE POLICY "Super admins can manage attack surface schedules"
ON public.attack_surface_schedules
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Workspace admins can view schedules of accessible clients
CREATE POLICY "Users can view attack surface schedules of accessible clients"
ON public.attack_surface_schedules
FOR SELECT
USING (has_client_access(auth.uid(), client_id));

-- Users with edit permission can manage schedules
CREATE POLICY "Users with edit permission can manage attack surface schedules"
ON public.attack_surface_schedules
FOR ALL
USING (
  has_client_access(auth.uid(), client_id)
  AND get_module_permission(auth.uid(), 'external_domain'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission])
)
WITH CHECK (
  has_client_access(auth.uid(), client_id)
  AND get_module_permission(auth.uid(), 'external_domain'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission])
);

-- Service role can manage all
CREATE POLICY "Service role can manage attack surface schedules"
ON public.attack_surface_schedules
FOR ALL
USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

-- Trigger for updated_at
CREATE TRIGGER update_attack_surface_schedules_updated_at
BEFORE UPDATE ON public.attack_surface_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
