import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePreview } from '@/contexts/PreviewContext';

export interface TenantConnection {
  id: string;
  tenant_id: string;
  tenant_domain: string | null;
  display_name: string | null;
  connection_status: 'pending' | 'connected' | 'partial' | 'failed' | 'disconnected';
  last_validated_at: string | null;
  created_at: string;
  client: {
    id: string;
    name: string;
  };
}

export interface RequiredPermission {
  id: string;
  permission_name: string;
  permission_type: string;
  description: string | null;
  is_required: boolean;
  submodule: string;
}

export interface TenantPermission {
  id: string;
  tenant_record_id: string;
  permission_name: string;
  permission_type: string;
  status: 'pending' | 'granted' | 'denied';
  granted_at: string | null;
  error_reason: string | null;
}

export function useTenantConnection() {
  const { user } = useAuth();
  const { isPreviewMode, previewTarget } = usePreview();
  const [tenants, setTenants] = useState<TenantConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTenants = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      let query = supabase
        .from('m365_tenants')
        .select(`
          id,
          tenant_id,
          tenant_domain,
          display_name,
          connection_status,
          last_validated_at,
          created_at,
          clients!inner(id, name)
        `)
        .order('created_at', { ascending: false });

      // Filter by preview workspaces if in preview mode
      if (isPreviewMode && previewTarget?.workspaces) {
        const workspaceIds = previewTarget.workspaces.map(w => w.id);
        if (workspaceIds.length > 0) {
          query = query.in('client_id', workspaceIds);
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const formattedData = (data || []).map((t: any) => ({
        ...t,
        client: t.clients
      }));

      setTenants(formattedData);
    } catch (err: any) {
      console.error('Error fetching tenants:', err);
      setError(err.message || 'Erro ao carregar tenants');
    } finally {
      setLoading(false);
    }
  };

  const disconnectTenant = async (tenantId: string) => {
    try {
      const { error } = await supabase
        .from('m365_tenants')
        .update({ connection_status: 'disconnected' })
        .eq('id', tenantId);

      if (error) throw error;

      // Log the disconnection
      const tenant = tenants.find(t => t.id === tenantId);
      if (tenant) {
        await supabase.from('m365_audit_logs').insert({
          tenant_record_id: tenantId,
          client_id: tenant.client.id,
          user_id: user?.id,
          action: 'disconnect',
          action_details: { reason: 'user_initiated' },
        });
      }

      await fetchTenants();
      return { success: true };
    } catch (err: any) {
      console.error('Error disconnecting tenant:', err);
      return { success: false, error: err.message };
    }
  };

  const deleteTenant = async (tenantId: string) => {
    try {
      const tenant = tenants.find(t => t.id === tenantId);
      
      // Log before deletion (while we still have tenant_record_id)
      if (tenant) {
        await supabase.from('m365_audit_logs').insert({
          tenant_record_id: null, // Set to null since tenant will be deleted
          client_id: tenant.client.id,
          user_id: user?.id,
          action: 'delete',
          action_details: { 
            reason: 'user_initiated',
            deleted_tenant_id: tenant.tenant_id,
            deleted_tenant_domain: tenant.tenant_domain,
            deleted_display_name: tenant.display_name,
          },
        });
      }

      // Delete related records first (cascade should handle this, but being explicit)
      // Delete tenant permissions
      await supabase
        .from('m365_tenant_permissions')
        .delete()
        .eq('tenant_record_id', tenantId);

      // Delete tenant submodules
      await supabase
        .from('m365_tenant_submodules')
        .delete()
        .eq('tenant_record_id', tenantId);

      // Delete app credentials
      await supabase
        .from('m365_app_credentials')
        .delete()
        .eq('tenant_record_id', tenantId);

      // Delete tokens
      await supabase
        .from('m365_tokens')
        .delete()
        .eq('tenant_record_id', tenantId);

      // Finally delete the tenant record
      const { error } = await supabase
        .from('m365_tenants')
        .delete()
        .eq('id', tenantId);

      if (error) throw error;

      await fetchTenants();
      return { success: true };
    } catch (err: any) {
      console.error('Error deleting tenant:', err);
      return { success: false, error: err.message };
    }
  };

  const testConnection = async (tenantId: string) => {
    try {
      // Find the tenant
      const tenant = tenants.find(t => t.id === tenantId);
      if (!tenant) {
        return { success: false, error: 'Tenant não encontrado.' };
      }

      // Fetch credentials from m365_app_credentials
      const { data: credentials, error: credError } = await supabase
        .from('m365_app_credentials')
        .select('azure_app_id, client_secret_encrypted, auth_type')
        .eq('tenant_record_id', tenantId)
        .single();

      if (credError || !credentials) {
        console.error('Credentials error:', credError);
        return { 
          success: false, 
          error: 'Credenciais não encontradas. O tenant pode não ter completado o consentimento do administrador.' 
        };
      }

      let clientSecret = credentials.client_secret_encrypted;

      // If using multi-tenant app or no local secret, get the global secret
      if (credentials.auth_type === 'multi_tenant_app' || !clientSecret) {
        const { data: globalConfig, error: globalError } = await supabase
          .from('m365_global_config')
          .select('client_secret_encrypted')
          .limit(1)
          .maybeSingle();

        if (globalError || !globalConfig?.client_secret_encrypted) {
          console.error('Global config error:', globalError);
          return { 
            success: false, 
            error: 'Configuração global M365 não encontrada. Configure o App Multi-Tenant em Administração > Configurações.' 
          };
        }

        clientSecret = globalConfig.client_secret_encrypted;
      }

      // Call edge function to validate the connection
      const { data, error } = await supabase.functions.invoke('validate-m365-connection', {
        body: {
          tenant_id: tenant.tenant_id,
          app_id: credentials.azure_app_id,
          client_secret: clientSecret,
          tenant_record_id: tenantId,
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      // Refresh tenants to get updated status
      await fetchTenants();

      if (!data.success) {
        return { 
          success: false, 
          error: data.error || 'Falha ao validar conexão.',
          details: data.details,
        };
      }

      return { 
        success: true, 
        permissions: data.permissions,
        connection_status: data.connection_status,
      };
    } catch (err: any) {
      console.error('Error testing connection:', err);
      return { success: false, error: err.message };
    }
  };

  const fetchTenantPermissions = async (tenantRecordId: string): Promise<TenantPermission[]> => {
    try {
      const { data, error } = await supabase
        .from('m365_tenant_permissions')
        .select('id, tenant_record_id, permission_name, permission_type, status, granted_at')
        .eq('tenant_record_id', tenantRecordId)
        .order('permission_name');

      if (error) throw error;
      return (data || []) as TenantPermission[];
    } catch (err: any) {
      console.error('Error fetching tenant permissions:', err);
      return [];
    }
  };

  const updateTenant = async (tenantId: string, updates: { display_name?: string; tenant_domain?: string }) => {
    try {
      const { error } = await supabase
        .from('m365_tenants')
        .update(updates)
        .eq('id', tenantId);

      if (error) throw error;

      // Get tenant for client_id
      const tenant = tenants.find(t => t.id === tenantId);

      // Log audit
      await supabase.from('m365_audit_logs').insert({
        tenant_record_id: tenantId,
        client_id: tenant?.client.id,
        user_id: user?.id,
        action: 'tenant_updated',
        action_details: updates,
      });

      await fetchTenants();
      return { success: true };
    } catch (err: any) {
      console.error('Error updating tenant:', err);
      return { success: false, error: err.message };
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [user, isPreviewMode, previewTarget]);

  const fetchLinkedAgent = async (tenantRecordId: string) => {
    try {
      const { data, error } = await supabase
        .from('m365_tenant_agents')
        .select(`
          id,
          agent_id,
          enabled,
          agents(id, name, certificate_thumbprint, azure_certificate_key_id)
        `)
        .eq('tenant_record_id', tenantRecordId)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (err: any) {
      console.error('Error fetching linked agent:', err);
      return null;
    }
  };

  const fetchAvailableAgents = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('id, name, certificate_thumbprint, azure_certificate_key_id')
        .eq('client_id', clientId)
        .eq('revoked', false)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (err: any) {
      console.error('Error fetching available agents:', err);
      return [];
    }
  };

  const linkAgent = async (tenantRecordId: string, agentId: string) => {
    try {
      // First, remove any existing link
      await supabase
        .from('m365_tenant_agents')
        .delete()
        .eq('tenant_record_id', tenantRecordId);

      // Create new link
      const { error } = await supabase
        .from('m365_tenant_agents')
        .insert({
          tenant_record_id: tenantRecordId,
          agent_id: agentId,
          enabled: true,
        });

      if (error) throw error;

      // Log audit
      const tenant = tenants.find(t => t.id === tenantRecordId);
      if (tenant) {
        await supabase.from('m365_audit_logs').insert({
          tenant_record_id: tenantRecordId,
          client_id: tenant.client.id,
          user_id: user?.id,
          action: 'agent_linked',
          action_details: { agent_id: agentId },
        });
      }

      return { success: true };
    } catch (err: any) {
      console.error('Error linking agent:', err);
      return { success: false, error: err.message };
    }
  };

  const unlinkAgent = async (tenantRecordId: string) => {
    try {
      const { error } = await supabase
        .from('m365_tenant_agents')
        .delete()
        .eq('tenant_record_id', tenantRecordId);

      if (error) throw error;

      // Log audit
      const tenant = tenants.find(t => t.id === tenantRecordId);
      if (tenant) {
        await supabase.from('m365_audit_logs').insert({
          tenant_record_id: tenantRecordId,
          client_id: tenant.client.id,
          user_id: user?.id,
          action: 'agent_unlinked',
          action_details: {},
        });
      }

      return { success: true };
    } catch (err: any) {
      console.error('Error unlinking agent:', err);
      return { success: false, error: err.message };
    }
  };

  return {
    tenants,
    loading,
    error,
    refetch: fetchTenants,
    disconnectTenant,
    deleteTenant,
    testConnection,
    updateTenant,
    fetchTenantPermissions,
    fetchLinkedAgent,
    fetchAvailableAgents,
    linkAgent,
    unlinkAgent,
    hasConnectedTenant: tenants.some(t => t.connection_status === 'connected' || t.connection_status === 'partial'),
  };
}

type M365Submodule = 'entra_id' | 'sharepoint' | 'exchange' | 'defender' | 'intune';

export function useRequiredPermissions(submodule?: M365Submodule) {
  const [permissions, setPermissions] = useState<RequiredPermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        let query = supabase
          .from('m365_required_permissions')
          .select('id, permission_name, permission_type, description, is_required, submodule')
          .order('is_required', { ascending: false });

        if (submodule) {
          query = query.eq('submodule', submodule);
        }

        const { data, error } = await query;

        if (error) throw error;
        setPermissions(data || []);
      } catch (error) {
        console.error('Error fetching permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [submodule]);

  return { permissions, loading };
}
