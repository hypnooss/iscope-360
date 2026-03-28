/**
 * M365 Security Posture - Unified Data Model
 * 
 * Modelo híbrido: organização por CATEGORIA DE RISCO, correção por PRODUTO
 */

// ============================================================
// ENUMS E TIPOS BASE
// ============================================================

/**
 * Categorias de RISCO (não produtos técnicos)
 * Usado para navegação e descoberta
 */
export type M365RiskCategory = 
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
 * Produtos Microsoft afetados
 * Usado para guia de correção
 */
export type M365Product = 
  | 'entra_id' 
  | 'exchange_online' 
  | 'sharepoint' 
  | 'defender' 
  | 'intune';

/**
 * Severidade do insight
 */
export type M365Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Status do insight
 */
export type M365InsightStatus = 'pass' | 'fail' | 'warning';

/**
 * Origem da coleta de dados
 */
export type InsightSource = 
  | 'graph'               // Microsoft Graph API
  | 'exchange_powershell' // Exchange Online PowerShell
  | 'mixed';              // Combinação de fontes

/**
 * Classificação geral da postura
 */
export type PostureClassification = 'excellent' | 'good' | 'attention' | 'critical';

// ============================================================
// LABELS E CONFIGURAÇÕES
// ============================================================

export const CATEGORY_LABELS: Record<M365RiskCategory, string> = {
  identities: 'Identidades',
  auth_access: 'Autenticação & Acesso',
  admin_privileges: 'Privilégios Administrativos',
  apps_integrations: 'Aplicações & Integrações',
  email_exchange: 'Email & Exchange',
  threats_activity: 'Ameaças & Atividades Suspeitas',
  intune_devices: 'Intune & Dispositivos',
  pim_governance: 'PIM & Governança',
  sharepoint_onedrive: 'SharePoint & OneDrive',
  teams_collaboration: 'Teams & Colaboração',
  defender_security: 'Defender & DLP',
};

export const CATEGORY_ICONS: Record<M365RiskCategory, string> = {
  identities: 'Users',
  auth_access: 'KeyRound',
  admin_privileges: 'Crown',
  apps_integrations: 'Blocks',
  email_exchange: 'Mail',
  threats_activity: 'AlertTriangle',
  intune_devices: 'Smartphone',
  pim_governance: 'ShieldCheck',
  sharepoint_onedrive: 'HardDrive',
  teams_collaboration: 'MessageSquare',
  defender_security: 'Shield',
};

export const CATEGORY_COLORS: Record<M365RiskCategory, string> = {
  identities: 'blue',
  auth_access: 'purple',
  admin_privileges: 'amber',
  apps_integrations: 'cyan',
  email_exchange: 'indigo',
  threats_activity: 'red',
  intune_devices: 'green',
  pim_governance: 'orange',
  sharepoint_onedrive: 'teal',
  teams_collaboration: 'violet',
  defender_security: 'rose',
};

export const PRODUCT_LABELS: Record<M365Product, string> = {
  entra_id: 'Entra ID',
  exchange_online: 'Exchange Online',
  sharepoint: 'SharePoint',
  defender: 'Defender',
  intune: 'Intune',
};

export const PRODUCT_PORTAL_URLS: Record<M365Product, string> = {
  entra_id: 'https://entra.microsoft.com',
  exchange_online: 'https://admin.exchange.microsoft.com',
  sharepoint: 'https://admin.microsoft.com/sharepoint',
  defender: 'https://security.microsoft.com',
  intune: 'https://intune.microsoft.com',
};

export const SEVERITY_LABELS: Record<M365Severity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Info',
};

export const SEVERITY_CONFIG: Record<M365Severity, {
  label: string;
  color: string;
  bgColor: string;
  weight: number;
}> = {
  critical: {
    label: 'Crítico',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    weight: 15,
  },
  high: {
    label: 'Alto',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    weight: 8,
  },
  medium: {
    label: 'Médio',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    weight: 4,
  },
  low: {
    label: 'Baixo',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    weight: 2,
  },
  info: {
    label: 'Info',
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    weight: 0,
  },
};

export const CLASSIFICATION_CONFIG: Record<PostureClassification, {
  label: string;
  color: string;
  bgColor: string;
  minScore: number;
}> = {
  excellent: {
    label: 'Excelente',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    minScore: 90,
  },
  good: {
    label: 'Bom',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    minScore: 70,
  },
  attention: {
    label: 'Atenção',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    minScore: 50,
  },
  critical: {
    label: 'Crítico',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    minScore: 0,
  },
};

