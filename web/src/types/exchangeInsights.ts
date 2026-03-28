/**
 * @deprecated Use M365RiskCategory from m365Insights.ts instead
 * This file is kept for backwards compatibility only
 * 
 * Exchange Online now uses the unified M365 category system:
 * - mail_flow, mailbox_access, security_hygiene -> email_exchange
 * - security_policies, threats -> threats_activity  
 * - governance -> pim_governance
 */

// Legacy types - use M365RiskCategory from m365Insights.ts instead
export type ExoInsightCategory = 
  | 'mail_flow' 
  | 'mailbox_access' 
  | 'security_policies' 
  | 'security_hygiene' 
  | 'governance';

export type ExoInsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface AffectedMailbox {
  id: string;
  displayName: string;
  userPrincipalName: string;
  details?: {
    ruleName?: string;
    ruleId?: string;
    forwardTo?: string[];
    redirectTo?: string[];
    ruleCount?: number;
    autoReplyStatus?: string;
    externalAudience?: string;
  };
}

export interface ExchangeInsight {
  id: string;
  code: string;
  title: string;
  description: string;
  category: ExoInsightCategory;
  severity: ExoInsightSeverity;
  affectedCount: number;
  affectedMailboxes: AffectedMailbox[];
  criteria: string;
  recommendation: string;
  detectedAt: string;
}

export interface ExoInsightsSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface ExchangeInsightsResponse {
  success: boolean;
  insights: ExchangeInsight[];
  summary: ExoInsightsSummary;
  analyzedAt: string;
  tenant: { id: string; domain: string };
  error?: string;
  errorCode?: string;
  message?: string;
}

// Category labels for display
export const EXO_CATEGORY_LABELS: Record<ExoInsightCategory, string> = {
  mail_flow: 'Fluxo de E-mail',
  mailbox_access: 'Acesso a Mailbox',
  security_policies: 'Políticas de Segurança',
  security_hygiene: 'Higiene de Segurança',
  governance: 'Governança',
};

// Category icons mapping
export const EXO_CATEGORY_ICONS: Record<ExoInsightCategory, string> = {
  mail_flow: 'ArrowRightLeft',
  mailbox_access: 'Users',
  security_policies: 'Shield',
  security_hygiene: 'Sparkles',
  governance: 'Scale',
};

// Category colors
export const EXO_CATEGORY_COLORS: Record<ExoInsightCategory, { bg: string; text: string; border: string }> = {
  mail_flow: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-500',
    border: 'border-purple-500/30',
  },
  mailbox_access: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-500',
    border: 'border-blue-500/30',
  },
  security_policies: {
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    border: 'border-red-500/30',
  },
  security_hygiene: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-500',
    border: 'border-cyan-500/30',
  },
  governance: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-500',
    border: 'border-emerald-500/30',
  },
};

// Severity colors and labels (reusing same pattern as securityInsights)
export const EXO_SEVERITY_CONFIG: Record<ExoInsightSeverity, { label: string; color: string; bgColor: string; borderColor: string }> = {
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
