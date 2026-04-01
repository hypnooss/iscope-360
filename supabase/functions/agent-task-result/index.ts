// Force redeploy: 2026-03-09T19:00:00Z — domain_whois extraction fix
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================
// Types
// ============================================

interface TaskResultRequest {
  task_id: string;
  status: 'completed' | 'failed' | 'timeout' | 'partial';
  result?: Record<string, unknown>;
  error_message?: string;
  execution_time_ms?: number;
  // Progressive mode fields (when agent sends step results separately)
  steps_completed?: number;
  steps_failed?: number;
}

interface TaskResultSuccessResponse {
  success: true;
  task_id: string;
  status: string;
  score?: number;
  has_more_tasks: boolean;
}

interface TaskResultErrorResponse {
  error: string;
  code: 'TOKEN_EXPIRED' | 'INVALID_SIGNATURE' | 'INVALID_TOKEN' | 'BLOCKED' | 'UNREGISTERED' | 'NOT_FOUND' | 'FORBIDDEN' | 'INTERNAL_ERROR';
}

interface ComplianceRule {
  id: string;
  code: string;
  name: string;
  category: string;
  severity: string;
  description: string | null;
  recommendation: string | null;
  pass_description: string | null;
  fail_description: string | null;
  weight: number;
  // Note: External Domain rules use a different shape: { step_id, field, operator, value/values/pattern }
  evaluation_logic: Record<string, unknown>;
  // New metadata fields
  technical_risk: string | null;
  business_impact: string | null;
  api_endpoint: string | null;
}

type NormalizedEvaluationLogic = {
  source_key: string;
  field_path: string;
  alt_source_key?: string;
  alt_field_path?: string;
  conditions: Array<{
    operator: string;
    value?: unknown;
    result: 'pass' | 'fail' | 'warn' | 'unknown';
  }>;
  default_result: 'pass' | 'fail' | 'warn' | 'unknown';
  pass_message?: string;
  fail_message?: string;
};

interface EvidenceItem {
  label: string;
  value: string;
  type: 'text' | 'code';
}

interface ComplianceCheck {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
  details: string;
  recommendation?: string;
  weight: number;
  // Campos de evidência
  evidence?: EvidenceItem[];
  rawData?: Record<string, unknown>;
  apiEndpoint?: string;
  // New metadata fields for reports
  technicalRisk?: string;
  businessImpact?: string;
}

interface SubdomainEntry {
  subdomain: string;
  sources: string[];
  addresses: Array<{ ip: string; type?: string }>;
  is_alive?: boolean;
}

interface SubdomainSummary {
  total_found: number;
  subdomains: SubdomainEntry[];
  sources: string[];
  mode: string;
}

interface ComplianceResult {
  score: number;
  checks: ComplianceCheck[];
  categories: Record<string, ComplianceCheck[]>;
  system_info?: Record<string, unknown>;
  raw_data?: Record<string, unknown>;
  firmwareVersion?: string;
  dns_summary?: {
    ns?: string[];
    soa_mname?: string | null;
    soa_contact?: string | null;
    dnssec_has_dnskey?: boolean;
    dnssec_has_ds?: boolean;
    dnssec_validated?: boolean;
    dnssec_notes?: string[];
  };
  subdomain_summary?: SubdomainSummary;
}

// ============================================
// M365 Agent Insights Types and Processing
// ============================================

/**
 * M365 Risk Categories (aligned with m365Insights.ts)
 * Used for consistent categorization across report and product pages
 */
type M365RiskCategory = 
  | 'identities'           // Identidades
  | 'auth_access'          // Autenticação & Acesso
  | 'admin_privileges'     // Privilégios Administrativos  
  | 'apps_integrations'    // Aplicações & Integrações
  | 'email_exchange'       // Email & Exchange
  | 'threats_activity'     // Ameaças & Atividades Suspeitas
  | 'intune_devices'       // Intune & Dispositivos
  | 'pim_governance'       // PIM & Governança
  | 'sharepoint_onedrive'  // SharePoint & OneDrive
  | 'teams_collaboration'  // Teams & Colaboração
  | 'defender_security';   // Defender & DLP

/**
 * M365 Products (used for remediation guidance)
 */
type M365Product = 
  | 'entra_id' 
  | 'exchange_online' 
  | 'sharepoint' 
  | 'defender' 
  | 'intune';

interface M365AgentInsight {
  id: string;
  category: M365RiskCategory;
  product: M365Product;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'pass' | 'fail' | 'warn' | 'unknown';
  details?: string;
  recommendation?: string;
  affectedEntities?: Array<{ name: string; type: string; details?: string }>;
  rawData?: Record<string, unknown>;
  // Static rule metadata
  criteria?: string;
  passDescription?: string;
  failDescription?: string;
  notFoundDescription?: string;
  technicalRisk?: string;
  businessImpact?: string;
  apiEndpoint?: string;
}

/**
 * Maps risk categories to M365 products for remediation context
 */
function mapCategoryToProduct(category: string): M365Product {
  const categoryProductMap: Record<string, M365Product> = {
    'identities': 'entra_id',
    'auth_access': 'entra_id',
    'admin_privileges': 'entra_id',
    'apps_integrations': 'entra_id',
    'email_exchange': 'exchange_online',
    'threats_activity': 'exchange_online',
    'pim_governance': 'entra_id',
    'intune_devices': 'intune',
    'sharepoint_onedrive': 'sharepoint',
    'teams_collaboration': 'sharepoint',
    'defender_security': 'defender',
  };
  return categoryProductMap[category] || 'entra_id';
}

/**
 * Evaluate agent-collected data against a single compliance rule's evaluation_logic.
 * Supports: array_empty, all_match, none_match pass_when strategies.
 */
function evaluateAgentRule(
  rule: ComplianceRule,
  data: unknown
): { status: 'pass' | 'fail' | 'warn'; description: string; details?: string; affectedEntities?: Array<{ name: string; type: string; details?: string }>; rawData?: Record<string, unknown> } | null {
  const evalLogic = rule.evaluation_logic as Record<string, unknown>;
  const passWhen = evalLogic.pass_when as string;
  const conditions = evalLogic.conditions as Array<Record<string, unknown>> | undefined;

  // === Custom evaluator types (evaluate.type) ===
  const evaluate = evalLogic.evaluate as Record<string, unknown> | undefined;
  if (evaluate?.type === 'check_suspicious_inbox_rules') {
    return evaluateSuspiciousInboxRules(rule, data);
  }
  if (evaluate?.type === 'check_inbox_rules_in_error') {
    return evaluateInboxRulesInError(rule, data);
  }

  // === array_empty: pass when the data array is empty (no violations) ===
  if (passWhen === 'array_empty') {
    if (!Array.isArray(data)) {
      return {
        status: 'unknown',
        description: rule.pass_description || rule.description || rule.name,
        rawData: { note: 'Data is not an array' },
      } as any;
    }

    // For array_empty, the conditions may specify a filter field
    let violatingItems = data;
    if (conditions && conditions.length > 0) {
      const cond = conditions[0];
      const field = cond.field as string;
      // If field is 'data' it means the whole array; otherwise filter by field presence
      if (field && field !== 'data') {
        violatingItems = data.filter((item: Record<string, unknown>) => {
          const val = item[field];
          return val !== null && val !== undefined && val !== '' && val !== false;
        });
      }
    }

    const isEmpty = violatingItems.length === 0;
    return {
      status: isEmpty ? 'pass' : (violatingItems.length > 5 ? 'fail' : 'warn'),
      description: isEmpty
        ? (rule.pass_description || `${rule.name}: Nenhuma violação detectada`)
        : (rule.fail_description || `${violatingItems.length} violação(ões) detectada(s) em ${rule.name}`),
      details: !isEmpty
        ? `${violatingItems.length} item(ns) afetado(s) de ${data.length} total`
        : undefined,
      affectedEntities: !isEmpty
        ? violatingItems.slice(0, 20).map((item: Record<string, unknown>) => ({
            name: String(item.DisplayName || item.Name || item.Identity || item.PrimarySmtpAddress || 'N/A'),
            type: 'entity',
            details: Object.keys(item).slice(0, 3).map(k => `${k}: ${item[k]}`).join(', '),
          }))
        : undefined,
      rawData: { total: data.length, violatingCount: violatingItems.length },
    };
  }

  // === all_match / none_match: evaluate conditions against policy objects ===
  if (passWhen === 'all_match' || passWhen === 'none_match') {
    const items = Array.isArray(data) ? data : [data];
    if (!conditions || conditions.length === 0) return null;

    let matchCount = 0;
    const failingItems: Array<Record<string, unknown>> = [];

    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const obj = item as Record<string, unknown>;

      const conditionResults = conditions.map((cond) => {
        const field = cond.field as string;
        const operator = cond.operator as string;
        const expected = cond.value;
        const actual = obj[field];

        switch (operator) {
          case 'equals': return actual === expected;
          case 'not_equals': return actual !== expected;
          case 'gt': return typeof actual === 'number' && actual > (expected as number);
          case 'gte': return typeof actual === 'number' && actual >= (expected as number);
          case 'lt': return typeof actual === 'number' && actual < (expected as number);
          case 'includes': return typeof actual === 'string' && actual.includes(String(expected));
          default: return false;
        }
      });

      const allMatch = conditionResults.every(Boolean);

      if (passWhen === 'all_match') {
        if (allMatch) matchCount++;
        else failingItems.push(obj);
      } else {
        // none_match: pass when NO item matches all conditions
        if (allMatch) failingItems.push(obj);
        else matchCount++;
      }
    }

    const isPassing = passWhen === 'all_match'
      ? failingItems.length === 0
      : failingItems.length === 0;

    return {
      status: isPassing ? 'pass' : (failingItems.length > 3 ? 'fail' : 'warn'),
      description: isPassing
        ? (rule.pass_description || `${rule.name}: Conforme`)
        : (rule.fail_description || `${rule.name}: ${failingItems.length} item(ns) não conforme(s)`),
      details: !isPassing
        ? `${failingItems.length} de ${items.length} item(ns) não conforme(s)`
        : `${items.length} item(ns) verificado(s) - todos conformes`,
      affectedEntities: failingItems.slice(0, 20).map((item) => ({
        name: String(item.Name || item.Identity || item.DisplayName || item.Domain || 'N/A'),
        type: 'policy',
        details: conditions.map(c => `${c.field}: ${item[c.field as string]}`).join(', '),
      })),
      rawData: { total: items.length, passing: matchCount, failing: failingItems.length },
    };
  }

  console.warn(`[evaluateAgentRule] Unknown pass_when: ${passWhen} for rule ${rule.code}`);
  return null;
}

/**
 * Evaluate EXO-022: Check for suspicious inbox rules (forward/redirect)
 */
function evaluateSuspiciousInboxRules(
  rule: ComplianceRule,
  data: unknown
): { status: 'pass' | 'fail' | 'warn'; description: string; details?: string; affectedEntities?: Array<{ name: string; type: string; details?: string }>; rawData?: Record<string, unknown> } {
  const items = Array.isArray(data) ? data : [];
  
  if (items.length === 0) {
    return {
      status: 'pass',
      description: rule.pass_description || 'Nenhuma regra de inbox encontrada',
      rawData: { total: 0, suspicious: 0 },
    };
  }

  // Filter for suspicious rules: enabled rules with ForwardTo, ForwardAsAttachmentTo, or RedirectTo set
  const suspiciousRules = items.filter((item: Record<string, unknown>) => {
    if (!item.Enabled) return false;
    const forwardTo = item.ForwardTo;
    const forwardAsAttachment = item.ForwardAsAttachmentTo;
    const redirectTo = item.RedirectTo;
    return (forwardTo && forwardTo !== '' && forwardTo !== null) ||
           (forwardAsAttachment && forwardAsAttachment !== '' && forwardAsAttachment !== null) ||
           (redirectTo && redirectTo !== '' && redirectTo !== null);
  });

  const hasSuspicious = suspiciousRules.length > 0;
  return {
    status: hasSuspicious ? (suspiciousRules.length > 3 ? 'fail' : 'warn') : 'pass',
    description: hasSuspicious
      ? (rule.fail_description || `${suspiciousRules.length} regra(s) de encaminhamento suspeita(s) detectada(s)`)
      : (rule.pass_description || 'Nenhuma regra de encaminhamento suspeita encontrada'),
    details: hasSuspicious
      ? `${suspiciousRules.length} regra(s) com forward/redirect de ${items.length} total`
      : `${items.length} regra(s) de inbox verificadas - nenhuma com encaminhamento`,
    affectedEntities: suspiciousRules.slice(0, 20).map((item: Record<string, unknown>) => ({
      name: String(item.MailboxOwner || item.Name || 'N/A'),
      type: 'inbox_rule',
      details: [
        item.ForwardTo ? `ForwardTo: ${item.ForwardTo}` : null,
        item.ForwardAsAttachmentTo ? `ForwardAsAttachment: ${item.ForwardAsAttachmentTo}` : null,
        item.RedirectTo ? `RedirectTo: ${item.RedirectTo}` : null,
      ].filter(Boolean).join(', '),
    })),
    rawData: { total: items.length, suspicious: suspiciousRules.length },
  };
}

/**
 * Evaluate EXO-023: Check for inbox rules with InError=True (corrupted rules)
 */
function evaluateInboxRulesInError(
  rule: ComplianceRule,
  data: unknown
): { status: 'pass' | 'fail' | 'warn'; description: string; details?: string; affectedEntities?: Array<{ name: string; type: string; details?: string }>; rawData?: Record<string, unknown> } {
  const items = Array.isArray(data) ? data : [];
  
  if (items.length === 0) {
    return {
      status: 'pass',
      description: rule.pass_description || 'Nenhuma regra de inbox encontrada',
      rawData: { total: 0, inError: 0 },
    };
  }

  const errorRules = items.filter((item: Record<string, unknown>) => 
    item.InError === true || item.inError === true
  );

  const hasErrors = errorRules.length > 0;
  return {
    status: hasErrors ? 'fail' : 'pass',
    description: hasErrors
      ? (rule.fail_description || `${errorRules.length} regra(s) de inbox com erros detectada(s)`).replace('{count}', String(errorRules.length))
      : (rule.pass_description || 'Nenhuma regra de inbox com erros encontrada'),
    details: hasErrors
      ? `${errorRules.length} regra(s) com InError=True de ${items.length} total`
      : `${items.length} regra(s) de inbox verificadas - nenhuma com erros`,
    affectedEntities: errorRules.slice(0, 20).map((item: Record<string, unknown>) => ({
      name: String(item.MailboxOwner || item.Name || 'N/A'),
      type: 'inbox_rule',
      details: `Regra: ${item.Name || 'N/A'} (InError=True)`,
    })),
    rawData: { total: items.length, inError: errorRules.length },
  };
}

/**
 * Process raw PowerShell data from agent into structured M365 insights.
 * Data-driven: uses compliance_rules from the database instead of hardcoded logic.
 */
function processM365AgentInsights(rawData: Record<string, unknown>, rules: ComplianceRule[]): M365AgentInsight[] {
  const insights: M365AgentInsight[] = [];

  for (const rule of rules) {
    const evalLogic = rule.evaluation_logic as Record<string, unknown>;
    const sourceKey = evalLogic?.source_key as string | undefined;
    if (!sourceKey) continue;
    
    // Check if data is missing (step was not_applicable or failed)
    if (!rawData[sourceKey] || rawData[sourceKey] === null) {
      const stepStatus = rawData[`_step_status_${sourceKey}`] as string | undefined;
      if (stepStatus === 'not_applicable' || stepStatus === 'failed') {
        insights.push({
          id: rule.code,
          category: rule.category as M365RiskCategory,
          product: mapCategoryToProduct(rule.category),
          name: rule.name,
          description: (rule as any).not_found_description || rule.description || rule.name,
          severity: 'info',
          status: 'not_found' as any,
          details: stepStatus === 'not_applicable'
            ? 'Recurso não licenciado neste tenant'
            : 'Dados não coletados - verifique logs do agent',
          recommendation: undefined,
          criteria: rule.description || undefined,
          passDescription: rule.pass_description || undefined,
          failDescription: rule.fail_description || undefined,
          notFoundDescription: (rule as any).not_found_description || undefined,
          technicalRisk: rule.technical_risk || undefined,
          businessImpact: rule.business_impact || undefined,
          apiEndpoint: rule.api_endpoint || undefined,
        });
      }
      continue;
    }

    const data = extractStepData(rawData[sourceKey]);
    if (data === null || data === undefined) continue;

    const result = evaluateAgentRule(rule, data);
    if (!result) continue;

    insights.push({
      id: rule.code,
      category: rule.category as M365RiskCategory,
      product: mapCategoryToProduct(rule.category),
      name: rule.name,
      description: result.description,
      severity: result.status === 'pass' ? 'info' : (rule.severity as M365AgentInsight['severity']),
      status: result.status,
      details: result.details,
      recommendation: rule.recommendation || undefined,
      affectedEntities: result.affectedEntities,
      rawData: result.rawData,
      // Static rule metadata for frontend display
      criteria: rule.description || undefined,
      passDescription: rule.pass_description || undefined,
      failDescription: rule.fail_description || undefined,
      notFoundDescription: (rule as any).not_found_description || undefined,
      technicalRisk: rule.technical_risk || undefined,
      businessImpact: rule.business_impact || undefined,
      apiEndpoint: rule.api_endpoint || undefined,
    });
  }

  console.log(`[processM365AgentInsights] Generated ${insights.length} insights from ${rules.length} rules`);
  return insights;
}

/**
 * Extract data from various step result formats
 * Handles JSON strings from PowerShell outputs (ConvertTo-Json)
 */
function extractStepData(stepResult: unknown): unknown {
  if (!stepResult) return null;
  
  if (typeof stepResult === 'object') {
    const obj = stepResult as Record<string, unknown>;
    let extracted: unknown = null;
    
    // Common formats: { data: [...] }, { results: [...] }, or direct array/object
    if ('data' in obj && obj.data !== undefined) {
      extracted = obj.data;
    } else if ('results' in obj && obj.results !== undefined) {
      extracted = obj.results;
    } else if ('value' in obj && obj.value !== undefined) {
      extracted = obj.value;
    } else {
      extracted = stepResult;
    }
    
    // Parse JSON strings (PowerShell outputs JSON as string via ConvertTo-Json)
    if (typeof extracted === 'string') {
      try {
        const parsed = JSON.parse(extracted);
        return parsed;
      } catch {
        // Not valid JSON, return as-is
        return extracted;
      }
    }
    
    return extracted;
  }
  
  // Handle top-level string (might be JSON)
  if (typeof stepResult === 'string') {
    try {
      return JSON.parse(stepResult);
    } catch {
      return stepResult;
    }
  }
  
  return stepResult;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Extracts clean version number from a version string
 * Examples: "v7.2.5 build1234" -> "7.2.5", "FortiOS-7.2.5" -> "7.2.5", "SonicOS 7.3.0-7012" -> "7.3.0"
 */
function extractFirmwareVersion(versionString: unknown): string {
  if (!versionString || typeof versionString !== 'string') return '';
  // Match version pattern like 7.2.5 or 7.2 or 7.3.0-7012
  const match = versionString.match(/(\d+\.\d+\.?\d*)/);
  return match ? match[1] : '';
}

/**
 * Parse SonicWall uptime string to human readable format
 * Example: "10 Days, 5 Hours, 58 Minutes, 33 Seconds" -> "10d 5h 58m"
 */
function parseUptimeString(uptimeStr: string): string {
  const days = uptimeStr.match(/(\d+)\s*Days?/i);
  const hours = uptimeStr.match(/(\d+)\s*Hours?/i);
  const minutes = uptimeStr.match(/(\d+)\s*Minutes?/i);
  
  const parts: string[] = [];
  if (days && parseInt(days[1]) > 0) parts.push(`${days[1]}d`);
  if (hours && parseInt(hours[1]) > 0) parts.push(`${hours[1]}h`);
  if (minutes && parseInt(minutes[1]) > 0) parts.push(`${minutes[1]}m`);
  
  return parts.length > 0 ? parts.join(' ') : '0m';
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  // Support paths like data.found[0].key_size_bits
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  const keys = normalizedPath.split('.').filter(Boolean);
  let current: unknown = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  
  return current;
}

/**
 * External Domain step payload normalizer.
 * Agents may store step results in different shapes; this helper returns a consistent object:
 * { step_id, data, ...rest }
 */
function getStepPayload(rawData: Record<string, unknown>, stepId: string): Record<string, unknown> | undefined {
  if (!stepId) return undefined;

  const direct = rawData[stepId];
  if (direct && typeof direct === 'object') {
    const obj = direct as Record<string, unknown>;
    // If it already looks like { data: {...} }
    if ('data' in obj && (obj as any).data && typeof (obj as any).data === 'object') {
      return { step_id: stepId, ...obj };
    }
    // If it looks like the inner payload { records: [...] }
    return { step_id: stepId, data: obj };
  }

  // Common alternative format: rawData.steps = [{ step_id, data }]
  const steps = rawData.steps;
  if (Array.isArray(steps)) {
    const found = steps.find((s) => s && typeof s === 'object' && (s as any).step_id === stepId);
    if (found && typeof found === 'object') {
      const f = found as Record<string, unknown>;
      const data = (f as any).data;
      if (data && typeof data === 'object') return { step_id: stepId, ...f };
      return { step_id: stepId, data: f };
    }
  }

  // Alternative: rawData.results = [{ step_id, data }]
  const results = rawData.results;
  if (Array.isArray(results)) {
    const found = results.find((s) => s && typeof s === 'object' && (s as any).step_id === stepId);
    if (found && typeof found === 'object') {
      const f = found as Record<string, unknown>;
      const data = (f as any).data;
      if (data && typeof data === 'object') return { step_id: stepId, ...f };
      return { step_id: stepId, data: f };
    }
  }

  return undefined;
}

function normalizeEvaluationLogic(rawLogic: Record<string, unknown>): NormalizedEvaluationLogic {
  // Firewall-style format
  if (typeof rawLogic?.source_key === 'string' && typeof rawLogic?.field_path === 'string') {
    return {
      source_key: rawLogic.source_key as string,
      field_path: rawLogic.field_path as string,
      alt_source_key: (typeof rawLogic.alt_source_key === 'string' ? rawLogic.alt_source_key : undefined),
      alt_field_path: (typeof rawLogic.alt_field_path === 'string' ? rawLogic.alt_field_path : undefined),
      conditions: (rawLogic.conditions as NormalizedEvaluationLogic['conditions']) || [],
      default_result: ((rawLogic.default_result as NormalizedEvaluationLogic['default_result']) || 'unknown'),
      pass_message: (typeof rawLogic.pass_message === 'string' ? rawLogic.pass_message : undefined),
      fail_message: (typeof rawLogic.fail_message === 'string' ? rawLogic.fail_message : undefined),
    };
  }

  // Typed evaluation logic: array_check, object_check, threshold_check
  const logicType = rawLogic?.type as string | undefined;
  if (logicType === 'array_check' || logicType === 'object_check' || logicType === 'threshold_check' || logicType === 'filtered_count_check') {
    return {
      source_key: (rawLogic.source_key as string) || '',
      field_path: (rawLogic.path as string) || (rawLogic.field as string) || '',
      conditions: [],
      default_result: 'unknown',
    };
  }

  // External Domain format: { step_id, field, operator, value/values/pattern }
  const stepId = typeof rawLogic.step_id === 'string' ? (rawLogic.step_id as string) : '';
  const field = typeof rawLogic.field === 'string' ? (rawLogic.field as string) : '';
  const operator = typeof rawLogic.operator === 'string' ? (rawLogic.operator as string) : undefined;

  const operatorValue =
    rawLogic.pattern ??
    rawLogic.values ??
    rawLogic.value ??
    (rawLogic.min !== undefined || rawLogic.max !== undefined
      ? { min: rawLogic.min, max: rawLogic.max }
      : undefined);

  return {
    source_key: stepId,
    field_path: field,
    conditions: operator
      ? [{ operator, value: operatorValue, result: 'pass' }]
      : [],
    // Default to fail when rule cannot be satisfied
    default_result: 'fail',
  };
}

// ============================================
// Generic typed evaluation logic (data-driven from DB)
// ============================================

interface TypedLogicResult {
  status: 'pass' | 'fail' | 'not_found' | 'unknown';
  evidence: Array<{ field: string; value: string; status: string }>;
  details?: string;
}

function getNestedPath(obj: unknown, path: string): unknown {
  if (!path || !obj || typeof obj !== 'object') return obj;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateTypedLogic(
  rawLogic: Record<string, unknown>,
  sourceData: unknown,
  rule: ComplianceRule,
  allRawData?: Record<string, unknown>
): TypedLogicResult | null {
  const logicType = rawLogic.type as string;

  if (logicType === 'array_check') {
    return evaluateArrayCheck(rawLogic, sourceData, rule);
  } else if (logicType === 'object_check') {
    return evaluateObjectCheck(rawLogic, sourceData, rule);
  } else if (logicType === 'threshold_check') {
    return evaluateThresholdCheck(rawLogic, sourceData, rule);
  } else if (logicType === 'filtered_count_check') {
    return evaluateFilteredCountCheck(rawLogic, sourceData, rule, allRawData);
  }

  return null;
}

function evaluateArrayCheck(
  logic: Record<string, unknown>,
  sourceData: unknown,
  rule: ComplianceRule
): TypedLogicResult {
  const path = logic.path as string | undefined;
  const raw = path ? getNestedPath(sourceData, path) : sourceData;
  // Also try .results if raw is an object with results key
  let arr: Array<Record<string, unknown>>;
  if (Array.isArray(raw)) {
    arr = raw as Array<Record<string, unknown>>;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).results)) {
    arr = (raw as Record<string, unknown>).results as Array<Record<string, unknown>>;
  } else {
    arr = [];
  }

  if (arr.length === 0) {
    return {
      status: 'not_found',
      evidence: [],
      details: rule.not_found_description || 'Nenhum item encontrado',
    };
  }

  const condition = logic.condition as string; // none_match, all_match
  const field = logic.field as string;
  const value = logic.value;

  let matched: Array<Record<string, unknown>> = [];

  if (condition === 'none_match') {
    // Pass if NO item matches field === value
    matched = arr.filter(item => String(item[field] ?? '').toLowerCase() === String(value).toLowerCase());
    const status = matched.length === 0 ? 'pass' : 'fail';
    return {
      status,
      evidence: arr.map(item => ({
        field: String(item.name || item.p2name || item.source || field),
        value: String(item[field] ?? 'unknown'),
        status: String(item[field] ?? '').toLowerCase() === String(value).toLowerCase() ? 'fail' : 'pass',
      })),
      details: status === 'pass'
        ? (rule.pass_description || 'Todos os itens em conformidade')
        : (rule.fail_description || `${matched.length} item(ns) em não-conformidade`),
    };
  } else if (condition === 'all_match') {
    // Pass if ALL items match field === value
    matched = arr.filter(item => String(item[field] ?? '').toLowerCase() !== String(value).toLowerCase());
    const status = matched.length === 0 ? 'pass' : 'fail';
    return {
      status,
      evidence: arr.map(item => ({
        field: String(item.name || item.p2name || item.source || field),
        value: String(item[field] ?? 'unknown'),
        status: String(item[field] ?? '').toLowerCase() === String(value).toLowerCase() ? 'pass' : 'fail',
      })),
      details: status === 'pass'
        ? (rule.pass_description || 'Todos os itens em conformidade')
        : (rule.fail_description || `${matched.length} item(ns) não atendem ao critério`),
    };
  }

  // Check alt_condition if present
  const altCondition = logic.alt_condition as string | undefined;
  if (altCondition) {
    const altField = logic.alt_field as string;
    const altValue = logic.alt_value;
    if (altCondition === 'none_match') {
      matched = arr.filter(item => String(item[altField] ?? '').toLowerCase() === String(altValue).toLowerCase());
      const status = matched.length === 0 ? 'pass' : 'fail';
      return {
        status,
        evidence: arr.map(item => ({
          field: String(item.name || item.source || altField),
          value: String(item[altField] ?? 'unknown'),
          status: String(item[altField] ?? '').toLowerCase() === String(altValue).toLowerCase() ? 'fail' : 'pass',
        })),
        details: status === 'pass'
          ? (rule.pass_description || 'Verificação aprovada')
          : (rule.fail_description || `${matched.length} item(ns) em não-conformidade`),
      };
    }
  }

  return { status: 'unknown', evidence: [], details: 'Condição não reconhecida' };
}

