import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

interface ApplicationInsightsRequest {
  tenant_record_id: string;
}

interface AffectedApplication {
  id: string;
  appId: string;
  displayName: string;
  appType: 'AppRegistration' | 'EnterpriseApp';
  details?: {
    credentialType?: 'Secret' | 'Certificate';
    credentialKeyId?: string;
    expiresAt?: string;
    createdAt?: string;
    daysUntilExpiration?: number;
    permissions?: string[];
    hasAdminConsent?: boolean;
    ownerCount?: number;
    credentialCount?: number;
  };
}

interface ApplicationInsight {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'credential_expiration' | 'privileged_permissions' | 'security_hygiene';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  affectedCount: number;
  affectedApplications: AffectedApplication[];
  criteria: string;
  recommendation: string;
  detectedAt: string;
}

// Critical permissions that require special attention
const CRITICAL_PERMISSIONS = [
  'Directory.ReadWrite.All',
  'Application.ReadWrite.All',
  'RoleManagement.ReadWrite.Directory',
  'AppRoleAssignment.ReadWrite.All',
  'Group.ReadWrite.All',
  'User.ReadWrite.All',
  'Mail.ReadWrite',
  'Mail.Send',
  'Files.ReadWrite.All',
];

const HIGH_RISK_PERMISSIONS = [
  'Directory.Read.All',
  'User.Read.All',
  'Group.Read.All',
  'AuditLog.Read.All',
  'Policy.Read.All',
  'IdentityRiskyUser.Read.All',
];

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

// Fetch all applications (App Registrations)
async function fetchApplications(accessToken: string): Promise<any[]> {
  const allApps: any[] = [];
  let nextLink = 'https://graph.microsoft.com/v1.0/applications?$select=id,appId,displayName,passwordCredentials,keyCredentials,createdDateTime&$top=999';
  
  while (nextLink) {
    const response = await fetch(nextLink, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Applications fetch error:', response.status, errorText);
      throw new Error(`Falha ao buscar aplicações: ${response.status}`);
    }
    
    const data = await response.json();
    allApps.push(...(data.value || []));
    nextLink = data['@odata.nextLink'] || null;
  }
  
  return allApps;
}

// Fetch service principals (Enterprise Apps)
async function fetchServicePrincipals(accessToken: string): Promise<any[]> {
  const allSPs: any[] = [];
  let nextLink = 'https://graph.microsoft.com/v1.0/servicePrincipals?$select=id,appId,displayName,servicePrincipalType,appRoles&$top=999';
  
  while (nextLink) {
    const response = await fetch(nextLink, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      console.warn('Service principals fetch failed:', response.status);
      return allSPs;
    }
    
    const data = await response.json();
    allSPs.push(...(data.value || []));
    nextLink = data['@odata.nextLink'] || null;
  }
  
  return allSPs;
}

// Fetch app role assignments for a service principal
async function fetchAppRoleAssignments(accessToken: string, spId: string): Promise<any[]> {
  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals/${spId}/appRoleAssignments`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.value || [];
  } catch {
    return [];
  }
}

// Fetch oauth2 permission grants
async function fetchOAuth2PermissionGrants(accessToken: string): Promise<any[]> {
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/oauth2PermissionGrants?$top=999',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!response.ok) return [];
    const data = await response.json();
    return data.value || [];
  } catch {
    return [];
  }
}

// Fetch application owners
async function fetchApplicationOwners(accessToken: string, appId: string): Promise<number> {
  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/applications/${appId}/owners?$count=true`,
      { 
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'ConsistencyLevel': 'eventual',
        } 
      }
    );
    
    if (!response.ok) return 0;
    const data = await response.json();
    return (data.value || []).length;
  } catch {
    return 0;
  }
}

