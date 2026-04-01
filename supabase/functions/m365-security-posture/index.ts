// ============================================================================
// M365 Security Posture - Data-Driven Analysis
// Refatorado para ler blueprints e regras do banco de dados
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { getCorsHeaders } from '../_shared/cors.ts';

// ========== TYPES ==========

interface BlueprintStep {
  id: string;
  name: string;
  executor: 'edge_function' | 'agent';
  runtime: string;
  category: string;
  config: {
    endpoint: string;
    method: string;
    headers?: Record<string, string>;
    api_version: string;
    params?: Record<string, string>;
    dynamic_params?: Record<string, string>;
  };
}

interface Blueprint {
  id: string;
  name: string;
  executor_type: string;
  collection_steps: {
    steps: BlueprintStep[];
  };
}

interface ComplianceRule {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  severity: string;
  weight: number;
  technical_risk: string | null;
  business_impact: string | null;
  api_endpoint: string | null;
  recommendation: string | null;
  pass_description: string | null;
  fail_description: string | null;
  not_found_description: string | null;
  evaluation_logic: Record<string, unknown>;
  is_active: boolean;
}

interface StepResult {
  stepId: string;
  stepName: string;
  category: string;
  data: unknown;
  error: string | null;
  durationMs: number;
}

interface M365Insight {
  id: string;
  code: string;
  category: string;
  product: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  titulo: string;
  descricaoExecutiva: string;
  riscoTecnico: string;
  impactoNegocio: string;
  scoreImpacto: number;
  status: 'pass' | 'fail';
  affectedCount: number;
  affectedEntities: Array<{ id: string; displayName: string; details?: Record<string, unknown> }>;
  remediacao: {
    productAfetado: string;
    portalUrl: string;
    caminhoPortal: string[];
    passosDetalhados: string[];
  };
  detectedAt: string;
  endpointUsado?: string;
}

interface EnvironmentMetrics {
  authType: 'cloud_only' | 'hybrid' | 'federated';
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  guestUsers: number;
  mfaEnabledPercent: number;
  conditionalAccessEnabled: boolean;
  conditionalAccessPoliciesCount: number;
  securityDefaultsEnabled: boolean;
  enterpriseAppsCount: number;
  appRegistrationsCount: number;
  storageUsedGB: number;
  storageTotalGB: number;
  loginCountries: Array<{ country: string; success: number; fail: number }>;
}

// ========== GRAPH API EXECUTOR ==========

async function executeGraphApiStep(
  accessToken: string,
  step: BlueprintStep,
  context: { now: Date }
): Promise<StepResult> {
  const startTime = Date.now();
  const config = step.config;
  
  try {
    // Process dynamic parameters
    let endpoint = config.endpoint;
    if (config.dynamic_params) {
      for (const [key, value] of Object.entries(config.dynamic_params)) {
        if (value.startsWith('datetime_subtract')) {
          const match = value.match(/datetime_subtract\(now,\s*(\d+)d\)/);
          if (match) {
            const days = parseInt(match[1], 10);
            const date = new Date(context.now.getTime() - days * 24 * 60 * 60 * 1000);
            endpoint = endpoint.replace(`{${key}}`, date.toISOString());
          }
        }
      }
    }
    
    const baseUrl = config.api_version === 'beta' 
      ? 'https://graph.microsoft.com/beta' 
      : 'https://graph.microsoft.com/v1.0';
    
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      ...config.headers,
    };
    
    const res = await fetch(`${baseUrl}${endpoint}`, { 
      method: config.method || 'GET',
      headers 
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      return {
        stepId: step.id,
        stepName: step.name,
        category: step.category,
        data: null,
        error: `${res.status}: ${errorText}`,
        durationMs: Date.now() - startTime,
      };
    }
    
    // Handle count endpoints that return plain numbers
    const contentType = res.headers.get('content-type') || '';
    let data: unknown;
    if (contentType.includes('application/json')) {
      data = await res.json();
      
      // Pagination: follow @odata.nextLink for paginated results (max 5 pages)
      if ((data as any)?.['@odata.nextLink'] && Array.isArray((data as any)?.value)) {
        let nextLink = (data as any)['@odata.nextLink'];
        const allValues = [...(data as any).value];
        let pageCount = 0;
        const maxPages = 4; // already have page 1
        
        while (nextLink && pageCount < maxPages) {
          try {
            const pageRes = await fetch(nextLink, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!pageRes.ok) break;
            const pageData = await pageRes.json();
            if (pageData.value) allValues.push(...pageData.value);
            nextLink = pageData['@odata.nextLink'];
            pageCount++;
          } catch { break; }
        }
        
        (data as any).value = allValues;
        delete (data as any)['@odata.nextLink'];
      }
    } else {
      const text = await res.text();
      data = parseInt(text, 10) || text;
    }
    
    return {
      stepId: step.id,
      stepName: step.name,
      category: step.category,
      data,
      error: null,
      durationMs: Date.now() - startTime,
    };
  } catch (e) {
    return {
      stepId: step.id,
      stepName: step.name,
      category: step.category,
      data: null,
      error: String(e),
      durationMs: Date.now() - startTime,
    };
  }
}

// ========== TEMPLATE INTERPOLATION ==========

/** Replace both {{var}} and {var} patterns in description templates */
function interpolate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

// ========== GRAPH API HELPER FOR INLINE EVALUATION ==========

async function graphFetchSafe(accessToken: string, endpoint: string, options: { beta?: boolean } = {}): Promise<{ data: any; error: string | null }> {
  try {
    const baseUrl = options.beta ? 'https://graph.microsoft.com/beta' : 'https://graph.microsoft.com/v1.0';
    const res = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return { data: null, error: `${res.status} ${res.statusText}` };
    return { data: await res.json(), error: null };
  } catch (e) {
    return { data: null, error: String(e) };
  }
}

// ========== RULE EVALUATOR ==========

