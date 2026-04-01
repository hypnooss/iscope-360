-- =============================================================================
-- FASE 1: Infraestrutura para Blueprints Unificados (Agent + Edge Function)
-- =============================================================================

-- 1. Criar enum para tipos de executor
CREATE TYPE public.blueprint_executor_type AS ENUM ('agent', 'edge_function', 'hybrid');

-- 2. Adicionar coluna executor_type na tabela device_blueprints
ALTER TABLE public.device_blueprints 
ADD COLUMN executor_type public.blueprint_executor_type NOT NULL DEFAULT 'agent';

-- 3. Comentário explicativo na coluna
COMMENT ON COLUMN public.device_blueprints.executor_type IS 
'Define quem executa os steps do blueprint: agent (Python Agent), edge_function (Deno Edge Function), ou hybrid (ambos)';

-- 4. Criar tabela para templates de steps reutilizáveis
CREATE TABLE public.blueprint_step_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Identificação
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo de executor e runtime
  executor public.blueprint_executor_type NOT NULL DEFAULT 'agent',
  runtime TEXT NOT NULL, -- 'http_request', 'graph_api', 'powershell', 'ssh', 'snmp', 'dns_query', 'rest_api'
  
  -- Configuração padrão do step (JSON)
  default_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Metadados
  category TEXT, -- Para agrupar templates similares (ex: 'identity', 'email', 'security')
  tags TEXT[] DEFAULT '{}',
  
  -- Controle
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Comentários na tabela
COMMENT ON TABLE public.blueprint_step_templates IS 
'Templates reutilizáveis de steps para blueprints. Permite criar steps padrão que podem ser referenciados em múltiplos blueprints.';

COMMENT ON COLUMN public.blueprint_step_templates.runtime IS 
'Runtime do step: http_request, graph_api, powershell, ssh, snmp, dns_query, rest_api, etc.';

COMMENT ON COLUMN public.blueprint_step_templates.default_config IS 
'Configuração padrão do step em JSON. Pode incluir endpoint, method, headers, params, etc.';

-- 6. Índices para performance
CREATE INDEX idx_blueprint_step_templates_code ON public.blueprint_step_templates(code);
CREATE INDEX idx_blueprint_step_templates_executor ON public.blueprint_step_templates(executor);
CREATE INDEX idx_blueprint_step_templates_runtime ON public.blueprint_step_templates(runtime);
CREATE INDEX idx_blueprint_step_templates_category ON public.blueprint_step_templates(category);
CREATE INDEX idx_blueprint_step_templates_active ON public.blueprint_step_templates(is_active) WHERE is_active = true;

-- 7. Trigger para updated_at
CREATE TRIGGER update_blueprint_step_templates_updated_at
  BEFORE UPDATE ON public.blueprint_step_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 8. RLS Policies
ALTER TABLE public.blueprint_step_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage step templates"
  ON public.blueprint_step_templates
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view active step templates"
  ON public.blueprint_step_templates
  FOR SELECT
  USING (is_active = true);

-- 9. Atualizar blueprints existentes para ter executor_type correto
-- Fortigate e External Domain usam agent
UPDATE public.device_blueprints 
SET executor_type = 'agent'
WHERE device_type_id IN (
  SELECT id FROM public.device_types 
  WHERE code IN ('fortigate', 'external_domain')
);