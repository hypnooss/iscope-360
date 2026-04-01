-- Add columns to track validated permissions in m365_global_config
ALTER TABLE public.m365_global_config 
ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS validated_permissions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS validation_tenant_id TEXT;