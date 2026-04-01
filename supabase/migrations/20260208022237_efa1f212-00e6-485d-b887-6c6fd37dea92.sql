-- Add sp_object_id column to store Service Principal Object ID for Exchange RBAC setup
ALTER TABLE m365_app_credentials 
ADD COLUMN IF NOT EXISTS sp_object_id TEXT;

COMMENT ON COLUMN m365_app_credentials.sp_object_id IS 
  'Service Principal Object ID no tenant do cliente, usado para setup do Exchange RBAC via PowerShell';