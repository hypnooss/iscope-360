-- Add 'teams' to m365_submodule enum
ALTER TYPE m365_submodule ADD VALUE IF NOT EXISTS 'teams';

-- Add steps to Intune & Defender blueprint
UPDATE device_blueprints SET collection_steps = jsonb_set(collection_steps, '{steps}', collection_steps->'steps' || '[{"id":"security_incidents","name":"Incidentes de Segurança","executor":"edge_function","runtime":"graph_api","category":"defender_security","config":{"endpoint":"/security/incidents?$top=50&$select=id,displayName,severity,status,createdDateTime","method":"GET","api_version":"v1.0"}},{"id":"attack_simulation","name":"Simulações de Phishing","executor":"edge_function","runtime":"graph_api","category":"defender_security","config":{"endpoint":"/security/attackSimulation/simulations?$top=50","method":"GET","api_version":"v1.0"}},{"id":"information_protection_labels","name":"Labels de Proteção","executor":"edge_function","runtime":"graph_api","category":"defender_security","config":{"endpoint":"/informationProtection/policy/labels","method":"GET","api_version":"beta"}}]'::jsonb), updated_at = now() WHERE id = '5bca1743-0a82-428b-a6d7-7c410a96ea8f';

-- Update Teams blueprint
UPDATE device_blueprints SET collection_steps = '{"steps":[{"id":"teams_list","name":"Lista de Teams com Membros","executor":"edge_function","runtime":"graph_api","category":"teams_collaboration","config":{"endpoint":"/groups?$filter=resourceProvisioningOptions/Any(x:x eq ''Team'')&$select=id,displayName,visibility,createdDateTime,mail&$expand=owners($select=id,displayName),members($select=id,displayName,userType)&$top=200","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},{"id":"teams_settings","name":"Configurações do Teams","executor":"edge_function","runtime":"graph_api","category":"teams_collaboration","config":{"endpoint":"/teamwork/teamsAppSettings","method":"GET","api_version":"v1.0"}}]}'::jsonb, updated_at = now() WHERE id = '0478d423-918d-4483-98af-f30df3ade0d3';

-- Update SharePoint blueprint
UPDATE device_blueprints SET collection_steps = '{"steps":[{"id":"sharepoint_sites","name":"Sites do SharePoint","executor":"edge_function","runtime":"graph_api","category":"sharepoint_onedrive","config":{"endpoint":"/sites?search=*&$select=id,displayName,webUrl,createdDateTime,lastModifiedDateTime,sharingCapability&$top=200","method":"GET","api_version":"v1.0"}},{"id":"sharepoint_external_sharing","name":"Configurações de Compartilhamento SharePoint","executor":"edge_function","runtime":"graph_api","category":"sharepoint_onedrive","config":{"endpoint":"/admin/sharepoint/settings","method":"GET","api_version":"beta"}}]}'::jsonb, updated_at = now() WHERE id = 'e794e61a-5613-46db-a1ee-ed26dbac1748';

-- DEF rules
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"security_alerts_v2","evaluate":{"type":"check_security_alerts","high_threshold":0}}'::jsonb, api_endpoint = '/security/alerts_v2', updated_at = now() WHERE code = 'DEF-001' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"security_incidents","evaluate":{"type":"check_security_incidents"}}'::jsonb, api_endpoint = '/security/incidents', updated_at = now() WHERE code = 'DEF-002' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"attack_simulation","evaluate":{"type":"check_attack_simulation"}}'::jsonb, api_endpoint = '/security/attackSimulation/simulations', updated_at = now() WHERE code = 'DEF-003' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"secure_scores","evaluate":{"type":"check_secure_score","min_percentage":60}}'::jsonb, api_endpoint = '/security/secureScores', updated_at = now() WHERE code = 'DEF-004' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"information_protection_labels","evaluate":{"type":"check_protection_labels","min_count":1}}'::jsonb, api_endpoint = '/informationProtection/policy/labels', updated_at = now() WHERE code = 'DEF-005' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';

-- INT rules
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"managed_devices","evaluate":{"type":"check_device_compliance"}}'::jsonb, api_endpoint = '/deviceManagement/managedDevices', updated_at = now() WHERE code = 'INT-001' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"managed_devices","evaluate":{"type":"check_device_encryption"}}'::jsonb, api_endpoint = '/deviceManagement/managedDevices', updated_at = now() WHERE code = 'INT-002' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"managed_devices","evaluate":{"type":"check_device_jailbreak"}}'::jsonb, api_endpoint = '/deviceManagement/managedDevices', updated_at = now() WHERE code = 'INT-003' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"managed_devices","evaluate":{"type":"check_device_os_update","days_threshold":30}}'::jsonb, api_endpoint = '/deviceManagement/managedDevices', updated_at = now() WHERE code = 'INT-004' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"device_compliance_policies","evaluate":{"type":"check_compliance_policies_exist"}}'::jsonb, api_endpoint = '/deviceManagement/deviceCompliancePolicies', updated_at = now() WHERE code = 'INT-005' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"managed_devices","evaluate":{"type":"check_device_apps"}}'::jsonb, api_endpoint = '/deviceManagement/managedDevices', updated_at = now() WHERE code = 'INT-006' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';

