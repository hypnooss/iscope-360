import { useAuth } from '@/contexts/AuthContext';
import { UserProfile, AppRole } from '@/types/auth';

export interface EffectiveAuthResult {
  realProfile: UserProfile | null;
  realRole: AppRole | null;
  effectiveProfile: UserProfile | null;
  effectiveRole: AppRole | null;
  effectiveWorkspaces: any[];
  isViewingAsOther: boolean;
  isPreviewMode: boolean;
}

export function useEffectiveAuth(): EffectiveAuthResult {
  const { profile, role } = useAuth();
  
  return {
    realProfile: profile,
    realRole: role as any,
    effectiveProfile: profile,
    effectiveRole: role as any,
    effectiveWorkspaces: [],
    isViewingAsOther: false,
    isPreviewMode: false,
  };
}
