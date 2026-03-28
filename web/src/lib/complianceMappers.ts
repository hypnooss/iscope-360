import { ComplianceCheck, ComplianceStatus, EvidenceItem } from '@/types/compliance';
import { M365Insight, M365AgentInsight } from '@/types/m365Insights';
import { SecurityInsight } from '@/types/securityInsights';
import { ExchangeInsight } from '@/types/exchangeInsights';
import { ApplicationInsight } from '@/types/applicationInsights';
import { UnifiedComplianceItem, UnifiedComplianceStatus, UnifiedComplianceSeverity } from '@/types/unifiedCompliance';

/**
 * Infere o produto M365 baseado na categoria de risco
 */
function inferProductFromCategory(category: string): string | undefined {
  const map: Record<string, string> = {
    identities: 'entra_id',
    auth_access: 'entra_id',
    admin_privileges: 'entra_id',
    apps_integrations: 'entra_id',
    email_exchange: 'exchange_online',
    threats_activity: 'entra_id',
    intune_devices: 'intune',
    pim_governance: 'entra_id',
    sharepoint_onedrive: 'sharepoint',
    teams_collaboration: 'exchange_online',
    defender_security: 'defender',
  };
  return map[category];
}

/**
 * Normaliza status de diferentes fontes para o formato unificado
 */
function normalizeStatus(status: string): UnifiedComplianceStatus {
  switch (status) {
    case 'pass': return 'pass';
    case 'fail': return 'fail';
    case 'warn':
    case 'warning': return 'warning';
    case 'not_found': return 'not_found';
    case 'pending':
    case 'unknown':
    default: return 'unknown';
  }
}

/**
 * Normaliza severidade
 */
function normalizeSeverity(severity: string): UnifiedComplianceSeverity {
  switch (severity) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    case 'info':
    default: return 'info';
  }
}

/**
 * Mapeia ComplianceCheck (Firewall / Domínio Externo) para UnifiedComplianceItem
 */
export function mapComplianceCheck(check: ComplianceCheck): UnifiedComplianceItem {
  const status = normalizeStatus(check.status as string);
  return {
    id: check.id,
    code: check.id, // ComplianceCheck não tem code separado, usa id
    name: check.name,
    description: check.description,
    category: check.category,
    status,
    severity: normalizeSeverity(check.severity),
    failDescription: check.description,
    recommendation: check.recommendation,
    technicalRisk: check.technicalRisk,
    businessImpact: check.businessImpact,
    apiEndpoint: check.apiEndpoint,
    evidence: check.evidence,
    rawData: check.rawData,
    details: check.details,
  };
}

/**
 * Mapeia M365Insight (Postura M365 - Graph API) para UnifiedComplianceItem
 */
export function mapM365Insight(insight: M365Insight): UnifiedComplianceItem {
  // Build evidence from affectedEntities or _entitiesPreview (lite mode)
  const evidence: EvidenceItem[] = [];
  const previewNames = (insight as any)._entitiesPreview as string[] | undefined;
  
  // Always include base count evidence so the "Evidências" tab is visible
  evidence.push({
    label: 'Itens afetados',
    value: `${insight.affectedCount ?? 0} item(ns)`,
    type: 'text',
  });

  if (insight.affectedEntities && insight.affectedEntities.length > 0) {
    evidence.push({
      label: 'Entidades afetadas',
      value: insight.affectedEntities.map(e => e.displayName || e.userPrincipalName || e.id).join('\n'),
      type: 'list',
    });
  } else if (previewNames && previewNames.length > 0) {
    const remaining = insight.affectedCount - previewNames.length;
    const preview = remaining > 0 
      ? [...previewNames, `e mais ${remaining}...`].join('\n')
      : previewNames.join('\n');
    evidence.push({
      label: 'Entidades afetadas (prévia)',
      value: preview,
      type: 'list',
    });
  }

  return {
    id: insight.id,
    code: insight.code,
    name: insight.titulo,
    description: insight.descricaoExecutiva,
    category: insight.category,
    status: normalizeStatus(insight.status),
    severity: normalizeSeverity(insight.severity),
    failDescription: insight.descricaoExecutiva,
    recommendation: insight.remediacao?.passosDetalhados?.[0],
    technicalRisk: insight.riscoTecnico,
    businessImpact: insight.impactoNegocio,
    apiEndpoint: insight.endpointUsado,
    details: insight.riscoTecnico || insight.descricaoExecutiva,
    evidence,
    rawData: (() => {
      const data: Record<string, unknown> = {};
      if (insight.endpointUsado) data.endpoint = insight.endpointUsado;
      if (insight.status) data.status = insight.status;
      if (insight.affectedCount !== undefined) data.affectedCount = insight.affectedCount;
      if (insight.category) data.category = insight.category;
      if (insight.evidencias && insight.evidencias.length > 0) data.evidencias = insight.evidencias;
      return Object.keys(data).length > 0 ? data : undefined;
    })(),
    affectedEntities: insight.affectedEntities,
    affectedCount: insight.affectedCount,
    remediation: insight.remediacao,
    product: insight.product,
    source: insight.source,
  };
}

