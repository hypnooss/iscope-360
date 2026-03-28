// M365 Analyzer - Security Intelligence Types

export type M365AnalyzerSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type M365AnalyzerCategory =
  | 'security_risk'
  | 'identity_access'
  | 'conditional_access'
  | 'exchange_health'
  | 'audit_compliance'
  | 'phishing_threats'
  | 'mailbox_capacity'
  | 'behavioral_baseline'
  | 'account_compromise'
  | 'suspicious_rules'
  | 'exfiltration'
  | 'operational_risks'
  | 'threat_protection'
  | 'teams_governance'
  | 'sharepoint_exposure'
  | 'guest_access'
  | 'external_sharing'
  | 'collaboration_risk'
  | 'firewall_security';

export interface M365AnalyzerInsight {
  id: string;
  category: M365AnalyzerCategory;
  name: string;
  description: string;
  severity: M365AnalyzerSeverity;
  details?: string;
  affectedUsers?: string[];
  count?: number;
  recommendation?: string;
  analysis?: string;
  businessImpact?: string;
  status?: 'fail' | 'pass' | 'not_applicable';
  metadata?: Record<string, unknown>;
}

export interface M365AnalyzerSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface M365AnalyzerMetrics {
  phishing: {
    totalBlocked: number;
    quarantined: number;
    topAttackedUsers: { user: string; count: number }[];
    topSenderDomains: { domain: string; count: number }[];
  };
  mailbox: {
    totalMailboxes: number;
    above80Pct: number;
    above90Pct: number;
    topMailboxes: { user: string; usedGB: number; pct: number }[];
  };
  behavioral: {
    anomalousUsers: number;
    deviations: { user: string; metric: string; current: number; baseline: number; deviationPct: number }[];
  };
  compromise: {
    suspiciousLogins: number;
    correlatedAlerts: number;
    topRiskUsers: { user: string; reasons: string[] }[];
  };
  rules: {
    externalForwards: number;
    autoDelete: number;
    suspiciousRules: { user: string; ruleName: string; action: string; destination?: string }[];
  };
  exfiltration: {
    highVolumeExternal: number;
    topExternalDomains: { domain: string; count: number; attachments: number }[];
  };
  operational: {
    smtpAuthEnabled: number;
    legacyProtocols: number;
    inactiveWithActivity: number;
    fullAccessGrants: number;
  };
  // New categories
  securityRisk: {
    highRiskSignIns: number;
    mfaFailures: number;
    impossibleTravel: number;
    blockedAccounts: number;
    riskyUsers: number;
  };
  identity: {
    newUsers: number;
    disabledUsers: number;
    noMfaUsers: number;
    noConditionalAccess: number;
    serviceAccountInteractive: number;
    recentAppRegistrations: number;
  };
  conditionalAccess: {
    disabledPolicies: number;
    reportOnlyPolicies: number;
    excludedUsers: number;
    recentlyCreated: number;
  };
  exchangeHealth: {
    serviceIncidents: number;
    messageTraceFailures: number;
    sharedMailboxesNoOwner: number;
    connectorFailures: number;
  };
  audit: {
    mailboxAuditAlerts: number;
    adminAuditChanges: number;
    newDelegations: number;
    activeEdiscovery: number;
  };
  threatProtection: {
    spamBlocked: number;
    phishingDetected: number;
    malwareBlocked: number;
    quarantined: number;
    totalDelivered: number;
    totalFiltered: number;
    topSpamSenderDomains: { domain: string; count: number; recipients?: string[]; sampleSubjects?: string[] }[];
    topPhishingTargets: { user: string; count: number; senders?: string[]; sampleSubjects?: string[] }[];
    topMalwareSenders: { domain: string; count: number; recipients?: string[]; sampleSubjects?: string[] }[];
    topSpamRecipients: { user: string; count: number }[];
    deliveryBreakdown: { status: string; count: number }[];
    policyStatus: {
      antiSpam: 'enabled' | 'weak' | 'disabled';
      antiPhish: 'enabled' | 'weak' | 'disabled';
      safeLinks: 'enabled' | 'disabled';
      safeAttach: 'enabled' | 'disabled';
      malwareFilter: 'enabled' | 'weak' | 'disabled';
    };
  };
  emailTraffic?: {
    sent: number;
    received: number;
    totalMessages: number;
  };
  emailTrafficRankings?: {
    topSenders: { name: string; count: number }[];
    topRecipients: { name: string; count: number }[];
    topDestinationDomains: { name: string; count: number }[];
    topSourceDomains: { name: string; count: number }[];
  };
  mailboxRankings?: {
    topForwarding: { name: string; forwardTo: string }[];
    topInactive: { name: string; lastLogin: string }[];
    topOverQuota: { name: string; usagePct: number }[];
  };
}

export interface M365AnalyzerSnapshot {
  id: string;
  tenant_record_id: string;
  client_id: string;
  agent_task_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  period_start?: string;
  period_end?: string;
  score?: number;
  summary: M365AnalyzerSummary;
  insights: M365AnalyzerInsight[];
  metrics: M365AnalyzerMetrics;
  created_at: string;
}

export const M365_ANALYZER_CATEGORY_LABELS: Record<M365AnalyzerCategory, string> = {
  security_risk: 'Segurança e Risco',
  identity_access: 'Identidade e Acesso',
  conditional_access: 'Conditional Access',
  exchange_health: 'Saúde Exchange Online',
  audit_compliance: 'Auditoria e Compliance',
  phishing_threats: 'Phishing e Ameaças',
  mailbox_capacity: 'Capacidade de Mailbox',
  behavioral_baseline: 'Baseline Comportamental',
  account_compromise: 'Comprometimento de Conta',
  suspicious_rules: 'Regras Suspeitas',
  exfiltration: 'Exfiltração',
  operational_risks: 'Riscos Operacionais',
  threat_protection: 'Proteção contra Ameaças',
  teams_governance: 'Governança de Teams',
  sharepoint_exposure: 'Exposição SharePoint',
  guest_access: 'Acesso de Convidados',
  external_sharing: 'Compartilhamento Externo',
  collaboration_risk: 'Risco de Colaboração',
  firewall_security: 'Segurança de Firewall',
};

export const M365_ANALYZER_CATEGORIES: M365AnalyzerCategory[] = [
  'security_risk',
  'identity_access',
  'conditional_access',
  'exchange_health',
  'audit_compliance',
  'phishing_threats',
  'mailbox_capacity',
  'behavioral_baseline',
  'account_compromise',
  'suspicious_rules',
  'exfiltration',
  'operational_risks',
  'threat_protection',
  'teams_governance',
  'sharepoint_exposure',
  'guest_access',
  'external_sharing',
  'collaboration_risk',
  'firewall_security',
];

export function groupM365AnalyzerInsightsByCategory(
  insights: M365AnalyzerInsight[]
): Record<M365AnalyzerCategory, M365AnalyzerInsight[]> {
  const grouped = {} as Record<M365AnalyzerCategory, M365AnalyzerInsight[]>;
  for (const cat of M365_ANALYZER_CATEGORIES) {
    grouped[cat] = [];
  }
  for (const insight of insights) {
    if (grouped[insight.category]) {
      grouped[insight.category].push(insight);
    }
  }
  return grouped;
}
