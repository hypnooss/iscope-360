-- Criar tabela para alertas do sistema
CREATE TABLE public.system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  target_role app_role,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  dismissed_by UUID[] DEFAULT '{}',
  CONSTRAINT valid_severity CHECK (severity IN ('info', 'warning', 'error'))
);

-- Índices para performance
CREATE INDEX idx_system_alerts_active ON public.system_alerts(is_active) WHERE is_active = true;
CREATE INDEX idx_system_alerts_type ON public.system_alerts(alert_type);

-- Trigger para updated_at
CREATE TRIGGER update_system_alerts_updated_at
  BEFORE UPDATE ON public.system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- Política: Usuários autenticados podem ver alertas ativos para seu role
CREATE POLICY "Users can view applicable active alerts"
  ON public.system_alerts
  FOR SELECT
  USING (
    is_active = true 
    AND (target_role IS NULL OR has_role(auth.uid(), target_role))
    AND (expires_at IS NULL OR expires_at > now())
    AND NOT (auth.uid() = ANY(dismissed_by))
  );

-- Política: Super admins podem gerenciar todos os alertas
CREATE POLICY "Super admins can manage all alerts"
  ON public.system_alerts
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Política: Service role pode inserir/atualizar (para cron job)
CREATE POLICY "Service role can manage alerts"
  ON public.system_alerts
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');