function evaluateObjectCheck(
  logic: Record<string, unknown>,
  sourceData: unknown,
  rule: ComplianceRule
): TypedLogicResult {
  const path = logic.path as string | undefined;
  const obj = path ? getNestedPath(sourceData, path) : sourceData;

  if (!obj || typeof obj !== 'object') {
    return { status: 'unknown', evidence: [], details: 'Dados não disponíveis' };
  }

  const condition = logic.condition as string;
  const field = logic.field as string;
  const expectedValue = logic.expected_value;

  if (condition === 'field_exists') {
    const actualValue = (obj as Record<string, unknown>)[field];
    const exists = actualValue !== undefined && actualValue !== null;
    let pass = exists;
    if (expectedValue !== undefined && exists) {
      pass = String(actualValue).toLowerCase() === String(expectedValue).toLowerCase();
    }
    return {
      status: pass ? 'pass' : 'fail',
      evidence: [{
        field: field,
        value: String(actualValue ?? 'N/A'),
        status: pass ? 'pass' : 'fail',
      }],
      details: pass
        ? (rule.pass_description || `Campo ${field} encontrado`)
        : (rule.fail_description || `Campo ${field} não encontrado ou valor incorreto`),
    };
  }

  return { status: 'unknown', evidence: [], details: 'Condição não reconhecida' };
}

// ---- filtered_count_check ----
// Filters an array with pre_filters, then finds violating items via match_conditions.
// Pass if zero violations, fail otherwise. Generates evidence per violation.
function evaluateFilteredCountCheck(
  logic: Record<string, unknown>,
  sourceData: unknown,
  rule: ComplianceRule,
  allRawData?: Record<string, unknown>
): TypedLogicResult {
  const path = logic.path as string | undefined;
  let raw = path ? getNestedPath(sourceData, path) : sourceData;

  // Fallback: if raw is an object with .results, use that
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'results' in (raw as Record<string, unknown>)) {
    raw = (raw as Record<string, unknown>).results;
  }

  if (!Array.isArray(raw)) {
    return {
      status: 'not_found',
      evidence: [{ field: rule.code, value: 'Dados não encontrados', status: 'not_found' }],
      details: rule.pass_description || 'Dados não disponíveis para avaliação',
    };
  }

  // ---- join_source: merge fields from a secondary data source ----
  const joinSource = logic.join_source as { key: string; on: string; fields: string[] } | undefined;
  let items = raw as Array<Record<string, unknown>>;
  if (joinSource && allRawData) {
    let secondaryRaw = allRawData[joinSource.key] as unknown;
    if (secondaryRaw && typeof secondaryRaw === 'object' && !Array.isArray(secondaryRaw) && 'results' in (secondaryRaw as Record<string, unknown>)) {
      secondaryRaw = (secondaryRaw as Record<string, unknown>).results;
    }
    if (Array.isArray(secondaryRaw)) {
      const index = new Map<string, Record<string, unknown>>();
      for (const item of secondaryRaw as Array<Record<string, unknown>>) {
        const key = String(item[joinSource.on] ?? '');
        if (key) index.set(key, item);
      }
      items = items.map((item) => {
        const key = String(item[joinSource.on] ?? '');
        const match = index.get(key);
        if (!match) return item;
        const merged = { ...item };
        for (const field of joinSource.fields) {
          if (merged[field] === undefined && match[field] !== undefined) {
            merged[field] = match[field];
          }
        }
        return merged;
      });
      console.log(`[join_source] Merged ${joinSource.fields.join(',')} from ${joinSource.key} (${index.size} entries) into ${items.length} primary items`);
    }
  }

  const preFilters = (logic.pre_filters || []) as Array<{ field: string; op: string; value: unknown }>;
  const matchConditions = (logic.match_conditions || []) as Array<{ field: string; op: string; value: unknown; join?: string }>;
  const evidenceLabelTpl = (logic.evidence_label || '{name}') as string;
  const evidenceValueTpl = (logic.evidence_value || '') as string;

  // Apply pre_filters sequentially to narrow the array
  let filtered = items;
  for (const pf of preFilters) {
    filtered = filtered.filter((item) => {
      const fieldVal = item[pf.field];
      switch (pf.op) {
        case 'equals': return fieldVal === pf.value;
        case 'not_equals': return fieldVal !== pf.value;
        case 'in': return Array.isArray(pf.value) && pf.value.includes(fieldVal);
        case 'not_in': return Array.isArray(pf.value) && !pf.value.includes(fieldVal);
        case 'exists': return fieldVal !== undefined && fieldVal !== null;
        case 'not_exists': return fieldVal === undefined || fieldVal === null;
        case 'gt': return typeof fieldVal === 'number' && fieldVal > (pf.value as number);
        case 'gte': return typeof fieldVal === 'number' && fieldVal >= (pf.value as number);
        case 'lt': return typeof fieldVal === 'number' && fieldVal < (pf.value as number);
        case 'lte': return typeof fieldVal === 'number' && fieldVal <= (pf.value as number);
        default: return true;
      }
    });
  }

  // Apply match_conditions to find violating items
  // Default join is AND; if any condition has join:"or", use OR logic
  const hasOrJoin = matchConditions.some(mc => mc.join === 'or');

  const matchesCondition = (item: Record<string, unknown>, mc: { field: string; op: string; value: unknown }): boolean => {
    const fieldVal = item[mc.field];
    const numVal = typeof fieldVal === 'number' ? fieldVal : (typeof fieldVal === 'string' ? parseFloat(fieldVal) : NaN);
    switch (mc.op) {
      case 'equals': return fieldVal === mc.value;
      case 'not_equals': return fieldVal !== mc.value;
      case 'lte': return !isNaN(numVal) && numVal <= (mc.value as number);
      case 'gte': return !isNaN(numVal) && numVal >= (mc.value as number);
      case 'lt': return !isNaN(numVal) && numVal < (mc.value as number);
      case 'gt': return !isNaN(numVal) && numVal > (mc.value as number);
      case 'eq': return !isNaN(numVal) && numVal === (mc.value as number);
      default: return false;
    }
  };

  const violating = filtered.filter((item) => {
    if (hasOrJoin) {
      // OR: any condition matching = violating
      return matchConditions.some(mc => matchesCondition(item, mc));
    } else {
      // AND: all conditions must match
      return matchConditions.every(mc => matchesCondition(item, mc));
    }
  });

  // Template interpolation helper
  const interpolate = (tpl: string, item: Record<string, unknown>): string => {
    return tpl.replace(/\{(\w+)\}/g, (_, key) => {
      const val = item[key];
      if (val === undefined || val === null) return '';
      if (Array.isArray(val)) {
        return val.map(v => (v && typeof v === 'object' && 'name' in v) ? (v as Record<string, unknown>).name : String(v)).join(', ');
      }
      if (typeof val === 'object' && 'name' in (val as Record<string, unknown>)) {
        return String((val as Record<string, unknown>).name);
      }
      return String(val);
    });
  };

  const evidence = violating.slice(0, 50).map((item) => ({
    field: interpolate(evidenceLabelTpl, item),
    value: interpolate(evidenceValueTpl, item),
    status: 'fail',
  }));

  if (violating.length === 0) {
    return {
      status: 'pass',
      evidence: [{ field: rule.code, value: `Nenhuma violação encontrada em ${filtered.length} itens analisados`, status: 'pass' }],
      details: rule.pass_description || `Nenhuma violação encontrada (${filtered.length} itens verificados)`,
    };
  }

  return {
    status: 'fail',
    evidence,
    details: rule.fail_description
      ? rule.fail_description.replace('{count}', String(violating.length))
      : `${violating.length} violação(ões) encontrada(s) em ${filtered.length} itens analisados`,
  };
}

function evaluateThresholdCheck(
  logic: Record<string, unknown>,
  sourceData: unknown,
  rule: ComplianceRule
): TypedLogicResult {
  const path = logic.path as string | undefined;
  const obj = path ? getNestedPath(sourceData, path) : sourceData;

  if (!obj || typeof obj !== 'object') {
    return { status: 'unknown', evidence: [], details: 'Dados não disponíveis' };
  }

  const checks = logic.checks as Array<Record<string, unknown>> | undefined;
  if (!checks || !Array.isArray(checks)) {
    return { status: 'unknown', evidence: [], details: 'Nenhuma verificação definida' };
  }

  const evidence: Array<{ field: string; value: string; status: string }> = [];
  let allPass = true;

  for (const check of checks) {
    const field = check.field as string;
    // Support alternate field names (e.g., cpu_usage vs cpu)
    const altFields = field.split('|').map(f => f.trim());
    let actualValue: unknown = undefined;
    let usedField = field;
    for (const f of altFields) {
      const v = (obj as Record<string, unknown>)[f];
      if (v !== undefined) {
        actualValue = v;
        usedField = f;
        break;
      }
    }
    // Handle object values: if it has an "idle" property, compute usage = 100 - idle
    let numVal: number;
    if (actualValue !== null && typeof actualValue === 'object' && !Array.isArray(actualValue)) {
      const obj2 = actualValue as Record<string, unknown>;
      if (typeof obj2.idle === 'number') {
        // CPU-style: usage = 100 - idle
        numVal = Math.round((100 - obj2.idle) * 100) / 100;
      } else if (typeof obj2.used === 'number' && typeof obj2.total === 'number' && obj2.total > 0) {
        // Memory-style: usage % = used / total * 100
        numVal = Math.round((obj2.used / obj2.total) * 10000) / 100;
      } else if (typeof obj2.used === 'number') {
        numVal = obj2.used;
      } else {
        numVal = Number(actualValue ?? 0);
      }
    } else {
      numVal = Number(actualValue ?? 0);
    }

    const threshold = Number(check.value ?? 0);
    const operator = check.operator as string;
    const label = (check.label as string) || usedField;

    let pass = false;
    if (operator === 'lt') pass = numVal < threshold;
    else if (operator === 'lte') pass = numVal <= threshold;
    else if (operator === 'gt') pass = numVal > threshold;
    else if (operator === 'gte') pass = numVal >= threshold;
    else if (operator === 'eq') pass = numVal === threshold;

    if (!pass) allPass = false;
    evidence.push({
      field: label,
      value: `${numVal}%`,
      status: pass ? 'pass' : 'fail',
    });
  }

  return {
    status: allPass ? 'pass' : 'fail',
    evidence,
    details: allPass
      ? (rule.pass_description || 'Todos os limites dentro do aceitável')
      : (rule.fail_description || 'Um ou mais limites excedidos'),
  };
}

function evaluateCondition(
  value: unknown,
  condition: { operator: string; value?: unknown; result: string }
): string | null {
  const { operator, value: condValue, result } = condition;
  
  switch (operator) {
    // ===== External Domain operators =====
    case 'not_null':
      if (value !== null && value !== undefined && value !== '') return result;
      break;
    case 'eq':
      if (value === condValue) return result;
      break;
    case 'gte':
      if (typeof value === 'number' && typeof condValue === 'number' && value >= condValue) return result;
      break;
    case 'in':
      if (Array.isArray(condValue)) {
        if (condValue.some(v => v === value)) return result;
        if ((value === null || value === undefined) && (condValue.includes(null) || condValue.includes(undefined))) return result;
      }
      break;
    case 'array_length_gte':
      if (Array.isArray(value) && typeof condValue === 'number' && value.length >= condValue) return result;
      break;
    case 'array_length_lte':
      if (Array.isArray(value) && typeof condValue === 'number' && value.length <= condValue) return result;
      break;
    case 'between':
      if (typeof value === 'number' && condValue && typeof condValue === 'object') {
        const min = (condValue as Record<string, unknown>).min;
        const max = (condValue as Record<string, unknown>).max;
        if (typeof min === 'number' && typeof max === 'number' && value >= min && value <= max) return result;
      }
      break;
    case 'has_distinct_priorities':
      if (Array.isArray(value)) {
        const priorities = value
          .map(v => (v && typeof v === 'object') ? (v as Record<string, unknown>).priority : undefined)
          .filter(p => typeof p === 'number') as number[];
        const unique = new Set(priorities);
        if (unique.size >= 2) return result;
      }
      break;
    case 'not_matches':
      if (typeof value === 'string' && typeof condValue === 'string') {
        const regex = new RegExp(condValue);
        if (!regex.test(value)) return result;
      }
      break;

    case 'equals':
      if (value === condValue) return result;
      break;
    case 'not_equals':
      if (value !== condValue) return result;
      break;
    case 'contains':
      if (typeof value === 'string' && typeof condValue === 'string' && value.includes(condValue)) return result;
      break;
    case 'not_empty':
      if (value !== null && value !== undefined && value !== '') return result;
      break;
    case 'empty':
      if (value === null || value === undefined || value === '') return result;
      break;
    case 'greater_than':
      if (typeof value === 'number' && typeof condValue === 'number' && value > condValue) return result;
      break;
    case 'less_than':
      if (typeof value === 'number' && typeof condValue === 'number' && value < condValue) return result;
      break;
    case 'greater_than_or_equal':
      if (typeof value === 'number' && typeof condValue === 'number' && value >= condValue) return result;
      break;
    case 'less_than_or_equal':
      if (typeof value === 'number' && typeof condValue === 'number' && value <= condValue) return result;
      break;
    case 'regex':
      if (typeof value === 'string' && typeof condValue === 'string') {
        const regex = new RegExp(condValue);
        if (regex.test(value)) return result;
      }
      break;
  }
  
  return null;
}

// Cache para mapeamentos de source_key -> endpoint carregados do banco
// Será populado dinamicamente no processamento de cada task
let sourceKeyEndpointCache: Map<string, Record<string, string>> = new Map();

// Fallback para quando não há dados no banco (compatibilidade)
const defaultSourceKeyToEndpoint: Record<string, string> = {
  'default': 'API do dispositivo'
};

/**
 * Carrega mapeamentos de source_key para endpoint do banco de dados
 * Retorna um objeto { source_key: endpoint_label } para o device_type especificado
 */
async function loadSourceKeyEndpoints(
  supabase: ReturnType<typeof createClient>,
  deviceTypeId: string
): Promise<Record<string, string>> {
  // Check cache first
  if (sourceKeyEndpointCache.has(deviceTypeId)) {
    return sourceKeyEndpointCache.get(deviceTypeId)!;
  }

  try {
    const { data, error } = await supabase
      .from('source_key_endpoints')
      .select('source_key, endpoint_label, endpoint_url')
      .eq('device_type_id', deviceTypeId)
      .eq('is_active', true);

    if (error) {
      console.error('Failed to load source key endpoints:', error);
      return defaultSourceKeyToEndpoint;
    }

    const mapping: Record<string, string> = { ...defaultSourceKeyToEndpoint };
    for (const row of data || []) {
      // Prefer endpoint_url if available, otherwise use endpoint_label
      mapping[row.source_key] = row.endpoint_url || row.endpoint_label;
    }

    // Cache for subsequent calls
    sourceKeyEndpointCache.set(deviceTypeId, mapping);
    console.log(`Loaded ${data?.length || 0} source key endpoints for device type ${deviceTypeId}`);

    return mapping;
  } catch (e) {
    console.error('Error loading source key endpoints:', e);
    return defaultSourceKeyToEndpoint;
  }
}

/**
 * Obtém o endpoint para um source_key específico
 * Usa o cache carregado ou fallback para o padrão
 */
function getEndpointForSourceKey(
  sourceKeyToEndpoint: Record<string, string>,
  sourceKey: string
): string {
  return sourceKeyToEndpoint[sourceKey] || sourceKeyToEndpoint['default'] || 'API do dispositivo';
}

// ============================================
// Evidence Formatters (ported from fortigate-compliance)
// ============================================

/**
 * Format FortiCare support evidence (lic-001)
 * Returns evidence AND calculated status for proper icon display
 */
function formatFortiCareEvidence(rawData: Record<string, unknown>): { evidence: EvidenceItem[], status: 'pass' | 'fail' | 'warn' | 'unknown' } {
  const evidence: EvidenceItem[] = [];
  
  try {
    const licenseData = rawData['license_status'] as Record<string, unknown> | undefined;
    if (!licenseData) {
      return { 
        evidence: [{ label: 'Status', value: 'Dados não disponíveis', type: 'text' }],
        status: 'unknown'
      };
    }
    
    // Extract forticare info from multiple possible paths
    const results = licenseData.results as Record<string, unknown> | undefined;
    const forticareInfo = (results?.forticare as Record<string, unknown>) || 
                          (licenseData.forticare as Record<string, unknown>) || {};
    
    // Check support status
    const support = forticareInfo.support as Record<string, unknown> | undefined;
    const supportStatus = support?.status || forticareInfo.status || 'unknown';
    const isActive = ['licensed', 'registered', 'valid', 'active'].includes(String(supportStatus).toLowerCase());
    
    // Get expiry date
    const expiresRaw = support?.expires || forticareInfo.expires || 
                       support?.expiry_date || forticareInfo.expiry_date || 0;
    
    let daysRemaining = 0;
    let hasValidExpiry = false;
    
    if (expiresRaw) {
      let expiryDate: Date;
      if (typeof expiresRaw === 'string') {
        expiryDate = new Date(expiresRaw);
      } else {
        expiryDate = new Date(Number(expiresRaw) * 1000);
      }
      
      if (!isNaN(expiryDate.getTime())) {
        hasValidExpiry = true;
        const expiryDateStr = expiryDate.toLocaleDateString('pt-BR');
        daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        evidence.push({
          label: 'Data de Expiração',
          value: expiryDateStr,
          type: 'text'
        });
        
        evidence.push({
          label: 'Dias Restantes',
          value: daysRemaining > 0 ? String(daysRemaining) : 'Expirado',
          type: 'text'
        });
      }
    }
    
    // Determine status based on expiry and active status
    // FortiCare is valid if: status is active AND (no expiry OR expiry > 0 days)
    const isValid = isActive && (!hasValidExpiry || daysRemaining > 0);
    const isExpiringSoon = isValid && hasValidExpiry && daysRemaining > 0 && daysRemaining <= 30;
    
    let status: 'pass' | 'fail' | 'warn' | 'unknown' = 'unknown';
    if (isExpiringSoon) {
      status = 'warn';
      evidence.unshift({
        label: 'Status',
        value: `⚠️ Expira em ${daysRemaining} dias`,
        type: 'text'
      });
    } else if (isValid) {
      status = 'pass';
      evidence.unshift({
        label: 'Status',
        value: '✅ Ativo',
        type: 'text'
      });
    } else {
      status = 'fail';
      evidence.unshift({
        label: 'Status',
        value: '❌ Expirado/Inativo',
        type: 'text'
      });
    }
    
    return { evidence, status };
  } catch (e) {
    console.error('Error formatting FortiCare evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      status: 'unknown'
    };
  }
}

/**
 * Format FortiGuard licenses evidence (lic-002)
 * Returns evidence AND calculated status based on all security services
 */
