-- Add Exchange RBAC status columns to m365_tenants
ALTER TABLE m365_tenants 
ADD COLUMN IF NOT EXISTS exchange_sp_registered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS exchange_rbac_assigned BOOLEAN DEFAULT FALSE;