/**
 * Mapeia M365AgentInsight (Postura M365 - Agent/PowerShell) para UnifiedComplianceItem
 */
export function mapM365AgentInsight(insight: M365AgentInsight): UnifiedComplianceItem {
  // Build evidence from affectedEntities or _entitiesPreview (lite mode)
  const evidence: EvidenceItem[] = [];
  const previewNames = (insight as any)._entitiesPreview as string[] | undefined;
  
  // Always include base count evidence so the "Evidências" tab is visible
  const entityCount = insight.affectedEntities?.length ?? 0;
  evidence.push({
    label: 'Itens afetados',
    value: `${entityCount} item(ns)`,
    type: 'text',
  });

  if (insight.affectedEntities && insight.affectedEntities.length > 0) {
    evidence.push({
      label: 'Entidades afetadas',
      value: insight.affectedEntities.map(e => e.name).join('\n'),
      type: 'list',
    });
  } else if (previewNames && previewNames.length > 0) {
    evidence.push({
      label: 'Entidades afetadas (prévia)',
      value: previewNames.join('\n'),
      type: 'list',
    });
  }

  // Build rawData with all available context
  const rawData: Record<string, unknown> = {};
  if (insight.apiEndpoint) rawData.endpoint = insight.apiEndpoint;
  if (insight.status) rawData.status = insight.status;
  if (insight.affectedEntities?.length) rawData.affectedCount = insight.affectedEntities.length;
  if (insight.category) rawData.category = insight.category;
  if (insight.rawData && Object.keys(insight.rawData).length > 0) rawData.rawData = insight.rawData;

  return {
    id: insight.id,
    code: insight.id,
    name: insight.name,
    description: insight.criteria || insight.description,
    category: insight.category,
    status: normalizeStatus(insight.status),
    severity: normalizeSeverity(insight.severity),
    failDescription: insight.failDescription || insight.description,
    recommendation: insight.recommendation,
    technicalRisk: insight.technicalRisk,
    businessImpact: insight.businessImpact,
    apiEndpoint: insight.apiEndpoint,
    details: insight.description,
    evidence,
    rawData: Object.keys(rawData).length > 0 ? rawData : undefined,
    affectedEntities: insight.affectedEntities?.map((e, i) => ({
      id: `${insight.id}-${i}`,
      displayName: e.name,
      details: e.details ? { info: e.details } : undefined,
    })),
    affectedCount: insight.affectedEntities?.length || 0,
    product: (insight as any).product || inferProductFromCategory(insight.category),
  };
}

/**
 * Mapeia SecurityInsight (Entra ID Security) para UnifiedComplianceItem
 */
export function mapSecurityInsight(insight: SecurityInsight): UnifiedComplianceItem {
  const evidence: EvidenceItem[] = [
    { label: 'Itens afetados', value: `${insight.affectedCount} usuário(s)`, type: 'text' },
    ...(insight.affectedUsers.length > 0 ? [{
      label: 'Usuários afetados',
      value: insight.affectedUsers.map(u => u.displayName || u.userPrincipalName).join('\n'),
      type: 'list' as const,
    }] : []),
  ];

  return {
    id: insight.id,
    code: insight.code,
    name: insight.title,
    description: insight.criteria,
    category: insight.category,
    status: 'fail',
    severity: normalizeSeverity(insight.severity),
    failDescription: insight.description,
    details: insight.description,
    recommendation: insight.recommendation,
    evidence,
    product: 'entra_id',
  };
}

/**
 * Mapeia ExchangeInsight (Exchange Online) para UnifiedComplianceItem
 */
export function mapExchangeInsight(insight: ExchangeInsight): UnifiedComplianceItem {
  const evidence: EvidenceItem[] = [
    { label: 'Itens afetados', value: `${insight.affectedCount} mailbox(es)`, type: 'text' },
    ...(insight.affectedMailboxes.length > 0 ? [{
      label: 'Mailboxes afetadas',
      value: insight.affectedMailboxes.map(m => m.displayName || m.userPrincipalName).join('\n'),
      type: 'list' as const,
    }] : []),
  ];

  return {
    id: insight.id,
    code: insight.code,
    name: insight.title,
    description: insight.criteria,
    category: insight.category,
    status: 'fail',
    severity: normalizeSeverity(insight.severity),
    failDescription: insight.description,
    details: insight.description,
    recommendation: insight.recommendation,
    evidence,
    product: 'exchange_online',
  };
}