function formatFortiGuardEvidence(rawData: Record<string, unknown>): { evidence: EvidenceItem[], status: 'pass' | 'fail' | 'warn' | 'unknown' } {
  const evidence: EvidenceItem[] = [];
  let allActive = true;
  let anyExpiringSoon = false;
  let anyExpiredOrInactive = false;
  let foundAnyService = false;
  
  try {
    const licenseData = rawData['license_status'] as Record<string, unknown> | undefined;
    if (!licenseData) {
      return { 
        evidence: [{ label: 'Status', value: 'Dados não disponíveis', type: 'text' }],
        status: 'unknown'
      };
    }
    
    const results = licenseData.results as Record<string, unknown> | undefined;
    const licenses = results || licenseData;
    
    // Service mappings with alternative keys
    const securityServicesMap = [
      { key: 'antivirus', altKeys: ['av', 'fortigate_av', 'fgt_av'], name: 'Antivírus' },
      { key: 'ips', altKeys: ['nids', 'fortigate_ips', 'fgt_ips'], name: 'IPS' },
      { key: 'web_filtering', altKeys: ['webfilter', 'fgd_wf', 'webfiltering', 'fortiguard_webfilter', 'fgt_wf'], name: 'Web Filter' },
      { key: 'appctrl', altKeys: ['app_ctrl', 'application_control', 'fortigate_appctrl'], name: 'App Control' },
      { key: 'antispam', altKeys: ['anti_spam', 'fortigate_antispam', 'fgt_antispam'], name: 'AntiSpam' },
    ];
    
    for (const serviceMapping of securityServicesMap) {
      let serviceInfo = licenses[serviceMapping.key] as Record<string, unknown> | undefined;
      
      // Try alternative keys
      if (!serviceInfo || (typeof serviceInfo === 'object' && Object.keys(serviceInfo).length === 0)) {
        for (const altKey of serviceMapping.altKeys) {
          const altInfo = licenses[altKey] as Record<string, unknown> | undefined;
          if (altInfo && (typeof altInfo !== 'object' || Object.keys(altInfo).length > 0)) {
            serviceInfo = altInfo;
            break;
          }
        }
      }
      
      serviceInfo = serviceInfo || {};
      
      // Get status and expiry
      const serviceStatus = serviceInfo.status || serviceInfo.entitlement || serviceInfo.license_status || 'unknown';
      const expiry = serviceInfo.expires || serviceInfo.expiry_date || serviceInfo.expire_time || serviceInfo.expiration || 0;
      
      let isActive = false;
      let expiryDateStr = '';
      let daysRemaining = 0;
      
      if (expiry) {
        let expiryDate: Date;
        if (typeof expiry === 'string') {
          expiryDate = new Date(expiry);
        } else {
          expiryDate = new Date(Number(expiry) * 1000);
        }
        
        if (!isNaN(expiryDate.getTime())) {
          foundAnyService = true;
          expiryDateStr = expiryDate.toLocaleDateString('pt-BR');
          daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          isActive = daysRemaining > 0;
        }
      }
      
      // Check status if date check failed
      if (!isActive && !expiry) {
        const activeStatuses = ['licensed', 'valid', 'active', 'enabled', 'enable', 'registered', '1'];
        isActive = activeStatuses.includes(String(serviceStatus).toLowerCase());
        if (isActive) foundAnyService = true;
      }
      
      // Track overall status
      if (!isActive) {
        anyExpiredOrInactive = true;
        allActive = false;
      } else if (daysRemaining > 0 && daysRemaining <= 30) {
        anyExpiringSoon = true;
      }
      
      // Format output
      let valueStr: string;
      if (isActive) {
        if (daysRemaining > 0 && daysRemaining <= 30) {
          valueStr = `⚠️ Expira em ${daysRemaining} dias`;
        } else {
          valueStr = expiryDateStr ? `✅ Ativo até ${expiryDateStr}` : '✅ Ativo';
        }
      } else {
        valueStr = '❌ Expirado/Inativo';
      }
      
      evidence.push({
        label: serviceMapping.name,
        value: valueStr,
        type: 'text'
      });
    }
    
    // Determine overall status
    let status: 'pass' | 'fail' | 'warn' | 'unknown' = 'unknown';
    if (!foundAnyService) {
      status = 'unknown';
    } else if (anyExpiredOrInactive) {
      status = 'fail';
    } else if (anyExpiringSoon) {
      status = 'warn';
    } else if (allActive) {
      status = 'pass';
    }
    
    return { evidence, status };
  } catch (e) {
    console.error('Error formatting FortiGuard evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      status: 'unknown'
    };
  }
}

/**
 * Format VPN evidence (vpn-* rules)
 */
function formatVPNEvidence(rawData: Record<string, unknown>, ruleCode: string): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];
  
  try {
    // IPsec VPN encryption check
    if (ruleCode === 'vpn-001') {
      // Buscar tanto vpn_ipsec_phase1 quanto vpn_ipsec (compatibilidade)
      const vpnData = (rawData['vpn_ipsec_phase1'] || rawData['vpn_ipsec']) as Record<string, unknown> | undefined;
      if (!vpnData) {
        return [{ label: 'VPN IPsec', value: 'Dados não disponíveis', type: 'text' }];
      }
      
      const results = (vpnData.results || []) as Array<Record<string, unknown>>;
      const weakAlgorithms = ['des', '3des', 'md5', 'sha1'];
      
      for (const vpn of results.slice(0, 10)) { // Limit to 10 VPNs
        const name = vpn.name as string || 'N/A';
        const proposal = vpn.proposal as string || 'N/A';
        const isWeak = weakAlgorithms.some(alg => proposal.toLowerCase().includes(alg));
        
        evidence.push({
          label: `VPN: ${name}`,
          value: isWeak ? `⚠️ ${proposal}` : `✅ ${proposal}`,
          type: 'code'
        });
      }
      
      if (results.length === 0) {
        evidence.push({ label: 'VPN IPsec', value: 'Nenhuma VPN configurada', type: 'text' });
      }
    }
    // SSL VPN certificate check
    else if (ruleCode === 'vpn-003') {
      const sslData = rawData['vpn_ssl_settings'] as Record<string, unknown> | undefined;
      if (!sslData) {
        return [{ label: 'SSL VPN', value: 'Não configurado', type: 'text' }];
      }
      
      const results = sslData.results as Record<string, unknown> || sslData;
      const servercert = results.servercert as string || 'Fortinet_Factory';
      const loginPort = results['login-port'] as number || 443;
      
      evidence.push({ label: 'Certificado', value: servercert, type: 'code' });
    }
    // Generic VPN rule
    else {
      const vpnData = rawData['vpn_ipsec'] as Record<string, unknown> | undefined;
      const sslData = rawData['vpn_ssl_settings'] as Record<string, unknown> | undefined;
      
      if (vpnData?.results) {
        const results = vpnData.results as Array<Record<string, unknown>>;
        evidence.push({ label: 'VPNs IPsec', value: String(results.length), type: 'text' });
      }
      if (sslData?.results) {
        const status = (sslData.results as Record<string, unknown>).status || 'disable';
        evidence.push({ label: 'SSL VPN', value: status === 'enable' ? '✅ Ativo' : '❌ Inativo', type: 'text' });
      }
    }
  } catch (e) {
    console.error('Error formatting VPN evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar dados', type: 'text' });
  }
  
  return evidence.length > 0 ? evidence : [{ label: 'VPN', value: 'Sem dados', type: 'text' }];
}

/**
 * Format Logging evidence (log-* rules)
 */
function formatLoggingEvidence(rawData: Record<string, unknown>, ruleCode: string): EvidenceItem[] {
  const evidence: EvidenceItem[] = [];
  
  try {
    if (ruleCode === 'log-001') {
      // General log settings - source_key is 'log_setting' (singular)
      const logData = rawData['log_setting'] as Record<string, unknown> | undefined;
      if (!logData) {
        return [{ label: 'Logging', value: 'Dados não disponíveis', type: 'text' }];
      }
      
      const results = logData.results as Record<string, unknown> || logData;
      const logInvalidPacket = results['log-invalid-packet'] as string || 'disable';
      const resolveIp = results['resolve-ip'] as string || 'disable';
      const localInAllow = results['local-in-allow'] as string || 'disable';
      const fwpolicyImplicitLog = results['fwpolicy-implicit-log'] as string || 'disable';
      
      // Mostrar status de logging com ícones
      const anyEnabled = logInvalidPacket === 'enable' || resolveIp === 'enable';
      
      evidence.push({
        label: 'Status',
        value: anyEnabled ? '✅ Logging habilitado' : '⚠️ Logging limitado',
        type: 'text'
      });
      evidence.push({
        label: 'Log de Pacotes Inválidos',
        value: logInvalidPacket === 'enable' ? '✅ Habilitado' : '❌ Desabilitado',
        type: 'text'
      });
      evidence.push({
        label: 'Resolver IP',
        value: resolveIp === 'enable' ? '✅ Habilitado' : '❌ Desabilitado',
        type: 'text'
      });
      evidence.push({
        label: 'Log Implícito de Políticas',
        value: fwpolicyImplicitLog === 'enable' ? '✅ Habilitado' : '❌ Desabilitado',
        type: 'text'
      });
    }
    else if (ruleCode === 'log-002') {
      // Log forwarding (FortiAnalyzer/FortiCloud)
      let fortiAnalyzerEnabled = false;
      let fortiAnalyzerServer = 'N/A';
      let fortiCloudEnabled = false;
      
      // Check FortiAnalyzer
      const fazData = rawData['log_fortianalyzer'] as Record<string, unknown> | undefined;
      if (fazData) {
        const results = fazData.results as Record<string, unknown> || fazData;
        fortiAnalyzerEnabled = results.status === 'enable';
        fortiAnalyzerServer = results.server as string || 'N/A';
      }
      
      // Check FortiCloud
      const cloudData = rawData['log_fortiguard'] as Record<string, unknown> | undefined;
      if (cloudData) {
        const results = cloudData.results as Record<string, unknown> || cloudData;
        fortiCloudEnabled = results.status === 'enable';
      }
      
      evidence.push({
        label: 'FortiAnalyzer',
        value: fortiAnalyzerEnabled ? `✅ ${fortiAnalyzerServer}` : '❌ Não configurado',
        type: 'text'
      });
      evidence.push({
        label: 'FortiCloud',
        value: fortiCloudEnabled ? '✅ Habilitado' : '❌ Não configurado',
        type: 'text'
      });
    }
    else {
      // Generic log rule
      const logData = rawData['log_settings'] as Record<string, unknown> | undefined;
      if (logData?.results) {
        const results = logData.results as Record<string, unknown>;
        for (const [key, val] of Object.entries(results).slice(0, 5)) {
          evidence.push({ label: key, value: String(val), type: 'text' });
        }
      }
    }
  } catch (e) {
    console.error('Error formatting Logging evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar dados', type: 'text' });
  }
  
  return evidence.length > 0 ? evidence : [{ label: 'Logging', value: 'Sem dados', type: 'text' }];
}

/**
 * Format HA (High Availability) evidence (ha-001)
 * Returns evidence AND calculated status
 * - standalone = fail (não há HA configurado)
 * - qualquer outro modo = pass (HA ativo)
 */
function formatHAEvidence(rawData: Record<string, unknown>): {
  evidence: EvidenceItem[],
  status: 'pass' | 'fail' | 'warn' | 'unknown'
} {
  const evidence: EvidenceItem[] = [];
  
  try {
    const haData = rawData['system_ha'] as Record<string, unknown> | undefined;
    if (!haData) {
      return {
        evidence: [{ label: 'HA', value: 'Dados não disponíveis', type: 'text' }],
        status: 'unknown'
      };
    }
    
    const results = haData.results as Record<string, unknown> || haData;
    const mode = results.mode as string || 'standalone';
    const groupName = results['group-name'] as string || 'N/A';
    const priority = results.priority || 'N/A';
    
    if (mode === 'standalone') {
      evidence.push({ label: 'Status', value: '❌ HA não configurado (standalone)', type: 'text' });
      evidence.push({ label: 'Modo', value: mode, type: 'text' });
      return { evidence, status: 'fail' };
    }
    
    // HA está configurado (a-p ou a-a)
    const modeLabel = mode === 'a-p' ? 'Ativo-Passivo' : mode === 'a-a' ? 'Ativo-Ativo' : mode;
    evidence.push({ label: 'Status', value: `✅ HA configurado (${modeLabel})`, type: 'text' });
    evidence.push({ label: 'Grupo', value: String(groupName), type: 'text' });
    evidence.push({ label: 'Prioridade', value: String(priority), type: 'text' });
    
    return { evidence, status: 'pass' };
  } catch (e) {
    console.error('Error formatting HA evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      status: 'unknown'
    };
  }
}

/**
 * Format HA Session Sync evidence (ha-002)
 * - standalone = unknown (N/A - não faz sentido avaliar)
 * - session-pickup enabled = pass
 * - session-pickup disabled = fail/warn
 */
function formatHASessionSyncEvidence(rawData: Record<string, unknown>): {
  evidence: EvidenceItem[],
  status: 'pass' | 'fail' | 'warn' | 'unknown',
  skipRawData: boolean
} {
  const evidence: EvidenceItem[] = [];

  try {
    const haData = rawData['system_ha'] as Record<string, unknown> | undefined;
    if (!haData) {
      return {
        evidence: [{ label: 'Status', value: 'Dados não disponíveis', type: 'text' }],
        status: 'unknown',
        skipRawData: true
      };
    }

    const results = haData.results as Record<string, unknown> || haData;
    const mode = results.mode as string || 'standalone';

    // Se HA não está configurado, não faz sentido verificar sincronização
    if (mode === 'standalone') {
      evidence.push({
        label: 'Status',
        value: 'N/A - HA não configurado',
        type: 'text'
      });
      return { evidence, status: 'unknown', skipRawData: true };
    }

    // HA está ativo - verificar sincronização de sessões
    const sessionPickup = results['session-pickup'] as string || 'disable';
    const sessionPickupNat = results['session-pickup-nat'] as string || 'disable';
    const sessionPickupConnectionless = results['session-pickup-connectionless'] as string || 'disable';
    const sessionPickupExpectation = results['session-pickup-expectation'] as string || 'disable';

    const isEnabled = sessionPickup === 'enable';

    // Status principal
    evidence.push({
      label: 'Status',
      value: isEnabled ? '✅ Sincronização ativa' : '❌ Sincronização desativada',
      type: 'text'
    });

    // Detalhes dos tipos de sessão
    evidence.push({
      label: 'Sessões TCP/UDP',
      value: sessionPickup === 'enable' ? 'Habilitado' : 'Desabilitado',
      type: 'text'
    });
    evidence.push({
      label: 'Sessões NAT',
      value: sessionPickupNat === 'enable' ? 'Habilitado' : 'Desabilitado',
      type: 'text'
    });
    evidence.push({
      label: 'Sessões sem Conexão',
      value: sessionPickupConnectionless === 'enable' ? 'Habilitado' : 'Desabilitado',
      type: 'text'
    });
    evidence.push({
      label: 'Expectativas de Protocolo',
      value: sessionPickupExpectation === 'enable' ? 'Habilitado' : 'Desabilitado',
      type: 'text'
    });

    return { 
      evidence, 
      status: isEnabled ? 'pass' : 'fail',
      skipRawData: false 
    };
  } catch (e) {
    console.error('Error formatting HA Session Sync evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      status: 'unknown',
      skipRawData: true
    };
  }
}

/**
 * Format HA Heartbeat evidence (ha-003)
 * Only shows data when HA is actually configured (not standalone)
 * Evidências humanizadas: Status + lista de interfaces individuais
 */
function formatHAHeartbeatEvidence(rawData: Record<string, unknown>): {
  evidence: EvidenceItem[],
  status: 'pass' | 'fail' | 'warn' | 'unknown',
  skipRawData: boolean
} {
  const evidence: EvidenceItem[] = [];

  try {
    const haData = rawData['system_ha'] as Record<string, unknown> | undefined;
    if (!haData) {
      return {
        evidence: [{ label: 'Status', value: 'Dados não disponíveis', type: 'text' }],
        status: 'unknown',
        skipRawData: true
      };
    }

    const results = haData.results as Record<string, unknown> || haData;
    const mode = results.mode as string || 'standalone';

    // Se HA não está configurado, não faz sentido verificar heartbeat
    if (mode === 'standalone') {
      evidence.push({
        label: 'Status',
        value: 'N/A - HA não configurado',
        type: 'text'
      });
      return { evidence, status: 'unknown', skipRawData: true };
    }

    // HA está ativo - verificar heartbeat devices
    const hbdev = results.hbdev as string | undefined;

    if (!hbdev || hbdev === '' || hbdev === '""') {
      evidence.push({
        label: 'Status',
        value: '❌ Nenhum link de heartbeat configurado',
        type: 'text'
      });
      return { evidence, status: 'fail', skipRawData: false };
    }

    // Extrair interfaces de heartbeat
    // Formato pode ser: "port1 0 port2 0" (interface + prioridade alternando)
    // ou simplesmente: "port1 port2" ou "port1,port2"
    const parts = hbdev.split(/[\s,]+/).filter(Boolean);
    const interfaces: string[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      // Se não é um número puro, é um nome de interface
      if (!/^\d+$/.test(part)) {
        interfaces.push(part);
      }
    }

    const count = interfaces.length;

    if (count >= 2) {
      evidence.push({
        label: 'Status',
        value: `✅ ${count} links de heartbeat configurados`,
        type: 'text'
      });
      // Listar cada interface individualmente
      for (const iface of interfaces) {
        evidence.push({
          label: 'Interface',
          value: iface,
          type: 'text'
        });
      }
      return { evidence, status: 'pass', skipRawData: false };
    } else if (count === 1) {
      evidence.push({
        label: 'Status',
        value: '⚠️ Apenas 1 link de heartbeat (ponto de falha)',
        type: 'text'
      });
      evidence.push({
        label: 'Interface',
        value: interfaces[0],
        type: 'text'
      });
      return { evidence, status: 'warn', skipRawData: false };
    } else {
      evidence.push({
        label: 'Status',
        value: '❌ Nenhum link de heartbeat configurado',
        type: 'text'
      });
      return { evidence, status: 'fail', skipRawData: false };
    }
  } catch (e) {
    console.error('Error formatting HA Heartbeat evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      status: 'unknown',
      skipRawData: true
    };
  }
}

// ========== BACKUP ANALYSIS HELPERS ==========

/**
 * Analyzes if an action is a backup action and what type (external/local)
 */
function analyzeBackupActionForEvidence(action: Record<string, unknown>): {
  isBackup: boolean;
  type: "external" | "local" | "none";
  destination?: string;
} {
  if (!action) return { isBackup: false, type: "none" };
  
  const actionType = String(action["action-type"] || action.type || "");
  const script = String(action.script || action.command || "");
  const systemAction = String(action["system-action"] || "");
  
  // CLI-script with execute backup
  if (actionType === "cli-script" || script) {
    const scriptLower = script.toLowerCase();
    
    // Backup to external area (FTP/SFTP/TFTP)
    if (scriptLower.includes("execute backup") && 
        (scriptLower.includes("ftp") || scriptLower.includes("sftp") || scriptLower.includes("tftp"))) {
      const match = script.match(/execute backup (?:full-config|config)\s+(ftp|sftp|tftp)\s+["']?(\S+)["']?/i);
      const destination = match ? `${match[1]}://${match[2]}` : "FTP/SFTP/TFTP";
      return { isBackup: true, type: "external", destination };
    }
    
    // Local backup (disk only)
    if (scriptLower.includes("execute backup")) {
      return { isBackup: true, type: "local" };
    }
  }
  
  // system-action: backup-config (local disk backup - FortiOS default)
  // IMPORTANT: Only counts if inside an active Stitch!
  if (systemAction === "backup-config") {
    return { isBackup: true, type: "local" };
  }
  
  return { isBackup: false, type: "none" };
}

/**
 * Checks if a trigger is scheduled type
 */
function isScheduledTriggerForEvidence(trigger: Record<string, unknown>): boolean {
  if (!trigger) return false;
  const triggerType = String(trigger["trigger-type"] || trigger.type || "");
  // IMPORTANT: event-based is NOT scheduled!
  return triggerType === "scheduled" || triggerType === "schedule";
}

/**
 * Extracts frequency from a trigger
 */
function extractTriggerFrequencyForEvidence(trigger: Record<string, unknown>): string {
  const frequency = String(trigger["trigger-frequency"] || trigger.frequency || "daily");
  const hour = Number(trigger["trigger-hour"] ?? trigger.hour ?? 0);
  const minute = Number(trigger["trigger-minute"] ?? trigger.minute ?? 0);
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return `${frequency} às ${timeStr}`;
}

/**
 * Format Backup evidence (bkp-001)
 * Uses automation stitch/trigger/action data to detect backup configuration
 * CRITICAL: Only considers backup valid if there's an active Stitch linking a scheduled trigger to a backup action
 */
function formatBackupEvidence(rawData: Record<string, unknown>): { 
  evidence: EvidenceItem[], 
  isConfigured: boolean,
  backupType: "external" | "local" | "none"
} {
  const evidence: EvidenceItem[] = [];
  let isConfigured = false;
  let backupType: "external" | "local" | "none" = "none";
  
  try {
    const stitchData = rawData['system_automation_stitch'] as Record<string, unknown> | undefined;
    const triggerData = rawData['system_automation_trigger'] as Record<string, unknown> | undefined;
    const actionData = rawData['system_automation_action'] as Record<string, unknown> | undefined;
    
    const stitches = (stitchData?.results || []) as Array<Record<string, unknown>>;
    const triggers = (triggerData?.results || []) as Array<Record<string, unknown>>;
    const actions = (actionData?.results || []) as Array<Record<string, unknown>>;
    
    console.log(`[BKP] Processing ${stitches.length} stitches, ${triggers.length} triggers, ${actions.length} actions`);
    
    // Map triggers and actions by name
    const triggerMap = new Map<string, Record<string, unknown>>();
    for (const t of triggers) triggerMap.set(String(t.name), t);
    
    const actionMap = new Map<string, Record<string, unknown>>();
    for (const a of actions) actionMap.set(String(a.name), a);
    
    // Variables for best backup found
    let bestBackup: {
      type: "external" | "local";
      destination?: string;
      frequency: string;
      stitchName: string;
      triggerName: string;
      actionName: string;
    } | null = null;
    
    // STEP 1: Look for VALID backup through ACTIVE Stitches + SCHEDULED Trigger
    for (const stitch of stitches) {
      // Check if stitch is active
      if (stitch.status && stitch.status !== "enable") continue;
      
      // Extract trigger(s) from stitch - ensure it's an array
      const rawTriggerRefs = stitch.trigger || stitch.triggers || [];
      const triggerRefs: unknown[] = Array.isArray(rawTriggerRefs) ? rawTriggerRefs : [rawTriggerRefs];
      
      // Extract action(s) from stitch - ensure it's an array
      const rawActionRefs = stitch.actions || stitch.action || [];
      const actionRefs: unknown[] = Array.isArray(rawActionRefs) ? rawActionRefs : [rawActionRefs];
      
      for (const triggerRef of triggerRefs) {
        const triggerRefObj = triggerRef as Record<string, unknown> | string;
        const triggerName = typeof triggerRefObj === "string" ? triggerRefObj : String((triggerRefObj as Record<string, unknown>)?.name || "");
        if (!triggerName) continue;
        
        const trigger = triggerMap.get(triggerName);
        if (!trigger) continue;
        
        // CRITERIA: Trigger must be SCHEDULED (not event-based)
        if (!isScheduledTriggerForEvidence(trigger)) {
          console.log(`[BKP] Stitch ${stitch.name}: Trigger ${triggerName} is not scheduled`);
          continue;
        }
        
        for (const actionRef of actionRefs) {
          const actionRefObj = actionRef as Record<string, unknown> | string;
          let actionName = "";
          if (typeof actionRefObj === "string") actionName = actionRefObj;
          else if ((actionRefObj as Record<string, unknown>)?.action) actionName = String((actionRefObj as Record<string, unknown>).action);
          else if ((actionRefObj as Record<string, unknown>)?.name) actionName = String((actionRefObj as Record<string, unknown>).name);
          if (!actionName) continue;
          
          const action = actionMap.get(actionName);
          const backupInfo = analyzeBackupActionForEvidence(action || { name: actionName });
          
          if (!backupInfo.isBackup) continue;
          
          // BACKUP FOUND!
          const frequency = extractTriggerFrequencyForEvidence(trigger);
          
          const candidate = {
            type: backupInfo.type as "external" | "local",
            destination: backupInfo.destination,
            frequency,
            stitchName: String(stitch.name),
            triggerName,
            actionName
          };
          
          // Prioritize external over local
          if (backupInfo.type === "external") {
            bestBackup = candidate;
            console.log(`[BKP] ✅ EXTERNAL Backup: ${stitch.name} -> ${backupInfo.destination}`);
            break; // Found external, stop
          } else if (!bestBackup) {
            bestBackup = candidate;
            console.log(`[BKP] ⚠️ LOCAL Backup: ${stitch.name}`);
          }
        }
        if (bestBackup?.type === "external") break;
      }
      if (bestBackup?.type === "external") break;
    }
    
    // Generate evidence based on result
    if (bestBackup) {
      isConfigured = bestBackup.type === "external";
      backupType = bestBackup.type;
      
      if (bestBackup.type === "external") {
        evidence.push({ label: 'Status', value: '✅ Backup externo configurado', type: 'text' });
        if (bestBackup.destination) {
          evidence.push({ label: 'Destino', value: bestBackup.destination, type: 'code' });
        }
      } else {
        evidence.push({ label: 'Status', value: '⚠️ Backup apenas local (disco)', type: 'text' });
        evidence.push({ label: 'Risco', value: 'Não protege contra perda do equipamento', type: 'text' });
      }
      
      evidence.push({ label: 'Frequência', value: bestBackup.frequency, type: 'text' });
      evidence.push({ label: 'Stitch Name', value: bestBackup.stitchName, type: 'code' });
      evidence.push({ label: 'Trigger Name', value: bestBackup.triggerName, type: 'code' });
      evidence.push({ label: 'Action Name', value: bestBackup.actionName, type: 'code' });
    } else {
      // Check for orphan backup actions (not linked to scheduled stitch)
      const orphanBackupActions = actions.filter(a => {
        const info = analyzeBackupActionForEvidence(a);
        return info.isBackup;
      });
      
      if (orphanBackupActions.length > 0) {
        evidence.push({ 
          label: 'Status', 
          value: '❌ Actions de backup encontradas, mas sem agendamento ativo', 
          type: 'text' 
        });
        evidence.push({ 
          label: 'Verificação', 
          value: 'Nenhum Stitch ativo conecta um Trigger agendado a uma Action de backup', 
          type: 'text' 
        });
      } else {
        evidence.push({ label: 'Status', value: '❌ Backup automático não configurado', type: 'text' });
      }
      
      evidence.push({ 
        label: 'Recomendação', 
        value: 'Criar automation stitch com trigger agendado + action cli-script: execute backup full-config ftp/sftp <server>', 
        type: 'text' 
      });
    }
    
    // Totals for debug
    evidence.push({
      label: 'Automações',
      value: `${stitches.length} stitches, ${triggers.length} triggers, ${actions.length} ações`,
      type: 'text'
    });
    
  } catch (e) {
    console.error('[BKP] Error formatting Backup evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar dados', type: 'text' });
  }
  
  return { evidence, isConfigured, backupType };
}

/**
 * Format Firmware Version evidence (fw-001)
 * Extracts version info and evaluates if firmware is current
 */
function formatFirmwareEvidence(
  rawData: Record<string, unknown>
): { evidence: EvidenceItem[], firmwareInfo: Record<string, unknown>, status: 'pass' | 'fail' | 'warn' } {
  const evidence: EvidenceItem[] = [];
  const firmwareInfo: Record<string, unknown> = {};
  
  try {
    const systemStatus = rawData['system_status'] as Record<string, unknown> | undefined;
    
    if (!systemStatus) {
      evidence.push({ label: 'Status', value: 'Dados não disponíveis', type: 'text' });
      return { evidence, firmwareInfo, status: 'warn' };
    }
    
    // Extract version at root level (FortiGate API returns version at root, not in results)
    const version = systemStatus.version as string || '';
    const serial = systemStatus.serial as string || '';
    const build = systemStatus.build as number | string || '';
    
    // Extract data from results
    const results = systemStatus.results as Record<string, unknown> || {};
    const hostname = results.hostname as string || '';
    const model = results.model || results.model_name || '';
    
    // Populate firmwareInfo for rawData
    firmwareInfo.version = version;
    firmwareInfo.build = build;
    firmwareInfo.serial = serial;
    firmwareInfo.hostname = hostname;
    firmwareInfo.model = model;
    
    // Extract available firmware versions from system_firmware endpoint (FortiGuard data)
    const systemFirmware = rawData['system_firmware'] as Record<string, unknown> | undefined;
    let availableVersions: Array<{
      version: string;
      major: number;
      minor: number;
      patch: number;
      maturity: string;
    }> = [];
    
    if (systemFirmware) {
      const fwResults = systemFirmware.results as Record<string, unknown> || systemFirmware;
      const available = fwResults.available as Array<Record<string, unknown>> || [];
      
      availableVersions = available.map(v => ({
        version: String(v.version || ''),
        major: Number(v.major || 0),
        minor: Number(v.minor || 0),
        patch: Number(v.patch || 0),
        maturity: String(v.maturity || '')
      }));
      
      console.log(`[fw-001] Found ${availableVersions.length} available firmware versions from FortiGuard`);
    } else {
      console.log('[fw-001] No system_firmware data available');
    }
    
    if (version) {
      const cleanVersion = version.replace(/^v/i, '');
      
      // Simplified evidence - only version and build
      evidence.push({ label: 'Versão do Firmware', value: version, type: 'code' });
      if (build) evidence.push({ label: 'Build', value: String(build), type: 'text' });
      
      // Extract major.minor.patch from current version
      const versionParts = cleanVersion.match(/^(\d+)\.(\d+)\.?(\d+)?/);
      let status: 'pass' | 'fail' | 'warn' = 'warn';
      
      if (versionParts) {
        const currentMajor = parseInt(versionParts[1]);
        const currentMinor = parseInt(versionParts[2]);
        const currentPatch = parseInt(versionParts[3] || '0');
        const branchKey = `${currentMajor}.${currentMinor}`;
        
        // Filter mature versions from the same branch (same major.minor)
        const sameBranchMature = availableVersions
          .filter(v => 
            v.major === currentMajor && 
            v.minor === currentMinor && 
            v.maturity === 'M'
          )
          .sort((a, b) => b.patch - a.patch);
        
        console.log(`[fw-001] Current: ${currentMajor}.${currentMinor}.${currentPatch}, Branch mature versions: ${sameBranchMature.length}`);
        
        if (sameBranchMature.length > 0) {
          const latestMature = sameBranchMature[0];
          
          if (currentPatch >= latestMature.patch) {
            status = 'pass';
            evidence.push({ 
              label: 'Status', 
              value: `✅ Última versão mature do branch ${branchKey}`, 
              type: 'text' 
            });
          } else {
            status = 'fail';
            evidence.push({ 
              label: 'Status', 
              value: `❌ Atualização disponível: ${latestMature.version}`, 
              type: 'text' 
            });
          }
        } else {
          // No available versions to compare - cannot determine status
          status = 'warn';
          evidence.push({ 
            label: 'Status', 
            value: `⚠️ Não foi possível verificar atualizações disponíveis`, 
            type: 'text' 
          });
        }
      }
      
      return { evidence, firmwareInfo, status };
    } else {
      evidence.push({ label: 'Status', value: 'Versão não identificada', type: 'text' });
      return { evidence, firmwareInfo, status: 'warn' };
    }
  } catch (e) {
    console.error('Error formatting firmware evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar', type: 'text' });
    return { evidence, firmwareInfo, status: 'warn' };
  }
}

