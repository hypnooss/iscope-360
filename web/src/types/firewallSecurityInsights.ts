// Firewall Security Insights Types (Educational Layer for Analyzer v2)

export type FirewallInsightSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface FirewallInsightMetric {
  label: string;
  value: string | number;
}

export type FirewallInsightSource = 'traffic' | 'compliance_correlation';

export interface FirewallSecurityInsight {
  id: string;
  title: string;
  severity: FirewallInsightSeverity;
  icon: string;
  what: string;
  why: string;
  bestPractice: string[];
  businessImpact: string;
  metrics: FirewallInsightMetric[];
  source?: FirewallInsightSource;
  complianceCode?: string;
  status?: 'fail' | 'pass' | 'not_applicable';
}

// Correlation rule definition
export interface ComplianceCorrelationRule {
  complianceCode: string;
  metricCondition: (metrics: Record<string, unknown>) => boolean;
  severity: FirewallInsightSeverity;
  icon: string;
  title: string;
  what: (metrics: Record<string, unknown>) => string;
  why: string;
  bestPractice: string[];
  businessImpact: string;
  metricExtractor: (metrics: Record<string, unknown>) => FirewallInsightMetric[];
}

// Severity colors and labels using semantic tokens
export const FIREWALL_INSIGHT_SEVERITY_CONFIG: Record<
  FirewallInsightSeverity,
  { label: string; borderColor: string; badgeClass: string }
> = {
  critical: {
    label: 'Crítico',
    borderColor: 'border-l-red-500',
    badgeClass: 'bg-red-500/20 text-red-500 border-red-500/30',
  },
  high: {
    label: 'Alto',
    borderColor: 'border-l-orange-500',
    badgeClass: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  },
  medium: {
    label: 'Médio',
    borderColor: 'border-l-yellow-500',
    badgeClass: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  },
  low: {
    label: 'Baixo',
    borderColor: 'border-l-blue-400',
    badgeClass: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
  },
};
