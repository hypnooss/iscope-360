import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

interface ComplianceCheck {
  id: string;
  name: string;
  description: string;
  category: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation?: string;
  details?: string;
  evidence?: Array<{ label: string; value: string; type?: string }>;
  rawData?: Record<string, unknown>;
  apiEndpoint?: string;
  requiresLicense?: string;
  licenseError?: boolean;
}

interface ComplianceCategory {
  name: string;
  icon: string;
  checks: ComplianceCheck[];
  passRate: number;
}

// ===== Encryption utilities =====
// Derive CryptoKey from hex string (must be 64 hex characters = 32 bytes)
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('M365_ENCRYPTION_KEY not configured or invalid (must be 64 hex characters)');
  }
  
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(keyHex.substr(i * 2, 2), 16);
  }
  
  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

// Convert hex string to Uint8Array with proper ArrayBuffer
function fromHex(hex: string): Uint8Array {
  const length = hex.length / 2;
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Decrypt secret using AES-256-GCM
// Supports legacy Base64 format for backwards compatibility
async function decryptSecret(encrypted: string): Promise<string> {
  if (encrypted.includes(':')) {
    try {
      const [ivHex, ctHex] = encrypted.split(':');
      const key = await getEncryptionKey();
      const iv = fromHex(ivHex);
      const ciphertext = fromHex(ctHex);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as Uint8Array<ArrayBuffer> },
        key,
        ciphertext as unknown as Uint8Array<ArrayBuffer>
      );
      
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('AES-GCM decryption failed:', error);
      return '';
    }
  }
  
  // Legacy Base64 fallback
  try {
    console.warn('Using legacy Base64 decryption - please re-save config to upgrade to AES-GCM');
    return atob(encrypted);
  } catch {
    return '';
  }
}

// ===== Microsoft Graph API helpers =====
async function getAccessToken(tenantId: string, appId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function graphApiCall(accessToken: string, endpoint: string): Promise<{ data: any; error?: string; licenseRequired?: boolean }> {
  try {
    const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Access denied';
      
      // Check for license-related errors
      if (errorMessage.includes('license') || errorMessage.includes('Premium') || 
          errorMessage.includes('P1') || errorMessage.includes('P2')) {
        return { data: null, error: errorMessage, licenseRequired: true };
      }
      return { data: null, error: errorMessage };
    }

    if (!response.ok) {
      const error = await response.text();
      return { data: null, error };
    }

    const data = await response.json();
    return { data };
  } catch (err: unknown) {
    const error = err as Error;
    return { data: null, error: error.message };
  }
}

