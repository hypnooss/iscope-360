
-- Fix SELECT policy: remove NULL bypass, require super_admin or client access
DROP POLICY IF EXISTS "Users can view audit logs of accessible clients" ON public.m365_audit_logs;

CREATE POLICY "Users can view audit logs of accessible clients"
ON public.m365_audit_logs FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_client_access(auth.uid(), client_id)
);

-- Fix INSERT policy: remove NULL bypass for consistency
DROP POLICY IF EXISTS "Users with edit permission can insert audit logs" ON public.m365_audit_logs;

CREATE POLICY "Users with edit permission can insert audit logs"
ON public.m365_audit_logs FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_client_access(auth.uid(), client_id)
);
