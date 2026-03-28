export type ComplianceStatus = 'pass' | 'fail' | 'warning' | 'pending' | 'unknown';

export interface EvidenceItem {
  label: string;
  value: string;
  type?: 'text' | 'code' | 'list' | 'json';
}

export interface ComplianceCheck {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ComplianceStatus;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation?: string;
  details?: string;
  evidence?: EvidenceItem[];
  rawData?: Record<string, unknown>;
  apiEndpoint?: string;
  /** Risco técnico - detalhes da vulnerabilidade ou problema */
  technicalRisk?: string;
  /** Impacto no negócio caso a regra falhe */
  businessImpact?: string;
}

export interface ComplianceCategory {
  name: string;
  icon: string;
  checks: ComplianceCheck[];
  passRate: number;
}

export interface ConnectionConfig {
  url: string;
  apiKey: string;
  verified: boolean;
}

export interface SubdomainEntry {
  subdomain: string;
  sources: string[];
  addresses: Array<{ ip: string; type?: string }>;
  is_alive?: boolean;
}

export interface SubdomainSummary {
  total_found: number;
  subdomains: SubdomainEntry[];
  sources: string[];
  mode: 'passive' | 'active' | string;
}

export interface ComplianceReport {
  overallScore: number;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  categories: ComplianceCategory[];
  generatedAt: Date;
  firmwareVersion?: string;
  cves?: CVEInfo[];
  // Optional summary for External Domain DNS reports
  dnsSummary?: {
    ns?: string[];
    soaMname?: string | null;
    soaContact?: string | null;
    dnssecHasDnskey?: boolean;
    dnssecHasDs?: boolean;
    dnssecValidated?: boolean;
    dnssecNotes?: string[];
  };
  // Optional subdomain enumeration summary (Amass)
  subdomainSummary?: SubdomainSummary;
  // System info from report
  systemInfo?: {
    hostname?: string;
    model?: string;
    serial?: string;
    uptime?: string;
    vendor?: string;
  };
}

export interface CVEInfo {
  id: string;
  description: string;
  affectedVersions?: string;
  severity: string;
  score: number;
  publishedDate: string;
  lastModifiedDate: string;
  references: string[];
}