async function evaluateRule(
  rule: ComplianceRule,
  stepResults: Map<string, StepResult>,
  now: string,
  accessToken?: string
): Promise<M365Insight | null> {
  const evalLogic = rule.evaluation_logic as any;
  if (!evalLogic?.source_key) return null;
  
  // Handle inline evaluation types that don't need a step result
  const inlineTypes = ['check_sharepoint_anonymous_links_live', 'check_onedrive_sharing_live'];
  if (accessToken && inlineTypes.includes(evalLogic.evaluate?.type)) {
    return evaluateInlineRule(rule, evalLogic, accessToken, now);
  }
  
  const stepResult = stepResults.get(evalLogic.source_key);
  if (!stepResult) return null;
  
  // Support secondary_source_key for cross-referencing data from two steps
  const secondaryResult = evalLogic.secondary_source_key 
    ? stepResults.get(evalLogic.secondary_source_key) 
    : null;
  
  // If step had an error, return not_found insight
  if (stepResult.error) {
    const isPermissionError = stepResult.error.includes('403') || 
                              stepResult.error.includes('Forbidden');
    const isBadRequest = stepResult.error.includes('400') || 
                         stepResult.error.includes('Bad Request');
    
    const detail = isPermissionError
      ? 'Permissão insuficiente para acessar este recurso'
      : isBadRequest
        ? 'Endpoint não suportado neste tenant'
        : 'Dados não disponíveis';
    
    return createNotFoundInsight(rule, rule.not_found_description || detail, now, stepResult.stepId);
  }
  
  const data = stepResult.data;
  const evaluate = evalLogic.evaluate;
  
  let status: 'pass' | 'fail' = 'pass';
  let affectedCount = 0;
  let affectedEntities: Array<{ id: string; displayName: string; details?: Record<string, unknown> }> = [];
  let description = '';
  
  try {
    switch (evaluate?.type) {
      case 'count_missing_mfa': {
        const users = (data as any)?.value || [];
        const methods = evaluate.methods || ['microsoftAuthenticatorPush', 'softwareOneTimePasscode', 'phoneAuthentication'];
        const noMfa = users.filter((u: any) => {
          const m = u.methodsRegistered || [];
          return !methods.some((method: string) => m.includes(method));
        });
        affectedCount = noMfa.length;
        affectedEntities = noMfa.slice(0, 20).map((u: any) => ({
          id: u.id,
          displayName: u.userDisplayName || u.userPrincipalName,
        }));
        status = affectedCount > (evaluate.threshold || 0) ? 'fail' : 'pass';
        description = interpolate(status === 'fail' ? rule.fail_description || '' : rule.pass_description || '', { count: status === 'fail' ? affectedCount : users.length });
        break;
      }
      
      case 'count_inactive_users': {
        const users = (data as any)?.value || [];
        const threshold = new Date(Date.now() - (evaluate.days_threshold || 90) * 24 * 60 * 60 * 1000);
        const inactive = users.filter((u: any) => {
          const lastSignIn = u.signInActivity?.lastSignInDateTime;
          if (!lastSignIn) return true;
          return new Date(lastSignIn) < threshold;
        });
        affectedCount = inactive.length;
        affectedEntities = inactive.slice(0, 20).map((u: any) => ({
          id: u.id,
          displayName: u.displayName || u.userPrincipalName,
          details: { lastSignIn: u.signInActivity?.lastSignInDateTime || 'Nunca' }
        }));
        status = affectedCount > 5 ? 'fail' : 'pass';
        description = interpolate(status === 'fail' ? rule.fail_description || '' : rule.pass_description || 'Todos os usuários ativos têm atividade recente.', { count: affectedCount });
        break;
      }
      
      case 'check_boolean': {
        const fieldValue = (data as any)?.[evaluate.field];
        status = fieldValue === evaluate.expected ? 'pass' : 'fail';
        affectedCount = status === 'fail' ? 1 : 0;
        description = status === 'pass' ? rule.pass_description || '' : rule.fail_description || '';
        break;
      }
      
      case 'check_ca_policies': {
        const policies = (data as any)?.value || [];
        const enabledPolicies = policies.filter((p: any) => p.state === 'enabled');
        const hasMfaPolicy = enabledPolicies.some((p: any) => 
          p.grantControls?.builtInControls?.includes('mfa')
        );
        status = enabledPolicies.length > 0 && hasMfaPolicy ? 'pass' : 'fail';
        affectedCount = enabledPolicies.length;
        affectedEntities = policies.slice(0, 20).map((p: any) => ({
          id: p.id,
          displayName: `${p.displayName} (${p.state})`,
          details: { state: p.state, mfa: p.grantControls?.builtInControls?.includes('mfa') }
        }));
        description = interpolate(status === 'pass' ? rule.pass_description || '' : rule.fail_description || '', { count: enabledPolicies.length });
        break;
      }
      
      case 'check_legacy_auth_block': {
        const policies = (data as any)?.value || [];
        const enabledPolicies = policies.filter((p: any) => p.state === 'enabled');
        const blocksLegacy = enabledPolicies.some((p: any) =>
          p.conditions?.clientAppTypes?.includes('exchangeActiveSync') ||
          p.conditions?.clientAppTypes?.includes('other')
        );
        status = blocksLegacy ? 'pass' : 'fail';
        affectedCount = blocksLegacy ? 0 : 1;
        description = status === 'pass' ? rule.pass_description || '' : rule.fail_description || '';
        break;
      }
      
      case 'check_named_locations_exist': {
        const locations = (data as any)?.value || [];
        const trustedLocations = locations.filter((l: any) => l.isTrusted);
        status = locations.length > 0 ? 'pass' : 'fail';
        affectedCount = locations.length;
        affectedEntities = locations.slice(0, 20).map((l: any) => ({
          id: l.id,
          displayName: l.displayName,
          details: { trusted: l.isTrusted }
        }));
        description = interpolate(status === 'pass' ? rule.pass_description || '' : rule.fail_description || '', { count: locations.length, trusted: trustedLocations.length, trusted_count: trustedLocations.length });
        break;
      }
      
      case 'count_role_members': {
        const roles = (data as any)?.value || [];
        const targetRole = roles.find((r: any) => r.displayName === evaluate.role_name);
        // Note: This would need additional API call to get members
        // For now, we mark as pass and rely on sub-functions
        affectedCount = 0;
        status = 'pass';
        description = rule.pass_description || '';
        break;
      }
      
      case 'count_risk_detections': {
        const detections = (data as any)?.value || [];
        const highRisk = detections.filter((d: any) => d.riskLevel === 'high');
        const mediumRisk = detections.filter((d: any) => d.riskLevel === 'medium');
        affectedCount = detections.length;
        affectedEntities = detections.slice(0, 20).map((d: any) => ({
          id: d.id,
          displayName: `${d.userDisplayName || d.userPrincipalName} - ${d.riskEventType}`,
          details: { riskLevel: d.riskLevel, detected: d.detectedDateTime }
        }));
        status = highRisk.length > (evaluate.high_threshold || 0) || 
                 mediumRisk.length > (evaluate.medium_threshold || 5) ? 'fail' : 'pass';
        description = interpolate(status === 'fail' ? rule.fail_description || '' : rule.pass_description || '', { count: detections.length, highRisk: highRisk.length, mediumRisk: mediumRisk.length, high_count: highRisk.length, medium_count: mediumRisk.length });
        break;
      }
      
      case 'count_risky_users': {
        const riskyUsers = (data as any)?.value || [];
        const confirmed = riskyUsers.filter((u: any) => u.riskState === 'confirmedCompromised');
        const atRisk = riskyUsers.filter((u: any) => u.riskState === 'atRisk');
        affectedCount = riskyUsers.length;
        affectedEntities = riskyUsers.slice(0, 20).map((u: any) => ({
          id: u.id,
          displayName: u.userDisplayName || u.userPrincipalName,
          details: { riskState: u.riskState, riskLevel: u.riskLevel }
        }));
        status = confirmed.length > (evaluate.confirmed_threshold || 0) || 
                 atRisk.length > (evaluate.at_risk_threshold || 5) ? 'fail' : 'pass';
        description = interpolate(status === 'fail' ? rule.fail_description || '' : rule.pass_description || '', { count: riskyUsers.length, confirmed: confirmed.length, atRisk: atRisk.length, confirmed_count: confirmed.length, at_risk_count: atRisk.length });
        break;
      }
      
      case 'count_only': {
        const count = typeof data === 'number' ? data : ((data as any)?.value?.length || 0);
        affectedCount = count;
        status = 'pass';
        description = interpolate(rule.pass_description || '', { count });
        break;
      }
      
      case 'count_enabled_methods': {
        const methods = (data as any)?.authenticationMethodConfigurations || [];
        const enabledMethods = methods.filter((m: any) => m.state === 'enabled');
        affectedCount = enabledMethods.length;
        // Map known auth method IDs to readable names
        const authMethodNames: Record<string, string> = {
          'MicrosoftAuthenticator': 'Microsoft Authenticator',
          'Fido2': 'Chave de Segurança FIDO2',
          'Sms': 'SMS',
          'TemporaryAccessPass': 'Passe de Acesso Temporário',
          'Email': 'E-mail OTP',
          'X509Certificate': 'Certificado X.509',
          'SoftwareOath': 'Token OATH (Software)',
          'HardwareOath': 'Token OATH (Hardware)',
          'WindowsHelloForBusiness': 'Windows Hello for Business',
          'Voice': 'Chamada de Voz',
        };
        affectedEntities = enabledMethods.slice(0, 20).map((m: any) => ({
          id: m.id,
          displayName: authMethodNames[m.id] || m.id.replace(/([A-Z])/g, ' $1').trim(),
          details: { state: m.state }
        }));
        status = 'pass';
        description = (rule.pass_description || '').replace('{count}', String(enabledMethods.length));
        break;
      }
      
      case 'count_problematic_guests': {
        const guests = (data as any)?.value || [];
        const problematic = guests.filter((g: any) => g.externalUserState !== 'Accepted');
        affectedCount = problematic.length;
        affectedEntities = problematic.slice(0, 20).map((g: any) => ({
          id: g.id,
          displayName: g.displayName || g.userPrincipalName,
          details: { state: g.externalUserState, created: g.createdDateTime }
        }));
        status = affectedCount > (evaluate.threshold || 10) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(guests.length));
        break;
      }

      case 'count_inactive_guests': {
        const guests = (data as any)?.value || [];
        const threshold = new Date(Date.now() - (evaluate.days_threshold || 60) * 24 * 60 * 60 * 1000);
        const inactive = guests.filter((g: any) => {
          const lastSignIn = g.signInActivity?.lastSignInDateTime;
          if (!lastSignIn) return true;
          return new Date(lastSignIn) < threshold;
        });
        affectedCount = inactive.length;
        affectedEntities = inactive.slice(0, 20).map((g: any) => ({
          id: g.id,
          displayName: g.displayName || g.userPrincipalName,
          details: { lastSignIn: g.signInActivity?.lastSignInDateTime || 'Nunca' }
        }));
        status = affectedCount > (evaluate.threshold || 15) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'count_old_passwords': {
        const users = (data as any)?.value || [];
        const threshold = new Date(Date.now() - (evaluate.days_threshold || 365) * 24 * 60 * 60 * 1000);
        const oldPwd = users.filter((u: any) => {
          if (!u.lastPasswordChangeDateTime) return true;
          return new Date(u.lastPasswordChangeDateTime) < threshold;
        });
        affectedCount = oldPwd.length;
        affectedEntities = oldPwd.slice(0, 20).map((u: any) => ({
          id: u.id,
          displayName: u.displayName || u.userPrincipalName,
          details: { lastChange: u.lastPasswordChangeDateTime || 'Nunca' }
        }));
        status = affectedCount > (evaluate.threshold || 20) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'count_global_admins': {
        const roles = (data as any)?.value || [];
        const targetRole = roles.find((r: any) => r.displayName === (evaluate.role_name || 'Global Administrator'));
        const members = targetRole?.members || [];
        affectedCount = members.length;
        affectedEntities = members.slice(0, 20).map((m: any) => ({
          id: m.id,
          displayName: m.displayName || m.userPrincipalName,
          details: { userType: m.userType || 'Member' }
        }));
        status = affectedCount > (evaluate.threshold || 5) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(affectedCount));
        break;
      }

      case 'check_admin_mfa': {
        const roles = (data as any)?.value || [];
        const targetRole = roles.find((r: any) => r.displayName === (evaluate.role_name || 'Global Administrator'));
        const adminMembers = targetRole?.members || [];
        const adminIds = new Set(adminMembers.map((m: any) => m.id));
        
        // Cross-reference with MFA data from secondary source
        const mfaUsers = (secondaryResult?.data as any)?.value || [];
        const adminsWithoutMfa = mfaUsers.filter((u: any) => {
          if (!adminIds.has(u.id)) return false;
          const methods = u.methodsRegistered || [];
          return !methods.includes('microsoftAuthenticatorPush') && 
                 !methods.includes('softwareOneTimePasscode') && 
                 !methods.includes('phoneAuthentication');
        });
        
        // Also count admins not in MFA report at all
        const mfaUserIds = new Set(mfaUsers.map((u: any) => u.id));
        const adminsNotInReport = adminMembers.filter((m: any) => !mfaUserIds.has(m.id));
        
        const allWithoutMfa = [...adminsWithoutMfa, ...adminsNotInReport];
        affectedCount = allWithoutMfa.length;
        affectedEntities = allWithoutMfa.slice(0, 20).map((u: any) => ({
          id: u.id,
          displayName: u.displayName || u.userDisplayName || u.userPrincipalName,
        }));
        status = affectedCount > 0 ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'count_privileged_users': {
        const roles = (data as any)?.value || [];
        const allMembers = new Set<string>();
        const memberDetails: any[] = [];
        for (const role of roles) {
          for (const member of role.members || []) {
            if (!allMembers.has(member.id)) {
              allMembers.add(member.id);
              memberDetails.push({ ...member, roleName: role.displayName });
            }
          }
        }
        affectedCount = allMembers.size;
        affectedEntities = memberDetails.slice(0, 20).map((m: any) => ({
          id: m.id,
          displayName: m.displayName || m.userPrincipalName,
          details: { role: m.roleName }
        }));
        status = affectedCount > (evaluate.threshold || 30) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(affectedCount));
        break;
      }

      case 'count_multi_role_admins': {
        const roles = (data as any)?.value || [];
        const userRoles = new Map<string, { displayName: string; roles: string[] }>();
        for (const role of roles) {
          for (const member of role.members || []) {
            const existing = userRoles.get(member.id) || { displayName: member.displayName, roles: [] };
            existing.roles.push(role.displayName);
            userRoles.set(member.id, existing);
          }
        }
        const multiRole = Array.from(userRoles.entries()).filter(([, v]) => v.roles.length > 1);
        affectedCount = multiRole.length;
        affectedEntities = multiRole.slice(0, 20).map(([id, v]) => ({
          id,
          displayName: v.displayName,
          details: { roles: v.roles.join(', '), count: v.roles.length }
        }));
        status = affectedCount > (evaluate.threshold || 5) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(affectedCount));
        break;
      }

      case 'count_guest_admins': {
        const roles = (data as any)?.value || [];
        const guestAdmins: any[] = [];
        const seen = new Set<string>();
        for (const role of roles) {
          for (const member of role.members || []) {
            if (member.userType === 'Guest' && !seen.has(member.id)) {
              seen.add(member.id);
              guestAdmins.push({ ...member, roleName: role.displayName });
            }
          }
        }
        affectedCount = guestAdmins.length;
        affectedEntities = guestAdmins.slice(0, 20).map((m: any) => ({
          id: m.id,
          displayName: m.displayName || m.userPrincipalName,
          details: { role: m.roleName, userType: 'Guest' }
        }));
        status = affectedCount > (evaluate.threshold || 0) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'count_sp_admins': {
        const sps = (data as any)?.value || [];
        const adminSps = sps.filter((sp: any) => {
          const appRoles = sp.appRoleAssignments || sp.appRoles || [];
          return appRoles.some?.((r: any) => 
            r.resourceDisplayName === 'Microsoft Graph' || 
            r.principalType === 'ServicePrincipal'
          ) || sp.appOwnerOrganizationId;
        });
        affectedCount = adminSps.length;
        affectedEntities = adminSps.slice(0, 20).map((sp: any) => ({
          id: sp.id,
          displayName: sp.displayName || sp.appDisplayName,
        }));
        status = affectedCount > (evaluate.threshold || 3) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(affectedCount));
        break;
      }

      case 'count_expiring_credentials': {
        const apps = (data as any)?.value || [];
        const daysAhead = evaluate.days_ahead || 30;
        const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
        const nowDate = new Date();
        const expiring = apps.filter((app: any) => {
          const allCreds = [...(app.passwordCredentials || []), ...(app.keyCredentials || [])];
          return allCreds.some((c: any) => {
            const endDate = new Date(c.endDateTime);
            return endDate > nowDate && endDate <= futureDate;
          });
        });
        affectedCount = expiring.length;
        affectedEntities = expiring.slice(0, 20).map((app: any) => ({
          id: app.id,
          displayName: app.displayName,
        }));
        status = affectedCount > (evaluate.threshold || 5) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(affectedCount));
        break;
      }

      case 'count_expired_credentials': {
        const apps = (data as any)?.value || [];
        const nowDate = new Date();
        const expired = apps.filter((app: any) => {
          const allCreds = [...(app.passwordCredentials || []), ...(app.keyCredentials || [])];
          return allCreds.some((c: any) => new Date(c.endDateTime) < nowDate);
        });
        affectedCount = expired.length;
        affectedEntities = expired.slice(0, 20).map((app: any) => ({
          id: app.id,
          displayName: app.displayName,
        }));
        status = affectedCount > (evaluate.threshold || 0) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'count_high_privilege_apps': {
        const apps = (data as any)?.value || [];
        const highPrivPerms = ['Mail.ReadWrite', 'Directory.ReadWrite.All', 'Files.ReadWrite.All', 
          'User.ReadWrite.All', 'Group.ReadWrite.All', 'Sites.ReadWrite.All', 'RoleManagement.ReadWrite.Directory'];
        const highPrivApps = apps.filter((app: any) => {
          const resources = app.requiredResourceAccess || [];
          return resources.some((r: any) =>
            r.resourceAccess?.some((ra: any) => highPrivPerms.some(p => ra.id?.includes(p) || app.displayName?.includes(p)))
          );
        });
        // Simpler: check by permission scope count as proxy
        const appsWithManyPerms = apps.filter((app: any) => {
          const resources = app.requiredResourceAccess || [];
          const totalPerms = resources.reduce((sum: number, r: any) => sum + (r.resourceAccess?.length || 0), 0);
          return totalPerms > 10;
        });
        const result = highPrivApps.length > 0 ? highPrivApps : appsWithManyPerms;
        affectedCount = result.length;
        affectedEntities = result.slice(0, 20).map((app: any) => ({
          id: app.id,
          displayName: app.displayName,
        }));
        status = affectedCount > (evaluate.threshold || 10) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(affectedCount));
        break;
      }

      case 'count_no_owner_apps': {
        const apps = (data as any)?.value || [];
        const noOwner = apps.filter((app: any) => !app.owners || app.owners.length === 0);
        affectedCount = noOwner.length;
        affectedEntities = noOwner.slice(0, 20).map((app: any) => ({
          id: app.id,
          displayName: app.displayName,
        }));
        status = affectedCount > (evaluate.threshold || 10) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(affectedCount));
        break;
      }

      case 'count_oauth_consents': {
        const grants = (data as any)?.value || [];
        // Build lookup map from service principals (secondary source)
        const spList = (secondaryResult?.data as any)?.value || [];
        const spMap = new Map<string, string>();
        for (const sp of spList) {
          spMap.set(sp.id, sp.displayName || sp.appDisplayName || sp.appId || sp.id);
        }
        const allPrincipals = grants.filter((g: any) => 
          g.consentType === 'AllPrincipals' || g.scope?.includes('AllPrincipals')
        );
        affectedCount = allPrincipals.length;
        affectedEntities = allPrincipals.slice(0, 20).map((g: any) => ({
          id: g.id,
          displayName: spMap.get(g.clientId) || g.clientId || 'OAuth Grant',
          details: { scope: g.scope, consentType: g.consentType }
        }));
        status = affectedCount > (evaluate.threshold || 20) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : (rule.pass_description || '').replace('{count}', String(affectedCount));
        break;
      }

      case 'check_security_alerts': {
        const alerts = (data as any)?.value || [];
        const active = alerts.filter((a: any) => a.status !== 'resolved');
        const highSev = active.filter((a: any) => a.severity === 'high' || a.severity === 'critical');
        affectedCount = active.length;
        affectedEntities = active.slice(0, 20).map((a: any) => ({
          id: a.id, displayName: a.title || a.displayName || 'Alert',
          details: { severity: a.severity, status: a.status }
        }));
        status = highSev.length > (evaluate.high_threshold || 0) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{{count}}', String(active.length)).replace('{{high}}', String(highSev.length))
          : rule.pass_description || '';
        break;
      }

      case 'check_security_incidents': {
        const incidents = (data as any)?.value || [];
        const activeInc = incidents.filter((i: any) => i.status !== 'resolved' && i.status !== 'redirected');
        affectedCount = activeInc.length;
        affectedEntities = activeInc.slice(0, 20).map((i: any) => ({
          id: i.id, displayName: i.displayName || 'Incident',
          details: { severity: i.severity, status: i.status }
        }));
        status = activeInc.length > 0 ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{{count}}', String(activeInc.length)).replace('{{active}}', String(activeInc.filter((i: any) => i.status === 'active').length))
          : rule.pass_description || '';
        break;
      }

      case 'check_attack_simulation': {
        const simulations = (data as any)?.value || [];
        if (simulations.length === 0) {
          status = 'fail'; affectedCount = 0;
          description = rule.fail_description || '';
        } else {
          const avgRate = simulations.reduce((s: number, sim: any) => s + (sim.report?.simulationEventsContent?.compromisedRate || 0), 0) / simulations.length;
          affectedCount = simulations.length; status = 'pass';
          description = (rule.pass_description || '').replace('{{count}}', String(simulations.length)).replace('{{rate}}', String(Math.round(avgRate * 100)));
        }
        affectedEntities = simulations.slice(0, 20).map((s: any) => ({
          id: s.id, displayName: s.displayName || 'Simulation',
          details: { status: s.status, launchDateTime: s.launchDateTime }
        }));
        break;
      }

      case 'check_secure_score': {
        const scores = (data as any)?.value || [];
        if (scores.length === 0) { status = 'fail'; description = rule.not_found_description || ''; break; }
        const latest = scores[0];
        const current = latest.currentScore || 0;
        const max = latest.maxScore || 1;
        const pct = Math.round((current / max) * 100);
        affectedCount = Math.round(current);
        status = pct >= (evaluate.min_percentage || 60) ? 'pass' : 'fail';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '')
          .replace('{{current}}', String(current)).replace('{{max}}', String(max)).replace('{{percentage}}', String(pct));
        break;
      }

      case 'check_protection_labels': {
        const labels = (data as any)?.value || [];
        affectedCount = labels.length;
        affectedEntities = labels.slice(0, 20).map((l: any) => ({ id: l.id || '', displayName: l.name || l.displayName || 'Label' }));
        status = affectedCount >= (evaluate.min_count || 1) ? 'pass' : 'fail';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(affectedCount));
        break;
      }

      case 'check_device_compliance': {
        const devices = (data as any)?.value || [];
        const nonCompliant = devices.filter((d: any) => d.complianceState !== 'compliant');
        affectedCount = nonCompliant.length;
        affectedEntities = nonCompliant.slice(0, 20).map((d: any) => ({
          id: d.id, displayName: d.deviceName || 'Device',
          details: { complianceState: d.complianceState, os: d.operatingSystem }
        }));
        status = nonCompliant.length > 0 ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '')
          .replace('{{count}}', String(nonCompliant.length)).replace('{{total}}', String(devices.length));
        break;
      }

      case 'check_device_encryption': {
        const devices = (data as any)?.value || [];
        const unencrypted = devices.filter((d: any) => d.isEncrypted === false);
        affectedCount = unencrypted.length;
        affectedEntities = unencrypted.slice(0, 20).map((d: any) => ({
          id: d.id, displayName: d.deviceName || 'Device',
          details: { os: d.operatingSystem, encrypted: d.isEncrypted }
        }));
        status = unencrypted.length > 0 ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(unencrypted.length));
        break;
      }

      case 'check_device_jailbreak': {
        const devices = (data as any)?.value || [];
        const jailbroken = devices.filter((d: any) => d.jailBroken === 'True' || d.jailBroken === true);
        affectedCount = jailbroken.length;
        affectedEntities = jailbroken.slice(0, 20).map((d: any) => ({
          id: d.id, displayName: d.deviceName || 'Device', details: { os: d.operatingSystem }
        }));
        status = jailbroken.length > 0 ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(jailbroken.length));
        break;
      }

      case 'check_device_os_update': {
        const devices = (data as any)?.value || [];
        const threshold = new Date(Date.now() - (evaluate.days_threshold || 30) * 24 * 60 * 60 * 1000);
        const outdated = devices.filter((d: any) => {
          if (!d.lastSyncDateTime) return true;
          return new Date(d.lastSyncDateTime) < threshold;
        });
        affectedCount = outdated.length;
        affectedEntities = outdated.slice(0, 20).map((d: any) => ({
          id: d.id, displayName: d.deviceName || 'Device',
          details: { os: d.operatingSystem, osVersion: d.osVersion, lastSync: d.lastSyncDateTime }
        }));
        status = outdated.length > (evaluate.threshold || 5) ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(outdated.length));
        break;
      }

      case 'check_compliance_policies_exist': {
        const policies = (data as any)?.value || [];
        affectedCount = policies.length;
        affectedEntities = policies.slice(0, 20).map((p: any) => ({ id: p.id, displayName: p.displayName || 'Policy' }));
        status = policies.length > 0 ? 'pass' : 'fail';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(policies.length));
        break;
      }

      case 'check_device_apps': {
        const devices = (data as any)?.value || [];
        affectedCount = devices.length;
        status = 'pass';
        description = (rule.pass_description || '').replace('{{count}}', String(devices.length));
        break;
      }

      case 'check_pim_eligible': {
        const assignments = (data as any)?.value || [];
        affectedCount = assignments.length;
        affectedEntities = assignments.slice(0, 20).map((a: any) => ({
          id: a.id, displayName: a.principal?.displayName || a.directoryScopeId || 'Assignment',
          details: { role: a.roleDefinition?.displayName }
        }));
        status = assignments.length > 0 ? 'pass' : 'fail';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(assignments.length));
        break;
      }

      case 'check_pim_activations': {
        const assignments = (data as any)?.value || [];
        affectedCount = assignments.length;
        affectedEntities = assignments.slice(0, 20).map((a: any) => ({
          id: a.id, displayName: a.principal?.displayName || 'User',
          details: { role: a.roleDefinition?.displayName, start: a.startDateTime }
        }));
        status = 'pass';
        description = (rule.pass_description || '').replace('{{count}}', String(assignments.length));
        break;
      }

      case 'check_pim_approval': {
        const assignments = (data as any)?.value || [];
        const noApproval = assignments.filter((a: any) => !a.isApprovalRequired);
        affectedCount = noApproval.length;
        affectedEntities = noApproval.slice(0, 20).map((a: any) => ({
          id: a.id, displayName: a.roleDefinition?.displayName || 'Role'
        }));
        status = noApproval.length > 0 ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(noApproval.length));
        break;
      }

      case 'check_pim_permanent_ratio': {
        const activeAsgn = (data as any)?.value || [];
        const eligibleAsgn = (secondaryResult?.data as any)?.value || [];
        const permanent = activeAsgn.filter((a: any) => !a.endDateTime);
        const total = permanent.length + eligibleAsgn.length;
        const ratio = total > 0 ? Math.round((permanent.length / total) * 100) : 0;
        affectedCount = permanent.length;
        status = ratio > (evaluate.max_ratio || 50) ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '')
          .replace('{{permanent}}', String(permanent.length)).replace('{{eligible}}', String(eligibleAsgn.length)).replace('{{ratio}}', String(ratio));
        break;
      }

      case 'check_sharepoint_external_sharing': {
        const sites = (data as any)?.value || [];
        const extSites = sites.filter((s: any) => s.sharingCapability && s.sharingCapability !== 'disabled');
        affectedCount = extSites.length;
        affectedEntities = extSites.slice(0, 20).map((s: any) => ({
          id: s.id, displayName: s.displayName || s.webUrl || 'Site',
          details: { sharing: s.sharingCapability }
        }));
        status = extSites.length > 0 ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '')
          .replace('{{count}}', String(extSites.length)).replace('{{total}}', String(sites.length));
        break;
      }

      case 'check_sharepoint_anonymous_links':
      case 'check_sharepoint_anonymous_links_live': {
        // Legacy fallback for old source_key; live version handled by evaluateInlineRule
        const settings = data as any;
        const allowAnon = settings?.sharingCapability === 'ExternalUserAndGuestSharing';
        affectedCount = allowAnon ? 1 : 0;
        status = allowAnon ? 'fail' : 'pass';
        description = status === 'fail' ? rule.fail_description || '' : rule.pass_description || '';
        break;
      }

      case 'check_sharepoint_sensitivity_labels': {
        const sites = (data as any)?.value || [];
        const noLabel = sites.filter((s: any) => !s.sensitivityLabel?.id);
        affectedCount = noLabel.length;
        affectedEntities = noLabel.slice(0, 20).map((s: any) => ({ id: s.id, displayName: s.displayName || 'Site' }));
        status = noLabel.length > (evaluate.threshold || 5) ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '')
          .replace('{{count}}', String(noLabel.length)).replace('{{total}}', String(sites.length));
        break;
      }

      case 'check_onedrive_sharing':
      case 'check_onedrive_sharing_live': {
        // Legacy fallback; live version handled by evaluateInlineRule
        const settings = data as any;
        const permissive = settings?.oneDriveSharingCapability === 'ExternalUserAndGuestSharing';
        affectedCount = permissive ? 1 : 0;
        status = permissive ? 'fail' : 'pass';
        description = status === 'fail' ? rule.fail_description || '' : rule.pass_description || '';
        break;
      }

      case 'check_teams_guests': {
        const teams = (data as any)?.value || [];
        const withGuests = teams.filter((t: any) => (t.members || []).some((m: any) => m.userType === 'Guest'));
        affectedCount = withGuests.length;
        affectedEntities = withGuests.slice(0, 20).map((t: any) => ({
          id: t.id, displayName: t.displayName || 'Team',
          details: { guestCount: (t.members || []).filter((m: any) => m.userType === 'Guest').length }
        }));
        status = withGuests.length > (evaluate.threshold || 0) ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '')
          .replace('{{count}}', String(withGuests.length)).replace('{{total}}', String(teams.length));
        break;
      }

      case 'check_teams_public': {
        const teams = (data as any)?.value || [];
        const publicTeams = teams.filter((t: any) => t.visibility === 'Public');
        affectedCount = publicTeams.length;
        affectedEntities = publicTeams.slice(0, 20).map((t: any) => ({ id: t.id, displayName: t.displayName || 'Team' }));
        status = publicTeams.length > (evaluate.threshold || 0) ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(publicTeams.length));
        break;
      }

      case 'check_teams_owners': {
        const teams = (data as any)?.value || [];
        const badTeams = teams.filter((t: any) => (t.owners || []).length <= 1);
        affectedCount = badTeams.length;
        affectedEntities = badTeams.slice(0, 20).map((t: any) => ({
          id: t.id, displayName: t.displayName || 'Team',
          details: { ownerCount: (t.owners || []).length }
        }));
        status = badTeams.length > (evaluate.threshold || 5) ? 'fail' : 'pass';
        description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '').replace('{{count}}', String(badTeams.length));
        break;
      }

      case 'check_teams_private_channels': {
        // Real implementation: iterate teams and count private channels
        if (accessToken) {
          let totalPrivate = 0;
          const teamsWithPrivate: Array<{ id: string; displayName: string; details?: Record<string, unknown> }> = [];
          const teams = (data as any)?.value || [];
          for (const team of teams.slice(0, 15)) {
            try {
              const { data: channelsData } = await graphFetchSafe(accessToken, `/teams/${team.id}/channels?$filter=membershipType eq 'private'`);
              const privateCount = channelsData?.value?.length || 0;
              if (privateCount > 0) {
                totalPrivate += privateCount;
                teamsWithPrivate.push({ id: team.id, displayName: team.displayName || 'Team', details: { privateChannels: privateCount } });
              }
            } catch { /* skip */ }
          }
          affectedCount = totalPrivate;
          affectedEntities = teamsWithPrivate;
          status = totalPrivate > (evaluate.threshold || 20) ? 'fail' : 'pass';
          description = (status === 'fail' ? rule.fail_description || '' : rule.pass_description || '')
            .replace('{{count}}', String(totalPrivate)).replace('{{teams}}', String(teams.length));
        } else {
          // Fallback without token
          const teams = (data as any)?.value || [];
          affectedCount = teams.length;
          status = 'pass';
          description = (rule.pass_description || '').replace('{{count}}', '0').replace('{{teams}}', String(teams.length));
        }
        break;
      }

      case 'check_suspicious_inbox_rules': {
        // EXO-022: Detect inbox rules with ForwardTo/RedirectTo to external addresses
        const rules = Array.isArray(data) ? data : (data as any)?.value || [];
        const suspicious = rules.filter((r: any) => {
          const forwardTo = r.ForwardTo || r.forwardTo || '';
          const redirectTo = r.RedirectTo || r.redirectTo || '';
          const forwardAsAttach = r.ForwardAsAttachmentTo || r.forwardAsAttachmentTo || '';
          return (forwardTo && forwardTo.length > 0) || (redirectTo && redirectTo.length > 0) || (forwardAsAttach && forwardAsAttach.length > 0);
        });
        affectedCount = suspicious.length;
        affectedEntities = suspicious.slice(0, 20).map((r: any) => ({
          id: r.RuleIdentity || r.Identity || r.id || '',
          displayName: `${r.MailboxOwner || r.mailboxOwner || 'Unknown'}: ${r.Name || r.name || 'Rule'}`,
          details: { 
            forwardTo: r.ForwardTo || r.forwardTo || '', 
            redirectTo: r.RedirectTo || r.redirectTo || '',
            enabled: r.Enabled ?? r.enabled ?? true
          }
        }));
        status = affectedCount > 0 ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'check_inbox_rules_in_error': {
        // EXO-023: Detect inbox rules with InError=True (corrupted rules)
        const allRules = Array.isArray(data) ? data : (data as any)?.value || [];
        const errorRules = allRules.filter((r: any) => r.InError === true || r.inError === true);
        affectedCount = errorRules.length;
        affectedEntities = errorRules.slice(0, 20).map((r: any) => ({
          id: r.RuleIdentity || r.Identity || r.id || '',
          displayName: `${r.MailboxOwner || r.mailboxOwner || 'Unknown'}: ${r.Name || r.name || 'Rule'}`,
          details: { 
            enabled: r.Enabled ?? r.enabled ?? true,
            inError: true
          }
        }));
        status = affectedCount > 0 ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'check_password_expiration': {
        // AUT-008: Check domain password expiration policy
        const domains = (data as any)?.value || [];
        const infiniteExpiry = domains.filter((d: any) => {
          const validity = d.passwordValidityPeriodInDays;
          return !validity || validity >= 2147483647;
        });
        affectedCount = infiniteExpiry.length;
        affectedEntities = infiniteExpiry.slice(0, 20).map((d: any) => ({
          id: d.id,
          displayName: d.id || 'Domain',
          details: { passwordValidityPeriodInDays: d.passwordValidityPeriodInDays || 'Not set' }
        }));
        status = affectedCount > 0 ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'check_sspr_enabled': {
        // AUT-009: Check if SSPR is enabled
        const policy = data as any;
        const sspr = policy?.allowedToUseSSPR ?? policy?.defaultUserRolePermissions?.allowedToUseSSPR;
        status = sspr === true ? 'pass' : 'fail';
        affectedCount = status === 'fail' ? 1 : 0;
        description = status === 'pass' ? rule.pass_description || '' : rule.fail_description || '';
        break;
      }

      case 'check_ca_signin_risk': {
        // AUT-010: Check if any CA policy evaluates sign-in risk
        const policies = (data as any)?.value || [];
        const enabledPolicies = policies.filter((p: any) => p.state === 'enabled');
        const hasSignInRisk = enabledPolicies.some((p: any) => {
          const riskLevels = p.conditions?.signInRiskLevels || [];
          return riskLevels.length > 0;
        });
        status = hasSignInRisk ? 'pass' : 'fail';
        affectedCount = hasSignInRisk ? 0 : 1;
        affectedEntities = enabledPolicies.filter((p: any) => (p.conditions?.signInRiskLevels || []).length > 0)
          .slice(0, 10).map((p: any) => ({ id: p.id, displayName: p.displayName, details: { riskLevels: p.conditions?.signInRiskLevels } }));
        description = status === 'pass' ? rule.pass_description || '' : rule.fail_description || '';
        break;
      }

      case 'check_ca_user_risk': {
        // AUT-011: Check if any CA policy evaluates user risk
        const policies = (data as any)?.value || [];
        const enabledPolicies = policies.filter((p: any) => p.state === 'enabled');
        const hasUserRisk = enabledPolicies.some((p: any) => {
          const riskLevels = p.conditions?.userRiskLevels || [];
          return riskLevels.length > 0;
        });
        status = hasUserRisk ? 'pass' : 'fail';
        affectedCount = hasUserRisk ? 0 : 1;
        affectedEntities = enabledPolicies.filter((p: any) => (p.conditions?.userRiskLevels || []).length > 0)
          .slice(0, 10).map((p: any) => ({ id: p.id, displayName: p.displayName, details: { riskLevels: p.conditions?.userRiskLevels } }));
        description = status === 'pass' ? rule.pass_description || '' : rule.fail_description || '';
        break;
      }

      case 'check_break_glass_accounts': {
        // ADM-007: Check for break-glass accounts among Global Admins
        const roles = (data as any)?.value || [];
        const gaRole = roles.find((r: any) => r.displayName === 'Global Administrator');
        const gaMembers = gaRole?.members || [];
        // Cross-reference with MFA data
        const mfaUsers = (secondaryResult?.data as any)?.value || [];
        const mfaUserMap = new Map<string, any>();
        for (const u of mfaUsers) { mfaUserMap.set(u.id, u); }
        // Break glass candidates: GA members without MFA and cloud-only
        const breakGlass = gaMembers.filter((m: any) => {
          const mfaData = mfaUserMap.get(m.id);
          const methods = mfaData?.methodsRegistered || [];
          const hasMfa = methods.includes('microsoftAuthenticatorPush') || methods.includes('softwareOneTimePasscode') || methods.includes('phoneAuthentication');
          return !hasMfa && m.userType !== 'Guest';
        });
        affectedCount = breakGlass.length;
        affectedEntities = breakGlass.slice(0, 10).map((m: any) => ({
          id: m.id, displayName: m.displayName || m.userPrincipalName,
          details: { note: 'Global Admin sem MFA (possível break glass)' }
        }));
        // Pass if there are break glass accounts, fail if none exist
        status = breakGlass.length >= 1 ? 'pass' : 'fail';
        description = status === 'pass'
          ? (rule.pass_description || '').replace('{count}', String(breakGlass.length))
          : rule.fail_description || '';
        break;
      }

      case 'count_long_lived_credentials': {
        // APP-008: Count apps with credentials lasting > max_days
        const apps = (data as any)?.value || [];
        const maxDays = evaluate.max_days || 730;
        const maxMs = maxDays * 24 * 60 * 60 * 1000;
        const longLived = apps.filter((app: any) => {
          const allCreds = [...(app.passwordCredentials || []), ...(app.keyCredentials || [])];
          return allCreds.some((c: any) => {
            const start = new Date(c.startDateTime || c.customKeyIdentifier || Date.now());
            const end = new Date(c.endDateTime);
            return (end.getTime() - start.getTime()) > maxMs;
          });
        });
        affectedCount = longLived.length;
        affectedEntities = longLived.slice(0, 20).map((app: any) => ({
          id: app.id, displayName: app.displayName,
          details: { credentialCount: [...(app.passwordCredentials || []), ...(app.keyCredentials || [])].length }
        }));
        status = affectedCount > (evaluate.threshold || 5) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      case 'count_unlicensed_users': {
        // IDT-007: Count enabled users without licenses
        const users = (data as any)?.value || [];
        const unlicensed = users.filter((u: any) => {
          const licenses = u.assignedLicenses || [];
          return licenses.length === 0 && u.accountEnabled !== false;
        });
        affectedCount = unlicensed.length;
        affectedEntities = unlicensed.slice(0, 20).map((u: any) => ({
          id: u.id, displayName: u.displayName || u.userPrincipalName,
          details: { lastSignIn: u.signInActivity?.lastSignInDateTime || 'Nunca' }
        }));
        status = affectedCount > (evaluate.threshold || 10) ? 'fail' : 'pass';
        description = status === 'fail'
          ? (rule.fail_description || '').replace('{count}', String(affectedCount))
          : rule.pass_description || '';
        break;
      }

      default:
        // Unknown evaluation type - skip
        return null;
    }
  } catch (e) {
    console.error(`[evaluateRule] Error evaluating ${rule.code}:`, e);
    return createNotFoundInsight(rule, rule.not_found_description || 'Erro na avaliação', now, stepResult.stepId);
  }
  
  return createInsight(rule, status, affectedCount, affectedEntities, description, now, stepResult.stepId);
}

// ========== INLINE EVALUATION (Graph API calls inside evaluator) ==========

async function evaluateInlineRule(
  rule: ComplianceRule,
  evalLogic: any,
  accessToken: string,
  now: string
): Promise<M365Insight | null> {
  const evaluate = evalLogic.evaluate;
  
  try {
    switch (evaluate.type) {
      case 'check_sharepoint_anonymous_links_live': {
        // Get root site → drives → check permissions for anonymous links
        const { data: rootSite, error: rootErr } = await graphFetchSafe(accessToken, '/sites/root');
        if (rootErr || !rootSite) {
          return createNotFoundInsight(rule, rule.not_found_description || 'Não foi possível acessar o site raiz do SharePoint', now, '/sites/root');
        }
        
        const { data: drivesData } = await graphFetchSafe(accessToken, `/sites/${rootSite.id}/drives?$top=10`);
        let anonymousLinksCount = 0;
        const sitesWithAnonLinks: Array<{ id: string; displayName: string; details?: Record<string, unknown> }> = [];
        
        if (drivesData) {
          const drives = drivesData.value || [];
          for (const drive of drives.slice(0, 5)) {
            try {
              const { data: permsData } = await graphFetchSafe(accessToken, `/drives/${drive.id}/root/permissions`);
              if (permsData) {
                const anonPerms = (permsData.value || []).filter((p: any) => p.link && p.link.scope === 'anonymous');
                if (anonPerms.length > 0) {
                  anonymousLinksCount += anonPerms.length;
                  sitesWithAnonLinks.push({ id: drive.id, displayName: drive.name, details: { anonymousLinks: anonPerms.length } });
                }
              }
            } catch { /* continue */ }
          }
        }
        
        const status = anonymousLinksCount > (evaluate.threshold || 10) ? 'fail' : 'pass';
        const description = status === 'fail'
          ? (rule.fail_description || '').replace('{{count}}', String(anonymousLinksCount)).replace('{count}', String(anonymousLinksCount))
          : (rule.pass_description || '').replace('{{count}}', String(anonymousLinksCount)).replace('{count}', String(anonymousLinksCount));
        
        return createInsight(rule, status, anonymousLinksCount, sitesWithAnonLinks, description, now, '/drives/{id}/root/permissions');
      }
      
      case 'check_onedrive_sharing_live': {
        // Get users → check OneDrive permissions for wide sharing
        const { data: usersData, error: usersErr } = await graphFetchSafe(accessToken, '/users?$select=id,displayName,userPrincipalName&$top=20');
        if (usersErr || !usersData) {
          return createNotFoundInsight(rule, rule.not_found_description || 'Não foi possível listar usuários', now, '/users');
        }
        
        const users = usersData.value || [];
        let wideShareCount = 0;
        const wideShareUsers: Array<{ id: string; displayName: string; details?: Record<string, unknown> }> = [];
        
        for (const user of users.slice(0, 10)) {
          try {
            const { data: driveData } = await graphFetchSafe(accessToken, `/users/${user.id}/drive/root/permissions`);
            if (driveData) {
              const widePerms = (driveData.value || []).filter((p: any) =>
                p.link && (p.link.scope === 'organization' || p.link.scope === 'anonymous')
              );
              if (widePerms.length > 3) {
                wideShareCount++;
                wideShareUsers.push({ id: user.id, displayName: user.displayName || user.userPrincipalName, details: { sharedItems: widePerms.length } });
              }
            }
          } catch { /* user might not have OneDrive */ }
        }
        
        const status = wideShareCount > (evaluate.threshold || 5) ? 'fail' : 'pass';
        const description = status === 'fail'
          ? (rule.fail_description || '').replace('{{count}}', String(wideShareCount)).replace('{count}', String(wideShareCount))
          : (rule.pass_description || '').replace('{{count}}', String(wideShareCount)).replace('{count}', String(wideShareCount));
        
        return createInsight(rule, status, wideShareCount, wideShareUsers, description, now, '/users/{id}/drive/root/permissions');
      }
      
      default:
        return null;
    }
  } catch (e) {
    console.error(`[evaluateInlineRule] Error evaluating ${rule.code}:`, e);
    return createNotFoundInsight(rule, rule.not_found_description || 'Erro na avaliação inline', now, '');
  }
}

function createInsight(
  rule: ComplianceRule,
  status: 'pass' | 'fail',
  affectedCount: number,
  affectedEntities: Array<{ id: string; displayName: string; details?: Record<string, unknown> }>,
  description: string,
  now: string,
  endpointUsed: string
): M365Insight {
  const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
    critical: 'critical',
    high: 'high',
    medium: 'medium',
    low: 'low',
    info: 'info',
  };
  
  const productMap: Record<string, string> = {
    identities: 'entra_id',
    auth_access: 'entra_id',
    admin_privileges: 'entra_id',
    apps_integrations: 'entra_id',
    email_exchange: 'exchange_online',
    threats_activity: 'defender',
    intune_devices: 'intune',
    pim_governance: 'entra_id',
    sharepoint_onedrive: 'sharepoint',
    teams_collaboration: 'teams',
    defender_security: 'defender',
  };
  
  const portalMap: Record<string, string> = {
    entra_id: 'https://entra.microsoft.com',
    exchange_online: 'https://admin.exchange.microsoft.com',
    defender: 'https://security.microsoft.com',
    intune: 'https://intune.microsoft.com',
    sharepoint: 'https://admin.microsoft.com/sharepoint',
    teams: 'https://admin.teams.microsoft.com',
  };
  
  const product = productMap[rule.category] || 'entra_id';
  
  return {
    id: rule.code,
    code: rule.code,
    category: rule.category,
    product,
    severity: status === 'fail' ? severityMap[rule.severity] || 'medium' : 'info',
    titulo: rule.name,
    criteria: rule.description || '',
    descricaoExecutiva: (description || rule.description || '')
      .replace(/\{(\d+)\}/g, '$1')  // Clean stray {27} → 27 from partial interpolation
      .replace(/\{\{[^}]+\}\}/g, '') // Remove any unresolved {{var}} placeholders
      .replace(/\s{2,}/g, ' ').trim(),
    riscoTecnico: rule.technical_risk || '',
    impactoNegocio: rule.business_impact || '',
    scoreImpacto: status === 'fail' ? rule.weight : 0,
    status,
    affectedCount,
    affectedEntities,
    remediacao: {
      productAfetado: product,
      portalUrl: portalMap[product] || 'https://entra.microsoft.com',
      caminhoPortal: [],
      passosDetalhados: rule.recommendation ? [rule.recommendation] : [],
    },
    detectedAt: now,
    endpointUsado: rule.api_endpoint || endpointUsed,
  };
}

