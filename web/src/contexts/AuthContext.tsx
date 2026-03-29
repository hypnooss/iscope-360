import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";
import { setUserTimezone } from "@/lib/dateUtils";

type User = {
  id: string;
  email: string;
};

type Session = {
  accessToken: string;
  refreshToken: string;
} | null;

type AppRole = "super_admin" | "super_suporte" | "workspace_admin" | "user";
type ModulePermission = "view" | "edit" | "full";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
}

interface ModulePermissions {
  dashboard: ModulePermission;
  firewall: ModulePermission;
  reports: ModulePermission;
  users: ModulePermission;
  external_domain: ModulePermission;
}

const defaultPermissions: ModulePermissions = {
  dashboard: "view",
  firewall: "view",
  reports: "view",
  users: "view",
  external_domain: "view",
};

const ACCESS_KEY = "iscope_access_token";
const REFRESH_KEY = "iscope_refresh_token";

interface MeApi {
  user_id: string;
  email: string;
  msp_id: string;
  msp_slug: string;
  msp_name: string;
  effective_role: string;
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    timezone: string;
  };
  permissions: Record<string, string>;
  mfa_enabled: boolean;
  mfa_required_by_msp: boolean;
}

function mapPermissions(raw: Record<string, string>): ModulePermissions {
  const p = { ...defaultPermissions };
  (Object.keys(p) as (keyof ModulePermissions)[]).forEach((k) => {
    const v = raw[k];
    if (v === "view" || v === "edit" || v === "full") p[k] = v;
  });
  return p;
}

