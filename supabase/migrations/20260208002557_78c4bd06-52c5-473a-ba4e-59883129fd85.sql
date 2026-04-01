-- Add RoleManagement.ReadWrite.Directory permission for Exchange Administrator role assignment
INSERT INTO public.m365_required_permissions (submodule, permission_name, permission_type, description, is_required)
VALUES (
  'entra_id', 
  'RoleManagement.ReadWrite.Directory', 
  'Application', 
  'Atribuir roles de diretório (Exchange Administrator) ao Service Principal', 
  true
)
ON CONFLICT (permission_name, submodule) DO UPDATE SET
  description = EXCLUDED.description,
  is_required = EXCLUDED.is_required;