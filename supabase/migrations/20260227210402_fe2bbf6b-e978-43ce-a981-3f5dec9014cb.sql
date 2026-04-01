CREATE POLICY "Super admins can read agent releases"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'agent-releases'
  AND public.has_role(auth.uid(), 'super_admin')
);