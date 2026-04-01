
-- ============================================================
-- Migrar evaluation_logic das 25 regras Entra ID para formato data-driven
-- ============================================================

-- IDT: Identidades
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"mfa_registration_details","evaluate":{"type":"count_missing_mfa","methods":["microsoftAuthenticatorPush","softwareOneTimePasscode","phoneAuthentication"],"threshold":0}}'::jsonb WHERE code = 'IDT-001';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"users_signin_activity","evaluate":{"type":"count_inactive_users","days_threshold":90}}'::jsonb WHERE code = 'IDT-002';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"guests_list","evaluate":{"type":"count_problematic_guests","threshold":10}}'::jsonb WHERE code = 'IDT-003';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"guests_signin_activity","evaluate":{"type":"count_inactive_guests","days_threshold":60,"threshold":15}}'::jsonb WHERE code = 'IDT-004';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"users_password_info","evaluate":{"type":"count_old_passwords","days_threshold":365,"threshold":20}}'::jsonb WHERE code = 'IDT-005';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"users_disabled_count","evaluate":{"type":"count_only"}}'::jsonb WHERE code = 'IDT-006';

-- AUT: Autenticação & Acesso
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"security_defaults","evaluate":{"type":"check_boolean","field":"isEnabled","expected":true}}'::jsonb WHERE code = 'AUT-001';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"conditional_access_policies","evaluate":{"type":"check_ca_policies"}}'::jsonb WHERE code = 'AUT-002';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"risk_detections","evaluate":{"type":"count_risk_detections","high_threshold":0,"medium_threshold":5}}'::jsonb WHERE code = 'AUT-003';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"risky_users","evaluate":{"type":"count_risky_users","confirmed_threshold":0,"at_risk_threshold":5}}'::jsonb WHERE code = 'AUT-004';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"auth_methods_policy","evaluate":{"type":"count_enabled_methods"}}'::jsonb WHERE code = 'AUT-005';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"named_locations","evaluate":{"type":"check_named_locations_exist"}}'::jsonb WHERE code = 'AUT-007';

-- ADM: Privilégios Admin
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"directory_roles","evaluate":{"type":"count_global_admins","role_name":"Global Administrator","threshold":5}}'::jsonb WHERE code = 'ADM-001';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"directory_roles","secondary_source_key":"mfa_registration_details","evaluate":{"type":"check_admin_mfa","role_name":"Global Administrator"}}'::jsonb WHERE code = 'ADM-002';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"directory_roles","evaluate":{"type":"count_privileged_users","threshold":30}}'::jsonb WHERE code = 'ADM-003';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"directory_roles","evaluate":{"type":"count_multi_role_admins","threshold":5}}'::jsonb WHERE code = 'ADM-004';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"directory_roles","evaluate":{"type":"count_guest_admins","threshold":0}}'::jsonb WHERE code = 'ADM-005';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"service_principals","evaluate":{"type":"count_sp_admins","threshold":3}}'::jsonb WHERE code = 'ADM-006';

-- APP: Aplicações & Integrações
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"applications","evaluate":{"type":"count_expiring_credentials","days_ahead":30,"threshold":5}}'::jsonb WHERE code = 'APP-001';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"applications","evaluate":{"type":"count_expired_credentials","threshold":0}}'::jsonb WHERE code = 'APP-002';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"applications","evaluate":{"type":"count_high_privilege_apps","threshold":10}}'::jsonb WHERE code = 'APP-003';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"applications","evaluate":{"type":"count_no_owner_apps","threshold":10}}'::jsonb WHERE code = 'APP-004';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"oauth2_permissions","evaluate":{"type":"count_oauth_consents","threshold":20}}'::jsonb WHERE code = 'APP-005';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"enterprise_apps_count","evaluate":{"type":"count_only"}}'::jsonb WHERE code = 'APP-006';
UPDATE compliance_rules SET evaluation_logic = '{"source_key":"applications_count","evaluate":{"type":"count_only"}}'::jsonb WHERE code = 'APP-007';

-- ============================================================
-- Atualizar endpoint do step directory_roles para incluir $expand=members
-- ============================================================
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'directory_roles' 
        THEN jsonb_set(
          step, 
          '{config,endpoint}', 
          '"/directoryRoles?$expand=members($select=id,displayName,userPrincipalName,userType)"'::jsonb
        )
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') step
  )
)
WHERE id = '164ad4d2-35c6-46cd-9c70-bcd27b044b73';