// ============================================================
// INTERFACES PRINCIPAIS
// ============================================================

/**
 * Guia de correção estruturado
 * Contém todas as informações necessárias para remediar o problema
 */
export interface RemediationGuide {
  /** Produto Microsoft afetado */
  productAfetado: M365Product;
  
  /** URL direta do portal de administração */
  portalUrl: string;
  
  /** Caminho de cliques exatos no portal */
  caminhoPortal: string[];
  
  /** Comando PowerShell opcional */
  comandoPowerShell?: string;
  
  /** Passos detalhados numerados */
  passosDetalhados: string[];
  
  /** Link para documentação oficial Microsoft */
  referenciaDocumentacao: string;
}

/**
 * Usuário/entidade afetada por um insight
 */
export interface AffectedEntity {
  id: string;
  displayName: string;
  userPrincipalName?: string;
  email?: string;
  details?: Record<string, unknown>;
}

/**
 * Insight M365 Unificado
 * Modelo de dados único para todas as verificações de segurança
 */
export interface M365Insight {
  /** Identificador único do insight */
  id: string;
  
  /** Código do blueprint (ex: "IDT-001", "ADM-004") */
  code: string;

  // ─── Classificação ─────────────────────────────────────────
  
  /** Categoria de risco (para navegação) */
  category: M365RiskCategory;
  
  /** Produto afetado (para remediação) */
  product: M365Product;
  
  /** Severidade do insight */
  severity: M365Severity;

  // ─── Conteúdo Executivo ────────────────────────────────────
  
  /** Título claro e direto */
  titulo: string;
  
  /** Descrição em linguagem simples para executivos */
  descricaoExecutiva: string;
  
  /** Detalhes técnicos do risco */
  riscoTecnico: string;
  
  /** Impacto no negócio se não corrigido */
  impactoNegocio: string;

  // ─── Score ─────────────────────────────────────────────────
  
  /** Impacto no score (1-10, usado no cálculo de penalidade) */
  scoreImpacto: number;
  
  /** Status atual do insight */
  status: M365InsightStatus;

  // ─── Evidências ────────────────────────────────────────────
  
  /** Dados brutos coletados (para drill-down) */
  evidencias: unknown[];
  
  /** Lista de entidades afetadas */
  affectedEntities: AffectedEntity[];
  
  /** Contagem total de afetados */
  affectedCount: number;
  
  /** Endpoint da Graph API ou PowerShell usado */
  endpointUsado: string;
  
  /** Origem da coleta de dados */
  source: InsightSource;

  // ─── Correção ──────────────────────────────────────────────
  
  /** Guia completo de remediação */
  remediacao: RemediationGuide;

  // ─── Metadados ─────────────────────────────────────────────
  
  /** Data/hora da detecção */
  detectedAt: string;
  
  /** Período analisado (para insights baseados em logs) */
  timeRange?: { from: string; to: string };
  
  /** Status anterior (para tendência) */
  previousStatus?: M365InsightStatus;
  
  /** Primeira vez que foi detectado */
  firstSeenAt?: string;
  
  /** Última vez que foi detectado */
  lastSeenAt?: string;
}

// ============================================================
// INTERFACES DE RESPOSTA DA API
// ============================================================

/**
 * Sumário por severidade
 */
export interface SeveritySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

/**
 * Breakdown por categoria
 */
export interface CategoryBreakdown {
  category: M365RiskCategory;
  label: string;
  count: number;
  failCount: number;
  score: number;
  criticalCount: number;
  highCount: number;
}

/**
 * Informações do tenant
 */
export interface TenantInfo {
  id: string;
  domain: string;
  displayName?: string;
}

/**
 * Insight coletado pelo agent via PowerShell
 * Formato simplificado comparado ao M365Insight padrão
 */
export interface M365AgentInsight {
  id: string;
  category: string;
  name: string;
  description: string;
  severity: M365Severity;
  status: 'pass' | 'fail' | 'warn' | 'unknown';
  details?: string;
  recommendation?: string;
  affectedEntities?: Array<{ name: string; type: string; details?: string }>;
  rawData?: Record<string, unknown>;
  /** Critério estático da regra (texto descritivo) */
  criteria?: string;
  /** Descrição quando passa */
  passDescription?: string;
  /** Descrição quando falha */
  failDescription?: string;
  /** Descrição quando não encontrado */
  notFoundDescription?: string;
  /** Risco técnico associado */
  technicalRisk?: string;
  /** Impacto no negócio */
  businessImpact?: string;
  /** Endpoint de API utilizado */
  apiEndpoint?: string;
}

