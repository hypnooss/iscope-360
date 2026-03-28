import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RiskDetail {
  displayName: string;
  upn: string;
  riskLevel: string;
  riskState: string;
  lastUpdated: string;
}

export interface LoginDetail {
  displayName: string;
  upn: string;
  status: 'success' | 'failed' | 'blocked';
  errorCode: number;
  location: string;
  city: string;
  app: string;
  createdDateTime: string;
}

export interface AdminDetail {
  displayName: string;
  upn: string;
  roles: string[];
}

export interface DisabledUserDetail {
  displayName: string;
  upn: string;
  createdDateTime: string;
}

export interface GuestUserDetail {
  displayName: string;
  upn: string;
  mail: string;
  createdDateTime: string;
}

export interface PasswordDetail {
  activity: string;
  type: 'reset' | 'selfService' | 'forced';
  targetUser: string;
  initiatedBy: string;
  activityDateTime: string;
}

export interface EntraIdDashboardData {
  users: {
    total: number; signInEnabled: number; disabled: number; guests: number; onPremSynced: number;
    disabledDetails?: DisabledUserDetail[];
    guestDetails?: GuestUserDetail[];
  };
  admins: { total: number; globalAdmins: number; details?: AdminDetail[] };
  mfa: { total: number; enabled: number; disabled: number; strong: number; weak: number; methodBreakdown: Record<string, number>; userDetails?: Array<{ displayName: string; upn: string; methods: string[]; hasMfa: boolean; defaultMethod?: string | null }> };
  risks: { riskyUsers: number; atRisk: number; compromised: number; details?: RiskDetail[] };
  loginActivity: { total: number; success: number; failed: number; mfaRequired: number; blocked: number; details?: LoginDetail[] };
  userChanges: { updated: number; new: number; enabled: number; disabled: number; deleted: number };
  passwordActivity: { resets: number; forcedChanges: number; selfService: number; details?: PasswordDetail[] };
  loginCountriesSuccess: { country: string; count: number }[];
  loginCountriesFailed: { country: string; count: number }[];
  analyzedAt: string;
}

interface UseEntraIdDashboardOptions {
  tenantRecordId: string | null;
}

export function useEntraIdDashboard({ tenantRecordId }: UseEntraIdDashboardOptions) {
  const [data, setData] = useState<EntraIdDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapResultToData = (result: any): EntraIdDashboardData => ({
    users: {
      ...(result.users || { total: 0, signInEnabled: 0, disabled: 0, guests: 0, onPremSynced: 0 }),
      disabledDetails: result.users?.disabledDetails || [],
      guestDetails: result.users?.guestDetails || [],
    },
    admins: { ...(result.admins || { total: 0, globalAdmins: 0 }), details: result.admins?.details || [] },
    mfa: { ...(result.mfa || { total: 0, enabled: 0, disabled: 0, strong: 0, weak: 0 }), methodBreakdown: result.mfa?.methodBreakdown || {}, userDetails: result.mfa?.userDetails || [] },
    risks: { ...(result.risks || { riskyUsers: 0, atRisk: 0, compromised: 0 }), details: result.risks?.details || [] },
    loginActivity: { ...(result.loginActivity || { total: 0, success: 0, failed: 0, mfaRequired: 0, blocked: 0 }), details: result.loginActivity?.details || [] },
    userChanges: result.userChanges || { updated: 0, new: 0, enabled: 0, disabled: 0, deleted: 0 },
    passwordActivity: { ...(result.passwordActivity || { resets: 0, forcedChanges: 0, selfService: 0 }), details: result.passwordActivity?.details || [] },
    loginCountriesSuccess: result.loginCountriesSuccess || [],
    loginCountriesFailed: result.loginCountriesFailed || [],
    analyzedAt: result.analyzedAt || '',
  });

  const loadCache = useCallback(async () => {
    if (!tenantRecordId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: snapshot, error: snapError } = await supabase
        .from('m365_dashboard_snapshots')
        .select('data, created_at')
        .eq('tenant_record_id', tenantRecordId)
        .eq('dashboard_type', 'entra_id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!snapError && snapshot?.data) {
        setData(mapResultToData(snapshot.data as any));
      } else {
        const { data: tenant, error: dbError } = await supabase
          .from('m365_tenants')
          .select('entra_dashboard_cache, entra_dashboard_cached_at')
          .eq('id', tenantRecordId)
          .single();

        if (dbError) throw new Error(dbError.message);

        if (tenant?.entra_dashboard_cache) {
          setData(mapResultToData(tenant.entra_dashboard_cache as any));
        } else {
          setData(null);
        }
      }
    } catch (err) {
      console.error('useEntraIdDashboard loadCache error:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [tenantRecordId]);

  const refresh = useCallback(async () => {
    if (!tenantRecordId) return;
    setRefreshing(true);
    setError(null);

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('entra-id-dashboard', {
        body: { tenant_record_id: tenantRecordId },
      });

      if (fnError) throw new Error(fnError.message);
      if (!result?.success && !result?.users) throw new Error(result?.error || 'Erro ao atualizar dashboard');

      setData(mapResultToData(result));
      loadCache().catch(() => {});
    } catch (err) {
      console.error('useEntraIdDashboard refresh error:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setRefreshing(false);
    }
  }, [tenantRecordId, loadCache]);

  useEffect(() => {
    if (tenantRecordId) loadCache();
  }, [tenantRecordId, loadCache]);

  return { data, loading, refreshing, error, refresh };
}