function createNotFoundInsight(
  rule: ComplianceRule,
  description: string,
  now: string,
  endpointUsed: string
): M365Insight {
  const productMap: Record<string, string> = {
    identities: 'entra_id',
    auth_access: 'entra_id',
    admin_privileges: 'entra_id',
    apps_integrations: 'entra_id',
    email_exchange: 'exchange_online',
    threats_activity: 'defender',
    intune_devices: 'intune',
    pim_governance: 'entra_id',
    sharepoint_onedrive: 'sharepoint',
    teams_collaboration: 'teams',
    defender_security: 'defender',
  };
  
  const product = productMap[rule.category] || 'entra_id';
  
  return {
    id: rule.code,
    code: rule.code,
    category: rule.category,
    product,
    severity: 'info',
    titulo: rule.name,
    criteria: rule.description || '',
    descricaoExecutiva: description,
    riscoTecnico: rule.technical_risk || '',
    impactoNegocio: rule.business_impact || '',
    scoreImpacto: 0,
    status: 'not_found' as any,
    affectedCount: 0,
    affectedEntities: [],
    remediacao: {
      productAfetado: product,
      portalUrl: 'https://entra.microsoft.com',
      caminhoPortal: [],
      passosDetalhados: [],
    },
    detectedAt: now,
    endpointUsado: rule.api_endpoint || endpointUsed,
  };
}

