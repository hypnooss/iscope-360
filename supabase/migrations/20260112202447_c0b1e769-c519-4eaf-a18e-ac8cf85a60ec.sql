-- Criar enum para roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');

-- Criar enum para permissões de módulos
CREATE TYPE public.module_permission AS ENUM ('view', 'edit', 'full');

-- Criar enum para frequência de schedule
CREATE TYPE public.schedule_frequency AS ENUM ('daily', 'weekly', 'monthly', 'manual');

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de roles de usuário (separada para segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Tabela de clientes
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de firewalls (FortiGates)
CREATE TABLE public.firewalls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  fortigate_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  serial_number TEXT,
  last_analysis_at TIMESTAMP WITH TIME ZONE,
  last_score INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de schedules de análise
CREATE TABLE public.analysis_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firewall_id UUID REFERENCES public.firewalls(id) ON DELETE CASCADE NOT NULL,
  frequency schedule_frequency NOT NULL DEFAULT 'weekly',
  next_run_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (firewall_id)
);

-- Tabela de permissões de módulos por usuário
CREATE TABLE public.user_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  module_name TEXT NOT NULL,
  permission module_permission NOT NULL DEFAULT 'view',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, module_name)
);

-- Tabela de associação usuário-cliente (para admin por cliente)
CREATE TABLE public.user_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, client_id)
);

-- Tabela de histórico de análises
CREATE TABLE public.analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firewall_id UUID REFERENCES public.firewalls(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL,
  report_data JSONB NOT NULL,
  analyzed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_history ENABLE ROW LEVEL SECURITY;

-- Função para verificar role (SECURITY DEFINER para evitar recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Função para verificar se é super_admin ou admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'admin')
  )
$$;

-- Função para verificar acesso ao cliente
CREATE OR REPLACE FUNCTION public.has_client_access(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.has_role(_user_id, 'super_admin') OR
    EXISTS (
      SELECT 1
      FROM public.user_clients
      WHERE user_id = _user_id
        AND client_id = _client_id
    )
$$;

-- Função para verificar permissão de módulo
CREATE OR REPLACE FUNCTION public.get_module_permission(_user_id UUID, _module_name TEXT)
RETURNS module_permission
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT permission FROM public.user_module_permissions 
     WHERE user_id = _user_id AND module_name = _module_name),
    'view'::module_permission
  )
$$;

-- Trigger para criar perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    
    -- Dar permissões completas em todos os módulos
    INSERT INTO public.user_module_permissions (user_id, module_name, permission)
    VALUES 
      (NEW.id, 'dashboard', 'full'),
      (NEW.id, 'firewall', 'full'),
      (NEW.id, 'reports', 'full'),
      (NEW.id, 'users', 'full');
  ELSE
    -- Usuários subsequentes começam como 'user' com permissão de visualização
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    INSERT INTO public.user_module_permissions (user_id, module_name, permission)
    VALUES 
      (NEW.id, 'dashboard', 'view'),
      (NEW.id, 'firewall', 'view'),
      (NEW.id, 'reports', 'view');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_firewalls_updated_at
  BEFORE UPDATE ON public.firewalls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON public.analysis_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies

-- Profiles: usuários podem ver seu próprio perfil, admins podem ver todos
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "System can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

-- User Roles: apenas super_admin pode gerenciar
CREATE POLICY "Super admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- Clients: super_admin vê todos, admin vê seus clientes
CREATE POLICY "Super admins can manage all clients"
  ON public.clients FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can view assigned clients"
  ON public.clients FOR SELECT
  USING (public.has_client_access(auth.uid(), id));

CREATE POLICY "Admins can update assigned clients"
  ON public.clients FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin') AND 
    public.has_client_access(auth.uid(), id) AND
    public.get_module_permission(auth.uid(), 'firewall') IN ('edit', 'full')
  );

-- Firewalls: baseado em acesso ao cliente
CREATE POLICY "Users can view firewalls of accessible clients"
  ON public.firewalls FOR SELECT
  USING (public.has_client_access(auth.uid(), client_id));

CREATE POLICY "Users with edit permission can manage firewalls"
  ON public.firewalls FOR ALL
  USING (
    public.has_client_access(auth.uid(), client_id) AND
    public.get_module_permission(auth.uid(), 'firewall') IN ('edit', 'full')
  );

-- Analysis Schedules: baseado em acesso ao firewall
CREATE POLICY "Users can view schedules of accessible firewalls"
  ON public.analysis_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.firewalls f
      WHERE f.id = firewall_id
      AND public.has_client_access(auth.uid(), f.client_id)
    )
  );

CREATE POLICY "Users with edit permission can manage schedules"
  ON public.analysis_schedules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.firewalls f
      WHERE f.id = firewall_id
      AND public.has_client_access(auth.uid(), f.client_id)
      AND public.get_module_permission(auth.uid(), 'firewall') IN ('edit', 'full')
    )
  );

-- User Module Permissions: apenas super_admin pode gerenciar
CREATE POLICY "Super admins can manage permissions"
  ON public.user_module_permissions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own permissions"
  ON public.user_module_permissions FOR SELECT
  USING (user_id = auth.uid());

-- User Clients: super_admin gerencia, users veem suas associações
CREATE POLICY "Super admins can manage user-client associations"
  ON public.user_clients FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own client associations"
  ON public.user_clients FOR SELECT
  USING (user_id = auth.uid());

-- Analysis History: baseado em acesso ao firewall
CREATE POLICY "Users can view history of accessible firewalls"
  ON public.analysis_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.firewalls f
      WHERE f.id = firewall_id
      AND public.has_client_access(auth.uid(), f.client_id)
    )
  );

CREATE POLICY "Users with edit permission can insert history"
  ON public.analysis_history FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.firewalls f
      WHERE f.id = firewall_id
      AND public.has_client_access(auth.uid(), f.client_id)
    )
  );