CREATE POLICY "Users with edit permission can update m365 analyzer snapshots"
ON public.m365_analyzer_snapshots
FOR UPDATE
TO authenticated
USING (
  has_client_access(auth.uid(), client_id)
  AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission]))
)
WITH CHECK (
  has_client_access(auth.uid(), client_id)
  AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission]))
);