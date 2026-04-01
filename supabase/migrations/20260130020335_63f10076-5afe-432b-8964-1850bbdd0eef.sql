-- 1) Super admin sempre FULL em qualquer módulo via get_module_permission
CREATE OR REPLACE FUNCTION public.get_module_permission(_user_id uuid, _module_name text)
RETURNS public.module_permission
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'super_admin') THEN 'full'::public.module_permission
    ELSE COALESCE(
      (
        SELECT ump.permission
        FROM public.user_module_permissions ump
        WHERE ump.user_id = _user_id
          AND ump.module_name = _module_name
        LIMIT 1
      ),
      'view'::public.module_permission
    )
  END;
$$;

-- 2) Backfill: garantir que super_admin tenha external_domain=full
INSERT INTO public.user_module_permissions (user_id, module_name, permission)
SELECT ur.user_id, 'external_domain', 'full'::public.module_permission
FROM public.user_roles ur
WHERE ur.role = 'super_admin'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_module_permissions ump
    WHERE ump.user_id = ur.user_id
      AND ump.module_name = 'external_domain'
  );

-- (Opcional/recomendado) Backfill: garantir que usuários não-super_admin tenham external_domain=view (evita “buracos”)
INSERT INTO public.user_module_permissions (user_id, module_name, permission)
SELECT ur.user_id, 'external_domain', 'view'::public.module_permission
FROM public.user_roles ur
WHERE ur.role <> 'super_admin'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_module_permissions ump
    WHERE ump.user_id = ur.user_id
      AND ump.module_name = 'external_domain'
  );

-- 3) Atualizar handle_new_user para incluir external_domain
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );

  -- Primeiro usuário é super_admin
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin');

    INSERT INTO public.user_module_permissions (user_id, module_name, permission)
    VALUES
      (NEW.id, 'dashboard', 'full'),
      (NEW.id, 'firewall', 'full'),
      (NEW.id, 'reports', 'full'),
      (NEW.id, 'users', 'full'),
      (NEW.id, 'm365', 'full'),
      (NEW.id, 'external_domain', 'full');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');

    INSERT INTO public.user_module_permissions (user_id, module_name, permission)
    VALUES
      (NEW.id, 'dashboard', 'view'),
      (NEW.id, 'firewall', 'view'),
      (NEW.id, 'reports', 'view'),
      (NEW.id, 'external_domain', 'view');
  END IF;

  RETURN NEW;
END;
$$;