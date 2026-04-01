-- 1. Insert the Microsoft 365 module record
INSERT INTO public.modules (code, name, description, icon, is_active)
VALUES ('scope_m365', 'Microsoft 365', 'Análise e auditoria de ambientes Microsoft 365 via Graph API', 'cloud', true)
ON CONFLICT DO NOTHING;

-- 2. Create enum for M365 submodules
CREATE TYPE m365_submodule AS ENUM ('entra_id', 'sharepoint', 'exchange', 'defender', 'intune');

-- 3. Create enum for tenant connection status
CREATE TYPE tenant_connection_status AS ENUM ('pending', 'connected', 'partial', 'failed', 'disconnected');

-- 4. Create enum for permission status
CREATE TYPE permission_status AS ENUM ('granted', 'pending', 'denied', 'missing');

-- 5. Create table for M365 tenants (one per client)
CREATE TABLE public.m365_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    tenant_domain TEXT,
    display_name TEXT,
    connection_status tenant_connection_status NOT NULL DEFAULT 'pending',
    last_validated_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(client_id, tenant_id)
);

-- 6. Create table for Azure App credentials (per tenant)
CREATE TABLE public.m365_app_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_record_id UUID NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
    azure_app_id TEXT NOT NULL,
    client_secret_encrypted TEXT,
    certificate_thumbprint TEXT,
    auth_type TEXT NOT NULL DEFAULT 'client_secret' CHECK (auth_type IN ('client_secret', 'certificate')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Create table for OAuth tokens
CREATE TABLE public.m365_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_record_id UUID NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_type TEXT DEFAULT 'Bearer',
    expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. Create table for required permissions per submodule
CREATE TABLE public.m365_required_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submodule m365_submodule NOT NULL,
    permission_name TEXT NOT NULL,
    permission_type TEXT NOT NULL DEFAULT 'Application' CHECK (permission_type IN ('Application', 'Delegated')),
    description TEXT,
    is_required BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(submodule, permission_name)
);

-- 9. Create table for granted permissions per tenant
CREATE TABLE public.m365_tenant_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_record_id UUID NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
    permission_name TEXT NOT NULL,
    permission_type TEXT NOT NULL DEFAULT 'Application',
    status permission_status NOT NULL DEFAULT 'pending',
    granted_at TIMESTAMP WITH TIME ZONE,
    granted_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tenant_record_id, permission_name)
);

-- 10. Create table for enabled submodules per tenant
CREATE TABLE public.m365_tenant_submodules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_record_id UUID NOT NULL REFERENCES public.m365_tenants(id) ON DELETE CASCADE,
    submodule m365_submodule NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'success', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(tenant_record_id, submodule)
);

-- 11. Create audit log table for M365 connections
CREATE TABLE public.m365_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_record_id UUID REFERENCES public.m365_tenants(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    action_details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 12. Insert required permissions for Entra ID submodule
INSERT INTO public.m365_required_permissions (submodule, permission_name, permission_type, description, is_required) VALUES
('entra_id', 'User.Read.All', 'Application', 'Read all users full profiles', true),
('entra_id', 'Directory.Read.All', 'Application', 'Read directory data', true),
('entra_id', 'Group.Read.All', 'Application', 'Read all groups', true),
('entra_id', 'Application.Read.All', 'Application', 'Read all applications', true),
('entra_id', 'AuditLog.Read.All', 'Application', 'Read audit log data', true),
('entra_id', 'Policy.Read.All', 'Application', 'Read organization policies', false),
('entra_id', 'RoleManagement.Read.Directory', 'Application', 'Read directory role assignments', false);

-- 13. Enable RLS on all new tables
ALTER TABLE public.m365_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m365_app_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m365_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m365_required_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m365_tenant_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m365_tenant_submodules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m365_audit_logs ENABLE ROW LEVEL SECURITY;

-- 14. RLS Policies for m365_tenants
CREATE POLICY "Users can view tenants of accessible clients"
ON public.m365_tenants FOR SELECT
USING (has_client_access(auth.uid(), client_id));

CREATE POLICY "Users with edit permission can manage tenants"
ON public.m365_tenants FOR ALL
USING (
    has_client_access(auth.uid(), client_id) 
    AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission]))
);

-- 15. RLS Policies for m365_app_credentials
CREATE POLICY "Users can view credentials of accessible tenants"
ON public.m365_app_credentials FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM m365_tenants t 
        WHERE t.id = tenant_record_id 
        AND has_client_access(auth.uid(), t.client_id)
    )
);

CREATE POLICY "Users with edit permission can manage credentials"
ON public.m365_app_credentials FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM m365_tenants t 
        WHERE t.id = tenant_record_id 
        AND has_client_access(auth.uid(), t.client_id)
        AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission]))
    )
);

-- 16. RLS Policies for m365_tokens
CREATE POLICY "Users with edit permission can manage tokens"
ON public.m365_tokens FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM m365_tenants t 
        WHERE t.id = tenant_record_id 
        AND has_client_access(auth.uid(), t.client_id)
        AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission]))
    )
);

-- 17. RLS Policies for m365_required_permissions
CREATE POLICY "Authenticated users can view required permissions"
ON public.m365_required_permissions FOR SELECT
TO authenticated
USING (true);

-- 18. RLS Policies for m365_tenant_permissions
CREATE POLICY "Users can view tenant permissions of accessible tenants"
ON public.m365_tenant_permissions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM m365_tenants t 
        WHERE t.id = tenant_record_id 
        AND has_client_access(auth.uid(), t.client_id)
    )
);

CREATE POLICY "Users with edit permission can manage tenant permissions"
ON public.m365_tenant_permissions FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM m365_tenants t 
        WHERE t.id = tenant_record_id 
        AND has_client_access(auth.uid(), t.client_id)
        AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission]))
    )
);

-- 19. RLS Policies for m365_tenant_submodules
CREATE POLICY "Users can view submodules of accessible tenants"
ON public.m365_tenant_submodules FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM m365_tenants t 
        WHERE t.id = tenant_record_id 
        AND has_client_access(auth.uid(), t.client_id)
    )
);

CREATE POLICY "Users with edit permission can manage submodules"
ON public.m365_tenant_submodules FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM m365_tenants t 
        WHERE t.id = tenant_record_id 
        AND has_client_access(auth.uid(), t.client_id)
        AND (get_module_permission(auth.uid(), 'm365'::text) = ANY (ARRAY['edit'::module_permission, 'full'::module_permission]))
    )
);

-- 20. RLS Policies for m365_audit_logs
CREATE POLICY "Users can view audit logs of accessible clients"
ON public.m365_audit_logs FOR SELECT
USING (
    client_id IS NULL 
    OR has_client_access(auth.uid(), client_id)
);

CREATE POLICY "Users with edit permission can insert audit logs"
ON public.m365_audit_logs FOR INSERT
WITH CHECK (
    client_id IS NULL 
    OR has_client_access(auth.uid(), client_id)
);

-- 21. Create updated_at triggers
CREATE TRIGGER update_m365_tenants_updated_at
BEFORE UPDATE ON public.m365_tenants
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_m365_app_credentials_updated_at
BEFORE UPDATE ON public.m365_app_credentials
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_m365_tokens_updated_at
BEFORE UPDATE ON public.m365_tokens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_m365_tenant_permissions_updated_at
BEFORE UPDATE ON public.m365_tenant_permissions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_m365_tenant_submodules_updated_at
BEFORE UPDATE ON public.m365_tenant_submodules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();