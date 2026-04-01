-- Drop existing policy
DROP POLICY IF EXISTS "Users with edit permission can manage tenants" ON public.m365_tenants;

-- Create updated policy that allows super_admins to bypass module permission check
CREATE POLICY "Users with edit permission can manage tenants" 
ON public.m365_tenants 
FOR ALL 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  (has_client_access(auth.uid(), client_id) AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission])))
);

-- Also update m365_tenant_submodules policy
DROP POLICY IF EXISTS "Users with edit permission can manage submodules" ON public.m365_tenant_submodules;

CREATE POLICY "Users with edit permission can manage submodules" 
ON public.m365_tenant_submodules 
FOR ALL 
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  (EXISTS ( SELECT 1
   FROM m365_tenants t
  WHERE ((t.id = m365_tenant_submodules.tenant_record_id) AND has_client_access(auth.uid(), t.client_id) AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission])))))
);

-- Update m365_audit_logs INSERT policy
DROP POLICY IF EXISTS "Users with edit permission can insert audit logs" ON public.m365_audit_logs;

CREATE POLICY "Users with edit permission can insert audit logs" 
ON public.m365_audit_logs 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role) OR 
  ((client_id IS NULL) OR has_client_access(auth.uid(), client_id))
);