function mapRole(r: string): AppRole {
  if (r === "super_admin" || r === "super_suporte" || r === "workspace_admin" || r === "user") return r;
  return "user";
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
  const mfaTokenRef = useRef<string | null>(null);

  const clearUserData = useCallback(() => {
    setProfile(null);
    setRole(null);
    setPermissions(defaultPermissions);
    setMfaRequired(false);
    setMfaEnrolled(false);
    setMfaStep(false);
    mfaTokenRef.current = null;
    setUserTimezone("UTC");
  }, []);

  const persistTokens = (access: string, refresh: string) => {
    sessionStorage.setItem(ACCESS_KEY, access);
    sessionStorage.setItem(REFRESH_KEY, refresh);
    setSession({ accessToken: access, refreshToken: refresh });
  };

  const clearTokens = () => {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    setSession(null);
  };

  const applyMe = useCallback((me: MeApi, accessToken: string) => {
    const rt = sessionStorage.getItem(REFRESH_KEY) || "";
    setUser({ id: me.user_id, email: me.email });
    setProfile({
      id: me.profile.id,
      email: me.profile.email,
      full_name: me.profile.full_name,
      avatar_url: me.profile.avatar_url,
      timezone: me.profile.timezone || "UTC",
    });
    setUserTimezone(me.profile.timezone || "UTC");
    setRole(mapRole(me.effective_role));
    setPermissions(mapPermissions(me.permissions));
    setMfaEnrolled(me.mfa_enabled);
    setMfaRequired(me.mfa_required_by_msp && !me.mfa_enabled);
    setSession({ accessToken, refreshToken: rt });
  }, []);

  const fetchMe = useCallback(
    async (accessToken: string, depth = 0): Promise<void> => {
      if (depth > 2) throw new Error("Sessao expirada");
      const res = await apiFetch("/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const refresh = sessionStorage.getItem(REFRESH_KEY);
        if (refresh) {
          const r2 = await apiFetch("/auth/refresh", {
            method: "POST",
            body: JSON.stringify({ refresh_token: refresh }),
          });
          if (r2.ok) {
            const t = (await r2.json()) as { access_token: string; refresh_token: string };
            persistTokens(t.access_token, t.refresh_token);
            return fetchMe(t.access_token, depth + 1);
          }
        }
        throw new Error("Sessao expirada");
      }
      const me = (await res.json()) as MeApi;
      applyMe(me, accessToken);
    },
    [applyMe]
  );

  useEffect(() => {
    const access = sessionStorage.getItem(ACCESS_KEY);
    const refresh = sessionStorage.getItem(REFRESH_KEY);
    if (!access || !refresh) {
      setLoading(false);
      return;
    }
    setSession({ accessToken: access, refreshToken: refresh });
    fetchMe(access)
      .catch(() => {
        clearTokens();
        clearUserData();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [fetchMe, clearUserData]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data as { detail?: string }).detail || "Credenciais invalidas";
        setLoading(false);
        return { error: new Error(detail) };
      }
      if ("mfa_token" in data && (data as { status?: string }).status === "mfa_required") {
        mfaTokenRef.current = (data as { mfa_token: string }).mfa_token;
        setMfaStep(true);
        setMfaRequired(true);
        setLoading(false);
        return { error: null };
      }
      if ("access_token" in data) {
        const d = data as {
          access_token: string;
          refresh_token: string;
          status?: string;
        };
        persistTokens(d.access_token, d.refresh_token);
        if (d.status === "mfa_enrollment_required") {
          setMfaRequired(true);
          setMfaEnrolled(false);
        }
        await fetchMe(d.access_token);
        setLoading(false);
        return { error: null };
      }
      setLoading(false);
      return { error: new Error("Resposta inesperada do servidor") };
    } catch (e) {
      setLoading(false);
      return { error: e instanceof Error ? e : new Error("Falha de rede") };
    }
  };

  const verifyMfa = async (code: string) => {
    const tok = mfaTokenRef.current;
    if (!tok) return { error: new Error("Fluxo MFA invalido") };
    setLoading(true);
    try {
      const res = await apiFetch("/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ mfa_token: tok, code: code.replace(/\s/g, "") }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data as { detail?: string }).detail || "Codigo invalido";
        setLoading(false);
        return { error: new Error(detail) };
      }
      const d = data as { access_token: string; refresh_token: string };
      mfaTokenRef.current = null;
      setMfaStep(false);
      persistTokens(d.access_token, d.refresh_token);
      await fetchMe(d.access_token);
      setLoading(false);
      return { error: null };
    } catch (e) {
      setLoading(false);
      return { error: e instanceof Error ? e : new Error("Falha de rede") };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const mspId = import.meta.env.VITE_DEFAULT_MSP_ID as string | undefined;
    if (!mspId) {
      return { error: new Error("Cadastro publico nao configurado (VITE_DEFAULT_MSP_ID)") };
    }
    const res = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        msp_id: mspId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (data as { detail?: string }).detail || "Erro ao registrar";
      return { error: new Error(detail) };
    }
    const d = data as { access_token: string; refresh_token: string };
    persistTokens(d.access_token, d.refresh_token);
    await fetchMe(d.access_token);
    return { error: null };
  };

  const signOut = async () => {
    const refresh = sessionStorage.getItem(REFRESH_KEY);
    if (refresh) {
      await apiFetch("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refresh }),
      }).catch(() => {});
    }
    clearTokens();
    setUser(null);
    clearUserData();
  };

  const refreshMfaStatus = async () => {
    const access = sessionStorage.getItem(ACCESS_KEY);
    if (!access) return;
    try {
      await fetchMe(access);
    } catch {
      /* ignore */
    }
  };

  const refreshProfile = async () => {
    const access = sessionStorage.getItem(ACCESS_KEY);
    if (!access) return;
    try {
      await fetchMe(access);
    } catch {
      /* ignore */
    }
  };

  const hasPermission = (module: keyof ModulePermissions, required: ModulePermission): boolean => {
    if (role === "super_admin") return true;
    const current = permissions[module];
    const levels: ModulePermission[] = ["view", "edit", "full"];
    return levels.indexOf(current) >= levels.indexOf(required);
  };

  const isAdmin = () => role === "super_admin" || role === "workspace_admin";
  const isSuperAdmin = () => role === "super_admin";

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
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
