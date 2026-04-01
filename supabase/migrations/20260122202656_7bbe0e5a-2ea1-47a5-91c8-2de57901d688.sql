-- Allow super admins to delete profiles
CREATE POLICY "Super admins can delete profiles"
ON public.profiles
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'));

-- Allow workspace admins to delete profiles of users they manage
CREATE POLICY "Workspace admins can delete managed profiles"
ON public.profiles
FOR DELETE
USING (
  has_role(auth.uid(), 'workspace_admin') 
  AND EXISTS (
    SELECT 1
    FROM user_clients admin_clients
    JOIN user_clients target_clients ON admin_clients.client_id = target_clients.client_id
    WHERE admin_clients.user_id = auth.uid()
    AND target_clients.user_id = profiles.id
  )
);