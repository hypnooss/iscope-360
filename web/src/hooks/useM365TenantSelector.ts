import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { usePreview } from '@/contexts/PreviewContext';
import { supabase } from '@/integrations/supabase/client';

export interface TenantOption {
  id: string;
  displayName: string;
  domain: string;
}

export function useM365TenantSelector(workspaceId?: string | null) {
  const { user } = useAuth();
  const { isPreviewMode, previewTarget } = usePreview();
  const [searchParams, setSearchParams] = useSearchParams();

  // Stable ref for setSearchParams to avoid re-render loops
  const setSearchParamsRef = useRef(setSearchParams);
  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  const paramTenantId = searchParams.get('tenant');

  const workspaceIds = isPreviewMode && previewTarget?.workspaces
    ? previewTarget.workspaces.map(w => w.id)
    : null;

  const { data: tenants = [], isLoading: loading } = useQuery({
    queryKey: ['m365-tenants', workspaceId, user?.id, workspaceIds],
    queryFn: async () => {
      let query = supabase
        .from('m365_tenants')
        .select('id, display_name, tenant_domain, client_id')
        .in('connection_status', ['connected', 'partial']);

      if (workspaceId) {
        query = query.eq('client_id', workspaceId);
      } else if (workspaceIds && workspaceIds.length > 0) {
        query = query.in('client_id', workspaceIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading tenants:', error);
        return [];
      }

      return (data || []).map(t => ({
        id: t.id,
        displayName: t.display_name || 'Tenant M365',
        domain: t.tenant_domain || '',
      }));
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // Auto-select first tenant when tenants load and no tenant in URL
  useEffect(() => {
    if (tenants.length > 0 && !paramTenantId) {
      setSearchParamsRef.current(prev => {
        const next = new URLSearchParams(prev);
        next.set('tenant', tenants[0].id);
        return next;
      }, { replace: true });
    }
  }, [tenants, paramTenantId]);

  const selectedTenantId = paramTenantId && tenants.some(t => t.id === paramTenantId)
    ? paramTenantId
    : tenants.length > 0 ? tenants[0].id : null;

  const selectedTenant = tenants.find(t => t.id === selectedTenantId) || null;

  const selectTenant = useCallback((id: string) => {
    setSearchParamsRef.current(prev => {
      const next = new URLSearchParams(prev);
      next.set('tenant', id);
      return next;
    });
  }, []);

  return {
    tenants,
    selectedTenantId,
    selectedTenant,
    selectTenant,
    loading,
  };
}
