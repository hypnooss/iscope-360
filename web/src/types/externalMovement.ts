export type ExternalMovementAlertType =
  | 'exfiltration'
  | 'high_volume'
  | 'new_domain'
  | 'external_forward'
  | 'off_hours';

export type ExternalMovementSeverity = 'critical' | 'high' | 'medium';

export interface ExternalMovementAlert {
  id: string;
  tenant_record_id: string;
  client_id: string;
  snapshot_id: string | null;
  user_id: string;
  alert_type: ExternalMovementAlertType;
  severity: ExternalMovementSeverity;
  title: string;
  description: string | null;
  risk_score: number;
  z_score: number | null;
  pct_increase: number | null;
  is_new: boolean;
  is_anomalous: boolean;
  affected_domains: string[];
  evidence: Record<string, any>;
  created_at: string;
}

export const ALERT_TYPE_LABELS: Record<ExternalMovementAlertType, string> = {
  exfiltration: 'Possível Exfiltração Detectada',
  high_volume: 'Alto Volume Externo',
  new_domain: 'Novo Domínio Externo',
  external_forward: 'Forward Externo Recente',
  off_hours: 'Envio Fora do Horário Padrão',
};

export const SEVERITY_LABELS: Record<ExternalMovementSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
};

export function riskScoreLabel(score: number): { label: string; color: string } {
  if (score >= 81) return { label: 'CRÍTICO', color: 'text-rose-400' };
  if (score >= 61) return { label: 'ALTO', color: 'text-orange-400' };
  if (score >= 31) return { label: 'MODERADO', color: 'text-warning' };
  return { label: 'BAIXO', color: 'text-emerald-400' };
}
