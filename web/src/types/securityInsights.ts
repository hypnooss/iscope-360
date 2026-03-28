// Security Insights Types for Entra ID Module

export type InsightCategory = 'identity_security' | 'behavior_risk' | 'governance';
export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AffectedUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  details?: Record<string, unknown>;
}

export interface SecurityInsight {
  id: string;
  code: string;
  title: string;
  description: string;
  category: InsightCategory;
  severity: InsightSeverity;
  affectedCount: number;
  affectedUsers: AffectedUser[];
  criteria: string;
  recommendation: string;
  detectedAt: string;
  timeRange: { from: string; to: string };
}

export interface InsightsSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface SecurityInsightsResponse {
  success: boolean;
  insights: SecurityInsight[];
  summary: InsightsSummary;
  analyzedPeriod: { from: string; to: string };
  tenant: { id: string; domain: string };
  error?: string;
  errorCode?: string;
  message?: string;
}

// Category labels for display
export const CATEGORY_LABELS: Record<InsightCategory, string> = {
  identity_security: 'Segurança de Identidade',
  behavior_risk: 'Comportamento e Risco',
  governance: 'Governança e Compliance',
};

// Category icons mapping
export const CATEGORY_ICONS: Record<InsightCategory, string> = {
  identity_security: 'Shield',
  behavior_risk: 'UserX',
  governance: 'Scale',
};

// Severity colors and labels
export const SEVERITY_CONFIG: Record<InsightSeverity, { label: string; color: string; bgColor: string; borderColor: string }> = {
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