/**
 * Mapeia ApplicationInsight (Entra ID Applications) para UnifiedComplianceItem
 */
export function mapApplicationInsight(insight: ApplicationInsight): UnifiedComplianceItem {
  const evidence: EvidenceItem[] = [
    { label: 'Itens afetados', value: `${insight.affectedCount} aplicativo(s)`, type: 'text' },
    ...(insight.affectedApplications.length > 0 ? [{
      label: 'Aplicativos afetados',
      value: insight.affectedApplications.map(a => a.displayName).join('\n'),
      type: 'list' as const,
    }] : []),
  ];

  return {
    id: insight.id,
    code: insight.code,
    name: insight.title,
    description: insight.criteria,
    category: insight.category,
    status: 'fail',
    severity: normalizeSeverity(insight.severity),
    failDescription: insight.description,
    details: insight.description,
    recommendation: insight.recommendation,
    evidence,
    product: 'entra_id',
  };
}

/**
 * Mapeia ExchangeInsight do hook useExchangeOnlineInsights para UnifiedComplianceItem.
 * Converte affectedEntities em evidências e não inclui remediation/affectedEntities.
 */
/**
 * Mapeia EntraIdInsight do hook useEntraIdInsights para UnifiedComplianceItem.
 * Idêntico ao mapExchangeAgentInsight mas com product 'entra_id' e source 'graph'.
 */
export function mapEntraIdAgentInsight(insight: {
  id: string;
  category: string;
  name: string;
  description: string;
  severity: string;
  status: string;
  details?: string;
  recommendation?: string;
  affectedEntities?: Array<{ name: string; type: string; details?: string }>;
  rawData?: Record<string, unknown>;
  criteria?: string;
  passDescription?: string;
  failDescription?: string;
  notFoundDescription?: string;
  technicalRisk?: string;
  businessImpact?: string;
  apiEndpoint?: string;
}): UnifiedComplianceItem {
  const evidence: EvidenceItem[] = [];

  if (insight.affectedEntities && insight.affectedEntities.length > 0) {
    evidence.push({
      label: 'Itens afetados',
      value: `${insight.affectedEntities.length} item(ns)`,
      type: 'text',
    });
    evidence.push({
      label: 'Entidades afetadas',
      value: insight.affectedEntities.map(e => e.name).join('\n'),
      type: 'list',
    });
  }

  const normalizedStatus = normalizeStatus(insight.status);

  return {
    id: insight.id,
    code: insight.id,
    name: insight.name,
    description: insight.criteria || insight.description,
    category: insight.category,
    status: normalizedStatus,
    severity: normalizeSeverity(insight.severity),
    recommendation: insight.recommendation,
    details: insight.description,
    evidence,
    rawData: insight.rawData,
    product: 'entra_id',
    source: 'graph',
    technicalRisk: insight.technicalRisk,
    businessImpact: insight.businessImpact,
    apiEndpoint: insight.apiEndpoint,
  };
}

export function mapExchangeAgentInsight(insight: {
  id: string;
  category: string;
  name: string;
  description: string;
  severity: string;
  status: string;
  details?: string;
  recommendation?: string;
  affectedEntities?: Array<{ name: string; type: string; details?: string }>;
  rawData?: Record<string, unknown>;
  criteria?: string;
  passDescription?: string;
  failDescription?: string;
  notFoundDescription?: string;
  technicalRisk?: string;
  businessImpact?: string;
  apiEndpoint?: string;
}): UnifiedComplianceItem {
  const evidence: EvidenceItem[] = [];

  if (insight.affectedEntities && insight.affectedEntities.length > 0) {
    evidence.push({
      label: 'Itens afetados',
      value: `${insight.affectedEntities.length} item(ns)`,
      type: 'text',
    });
    evidence.push({
      label: 'Entidades afetadas',
      value: insight.affectedEntities.map(e => e.name).join('\n'),
      type: 'list',
    });
  }

  // Use criteria (static rule description) as the card description
  // Use description (dynamic analysis result) as details ("ANÁLISE EFETUADA")
  const normalizedStatus = normalizeStatus(insight.status);

  return {
    id: insight.id,
    code: insight.id,
    name: insight.name,
    description: insight.criteria || insight.description,
    category: insight.category,
    status: normalizedStatus,
    severity: normalizeSeverity(insight.severity),
    recommendation: insight.recommendation,
    details: insight.description,
    evidence,
    rawData: insight.rawData,
    product: 'exchange_online',
    source: 'exchange_powershell',
    technicalRisk: insight.technicalRisk,
    businessImpact: insight.businessImpact,
    apiEndpoint: insight.apiEndpoint,
  };
}
