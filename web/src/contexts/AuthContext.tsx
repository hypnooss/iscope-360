import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setUserTimezone } from '@/lib/dateUtils';

type AppRole = 'super_admin' | 'super_suporte' | 'workspace_admin' | 'user';
type ModulePermission = 'view' | 'edit' | 'full';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string; // default: 'UTC'
}

interface ModulePermissions {
  dashboard: ModulePermission;
  firewall: ModulePermission;
  reports: ModulePermission;
  users: ModulePermission;
  external_domain: ModulePermission;
}

interface CachedUserData {
  profile: UserProfile;
  role: AppRole;
  permissions: ModulePermissions;
  timestamp: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: AppRole | null;
  permissions: ModulePermissions;
  loading: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  mfaStep: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  verifyMfa: (code: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasPermission: (module: keyof ModulePermissions, required: ModulePermission) => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  refreshMfaStatus: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const defaultPermissions: ModulePermissions = {
  dashboard: 'view',
  firewall: 'view',
  reports: 'view',
  users: 'view',
  external_domain: 'view',
};

const CACHE_KEY_PREFIX = 'user_data_';
const CACHE_TTL = 5 * 60 * 1000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<ModulePermissions>(defaultPermissions);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  
  const fetchingRef = useRef(false);
  const lastFetchedUserIdRef = useRef<string | null>(null);

  const checkMfaStatus = async () => {
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aalData) return;

      const { currentLevel, nextLevel } = aalData;
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const hasVerifiedTotp = factorsData?.totp?.some((f: any) => f.status === 'verified') ?? false;

      setMfaEnrolled(hasVerifiedTotp);

      if (nextLevel === 'aal2' && currentLevel === 'aal1') {
        setMfaRequired(true);
        setMfaStep(true);
      } else if (!hasVerifiedTotp) {
        setMfaRequired(true);
        setMfaStep(false);
      } else {
        setMfaRequired(false);
        setMfaStep(false);
      }
    } catch (err) {
      console.error('MFA status check error:', err);
    }
  };

  const refreshMfaStatus = async () => {
    await checkMfaStatus();
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
            checkMfaStatus();
          }, 0);
        } else {
          clearUserData();
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
        checkMfaStatus();
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearUserData = () => {
    setProfile(null);
    setRole(null);
    setPermissions(defaultPermissions);
    setMfaRequired(false);
    setMfaEnrolled(false);
    setMfaStep(false);
    setLoading(false);
    lastFetchedUserIdRef.current = null;
  };

  const getCachedData = (userId: string): CachedUserData | null => {
    try {
      const cached = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`);
      if (cached) {
        const parsed: CachedUserData = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL) {
          return parsed;
        }
        sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`);
      }
    } catch {
      // Ignora cache
    }
    return null;
  };

  const setCachedData = (userId: string, data: Omit<CachedUserData, 'timestamp'>) => {
    try {
      const cacheData: CachedUserData = {
        ...data,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(cacheData));
    } catch {
      // Ignora cache
    }
  };

  const fetchUserData = async (userId: string) => {
    if (fetchingRef.current && lastFetchedUserIdRef.current === userId) {
      return;
    }
    
    const cached = getCachedData(userId);
    if (cached) {
      setProfile(cached.profile);
      setRole(cached.role);
      setPermissions(cached.permissions);
      setUserTimezone(cached.profile.timezone || 'UTC');
      setLoading(false);
      lastFetchedUserIdRef.current = userId;
      return;
    }

    fetchingRef.current = true;
    lastFetchedUserIdRef.current = userId;

    try {
      const [profileResult, roleResult, permissionsResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('user_roles').select('role').eq('user_id', userId).single(),
        supabase.from('user_module_permissions').select('module_name, permission').eq('user_id', userId),
      ]);

      const profileData = profileResult.data as UserProfile | null;
      const roleData: any = roleResult.data || { role: 'user' };
      const permissionsData = permissionsResult.data || [];

      if (profileData) {
        setProfile(profileData);
        setUserTimezone(profileData.timezone || 'UTC');
      }

      const userRole = (roleData?.role as AppRole) || 'user';
      setRole(userRole);

      const perms = { ...defaultPermissions };
      if (permissionsData) {
        permissionsData.forEach((p: { module_name: string; permission: ModulePermission }) => {
          if (p.module_name in perms) {
            perms[p.module_name as keyof ModulePermissions] = p.permission;
          }
        });
      }
      setPermissions(perms);

      if (profileData) {
        setCachedData(userId, {
          profile: profileData,
          role: userRole,
          permissions: perms,
        });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const verifyMfa = async (code: string) => {
    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.find((f: any) => f.status === 'verified');
      if (!totpFactor) return { error: new Error("Nenhum fator MFA verificado encontrado") };

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code: code.replace(/\s/g, ""),
      });
      if (verifyError) throw verifyError;

      setMfaStep(false);
      setMfaRequired(false);
      return { error: null };
    } catch(err) {
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    if (user?.id) {
      sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${user.id}`);
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    clearUserData();
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        const profileData = data as UserProfile;
        setProfile(profileData);
        setUserTimezone(profileData.timezone || 'UTC');
        sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${user.id}`);
        lastFetchedUserIdRef.current = null;
      }
    } catch (err) {
      console.error('Error refreshing profile:', err);
    }
  };

  const hasPermission = (module: keyof ModulePermissions, required: ModulePermission): boolean => {
    if (role === 'super_admin') return true;
    const current = permissions[module];
    const levels: ModulePermission[] = ['view', 'edit', 'full'];
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
        mfaStep,
        signIn,
        verifyMfa,
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

