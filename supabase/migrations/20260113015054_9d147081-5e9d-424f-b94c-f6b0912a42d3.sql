-- Atualizar RLS para permitir que admins gerenciem usuários de seus clientes

-- Função para verificar se usuário é admin de algum cliente
CREATE OR REPLACE FUNCTION public.is_client_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin')
$$;

-- Função para verificar se admin pode gerenciar um usuário específico
-- Admin pode gerenciar usuários que compartilham pelo menos um cliente
CREATE OR REPLACE FUNCTION public.can_manage_user(_admin_id uuid, _target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Super admin pode gerenciar qualquer um
    public.has_role(_admin_id, 'super_admin')
    OR
    -- Admin pode gerenciar usuários que compartilham clientes
    (
      public.has_role(_admin_id, 'admin')
      AND EXISTS (
        SELECT 1
        FROM public.user_clients admin_clients
        JOIN public.user_clients target_clients ON admin_clients.client_id = target_clients.client_id
        WHERE admin_clients.user_id = _admin_id
        AND target_clients.user_id = _target_user_id
      )
    )
$$;

-- Atualizar política de profiles para admins verem usuários de seus clientes
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.user_clients admin_clients
      JOIN public.user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid()
      AND target_clients.user_id = profiles.id
    )
  )
);

-- Atualizar política de user_roles para admins verem roles de usuários de seus clientes
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view roles"
ON public.user_roles
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.user_clients admin_clients
      JOIN public.user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid()
      AND target_clients.user_id = user_roles.user_id
    )
  )
);

-- Permitir admins gerenciarem roles de usuários de seus clientes (não super_admin)
DROP POLICY IF EXISTS "Super admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND user_roles.role != 'super_admin'
    AND EXISTS (
      SELECT 1
      FROM public.user_clients admin_clients
      JOIN public.user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid()
      AND target_clients.user_id = user_roles.user_id
    )
  )
);

-- Atualizar políticas de user_module_permissions
DROP POLICY IF EXISTS "Users can view own permissions" ON public.user_module_permissions;
CREATE POLICY "Users can view permissions"
ON public.user_module_permissions
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.user_clients admin_clients
      JOIN public.user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid()
      AND target_clients.user_id = user_module_permissions.user_id
    )
  )
);

DROP POLICY IF EXISTS "Super admins can manage permissions" ON public.user_module_permissions;
CREATE POLICY "Admins can manage permissions"
ON public.user_module_permissions
FOR ALL
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.user_clients admin_clients
      JOIN public.user_clients target_clients ON admin_clients.client_id = target_clients.client_id
      WHERE admin_clients.user_id = auth.uid()
      AND target_clients.user_id = user_module_permissions.user_id
    )
  )
);

-- Atualizar políticas de user_clients
DROP POLICY IF EXISTS "Users can view own client associations" ON public.user_clients;
CREATE POLICY "Users can view client associations"
ON public.user_clients
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND public.has_client_access(auth.uid(), client_id)
  )
);

DROP POLICY IF EXISTS "Super admins can manage user-client associations" ON public.user_clients;
CREATE POLICY "Admins can manage client associations"
ON public.user_clients
FOR ALL
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR (
    public.has_role(auth.uid(), 'admin')
    AND public.has_client_access(auth.uid(), client_id)
  )
);