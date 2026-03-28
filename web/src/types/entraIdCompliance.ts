import { ComplianceStatus, ComplianceCategory, EvidenceItem } from './compliance';

export interface EntraIdComplianceCheck {
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
  requiresLicense?: 'P1' | 'P2' | 'E3' | 'E5';
  licenseError?: boolean;
}

export interface EntraIdComplianceReport {
  overallScore: number;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  pending: number;
  categories: ComplianceCategory[];
  generatedAt: Date;
  tenantInfo: {
    tenantId: string;
    displayName: string;
    domain: string;
  };
  licensingNotes?: string[];
}

export interface SecurityDefaultsStatus {
  isEnabled: boolean;
}

export interface ConditionalAccessPolicy {
  id: string;
  displayName: string;
  state: 'enabled' | 'disabled' | 'enabledForReportingButNotEnforced';
  conditions: {
    clientAppTypes?: string[];
    applications?: {
      includeApplications?: string[];
      excludeApplications?: string[];
    };
    users?: {
      includeUsers?: string[];
      excludeUsers?: string[];
      includeRoles?: string[];
    };
    locations?: {
      includeLocations?: string[];
      excludeLocations?: string[];
    };
    signInRiskLevels?: string[];
    userRiskLevels?: string[];
  };
  grantControls?: {
    operator: 'AND' | 'OR';
    builtInControls: string[];
  };
  sessionControls?: Record<string, unknown>;
}

export interface AuthenticationMethodPolicy {
  id: string;
  displayName: string;
  authenticationMethodConfigurations: AuthMethodConfiguration[];
}

export interface AuthMethodConfiguration {
  id: string;
  state: 'enabled' | 'disabled';
  '@odata.type': string;
}

export interface UserRegistrationDetails {
  id: string;
  userPrincipalName: string;
  userDisplayName: string;
  isMfaRegistered: boolean;
  isMfaCapable: boolean;
  isSsprRegistered: boolean;
  isSsprEnabled: boolean;
  isSsprCapable: boolean;
  isPasswordlessCapable: boolean;
  methodsRegistered: string[];
}

export interface DirectoryRole {
  id: string;
  displayName: string;
  description: string;
  roleTemplateId: string;
}

export interface DirectoryRoleMember {
  id: string;
  displayName: string;
  userPrincipalName: string;
}

export interface GlobalAdmin {
  id: string;
  displayName: string;
  userPrincipalName: string;
  isMfaRegistered?: boolean;
}
