import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

interface SecurityInsightsRequest {
  tenant_record_id: string;
  date_from?: string;
  date_to?: string;
}

interface AffectedUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  details?: Record<string, unknown>;
}

interface SecurityInsight {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'identity_security' | 'behavior_risk' | 'governance';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  affectedCount: number;
  affectedUsers: AffectedUser[];
  criteria: string;
  recommendation: string;
  detectedAt: string;
  timeRange: { from: string; to: string };
}

// Encryption utilities
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex) {
    throw new Error('M365_ENCRYPTION_KEY não está configurada');
  }
  
  const keyBytes = fromHex(keyHex);
  return await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

async function decryptSecret(encrypted: string): Promise<string> {
  if (!encrypted.includes(':')) {
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  }
  
  try {
    const [ivHex, ciphertextHex] = encrypted.split(':');
    const iv = fromHex(ivHex);
    const ciphertext = fromHex(ciphertextHex);
    const key = await getEncryptionKey();
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Falha ao decriptar secret');
  }
}

async function getAccessToken(tenantId: string, appId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token request failed:', errorText);
    throw new Error(`Falha ao obter access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch sign-in logs from Graph API
async function fetchSignInLogs(accessToken: string, dateFrom: string, dateTo: string): Promise<any[]> {
  const url = `https://graph.microsoft.com/v1.0/auditLogs/signIns?$filter=createdDateTime ge ${dateFrom} and createdDateTime le ${dateTo}&$top=500&$orderby=createdDateTime desc`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('PREMIUM_LICENSE_REQUIRED');
    }
    const errorText = await response.text();
    console.error('Sign-in logs fetch error:', response.status, errorText);
    throw new Error(`Falha ao buscar logs de sign-in: ${response.status}`);
  }
  
  const data = await response.json();
  return data.value || [];
}

// Fetch directory audit logs
async function fetchDirectoryAuditLogs(accessToken: string, dateFrom: string, dateTo: string): Promise<any[]> {
  const url = `https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?$filter=activityDateTime ge ${dateFrom} and activityDateTime le ${dateTo}&$top=500&$orderby=activityDateTime desc`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('PREMIUM_LICENSE_REQUIRED');
    }
    const errorText = await response.text();
    console.error('Directory audit logs fetch error:', response.status, errorText);
    throw new Error(`Falha ao buscar logs de auditoria: ${response.status}`);
  }
  
  const data = await response.json();
  return data.value || [];
}

