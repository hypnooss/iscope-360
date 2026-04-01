-- Create enum for module types
CREATE TYPE public.scope_module AS ENUM ('scope_firewall', 'scope_network', 'scope_cloud');

-- Create modules table
CREATE TABLE public.modules (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code scope_module NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Insert default modules
INSERT INTO public.modules (code, name, description, icon) VALUES
    ('scope_firewall', 'Scope Firewall', 'Gerenciamento e análise de firewalls FortiGate', 'shield'),
    ('scope_network', 'Scope Network', 'Monitoramento de infraestrutura de rede', 'network'),
    ('scope_cloud', 'Scope Cloud', 'Gestão de recursos em nuvem', 'cloud');

-- Create user_modules table for module access
CREATE TABLE public.user_modules (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(user_id, module_id)
);

-- Enable RLS
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

-- Modules policies (everyone can view active modules)
CREATE POLICY "Users can view active modules"
ON public.modules
FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins can manage modules"
ON public.modules
FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

-- User modules policies
CREATE POLICY "Users can view own module access"
ON public.user_modules
FOR SELECT
USING (
    user_id = auth.uid() 
    OR has_role(auth.uid(), 'super_admin')
    OR (
        has_role(auth.uid(), 'admin') 
        AND EXISTS (
            SELECT 1 FROM user_clients admin_clients
            JOIN user_clients target_clients ON admin_clients.client_id = target_clients.client_id
            WHERE admin_clients.user_id = auth.uid() AND target_clients.user_id = user_modules.user_id
        )
    )
);

CREATE POLICY "Admins can manage user module access"
ON public.user_modules
FOR ALL
USING (
    has_role(auth.uid(), 'super_admin')
    OR (
        has_role(auth.uid(), 'admin') 
        AND EXISTS (
            SELECT 1 FROM user_clients admin_clients
            JOIN user_clients target_clients ON admin_clients.client_id = target_clients.client_id
            WHERE admin_clients.user_id = auth.uid() AND target_clients.user_id = user_modules.user_id
        )
    )
);

-- Create function to check module access
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id UUID, _module_code scope_module)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_modules um
        JOIN public.modules m ON um.module_id = m.id
        WHERE um.user_id = _user_id 
        AND m.code = _module_code
        AND m.is_active = true
    ) OR has_role(_user_id, 'super_admin')
$$;

-- Create function to get user modules
CREATE OR REPLACE FUNCTION public.get_user_modules(_user_id UUID)
RETURNS TABLE(module_id UUID, code scope_module, name TEXT, description TEXT, icon TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT m.id, m.code, m.name, m.description, m.icon
    FROM public.modules m
    WHERE m.is_active = true
    AND (
        has_role(_user_id, 'super_admin')
        OR EXISTS (
            SELECT 1 FROM public.user_modules um
            WHERE um.user_id = _user_id AND um.module_id = m.id
        )
    )
$$;