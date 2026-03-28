// Application Insights Types for Entra ID Module - App Registrations & Enterprise Apps

export type AppInsightCategory = 
  | 'credential_expiration' 
  | 'privileged_permissions' 
  | 'security_hygiene';

export type AppInsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AffectedApplication {
  id: string;
  appId: string;
  displayName: string;
  appType: 'AppRegistration' | 'EnterpriseApp';
  details?: {
    credentialType?: 'Secret' | 'Certificate';
    credentialKeyId?: string;
    expiresAt?: string;
    createdAt?: string;
    daysUntilExpiration?: number;
    permissions?: string[];
    hasAdminConsent?: boolean;
    ownerCount?: number;
    credentialCount?: number;
  };
}

export interface ApplicationInsight {
  id: string;
  code: string;
  title: string;
  description: string;
  category: AppInsightCategory;
  severity: AppInsightSeverity;
  affectedCount: number;
  affectedApplications: AffectedApplication[];
  criteria: string;
  recommendation: string;
  detectedAt: string;
}

export interface AppInsightsSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
  expiredCredentials: number;
  expiringIn30Days: number;
  privilegedApps: number;
}

export interface ApplicationInsightsResponse {
  success: boolean;
  insights: ApplicationInsight[];
  summary: AppInsightsSummary;
  tenant: { id: string; domain: string };
  error?: string;
  errorCode?: string;
  message?: string;
}

// Category labels for display
export const APP_CATEGORY_LABELS: Record<AppInsightCategory, string> = {
  credential_expiration: 'Expiração de Credenciais',
  privileged_permissions: 'Permissões Privilegiadas',
  security_hygiene: 'Higiene de Segurança',
};

// Category icons mapping
export const APP_CATEGORY_ICONS: Record<AppInsightCategory, string> = {
  credential_expiration: 'Key',
  privileged_permissions: 'ShieldAlert',
  security_hygiene: 'ClipboardCheck',
};

// Category colors
export const APP_CATEGORY_COLORS: Record<AppInsightCategory, { bg: string; text: string; border: string }> = {
  credential_expiration: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-500',
    border: 'border-rose-500/30',
  },
  privileged_permissions: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-500',
    border: 'border-purple-500/30',
  },
  security_hygiene: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-500',
    border: 'border-cyan-500/30',
  },
};

// Severity colors and labels (matches securityInsights.ts)
export const APP_SEVERITY_CONFIG: Record<AppInsightSeverity, { label: string; color: string; bgColor: string; borderColor: string }> = {
  critical: {
    label: 'Crítico',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
  },
  high: {
    label: 'Alto',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  medium: {
    label: 'Médio',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  low: {
    label: 'Baixo',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  info: {
    label: 'Informativo',
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
  },
};