/**
 * Format Interface Security evidence for int-001 (HTTP), int-002 (HTTPS), int-003 (SSH), int-004 (SNMP), int-005 (Ping)
 * These rules check for insecure protocols on WAN interfaces
 */
function formatInterfaceSecurityEvidence(
  rawData: Record<string, unknown>,
  ruleCode: string
): { evidence: EvidenceItem[], vulnerableInterfaces: Array<Record<string, unknown>>, status: 'pass' | 'fail' | 'warn' } {
  const evidence: EvidenceItem[] = [];
  const vulnerableInterfaces: Array<Record<string, unknown>> = [];
  
  try {
    // Map rule code to protocol being checked
    const protocolMap: Record<string, { protocol: string, protocolLabel: string }> = {
      'int-001': { protocol: 'http', protocolLabel: 'HTTP' },
      'int-002': { protocol: 'https', protocolLabel: 'HTTPS' },
      'int-003': { protocol: 'ssh', protocolLabel: 'SSH' },
      'int-004': { protocol: 'snmp', protocolLabel: 'SNMP' },
      'int-005': { protocol: 'ping', protocolLabel: 'ICMP Ping' }
    };
    
    const config = protocolMap[ruleCode];
    if (!config) {
      evidence.push({ label: 'Erro', value: `Regra ${ruleCode} não mapeada`, type: 'text' });
      return { evidence, vulnerableInterfaces, status: 'pass' };
    }
    
    // Get interfaces list
    const interfaceData = rawData['system_interface'] as Record<string, unknown> | undefined;
    const interfaces = ((interfaceData?.results || []) as Array<Record<string, unknown>>);
    
    if (!interfaces.length) {
      evidence.push({ label: 'Status', value: 'Nenhuma interface encontrada', type: 'text' });
      return { evidence, vulnerableInterfaces, status: 'pass' };
    }
    
    // Analyze interfaces
    for (const iface of interfaces) {
      const role = String(iface.role || '').toLowerCase();
      const name = String(iface.name || '');
      const allowaccess = String(iface.allowaccess || '').toLowerCase();
      
      // Check if it's a WAN or SD-WAN interface (by role only, not name)
      const isWan = role === 'wan' || role === 'sd-wan' || 
                    role.includes('wan') || 
                    name.toLowerCase() === 'virtual-wan-link' ||
                    name.toLowerCase() === 'sd-wan' ||
                    name.toLowerCase() === 'sdwan';
      
      if (!isWan) continue;
      
      // For int-001 (HTTP), check if 'http' is present but NOT as part of 'https'
      // For other rules, check if the protocol is present
      let hasProtocol = false;
      
      if (ruleCode === 'int-001') {
        // HTTP: verify 'http' without being 'https'
        const protocols = allowaccess.split(/\s+/);
        hasProtocol = protocols.some(p => p === 'http');
      } else {
        hasProtocol = allowaccess.includes(config.protocol);
      }
      
      if (hasProtocol) {
        vulnerableInterfaces.push(iface);
      }
    }
    
    // Generate evidence
    if (vulnerableInterfaces.length === 0) {
      evidence.push({
        label: 'Status',
        value: `✅ Nenhuma interface WAN com ${config.protocolLabel} habilitado`,
        type: 'text'
      });
    } else {
      evidence.push({
        label: 'Status',
        value: `❌ ${vulnerableInterfaces.length} interface(s) WAN com ${config.protocolLabel} habilitado`,
        type: 'text'
      });
      
      // Show interface names (max 5)
      for (const iface of vulnerableInterfaces.slice(0, 5)) {
        const ifaceName = iface.name || 'N/A';
        const ifaceAllowaccess = iface.allowaccess || '';
        evidence.push({
          label: String(ifaceName),
          value: `allowaccess: ${ifaceAllowaccess}`,
          type: 'code'
        });
      }
      
      if (vulnerableInterfaces.length > 5) {
        evidence.push({
          label: 'Aviso',
          value: `... e mais ${vulnerableInterfaces.length - 5} interface(s)`,
          type: 'text'
        });
      }
    }
    
    const status = vulnerableInterfaces.length > 0 ? 'fail' : 'pass';
    return { evidence, vulnerableInterfaces, status };
    
  } catch (e) {
    console.error('Error formatting Interface Security evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar dados', type: 'text' });
    return { evidence, vulnerableInterfaces, status: 'pass' };
  }
}

/**
 * Format Security Policy evidence for sec-001 (Strong Crypto), sec-002 (2FA), sec-003 (Session Timeout)
 * These rules evaluate global FortiGate security settings
 */
function formatSecurityPolicyEvidence(
  rawData: Record<string, unknown>,
  ruleCode: string
): { evidence: EvidenceItem[], status?: 'pass' | 'fail' | 'warn' | 'unknown', skipRawData?: boolean, rawDataOverride?: Record<string, unknown> } {
  const evidence: EvidenceItem[] = [];
  
  try {
    if (ruleCode === 'sec-001') {
      // Strong Crypto
      const globalData = rawData['system_global'] as Record<string, unknown> | undefined;
      const results = globalData?.results as Record<string, unknown> || globalData || {};
      const strongCrypto = results['strong-crypto'];
      
      // Extract only the relevant field for raw data
      const relevantData = {
        'strong-crypto': strongCrypto,
        'ssl-min-proto-version': results['ssl-min-proto-version'],
      };
      
      if (strongCrypto === 'enable') {
        return {
          evidence: [{ label: 'Criptografia Forte', value: '✅ Habilitada', type: 'text' }],
          status: 'pass',
          skipRawData: false,
          rawDataOverride: relevantData
        };
      } else {
        return {
          evidence: [{ label: 'Criptografia Forte', value: '❌ Desabilitada', type: 'text' }],
          status: 'fail',
          skipRawData: false,
          rawDataOverride: relevantData
        };
      }
    }
    
    if (ruleCode === 'sec-002') {
      // Two-Factor Authentication
      const adminData = rawData['system_admin'] as Record<string, unknown> | undefined;
      const results = (adminData?.results || []) as Array<Record<string, unknown>>;
      
      if (results.length === 0) {
        return {
          evidence: [
            { label: 'Status', value: '⚠️ Dados de administradores não disponíveis', type: 'text' },
            { label: 'Motivo', value: 'API token sem permissão para listar administradores', type: 'text' },
            { label: 'Ação Recomendada', value: 'Verifique manualmente no painel FortiGate', type: 'text' }
          ],
          status: 'unknown',
          skipRawData: true // No useful data to show
        };
      }
      
      // Extract only relevant fields from each admin
      const relevantAdmins = results.map(admin => ({
        name: admin.name,
        'two-factor': admin['two-factor'],
        'two-factor-authentication': admin['two-factor-authentication'],
      }));
      
      // Check 2FA in each admin
      const adminsWithout2FA = results.filter(admin => 
        admin['two-factor'] === 'disable' || !admin['two-factor']
      );
      
      if (adminsWithout2FA.length === 0) {
        return {
          evidence: [{ label: 'Status', value: '✅ Todos os administradores com 2FA', type: 'text' }],
          status: 'pass',
          skipRawData: false,
          rawDataOverride: { administrators: relevantAdmins }
        };
      } else {
        const ev: EvidenceItem[] = [
          { label: 'Status', value: `❌ ${adminsWithout2FA.length} admin(s) sem 2FA`, type: 'text' }
        ];
        for (const admin of adminsWithout2FA.slice(0, 5)) {
          ev.push({ label: 'Admin', value: String(admin.name || 'N/A'), type: 'text' });
        }
        return { 
          evidence: ev, 
          status: 'fail', 
          skipRawData: false,
          rawDataOverride: { administrators: relevantAdmins }
        };
      }
    }
    
    if (ruleCode === 'sec-003') {
      // Session Timeout
      const globalData = rawData['system_global'] as Record<string, unknown> | undefined;
      const results = globalData?.results as Record<string, unknown> || globalData || {};
      const timeout = results.admintimeout as number | undefined;
      
      // Extract only the relevant field for raw data
      const relevantData = {
        admintimeout: timeout,
        'device-idle-timeout': results['device-idle-timeout'],
      };
      
      if (timeout !== undefined) {
        const isCompliant = timeout <= 30;
        return {
          evidence: [
            { label: 'Timeout de Sessão', value: isCompliant ? `✅ ${timeout} minutos` : `⚠️ ${timeout} minutos (recomendado ≤30min)`, type: 'text' }
          ],
          status: isCompliant ? 'pass' : 'warn',
          skipRawData: false,
          rawDataOverride: relevantData
        };
      }
    }
  } catch (e) {
    console.error('Error formatting Security Policy evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar dados', type: 'text' });
  }
  
  return { evidence, skipRawData: false };
}

/**
 * Format UTM Security Profile evidence - checks for policies with WAN/SD-WAN interfaces
 * without the corresponding security profile (av-profile, webfilter-profile, etc.)
 * 
 * Logic:
 * - utm-001 (IPS/IDS): checks SOURCE interface is WAN (inbound traffic)
 * - utm-004, utm-007, utm-009: check DESTINATION interface is WAN (outbound traffic)
 * - All rules only evaluate policies with action = ACCEPT
 */
function formatUTMSecurityProfileEvidence(
  rawData: Record<string, unknown>,
  ruleCode: string
): { evidence: EvidenceItem[], vulnerablePolicies: Array<Record<string, unknown>> } {
  const evidence: EvidenceItem[] = [];
  const vulnerablePolicies: Array<Record<string, unknown>> = [];
  
  try {
    // Map rule code to corresponding profile field and interface direction
    const profileFieldMap: Record<string, { field: string, profileName: string, checkSource: boolean }> = {
      'utm-009': { field: 'av-profile', profileName: 'Antivirus', checkSource: false },        // Destino WAN
      'utm-007': { field: 'application-list', profileName: 'Application Control', checkSource: false }, // Destino WAN  
      'utm-004': { field: 'webfilter-profile', profileName: 'Web Filter', checkSource: false }, // Destino WAN
      'utm-001': { field: 'ips-sensor', profileName: 'IPS/IDS', checkSource: true }            // Origem WAN (inbound)
    };
    
    const profileConfig = profileFieldMap[ruleCode];
    if (!profileConfig) {
      evidence.push({ label: 'Erro', value: `Regra ${ruleCode} não mapeada`, type: 'text' });
      return { evidence, vulnerablePolicies };
    }
    
    const { field: profileField, profileName, checkSource } = profileConfig;
    
    // Get firewall policies and interfaces
    const policyData = rawData['firewall_policy'] as Record<string, unknown> | undefined;
    const interfaceData = rawData['system_interface'] as Record<string, unknown> | undefined;
    
    const policies = (policyData?.results || []) as Array<Record<string, unknown>>;
    const interfaces = (interfaceData?.results || []) as Array<Record<string, unknown>>;
    
    if (!policies.length) {
      evidence.push({ label: 'Status', value: 'Nenhuma política encontrada', type: 'text' });
      return { evidence, vulnerablePolicies };
    }
    
    // Analyze policies
    for (const policy of policies) {
      // Skip disabled policies
      if (policy.status === 'disable') continue;
      
      // Skip policies where action is not ACCEPT
      const action = String(policy.action || '').toLowerCase();
      if (action !== 'accept') continue;
      
      // Check interface based on rule type
      let hasWanInterface = false;
      
      if (checkSource) {
        // For IPS/IDS (utm-001): check SOURCE interface is WAN/SD-WAN
        const srcintf = policy.srcintf as Array<Record<string, unknown>> | undefined;
        const srcintfNames = (srcintf || []).map(i => String(i.name || i.q_origin_key || ''));
        hasWanInterface = srcintfNames.some(name => isWanInterface(name, interfaces));
      } else {
        // For AV, AppCtrl, WebFilter: check DESTINATION interface is WAN/SD-WAN
        const dstintf = policy.dstintf as Array<Record<string, unknown>> | undefined;
        const dstintfNames = (dstintf || []).map(i => String(i.name || i.q_origin_key || ''));
        hasWanInterface = dstintfNames.some(name => isWanInterface(name, interfaces));
      }
      
      if (!hasWanInterface) continue; // Skip non-WAN interface policies
      
      // Check if the security profile is applied
      const profileValue = policy[profileField];
      const hasProfile = profileValue && String(profileValue).trim() !== '';
      
      if (!hasProfile) {
        vulnerablePolicies.push(policy);
      }
    }
    
    // Generate evidence
    const interfaceLabel = checkSource ? 'origem' : 'destino';
    
    if (vulnerablePolicies.length === 0) {
      evidence.push({
        label: 'Status',
        value: `✅ Todas as políticas ACCEPT com ${interfaceLabel} WAN possuem ${profileName}`,
        type: 'text'
      });
    } else {
      evidence.push({
        label: 'Status',
        value: `❌ ${vulnerablePolicies.length} política(s) ACCEPT sem ${profileName}`,
        type: 'text'
      });
      
      // Show details of problematic policies (max 5)
      for (const policy of vulnerablePolicies.slice(0, 5)) {
        const policyId = policy.policyid || policy.id || 'N/A';
        const policyName = policy.name || `Policy ${policyId}`;
        
        evidence.push({
          label: `Regra ID - ${policyId}`,
          value: String(policyName),
          type: 'text'
        });
      }
      
      if (vulnerablePolicies.length > 5) {
        evidence.push({
          label: 'Aviso',
          value: `... e mais ${vulnerablePolicies.length - 5} regra(s)`,
          type: 'text'
        });
      }
    }
    
  } catch (e) {
    console.error('Error formatting UTM Security Profile evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar dados', type: 'text' });
  }
  
  return { evidence, vulnerablePolicies };
}

/**
 * Helper to check if an interface has WAN or SD-WAN role
 * Includes special handling for virtual-wan-link and sd-wan zone interfaces
 */
