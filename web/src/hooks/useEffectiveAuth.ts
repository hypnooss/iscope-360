import { useAuth } from '@/contexts/AuthContext';
import { usePreview, PreviewUserProfile, PreviewWorkspace } from '@/contexts/PreviewContext';
import { UserProfile, AppRole } from '@/types/auth';

export interface EffectiveAuthResult {
  realProfile: UserProfile | null;
  realRole: AppRole | null;
  effectiveProfile: UserProfile | null;
  effectiveRole: AppRole | null;
  effectiveWorkspaces: PreviewWorkspace[];
  isViewingAsOther: boolean;
  isPreviewMode: boolean;
}

export function useEffectiveAuth(): EffectiveAuthResult {
  const { profile, role } = useAuth();
  const { isPreviewMode, previewTarget } = usePreview();
  
  const convertProfile = (previewProfile: PreviewUserProfile | undefined): UserProfile | null => {
    if (!previewProfile) return null;
    return {
      id: previewProfile.id,
      email: previewProfile.email,
      full_name: previewProfile.full_name,
      avatar_url: previewProfile.avatar_url,
    };
  };
  
  const effectiveProfile = isPreviewMode && previewTarget 
    ? convertProfile(previewTarget.profile) 
    : profile;
    
  const effectiveRole = isPreviewMode && previewTarget 
    ? previewTarget.role 
    : role;
    
  const effectiveWorkspaces = isPreviewMode && previewTarget?.workspaces
    ? previewTarget.workspaces
    : [];
    
  return {
    realProfile: profile,
    realRole: role as any,
    effectiveProfile,
    effectiveRole: effectiveRole as any,
    effectiveWorkspaces,
    isViewingAsOther: isPreviewMode,
    isPreviewMode,
  };
}
