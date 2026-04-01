-- ============================================
-- FASE 1: Tabelas para Blueprints Genéricos
-- ============================================

-- Enum para categoria de dispositivos
CREATE TYPE device_category AS ENUM ('firewall', 'switch', 'router', 'wlc', 'server', 'other');

-- Enum para severidade de regras
CREATE TYPE rule_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');

-- ============================================
-- Tabela: device_types
-- Define os tipos de dispositivos suportados
-- ============================================
CREATE TABLE public.device_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  category device_category NOT NULL DEFAULT 'firewall',
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.device_types ENABLE ROW LEVEL SECURITY;

-- Policies for device_types
CREATE POLICY "Users can view active device types"
ON public.device_types
FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins can manage device types"
ON public.device_types
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_device_types_updated_at
BEFORE UPDATE ON public.device_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Tabela: device_blueprints
-- Define os blueprints de coleta para cada tipo
-- ============================================
CREATE TABLE public.device_blueprints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_type_id UUID NOT NULL REFERENCES public.device_types(id) ON DELETE CASCADE,
  version TEXT NOT NULL DEFAULT 'any',
  name TEXT NOT NULL,
  description TEXT,
  collection_steps JSONB NOT NULL DEFAULT '{"steps": []}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(device_type_id, version)
);

-- Enable RLS
ALTER TABLE public.device_blueprints ENABLE ROW LEVEL SECURITY;

-- Policies for device_blueprints
CREATE POLICY "Users can view active blueprints"
ON public.device_blueprints
FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins can manage blueprints"
ON public.device_blueprints
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_device_blueprints_updated_at
BEFORE UPDATE ON public.device_blueprints
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Tabela: compliance_rules
-- Regras para processar dados e gerar scores
-- ============================================
CREATE TABLE public.compliance_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_type_id UUID NOT NULL REFERENCES public.device_types(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  severity rule_severity NOT NULL DEFAULT 'medium',
  description TEXT,
  evaluation_logic JSONB NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(device_type_id, code)
);

-- Enable RLS
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;

-- Policies for compliance_rules
CREATE POLICY "Users can view active rules"
ON public.compliance_rules
FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins can manage rules"
ON public.compliance_rules
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_compliance_rules_updated_at
BEFORE UPDATE ON public.compliance_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Adicionar device_type_id na tabela firewalls
-- ============================================
ALTER TABLE public.firewalls 
ADD COLUMN device_type_id UUID REFERENCES public.device_types(id);

-- ============================================
-- Índices para performance
-- ============================================
CREATE INDEX idx_device_blueprints_device_type ON public.device_blueprints(device_type_id);
CREATE INDEX idx_compliance_rules_device_type ON public.compliance_rules(device_type_id);
CREATE INDEX idx_firewalls_device_type ON public.firewalls(device_type_id);