// ========== ENVIRONMENT METRICS ==========

function extractEnvironmentMetrics(stepResults: Map<string, StepResult>): EnvironmentMetrics {
  const metrics: EnvironmentMetrics = {
    authType: 'cloud_only',
    totalUsers: 0,
    activeUsers: 0,
    disabledUsers: 0,
    guestUsers: 0,
    mfaEnabledPercent: 0,
    conditionalAccessEnabled: false,
    conditionalAccessPoliciesCount: 0,
    securityDefaultsEnabled: false,
    enterpriseAppsCount: 0,
    appRegistrationsCount: 0,
    storageUsedGB: 0,
    storageTotalGB: 0,
    loginCountries: [],
  };
  
  // Organization info
  const orgResult = stepResults.get('org_info');
  if (orgResult?.data) {
    const org = (orgResult.data as any)?.value?.[0];
    if (org?.onPremisesSyncEnabled) {
      metrics.authType = 'hybrid';
    }
  }
  
  // Domains
  const domainsResult = stepResults.get('domains');
  if (domainsResult?.data) {
    const domains = (domainsResult.data as any)?.value || [];
    if (domains.some((d: any) => d.authenticationType === 'Federated')) {
      metrics.authType = 'federated';
    }
  }
  
  // User counts
  const totalUsersResult = stepResults.get('users_count');
  if (typeof totalUsersResult?.data === 'number') {
    metrics.totalUsers = totalUsersResult.data;
  }
  
  const activeUsersResult = stepResults.get('users_active_count');
  if (typeof activeUsersResult?.data === 'number') {
    metrics.activeUsers = activeUsersResult.data;
  }
  
  const guestsResult = stepResults.get('users_guests_count');
  if (typeof guestsResult?.data === 'number') {
    metrics.guestUsers = guestsResult.data;
  }
  
  const disabledResult = stepResults.get('users_disabled_count');
  if (typeof disabledResult?.data === 'number') {
    metrics.disabledUsers = disabledResult.data;
  } else {
    metrics.disabledUsers = Math.max(0, metrics.totalUsers - metrics.activeUsers);
  }
  
  // MFA status
  const mfaResult = stepResults.get('mfa_registration_details');
  if (mfaResult?.data) {
    const users = (mfaResult.data as any)?.value || [];
    const withMfa = users.filter((u: any) => {
      const methods = u.methodsRegistered || [];
      return methods.includes('microsoftAuthenticatorPush') || 
             methods.includes('softwareOneTimePasscode') || 
             methods.includes('phoneAuthentication');
    });
    metrics.mfaEnabledPercent = users.length > 0 
      ? Math.round((withMfa.length / users.length) * 100) 
      : 0;
  }
  
  // Conditional Access
  const caResult = stepResults.get('conditional_access_policies');
  if (caResult?.data) {
    const policies = (caResult.data as any)?.value || [];
    const enabledPolicies = policies.filter((p: any) => p.state === 'enabled');
    metrics.conditionalAccessEnabled = enabledPolicies.length > 0;
    metrics.conditionalAccessPoliciesCount = enabledPolicies.length;
  }
  
  // Security Defaults
  const secDefaultsResult = stepResults.get('security_defaults');
  if (secDefaultsResult?.data) {
    metrics.securityDefaultsEnabled = (secDefaultsResult.data as any)?.isEnabled === true;
  }
  
  // Applications
  const appsCountResult = stepResults.get('applications_count');
  if (typeof appsCountResult?.data === 'number') {
    metrics.appRegistrationsCount = appsCountResult.data;
  }
  
  const enterpriseAppsResult = stepResults.get('enterprise_apps_count');
  if (typeof enterpriseAppsResult?.data === 'number') {
    metrics.enterpriseAppsCount = enterpriseAppsResult.data;
  }
  
  // Sign-in countries
  const signInsResult = stepResults.get('signin_logs');
  if (signInsResult?.data) {
    const signIns = (signInsResult.data as any)?.value || [];
    const countries = new Map<string, { success: number; fail: number }>();
    signIns.forEach((s: any) => {
      const country = s.location?.countryOrRegion;
      if (country) {
        const current = countries.get(country) || { success: 0, fail: 0 };
        if (s.status?.errorCode === 0) {
          current.success++;
        } else {
          current.fail++;
        }
        countries.set(country, current);
      }
    });
    metrics.loginCountries = Array.from(countries.entries())
      .map(([country, counts]) => ({ country, success: counts.success, fail: counts.fail }))
      .sort((a, b) => (b.success + b.fail) - (a.success + a.fail))
      .slice(0, 5);
  }
  
  return metrics;
}