async function graphApiBetaCall(accessToken: string, endpoint: string): Promise<{ data: any; error?: string; licenseRequired?: boolean }> {
  try {
    const response = await fetch(`https://graph.microsoft.com/beta${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || 'Access denied';
      
      if (errorMessage.includes('license') || errorMessage.includes('Premium') || 
          errorMessage.includes('P1') || errorMessage.includes('P2')) {
        return { data: null, error: errorMessage, licenseRequired: true };
      }
      return { data: null, error: errorMessage };
    }

    if (!response.ok) {
      const error = await response.text();
      return { data: null, error };
    }

    const data = await response.json();
    return { data };
  } catch (err: unknown) {
    const error = err as Error;
    return { data: null, error: error.message };
  }
}

// ===== Compliance Checks =====

async function checkSecurityDefaults(accessToken: string): Promise<ComplianceCheck[]> {
  const checks: ComplianceCheck[] = [];
  
  const { data, error, licenseRequired } = await graphApiCall(
    accessToken, 
    '/policies/identitySecurityDefaultsEnforcementPolicy'
  );

  if (error) {
    checks.push({
      id: 'SD-001',
      name: 'Security Defaults',
      description: 'Verifica se Security Defaults está habilitado como baseline de segurança',
      category: 'Security Defaults',
      status: licenseRequired ? 'pending' : 'warning',
      severity: 'critical',
      recommendation: 'Não foi possível verificar o status de Security Defaults',
      details: error,
      apiEndpoint: '/policies/identitySecurityDefaultsEnforcementPolicy',
      licenseError: licenseRequired,
    });
    return checks;
  }

  const isEnabled = data?.isEnabled === true;

  checks.push({
    id: 'SD-001',
    name: 'Security Defaults Habilitado',
    description: 'Security Defaults fornece proteção básica contra ataques de identidade',
    category: 'Security Defaults',
    status: isEnabled ? 'pass' : 'warning',
    severity: 'critical',
    recommendation: isEnabled 
      ? 'Security Defaults está ativo, fornecendo proteção baseline'
      : 'Security Defaults está desabilitado. Certifique-se de ter políticas de Acesso Condicional equivalentes.',
    details: isEnabled 
      ? 'Security Defaults ativo - MFA obrigatório para todos, bloqueio de auth legada'
      : 'Security Defaults desabilitado. Verifique se há Conditional Access Policies como alternativa.',
    evidence: [
      { label: 'Status', value: isEnabled ? 'Habilitado' : 'Desabilitado', type: 'text' },
    ],
    rawData: data,
    apiEndpoint: '/policies/identitySecurityDefaultsEnforcementPolicy',
  });

  return checks;
}

async function checkConditionalAccessPolicies(accessToken: string): Promise<ComplianceCheck[]> {
  const checks: ComplianceCheck[] = [];
  
  const { data, error, licenseRequired } = await graphApiCall(
    accessToken, 
    '/identity/conditionalAccess/policies'
  );

  if (error) {
    // CA requires P1/P2 license
    checks.push({
      id: 'CA-001',
      name: 'Políticas de Acesso Condicional',
      description: 'Verifica se há políticas de Acesso Condicional configuradas',
      category: 'Acesso Condicional',
      status: 'pending',
      severity: 'critical',
      recommendation: licenseRequired 
        ? 'Acesso Condicional requer licença Azure AD Premium P1 ou P2'
        : 'Não foi possível verificar políticas de Acesso Condicional',
      details: error,
      apiEndpoint: '/identity/conditionalAccess/policies',
      requiresLicense: 'P1',
      licenseError: licenseRequired,
    });
    return checks;
  }

  const policies = data?.value || [];
  const enabledPolicies = policies.filter((p: any) => p.state === 'enabled');
  
  // Check for legacy auth block policy
  const legacyAuthBlocked = enabledPolicies.some((p: any) => {
    const clientAppTypes = p.conditions?.clientAppTypes || [];
    const hasLegacyClients = clientAppTypes.some((t: string) => 
      ['exchangeActiveSync', 'other'].includes(t)
    );
    const blocksAccess = p.grantControls?.builtInControls?.includes('block');
    return hasLegacyClients && blocksAccess;
  });

  checks.push({
    id: 'CA-001',
    name: 'Bloquear Autenticação Legada',
    description: 'Política bloqueando protocolos legados (IMAP, POP3, SMTP básico)',
    category: 'Acesso Condicional',
    status: legacyAuthBlocked ? 'pass' : 'fail',
    severity: 'critical',
    recommendation: legacyAuthBlocked 
      ? 'Autenticação legada está bloqueada por política de Acesso Condicional'
      : 'Crie uma política de Acesso Condicional para bloquear clientes de autenticação legada',
    evidence: [
      { label: 'Políticas Ativas', value: String(enabledPolicies.length), type: 'text' },
      { label: 'Auth Legada Bloqueada', value: legacyAuthBlocked ? 'Sim' : 'Não', type: 'text' },
    ],
    rawData: { policiesCount: policies.length, enabledCount: enabledPolicies.length },
    apiEndpoint: '/identity/conditionalAccess/policies',
    requiresLicense: 'P1',
  });

  // Check for MFA policy for admins
  const mfaForAdmins = enabledPolicies.some((p: any) => {
    const includesAdminRoles = p.conditions?.users?.includeRoles?.length > 0;
    const requiresMfa = p.grantControls?.builtInControls?.includes('mfa');
    return includesAdminRoles && requiresMfa;
  });

  checks.push({
    id: 'CA-002',
    name: 'MFA para Administradores via CA',
    description: 'Política de Acesso Condicional exigindo MFA para roles administrativos',
    category: 'Acesso Condicional',
    status: mfaForAdmins ? 'pass' : 'warning',
    severity: 'critical',
    recommendation: mfaForAdmins 
      ? 'Existe política exigindo MFA para administradores'
      : 'Considere criar política de CA exigindo MFA para todos os roles administrativos',
    evidence: [
      { label: 'MFA para Admins', value: mfaForAdmins ? 'Configurado' : 'Não encontrado', type: 'text' },
    ],
    apiEndpoint: '/identity/conditionalAccess/policies',
    requiresLicense: 'P1',
  });

  // Check for sign-in risk policy
  const signInRiskPolicy = enabledPolicies.some((p: any) => {
    const hasRiskLevels = (p.conditions?.signInRiskLevels || []).length > 0;
    return hasRiskLevels;
  });

  checks.push({
    id: 'CA-005',
    name: 'Política de Risco de Login',
    description: 'Política baseada em risco de sign-in (requer Identity Protection)',
    category: 'Acesso Condicional',
    status: signInRiskPolicy ? 'pass' : 'warning',
    severity: 'high',
    recommendation: signInRiskPolicy 
      ? 'Política de risco de login configurada'
      : 'Considere habilitar Identity Protection e criar políticas baseadas em risco',
    evidence: [
      { label: 'Risk Policy', value: signInRiskPolicy ? 'Configurada' : 'Não encontrada', type: 'text' },
    ],
    apiEndpoint: '/identity/conditionalAccess/policies',
    requiresLicense: 'P2',
  });

  return checks;
}

async function checkAuthenticationMethods(accessToken: string): Promise<ComplianceCheck[]> {
  const checks: ComplianceCheck[] = [];
  
  const { data, error } = await graphApiCall(
    accessToken, 
    '/policies/authenticationMethodsPolicy'
  );

  if (error) {
    checks.push({
      id: 'AUTH-001',
      name: 'Métodos de Autenticação',
      description: 'Verifica políticas de métodos de autenticação',
      category: 'Métodos de Autenticação',
      status: 'pending',
      severity: 'medium',
      recommendation: 'Não foi possível verificar métodos de autenticação',
      details: error,
      apiEndpoint: '/policies/authenticationMethodsPolicy',
    });
    return checks;
  }

  const methods = data?.authenticationMethodConfigurations || [];
  
  // Check SMS
  const smsMethod = methods.find((m: any) => m.id === 'Sms');
  const smsEnabled = smsMethod?.state === 'enabled';

  checks.push({
    id: 'AUTH-001',
    name: 'SMS como Fator de Autenticação',
    description: 'SMS é considerado menos seguro devido a vulnerabilidades de SIM swap',
    category: 'Métodos de Autenticação',
    status: smsEnabled ? 'warning' : 'pass',
    severity: 'medium',
    recommendation: smsEnabled 
      ? 'Considere desabilitar SMS e migrar para Microsoft Authenticator ou FIDO2'
      : 'SMS está desabilitado - boa prática de segurança',
    evidence: [
      { label: 'SMS Status', value: smsEnabled ? 'Habilitado' : 'Desabilitado', type: 'text' },
    ],
    rawData: smsMethod,
    apiEndpoint: '/policies/authenticationMethodsPolicy',
  });

  // Check Voice
  const voiceMethod = methods.find((m: any) => m.id === 'Voice');
  const voiceEnabled = voiceMethod?.state === 'enabled';

  checks.push({
    id: 'AUTH-002',
    name: 'Ligação Telefônica como MFA',
    description: 'Chamadas de voz são vulneráveis a ataques de engenharia social e SIM swap',
    category: 'Métodos de Autenticação',
    status: voiceEnabled ? 'warning' : 'pass',
    severity: 'medium',
    recommendation: voiceEnabled 
      ? 'Considere desabilitar chamadas de voz como método de MFA'
      : 'Chamadas de voz desabilitadas - boa prática de segurança',
    evidence: [
      { label: 'Voice Status', value: voiceEnabled ? 'Habilitado' : 'Desabilitado', type: 'text' },
    ],
    rawData: voiceMethod,
    apiEndpoint: '/policies/authenticationMethodsPolicy',
  });

  // Check Authenticator
  const authApp = methods.find((m: any) => m.id === 'MicrosoftAuthenticator');
  const authAppEnabled = authApp?.state === 'enabled';

  checks.push({
    id: 'AUTH-003',
    name: 'Microsoft Authenticator Habilitado',
    description: 'Microsoft Authenticator é o método recomendado para MFA',
    category: 'Métodos de Autenticação',
    status: authAppEnabled ? 'pass' : 'fail',
    severity: 'low',
    recommendation: authAppEnabled 
      ? 'Microsoft Authenticator está habilitado'
      : 'Habilite o Microsoft Authenticator como método de MFA',
    evidence: [
      { label: 'Authenticator', value: authAppEnabled ? 'Habilitado' : 'Desabilitado', type: 'text' },
    ],
    rawData: authApp,
    apiEndpoint: '/policies/authenticationMethodsPolicy',
  });

  // Check FIDO2
  const fido2 = methods.find((m: any) => m.id === 'Fido2');
  const fido2Enabled = fido2?.state === 'enabled';

  checks.push({
    id: 'AUTH-004',
    name: 'FIDO2 / Passkeys',
    description: 'FIDO2 oferece autenticação passwordless resistente a phishing',
    category: 'Métodos de Autenticação',
    status: fido2Enabled ? 'pass' : 'warning',
    severity: 'low',
    recommendation: fido2Enabled 
      ? 'FIDO2/Passkeys habilitado - excelente para segurança'
      : 'Considere habilitar FIDO2 para autenticação passwordless',
    evidence: [
      { label: 'FIDO2', value: fido2Enabled ? 'Habilitado' : 'Desabilitado', type: 'text' },
    ],
    rawData: fido2,
    apiEndpoint: '/policies/authenticationMethodsPolicy',
  });

  return checks;
}

async function checkMfaRegistration(accessToken: string): Promise<ComplianceCheck[]> {
  const checks: ComplianceCheck[] = [];
  
  // This endpoint requires Reports.Read.All permission
  const { data, error, licenseRequired } = await graphApiBetaCall(
    accessToken, 
    '/reports/authenticationMethods/userRegistrationDetails?$top=999'
  );

  if (error) {
    checks.push({
      id: 'MFA-002',
      name: 'Taxa de Adoção de MFA',
      description: 'Percentual de usuários com MFA registrado',
      category: 'Autenticação Multi-Fator',
      status: 'pending',
      severity: 'high',
      recommendation: licenseRequired 
        ? 'Relatórios de MFA requerem licença Azure AD Premium'
        : 'Não foi possível verificar registros de MFA. Verifique a permissão Reports.Read.All',
      details: error,
      apiEndpoint: '/reports/authenticationMethods/userRegistrationDetails',
      licenseError: licenseRequired,
    });
    return checks;
  }

  const users = data?.value || [];
  const totalUsers = users.length;
  const mfaRegistered = users.filter((u: any) => u.isMfaRegistered === true).length;
  const mfaPercentage = totalUsers > 0 ? Math.round((mfaRegistered / totalUsers) * 100) : 0;

  let status: 'pass' | 'warning' | 'fail' = 'fail';
  if (mfaPercentage >= 90) status = 'pass';
  else if (mfaPercentage >= 70) status = 'warning';

  checks.push({
    id: 'MFA-002',
    name: 'Taxa de Adoção de MFA',
    description: 'Percentual de usuários com MFA registrado (alvo: >90%)',
    category: 'Autenticação Multi-Fator',
    status,
    severity: 'high',
    recommendation: status === 'pass' 
      ? `Excelente! ${mfaPercentage}% dos usuários têm MFA registrado`
      : `Apenas ${mfaPercentage}% dos usuários têm MFA. Implemente campanhas de adoção.`,
    details: `${mfaRegistered} de ${totalUsers} usuários com MFA registrado`,
    evidence: [
      { label: 'Total de Usuários', value: String(totalUsers), type: 'text' },
      { label: 'Com MFA', value: String(mfaRegistered), type: 'text' },
      { label: 'Percentual', value: `${mfaPercentage}%`, type: 'text' },
    ],
    rawData: { totalUsers, mfaRegistered, mfaPercentage },
    apiEndpoint: '/reports/authenticationMethods/userRegistrationDetails',
  });

  return checks;
}

async function checkPrivilegedUsers(accessToken: string): Promise<ComplianceCheck[]> {
  const checks: ComplianceCheck[] = [];
  
  // Get Global Administrator role
  const { data: rolesData, error: rolesError } = await graphApiCall(
    accessToken, 
    '/directoryRoles'
  );

  if (rolesError) {
    checks.push({
      id: 'PRIV-001',
      name: 'Administradores Globais',
      description: 'Número de Global Admins no tenant',
      category: 'Usuários Privilegiados',
      status: 'pending',
      severity: 'high',
      recommendation: 'Não foi possível verificar roles de diretório',
      details: rolesError,
      apiEndpoint: '/directoryRoles',
    });
    return checks;
  }

  const roles = rolesData?.value || [];
  const globalAdminRole = roles.find((r: any) => 
    r.displayName === 'Global Administrator' || r.roleTemplateId === '62e90394-69f5-4237-9190-012177145e10'
  );

  if (!globalAdminRole) {
    checks.push({
      id: 'PRIV-001',
      name: 'Administradores Globais',
      description: 'Número de Global Admins no tenant',
      category: 'Usuários Privilegiados',
      status: 'warning',
      severity: 'high',
      recommendation: 'Não foi possível encontrar a role de Global Administrator',
      apiEndpoint: '/directoryRoles',
    });
    return checks;
  }

  // Get members of Global Admin role
  const { data: membersData, error: membersError } = await graphApiCall(
    accessToken, 
    `/directoryRoles/${globalAdminRole.id}/members`
  );

  if (membersError) {
    checks.push({
      id: 'PRIV-001',
      name: 'Administradores Globais',
      description: 'Número de Global Admins no tenant',
      category: 'Usuários Privilegiados',
      status: 'pending',
      severity: 'high',
      recommendation: 'Não foi possível listar membros do Global Administrator',
      details: membersError,
      apiEndpoint: `/directoryRoles/${globalAdminRole.id}/members`,
    });
    return checks;
  }

  const globalAdmins = membersData?.value || [];
  const adminCount = globalAdmins.length;

  let status: 'pass' | 'warning' | 'fail' = 'pass';
  if (adminCount > 5) status = 'fail';
  else if (adminCount > 4 || adminCount < 2) status = 'warning';

  checks.push({
    id: 'PRIV-001',
    name: 'Número de Administradores Globais',
    description: 'Recomendado: 2-4 Global Admins para balancear segurança e disponibilidade',
    category: 'Usuários Privilegiados',
    status,
    severity: 'high',
    recommendation: status === 'pass' 
      ? `${adminCount} Global Admins - dentro do recomendado`
      : adminCount > 4 
        ? `${adminCount} Global Admins é excessivo. Reduza para 2-4 e use roles específicos.`
        : adminCount < 2 
          ? 'Apenas 1 Global Admin é arriscado. Adicione pelo menos mais um para redundância.'
          : `${adminCount} Global Admins`,
    details: `Administradores: ${globalAdmins.map((a: any) => a.displayName || a.userPrincipalName).join(', ')}`,
    evidence: [
      { label: 'Total Global Admins', value: String(adminCount), type: 'text' },
      { label: 'Recomendado', value: '2-4', type: 'text' },
      { label: 'Administradores', value: globalAdmins.map((a: any) => a.userPrincipalName).join('\n'), type: 'list' },
    ],
    rawData: { adminCount, admins: globalAdmins },
    apiEndpoint: `/directoryRoles/${globalAdminRole.id}/members`,
  });

  return checks;
}

function calculateScore(checks: ComplianceCheck[]): number {
  const weights = {
    critical: 25,
    high: 15,
    medium: 8,
    low: 4,
  };

  let totalWeight = 0;
  let earnedWeight = 0;

  for (const check of checks) {
    if (check.status === 'pending') continue; // Skip pending checks
    if ((check.status as string) === 'not_found') continue; // Skip N/A checks
    
    const weight = weights[check.severity];
    totalWeight += weight;

    if (check.status === 'pass') {
      earnedWeight += weight;
    } else if (check.status === 'warning') {
      earnedWeight += weight * 0.5;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round((earnedWeight / totalWeight) * 100);
}

function organizeByCategory(checks: ComplianceCheck[]): ComplianceCategory[] {
  const categoryMap = new Map<string, ComplianceCheck[]>();
  const categoryIcons: Record<string, string> = {
    'Security Defaults': 'shield',
    'Acesso Condicional': 'lock',
    'Métodos de Autenticação': 'key',
    'Autenticação Multi-Fator': 'smartphone',
    'Usuários Privilegiados': 'users',
  };

  for (const check of checks) {
    const existing = categoryMap.get(check.category) || [];
    existing.push(check);
    categoryMap.set(check.category, existing);
  }

  const categories: ComplianceCategory[] = [];
  
  for (const [name, categoryChecks] of categoryMap) {
    const passed = categoryChecks.filter(c => c.status === 'pass').length;
    const applicable = categoryChecks.filter(c => c.status !== 'pending').length;
    const passRate = applicable > 0 ? Math.round((passed / applicable) * 100) : 0;

    categories.push({
      name,
      icon: categoryIcons[name] || 'check-circle',
      checks: categoryChecks,
      passRate,
    });
  }

  return categories;
}

// ===== Main handler =====
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { tenant_record_id } = await req.json();
    
    if (!tenant_record_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_record_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[entra-id-compliance] Starting analysis for tenant: ${tenant_record_id}`);

    // Get tenant info
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('m365_tenants')
      .select('*')
      .eq('id', tenant_record_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get global config (app_id and client_secret)
    const { data: globalConfig, error: configError } = await supabaseAdmin
      .from('m365_global_config')
      .select('*')
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      return new Response(
        JSON.stringify({ error: 'M365 global configuration not found' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt client secret
    const clientSecret = await decryptSecret(globalConfig.client_secret_encrypted);

    // Get access token
    const accessToken = await getAccessToken(
      tenant.tenant_id,
      globalConfig.app_id,
      clientSecret
    );

    console.log('[entra-id-compliance] Access token obtained, running checks...');

    // Run all checks in parallel
    const [
      securityDefaultsChecks,
      conditionalAccessChecks,
      authMethodsChecks,
      mfaRegistrationChecks,
      privilegedUsersChecks,
    ] = await Promise.all([
      checkSecurityDefaults(accessToken),
      checkConditionalAccessPolicies(accessToken),
      checkAuthenticationMethods(accessToken),
      checkMfaRegistration(accessToken),
      checkPrivilegedUsers(accessToken),
    ]);

    // Combine all checks
    const allChecks = [
      ...securityDefaultsChecks,
      ...conditionalAccessChecks,
      ...authMethodsChecks,
      ...mfaRegistrationChecks,
      ...privilegedUsersChecks,
    ];

    // Calculate metrics
    const passed = allChecks.filter(c => c.status === 'pass').length;
    const failed = allChecks.filter(c => c.status === 'fail').length;
    const warnings = allChecks.filter(c => c.status === 'warning').length;
    const pending = allChecks.filter(c => c.status === 'pending').length;
    const overallScore = calculateScore(allChecks);

    // Organize by category
    const categories = organizeByCategory(allChecks);

    // Collect licensing notes
    const licensingNotes: string[] = [];
    const licenseChecks = allChecks.filter(c => c.licenseError);
    if (licenseChecks.length > 0) {
      licensingNotes.push('Algumas verificações requerem licença Azure AD Premium (P1/P2)');
      licensingNotes.push(`${licenseChecks.length} verificação(ões) não puderam ser executadas por falta de licença`);
    }

    const report = {
      overallScore,
      totalChecks: allChecks.length,
      passed,
      failed,
      warnings,
      pending,
      categories,
      generatedAt: new Date().toISOString(),
      tenantInfo: {
        tenantId: tenant.tenant_id,
        displayName: tenant.display_name || tenant.tenant_domain,
        domain: tenant.tenant_domain,
      },
      licensingNotes: licensingNotes.length > 0 ? licensingNotes : undefined,
    };

    console.log(`[entra-id-compliance] Analysis complete. Score: ${overallScore}`);

    return new Response(
      JSON.stringify(report),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const error = err as Error;
    console.error('[entra-id-compliance] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
