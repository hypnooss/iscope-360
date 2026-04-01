-- Allow super_admins to upload agent releases
CREATE POLICY "Super admins can upload agent releases"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'agent-releases'
  AND public.has_role(auth.uid(), 'super_admin')
);

-- Allow super_admins to update/overwrite agent releases
CREATE POLICY "Super admins can update agent releases"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'agent-releases'
  AND public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  bucket_id = 'agent-releases'
  AND public.has_role(auth.uid(), 'super_admin')
);

-- Allow super_admins to delete agent releases
CREATE POLICY "Super admins can delete agent releases"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'agent-releases'
  AND public.has_role(auth.uid(), 'super_admin')
);