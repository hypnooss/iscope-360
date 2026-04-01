-- Allow users with edit permission to update external domain analysis history (for cancellation)
CREATE POLICY "Users with edit permission can update external domain history"
ON public.external_domain_analysis_history
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM external_domains d
    WHERE d.id = external_domain_analysis_history.domain_id
      AND has_client_access(auth.uid(), d.client_id)
      AND get_module_permission(auth.uid(), 'external_domain') = ANY (ARRAY['edit'::module_permission, 'full'::module_permission])
  )
);