// Fetch users with MFA registration status
async function fetchUsersMfaStatus(accessToken: string): Promise<any[]> {
  try {
    const url = 'https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?$top=999';
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      console.warn('MFA status fetch failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.warn('Failed to fetch MFA status:', error);
    return [];
  }
}

// Fetch directory roles and assignments
async function fetchDirectoryRoles(accessToken: string): Promise<any[]> {
  try {
    const rolesUrl = 'https://graph.microsoft.com/v1.0/directoryRoles?$expand=members';
    
    const response = await fetch(rolesUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      console.warn('Directory roles fetch failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.warn('Failed to fetch directory roles:', error);
    return [];
  }
}

// Analysis functions
function analyzeRiskySignIns(signInLogs: any[], timeRange: { from: string; to: string }): SecurityInsight | null {
  const riskySignIns = signInLogs.filter(log => 
    log.riskState && log.riskState !== 'none' && log.riskState !== 'remediated'
  );
  
  if (riskySignIns.length === 0) return null;
  
  const usersMap = new Map<string, AffectedUser>();
  riskySignIns.forEach(log => {
    if (!usersMap.has(log.userId)) {
      usersMap.set(log.userId, {
        id: log.userId,
        displayName: log.userDisplayName || 'Desconhecido',
        userPrincipalName: log.userPrincipalName || '',
        details: { riskState: log.riskState, riskLevel: log.riskLevelDuringSignIn },
      });
    }
  });
  
  const affectedUsers = Array.from(usersMap.values());
  const hasCritical = riskySignIns.some(l => l.riskLevelDuringSignIn === 'high');
  
  return {
    id: 'SI-001',
    code: 'SI-001',
    title: 'Usuários com logins suspeitos detectados',
    description: `${affectedUsers.length} usuário(s) apresentaram indicadores de risco durante o login nos últimos dias. Isso pode indicar tentativas de acesso não autorizadas ou contas comprometidas.`,
    category: 'identity_security',
    severity: hasCritical ? 'critical' : 'high',
    affectedCount: affectedUsers.length,
    affectedUsers,
    criteria: 'Logins com riskState diferente de "none" ou "remediated"',
    recommendation: 'Revise os usuários afetados, verifique se os acessos são legítimos e considere forçar redefinição de senha para casos críticos.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

function analyzeFailedLoginAttempts(signInLogs: any[], timeRange: { from: string; to: string }): SecurityInsight | null {
  // Group failed logins by user
  const failedByUser = new Map<string, { count: number; user: AffectedUser }>();
  
  signInLogs.forEach(log => {
    if (log.status?.errorCode && log.status.errorCode !== 0) {
      const existing = failedByUser.get(log.userId) || {
        count: 0,
        user: {
          id: log.userId,
          displayName: log.userDisplayName || 'Desconhecido',
          userPrincipalName: log.userPrincipalName || '',
          details: { failedAttempts: 0, lastFailure: log.createdDateTime },
        },
      };
      existing.count++;
      failedByUser.set(log.userId, existing);
    }
  });
  
  // Filter users with 5+ failed attempts
  const affectedUsers = Array.from(failedByUser.values())
    .filter(u => u.count >= 5)
    .map(u => ({ ...u.user, details: { ...u.user.details, failedAttempts: u.count } }));
  
  if (affectedUsers.length === 0) return null;
  
  return {
    id: 'SI-002',
    code: 'SI-002',
    title: 'Múltiplas tentativas de login falhas',
    description: `${affectedUsers.length} usuário(s) apresentaram 5 ou mais tentativas de login falhas. Isso pode indicar ataques de força bruta ou problemas com credenciais.`,
    category: 'identity_security',
    severity: 'medium',
    affectedCount: affectedUsers.length,
    affectedUsers,
    criteria: '5 ou mais tentativas de login falhas no período analisado',
    recommendation: 'Verifique se há padrões de ataque, considere implementar bloqueio de conta após tentativas falhas e revise políticas de acesso condicional.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

function analyzeUnusualLocations(signInLogs: any[], timeRange: { from: string; to: string }): SecurityInsight | null {
  // Define "usual" countries (Brazil as example, should be configurable)
  const usualCountries = ['BR', 'Brazil'];
  
  const unusualLogins = signInLogs.filter(log => {
    const country = log.location?.countryOrRegion;
    return country && !usualCountries.includes(country);
  });
  
  if (unusualLogins.length === 0) return null;
  
  const usersMap = new Map<string, AffectedUser>();
  unusualLogins.forEach(log => {
    if (!usersMap.has(log.userId)) {
      usersMap.set(log.userId, {
        id: log.userId,
        displayName: log.userDisplayName || 'Desconhecido',
        userPrincipalName: log.userPrincipalName || '',
        details: { 
          countries: [log.location?.countryOrRegion],
          lastUnusualLogin: log.createdDateTime,
        },
      });
    } else {
      const existing = usersMap.get(log.userId)!;
      const countries = (existing.details?.countries as string[]) || [];
      if (!countries.includes(log.location?.countryOrRegion)) {
        countries.push(log.location?.countryOrRegion);
        existing.details = { ...existing.details, countries };
      }
    }
  });
  
  const affectedUsers = Array.from(usersMap.values());
  
  return {
    id: 'SI-003',
    code: 'SI-003',
    title: 'Logins de países não usuais',
    description: `${affectedUsers.length} usuário(s) realizaram login a partir de países não usuais nos últimos dias. Isso pode indicar viagem legítima ou acesso não autorizado.`,
    category: 'identity_security',
    severity: 'high',
    affectedCount: affectedUsers.length,
    affectedUsers,
    criteria: 'Logins originados de países diferentes do Brasil',
    recommendation: 'Confirme com os usuários se os acessos são legítimos. Considere implementar políticas de acesso condicional baseadas em localização.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

function analyzeSuccessAfterFailures(signInLogs: any[], timeRange: { from: string; to: string }): SecurityInsight | null {
  // Group logins by user and order by time
  const loginsByUser = new Map<string, any[]>();
  
  signInLogs.forEach(log => {
    const existing = loginsByUser.get(log.userId) || [];
    existing.push(log);
    loginsByUser.set(log.userId, existing);
  });
  
  const affectedUsers: AffectedUser[] = [];
  
  loginsByUser.forEach((logs, userId) => {
    // Sort by date
    logs.sort((a, b) => new Date(a.createdDateTime).getTime() - new Date(b.createdDateTime).getTime());
    
    // Find patterns of failures followed by success
    let consecutiveFailures = 0;
    for (const log of logs) {
      if (log.status?.errorCode && log.status.errorCode !== 0) {
        consecutiveFailures++;
      } else if (consecutiveFailures >= 3) {
        // Success after 3+ failures
        affectedUsers.push({
          id: userId,
          displayName: log.userDisplayName || 'Desconhecido',
          userPrincipalName: log.userPrincipalName || '',
          details: { 
            failuresBeforeSuccess: consecutiveFailures,
            successAt: log.createdDateTime,
          },
        });
        break;
      } else {
        consecutiveFailures = 0;
      }
    }
  });
  
  if (affectedUsers.length === 0) return null;
  
  return {
    id: 'SI-005',
    code: 'SI-005',
    title: 'Login bem-sucedido após várias falhas',
    description: `${affectedUsers.length} usuário(s) obtiveram sucesso no login após múltiplas tentativas falhas. Isso pode indicar ataque de força bruta bem-sucedido.`,
    category: 'identity_security',
    severity: 'critical',
    affectedCount: affectedUsers.length,
    affectedUsers,
    criteria: 'Login bem-sucedido precedido de 3 ou mais falhas consecutivas',
    recommendation: 'Investigue imediatamente esses acessos. Considere forçar logout e redefinição de senha. Revise logs detalhados de cada usuário.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

function analyzeUsersWithoutMfa(mfaStatus: any[], timeRange: { from: string; to: string }): SecurityInsight | null {
  const usersWithoutMfa = mfaStatus.filter(user => {
    const methods = user.methodsRegistered || [];
    // Check if user has any strong MFA method
    const hasStrongMfa = methods.some((m: string) => 
      ['microsoftAuthenticatorPush', 'softwareOneTimePasscode', 'hardwareOneTimePasscode', 'windowsHelloForBusiness'].includes(m)
    );
    return !hasStrongMfa && user.userType !== 'Guest';
  });
  
  if (usersWithoutMfa.length === 0) return null;
  
  const affectedUsers: AffectedUser[] = usersWithoutMfa.slice(0, 50).map(user => ({
    id: user.id,
    displayName: user.userDisplayName || 'Desconhecido',
    userPrincipalName: user.userPrincipalName || '',
    details: { 
      registeredMethods: user.methodsRegistered || [],
      isMfaCapable: user.isMfaCapable,
    },
  }));
  
  return {
    id: 'SI-006',
    code: 'SI-006',
    title: 'Usuários sem MFA configurado',
    description: `${usersWithoutMfa.length} usuário(s) não possuem autenticação multifator (MFA) configurada. Essas contas estão vulneráveis a comprometimento de credenciais.`,
    category: 'identity_security',
    severity: 'high',
    affectedCount: usersWithoutMfa.length,
    affectedUsers,
    criteria: 'Usuários sem métodos de MFA forte registrados (Authenticator, TOTP, FIDO2)',
    recommendation: 'Implemente política de MFA obrigatório. Comunique os usuários afetados e defina prazo para habilitação.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

function analyzePrivilegedWithoutMfa(
  mfaStatus: any[], 
  directoryRoles: any[], 
  timeRange: { from: string; to: string }
): SecurityInsight | null {
  // Get all privileged users
  const privilegedUserIds = new Set<string>();
  const privilegedRoles = ['Global Administrator', 'Privileged Role Administrator', 'Security Administrator', 
    'Exchange Administrator', 'SharePoint Administrator', 'User Administrator'];
  
  directoryRoles.forEach(role => {
    if (privilegedRoles.some(pr => role.displayName?.includes(pr))) {
      (role.members || []).forEach((member: any) => {
        if (member['@odata.type'] === '#microsoft.graph.user') {
          privilegedUserIds.add(member.id);
        }
      });
    }
  });
  
  if (privilegedUserIds.size === 0) return null;
  
  // Find privileged users without MFA
  const privilegedWithoutMfa = mfaStatus.filter(user => {
    if (!privilegedUserIds.has(user.id)) return false;
    const methods = user.methodsRegistered || [];
    const hasStrongMfa = methods.some((m: string) => 
      ['microsoftAuthenticatorPush', 'softwareOneTimePasscode', 'hardwareOneTimePasscode', 'windowsHelloForBusiness'].includes(m)
    );
    return !hasStrongMfa;
  });
  
  if (privilegedWithoutMfa.length === 0) return null;
  
  const affectedUsers: AffectedUser[] = privilegedWithoutMfa.map(user => ({
    id: user.id,
    displayName: user.userDisplayName || 'Desconhecido',
    userPrincipalName: user.userPrincipalName || '',
    details: { 
      registeredMethods: user.methodsRegistered || [],
      isPrivileged: true,
    },
  }));
  
  return {
    id: 'SI-007',
    code: 'SI-007',
    title: 'Contas privilegiadas sem MFA',
    description: `${affectedUsers.length} conta(s) com privilégios administrativos não possuem MFA configurado. Isso representa um risco crítico de segurança.`,
    category: 'identity_security',
    severity: 'critical',
    affectedCount: affectedUsers.length,
    affectedUsers,
    criteria: 'Usuários com roles administrativas (Global Admin, Security Admin, etc.) sem MFA forte',
    recommendation: 'AÇÃO IMEDIATA: Exija MFA para todas as contas privilegiadas. Considere bloquear acesso até habilitação do MFA.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

function analyzeAdminRoleChanges(auditLogs: any[], timeRange: { from: string; to: string }): SecurityInsight | null {
  const roleChanges = auditLogs.filter(log => 
    log.category === 'RoleManagement' && 
    ['Add member to role', 'Add eligible member to role', 'Remove member from role'].includes(log.activityDisplayName)
  );
  
  if (roleChanges.length === 0) return null;
  
  const affectedUsers: AffectedUser[] = roleChanges.slice(0, 50).map(log => {
    const targetUser = log.targetResources?.find((r: any) => r.type === 'User');
    const targetRole = log.targetResources?.find((r: any) => r.type === 'Role');
    
    return {
      id: targetUser?.id || log.id,
      displayName: targetUser?.displayName || 'Desconhecido',
      userPrincipalName: targetUser?.userPrincipalName || '',
      details: { 
        action: log.activityDisplayName,
        role: targetRole?.displayName,
        performedBy: log.initiatedBy?.user?.displayName || log.initiatedBy?.app?.displayName,
        timestamp: log.activityDateTime,
      },
    };
  });
  
  return {
    id: 'GC-002',
    code: 'GC-002',
    title: 'Alterações recentes em roles administrativas',
    description: `${roleChanges.length} alteração(ões) em funções administrativas foram detectadas. Revise se são autorizadas.`,
    category: 'governance',
    severity: 'high',
    affectedCount: roleChanges.length,
    affectedUsers,
    criteria: 'Eventos de adição ou remoção de membros em roles do Entra ID',
    recommendation: 'Verifique se cada alteração foi autorizada. Confirme com os administradores responsáveis.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

function analyzeAdminUsers(directoryRoles: any[], timeRange: { from: string; to: string }): SecurityInsight | null {
  const adminRoles = ['Global Administrator', 'Privileged Role Administrator', 'Security Administrator', 
    'Exchange Administrator', 'SharePoint Administrator', 'User Administrator', 'Application Administrator'];
  
  const adminUsers = new Map<string, AffectedUser>();
  
  directoryRoles.forEach(role => {
    if (!adminRoles.some(ar => role.displayName?.includes(ar))) return;
    
    (role.members || []).forEach((member: any) => {
      if (member['@odata.type'] !== '#microsoft.graph.user') return;
      
      const existing = adminUsers.get(member.id);
      const roles = (existing?.details?.roles as string[]) || [];
      roles.push(role.displayName);
      
      adminUsers.set(member.id, {
        id: member.id,
        displayName: member.displayName || 'Desconhecido',
        userPrincipalName: member.userPrincipalName || '',
        details: { roles },
      });
    });
  });
  
  if (adminUsers.size === 0) return null;
  
  return {
    id: 'GC-001',
    code: 'GC-001',
    title: 'Usuários com funções administrativas',
    description: `${adminUsers.size} usuário(s) possuem funções administrativas no Entra ID. Revise regularmente se os acessos são necessários.`,
    category: 'governance',
    severity: 'info',
    affectedCount: adminUsers.size,
    affectedUsers: Array.from(adminUsers.values()),
    criteria: 'Usuários com roles administrativas atribuídas',
    recommendation: 'Revise periodicamente os administradores. Aplique o princípio do menor privilégio.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

function analyzeOffHoursLogins(signInLogs: any[], timeRange: { from: string; to: string }): SecurityInsight | null {
  // Consider off-hours as 22:00-06:00 local time (using UTC for simplicity)
  const offHoursLogins = signInLogs.filter(log => {
    const hour = new Date(log.createdDateTime).getUTCHours();
    // Adjust for Brazil timezone (UTC-3)
    const localHour = (hour - 3 + 24) % 24;
    return localHour >= 22 || localHour < 6;
  });
  
  if (offHoursLogins.length < 5) return null;
  
  const usersMap = new Map<string, AffectedUser>();
  offHoursLogins.forEach(log => {
    if (!usersMap.has(log.userId)) {
      usersMap.set(log.userId, {
        id: log.userId,
        displayName: log.userDisplayName || 'Desconhecido',
        userPrincipalName: log.userPrincipalName || '',
        details: { offHoursLoginCount: 1 },
      });
    } else {
      const existing = usersMap.get(log.userId)!;
      (existing.details as any).offHoursLoginCount++;
    }
  });
  
  const affectedUsers = Array.from(usersMap.values())
    .filter(u => ((u.details as any)?.offHoursLoginCount || 0) >= 3);
  
  if (affectedUsers.length === 0) return null;
  
  return {
    id: 'CR-004',
    code: 'CR-004',
    title: 'Logins fora do horário padrão',
    description: `${affectedUsers.length} usuário(s) realizaram logins frequentes fora do horário comercial (22h-6h). Isso pode indicar uso automatizado ou acesso não autorizado.`,
    category: 'behavior_risk',
    severity: 'low',
    affectedCount: affectedUsers.length,
    affectedUsers,
    criteria: '3 ou mais logins entre 22:00 e 06:00 no período analisado',
    recommendation: 'Verifique se há justificativa para os acessos fora de horário. Considere implementar políticas de acesso baseadas em horário.',
    detectedAt: new Date().toISOString(),
    timeRange,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Verify JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Autorização necessária' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    const request: SecurityInsightsRequest = await req.json();
    
    if (!request.tenant_record_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'tenant_record_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate date range (default: last 7 days)
    const dateTo = request.date_to || new Date().toISOString();
    const dateFrom = request.date_from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timeRange = { from: dateFrom, to: dateTo };

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from('m365_tenants')
      .select('id, tenant_id, tenant_domain, client_id, connection_status')
      .eq('id', request.tenant_record_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tenant não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify access
    const { data: hasAccess } = await supabase
      .rpc('has_client_access', { _user_id: user.id, _client_id: tenant.client_id });

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso negado a este tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch global M365 config
    const { data: globalConfig, error: configError } = await supabase
      .from('m365_global_config')
      .select('app_id, client_secret_encrypted')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração M365 não encontrada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clientSecret = await decryptSecret(globalConfig.client_secret_encrypted);
    const accessToken = await getAccessToken(tenant.tenant_id, globalConfig.app_id, clientSecret);

    console.log('Fetching data from Microsoft Graph API...');

    // Fetch all required data in parallel
    const [signInLogs, auditLogs, mfaStatus, directoryRoles] = await Promise.all([
      fetchSignInLogs(accessToken, dateFrom, dateTo).catch(err => {
        console.warn('Sign-in logs fetch failed:', err.message);
        return [];
      }),
      fetchDirectoryAuditLogs(accessToken, dateFrom, dateTo).catch(err => {
        console.warn('Audit logs fetch failed:', err.message);
        return [];
      }),
      fetchUsersMfaStatus(accessToken),
      fetchDirectoryRoles(accessToken),
    ]);

    console.log(`Fetched: ${signInLogs.length} sign-ins, ${auditLogs.length} audits, ${mfaStatus.length} MFA records, ${directoryRoles.length} roles`);

    // ── Fetch compliance correlation data ──────────────────────────────────
    let failedComplianceCodes = new Set<string>();
    try {
      const { data: lastCompliance } = await supabase
        .from('m365_posture_history')
        .select('insights')
        .eq('tenant_record_id', request.tenant_record_id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();

      if (lastCompliance?.insights && Array.isArray(lastCompliance.insights)) {
        failedComplianceCodes = new Set(
          (lastCompliance.insights as any[])
            .filter((r: any) => r.status === 'fail')
            .map((r: any) => r.code || r.id)
            .filter(Boolean)
        );
        console.log(`Compliance correlation: ${failedComplianceCodes.size} failed codes found`);
      }
    } catch (e) {
      console.warn('Failed to fetch compliance data for correlation:', e);
    }

    // Helper to enrich an insight with compliance correlation
    function enrichWithCompliance(insight: any, codes: string[], context: string): void {
      const matchedCodes = codes.filter(c => failedComplianceCodes.has(c));
      if (matchedCodes.length > 0) {
        insight.description += `\n\n⚠️ Correlação de Compliance: ${context}`;
        insight.metadata = {
          ...(insight.metadata || {}),
          complianceCorrelation: true,
          complianceCodes: matchedCodes,
          complianceContext: context,
        };
      }
    }

    // Generate insights
    const insights: SecurityInsight[] = [];

    // Identity Security insights
    const riskySignIns = analyzeRiskySignIns(signInLogs, timeRange);
    if (riskySignIns) {
      enrichWithCompliance(riskySignIns, ['AUT-010', 'AUT-011'], 'Não existe política de Acesso Condicional baseada em risco de sign-in (AUT-010/011).');
      insights.push(riskySignIns);
    } else {
      insights.push({ id: 'risky_signins_ok', category: 'identity_access', name: 'Sign-ins de Risco Controlados', description: 'Nenhum sign-in de risco elevado detectado no período.', severity: 'info', status: 'pass' });
    }

    const failedLogins = analyzeFailedLoginAttempts(signInLogs, timeRange);
    if (failedLogins) {
      enrichWithCompliance(failedLogins, ['AUT-003'], 'Não há política de bloqueio de conta após tentativas falhas (AUT-003).');
      insights.push(failedLogins);
    } else {
      insights.push({ id: 'failed_logins_ok', category: 'identity_access', name: 'Tentativas de Login Normais', description: 'Nenhum padrão anômalo de tentativas de login detectado.', severity: 'info', status: 'pass' });
    }

    const unusualLocations = analyzeUnusualLocations(signInLogs, timeRange);
    if (unusualLocations) {
      enrichWithCompliance(unusualLocations, ['AUT-010', 'AUT-011'], 'Não existe Conditional Access restringindo origem geográfica dos logins (AUT-010/011).');
      insights.push(unusualLocations);
    }

    const successAfterFailures = analyzeSuccessAfterFailures(signInLogs, timeRange);
    if (successAfterFailures) {
      enrichWithCompliance(successAfterFailures, ['AUT-003', 'AUT-010'], 'Sem política de bloqueio de conta (AUT-003) ou Acesso Condicional baseado em risco (AUT-010).');
      insights.push(successAfterFailures);
    }

    const usersWithoutMfa = analyzeUsersWithoutMfa(mfaStatus, timeRange);
    if (usersWithoutMfa) {
      enrichWithCompliance(usersWithoutMfa, ['AUT-001', 'AUT-002'], 'A política de MFA obrigatório não está ativa no Compliance (AUT-001/002).');
      insights.push(usersWithoutMfa);
    } else {
      insights.push({ id: 'mfa_ok', category: 'identity_access', name: 'MFA Habilitado para Todos', description: 'Todos os usuários possuem MFA configurado.', severity: 'info', status: 'pass' });
    }

    const privilegedWithoutMfa = analyzePrivilegedWithoutMfa(mfaStatus, directoryRoles, timeRange);
    if (privilegedWithoutMfa) {
      enrichWithCompliance(privilegedWithoutMfa, ['AUT-001', 'AUT-002', 'ADM-007'], 'Contas Break Glass sem proteção (ADM-007) e/ou MFA não forçado para admins (AUT-001/002).');
      insights.push(privilegedWithoutMfa);
    } else {
      insights.push({ id: 'priv_mfa_ok', category: 'identity_access', name: 'Admins com MFA Ativo', description: 'Todos os usuários privilegiados possuem MFA habilitado.', severity: 'info', status: 'pass' });
    }

    // Behavior insights
    const offHoursLogins = analyzeOffHoursLogins(signInLogs, timeRange);
    if (offHoursLogins) {
      enrichWithCompliance(offHoursLogins, ['AUT-010', 'AUT-011'], 'Sem Acesso Condicional baseado em risco para restringir acessos fora de horário (AUT-010/011).');
      insights.push(offHoursLogins);
    }

    // Governance insights
    const roleChanges = analyzeAdminRoleChanges(auditLogs, timeRange);
    if (roleChanges) insights.push(roleChanges);

    const adminUsers = analyzeAdminUsers(directoryRoles, timeRange);
    if (adminUsers) insights.push(adminUsers);

    // Calculate summary
    const summary = {
      critical: insights.filter(i => i.severity === 'critical').length,
      high: insights.filter(i => i.severity === 'high').length,
      medium: insights.filter(i => i.severity === 'medium').length,
      low: insights.filter(i => i.severity === 'low').length,
      info: insights.filter(i => i.severity === 'info').length,
      total: insights.length,
    };

    // Sort insights by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    console.log(`Generated ${insights.length} insights`);

    return new Response(
      JSON.stringify({
        success: true,
        insights,
        summary,
        analyzedPeriod: timeRange,
        tenant: { id: tenant.id, domain: tenant.tenant_domain },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in entra-id-security-insights:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    if (errorMessage === 'PREMIUM_LICENSE_REQUIRED') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Licença Azure AD Premium necessária',
          errorCode: 'PREMIUM_LICENSE_REQUIRED',
          message: 'Os insights de segurança requerem uma licença Azure AD Premium (P1 ou P2) no tenant.',
          insights: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
