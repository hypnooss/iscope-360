import { createContext, useContext, useState, ReactNode } from 'react';
import { User, Session, UserProfile, AppRole, ModulePermissions } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: AppRole | null;
  permissions: ModulePermissions;
  loading: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasPermission: (module: keyof ModulePermissions, required: any) => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  refreshMfaStatus: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const defaultPermissions: ModulePermissions = {
  dashboard: 'full',
  firewall: 'full',
  reports: 'full',
  users: 'full',
  external_domain: 'full',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USER: User = { id: 'nathan-guid-123', email: 'nathan@iscope360.com' };
const MOCK_PROFILE: UserProfile = {
  id: 'nathan-guid-123',
  email: 'nathan@iscope360.com',
  full_name: 'Nathan Mansberger',
  avatar_url: null,
  timezone: 'America/Sao_Paulo',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(MOCK_USER);
  const [session, setSession] = useState<Session | null>({ user: MOCK_USER, access_token: 'mock-token' });
  const [profile, setProfile] = useState<UserProfile | null>(MOCK_PROFILE);
  const [role] = useState<AppRole | null>('super_admin');
  const [permissions] = useState<ModulePermissions>(defaultPermissions);
  const [loading, setLoading] = useState(false);
  const [mfaRequired] = useState(false);
  const [mfaEnrolled] = useState(true);

  const signIn = async (email: string, _password: string) => {
    setLoading(true);
    setTimeout(() => {
      setUser({ id: 'user-guid', email });
      setProfile({ ...MOCK_PROFILE, email });
      setLoading(false);
    }, 500);
    return { error: null };
  };

  const signUp = async (email: string, _password: string, fullName: string) => {
    setLoading(true);
    setTimeout(() => {
      setUser({ id: 'new-user-guid', email });
      setProfile({ ...MOCK_PROFILE, email, full_name: fullName });
      setLoading(false);
    }, 500);
    return { error: null };
  };

  const signOut = async () => {
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const refreshMfaStatus = async () => {};
  const refreshProfile = async () => {};

  const hasPermission = (module: keyof ModulePermissions, required: any): boolean => {
    if (role === 'super_admin') return true;
    const current = permissions[module];
    const levels = ['view', 'edit', 'full'];
    return levels.indexOf(current) >= levels.indexOf(required);
  };

  const isAdmin = () => role === 'super_admin' || role === 'workspace_admin';
  const isSuperAdmin = () => role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        permissions,
        loading,
        mfaRequired,
        mfaEnrolled,
        signIn,
        signUp,
        signOut,
        hasPermission,
        isAdmin,
        isSuperAdmin,
        refreshMfaStatus,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