// Get permissions for a service principal from Graph resource
async function getAppPermissions(accessToken: string, spId: string, graphResourceId: string): Promise<string[]> {
  const assignments = await fetchAppRoleAssignments(accessToken, spId);
  const graphAssignments = assignments.filter((a: any) => a.resourceId === graphResourceId);
  
  // We need to map appRoleId to permission name - fetch Graph SP's appRoles
  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals/${graphResourceId}?$select=appRoles`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!response.ok) return [];
    const graphSp = await response.json();
    const appRoles = graphSp.appRoles || [];
    
    const roleMap = new Map<string, string>(appRoles.map((r: any) => [r.id, r.value]));
    return graphAssignments
      .map((a: any) => roleMap.get(a.appRoleId) || 'Unknown')
      .filter((p): p is string => p !== 'Unknown' && typeof p === 'string');
  } catch {
    return [];
  }
}

// Analysis: Expired credentials (APP-001)
function analyzeExpiredCredentials(applications: any[]): ApplicationInsight | null {
  const now = new Date();
  const affectedApps: AffectedApplication[] = [];
  
  applications.forEach(app => {
    const credentials = [
      ...(app.passwordCredentials || []).map((c: any) => ({ ...c, type: 'Secret' })),
      ...(app.keyCredentials || []).map((c: any) => ({ ...c, type: 'Certificate' })),
    ];
    
    credentials.forEach((cred: any) => {
      if (cred.endDateTime) {
        const expireDate = new Date(cred.endDateTime);
        if (expireDate < now) {
          affectedApps.push({
            id: app.id,
            appId: app.appId,
            displayName: app.displayName,
            appType: 'AppRegistration',
            details: {
              credentialType: cred.type,
              credentialKeyId: cred.keyId,
              expiresAt: cred.endDateTime,
              createdAt: cred.startDateTime,
              daysUntilExpiration: Math.floor((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
            },
          });
        }
      }
    });
  });
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-001',
    code: 'APP-001',
    title: 'Credenciais vencidas',
    description: `${affectedApps.length} aplicativo(s) possuem credenciais (secrets ou certificados) que já expiraram. Essas credenciais não funcionam mais e podem causar falhas em integrações.`,
    category: 'credential_expiration',
    severity: 'critical',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps.slice(0, 50),
    criteria: 'Client Secrets ou Certificados com data de expiração anterior à data atual',
    recommendation: 'Gere novas credenciais para os aplicativos afetados e atualize as integrações que dependem deles. Remova as credenciais expiradas após a rotação.',
    detectedAt: new Date().toISOString(),
  };
}

// Analysis: Credentials expiring in 30 days (APP-002)
function analyzeExpiringIn30Days(applications: any[]): ApplicationInsight | null {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const affectedApps: AffectedApplication[] = [];
  
  applications.forEach(app => {
    const credentials = [
      ...(app.passwordCredentials || []).map((c: any) => ({ ...c, type: 'Secret' })),
      ...(app.keyCredentials || []).map((c: any) => ({ ...c, type: 'Certificate' })),
    ];
    
    credentials.forEach((cred: any) => {
      if (cred.endDateTime) {
        const expireDate = new Date(cred.endDateTime);
        if (expireDate >= now && expireDate <= thirtyDaysFromNow) {
          const daysLeft = Math.floor((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          affectedApps.push({
            id: app.id,
            appId: app.appId,
            displayName: app.displayName,
            appType: 'AppRegistration',
            details: {
              credentialType: cred.type,
              credentialKeyId: cred.keyId,
              expiresAt: cred.endDateTime,
              createdAt: cred.startDateTime,
              daysUntilExpiration: daysLeft,
            },
          });
        }
      }
    });
  });
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-002',
    code: 'APP-002',
    title: 'Credenciais a vencer em 30 dias',
    description: `${affectedApps.length} aplicativo(s) possuem credenciais que expirarão nos próximos 30 dias. Ação preventiva é necessária para evitar interrupções.`,
    category: 'credential_expiration',
    severity: 'high',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps.slice(0, 50),
    criteria: 'Client Secrets ou Certificados com expiração entre hoje e 30 dias',
    recommendation: 'Planeje a rotação das credenciais antes do vencimento. Notifique os responsáveis pelas integrações afetadas.',
    detectedAt: new Date().toISOString(),
  };
}

// Analysis: Credentials expiring in 90 days (APP-003)
function analyzeExpiringIn90Days(applications: any[]): ApplicationInsight | null {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const affectedApps: AffectedApplication[] = [];
  
  applications.forEach(app => {
    const credentials = [
      ...(app.passwordCredentials || []).map((c: any) => ({ ...c, type: 'Secret' })),
      ...(app.keyCredentials || []).map((c: any) => ({ ...c, type: 'Certificate' })),
    ];
    
    credentials.forEach((cred: any) => {
      if (cred.endDateTime) {
        const expireDate = new Date(cred.endDateTime);
        if (expireDate > thirtyDaysFromNow && expireDate <= ninetyDaysFromNow) {
          const daysLeft = Math.floor((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          affectedApps.push({
            id: app.id,
            appId: app.appId,
            displayName: app.displayName,
            appType: 'AppRegistration',
            details: {
              credentialType: cred.type,
              credentialKeyId: cred.keyId,
              expiresAt: cred.endDateTime,
              createdAt: cred.startDateTime,
              daysUntilExpiration: daysLeft,
            },
          });
        }
      }
    });
  });
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-003',
    code: 'APP-003',
    title: 'Credenciais a vencer em 90 dias',
    description: `${affectedApps.length} aplicativo(s) possuem credenciais que expirarão entre 30 e 90 dias. Planeje a rotação com antecedência.`,
    category: 'credential_expiration',
    severity: 'medium',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps.slice(0, 50),
    criteria: 'Client Secrets ou Certificados com expiração entre 30 e 90 dias',
    recommendation: 'Adicione esses aplicativos ao cronograma de rotação de credenciais. Considere implementar alertas automáticos.',
    detectedAt: new Date().toISOString(),
  };
}

// Analysis: Apps with critical permissions (APP-004)
async function analyzeCriticalPermissions(
  applications: any[],
  servicePrincipals: any[],
  accessToken: string
): Promise<ApplicationInsight | null> {
  const affectedApps: AffectedApplication[] = [];
  
  // Find Microsoft Graph service principal
  const graphSp = servicePrincipals.find(sp => 
    sp.appId === '00000003-0000-0000-c000-000000000000' // Microsoft Graph appId
  );
  
  if (!graphSp) {
    console.log('Microsoft Graph SP not found');
    return null;
  }
  
  // Check each application's service principal
  for (const app of applications) {
    const sp = servicePrincipals.find(s => s.appId === app.appId);
    if (!sp) continue;
    
    const permissions = await getAppPermissions(accessToken, sp.id, graphSp.id);
    const criticalPerms = permissions.filter(p => CRITICAL_PERMISSIONS.includes(p));
    
    if (criticalPerms.length > 0) {
      affectedApps.push({
        id: app.id,
        appId: app.appId,
        displayName: app.displayName,
        appType: 'AppRegistration',
        details: {
          permissions: criticalPerms,
        },
      });
    }
    
    // Limit to avoid rate limiting
    if (affectedApps.length >= 30) break;
  }
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-004',
    code: 'APP-004',
    title: 'Apps com permissões críticas',
    description: `${affectedApps.length} aplicativo(s) possuem permissões de alto privilégio como Directory.ReadWrite.All ou Application.ReadWrite.All. Essas permissões permitem alterações significativas no tenant.`,
    category: 'privileged_permissions',
    severity: 'critical',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps,
    criteria: 'Aplicativos com permissões: Directory.ReadWrite.All, Application.ReadWrite.All, RoleManagement.ReadWrite.Directory, entre outras',
    recommendation: 'Revise se essas permissões são realmente necessárias. Aplique o princípio do menor privilégio e remova permissões excessivas.',
    detectedAt: new Date().toISOString(),
  };
}

// Analysis: Apps with Admin Consent (APP-005)
function analyzeAdminConsent(
  applications: any[],
  servicePrincipals: any[],
  oauth2Grants: any[]
): ApplicationInsight | null {
  const affectedApps: AffectedApplication[] = [];
  const adminConsentGrants = oauth2Grants.filter(g => g.consentType === 'AllPrincipals');
  
  adminConsentGrants.forEach(grant => {
    const sp = servicePrincipals.find(s => s.id === grant.clientId);
    if (!sp) return;
    
    const app = applications.find(a => a.appId === sp.appId);
    if (!app) return;
    
    // Skip if already added
    if (affectedApps.some(a => a.appId === app.appId)) return;
    
    affectedApps.push({
      id: app.id,
      appId: app.appId,
      displayName: app.displayName,
      appType: 'AppRegistration',
      details: {
        hasAdminConsent: true,
        permissions: grant.scope?.split(' ').filter(Boolean) || [],
      },
    });
  });
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-005',
    code: 'APP-005',
    title: 'Apps com Admin Consent',
    description: `${affectedApps.length} aplicativo(s) possuem consentimento de administrador (Admin Consent) concedido. Isso significa que acessam dados de todos os usuários do tenant.`,
    category: 'privileged_permissions',
    severity: 'high',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps.slice(0, 50),
    criteria: 'Aplicativos com OAuth2 Permission Grants do tipo "AllPrincipals"',
    recommendation: 'Revise periodicamente os aplicativos com Admin Consent. Remova consentimentos desnecessários e documente a justificativa dos aprovados.',
    detectedAt: new Date().toISOString(),
  };
}

// Analysis: Apps with global read permissions (APP-006)
async function analyzeGlobalReadPermissions(
  applications: any[],
  servicePrincipals: any[],
  accessToken: string
): Promise<ApplicationInsight | null> {
  const affectedApps: AffectedApplication[] = [];
  
  const graphSp = servicePrincipals.find(sp => 
    sp.appId === '00000003-0000-0000-c000-000000000000'
  );
  
  if (!graphSp) return null;
  
  for (const app of applications) {
    const sp = servicePrincipals.find(s => s.appId === app.appId);
    if (!sp) continue;
    
    const permissions = await getAppPermissions(accessToken, sp.id, graphSp.id);
    const highRiskPerms = permissions.filter(p => HIGH_RISK_PERMISSIONS.includes(p));
    
    // Exclude apps already flagged for critical permissions
    const criticalPerms = permissions.filter(p => CRITICAL_PERMISSIONS.includes(p));
    if (criticalPerms.length > 0) continue;
    
    if (highRiskPerms.length > 0) {
      affectedApps.push({
        id: app.id,
        appId: app.appId,
        displayName: app.displayName,
        appType: 'AppRegistration',
        details: {
          permissions: highRiskPerms,
        },
      });
    }
    
    if (affectedApps.length >= 30) break;
  }
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-006',
    code: 'APP-006',
    title: 'Apps com permissões de leitura global',
    description: `${affectedApps.length} aplicativo(s) possuem permissões de leitura ampla como Directory.Read.All ou User.Read.All. Podem acessar dados sensíveis do diretório.`,
    category: 'privileged_permissions',
    severity: 'medium',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps,
    criteria: 'Aplicativos com permissões de leitura global (Directory.Read.All, User.Read.All, Group.Read.All)',
    recommendation: 'Avalie se a leitura global é necessária. Considere usar permissões mais granulares quando possível.',
    detectedAt: new Date().toISOString(),
  };
}

// Analysis: Apps without redundant credentials (APP-007)
function analyzeNoRedundantCredentials(applications: any[]): ApplicationInsight | null {
  const now = new Date();
  const affectedApps: AffectedApplication[] = [];
  
  applications.forEach(app => {
    const allCredentials = [
      ...(app.passwordCredentials || []),
      ...(app.keyCredentials || []),
    ];
    
    // Count only active (not expired) credentials
    const activeCredentials = allCredentials.filter((c: any) => {
      if (!c.endDateTime) return true;
      return new Date(c.endDateTime) > now;
    });
    
    if (activeCredentials.length === 1) {
      affectedApps.push({
        id: app.id,
        appId: app.appId,
        displayName: app.displayName,
        appType: 'AppRegistration',
        details: {
          credentialCount: 1,
        },
      });
    }
  });
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-007',
    code: 'APP-007',
    title: 'Apps sem credencial redundante',
    description: `${affectedApps.length} aplicativo(s) possuem apenas uma credencial ativa. Se ela expirar ou for comprometida, não haverá backup imediato.`,
    category: 'security_hygiene',
    severity: 'medium',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps.slice(0, 50),
    criteria: 'Aplicativos com exatamente 1 credencial ativa (sem backup)',
    recommendation: 'Adicione uma segunda credencial antes de rotacionar a existente. Isso permite transição suave sem downtime.',
    detectedAt: new Date().toISOString(),
  };
}

// Analysis: Credentials without rotation (>1 year) (APP-008)
function analyzeNoRotation(applications: any[]): ApplicationInsight | null {
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const affectedApps: AffectedApplication[] = [];
  
  applications.forEach(app => {
    const credentials = [
      ...(app.passwordCredentials || []).map((c: any) => ({ ...c, type: 'Secret' })),
      ...(app.keyCredentials || []).map((c: any) => ({ ...c, type: 'Certificate' })),
    ];
    
    credentials.forEach((cred: any) => {
      // Check if credential was created more than 1 year ago and is still active
      if (cred.startDateTime && cred.endDateTime) {
        const createdDate = new Date(cred.startDateTime);
        const expireDate = new Date(cred.endDateTime);
        
        if (createdDate < oneYearAgo && expireDate > now) {
          affectedApps.push({
            id: app.id,
            appId: app.appId,
            displayName: app.displayName,
            appType: 'AppRegistration',
            details: {
              credentialType: cred.type,
              credentialKeyId: cred.keyId,
              createdAt: cred.startDateTime,
              expiresAt: cred.endDateTime,
            },
          });
        }
      }
    });
  });
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-008',
    code: 'APP-008',
    title: 'Credenciais sem rotação (>1 ano)',
    description: `${affectedApps.length} credencial(is) estão ativas há mais de 1 ano sem rotação. Credenciais antigas aumentam o risco de comprometimento.`,
    category: 'security_hygiene',
    severity: 'high',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps.slice(0, 50),
    criteria: 'Credenciais criadas há mais de 365 dias e ainda ativas',
    recommendation: 'Implemente política de rotação periódica (recomendado: a cada 6-12 meses). Automatize alertas de rotação.',
    detectedAt: new Date().toISOString(),
  };
}

// Analysis: Apps without owner (APP-009)
async function analyzeNoOwner(
  applications: any[],
  accessToken: string
): Promise<ApplicationInsight | null> {
  const affectedApps: AffectedApplication[] = [];
  
  // Check first 50 apps to avoid rate limiting
  for (const app of applications.slice(0, 50)) {
    const ownerCount = await fetchApplicationOwners(accessToken, app.id);
    
    if (ownerCount === 0) {
      affectedApps.push({
        id: app.id,
        appId: app.appId,
        displayName: app.displayName,
        appType: 'AppRegistration',
        details: {
          ownerCount: 0,
        },
      });
    }
  }
  
  if (affectedApps.length === 0) return null;
  
  return {
    id: 'APP-009',
    code: 'APP-009',
    title: 'Apps sem owner definido',
    description: `${affectedApps.length} aplicativo(s) não possuem proprietário (owner) atribuído. Isso dificulta a governança e responsabilização.`,
    category: 'security_hygiene',
    severity: 'low',
    affectedCount: affectedApps.length,
    affectedApplications: affectedApps,
    criteria: 'App Registrations sem proprietário atribuído',
    recommendation: 'Atribua pelo menos um proprietário para cada aplicativo. Isso facilita contato em caso de incidentes ou rotação de credenciais.',
    detectedAt: new Date().toISOString(),
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ApplicationInsightsRequest = await req.json();
    const { tenant_record_id } = body;

    if (!tenant_record_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'tenant_record_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tenant info
    const { data: tenant, error: tenantError } = await supabase
      .from('m365_tenants')
      .select('id, tenant_id, tenant_domain')
      .eq('id', tenant_record_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tenant não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get global config
    const { data: globalConfig, error: configError } = await supabase
      .from('m365_global_config')
      .select('app_id, client_secret_encrypted')
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Configuração M365 não encontrada',
          errorCode: 'CONFIG_NOT_FOUND',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt and get token
    const clientSecret = await decryptSecret(globalConfig.client_secret_encrypted);
    const accessToken = await getAccessToken(tenant.tenant_id, globalConfig.app_id, clientSecret);

    console.log('Fetching applications and service principals...');

    // Fetch data in parallel
    const [applications, servicePrincipals, oauth2Grants] = await Promise.all([
      fetchApplications(accessToken),
      fetchServicePrincipals(accessToken),
      fetchOAuth2PermissionGrants(accessToken),
    ]);

    console.log(`Found ${applications.length} applications, ${servicePrincipals.length} service principals`);

    // Run analyses
    const insights: ApplicationInsight[] = [];

    // Credential expiration analyses
    const expiredInsight = analyzeExpiredCredentials(applications);
    if (expiredInsight) insights.push(expiredInsight);

    const expiring30Insight = analyzeExpiringIn30Days(applications);
    if (expiring30Insight) insights.push(expiring30Insight);

    const expiring90Insight = analyzeExpiringIn90Days(applications);
    if (expiring90Insight) insights.push(expiring90Insight);

    // Permission analyses
    const criticalPermsInsight = await analyzeCriticalPermissions(applications, servicePrincipals, accessToken);
    if (criticalPermsInsight) insights.push(criticalPermsInsight);

    const adminConsentInsight = analyzeAdminConsent(applications, servicePrincipals, oauth2Grants);
    if (adminConsentInsight) insights.push(adminConsentInsight);

    const globalReadInsight = await analyzeGlobalReadPermissions(applications, servicePrincipals, accessToken);
    if (globalReadInsight) insights.push(globalReadInsight);

    // Security hygiene analyses
    const noRedundantInsight = analyzeNoRedundantCredentials(applications);
    if (noRedundantInsight) insights.push(noRedundantInsight);

    const noRotationInsight = analyzeNoRotation(applications);
    if (noRotationInsight) insights.push(noRotationInsight);

    const noOwnerInsight = await analyzeNoOwner(applications, accessToken);
    if (noOwnerInsight) insights.push(noOwnerInsight);

    // Calculate summary
    const summary = {
      critical: insights.filter(i => i.severity === 'critical').length,
      high: insights.filter(i => i.severity === 'high').length,
      medium: insights.filter(i => i.severity === 'medium').length,
      low: insights.filter(i => i.severity === 'low').length,
      info: insights.filter(i => i.severity === 'info').length,
      total: insights.length,
      expiredCredentials: expiredInsight?.affectedCount || 0,
      expiringIn30Days: expiring30Insight?.affectedCount || 0,
      privilegedApps: (criticalPermsInsight?.affectedCount || 0) + (adminConsentInsight?.affectedCount || 0),
    };

    return new Response(
      JSON.stringify({
        success: true,
        insights,
        summary,
        tenant: {
          id: tenant.tenant_id,
          domain: tenant.tenant_domain,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Application insights error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        insights: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0, expiredCredentials: 0, expiringIn30Days: 0, privilegedApps: 0 },
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
