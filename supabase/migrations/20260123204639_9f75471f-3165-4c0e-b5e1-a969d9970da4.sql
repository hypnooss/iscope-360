-- Add error_reason column to store why a permission failed
ALTER TABLE public.m365_tenant_permissions
ADD COLUMN IF NOT EXISTS error_reason TEXT;