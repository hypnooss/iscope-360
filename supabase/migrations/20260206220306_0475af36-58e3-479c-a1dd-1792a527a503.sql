-- 1. Adicionar campos ao agents para suporte a certificados M365
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS certificate_thumbprint TEXT,
ADD COLUMN IF NOT EXISTS certificate_public_key TEXT,
ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '[]'::jsonb;

-- Comentários nas colunas
COMMENT ON COLUMN agents.certificate_thumbprint IS 'SHA1 thumbprint do certificado X.509 para autenticação M365 PowerShell';
COMMENT ON COLUMN agents.certificate_public_key IS 'Conteúdo do certificado público (.crt) em PEM para download';
COMMENT ON COLUMN agents.capabilities IS 'Lista de capacidades do agent: powershell, ssh, snmp, http, etc.';

-- 2. Criar tabela de vínculo tenant-agent para M365 PowerShell
CREATE TABLE m365_tenant_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_record_id UUID NOT NULL REFERENCES m365_tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_record_id, agent_id)
);

-- Comentário na tabela
COMMENT ON TABLE m365_tenant_agents IS 'Vínculo entre tenants M365 e agents para análises via PowerShell';

-- 3. RLS para m365_tenant_agents
ALTER TABLE m365_tenant_agents ENABLE ROW LEVEL SECURITY;

-- Policy para visualização
CREATE POLICY "Users can view tenant agents of accessible tenants"
ON m365_tenant_agents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM m365_tenants t
    WHERE t.id = tenant_record_id
    AND has_client_access(auth.uid(), t.client_id)
  )
);

-- Policy para gerenciamento
CREATE POLICY "Users with edit permission can manage tenant agents"
ON m365_tenant_agents FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM m365_tenants t
    WHERE t.id = tenant_record_id
    AND has_client_access(auth.uid(), t.client_id)
    AND get_module_permission(auth.uid(), 'm365') IN ('edit', 'full')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM m365_tenants t
    WHERE t.id = tenant_record_id
    AND has_client_access(auth.uid(), t.client_id)
    AND get_module_permission(auth.uid(), 'm365') IN ('edit', 'full')
  )
);

-- Policy para service role
CREATE POLICY "Service role can manage tenant agents"
ON m365_tenant_agents FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- Trigger para updated_at
CREATE TRIGGER update_m365_tenant_agents_updated_at
BEFORE UPDATE ON m365_tenant_agents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Adicionar novo tipo de task para M365 PowerShell
ALTER TYPE agent_task_type ADD VALUE IF NOT EXISTS 'm365_powershell';