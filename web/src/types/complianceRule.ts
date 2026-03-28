/**
 * Interface centralizada para regras de compliance
 * Usado em todos os componentes de administração e relatórios
 */
export interface ComplianceRuleDB {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  severity: string;
  weight: number;
  recommendation: string | null;
  pass_description: string | null;
  fail_description: string | null;
  not_found_description: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluation_logic: Record<string, any>;
  device_type_id: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  /** Descrição do risco técnico que a regra avalia */
  technical_risk: string | null;
  /** Impacto no negócio caso a regra falhe */
  business_impact: string | null;
  /** Endpoint de API utilizado para coletar os dados */
  api_endpoint: string | null;
}

/**
 * Versão simplificada para visualizações que não precisam de todos os campos
 */
export interface ComplianceRuleBasic {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  severity: string;
  weight: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluation_logic: Record<string, any>;
  is_active: boolean;
  // Campos de metadados para preview do relatório
  recommendation: string | null;
  pass_description: string | null;
  fail_description: string | null;
  not_found_description: string | null;
  technical_risk: string | null;
  business_impact: string | null;
  api_endpoint: string | null;
}

export type RuleSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
