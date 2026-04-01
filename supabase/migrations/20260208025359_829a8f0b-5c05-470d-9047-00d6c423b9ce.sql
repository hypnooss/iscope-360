-- Adicionar coluna app_object_id em m365_app_credentials
-- Necessária para PATCH /applications/{id} via Graph API para upload de certificados

ALTER TABLE m365_app_credentials 
ADD COLUMN IF NOT EXISTS app_object_id TEXT;

COMMENT ON COLUMN m365_app_credentials.app_object_id IS 
'Object ID do App Registration no tenant do cliente. Necessário para PATCH /applications/{id} via Graph API para upload de certificados.';