-- PIM rules
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"pim_role_assignments","evaluate":{"type":"check_pim_eligible"}}'::jsonb, api_endpoint = '/roleManagement/directory/roleEligibilityScheduleInstances', updated_at = now() WHERE code = 'PIM-001' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"pim_role_active_assignments","evaluate":{"type":"check_pim_activations"}}'::jsonb, api_endpoint = '/roleManagement/directory/roleAssignmentScheduleInstances', updated_at = now() WHERE code = 'PIM-002' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"pim_role_assignments","evaluate":{"type":"check_pim_approval"}}'::jsonb, api_endpoint = '/roleManagement/directory/roleEligibilityScheduleInstances', updated_at = now() WHERE code = 'PIM-003' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"pim_role_active_assignments","secondary_source_key":"pim_role_assignments","evaluate":{"type":"check_pim_permanent_ratio","max_ratio":50}}'::jsonb, api_endpoint = '/roleManagement/directory/roleAssignmentScheduleInstances', updated_at = now() WHERE code = 'PIM-004' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';

-- SPO rules
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"sharepoint_sites","evaluate":{"type":"check_sharepoint_external_sharing"}}'::jsonb, api_endpoint = '/sites', updated_at = now() WHERE code = 'SPO-001' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"sharepoint_external_sharing","evaluate":{"type":"check_sharepoint_anonymous_links"}}'::jsonb, api_endpoint = '/admin/sharepoint/settings', updated_at = now() WHERE code = 'SPO-002' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"sharepoint_sites","evaluate":{"type":"check_sharepoint_sensitivity_labels","threshold":5}}'::jsonb, api_endpoint = '/sites', updated_at = now() WHERE code = 'SPO-003' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"sharepoint_external_sharing","evaluate":{"type":"check_onedrive_sharing"}}'::jsonb, api_endpoint = '/admin/sharepoint/settings', updated_at = now() WHERE code = 'SPO-004' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';

-- TMS rules
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"teams_list","evaluate":{"type":"check_teams_guests","threshold":0}}'::jsonb, api_endpoint = '/groups', updated_at = now() WHERE code = 'TMS-001' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"teams_list","evaluate":{"type":"check_teams_public","threshold":0}}'::jsonb, api_endpoint = '/groups', updated_at = now() WHERE code = 'TMS-002' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"teams_list","evaluate":{"type":"check_teams_owners","threshold":5}}'::jsonb, api_endpoint = '/groups', updated_at = now() WHERE code = 'TMS-003' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"teams_list","evaluate":{"type":"check_teams_private_channels"}}'::jsonb, api_endpoint = '/groups', updated_at = now() WHERE code = 'TMS-004' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';

-- Insert permissions
INSERT INTO m365_required_permissions (submodule, permission_name, permission_type, description, is_required)
SELECT v.submodule::m365_submodule, v.permission_name, 'Application', v.description, true
FROM (VALUES
  ('entra_id', 'AuditLog.Read.All', 'Leitura de logs de auditoria do diretório'),
  ('defender', 'SecurityIncident.Read.All', 'Leitura de incidentes de segurança (Defender)'),
  ('defender', 'AttackSimulation.Read.All', 'Leitura de simulações de phishing (Defender)'),
  ('defender', 'InformationProtectionPolicy.Read.All', 'Leitura de labels de proteção (Purview)'),
  ('entra_id', 'TeamSettings.Read.All', 'Leitura de configurações de Teams'),
  ('entra_id', 'Channel.ReadBasic.All', 'Leitura de canais de Teams'),
  ('entra_id', 'TeamMember.Read.All', 'Leitura de membros de Teams'),
  ('sharepoint', 'SharePointTenantSettings.Read.All', 'Leitura de configurações do admin SharePoint'),
  ('entra_id', 'Domain.Read.All', 'Leitura de domínios verificados')
) AS v(submodule, permission_name, description)
WHERE NOT EXISTS (SELECT 1 FROM m365_required_permissions p WHERE p.permission_name = v.permission_name);