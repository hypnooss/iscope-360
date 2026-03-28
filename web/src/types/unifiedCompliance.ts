import { EvidenceItem } from '@/types/compliance';
import { AffectedEntity, RemediationGuide } from '@/types/m365Insights';

/**
 * Status unificado para todos os itens de conformidade
 */
export type UnifiedComplianceStatus = 'pass' | 'fail' | 'warning' | 'not_found' | 'unknown';

/**
 * Severidade unificada
 */
export type UnifiedComplianceSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Interface unificada para exibição de itens de conformidade em todo o sistema.
 * Consolida ComplianceCheck, M365Insight, SecurityInsight, ExchangeInsight,
 * ApplicationInsight e ComplianceRuleBasic.
 */
export interface UnifiedComplianceItem {
  /** ID único do item */
  id: string;

  /** Código da regra (ex: EXO-001, FW-012, DNS-003) */
  code: string;

  /** Nome da verificação */
  name: string;

  /** Descrição técnica da análise efetuada */
  description?: string;

  /** Categoria funcional */
  category: string;

  /** Status do resultado */
  status: UnifiedComplianceStatus;

  /** Severidade da regra */
  severity: UnifiedComplianceSeverity;

  // ─── Mensagens contextuais por status ─────────────────────

  /** Mensagem exibida quando status = pass */
  passDescription?: string;

  /** Mensagem exibida quando status = fail */
  failDescription?: string;

  /** Mensagem exibida quando status = not_found */
  notFoundDescription?: string;

  // ─── Contexto estratégico (Nível 2) ───────────────────────

  /** Recomendação de correção (exibida em falha/warning) */
  recommendation?: string;

  /** Risco técnico detalhado */
  technicalRisk?: string;

  /** Impacto no negócio */
  businessImpact?: string;

  // ─── Evidências e dados (Nível 3) ─────────────────────────

  /** Endpoint da API consultado (visível apenas para super_admin) */
  apiEndpoint?: string;

  /** Evidências humanizadas coletadas pelo agente */
  evidence?: EvidenceItem[];

  /** Dados brutos JSON (visível apenas para super_admin) */
  rawData?: Record<string, unknown>;

  /** Detalhes adicionais da análise */
  details?: string;

  // ─── Entidades afetadas ───────────────────────────────────

  /** Lista de entidades afetadas (para drill-down) */
  affectedEntities?: AffectedEntity[];

  /** Contagem total de afetados */
  affectedCount?: number;

  // ─── Remediação ───────────────────────────────────────────

  /** Guia de remediação estruturado (M365) */
  remediation?: RemediationGuide;

  // ─── Metadata ─────────────────────────────────────────────

  /** Produto de origem (ex: exchange_online, entra_id) */
  product?: string;

  /** Fonte de dados (ex: graph, exchange_powershell) */
  source?: string;
}

// ============================================================
// CONFIGURAÇÕES VISUAIS UNIFICADAS
// ============================================================

export const UNIFIED_SEVERITY_LABELS: Record<UnifiedComplianceSeverity, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Info',
};

/** Cores para badges de severidade quando o item FALHOU */
export const UNIFIED_SEVERITY_COLORS_FAIL: Record<UnifiedComplianceSeverity, string> = {
  critical: 'bg-red-500/20 text-red-500 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  low: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
  info: 'bg-muted text-muted-foreground border-border',
};

/** Cores neutras para badges quando o item PASSOU ou N/A */
export const UNIFIED_SEVERITY_COLORS_NEUTRAL = 'bg-muted text-muted-foreground border-border';

export const UNIFIED_STATUS_LABELS: Record<UnifiedComplianceStatus, string> = {
  pass: 'Aprovado',
  fail: 'Falha',
  warning: 'Atenção',
  not_found: 'Não Encontrado',
  unknown: 'Indisponível',
};
