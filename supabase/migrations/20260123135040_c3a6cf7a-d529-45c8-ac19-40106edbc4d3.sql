-- Change the code column from enum to TEXT to allow dynamic module creation
-- First, we need to alter the column type

ALTER TABLE modules 
ALTER COLUMN code TYPE TEXT USING code::TEXT;

-- Drop the old enum type (if not used elsewhere, it will be automatically dropped when no longer referenced)
-- The scope_module enum is also used in user_modules table's foreign relationship logic
-- We need to also update any functions that reference scope_module

-- Update has_module_access function to work with TEXT instead of enum
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _module_code TEXT)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_modules um
        JOIN public.modules m ON um.module_id = m.id
        WHERE um.user_id = _user_id 
        AND m.code = _module_code
        AND m.is_active = true
    ) OR has_role(_user_id, 'super_admin')
$function$;

-- Add a constraint to ensure code format (must start with scope_)
ALTER TABLE modules
ADD CONSTRAINT modules_code_format CHECK (code ~ '^scope_[a-z0-9_]+$');