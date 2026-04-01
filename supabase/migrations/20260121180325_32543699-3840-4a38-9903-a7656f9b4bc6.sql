-- Adicionar constraint UNIQUE em m365_app_credentials
ALTER TABLE m365_app_credentials 
ADD CONSTRAINT m365_app_credentials_tenant_record_id_key 
UNIQUE (tenant_record_id);

-- Atualizar auth_type check constraint para incluir 'multi_tenant_app'
ALTER TABLE m365_app_credentials 
DROP CONSTRAINT IF EXISTS m365_app_credentials_auth_type_check;

ALTER TABLE m365_app_credentials 
ADD CONSTRAINT m365_app_credentials_auth_type_check 
CHECK (auth_type = ANY (ARRAY['client_secret'::text, 'certificate'::text, 'multi_tenant_app'::text]));