-- Adicionar campos de risco técnico, impacto no negócio e endpoint à tabela compliance_rules
ALTER TABLE public.compliance_rules
ADD COLUMN IF NOT EXISTS technical_risk TEXT,
ADD COLUMN IF NOT EXISTS business_impact TEXT,
ADD COLUMN IF NOT EXISTS api_endpoint TEXT;

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.compliance_rules.technical_risk IS 'Descrição do risco técnico que a regra avalia';
COMMENT ON COLUMN public.compliance_rules.business_impact IS 'Impacto no negócio caso a regra falhe';
COMMENT ON COLUMN public.compliance_rules.api_endpoint IS 'Endpoint de API utilizado para coletar os dados';