// ========== SUB-FUNCTION CALLER ==========

interface CollectorResult {
  insights: M365Insight[];
  errors: string[];
}

async function callSubFunction(
  supabaseUrl: string, 
  supabaseKey: string, 
  functionName: string, 
  accessToken: string, 
  now: string
): Promise<CollectorResult> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ access_token: accessToken, now }),
    });
    if (!res.ok) {
      return { insights: [], errors: [`${functionName}: ${res.status} ${res.statusText}`] };
    }
    return await res.json();
  } catch (e) {
    return { insights: [], errors: [`${functionName}: ${String(e)}`] };
  }
}

// ========== MAIN HANDLER ==========

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { tenant_record_id, blueprint_filter } = await req.json();
    if (!tenant_record_id) {
      return new Response(JSON.stringify({ success: false, error: 'tenant_record_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[m365-security-posture] Starting data-driven analysis for tenant: ${tenant_record_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Load tenant
    const { data: tenant } = await supabase
      .from('m365_tenants')
      .select('*')
      .eq('id', tenant_record_id)
      .single();
      
    if (!tenant) {
      return new Response(JSON.stringify({ success: false, error: 'Tenant not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Load global config
    const { data: config } = await supabase
      .from('m365_global_config')
      .select('*')
      .limit(1)
      .single();
      
    if (!config) {
      return new Response(JSON.stringify({ success: false, error: 'Config not found' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Load active blueprints for M365 (optionally filtered by scope)
    let blueprintQuery = supabase
      .from('device_blueprints')
      .select('*')
      .eq('device_type_id', '5d1a7095-2d7b-4541-873d-4b03c3d6122f') // M365 device type
      .eq('is_active', true)
      .in('executor_type', ['edge_function', 'hybrid']);

    // Scope config: maps scope to blueprint pattern and rule categories
    const scopeConfig: Record<string, { blueprintPattern: string; categories: string[] }> = {
      exchange_online: { 
        blueprintPattern: '%Exchange%', 
        categories: ['email_exchange', 'threats_activity', 'pim_governance'] 
      },
      entra_id: { 
        blueprintPattern: '%Entra%', 
        categories: ['identities', 'auth_access', 'admin_privileges', 'apps_integrations'] 
      },
    };

    if (blueprint_filter && scopeConfig[blueprint_filter]) {
      const cfg = scopeConfig[blueprint_filter];
      blueprintQuery = blueprintQuery.ilike('name', cfg.blueprintPattern);
      console.log(`[m365-security-posture] Filtering blueprints by scope '${blueprint_filter}': pattern=${cfg.blueprintPattern}`);
    }

    const { data: blueprints } = await blueprintQuery;
    
    if (!blueprints || blueprints.length === 0) {
      console.log('[m365-security-posture] No blueprints found, using legacy mode');
      return await handleLegacyMode(req, tenant, config, supabaseUrl, supabaseKey);
    }

    console.log(`[m365-security-posture] Loaded ${blueprints.length} blueprints: ${blueprints.map(b => b.name).join(', ')}`);

    // 4. Load compliance rules (optionally filtered by scope)
    let rulesQuery = supabase
      .from('compliance_rules')
      .select('*')
      .eq('device_type_id', '5d1a7095-2d7b-4541-873d-4b03c3d6122f')
      .eq('is_active', true);

    if (blueprint_filter && scopeConfig[blueprint_filter]) {
      const cfg = scopeConfig[blueprint_filter];
      rulesQuery = rulesQuery.in('category', cfg.categories);
      console.log(`[m365-security-posture] Filtering rules by categories: ${cfg.categories.join(', ')}`);
    }

    const { data: rules } = await rulesQuery;

    console.log(`[m365-security-posture] Loaded ${rules?.length || 0} compliance rules`);

    // 5. Decrypt client secret
    const enc = config.client_secret_encrypted;
    let secret = '';
    if (!enc.includes(':')) {
      secret = atob(enc);
    } else {
      const keyHex = Deno.env.get('M365_ENCRYPTION_KEY') ?? '';
      const [ivH, ctH] = enc.split(':');
      const hex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map(b => parseInt(b, 16)));
      const key = await crypto.subtle.importKey('raw', hex(keyHex), { name: 'AES-GCM' }, false, ['decrypt']);
      const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hex(ivH) }, key, hex(ctH));
      secret = new TextDecoder().decode(dec);
    }

    // 6. Get access token
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant.tenant_id}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${config.app_id}&client_secret=${encodeURIComponent(secret)}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials`,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[m365-security-posture] Token failed: ${errText}`);
      return new Response(JSON.stringify({ success: false, error: 'Token failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { access_token } = await tokenRes.json();
    const now = new Date();
    const nowIso = now.toISOString();

    // 7. Execute Graph API steps from ALL blueprints
    const allEdgeSteps: BlueprintStep[] = [];
    for (const bp of blueprints) {
      const steps = (bp.collection_steps as any)?.steps || [];
      const edgeSteps = steps.filter((s: BlueprintStep) => s.executor === 'edge_function' && s.runtime === 'graph_api');
      allEdgeSteps.push(...edgeSteps);
    }
    
    console.log(`[m365-security-posture] Executing ${allEdgeSteps.length} Graph API steps from ${blueprints.length} blueprints...`);

    const stepPromises = allEdgeSteps.map((step: BlueprintStep) => 
      executeGraphApiStep(access_token, step, { now })
    );
    
    const stepResultsArray = await Promise.all(stepPromises);
    const stepResults = new Map<string, StepResult>();
    
    for (const result of stepResultsArray) {
      stepResults.set(result.stepId, result);
    }

    console.log(`[m365-security-posture] Completed ${stepResults.size} steps`);

    // 8. Evaluate compliance rules
    const allInsights: M365Insight[] = [];
    const allErrors: string[] = [];

    const rulePromises = (rules || []).map(rule => evaluateRule(rule, stepResults, nowIso, access_token));
    const ruleResults = await Promise.all(rulePromises);
    for (const insight of ruleResults) {
      if (insight) {
        allInsights.push(insight);
      }
    }

    console.log(`[m365-security-posture] Evaluated ${allInsights.length} insights from database rules`);

    // 9. Collect step errors (sub-functions removed - all data now comes from segmented blueprints)
    for (const [stepId, result] of stepResults) {
      if (result.error) {
        allErrors.push(`${stepId}: ${result.error}`);
      }
    }

    console.log(`[m365-security-posture] Total: ${allInsights.length} insights, ${allErrors.length} errors`);

    // 10. Extract environment metrics
    const environmentMetrics = extractEnvironmentMetrics(stepResults);

    // 11. Calculate category breakdown
    const categories = [
      'identities', 'auth_access', 'admin_privileges', 'apps_integrations', 
      'email_exchange', 'threats_activity', 'intune_devices', 'pim_governance',
      'sharepoint_onedrive', 'teams_collaboration', 'defender_security'
    ];
    
    const categoryLabels: Record<string, string> = {
      identities: 'Identidades',
      auth_access: 'Autenticação & Acesso',
      admin_privileges: 'Privilégios Admin',
      apps_integrations: 'Aplicações & Integrações',
      email_exchange: 'Email & Exchange',
      threats_activity: 'Ameaças & Atividades',
      intune_devices: 'Intune & Dispositivos',
      pim_governance: 'PIM & Governança',
      sharepoint_onedrive: 'SharePoint & OneDrive',
      teams_collaboration: 'Teams & Colaboração',
      defender_security: 'Defender & DLP',
    };

    const categoryBreakdown = categories.map(cat => {
      const catInsights = allInsights.filter(i => i.category === cat);
      // Filter out not_found items from scoring
      const applicableInsights = catInsights.filter(i => (i as any).status !== 'not_found');
      const failCount = applicableInsights.filter(i => i.status === 'fail').length;
      const totalPenalty = applicableInsights.reduce((sum, i) => sum + (i.status === 'fail' ? i.scoreImpacto : 0), 0);
      const criticalCount = applicableInsights.filter(i => i.status === 'fail' && i.severity === 'critical').length;
      const highCount = applicableInsights.filter(i => i.status === 'fail' && i.severity === 'high').length;

      return {
        category: cat,
        label: categoryLabels[cat] || cat,
        count: catInsights.length,
        failCount,
        score: applicableInsights.length > 0 ? Math.max(0, 100 - totalPenalty * 3) : -1,
        criticalCount,
        highCount,
      };
    }).filter(cat => cat.count > 0);

    // 12. Calculate overall score (exclude not_found items)
    const applicableInsights = allInsights.filter(i => (i as any).status !== 'not_found');
    const totalPenalty = applicableInsights.reduce((sum, i) => sum + (i.status === 'fail' ? i.scoreImpacto : 0), 0);
    const score = Math.max(0, Math.min(100, 100 - totalPenalty));
    const classification = score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'attention' : 'critical';

    // 13. Calculate summary
    const failedInsights = allInsights.filter(i => i.status === 'fail');
    const summary = {
      critical: failedInsights.filter(i => i.severity === 'critical').length,
      high: failedInsights.filter(i => i.severity === 'high').length,
      medium: failedInsights.filter(i => i.severity === 'medium').length,
      low: failedInsights.filter(i => i.severity === 'low').length,
      info: allInsights.filter(i => i.severity === 'info').length,
      total: allInsights.length,
    };

    console.log(`[m365-security-posture] Score: ${score}, Classification: ${classification}`);

    return new Response(JSON.stringify({
      success: true,
      score,
      classification,
      summary,
      categoryBreakdown,
      insights: allInsights,
      environmentMetrics,
      errors: allErrors.length > 0 ? allErrors : undefined,
      tenant: { 
        id: tenant.tenant_id, 
        domain: tenant.tenant_domain || '', 
        displayName: tenant.display_name 
      },
      analyzedAt: nowIso,
      analyzedPeriod: {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: nowIso,
      },
      // Metadata about data-driven execution
      _meta: {
        blueprintIds: blueprints.map(b => b.id),
        blueprintNames: blueprints.map(b => b.name),
        blueprintCount: blueprints.length,
        stepsExecuted: stepResults.size,
        rulesEvaluated: rules?.length || 0,
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(`[m365-security-posture] Error: ${String(e)}`);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ========== LEGACY MODE (fallback if no blueprint) ==========

async function handleLegacyMode(
  _req: Request,
  tenant: any,
  config: any,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Response> {
  // This function would contain the original hardcoded logic as a fallback
  // For now, we return an error asking to configure the blueprint
  return new Response(JSON.stringify({ 
    success: false, 
    error: 'No M365 blueprint configured. Please run the database migration to populate device_blueprints.',
    hint: 'Check device_blueprints table for device_type_id = 5d1a7095-2d7b-4541-873d-4b03c3d6122f'
  }), {
    status: 500, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
