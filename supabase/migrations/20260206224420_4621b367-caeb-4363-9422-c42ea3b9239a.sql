-- Add Azure certificate configuration fields to m365_global_config
-- These are required for automatic certificate upload via Graph API

-- App Object ID (different from App ID/Client ID)
-- Required for PATCH /applications/{object-id} endpoint
ALTER TABLE m365_global_config 
ADD COLUMN IF NOT EXISTS app_object_id TEXT;

-- Home Tenant ID where the App Registration lives
-- Required to authenticate with Graph API to manage the app
ALTER TABLE m365_global_config 
ADD COLUMN IF NOT EXISTS home_tenant_id TEXT;

COMMENT ON COLUMN m365_global_config.app_object_id IS 
'Object ID do App Registration no Azure (diferente do App ID). Necessário para PATCH via Graph API.';

COMMENT ON COLUMN m365_global_config.home_tenant_id IS 
'Tenant ID onde o App Registration foi criado. Usado para autenticação na Graph API.';

-- Add field to track Azure certificate registration in agents table
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS azure_certificate_key_id TEXT;

COMMENT ON COLUMN agents.azure_certificate_key_id IS 
'Key ID retornado pelo Azure após upload do certificado. Usado para revogar/atualizar.';