function isWanInterface(interfaceName: string, interfaces: Array<Record<string, unknown>>): boolean {
  if (!interfaceName) return false;
  
  const nameLower = interfaceName.toLowerCase();
  
  // Special SD-WAN interfaces that should always be considered as WAN
  const sdwanInterfaces = ['virtual-wan-link', 'sd-wan', 'sdwan'];
  if (sdwanInterfaces.some(sw => nameLower === sw || nameLower.includes(sw))) {
    return true;
  }
  
  // Check by role in interface list
  if (interfaces && interfaces.length > 0) {
    const iface = interfaces.find(i => i.name === interfaceName);
    if (iface) {
      const role = String(iface.role || '').toLowerCase();
      if (role === 'wan' || role === 'sd-wan' || role.includes('wan')) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Helper to check if source includes "all" object
 */
function hasAllSource(srcaddr: Array<Record<string, unknown>> | undefined): boolean {
  if (!Array.isArray(srcaddr)) return false;
  return srcaddr.some(addr => 
    String(addr.name || addr.q_origin_key || '').toLowerCase() === 'all'
  );
}

/**
 * Helper to check if service matches specific protocols
 */
function serviceMatchesProtocol(
  service: Array<Record<string, unknown>> | undefined,
  protocols: string[]
): boolean {
  if (!Array.isArray(service)) return false;
  
  const protocolsLower = protocols.map(p => p.toLowerCase());
  
  return service.some(svc => {
    const name = String(svc.name || svc.q_origin_key || '').toLowerCase();
    return protocolsLower.some(proto => 
      name.includes(proto) || name === proto
    );
  });
}

/**
 * Format Inbound Rules evidence - filters policies by WAN interfaces and specific conditions
 */
function formatInboundRuleEvidence(
  rawData: Record<string, unknown>,
  ruleCode: string
): { evidence: EvidenceItem[], relevantPolicies: Array<Record<string, unknown>> } {
  const evidence: EvidenceItem[] = [];
  const relevantPolicies: Array<Record<string, unknown>> = [];
  
  try {
    // Get firewall policies and interfaces
    const policyData = rawData['firewall_policy'] as Record<string, unknown> | undefined;
    const interfaceData = rawData['system_interface'] as Record<string, unknown> | undefined;
    
    const policies = (policyData?.results || []) as Array<Record<string, unknown>>;
    const interfaces = (interfaceData?.results || []) as Array<Record<string, unknown>>;
    
    if (!policies.length) {
      evidence.push({ label: 'Status', value: 'Nenhuma política encontrada', type: 'text' });
      return { evidence, relevantPolicies };
    }
    
    if (!interfaces.length) {
      evidence.push({ label: 'Aviso', value: 'Dados de interfaces não disponíveis', type: 'text' });
    }
    
    // Get WAN/SD-WAN interface names for reference
    // Include both role-based detection and special SD-WAN interfaces
    const wanInterfaces = interfaces
      .filter(i => {
        const role = String(i.role || '').toLowerCase();
        const name = String(i.name || '').toLowerCase();
        return role === 'wan' || role === 'sd-wan' || role.includes('wan') ||
               name === 'virtual-wan-link' || name.includes('sdwan') || name.includes('sd-wan');
      })
      .map(i => String(i.name));
    
    // Also add virtual-wan-link if not already present (it may not be in interface list)
    if (!wanInterfaces.includes('virtual-wan-link')) {
      // Check if any policy references virtual-wan-link
      const hasVirtualWanLink = policies.some(p => {
        const srcintf = p.srcintf as Array<Record<string, unknown>> | undefined;
        return (srcintf || []).some(i => 
          String(i.name || i.q_origin_key || '').toLowerCase() === 'virtual-wan-link'
        );
      });
      if (hasVirtualWanLink) {
        wanInterfaces.push('virtual-wan-link');
      }
    }
    
    // Filter policies based on rule type
    for (const policy of policies) {
      // Check if source interface is WAN
      const srcintf = policy.srcintf as Array<Record<string, unknown>> | undefined;
      const srcintfNames = (srcintf || []).map(i => String(i.name || i.q_origin_key || ''));
      
      const isFromWan = srcintfNames.some(name => 
        wanInterfaces.includes(name) || 
        isWanInterface(name, interfaces)
      );
      
      if (!isFromWan) continue; // Skip non-WAN policies
      
      const srcaddr = policy.srcaddr as Array<Record<string, unknown>> | undefined;
      const service = policy.service as Array<Record<string, unknown>> | undefined;
      
      let matchesRule = false;
      
      if (ruleCode === 'inb-001') {
        // Regras de Entrada sem Restrição de Origem
        // Policies with "all" as source
        matchesRule = hasAllSource(srcaddr);
      } else if (ruleCode === 'inb-002') {
        // RDP Exposto para Internet
        // Policies with RDP service (3389)
        matchesRule = serviceMatchesProtocol(service, ['rdp', '3389', 'RDP']);
      } else if (ruleCode === 'inb-003') {
        // SMB/CIFS Exposto para Internet
        // Policies with SMB/CIFS service (445, 139)
        matchesRule = serviceMatchesProtocol(service, ['smb', 'cifs', '445', '139', 'SMB', 'CIFS', 'SAMBA', 'netbios']);
      }
      
      if (matchesRule) {
        relevantPolicies.push(policy);
      }
    }
    
    // Generate evidence - simplified format
    if (relevantPolicies.length === 0) {
      evidence.push({
        label: 'Status',
        value: 'Nenhuma regra vulnerável encontrada',
        type: 'text'
      });
    } else {
      evidence.push({
        label: 'Status',
        value: `${relevantPolicies.length} regra(s) vulnerável(is) encontrada(s)`,
        type: 'text'
      });
      
      // Show only ID and name of problematic policies (max 10)
      for (const policy of relevantPolicies.slice(0, 10)) {
        const policyId = policy.policyid || policy.id || 'N/A';
        const policyName = policy.name || `Policy ${policyId}`;
        
        evidence.push({
          label: `Regra - ID ${policyId}`,
          value: String(policyName),
          type: 'text'
        });
      }
      
      if (relevantPolicies.length > 10) {
        evidence.push({
          label: 'Aviso',
          value: `... e mais ${relevantPolicies.length - 10} regra(s)`,
          type: 'text'
        });
      }
    }
    
  } catch (e) {
    console.error('Error formatting Inbound rule evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar dados', type: 'text' });
  }
  
  return { evidence, relevantPolicies };
}

/**
 * Format Any-to-Any rules evidence (net-003)
 * Detects policies with srcaddr=all AND dstaddr=all
 */
function formatAnyToAnyEvidence(rawData: Record<string, unknown>): {
  evidence: EvidenceItem[],
  vulnerablePolicies: Array<Record<string, unknown>>
} {
  const evidence: EvidenceItem[] = [];
  const vulnerablePolicies: Array<Record<string, unknown>> = [];

  try {
    const policyData = rawData['firewall_policy'] as Record<string, unknown> | undefined;
    const policies = (policyData?.results || []) as Array<Record<string, unknown>>;

    if (!policies.length) {
      evidence.push({ label: 'Status', value: 'Nenhuma política encontrada', type: 'text' });
      return { evidence, vulnerablePolicies };
    }

    // Verificar cada policy para any-to-any
    for (const policy of policies) {
      const srcaddr = policy.srcaddr as Array<Record<string, unknown>> | undefined;
      const dstaddr = policy.dstaddr as Array<Record<string, unknown>> | undefined;

      const hasAllSrc = (srcaddr || []).some(
        addr => String(addr.name || addr.q_origin_key || '').toLowerCase() === 'all'
      );
      const hasAllDst = (dstaddr || []).some(
        addr => String(addr.name || addr.q_origin_key || '').toLowerCase() === 'all'
      );

      if (hasAllSrc && hasAllDst) {
        vulnerablePolicies.push(policy);
      }
    }

    // Gerar evidências
    if (vulnerablePolicies.length === 0) {
      evidence.push({
        label: 'Status',
        value: '✅ Nenhuma regra vulnerável encontrada',
        type: 'text'
      });
    } else {
      evidence.push({
        label: 'Status',
        value: `❌ ${vulnerablePolicies.length} regra(s) any-any encontrada(s)`,
        type: 'text'
      });

      // Detalhar até 5 policies
      for (const policy of vulnerablePolicies.slice(0, 5)) {
        const policyId = policy.policyid || policy.id || 'N/A';
        const policyName = policy.name || `Policy ${policyId}`;
        const action = policy.action || 'N/A';
        const statusIcon = policy.status === 'enable' ? '🟢' : '🔴';

        evidence.push({
          label: `Regra ${policyId}`,
          value: `${statusIcon} ${policyName} (${String(action).toUpperCase()})`,
          type: 'text'
        });
      }

      if (vulnerablePolicies.length > 5) {
        evidence.push({
          label: 'Aviso',
          value: `... e mais ${vulnerablePolicies.length - 5} regra(s)`,
          type: 'text'
        });
      }
    }
  } catch (e) {
    console.error('Error formatting Any-to-Any evidence:', e);
    evidence.push({ label: 'Erro', value: 'Falha ao processar dados', type: 'text' });
  }

  return { evidence, vulnerablePolicies };
}

/**
 * Format LDAP evidence (auth-001)
 * - Status pass: todos os servidores têm secure === 'ldaps'
 * - Status fail: algum servidor não tem ldaps ou não há servidores
 */
function formatLDAPEvidence(rawData: Record<string, unknown>): {
  evidence: EvidenceItem[],
  status: 'pass' | 'fail' | 'warn' | 'unknown',
  hasServers: boolean
} {
  const evidence: EvidenceItem[] = [];

  try {
    const ldapData = rawData['user_ldap'] as Record<string, unknown> | undefined;
    if (!ldapData) {
      return {
        evidence: [{ label: 'Status', value: 'Dados não disponíveis', type: 'text' }],
        status: 'unknown',
        hasServers: false
      };
    }

    const results = (ldapData.results || []) as Array<Record<string, unknown>>;

    if (results.length === 0) {
      evidence.push({
        label: 'Status',
        value: 'Nenhum servidor LDAP configurado',
        type: 'text'
      });
      return { evidence, status: 'not_found', hasServers: false };
    }

    // Contar servidores com e sem criptografia
    const secureServers = results.filter(s => s.secure === 'ldaps');
    const insecureServers = results.filter(s => s.secure !== 'ldaps');

    const allSecure = insecureServers.length === 0;

    // Status principal
    if (allSecure) {
      evidence.push({
        label: 'Status',
        value: `✅ ${results.length} servidor(es) com criptografia`,
        type: 'text'
      });
    } else {
      evidence.push({
        label: 'Status',
        value: `❌ ${insecureServers.length} servidor(es) sem criptografia`,
        type: 'text'
      });
    }

    // Listar cada servidor
    for (const server of results) {
      const name = server.name as string || 'N/A';
      const serverAddr = server.server as string || 'N/A';
      const port = server.port || 389;
      const secure = server.secure as string;
      const isSecure = secure === 'ldaps';

      evidence.push({
        label: 'Servidor',
        value: `${name} (${serverAddr}:${port})`,
        type: 'text'
      });
      evidence.push({
        label: 'Criptografia',
        value: isSecure ? 'LDAPS' : 'Desabilitada',
        type: 'text'
      });
    }

    return {
      evidence,
      status: allSecure ? 'pass' : 'fail',
      hasServers: true
    };
  } catch (e) {
    console.error('Error formatting LDAP evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      status: 'unknown',
      hasServers: false
    };
  }
}

/**
 * Format RADIUS evidence (auth-002)
 * Exibe lista de servidores RADIUS configurados
 */
function formatRADIUSEvidence(rawData: Record<string, unknown>): {
  evidence: EvidenceItem[],
  hasServers: boolean
} {
  const evidence: EvidenceItem[] = [];

  try {
    const radiusData = rawData['user_radius'] as Record<string, unknown> | undefined;
    if (!radiusData) {
      return {
        evidence: [{ label: 'Status', value: 'Dados não disponíveis', type: 'text' }],
        hasServers: false
      };
    }

    const results = (radiusData.results || []) as Array<Record<string, unknown>>;

    if (results.length === 0) {
      evidence.push({
        label: 'Status',
        value: 'Nenhum servidor RADIUS configurado',
        type: 'text'
      });
      return { evidence, hasServers: false };
    }

    // Status principal
    evidence.push({
      label: 'Status',
      value: `✅ ${results.length} servidor(es) RADIUS configurado(s)`,
      type: 'text'
    });

    // Listar cada servidor
    for (const server of results) {
      const name = server.name as string || 'N/A';
      const serverAddr = server.server as string || 'N/A';
      const port = server['radius-port'] || 1812;

      evidence.push({
        label: 'Servidor',
        value: `${name} (${serverAddr}:${port})`,
        type: 'text'
      });
    }

    return { evidence, hasServers: true };
  } catch (e) {
    console.error('Error formatting RADIUS evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      hasServers: false
    };
  }
}

/**
 * Format FSSO evidence (auth-003)
 * Exibe lista de agentes FSSO configurados
 */
function formatFSSOEvidence(rawData: Record<string, unknown>): {
  evidence: EvidenceItem[],
  hasAgents: boolean
} {
  const evidence: EvidenceItem[] = [];

  try {
    const fssoData = rawData['user_fsso'] as Record<string, unknown> | undefined;
    if (!fssoData) {
      return {
        evidence: [{ label: 'Status', value: 'Dados não disponíveis', type: 'text' }],
        hasAgents: false
      };
    }

    const results = (fssoData.results || []) as Array<Record<string, unknown>>;

    if (results.length === 0) {
      evidence.push({
        label: 'Status',
        value: 'Nenhum agente FSSO configurado',
        type: 'text'
      });
      return { evidence, hasAgents: false };
    }

    // Status principal
    const plural = results.length === 1 ? '' : 's';
    evidence.push({
      label: 'Status',
      value: `✅ ${results.length} agente${plural} FSSO configurado${plural}`,
      type: 'text'
    });

    // Listar cada agente
    for (const agent of results) {
      const name = agent.name as string || 'N/A';
      const serverAddr = agent.server as string || 'N/A';
      const port = agent.port || 8000;

      evidence.push({
        label: 'Servidor',
        value: `${name} (${serverAddr}:${port})`,
        type: 'text'
      });
    }

    return { evidence, hasAgents: true };
  } catch (e) {
    console.error('Error formatting FSSO evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      hasAgents: false
    };
  }
}

/**
 * Format SAML evidence (auth-004)
 * Exibe lista de provedores SAML configurados
 */
function formatSAMLEvidence(rawData: Record<string, unknown>): {
  evidence: EvidenceItem[],
  hasProviders: boolean
} {
  const evidence: EvidenceItem[] = [];

  try {
    const samlData = rawData['user_saml'] as Record<string, unknown> | undefined;
    if (!samlData) {
      return {
        evidence: [{ label: 'Status', value: 'Dados não disponíveis', type: 'text' }],
        hasProviders: false
      };
    }

    const results = (samlData.results || []) as Array<Record<string, unknown>>;

    if (results.length === 0) {
      evidence.push({
        label: 'Status',
        value: 'Nenhum provedor SAML configurado',
        type: 'text'
      });
      return { evidence, hasProviders: false };
    }

    // Status principal
    const plural = results.length === 1 ? '' : 'es';
    evidence.push({
      label: 'Status',
      value: `✅ ${results.length} provedor${plural} SAML configurado${plural}`,
      type: 'text'
    });

    // Listar cada provedor
    for (const provider of results) {
      const name = provider.name as string || 'N/A';
      const ssoUrl = provider['idp-single-sign-on-url'] as string || '';

      evidence.push({
        label: 'Provedor',
        value: name,
        type: 'text'
      });

      if (ssoUrl) {
        // Truncar URL se muito longa
        const displayUrl = ssoUrl.length > 60 ? ssoUrl.substring(0, 57) + '...' : ssoUrl;
        evidence.push({
          label: 'URL SSO',
          value: displayUrl,
          type: 'text'
        });
      }
    }

    return { evidence, hasProviders: true };
  } catch (e) {
    console.error('Error formatting SAML evidence:', e);
    return {
      evidence: [{ label: 'Erro', value: 'Falha ao processar dados', type: 'text' }],
      hasProviders: false
    };
  }
}

/**
 * Format generic evidence with truncation for large objects
 */
function formatGenericEvidence(value: unknown, fieldPath: string): EvidenceItem[] {
  if (value === undefined || value === null) {
    return [];
  }
  
  const isComplex = typeof value === 'object';
  let displayValue: string;
  
  if (isComplex) {
    const jsonStr = JSON.stringify(value, null, 2);
    // Truncate if too large
    if (jsonStr.length > 500) {
      displayValue = jsonStr.substring(0, 500) + '\n... (truncado)';
    } else {
      displayValue = jsonStr;
    }
  } else {
    displayValue = String(value);
  }
  
  return [{
    label: fieldPath,
    value: displayValue,
    type: isComplex ? 'code' : 'text'
  }];
}

function formatExternalDomainEvidence(stepId: string, sourceData: unknown): EvidenceItem[] {
  const srcObj = (sourceData && typeof sourceData === 'object') ? (sourceData as Record<string, unknown>) : undefined;
  const data = srcObj?.data;

  try {
    if (stepId === 'ns_records') {
      // Accept multiple shapes:
      // - { data: { records: [{host, resolved_ips, resolved_ip_count}] } }
      // - { data: { records: ["ns1"] } }
      // - { data: { records: [{name}] } }
      // - { data: { records: [{value}] } }
      // - { data: { answers: [...] } } (fallback)
      const d = (data && typeof data === 'object') ? (data as Record<string, unknown>) : undefined;
      const records = d?.records ?? d?.answers;

      const evidence: EvidenceItem[] = [];
      const hosts: string[] = [];
      let totalUniqueIps = 0;

      if (Array.isArray(records)) {
        const allIps = new Set<string>();
        
        for (const r of records) {
          if (typeof r === 'string') {
            hosts.push(r);
          } else if (r && typeof r === 'object') {
            const o = r as Record<string, unknown>;
            const host = o.host ?? o.name ?? o.value;
            if (typeof host === 'string' && host.trim().length > 0) {
              hosts.push(host);
            }
            // Collect resolved IPs for total count
            const resolvedIps = o.resolved_ips;
            if (Array.isArray(resolvedIps)) {
              for (const ip of resolvedIps) {
                if (typeof ip === 'string') allIps.add(ip);
              }
            }
          }
        }
        
        totalUniqueIps = allIps.size;
      }

      if (hosts.length > 0) {
        evidence.push({ label: 'Nameservers encontrados', value: hosts.slice(0, 50).join(', '), type: 'text' });
      }
      // Nota: IPs resolvidos são usados internamente para cálculo de diversidade,
      // mas não são exibidos nas evidências pois a análise já indica isso.

      return evidence.length > 0
        ? evidence
        : [{ label: 'Nameservers', value: 'Nenhum NS retornado', type: 'text' }];
    }

    if (stepId === 'soa_record') {
      const d = (data && typeof data === 'object') ? (data as Record<string, unknown>) : undefined;
      const mname = d?.mname ?? d?.soa_mname;
      const contact = d?.contact_email ?? d?.soa_contact;
      return [
        { label: 'SOA mname', value: String(mname ?? 'N/A'), type: 'text' },
        { label: 'SOA contact', value: String(contact ?? 'N/A'), type: 'text' },
      ];
    }

    if (stepId === 'dnssec_status') {
      const d = (data && typeof data === 'object') ? (data as Record<string, unknown>) : undefined;
      const hasDnskey = d?.has_dnskey ?? d?.hasDnskey ?? d?.has_dns_key;
      const hasDs = d?.has_ds ?? d?.hasDs;
      const validated = d?.validated ?? d?.is_validated;
      const notes = d?.notes ?? d?.note;
      const notesText = Array.isArray(notes)
        ? notes.filter((n): n is string => typeof n === 'string').slice(0, 10).join(' | ')
        : '';
      return [
        { label: 'DNSKEY', value: String(hasDnskey ?? 'N/A'), type: 'text' },
        { label: 'DS', value: String(hasDs ?? 'N/A'), type: 'text' },
        { label: 'Validated', value: String(validated ?? 'N/A'), type: 'text' },
        ...(notesText ? [{ label: 'Notes', value: notesText, type: 'text' as const }] : []),
      ];
    }

    // ========== SPF RECORD ==========
    if (stepId === 'spf_record') {
      const d = (data && typeof data === 'object') ? (data as Record<string, unknown>) : undefined;
      const evidence: EvidenceItem[] = [];
      
      if (d?.raw) {
        evidence.push({ label: 'data.raw', value: String(d.raw), type: 'text' });
      }
      
      const parsed = d?.parsed as Record<string, unknown> | undefined;
      if (parsed) {
        if (parsed.includes && Array.isArray(parsed.includes)) {
          evidence.push({ label: 'data.parsed.includes', value: (parsed.includes as string[]).join(', '), type: 'text' });
        }
        if (parsed.all) {
          evidence.push({ label: 'data.parsed.all', value: String(parsed.all), type: 'text' });
        }
      }
      
      return evidence.length > 0 ? evidence : [];
    }

    // ========== DMARC RECORD ==========
    if (stepId === 'dmarc_record') {
      const d = (data && typeof data === 'object') ? (data as Record<string, unknown>) : undefined;
      const evidence: EvidenceItem[] = [];
      
      if (d?.raw) {
        evidence.push({ label: 'data.raw', value: String(d.raw), type: 'text' });
      }
      
      const parsed = d?.parsed as Record<string, unknown> | undefined;
      if (parsed) {
        if (parsed.p) {
          evidence.push({ label: 'data.parsed.p', value: String(parsed.p), type: 'text' });
        }
        if (parsed.sp) {
          evidence.push({ label: 'data.parsed.sp', value: String(parsed.sp), type: 'text' });
        }
        if (parsed.aspf) {
          evidence.push({ label: 'data.parsed.aspf', value: String(parsed.aspf), type: 'text' });
        }
        if (parsed.adkim) {
          evidence.push({ label: 'data.parsed.adkim', value: String(parsed.adkim), type: 'text' });
        }
        if (parsed.rua) {
          evidence.push({ label: 'data.parsed.rua', value: String(parsed.rua), type: 'text' });
        }
        if (parsed.ruf) {
          evidence.push({ label: 'data.parsed.ruf', value: String(parsed.ruf), type: 'text' });
        }
        if (parsed.pct !== undefined) {
          evidence.push({ label: 'data.parsed.pct', value: String(parsed.pct), type: 'text' });
        }
      }
      
      return evidence.length > 0 ? evidence : [];
    }

    // ========== DKIM RECORDS ==========
    if (stepId === 'dkim_records') {
      const d = (data && typeof data === 'object') ? (data as Record<string, unknown>) : undefined;
      const found = d?.found as Array<Record<string, unknown>> | undefined;
      
      if (Array.isArray(found) && found.length > 0) {
        // Return JSON representation for frontend to format
        return [{ label: 'data.found', value: JSON.stringify(found), type: 'code' }];
      }
      
      return [];
    }

    // ========== MX RECORDS ==========
    if (stepId === 'mx_records') {
      const d = (data && typeof data === 'object') ? (data as Record<string, unknown>) : undefined;
      const records = d?.records as Array<Record<string, unknown>> | undefined;
      
      if (Array.isArray(records) && records.length > 0) {
        // Return JSON representation for frontend to format
        return [{ label: 'data.records', value: JSON.stringify(records), type: 'code' }];
      }
      
      return [];
    }
  } catch (_e) {
    // fallthrough
  }

  return [];
}

function processComplianceRules(
  rawData: Record<string, unknown>,
  rules: ComplianceRule[],
  sourceKeyToEndpoint: Record<string, string> = defaultSourceKeyToEndpoint
): ComplianceResult {
  const checks: ComplianceCheck[] = [];
  
  for (const rule of rules) {
    const logic = normalizeEvaluationLogic(rule.evaluation_logic);
    
    // Mapear endpoint da API - usando mapeamento carregado do banco
    let apiEndpoint = getEndpointForSourceKey(sourceKeyToEndpoint, logic.source_key);
    // Fallback: usar api_endpoint da regra quando o mapeamento não encontra
    if (apiEndpoint === 'API do dispositivo' && rule.api_endpoint) {
      apiEndpoint = rule.api_endpoint;
    }
    
    // Para regras com alt_source_key (como log-002), listar ambos endpoints
    if (logic.alt_source_key) {
      const altEndpoint = getEndpointForSourceKey(sourceKeyToEndpoint, logic.alt_source_key);
      if (altEndpoint && altEndpoint !== 'API do dispositivo') {
        const primaryEndpoint = getEndpointForSourceKey(sourceKeyToEndpoint, logic.source_key);
        apiEndpoint = [primaryEndpoint, altEndpoint].filter(Boolean).join(' | ');
      }
    }
    
    // Get the source data
    const isExternalDnsStep = ['ns_records', 'soa_record', 'dnssec_status', 'spf_record', 'dmarc_record', 'dkim_records', 'mx_records'].includes(logic.source_key);
    const sourceData = isExternalDnsStep
      ? getStepPayload(rawData, logic.source_key)
      : rawData[logic.source_key];
    if (!sourceData) {
      checks.push({
        id: rule.code,
        name: rule.name,
        description: rule.description || rule.name,
        category: rule.category,
        severity: rule.severity,
        status: 'unknown',
        details: `Dados não disponíveis: ${logic.source_key}`,
        recommendation: rule.recommendation || undefined,
        weight: rule.weight,
        apiEndpoint,
        technicalRisk: rule.technical_risk || undefined,
        businessImpact: rule.business_impact || undefined,
      });
      continue;
    }

    // =====================================================
    // Generic typed evaluation (data-driven from DB)
    // Handles array_check, object_check, threshold_check
    // =====================================================
    const rawLogic = rule.evaluation_logic;
    const logicType = rawLogic?.type as string | undefined;
    if (logicType === 'array_check' || logicType === 'object_check' || logicType === 'threshold_check' || logicType === 'filtered_count_check') {
      const typedResult = evaluateTypedLogic(rawLogic, sourceData, rule, rawData as Record<string, unknown>);
      if (typedResult) {
        checks.push({
          id: rule.code,
          name: rule.name,
          description: rule.description || rule.name,
          category: rule.category,
          severity: rule.severity,
          status: typedResult.status === 'not_found' ? 'unknown' : typedResult.status,
          details: typedResult.details || '',
          recommendation: rule.recommendation || undefined,
          weight: rule.weight,
          evidence: typedResult.evidence.map(e => ({ label: e.field, value: e.value, type: 'text' as const })),
          rawData: { [logic.source_key]: sourceData },
          apiEndpoint,
          technicalRisk: rule.technical_risk || undefined,
          businessImpact: rule.business_impact || undefined,
        });
        continue;
      }
    }
    
    // Get the value at the field path
    const value = getNestedValue(sourceData as Record<string, unknown>, logic.field_path);
    
    // Evaluate conditions
    let status: 'pass' | 'fail' | 'warn' | 'unknown' = logic.default_result as 'pass' | 'fail' | 'warn' | 'unknown';
    
    for (const condition of logic.conditions) {
      const condResult = evaluateCondition(value, condition);
      if (condResult) {
        status = condResult as 'pass' | 'fail' | 'warn' | 'unknown';
        break;
      }
    }
    
    // Generate details message - use database fields first, then logic, then default
    let details = '';
    if (status === 'pass') {
      details = rule.pass_description || logic.pass_message || `Verificação aprovada`;
    } else if (status === 'fail' || status === 'warn') {
      details = rule.fail_description || logic.fail_message || `Valor atual: ${JSON.stringify(value)}`;
    } else {
      details = `Valor: ${JSON.stringify(value)}`;
    }
    
    // Use rule description or generate one
    const description = rule.description || rule.name;

    // =====================================================
    // External Domain - MX alias handling (Microsoft 365/Gmail)
    // If there is only 1 MX record, redundancy may exist behind the hostname
    // (A/AAAA resolves to multiple IPs). The agent now enriches each record with
    // resolved_ip_count/resolved_ips.
    // =====================================================
    if (logic.source_key === 'mx_records' && (rule.code === 'MX-002' || rule.code === 'MX-003')) {
      const records = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
      const single = records.length === 1 ? records[0] : undefined;
      const resolvedIpCount = typeof single?.resolved_ip_count === 'number'
        ? (single.resolved_ip_count as number)
        : (Array.isArray(single?.resolved_ips) ? (single!.resolved_ips as unknown[]).length : 0);

      const hasMultipleMx = records.length >= 2;
      const hasAliasRedundancy = records.length === 1 && resolvedIpCount >= 2;

      if (rule.code === 'MX-002') {
        // Redundância MX
        status = (hasMultipleMx || hasAliasRedundancy) ? 'pass' : 'fail';
        if (status === 'pass' && hasAliasRedundancy) {
          details = `MX único (hostname gerenciado) resolve para ${resolvedIpCount} IP(s). Redundância provida pelo provedor.`;
        }
      }

      if (rule.code === 'MX-003') {
        // Prioridades MX configuradas
        // Caso clássico: 2+ MX com prioridades distintas (já coberto pelo operador SQL)
        // Caso alias: 1 MX, mas com múltiplos IPs atrás do hostname => considerar adequado.
        if (hasAliasRedundancy) {
          status = 'pass';
          details = `MX único (hostname gerenciado) resolve para ${resolvedIpCount} IP(s). Prioridade/failover é gerenciado pelo provedor.`;
        }
      }
    }

    // =====================================================
    // External Domain - NS IP resolution handling
    // Para diversidade de nameservers, considerar não apenas
    // a quantidade de hostnames, mas também a quantidade
    // total de IPs únicos resolvidos.
    // =====================================================
    if (logic.source_key === 'ns_records' && (rule.code === 'DNS-003' || rule.code === 'DNS-004')) {
      const records = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
      
      // Coletar todos os IPs únicos de todos os nameservers
      const allIps = new Set<string>();
      for (const ns of records) {
        const ips = ns.resolved_ips;
        if (Array.isArray(ips)) {
          for (const ip of ips) {
            if (typeof ip === 'string') allIps.add(ip);
          }
        }
      }
      const totalUniqueIps = allIps.size;
      const nsCount = records.length;

      if (rule.code === 'DNS-003') {
        // Redundância de Nameservers (mínimo 2)
        // Passar se: 2+ NS hostnames OU 2+ IPs únicos atrás dos NS
        const hasMultipleNs = nsCount >= 2;
        const hasIpRedundancy = totalUniqueIps >= 2;
        status = (hasMultipleNs || hasIpRedundancy) ? 'pass' : 'fail';
        
        if (status === 'pass' && !hasMultipleNs && hasIpRedundancy) {
          details = `${nsCount} nameserver(s) resolvendo para ${totalUniqueIps} IP(s) únicos.`;
        }
      }

      if (rule.code === 'DNS-004') {
        // Diversidade de Nameservers (mínimo 3)
        // Passar se: 3+ NS hostnames OU 3+ IPs únicos atrás dos NS
        const hasMultipleNs = nsCount >= 3;
        const hasIpDiversity = totalUniqueIps >= 3;
        status = (hasMultipleNs || hasIpDiversity) ? 'pass' : 'fail';
        
        if (status === 'pass' && !hasMultipleNs && hasIpDiversity) {
          details = `${nsCount} nameserver(s) resolvendo para ${totalUniqueIps} IP(s) únicos.`;
        }
      }
    }
    
    // Gerar evidências usando formatadores especializados baseados no código da regra
    let evidence: EvidenceItem[] = [];
    let inboundResult: { evidence: EvidenceItem[], relevantPolicies: Array<Record<string, unknown>> } | null = null;
    let haHeartbeatResult: { evidence: EvidenceItem[], status: 'pass' | 'fail' | 'warn' | 'unknown', skipRawData: boolean } | null = null;
    let haSyncResult: { evidence: EvidenceItem[], status: 'pass' | 'fail' | 'warn' | 'unknown', skipRawData: boolean } | null = null;
    let haResult: { evidence: EvidenceItem[], status: 'pass' | 'fail' | 'warn' | 'unknown' } | null = null;
    let anyToAnyResult: { evidence: EvidenceItem[], vulnerablePolicies: Array<Record<string, unknown>> } | null = null;
    let utmResult: { evidence: EvidenceItem[], vulnerablePolicies: Array<Record<string, unknown>> } | null = null;
    let secResult: { evidence: EvidenceItem[], status?: 'pass' | 'fail' | 'warn' | 'unknown', skipRawData?: boolean, rawDataOverride?: Record<string, unknown> } | null = null;
    let intResult: { evidence: EvidenceItem[], vulnerableInterfaces: Array<Record<string, unknown>>, status: 'pass' | 'fail' | 'warn' } | null = null;
    let fwResult: { evidence: EvidenceItem[], firmwareInfo: Record<string, unknown>, status: 'pass' | 'fail' | 'warn' } | null = null;
    
    // Detectar regra e aplicar formatador apropriado
    if (rule.code === 'fw-001') {
      // Firmware Version
      fwResult = formatFirmwareEvidence(rawData);
      evidence = fwResult.evidence;
      status = fwResult.status;
      if (status === 'pass') {
        details = rule.pass_description || 'Firmware atualizado';
      } else if (status === 'warn') {
        details = rule.fail_description || 'Considerar atualização do firmware';
      } else {
        details = rule.fail_description || 'Firmware desatualizado';
      }
    } else if (rule.code === 'lic-001') {
      // FortiCare Support
      const forticareResult = formatFortiCareEvidence(rawData);
      evidence = forticareResult.evidence;
      status = forticareResult.status;
      if (status === 'pass') {
        details = rule.pass_description || 'Suporte FortiCare ativo';
      } else if (status === 'warn') {
        details = rule.fail_description || 'Suporte FortiCare expirando em breve';
      } else if (status === 'fail') {
        details = rule.fail_description || 'Suporte FortiCare expirado ou inativo';
      } else {
        details = 'Não foi possível verificar - dados indisponíveis';
      }
    } else if (rule.code === 'lic-002') {
      // FortiGuard Licenses
      const fortiguardResult = formatFortiGuardEvidence(rawData);
      evidence = fortiguardResult.evidence;
      status = fortiguardResult.status;
      if (status === 'pass') {
        details = rule.pass_description || 'Todas as licenças FortiGuard ativas';
      } else if (status === 'warn') {
        details = rule.fail_description || 'Uma ou mais licenças FortiGuard expiram em breve';
      } else if (status === 'fail') {
        details = rule.fail_description || 'Uma ou mais licenças FortiGuard expiradas ou inativas';
      } else {
        details = 'Não foi possível verificar - dados indisponíveis';
      }
    } else if (rule.code.startsWith('inb-')) {
      // Inbound Rules (inb-001, inb-002, inb-003)
      inboundResult = formatInboundRuleEvidence(rawData, rule.code);
      evidence = inboundResult.evidence;
      // Override status based on actual policy analysis
      if (inboundResult.relevantPolicies.length > 0) {
        status = 'fail';
        details = rule.fail_description || `${inboundResult.relevantPolicies.length} regra(s) vulnerável(is) encontrada(s)`;
      } else {
        status = 'pass';
        details = rule.pass_description || 'Nenhuma regra vulnerável encontrada';
      }
    } else if (rule.code === 'net-003') {
      // Regras Any-to-Any
      anyToAnyResult = formatAnyToAnyEvidence(rawData);
      evidence = anyToAnyResult.evidence;
      if (anyToAnyResult.vulnerablePolicies.length > 0) {
        status = 'fail';
        details = rule.fail_description || `${anyToAnyResult.vulnerablePolicies.length} regra(s) any-any detectada(s)`;
      } else {
        status = 'pass';
        details = rule.pass_description || 'Nenhuma regra any-any encontrada';
      }
    } else if (rule.code.startsWith('vpn-')) {
      // VPN rules (vpn-001, vpn-002, vpn-003)
      evidence = formatVPNEvidence(rawData, rule.code);
    } else if (rule.code.startsWith('log-')) {
      // Logging rules
      evidence = formatLoggingEvidence(rawData, rule.code);
    } else if (rule.code === 'ha-001') {
      // High Availability - Modo HA
      haResult = formatHAEvidence(rawData);
      evidence = haResult.evidence;
      status = haResult.status;
      if (status === 'pass') {
        details = rule.pass_description || 'HA configurado corretamente';
      } else if (status === 'fail') {
        details = rule.fail_description || 'HA não configurado (standalone)';
      } else {
        details = 'Dados de HA não disponíveis';
      }
    } else if (rule.code === 'ha-002') {
      // HA Session Sync - Sincronização de Sessões
      haSyncResult = formatHASessionSyncEvidence(rawData);
      evidence = haSyncResult.evidence;
      status = haSyncResult.status;
      if (status === 'pass') {
        details = rule.pass_description || 'Sincronização de sessões habilitada';
      } else if (status === 'fail') {
        details = rule.fail_description || 'Sincronização de sessões desabilitada';
      } else {
        details = 'HA não configurado';
      }
    } else if (rule.code === 'ha-003') {
      // HA Heartbeat - verificar apenas se HA está configurado
      haHeartbeatResult = formatHAHeartbeatEvidence(rawData);
      evidence = haHeartbeatResult.evidence;
      status = haHeartbeatResult.status;
      if (status === 'pass') {
        details = rule.pass_description || 'Múltiplos links de heartbeat configurados';
      } else if (status === 'fail') {
        details = rule.fail_description || 'Nenhum link de heartbeat configurado';
      } else if (status === 'warn') {
        details = 'Apenas 1 link de heartbeat configurado (ponto único de falha)';
      } else {
        details = 'HA não configurado';
      }
    } else if (rule.code === 'bkp-001') {
      // Backup - uses specialized formatter that returns status and backup type
      const backupResult = formatBackupEvidence(rawData);
      evidence = backupResult.evidence;
      
      // Determine status based on backup type
      if (backupResult.backupType === 'external') {
        status = 'pass';
        details = rule.pass_description || 'Backup automático externo configurado';
      } else if (backupResult.backupType === 'local') {
        status = 'warn';
        details = 'Backup apenas local configurado - não protege contra perda do equipamento';
      } else {
        status = 'fail';
        details = rule.fail_description || 'Nenhum backup automático configurado';
      }
    } else if (rule.code.startsWith('utm-')) {
      // UTM Security Profiles (utm-001, utm-004, utm-007, utm-009)
      utmResult = formatUTMSecurityProfileEvidence(rawData, rule.code);
      evidence = utmResult.evidence;
      // Override status based on actual policy analysis
      if (utmResult.vulnerablePolicies.length > 0) {
        status = 'fail';
        details = rule.fail_description || `${utmResult.vulnerablePolicies.length} política(s) sem perfil de segurança`;
      } else {
        status = 'pass';
        details = rule.pass_description || 'Todas as políticas com destino WAN possuem perfil';
      }
    } else if (rule.code.startsWith('sec-')) {
      // Security Policy rules (sec-001, sec-002, sec-003)
      secResult = formatSecurityPolicyEvidence(rawData, rule.code);
      if (secResult.evidence.length > 0) {
        evidence = secResult.evidence;
        if (secResult.status) {
          status = secResult.status;
          if (status === 'pass') {
            details = rule.pass_description || 'Configuração de segurança adequada';
          } else if (status === 'fail' || status === 'warn') {
            details = rule.fail_description || 'Verificar configuração de segurança';
          } else if (status === 'unknown') {
            details = 'Não foi possível verificar - dados indisponíveis';
          }
      }
    }
    } else if (rule.code.startsWith('int-')) {
      // Interface Security rules (int-001, int-002, int-003, int-004, int-005)
      intResult = formatInterfaceSecurityEvidence(rawData, rule.code);
      evidence = intResult.evidence;
      status = intResult.status;
      if (status === 'pass') {
        details = rule.pass_description || 'Nenhuma interface WAN com protocolo inseguro';
      } else {
        details = rule.fail_description || `${intResult.vulnerableInterfaces.length} interface(s) vulnerável(is)`;
      }
    } else if (rule.code === 'auth-001') {
      // LDAP com criptografia
      const ldapResult = formatLDAPEvidence(rawData);
      evidence = ldapResult.evidence;
      status = ldapResult.status;
      if (status === 'pass') {
        details = rule.pass_description || 'Todos os servidores LDAP com criptografia LDAPS';
      } else if (status === 'not_found') {
        details = rule.not_found_description || 'Nenhum servidor LDAP configurado';
      } else if (status === 'fail') {
        details = rule.fail_description || 'Servidores LDAP sem criptografia';
      } else {
        details = 'Não foi possível verificar - dados indisponíveis';
      }
    } else if (rule.code === 'auth-002') {
      // RADIUS
      const radiusResult = formatRADIUSEvidence(rawData);
      evidence = radiusResult.evidence;
      if (!radiusResult.hasServers) {
        status = 'not_found';
        details = rule.not_found_description || 'Nenhum servidor RADIUS configurado';
      } else {
        status = 'pass';
        details = rule.pass_description || `${(rawData['user_radius'] as Record<string, unknown>)?.results ? ((rawData['user_radius'] as Record<string, unknown>).results as Array<unknown>).length : 0} servidor(es) RADIUS configurado(s)`;
      }
    } else if (rule.code === 'auth-003') {
      // FSSO
      const fssoResult = formatFSSOEvidence(rawData);
      evidence = fssoResult.evidence;
      if (!fssoResult.hasAgents) {
        status = 'not_found';
        details = rule.not_found_description || 'Nenhum agente FSSO configurado';
      } else {
        status = 'pass';
        details = rule.pass_description || 'Agente(s) FSSO configurado(s)';
      }
    } else if (rule.code === 'auth-004') {
      // SAML
      const samlResult = formatSAMLEvidence(rawData);
      evidence = samlResult.evidence;
      if (!samlResult.hasProviders) {
        status = 'not_found';
        details = rule.not_found_description || 'Nenhum provedor SAML configurado';
      } else {
        status = 'pass';
        details = rule.pass_description || 'Provedor(es) SAML configurado(s)';
      }
    }
    // ========== EVIDÊNCIAS ESPECÍFICAS POR REGRA (External Domain) ==========
    
    // MX-001: Registro MX Configurado (só exchange)
    else if (rule.code === 'MX-001') {
      const mxData = sourceData as Record<string, unknown>;
      const records = (mxData?.data as Record<string, unknown>)?.records as Array<Record<string, unknown>> || [];
      if (records.length > 0) {
        const exchanges = records.map(r => String(r.exchange)).filter(Boolean);
        evidence = [{ 
          label: 'Servidores MX', 
          value: exchanges.join(', '), 
          type: 'text' 
        }];
      }
    }
    // MX-002: Redundância MX (exchange + IPs resolvidos + quantidade)
    else if (rule.code === 'MX-002') {
      const mxData = sourceData as Record<string, unknown>;
      const records = (mxData?.data as Record<string, unknown>)?.records as Array<Record<string, unknown>> || [];
      if (records.length > 0) {
        // Manter formato JSON para frontend renderizar com todos os campos
        evidence = [{ label: 'data.records', value: JSON.stringify(records), type: 'code' }];
      }
    }
    // MX-003: Prioridades MX (só exchange e priority)
    else if (rule.code === 'MX-003') {
      const mxData = sourceData as Record<string, unknown>;
      const records = (mxData?.data as Record<string, unknown>)?.records as Array<Record<string, unknown>> || [];
      if (records.length > 0) {
        const simplified = records.map(r => ({ exchange: r.exchange, priority: r.priority }));
        evidence = [{ label: 'data.records.simplified', value: JSON.stringify(simplified), type: 'code' }];
      }
    }
    // DKIM-001: DKIM Configurado (só quantidade de chaves)
    else if (rule.code === 'DKIM-001') {
      const dkimData = sourceData as Record<string, unknown>;
      const found = (dkimData?.data as Record<string, unknown>)?.found as Array<Record<string, unknown>> || [];
      evidence = [{ 
        label: 'Chaves DKIM Encontradas', 
        value: found.length > 0 ? `${found.length} chave(s) configurada(s)` : 'Nenhuma chave DKIM encontrada', 
        type: 'text' 
      }];
    }
    // DKIM-002: Tamanho da Chave DKIM (mostrar seletor + tamanho)
    else if (rule.code === 'DKIM-002') {
      const dkimData = sourceData as Record<string, unknown>;
      const found = (dkimData?.data as Record<string, unknown>)?.found as Array<Record<string, unknown>> || [];
      if (found.length > 0) {
        const keyInfo = found.map(k => `${k.selector || k.name}: ${k.key_size_bits || '?'} bits`).join(', ');
        evidence = [{ label: 'Tamanho das Chaves', value: keyInfo, type: 'text' }];
      } else {
        evidence = [{ label: 'Tamanho das Chaves', value: 'Nenhuma chave DKIM encontrada', type: 'text' }];
      }
    }
    // DKIM-003: Redundância DKIM (só nomes das chaves)
    else if (rule.code === 'DKIM-003') {
      const dkimData = sourceData as Record<string, unknown>;
      const found = (dkimData?.data as Record<string, unknown>)?.found as Array<Record<string, unknown>> || [];
      if (found.length > 0) {
        const keyNames = found.map(k => String(k.selector || k.name)).filter(Boolean);
        evidence = [{ label: 'Seletores DKIM', value: keyNames.join(', '), type: 'text' }];
      } else {
        evidence = [{ label: 'Seletores DKIM', value: 'Nenhum seletor encontrado', type: 'text' }];
      }
    }
    // DMARC-003: Relatórios RUA (só rua)
    else if (rule.code === 'DMARC-003') {
      const dmarcData = sourceData as Record<string, unknown>;
      const parsed = ((dmarcData?.data as Record<string, unknown>)?.parsed || {}) as Record<string, unknown>;
      const rua = parsed.rua;
      evidence = [{ 
        label: 'Relatórios (RUA)', 
        value: rua ? String(rua) : 'Não configurado', 
        type: 'text' 
      }];
    }
    // DMARC-005: Alinhamento SPF Estrito (só aspf)
    else if (rule.code === 'DMARC-005') {
      const dmarcData = sourceData as Record<string, unknown>;
      const parsed = ((dmarcData?.data as Record<string, unknown>)?.parsed || {}) as Record<string, unknown>;
      const aspf = parsed.aspf;
      evidence = [{ 
        label: 'data.parsed.aspf', 
        value: aspf ? String(aspf) : 'Não configurado (padrão: relaxado)', 
        type: 'text' 
      }];
    }
    // DMARC-006: Alinhamento DKIM Estrito (só adkim)
    else if (rule.code === 'DMARC-006') {
      const dmarcData = sourceData as Record<string, unknown>;
      const parsed = ((dmarcData?.data as Record<string, unknown>)?.parsed || {}) as Record<string, unknown>;
      const adkim = parsed.adkim;
      evidence = [{ 
        label: 'data.parsed.adkim', 
        value: adkim ? String(adkim) : 'Não configurado (padrão: relaxado)', 
        type: 'text' 
      }];
    }
    // SPF-003: Limite de DNS Lookups SPF
    else if (rule.code === 'SPF-003') {
      const spfData = sourceData as Record<string, unknown>;
      const parsed = ((spfData?.data as Record<string, unknown>)?.parsed || {}) as Record<string, unknown>;
      
      // Mecanismos que causam DNS lookups
      const includes = Array.isArray(parsed.includes) ? parsed.includes as string[] : [];
      const aMechanisms = Array.isArray(parsed.a) ? parsed.a as string[] : [];
      const mxMechanisms = Array.isArray(parsed.mx) ? parsed.mx as string[] : [];
      const existsMechanisms = Array.isArray(parsed.exists) ? parsed.exists as string[] : [];
      const redirect = parsed.redirect ? 1 : 0;
      
      // Contar total de lookups
      const totalLookups = includes.length + aMechanisms.length + mxMechanisms.length + existsMechanisms.length + redirect;
      
      // Montar lista de mecanismos que causam lookups
      const lookupMechanisms: string[] = [];
      if (includes.length > 0) {
        lookupMechanisms.push(`${includes.length} include(s)`);
      }
      if (aMechanisms.length > 0) {
        lookupMechanisms.push(`${aMechanisms.length} a`);
      }
      if (mxMechanisms.length > 0) {
        lookupMechanisms.push(`${mxMechanisms.length} mx`);
      }
      if (existsMechanisms.length > 0) {
        lookupMechanisms.push(`${existsMechanisms.length} exists`);
      }
      if (redirect) {
        lookupMechanisms.push(`1 redirect`);
      }
      
      if (totalLookups === 0) {
        evidence = [{
          label: 'Lookups DNS',
          value: 'Nenhum mecanismo que causa lookup DNS (apenas ip4/ip6)',
          type: 'text'
        }];
      } else {
        evidence = [{
          label: 'Lookups DNS',
          value: `${totalLookups} de 10 permitidos`,
          type: 'text'
        }, {
          label: 'Mecanismos',
          value: lookupMechanisms.join(', '),
          type: 'text'
        }];
      }
    }
    // DNS-003: Redundância de Nameservers (só hostnames, sem IPs resolvidos)
    else if (rule.code === 'DNS-003') {
      const nsData = sourceData as Record<string, unknown>;
      const records = (nsData?.data as Record<string, unknown>)?.records as Array<Record<string, unknown>> || [];
      if (records.length > 0) {
        const hosts = records.map(r => String(r.host || r.name || r.value)).filter(Boolean);
        evidence = [{ 
          label: 'Nameservers encontrados', 
          value: hosts.join(', '), 
          type: 'text' 
        }];
      } else {
        evidence = [{ label: 'Nameservers', value: 'Nenhum NS encontrado', type: 'text' }];
      }
    }
    // DNS-004: Diversidade de Nameservers (só hostnames, sem IPs resolvidos)
    else if (rule.code === 'DNS-004') {
      const nsData = sourceData as Record<string, unknown>;
      const records = (nsData?.data as Record<string, unknown>)?.records as Array<Record<string, unknown>> || [];
      if (records.length > 0) {
        const hosts = records.map(r => String(r.host || r.name || r.value)).filter(Boolean);
        evidence = [{ 
          label: 'Nameservers encontrados', 
          value: hosts.join(', '), 
          type: 'text' 
        }];
      } else {
        evidence = [{ label: 'Nameservers', value: 'Nenhum NS encontrado', type: 'text' }];
      }
    }
    else if (value !== undefined && value !== null) {
      // Fallback genérico com truncamento
      evidence = formatGenericEvidence(value, logic.field_path || rule.name);
    }

    // External Domain: default evidence for DNS steps
    if (evidence.length === 0 && isExternalDnsStep) {
      evidence = formatExternalDomainEvidence(logic.source_key, sourceData);
    }
    
    // Incluir dados brutos relevantes
    let checkRawData: Record<string, unknown> = {};
    
    // Para regras de licenciamento, incluir dados completos do license_status
    if (rule.code === 'lic-001' || rule.code === 'lic-002') {
      const licenseData = rawData['license_status'];
      if (licenseData) {
        checkRawData = { license_status: licenseData };
      }
    } else if (rule.code === 'bkp-001') {
      // Incluir dados de automação para backup
      checkRawData = {
        system_automation_stitch: rawData['system_automation_stitch'],
        system_automation_trigger: rawData['system_automation_trigger'],
        system_automation_action: rawData['system_automation_action']
      };
    } else if (rule.code.startsWith('inb-') && inboundResult && inboundResult.relevantPolicies.length > 0) {
      // Para regras de inbound, só incluir dados quando há regras vulneráveis
      checkRawData = {
        policies_vulneraveis: inboundResult.relevantPolicies.map(p => ({
          policyid: p.policyid,
          name: p.name,
          srcintf: p.srcintf,
          dstintf: p.dstintf,
          srcaddr: p.srcaddr,
          dstaddr: p.dstaddr,
          service: p.service,
          action: p.action,
          status: p.status
        }))
      };
    } else if (rule.code === 'net-003' && anyToAnyResult && anyToAnyResult.vulnerablePolicies.length > 0) {
      // Para net-003, só incluir rawData quando há policies any-any
      checkRawData = {
        policies_any_any: anyToAnyResult.vulnerablePolicies.map(p => ({
          policyid: p.policyid,
          name: p.name,
          srcaddr: p.srcaddr,
          dstaddr: p.dstaddr,
          service: p.service,
          action: p.action,
          status: p.status
        }))
      };
    } else if (rule.code === 'ha-001' && haResult && haResult.status !== 'unknown') {
      // Para ha-001, incluir dados de HA quando disponíveis
      const haData = rawData['system_ha'] as Record<string, unknown> | undefined;
      if (haData) {
        const results = haData.results as Record<string, unknown> || haData;
        checkRawData = {
          system_ha: {
            mode: results.mode,
            'group-name': results['group-name'],
            priority: results.priority
          }
        };
      }
    } else if (rule.code === 'ha-002' && haSyncResult && !haSyncResult.skipRawData) {
      // Para ha-002, incluir dados de sincronização de sessão quando HA está ativo
      const haData = rawData['system_ha'] as Record<string, unknown> | undefined;
      if (haData) {
        const results = haData.results as Record<string, unknown> || haData;
        checkRawData = {
          system_ha: {
            mode: results.mode,
            'session-pickup': results['session-pickup'],
            'session-pickup-nat': results['session-pickup-nat'],
            'session-pickup-connectionless': results['session-pickup-connectionless'],
            'session-pickup-expectation': results['session-pickup-expectation']
          }
        };
      }
    } else if (rule.code === 'ha-003' && haHeartbeatResult && !haHeartbeatResult.skipRawData) {
      // Para ha-003, incluir dados de HA apenas quando HA está configurado
      const haData = rawData['system_ha'] as Record<string, unknown> | undefined;
      if (haData) {
        const results = haData.results as Record<string, unknown> || haData;
        checkRawData = {
          system_ha: {
            mode: results.mode,
            hbdev: results.hbdev
          }
        };
      }
    } else if (rule.code === 'log-001') {
      // Para log-001, incluir configurações de log relevantes
      const logData = rawData['log_setting'] as Record<string, unknown> | undefined;
      if (logData) {
        const results = logData.results as Record<string, unknown> || logData;
        checkRawData = {
          log_setting: {
            'log-invalid-packet': results['log-invalid-packet'],
            'resolve-ip': results['resolve-ip'],
            'fwpolicy-implicit-log': results['fwpolicy-implicit-log'],
            'local-in-allow': results['local-in-allow'],
            'local-out': results['local-out'],
            'daemon-log': results['daemon-log']
          }
        };
      }
    } else if (rule.code === 'log-002') {
      // Para log-002, incluir dados de FortiAnalyzer e FortiCloud
      const fazData = rawData['log_fortianalyzer'] as Record<string, unknown> | undefined;
      const cloudData = rawData['log_fortiguard'] as Record<string, unknown> | undefined;
      
      const fazResults = fazData ? (fazData.results as Record<string, unknown> || fazData) : null;
      const cloudResults = cloudData ? (cloudData.results as Record<string, unknown> || cloudData) : null;
      
      checkRawData = {
        fortianalyzer: fazResults ? {
          status: fazResults.status,
          server: fazResults.server,
          enc_algorithm: fazResults['enc-algorithm'],
          ssl_min_proto_version: fazResults['ssl-min-proto-version']
        } : null,
        forticloud: cloudResults ? {
          status: cloudResults.status,
          upload_option: cloudResults['upload-option'],
          upload_interval: cloudResults['upload-interval']
        } : null
      };
    } else if (rule.code.startsWith('vpn-')) {
      // Para regras VPN, incluir dados específicos e resumidos
      if (rule.code === 'vpn-001') {
        const vpnData = rawData['vpn_ipsec_phase1'] || rawData['vpn_ipsec'];
        if (vpnData) {
          const results = ((vpnData as Record<string, unknown>).results || []) as Array<Record<string, unknown>>;
          checkRawData = {
            vpns_configuradas: results.map(vpn => ({
              name: vpn.name,
              proposal: vpn.proposal,
              ike_version: vpn['ike-version'],
              authmethod: vpn.authmethod,
              interface: vpn.interface,
              remote_gw: vpn['remote-gw']
            }))
          };
        }
      } else if (rule.code === 'vpn-003') {
        const sslData = rawData['vpn_ssl_settings'];
        if (sslData) {
          const results = (sslData as Record<string, unknown>).results as Record<string, unknown> || sslData;
          checkRawData = {
            ssl_vpn_config: {
              servercert: results.servercert,
              status: results.status,
              algorithm: results.algorithm
            }
          };
        }
      }
    } else if (rule.code.startsWith('utm-') && utmResult && utmResult.vulnerablePolicies.length > 0) {
      // Para regras UTM, só incluir rawData quando há políticas sem perfil
      // IPS/IDS (utm-001) usa srcintf; outros UTM usam dstintf
      const checkSource = rule.code === 'utm-001';
      checkRawData = {
        policies_sem_perfil: utmResult.vulnerablePolicies.map(p => ({
          policyid: p.policyid,
          name: p.name,
          ...(checkSource 
            ? { srcintf: (p.srcintf as Array<Record<string, unknown>> || []).map(i => i.name || i.q_origin_key) }
            : { dstintf: (p.dstintf as Array<Record<string, unknown>> || []).map(i => i.name || i.q_origin_key) }
          )
        }))
      };
    } else if (rule.code.startsWith('sec-') && secResult && !secResult.skipRawData) {
      // Para regras sec-*, usar rawDataOverride se disponível (campos relevantes apenas)
      if (secResult.rawDataOverride) {
        checkRawData = secResult.rawDataOverride;
      } else {
        // Fallback para dados completos (não deve acontecer com as novas regras)
        const sourceKey = logic.source_key || '';
        const data = rawData[sourceKey];
        if (data) {
          checkRawData[sourceKey] = data;
        }
      }
    } else if (rule.code.startsWith('int-') && intResult && intResult.vulnerableInterfaces.length > 0) {
      // Para regras de interface, só incluir rawData quando há interfaces vulneráveis
      checkRawData = {
        interfaces_vulneraveis: intResult.vulnerableInterfaces.map(i => ({
          name: i.name,
          role: i.role,
          allowaccess: i.allowaccess
        }))
      };
    } else if (rule.code.startsWith('auth-')) {
      // Para regras de autenticação, incluir apenas dados relevantes
      const authSourceMap: Record<string, string> = {
        'auth-001': 'user_ldap',
        'auth-002': 'user_radius',
        'auth-003': 'user_fsso',
        'auth-004': 'user_saml'
      };
      const sourceKey = authSourceMap[rule.code];
      if (sourceKey) {
        const sourceData = rawData[sourceKey] as Record<string, unknown> | undefined;
        if (sourceData) {
          const results = (sourceData.results || []) as Array<Record<string, unknown>>;
          checkRawData = {
            [sourceKey]: {
              count: results.length,
              servers: results.map(s => ({
                name: s.name,
                server: s.server,
                port: s.port || s['radius-port'],
                ...(rule.code === 'auth-001' ? { secure: s.secure } : {}),
                ...(rule.code === 'auth-004' ? { 'idp-single-sign-on-url': s['idp-single-sign-on-url'] } : {})
              }))
            }
          };
        }
      }
    } else if (rule.code === 'fw-001' && fwResult) {
      // Para regra de firmware, incluir dados do sistema
      checkRawData = {
        firmware: fwResult.firmwareInfo
      };
    } else if (isExternalDnsStep) {
      // External Domain: include small raw snapshot to enable "Dados brutos" in UI
      const src = sourceData as Record<string, unknown>;
      const stepData = (src && typeof src === 'object') ? src.data : undefined;
      checkRawData = {
        step_id: logic.source_key,
        field_path: logic.field_path,
        data: stepData ?? sourceData,
      };
    } else if (!rule.code.startsWith('inb-') && !rule.code.startsWith('vpn-') && !rule.code.startsWith('utm-') && !rule.code.startsWith('sec-') && !rule.code.startsWith('int-') && !rule.code.startsWith('fw-') && !rule.code.startsWith('auth-') && rule.code !== 'net-003' && rule.code !== 'ha-003' && logic.field_path && value !== undefined) {
      // Para outras regras (exceto inbound, VPN, UTM, sec-*, int-*, fw-*, auth-*, net-003, ha-003), incluir dados brutos genéricos
      checkRawData[logic.field_path] = value;
    }
    // Nota: regras inb-*, utm-*, sec-*, int-*, fw-*, auth-*, net-003 e ha-003 só têm rawData quando há políticas/interfaces vulneráveis ou dados relevantes (tratado acima)
    
    checks.push({
      id: rule.code,
      name: rule.name,
      description,
      category: rule.category,
      severity: rule.severity,
      status,
      details,
      recommendation: status !== 'pass' ? (rule.recommendation || undefined) : undefined,
      weight: rule.weight,
      evidence: evidence.length > 0 ? evidence : undefined,
      rawData: Object.keys(checkRawData).length > 0 ? checkRawData : undefined,
      apiEndpoint,
      technicalRisk: status !== 'pass' ? (rule.technical_risk || undefined) : undefined,
      businessImpact: status !== 'pass' ? (rule.business_impact || undefined) : undefined,
    });
  }
  
  // Calculate score
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const passedWeight = checks
    .filter(check => check.status === 'pass')
    .reduce((sum, check) => sum + check.weight, 0);
  const warnWeight = checks
    .filter(check => check.status === 'warn')
    .reduce((sum, check) => sum + (check.weight * 0.5), 0);
  
  const score = totalWeight > 0 
    ? Math.round(((passedWeight + warnWeight) / totalWeight) * 100)
    : 0;
  
  // Group by category
  const categories: Record<string, ComplianceCheck[]> = {};
  for (const check of checks) {
    if (!categories[check.category]) {
      categories[check.category] = [];
    }
    categories[check.category].push(check);
  }
  
  // Extract system info if available
  const systemInfo: Record<string, unknown> = {};
  const systemStatus = rawData['system_status'] as Record<string, unknown> | undefined;
  const systemFirmware = rawData['system_firmware'] as Record<string, unknown> | undefined;
  
  // ===== SonicWall specific parsing =====
  const versionData = rawData['version'] as Record<string, unknown> | undefined;
  if (versionData) {
    // SonicWall returns version info directly at root level
    if (versionData.serial_number) systemInfo.serial = versionData.serial_number;
    if (versionData.model) systemInfo.model = versionData.model;
    if (versionData.firmware_version) systemInfo.firmware = versionData.firmware_version;
    if (versionData.system_uptime && typeof versionData.system_uptime === 'string') {
      systemInfo.uptime = parseUptimeString(versionData.system_uptime);
    }
    console.log('SonicWall version data found:', JSON.stringify(versionData));
  }
  
  // ===== FortiGate specific parsing =====
  // Try to get system info from multiple sources
  // FortiGate API returns: { serial, version at root level, results: { hostname, model, uptime } }
  if (systemStatus) {
    // Fields at root level of system_status
    if (!systemInfo.serial) systemInfo.serial = systemStatus.serial;
    if (!systemInfo.firmware) systemInfo.version = systemStatus.version;
    
    // Fields inside results
    if (systemStatus.results) {
      const results = systemStatus.results as Record<string, unknown>;
      if (!systemInfo.hostname) systemInfo.hostname = results.hostname;
      if (!systemInfo.model) systemInfo.model = results.model || results.model_name;
    }
  }
  
  // Try to get uptime from webui_state endpoint (more reliable source for FortiGate)
  const webuiState = rawData['webui_state'] as Record<string, unknown> | undefined;
  if (webuiState?.results) {
    const results = webuiState.results as Record<string, unknown>;
    
    // Calculate uptime from utc_last_reboot and snapshot_utc_time (both in milliseconds)
    const lastReboot = results.utc_last_reboot as number | undefined;
    const snapshotTime = results.snapshot_utc_time as number | undefined;
    
    if (typeof lastReboot === 'number' && typeof snapshotTime === 'number' && !systemInfo.uptime) {
      const uptimeSec = Math.floor((snapshotTime - lastReboot) / 1000);
      const days = Math.floor(uptimeSec / 86400);
      const hours = Math.floor((uptimeSec % 86400) / 3600);
      const minutes = Math.floor((uptimeSec % 3600) / 60);
      systemInfo.uptime = days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`;
      console.log(`Calculated uptime: ${systemInfo.uptime} from reboot=${lastReboot}, snapshot=${snapshotTime}`);
    }
    
    // Also get serial/hostname from here if not already set
    if (!systemInfo.serial && results.serial) {
      systemInfo.serial = results.serial;
    }
    if (!systemInfo.hostname && results.hostname) {
      systemInfo.hostname = results.hostname;
    }
  }
  
  // Extract firmware version from multiple possible sources
  let firmwareVersion = '';
  
  // Source 1: system_status.results.version
  if (systemStatus?.results) {
    const results = systemStatus.results as Record<string, unknown>;
    firmwareVersion = extractFirmwareVersion(results.version);
  }
  
  // Source 2: system_firmware - multiple paths
  if (!firmwareVersion && systemFirmware) {
    const fwObj = systemFirmware as Record<string, unknown>;
    
    // Direct version field (most common in FortiOS API responses)
    if (fwObj.version) {
      firmwareVersion = extractFirmwareVersion(fwObj.version);
    }
    
    // Nested: results.current.version or current.version
    if (!firmwareVersion) {
      const resultsObj = fwObj.results as Record<string, unknown> | undefined;
      const current = (fwObj.current || resultsObj?.current) as Record<string, unknown> | undefined;
      if (current?.version) {
        firmwareVersion = extractFirmwareVersion(current.version);
      }
    }
    
    // Nested: results.version
    if (!firmwareVersion && fwObj.results) {
      const resultsObj = fwObj.results as Record<string, unknown>;
      if (resultsObj.version) {
        firmwareVersion = extractFirmwareVersion(resultsObj.version);
      }
    }
  }
  
  // Source 3: Check raw_data for any version-like field
  if (!firmwareVersion) {
    for (const [key, value] of Object.entries(rawData)) {
      if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>;
        // Check results.version pattern
        if (obj.results && typeof obj.results === 'object') {
          const results = obj.results as Record<string, unknown>;
          if (results.version) {
            firmwareVersion = extractFirmwareVersion(results.version);
            if (firmwareVersion) break;
          }
        }
        // Check direct version field
        if (obj.version) {
          firmwareVersion = extractFirmwareVersion(obj.version);
          if (firmwareVersion) break;
        }
      }
    }
  }
  
  // Fallback: extract from systemInfo.firmware (e.g. SonicWall stores "SonicOS 7.3.0-7012")
  if (!firmwareVersion && systemInfo.firmware) {
    firmwareVersion = extractFirmwareVersion(systemInfo.firmware as string);
  }

  console.log(`Extracted firmware version: "${firmwareVersion}" from raw data`);

  // External Domain: lightweight DNS summary for the report header card
  const dnsSummary: ComplianceResult['dns_summary'] | undefined = (() => {
    const ns = getStepPayload(rawData, 'ns_records');
    const soa = getStepPayload(rawData, 'soa_record');
    const dnssec = getStepPayload(rawData, 'dnssec_status');

    const nsRecords = (ns?.data as any)?.records ?? (ns?.data as any)?.answers;
    const nsHosts = Array.isArray(nsRecords)
      ? (nsRecords as any[])
          .map((r) => {
            if (typeof r === 'string') return r;
            const host = r?.host ?? r?.name ?? r?.value;
            return typeof host === 'string' ? host : undefined;
          })
          .filter((h: any) => typeof h === 'string')
      : undefined;

    const soaMname = typeof (soa?.data as any)?.mname === 'string' ? (soa?.data as any).mname : null;
    const soaContact = typeof (soa?.data as any)?.contact_email === 'string' ? (soa?.data as any).contact_email : null;

    const dnssecHasDnskey = typeof (dnssec?.data as any)?.has_dnskey === 'boolean' ? (dnssec?.data as any).has_dnskey : undefined;
    const dnssecHasDs = typeof (dnssec?.data as any)?.has_ds === 'boolean' ? (dnssec?.data as any).has_ds : undefined;
    const dnssecValidated = typeof (dnssec?.data as any)?.validated === 'boolean' ? (dnssec?.data as any).validated : undefined;
    const dnssecNotes = Array.isArray((dnssec?.data as any)?.notes)
      ? ((dnssec?.data as any).notes as any[]).filter((n) => typeof n === 'string')
      : undefined;

    const hasAny = !!(
      nsHosts?.length ||
      soaMname ||
      soaContact ||
      dnssecHasDnskey !== undefined ||
      dnssecHasDs !== undefined ||
      dnssecValidated !== undefined ||
      (dnssecNotes && dnssecNotes.length)
    );
    if (!hasAny) return undefined;

    return {
      ns: nsHosts,
      soa_mname: soaMname,
      soa_contact: soaContact,
      dnssec_has_dnskey: dnssecHasDnskey,
      dnssec_has_ds: dnssecHasDs,
      dnssec_validated: dnssecValidated,
      dnssec_notes: dnssecNotes,
    };
  })();

  // External Domain: subdomain enumeration summary (Amass)
  const subdomainSummary: SubdomainSummary | undefined = (() => {
    const amassStep = getStepPayload(rawData, 'subdomain_enum');
    if (!amassStep?.data) return undefined;

    const data = amassStep.data as Record<string, unknown>;
    const subdomains = Array.isArray(data.subdomains) ? data.subdomains : [];
    const totalFound = typeof data.total_found === 'number' ? data.total_found : subdomains.length;
    const sources = Array.isArray(data.sources) ? data.sources.filter((s: unknown) => typeof s === 'string') : [];
    const mode = typeof data.mode === 'string' ? data.mode : 'passive';

    if (totalFound === 0 && subdomains.length === 0) return undefined;

    // Normalize subdomain entries - supports both old (addresses) and new (ips) formats
    const normalizedSubdomains: SubdomainEntry[] = subdomains
      .filter((s: unknown) => s && typeof s === 'object')
      .map((s: unknown) => {
        const sub = s as Record<string, unknown>;
        
        // Support new format: "ips" array of strings from Python agent
        let addresses: Array<{ ip: string; type?: string }> = [];
        if (Array.isArray(sub.ips)) {
          // New format: ips is an array of IP strings
          addresses = (sub.ips as string[])
            .filter((ip) => typeof ip === 'string' && ip.length > 0)
            .map((ip) => ({ ip, type: ip.includes(':') ? 'AAAA' : 'A' }));
        } else if (Array.isArray(sub.addresses)) {
          // Old format: addresses is an array of objects
          addresses = (sub.addresses as Array<Record<string, unknown>>).map((addr) => ({
            ip: typeof addr.ip === 'string' ? addr.ip : (typeof addr.address === 'string' ? addr.address : ''),
            type: typeof addr.type === 'string' ? addr.type : undefined,
          }));
        }
        
        return {
          subdomain: typeof sub.subdomain === 'string' ? sub.subdomain : (typeof sub.name === 'string' ? sub.name : ''),
          sources: Array.isArray(sub.sources) ? sub.sources.filter((src: unknown) => typeof src === 'string') : [],
          addresses,
          is_alive: typeof sub.is_alive === 'boolean' ? sub.is_alive : undefined,
        };
      })
      .filter((s: SubdomainEntry) => s.subdomain.length > 0);

    return {
      total_found: totalFound,
      subdomains: normalizedSubdomains,
      sources: sources as string[],
      mode,
    };
  })();
  
  return {
    score,
    checks,
    categories,
    system_info: Object.keys(systemInfo).length > 0 ? systemInfo : undefined,
    firmwareVersion: firmwareVersion || undefined,
    ...(dnsSummary ? { dns_summary: dnsSummary } : {}),
    ...(subdomainSummary ? { subdomain_summary: subdomainSummary } : {}),
  };
}

// ============================================
// Attack Surface Task Result Handler
// ============================================

async function handleAttackSurfaceTaskResult(
  supabase: ReturnType<typeof createClient>,
  body: TaskResultRequest,
  asTask: { id: string; assigned_agent_id: string | null; status: string; snapshot_id: string; ip: string; result: any },
  corsHeaders: Record<string, string>,
  agentId: string,
): Promise<Response> {
  const dbStatus = body.status === 'completed' ? 'completed' : 'failed';

  // Merge any result data from the final report into existing step results
  const currentResult = asTask.result || {};
  const finalResult = body.result ? { ...currentResult, ...(body.result as Record<string, unknown>) } : currentResult;

  // Consolidate step data into the format expected by snapshot consolidation
  // Extract ports/services/web from step results
  const masscanData = finalResult.masscan_discovery?.data || finalResult.masscan_discovery || {};
  const nmapData = finalResult.nmap_fingerprint?.data || finalResult.nmap_fingerprint || {};
  const httpxData = finalResult.httpx_webstack?.data || finalResult.httpx_webstack || {};

  const consolidatedResult: Record<string, any> = {
    ports: masscanData.ports || [],
    services: nmapData.services || [],
    os: nmapData.os || '',
    hostnames: nmapData.hostnames || [],
    web_services: httpxData.web_services || httpxData.results || [],
    vulns: nmapData.vulns || [],
    raw_steps: finalResult,
  };

  const updateData: Record<string, any> = {
    status: dbStatus,
    completed_at: new Date().toISOString(),
    result: consolidatedResult,
  };

  if (body.error_message) {
    updateData.result = { ...consolidatedResult, error: body.error_message };
  }

  await supabase
    .from('attack_surface_tasks')
    .update(updateData)
    .eq('id', body.task_id);

  console.log(`[attack-surface] Task ${body.task_id} (ip: ${asTask.ip}) -> ${dbStatus}`);

  // Check if all tasks for this snapshot are done
  const { count: pendingCount } = await supabase
    .from('attack_surface_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('snapshot_id', asTask.snapshot_id)
    .in('status', ['pending', 'assigned', 'running']);

  if ((pendingCount || 0) === 0) {
    console.log(`[attack-surface] All tasks for snapshot ${asTask.snapshot_id} completed. Triggering consolidation (fire-and-forget)...`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Fire-and-forget: trigger consolidation without blocking the response
    fetch(`${supabaseUrl}/functions/v1/consolidate-attack-surface`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ snapshot_id: asTask.snapshot_id }),
    }).catch(err => console.error('[attack-surface] fire-and-forget consolidation failed:', err.message));
  } else {
    await supabase
      .from('attack_surface_snapshots')
      .update({ status: 'running' })
      .eq('id', asTask.snapshot_id)
      .eq('status', 'pending');
  }

  return new Response(
    JSON.stringify({ success: true, task_id: body.task_id, status: dbStatus, has_more_tasks: false } as TaskResultSuccessResponse),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ============================================
// Main Handler
// ============================================

serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Extract Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Token de autorização ausente ou inválido', code: 'INVALID_TOKEN' } as TaskResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Decode token to get the agent_id (sub claim)
    let tokenPayload: { sub?: string; exp?: number };
    try {
      const [, payloadBase64] = decode(token);
      tokenPayload = payloadBase64 as { sub?: string; exp?: number };
    } catch (decodeError) {
      console.error('Failed to decode token:', decodeError);
      return new Response(
        JSON.stringify({ error: 'Token inválido', code: 'INVALID_TOKEN' } as TaskResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentId = tokenPayload.sub;
    if (!agentId) {
      console.log('Token does not contain agent ID (sub claim)');
      return new Response(
        JSON.stringify({ error: 'Token não contém identificação do agent', code: 'INVALID_TOKEN' } as TaskResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch agent data
    const { data: agent, error: fetchError } = await supabase
      .from('agents')
      .select('id, jwt_secret, revoked')
      .eq('id', agentId)
      .single();

    if (fetchError || !agent) {
      console.log('Agent not found:', agentId);
      return new Response(
        JSON.stringify({ error: 'Agent não encontrado', code: 'INVALID_TOKEN' } as TaskResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if agent is revoked
    if (agent.revoked) {
      console.log('Agent is blocked:', agentId);
      return new Response(
        JSON.stringify({ error: 'Agent bloqueado', code: 'BLOCKED' } as TaskResultErrorResponse),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if agent has jwt_secret (is registered)
    if (!agent.jwt_secret) {
      console.log('Agent is not registered (no jwt_secret):', agentId);
      return new Response(
        JSON.stringify({ error: 'Agent desregistrado', code: 'UNREGISTERED' } as TaskResultErrorResponse),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check token expiration
    if (tokenPayload.exp && tokenPayload.exp < Math.floor(Date.now() / 1000)) {
      console.log('Token has expired:', agentId);
      return new Response(
        JSON.stringify({ error: 'Token expirado', code: 'TOKEN_EXPIRED' } as TaskResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the token signature
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(agent.jwt_secret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      await verify(token, cryptoKey);
    } catch (verifyError) {
      console.error('Token signature verification failed:', verifyError);
      return new Response(
        JSON.stringify({ error: 'Assinatura do token inválida', code: 'INVALID_SIGNATURE' } as TaskResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: TaskResultRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Corpo da requisição inválido', code: 'INTERNAL_ERROR' } as TaskResultErrorResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    if (!body.task_id || !body.status) {
      return new Response(
        JSON.stringify({ error: 'task_id e status são obrigatórios', code: 'INTERNAL_ERROR' } as TaskResultErrorResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the task to verify ownership
    const { data: task, error: taskError } = await supabase
      .from('agent_tasks')
      .select('id, agent_id, task_type, target_id, target_type, status, payload')
      .eq('id', body.task_id)
      .single();

    if (taskError || !task) {
      // Fallback: check attack_surface_tasks for Super Agent tasks
      const { data: asTask, error: asError } = await supabase
        .from('attack_surface_tasks')
        .select('id, assigned_agent_id, status, snapshot_id, ip, result')
        .eq('id', body.task_id)
        .maybeSingle();

      if (!asError && asTask) {
        // Verify agent owns this attack surface task
        if (asTask.assigned_agent_id !== agentId) {
          return new Response(
            JSON.stringify({ error: 'Tarefa não pertence a este agent', code: 'FORBIDDEN' } as TaskResultErrorResponse),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return await handleAttackSurfaceTaskResult(supabase, body, asTask, corsHeaders, agentId);
      }

      console.log('Task not found in agent_tasks or attack_surface_tasks:', body.task_id);
      return new Response(
        JSON.stringify({ error: 'Tarefa não encontrada', code: 'NOT_FOUND' } as TaskResultErrorResponse),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify agent owns this task
    if (task.agent_id !== agentId) {
      console.log('Agent does not own this task:', { agentId, taskAgentId: task.agent_id });
      return new Response(
        JSON.stringify({ error: 'Tarefa não pertence a este agent', code: 'FORBIDDEN' } as TaskResultErrorResponse),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map status to database enum
    const dbStatus = body.status === 'completed' ? 'completed' 
                   : body.status === 'failed' ? 'failed' 
                   : body.status === 'timeout' ? 'timeout'
                   : body.status === 'partial' ? 'failed'
                   : 'failed';

    let complianceResult: ComplianceResult | null = null;
    let firewallName: string | null = null;

    // Determine raw data source:
    // 1. If body.result is provided (legacy batch mode), use it directly
    // 2. If no body.result (progressive mode), reconstruct from task_step_results
    let rawData: Record<string, unknown> | null = null;

    if (body.result) {
      // Legacy batch mode - agent sent all data in one payload
      rawData = body.result as Record<string, unknown>;
      console.log(`Using legacy batch mode data for task ${body.task_id}`);
    } else if (body.status === 'completed' || body.status === 'partial') {
      // Progressive mode - reconstruct raw_data from task_step_results
      console.log(`Reconstructing data from step results for task ${body.task_id}`);
      
      const { data: stepResults, error: stepError } = await supabase
        .from('task_step_results')
        .select('step_id, data, status')
        .eq('task_id', body.task_id);

      if (stepError) {
        console.error('Failed to fetch step results:', stepError);
      } else if (stepResults && stepResults.length > 0) {
        rawData = {};
        for (const step of stepResults) {
          if (step.status === 'success') {
            if (step.data) {
              // The step.data might be wrapped as { [step_id]: { data: ..., success: true } }
              // or directly as { data: ..., success: true }
              const stepData = step.data as Record<string, unknown>;
              
              // Check if data is wrapped with step_id key (e.g., { "exo_dkim_config": { ... } })
              if (stepData && typeof stepData === 'object' && !Array.isArray(stepData) && step.step_id in stepData && typeof stepData[step.step_id] === 'object') {
                // Unwrap: use the inner object
                rawData[step.step_id] = stepData[step.step_id];
              } else {
                // Already in correct format
                rawData[step.step_id] = stepData;
              }
            } else {
              // Step succeeded but returned null/empty data (e.g., no connectors configured)
              // Treat as empty array so evaluators can produce a 'pass' result
              rawData[step.step_id] = { data: [] };
              console.log(`Step ${step.step_id} succeeded with null data, treating as empty array`);
            }
          } else if (step.status === 'not_applicable' || step.status === 'failed') {
            // Propagate step status metadata so insight generator knows why data is missing
            rawData[`_step_status_${step.step_id}`] = step.status;
          }
        }
        console.log(`Reconstructed raw_data from ${stepResults.length} steps, ${Object.keys(rawData).length} successful`);
      }
    }

    // ========================================================
    // External Domain: Invoke server-side subdomain enumeration
    // This runs subdomain discovery from the Supabase Edge environment
    // to avoid DNS masking and firewall blocking issues on client networks
    // ========================================================
    if ((body.status === 'completed' || body.status === 'partial') && task.target_type === 'external_domain' && rawData) {
      // Get domain from task payload
      const taskPayload = task.payload as Record<string, unknown> | null;
      const domain = taskPayload?.domain as string | undefined;
      
      if (domain) {
        console.log(`[external_domain] Invoking server-side subdomain enumeration for ${domain}`);
        
        try {
          const subdomainEnumUrl = `${supabaseUrl}/functions/v1/subdomain-enum`;
          const subdomainResponse = await fetch(subdomainEnumUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ domain, timeout: 20 }),
          });
          
          if (subdomainResponse.ok) {
            const subdomainResult = await subdomainResponse.json();
            console.log(`[external_domain] Subdomain enum completed: ${subdomainResult.total_found} found, ${subdomainResult.alive_count} alive`);
            
            // Inject subdomain data into rawData as if it came from an agent step
            rawData['subdomain_enum'] = {
              data: subdomainResult,
            };
          } else {
            const errorText = await subdomainResponse.text();
            console.error(`[external_domain] Subdomain enum failed: ${subdomainResponse.status} - ${errorText}`);
          }
        } catch (subdomainError) {
          console.error(`[external_domain] Subdomain enum error:`, subdomainError);
          // Continue without subdomain data - the DNS records will still be processed
        }
      } else {
        console.log(`[external_domain] No domain in task payload, skipping subdomain enumeration`);
      }
    }

    // ========================================================
    // External Domain: Extract WHOIS data from agent step result
    // and update the external_domains table
    // ========================================================
    if (rawData && rawData['domain_whois']) {
      const whoisStep = rawData['domain_whois'] as Record<string, unknown>;
      const whoisData = (whoisStep?.data || whoisStep) as Record<string, unknown>;
      
      if (whoisData?.registrar || whoisData?.expires_at || whoisData?.owner) {
        console.log(`[external_domain] Updating WHOIS data: registrar=${whoisData.registrar}, expires=${whoisData.expires_at}`);
        
        const updateFields: Record<string, unknown> = {
          whois_checked_at: new Date().toISOString(),
        };
        if (whoisData.registrar) updateFields.whois_registrar = whoisData.registrar;
        if (whoisData.expires_at) updateFields.whois_expires_at = whoisData.expires_at;
        if (whoisData.created_at) updateFields.whois_created_at = whoisData.created_at;
        
        const { error: whoisUpdateError } = await supabase
          .from('external_domains')
          .update(updateFields)
          .eq('id', task.target_id);
        
        if (whoisUpdateError) {
          console.error(`[external_domain] Failed to update WHOIS data:`, whoisUpdateError);
        } else {
          console.log(`[external_domain] WHOIS data saved successfully for domain ${task.target_id}`);
        }
      } else {
        console.log(`[external_domain] domain_whois step returned no usable data`);
      }
    }

    // ========================================================
    // Firewall Analyzer: Process log data into security insights
    // ========================================================
    if ((body.status === 'completed' || body.status === 'partial') && task.task_type === 'fortigate_analyzer' && rawData) {
      const taskPayload = task.payload as Record<string, unknown> | null;
      const snapshotId = taskPayload?.snapshot_id as string | undefined;

      if (snapshotId) {
        console.log(`[fortigate_analyzer] Processing insights for snapshot: ${snapshotId}`);
        try {
          const analyzerUrl = `${supabaseUrl}/functions/v1/firewall-analyzer`;
          const analyzerResponse = await fetch(analyzerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ snapshot_id: snapshotId, task_id: body.task_id, raw_data: rawData }),
          });
          const analyzerResult = await analyzerResponse.json();
          console.log(`[fortigate_analyzer] Result: score=${analyzerResult.score}, insights=${analyzerResult.insights_count}`);
        } catch (e) {
          console.error(`[fortigate_analyzer] Error:`, e);
          await supabase.from('analyzer_snapshots').update({ status: 'failed' }).eq('id', snapshotId);
        }
      }
    }

    // ========================================================
    // M365 Analyzer: Process collected data into security insights
    // ========================================================
    if ((body.status === 'completed' || body.status === 'partial') && task.task_type === 'm365_analyzer' && rawData) {
      const taskPayload = task.payload as Record<string, unknown> | null;
      const snapshotId = taskPayload?.snapshot_id as string | undefined;

      if (snapshotId) {
        console.log(`[m365_analyzer] Processing insights for snapshot: ${snapshotId}`);
        try {
          const analyzerUrl = `${supabaseUrl}/functions/v1/m365-analyzer`;
          const analyzerResponse = await fetch(analyzerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify({ snapshot_id: snapshotId, task_id: body.task_id, raw_data: rawData }),
          });
          const analyzerResult = await analyzerResponse.json();
          console.log(`[m365_analyzer] Result: score=${analyzerResult.score}, insights=${analyzerResult.insights_count}`);
        } catch (e) {
          console.error(`[m365_analyzer] Error:`, e);
          await supabase.from('m365_analyzer_snapshots').update({ status: 'failed' }).eq('id', snapshotId);
        }
      } else {
        console.log(`[m365_analyzer] No snapshot_id in payload, marking as failed`);
      }
    }

    // ========================================================
    // M365 Tenant: Process agent-collected insights (Exchange, SharePoint)
    // This handles PowerShell-based data collected by the Python agent
    // ========================================================
    if ((body.status === 'completed' || body.status === 'partial') && task.target_type === 'm365_tenant' && rawData) {
      const taskPayload = task.payload as Record<string, unknown> | null;
      const analysisId = taskPayload?.analysis_id as string | undefined;
      
      if (analysisId) {
        console.log(`[m365_tenant] Processing agent insights for analysis: ${analysisId}`);
        
        try {
          // Load M365 compliance rules from database
          const { data: m365DeviceType } = await supabase
            .from('device_types')
            .select('id')
            .eq('code', 'm365')
            .eq('is_active', true)
            .single();

          const m365DeviceTypeId = m365DeviceType?.id;
          let m365Rules: ComplianceRule[] = [];
          if (m365DeviceTypeId) {
            const { data: rulesData } = await supabase
              .from('compliance_rules')
              .select('id, code, name, category, severity, description, recommendation, pass_description, fail_description, weight, evaluation_logic, technical_risk, business_impact, api_endpoint')
              .eq('device_type_id', m365DeviceTypeId)
              .eq('is_active', true);
            m365Rules = (rulesData || []) as unknown as ComplianceRule[];
          }

          // Filter to rules that have source_key in evaluation_logic (agent-evaluable rules)
          const agentRules = m365Rules.filter(r => {
            const el = r.evaluation_logic as Record<string, unknown>;
            return !!el?.source_key;
          });

          console.log(`[m365_tenant] Loaded ${agentRules.length} agent-evaluable rules from ${m365Rules.length} total`);

          // Transform raw PowerShell data into insights using DB rules
          const agentInsights = processM365AgentInsights(rawData, agentRules);
          
          // Fetch existing record to check if Graph API already saved its insights
          const { data: existingRecord } = await supabase
            .from('m365_posture_history')
            .select('insights, score, status')
            .eq('id', analysisId)
            .maybeSingle();

          const existingInsights = Array.isArray(existingRecord?.insights) ? existingRecord.insights : [];
          const graphApiHasData = existingInsights.length > 0;
          const graphApiCompleted = existingRecord?.status === 'partial' || existingRecord?.status === 'completed';

          console.log(`[m365_tenant] Race condition check: graphApiHasData=${graphApiHasData}, recordStatus=${existingRecord?.status}, existingInsights=${existingInsights.length}`);

          let updatePayload: Record<string, unknown>;

          if (graphApiHasData && graphApiCompleted) {
            // Graph API already saved — do the full merge and mark as completed
            const combinedInsights = [...existingInsights, ...agentInsights];

            const recalculatedSummary = {
              critical: combinedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'critical').length,
              high: combinedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'high').length,
              medium: combinedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'medium').length,
              low: combinedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'low').length,
              info: combinedInsights.filter((i: any) => i.severity === 'info').length,
              total: combinedInsights.length,
            };

            const applicableInsights = combinedInsights.filter((i: any) => i.status !== 'not_found');
            const totalChecks = applicableInsights.length;
            let totalPenalty = 0;
            for (const insight of applicableInsights) {
              const i = insight as any;
              if (i.status === 'fail') {
                const sevWeight = i.severity === 'critical' ? 4 : i.severity === 'high' ? 3 : i.severity === 'medium' ? 2 : 1;
                totalPenalty += sevWeight;
              }
            }
            const maxPenalty = totalChecks * 4;
            const recalculatedScore = maxPenalty > 0 
              ? Math.max(0, Math.round(100 - (totalPenalty / maxPenalty) * 100))
              : (existingRecord?.score ?? 100);

            updatePayload = {
              status: 'completed',
              completed_at: new Date().toISOString(),
              agent_insights: agentInsights,
              agent_status: 'completed',
              summary: recalculatedSummary,
              score: recalculatedScore,
            };
            console.log(`[m365_tenant] Graph API data present — merging and completing. Score: ${recalculatedScore}, total insights: ${combinedInsights.length}`);
          } else {
            // Graph API hasn't saved yet — only save agent data, do NOT mark as completed
            updatePayload = {
              agent_insights: agentInsights,
              agent_status: 'completed',
            };
            console.log(`[m365_tenant] Graph API not ready yet (status: ${existingRecord?.status}) — saving agent_insights only, NOT marking as completed`);
          }

          const { error: updateError } = await supabase
            .from('m365_posture_history')
            .update(updatePayload)
            .eq('id', analysisId);
          
          if (updateError) {
            console.error(`[m365_tenant] Failed to update posture history:`, updateError);
          } else {
            console.log(`[m365_tenant] Updated posture history ${analysisId} with agent insights`);
          }

          // Re-check after write: Edge Function may have set 'partial' between our read and write
          if (!graphApiCompleted) {
            const { data: recheck } = await supabase
              .from('m365_posture_history')
              .select('status, insights, score')
              .eq('id', analysisId)
              .maybeSingle();

            if (recheck?.status === 'partial' && Array.isArray(recheck.insights) && recheck.insights.length > 0) {
              console.log(`[m365_tenant] Re-check: Edge Function set partial during our write — merging now`);
              const combinedInsights = [...recheck.insights, ...agentInsights];
              const mergedSummary = {
                critical: combinedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'critical').length,
                high: combinedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'high').length,
                medium: combinedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'medium').length,
                low: combinedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'low').length,
                info: combinedInsights.filter((i: any) => i.severity === 'info').length,
                total: combinedInsights.length,
              };
              const applicable = combinedInsights.filter((i: any) => i.status !== 'not_found');
              const totalChecks = applicable.length;
              let penalty = 0;
              for (const ins of applicable) {
                const i = ins as any;
                if (i.status === 'fail') {
                  const w = i.severity === 'critical' ? 4 : i.severity === 'high' ? 3 : i.severity === 'medium' ? 2 : 1;
                  penalty += w;
                }
              }
              const maxP = totalChecks * 4;
              const mergedScore = maxP > 0 ? Math.max(0, Math.round(100 - (penalty / maxP) * 100)) : (recheck.score ?? 100);

              await supabase
                .from('m365_posture_history')
                .update({
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  summary: mergedSummary,
                  score: mergedScore,
                })
                .eq('id', analysisId);

              console.log(`[m365_tenant] Re-check merge complete. Score: ${mergedScore}, total: ${combinedInsights.length}`);
            }
          }
        } catch (e) {
          console.error(`[m365_tenant] Error processing agent insights:`, e);
          
          // Still update status even on error
          await supabase
            .from('m365_posture_history')
            .update({ agent_status: 'failed' })
            .eq('id', analysisId);
        }
      } else {
        console.log(`[m365_tenant] No analysis_id in task payload, skipping insights update`);
      }
    }

    // If task completed successfully and has raw data, process with compliance rules
    if ((body.status === 'completed' || body.status === 'partial') && rawData && task.task_type !== 'fortigate_analyzer') {
      let deviceTypeId: string | null = null;

      if (task.target_type === 'firewall') {
        // Get device_type_id and name from firewall
        const { data: firewall } = await supabase
          .from('firewalls')
          .select('device_type_id, name')
          .eq('id', task.target_id)
          .single();

        // Store firewall name for later use in alerts
        firewallName = firewall?.name || null;
        deviceTypeId = firewall?.device_type_id || null;

        // If no device_type_id, use default FortiGate
        if (!deviceTypeId) {
          const { data: defaultType } = await supabase
            .from('device_types')
            .select('id')
            .eq('code', 'fortigate')
            .eq('is_active', true)
            .single();

          deviceTypeId = defaultType?.id || null;
        }
      } else if (task.target_type === 'external_domain') {
        const { data: externalDomainType } = await supabase
          .from('device_types')
          .select('id')
          .eq('code', 'external_domain')
          .eq('is_active', true)
          .single();

        deviceTypeId = externalDomainType?.id || null;
      }

      if (deviceTypeId) {
        // Load source key endpoint mappings from database
        const endpointMappings = await loadSourceKeyEndpoints(supabase, deviceTypeId);

        // Fetch compliance rules for this device type
        const { data: rules } = await supabase
          .from('compliance_rules')
          .select('id, code, name, category, severity, description, recommendation, pass_description, fail_description, weight, evaluation_logic, technical_risk, business_impact, api_endpoint')
          .eq('device_type_id', deviceTypeId)
          .eq('is_active', true)
          .order('category')
          .order('name');

        if (rules && rules.length > 0) {
          console.log(
            `Processing ${rules.length} compliance rules for ${task.target_type} (device type ${deviceTypeId})`
          );
          complianceResult = processComplianceRules(rawData, rules as ComplianceRule[], endpointMappings);

          // Store raw data for debugging/auditing (only for legacy mode)
          // In progressive mode, raw data is already in task_step_results
          if (body.result) {
            complianceResult.raw_data = rawData;
          }
        } else {
          console.log(`No compliance rules found for ${task.target_type} (device type ${deviceTypeId})`);
        }
      } else {
        console.log(`No device type resolved for target_type=${task.target_type}`);
      }
    }

    // Prepare result to save
    // - Firewall: save complianceResult (or legacy body.result)
    // - External domain: save reconstructed rawData (progressive) to make executions modal useful
    const resultToSave = task.target_type === 'external_domain'
      ? (rawData || body.result || null)
      : (complianceResult || body.result || null);

    const score = complianceResult?.score ?? null;

    // Update task with result
    const { error: updateError } = await supabase
      .from('agent_tasks')
      .update({
        status: dbStatus,
        result: resultToSave || null,
        error_message: body.error_message || null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', body.task_id);

    if (updateError) {
      console.error('Failed to update task:', updateError);
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar tarefa', code: 'INTERNAL_ERROR' } as TaskResultErrorResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // External domain: update last scan + last score (when available)
    if ((body.status === 'completed' || body.status === 'partial') && task.target_type === 'external_domain') {
      await supabase
        .from('external_domains')
        .update({
          last_scan_at: new Date().toISOString(),
          ...(score !== null ? { last_score: score } : {}),
        })
        .eq('id', task.target_id);
    }

    // If we have a compliance result, save to history (firewall or external_domain)
    if (complianceResult && score !== null) {
      // Create a lightweight version of the compliance result for history
      // Exclude raw_data to avoid timeout on large datasets (raw_data is already in agent_tasks.result)
      const historyReportData = {
        score: complianceResult.score,
        checks: complianceResult.checks,
        categories: complianceResult.categories,
        system_info: complianceResult.system_info,
        firmwareVersion: complianceResult.firmwareVersion,
        ...(complianceResult.dns_summary ? { dns_summary: complianceResult.dns_summary } : {}),
        ...(complianceResult.subdomain_summary ? { subdomain_summary: complianceResult.subdomain_summary } : {}),
        // raw_data is intentionally excluded - it's stored in agent_tasks.result
      };

      if (task.target_type === 'firewall') {
        // Save to analysis_history
        const { data: analysisData, error: historyError } = await supabase
          .from('analysis_history')
          .insert({
            firewall_id: task.target_id,
            score: score,
            report_data: historyReportData,
          })
          .select('id')
          .single();

        if (historyError) {
          console.error('Failed to save analysis history:', historyError);
        }

        // Update firewall last_analysis_at and last_score
        await supabase
          .from('firewalls')
          .update({
            last_analysis_at: new Date().toISOString(),
            last_score: score,
          })
          .eq('id', task.target_id);

        // Use firewall name from earlier query
        const alertFirewallName = firewallName || 'Dispositivo';

        console.log(`Creating analysis alert for firewall: ${alertFirewallName} (id: ${task.target_id})`);

        // Create system alert for analysis completion
        // Always use 'success' severity for completed analyses (green/teal color)
        const alertSeverity = 'success';
        await supabase
          .from('system_alerts')
          .insert({
            alert_type: 'firewall_analysis_completed',
            title: 'Análise Concluída',
            message: `A análise do firewall "${alertFirewallName}" foi concluída com score ${score}%.`,
            severity: alertSeverity,
            target_role: null,
            is_active: true,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            metadata: {
              firewall_id: task.target_id,
              score: score,
              analysis_id: analysisData?.id || null
            }
          });

        console.log(`Compliance result saved: score=${score}, checks=${complianceResult.checks.length}, alert created`);
      } else if (task.target_type === 'external_domain') {
        console.log(`Saving external domain history for domain_id=${task.target_id} (score=${score})`);

        const { data: historyData, error: historyError } = await supabase
          .from('external_domain_analysis_history')
          .insert({
            domain_id: task.target_id,
            score: score,
            report_data: historyReportData,
            source: 'agent',
            status: 'completed',
            started_at: task.started_at || new Date().toISOString(),
            completed_at: new Date().toISOString(),
            execution_time_ms: task.execution_time_ms || null,
          })
          .select('id')
          .single();

        if (historyError) {
          console.error('Failed to save external domain analysis history:', historyError);
          // Do not fail task update if history insertion fails
        } else {
          console.log(
            `External domain history saved: domain_id=${task.target_id}, report_id=${historyData?.id}, checks=${complianceResult.checks.length}`,
          );

          // Best-effort: get a friendly domain name for the banner message.
          const { data: domainRow } = await supabase
            .from('external_domains')
            .select('name, domain')
            .eq('id', task.target_id)
            .maybeSingle();

          const domainLabel = domainRow?.name || domainRow?.domain || 'Domínio externo';

          // Create system alert for analysis completion
          await supabase
            .from('system_alerts')
            .insert({
              alert_type: 'external_domain_analysis_completed',
              title: 'Análise Concluída',
              message: `A análise do domínio "${domainLabel}" foi concluída com score ${score}%.`,
              severity: 'success',
              target_role: null,
              is_active: true,
              // Keep a DB TTL; UI still applies its own lifetime.
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              metadata: {
                domain_id: task.target_id,
                report_id: historyData?.id || null,
                score: score,
                domain_name: domainRow?.name || null,
                domain: domainRow?.domain || null,
              },
            });
        }
      }
    }

    console.log(`Task ${body.task_id} updated to ${dbStatus} by agent ${agentId}`);

    // Check if there are more pending tasks
    const { count } = await supabase
      .from('agent_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', agentId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());

    const response: TaskResultSuccessResponse = {
      success: true,
      task_id: body.task_id,
      status: dbStatus,
      score: score ?? undefined,
      has_more_tasks: (count || 0) > 0,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in agent-task-result:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' } as TaskResultErrorResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