/**
 * Resposta completa da Edge Function m365-security-posture
 */
export interface M365PostureResponse {
  success: boolean;
  error?: string;
  
  // ─── Score Consolidado ─────────────────────────────────────
  
  /** Score geral (0-100) */
  score: number;
  
  /** Classificação textual */
  classification: PostureClassification;
  
  /** Tendência vs última análise */
  scoreTrend?: {
    previousScore: number;
    change: number;
    direction: 'up' | 'down' | 'stable';
  };

  // ─── Sumários ──────────────────────────────────────────────
  
  /** Contagem por severidade */
  summary: SeveritySummary;
  
  /** Breakdown por categoria de risco */
  categoryBreakdown: CategoryBreakdown[];

  // ─── Insights ──────────────────────────────────────────────
  
  /** Lista completa de insights (Graph API) */
  insights: M365Insight[];
  
  /** Insights coletados pelo agent via PowerShell */
  agentInsights?: M365AgentInsight[];
  
  /** Status da coleta do agent */
  agentStatus?: 'pending' | 'running' | 'completed' | 'partial' | 'failed' | null;

  // ─── Metadados ─────────────────────────────────────────────
  
  /** Informações do tenant analisado */
  tenant: TenantInfo;
  
  /** Data/hora da análise */
  analyzedAt: string;
  
  /** Período dos dados analisados */
  analyzedPeriod: { from: string; to: string };
  
  /** Cache info */
  cached?: boolean;
  cachedAt?: string;
  
  /** Errors during collection (partial failures) */
  errors?: string[];
  
  /** ID do registro m365_posture_history (para carregar affectedEntities sob demanda) */
  _historyId?: string;
}

// ============================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================

/**
 * Calcula a classificação baseada no score
 */
export function getClassification(score: number): PostureClassification {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'attention';
  return 'critical';
}

/**
 * Calcula a penalidade de um insight (algoritmo escalável)
 */
export function calculateInsightPenalty(insight: M365Insight): number {
  const severityWeight = SEVERITY_CONFIG[insight.severity].weight;
  const impactScale = Math.log10(insight.affectedCount + 1) + 1;
  return severityWeight * (insight.scoreImpacto / 5) * impactScale;
}

/**
 * Calcula o score total baseado nos insights
 */
export function calculatePostureScore(insights: M365Insight[]): number {
  const failedInsights = insights.filter(i => i.status === 'fail');
  
  const totalPenalty = failedInsights.reduce(
    (sum, insight) => sum + calculateInsightPenalty(insight),
    0
  );
  
  return Math.max(0, Math.round(100 - totalPenalty));
}

/**
 * Agrupa insights por categoria
 */
export function groupInsightsByCategory(
  insights: M365Insight[]
): Record<M365RiskCategory, M365Insight[]> {
  const grouped: Record<M365RiskCategory, M365Insight[]> = {
    identities: [],
    auth_access: [],
    admin_privileges: [],
    apps_integrations: [],
    email_exchange: [],
    threats_activity: [],
    intune_devices: [],
    pim_governance: [],
    sharepoint_onedrive: [],
    teams_collaboration: [],
    defender_security: [],
  };
  
  for (const insight of insights) {
    grouped[insight.category].push(insight);
  }
  
  return grouped;
}

/**
 * Calcula o breakdown por categoria
 */
export function calculateCategoryBreakdown(
  insights: M365Insight[]
): CategoryBreakdown[] {
  const grouped = groupInsightsByCategory(insights);
  
  return Object.entries(grouped).map(([category, categoryInsights]) => {
    const failedInsights = categoryInsights.filter(i => i.status === 'fail');
    const categoryScore = calculatePostureScore(categoryInsights);
    
    return {
      category: category as M365RiskCategory,
      label: CATEGORY_LABELS[category as M365RiskCategory],
      count: categoryInsights.length,
      failCount: failedInsights.length,
      score: categoryScore,
      criticalCount: failedInsights.filter(i => i.severity === 'critical').length,
      highCount: failedInsights.filter(i => i.severity === 'high').length,
    };
  });
}

/**
 * Calcula o sumário por severidade
 */
export function calculateSeveritySummary(insights: M365Insight[]): SeveritySummary {
  const failed = insights.filter(i => i.status === 'fail');
  
  return {
    critical: failed.filter(i => i.severity === 'critical').length,
    high: failed.filter(i => i.severity === 'high').length,
    medium: failed.filter(i => i.severity === 'medium').length,
    low: failed.filter(i => i.severity === 'low').length,
    info: failed.filter(i => i.severity === 'info').length,
    total: failed.length,
  };
}
