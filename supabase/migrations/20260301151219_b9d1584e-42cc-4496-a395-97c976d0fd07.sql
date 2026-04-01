INSERT INTO m365_required_permissions (permission_name, permission_type, description, is_required, submodule)
SELECT v.permission_name, v.permission_type, v.description, v.is_required, v.submodule::m365_submodule
FROM (VALUES 
  ('DeviceManagementManagedDevices.Read.All', 'Application', 'Leitura de dispositivos gerenciados (Intune)', false, 'entra_id'),
  ('DeviceManagementConfiguration.Read.All', 'Application', 'Leitura de políticas de dispositivos (Intune)', false, 'entra_id'),
  ('SecurityAlert.Read.All', 'Application', 'Leitura de alertas de segurança (Defender)', false, 'entra_id'),
  ('SecurityEvents.Read.All', 'Application', 'Leitura de eventos de segurança', false, 'entra_id')
) AS v(permission_name, permission_type, description, is_required, submodule)
WHERE NOT EXISTS (
  SELECT 1 FROM m365_required_permissions p WHERE p.permission_name = v.permission_name
);