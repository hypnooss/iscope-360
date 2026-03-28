import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type PreviewMode = 'preview' | 'impersonate';

export interface PreviewUserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface PreviewModuleAccess {
  module: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    icon: string | null;
    color: string | null;
  };
  permission: 'none' | 'view' | 'edit';
}

export interface PreviewWorkspace {
  id: string;
  name: string;
}

export interface PreviewTarget {
  userId: string;
  workspaceId: string | null;
  profile: PreviewUserProfile;
  role: 'super_admin' | 'super_suporte' | 'workspace_admin' | 'user';
  permissions: Record<string, string>;
  modules: PreviewModuleAccess[];
  workspaces: PreviewWorkspace[];
}

interface PreviewContextType {
  isPreviewMode: boolean;
  mode: PreviewMode;
  previewTarget: PreviewTarget | null;
  previewSessionId: string | null;
  previewStartedAt: Date | null;
  loading: boolean;
  startPreview: (userId: string, workspaceId?: string, reason?: string) => Promise<boolean>;
  stopPreview: () => Promise<void>;
  canStartPreview: () => boolean;
}

const PREVIEW_SESSION_KEY = 'preview_session';

const PreviewContext = createContext<PreviewContextType | undefined>(undefined);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [mode] = useState<PreviewMode>('preview');
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewStartedAt, setPreviewStartedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(PREVIEW_SESSION_KEY);
    if (stored && user) {
      try {
        const session = JSON.parse(stored);
        if (session.adminId === user.id) {
          setIsPreviewMode(true);
          setPreviewTarget(session.target);
          setPreviewSessionId(session.sessionId);
          setPreviewStartedAt(new Date(session.startedAt));
        }
      } catch (e) {
        sessionStorage.removeItem(PREVIEW_SESSION_KEY);
      }
    }
  }, [user]);

  const canStartPreview = useCallback((): boolean => {
    return role === 'super_admin' || role === 'super_suporte';
  }, [role]);

  const startPreview = useCallback(async (
    userId: string, 
    workspaceId?: string, 
    _reason?: string
  ): Promise<boolean> => {
    if (!canStartPreview()) {
      toast.error('Sem permissão para visualizar');
      return false;
    }
    setLoading(true);
    // Mock preview logic
    setTimeout(() => {
      setLoading(false);
      setIsPreviewMode(true);
      toast.success('Modo de visualização ativado (Mock)');
    }, 500);
    return true;
  }, [canStartPreview]);

  const stopPreview = useCallback(async (): Promise<void> => {
    sessionStorage.removeItem(PREVIEW_SESSION_KEY);
    setIsPreviewMode(false);
    setPreviewTarget(null);
    setPreviewSessionId(null);
    setPreviewStartedAt(null);
    toast.success('Visualização encerrada');
  }, []);

  return (
    <PreviewContext.Provider
      value={{
        isPreviewMode,
        mode,
        previewTarget,
        previewSessionId,
        previewStartedAt,
        loading,
        startPreview,
        stopPreview,
        canStartPreview,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  const context = useContext(PreviewContext);
  if (context === undefined) {
    throw new Error('usePreview must be used within a PreviewProvider');
  }
  return context;
}
