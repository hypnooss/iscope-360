-- Renomear o valor do enum 'admin' para 'workspace_admin'
ALTER TYPE public.app_role RENAME VALUE 'admin' TO 'workspace_admin';

-- Atualizar função is_admin para usar 'workspace_admin'
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'workspace_admin')
  )
$$;

-- Atualizar função is_client_admin para usar 'workspace_admin'
CREATE OR REPLACE FUNCTION public.is_client_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'workspace_admin') OR public.has_role(_user_id, 'super_admin')
$$;

-- Atualizar função can_manage_user para usar 'workspace_admin'
CREATE OR REPLACE FUNCTION public.can_manage_user(_admin_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    -- Super admin pode gerenciar qualquer um
    public.has_role(_admin_id, 'super_admin')
    OR
    -- Workspace admin pode gerenciar usuários que compartilham clientes
    (
      public.has_role(_admin_id, 'workspace_admin')
      AND EXISTS (
        SELECT 1
        FROM public.user_clients admin_clients
        JOIN public.user_clients target_clients ON admin_clients.client_id = target_clients.client_id
        WHERE admin_clients.user_id = _admin_id
        AND target_clients.user_id = _target_user_id
      )
    )
$$;

-- Atualizar política da tabela agents
DROP POLICY IF EXISTS "Admins can manage all agents" ON public.agents;
CREATE POLICY "Admins can manage all agents" 
ON public.agents
FOR ALL
USING (EXISTS (
  SELECT 1
  FROM user_roles
  WHERE user_roles.user_id = auth.uid() 
  AND user_roles.role IN ('workspace_admin'::app_role, 'super_admin'::app_role)
));

-- Atualizar política da tabela clients (update)
DROP POLICY IF EXISTS "Admins can update assigned clients" ON public.clients;
CREATE POLICY "Admins can update assigned clients"
ON public.clients
FOR UPDATE
USING (
  has_role(auth.uid(), 'workspace_admin'::app_role) 
  AND has_client_access(auth.uid(), id) 
  AND (get_module_permission(auth.uid(), 'firewall'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission]))
);

-- Atualizar política da tabela user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR (
    has_role(auth.uid(), 'workspace_admin'::app_role) 
    AND (role <> 'super_admin'::app_role) 
    AND (EXISTS (
      SELECT 1
      FROM user_clients admin_clients
      JOIN user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid() 
      AND target_clients.user_id = user_roles.user_id
    ))
  )
);

-- Atualizar política da tabela user_module_permissions
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_module_permissions;
CREATE POLICY "Admins can manage permissions"
ON public.user_module_permissions
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR (
    has_role(auth.uid(), 'workspace_admin'::app_role) 
    AND (EXISTS (
      SELECT 1
      FROM user_clients admin_clients
      JOIN user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid() 
      AND target_clients.user_id = user_module_permissions.user_id
    ))
  )
);

-- Atualizar política da tabela user_modules
DROP POLICY IF EXISTS "Admins can manage user module access" ON public.user_modules;
CREATE POLICY "Admins can manage user module access"
ON public.user_modules
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR (
    has_role(auth.uid(), 'workspace_admin'::app_role) 
    AND (EXISTS (
      SELECT 1
      FROM user_clients admin_clients
      JOIN user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid() 
      AND target_clients.user_id = user_modules.user_id
    ))
  )
);

-- Atualizar política da tabela user_clients
DROP POLICY IF EXISTS "Admins can manage client associations" ON public.user_clients;
CREATE POLICY "Admins can manage client associations"
ON public.user_clients
FOR ALL
USING (
  has_role(auth.uid(), 'super_admin'::app_role) 
  OR (
    has_role(auth.uid(), 'workspace_admin'::app_role) 
    AND has_client_access(auth.uid(), client_id)
  )
);

-- Atualizar política da tabela profiles (view)
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles"
ON public.profiles
FOR SELECT
USING (
  (auth.uid() = id) 
  OR has_role(auth.uid(), 'super_admin'::app_role) 
  OR (
    has_role(auth.uid(), 'workspace_admin'::app_role) 
    AND (EXISTS (
      SELECT 1
      FROM user_clients admin_clients
      JOIN user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid() 
      AND target_clients.user_id = profiles.id
    ))
  )
);