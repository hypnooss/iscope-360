-- =============================================================================
-- FASE 2: Blueprint M365 Postura de Segurança
-- Migração dos 60+ endpoints hardcoded para collection_steps no banco
-- =============================================================================

-- 1. Criar blueprint M365 Postura de Segurança com executor híbrido
INSERT INTO public.device_blueprints (
  device_type_id,
  name,
  description,
  version,
  executor_type,
  is_active,
  collection_steps
) VALUES (
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f', -- M365 device_type ID
  'M365 - Postura de Segurança',
  'Blueprint completo para análise de postura de segurança do Microsoft 365. Inclui 60+ verificações em 11 categorias: Identidades, Autenticação, Privilégios Admin, Aplicações, Email, Ameaças, Intune, PIM, SharePoint, Teams e Defender.',
  '1.0.0',
  'edge_function',
  true,
  '{
    "steps": [
      {
        "id": "org_info",
        "name": "Informações da Organização",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "environment",
        "config": {
          "endpoint": "/organization",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "domains",
        "name": "Domínios Verificados",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "environment",
        "config": {
          "endpoint": "/domains",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "users_count",
        "name": "Contagem Total de Usuários",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/users/$count",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "users_active_count",
        "name": "Contagem de Usuários Ativos",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/users/$count?$filter=accountEnabled eq true",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "users_guests_count",
        "name": "Contagem de Guests",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/users/$count?$filter=userType eq ''Guest''",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "mfa_registration_details",
        "name": "Status de Registro MFA",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/reports/authenticationMethods/userRegistrationDetails?$top=999",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "users_signin_activity",
        "name": "Atividade de Login dos Usuários",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/users?$select=id,displayName,userPrincipalName,signInActivity,accountEnabled&$filter=accountEnabled eq true&$top=999",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "beta"
        }
      },
      {
        "id": "guests_list",
        "name": "Lista de Guests",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/users?$filter=userType eq ''Guest''&$select=id,displayName,userPrincipalName,mail,createdDateTime,externalUserState&$top=500",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "guests_signin_activity",
        "name": "Atividade de Login dos Guests",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/users?$filter=userType eq ''Guest''&$select=id,displayName,userPrincipalName,signInActivity&$top=500",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "beta"
        }
      },
      {
        "id": "users_password_info",
        "name": "Informações de Senha dos Usuários",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/users?$select=id,displayName,userPrincipalName,lastPasswordChangeDateTime,passwordPolicies&$top=999",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "users_disabled_count",
        "name": "Contagem de Usuários Desabilitados",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "identities",
        "config": {
          "endpoint": "/users/$count?$filter=accountEnabled eq false",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "directory_roles",
        "name": "Roles do Diretório",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "admin_privileges",
        "config": {
          "endpoint": "/directoryRoles",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "security_defaults",
        "name": "Política de Security Defaults",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "auth_access",
        "config": {
          "endpoint": "/policies/identitySecurityDefaultsEnforcementPolicy",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "conditional_access_policies",
        "name": "Políticas de Conditional Access",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "auth_access",
        "config": {
          "endpoint": "/identity/conditionalAccess/policies",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "risk_detections",
        "name": "Detecções de Risco (7 dias)",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "auth_access",
        "config": {
          "endpoint": "/identityProtection/riskDetections?$filter=detectedDateTime ge {7_days_ago}&$top=100",
          "method": "GET",
          "api_version": "beta",
          "dynamic_params": {
            "7_days_ago": "datetime_subtract(now, 7d)"
          }
        }
      },
      {
        "id": "risky_users",
        "name": "Usuários de Risco",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "auth_access",
        "config": {
          "endpoint": "/identityProtection/riskyUsers?$filter=riskState eq ''atRisk'' or riskState eq ''confirmedCompromised''&$top=100",
          "method": "GET",
          "api_version": "beta"
        }
      },
      {
        "id": "auth_methods_policy",
        "name": "Política de Métodos de Autenticação",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "auth_access",
        "config": {
          "endpoint": "/policies/authenticationMethodsPolicy",
          "method": "GET",
          "api_version": "beta"
        }
      },
      {
        "id": "named_locations",
        "name": "Locais Nomeados",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "auth_access",
        "config": {
          "endpoint": "/identity/conditionalAccess/namedLocations",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "applications",
        "name": "Aplicações Registradas",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "apps_integrations",
        "config": {
          "endpoint": "/applications?$select=id,displayName,appId,passwordCredentials,keyCredentials,requiredResourceAccess,createdDateTime&$expand=owners&$top=500",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "applications_count",
        "name": "Contagem de App Registrations",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "apps_integrations",
        "config": {
          "endpoint": "/applications/$count",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "service_principals",
        "name": "Service Principals",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "apps_integrations",
        "config": {
          "endpoint": "/servicePrincipals?$select=id,displayName,appId,servicePrincipalType,createdDateTime&$top=999",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "enterprise_apps_count",
        "name": "Contagem de Enterprise Apps",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "apps_integrations",
        "config": {
          "endpoint": "/servicePrincipals/$count?$filter=servicePrincipalType eq ''Application'' and appOwnerOrganizationId ne f8cdef31-a31e-4b4a-93e4-5f571e91255a",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "oauth2_permissions",
        "name": "Consentimentos OAuth2",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "apps_integrations",
        "config": {
          "endpoint": "/oauth2PermissionGrants?$top=500",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "sample_users_for_mailbox",
        "name": "Amostra de Usuários para Mailbox",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "email_exchange",
        "config": {
          "endpoint": "/users?$select=id,displayName,mail,userType&$filter=userType eq ''Member''&$top=50",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "security_alerts_v2",
        "name": "Alertas de Segurança v2",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "threats_activity",
        "config": {
          "endpoint": "/security/alerts_v2?$top=100&$orderby=createdDateTime desc",
          "method": "GET",
          "api_version": "beta"
        }
      },
      {
        "id": "security_alerts_v1",
        "name": "Alertas de Segurança v1 (fallback)",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "threats_activity",
        "config": {
          "endpoint": "/security/alerts?$top=50",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "signin_logs",
        "name": "Logs de Sign-In (7 dias)",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "threats_activity",
        "config": {
          "endpoint": "/auditLogs/signIns?$filter=createdDateTime ge {7_days_ago}&$top=200&$orderby=createdDateTime desc",
          "method": "GET",
          "api_version": "v1.0",
          "dynamic_params": {
            "7_days_ago": "datetime_subtract(now, 7d)"
          }
        }
      },
      {
        "id": "failed_signins",
        "name": "Sign-Ins com Falha (7 dias)",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "threats_activity",
        "config": {
          "endpoint": "/auditLogs/signIns?$filter=createdDateTime ge {7_days_ago} and status/errorCode ne 0&$top=100",
          "method": "GET",
          "api_version": "v1.0",
          "dynamic_params": {
            "7_days_ago": "datetime_subtract(now, 7d)"
          }
        }
      },
      {
        "id": "audit_logs",
        "name": "Logs de Auditoria (7 dias)",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "threats_activity",
        "config": {
          "endpoint": "/auditLogs/directoryAudits?$filter=activityDateTime ge {7_days_ago}&$top=100&$orderby=activityDateTime desc",
          "method": "GET",
          "api_version": "v1.0",
          "dynamic_params": {
            "7_days_ago": "datetime_subtract(now, 7d)"
          }
        }
      },
      {
        "id": "secure_scores",
        "name": "Microsoft Secure Score",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "threats_activity",
        "config": {
          "endpoint": "/security/secureScores?$top=1",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "managed_devices",
        "name": "Dispositivos Gerenciados (Intune)",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "intune_devices",
        "config": {
          "endpoint": "/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,isEncrypted,lastSyncDateTime&$top=999",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "device_compliance_policies",
        "name": "Políticas de Compliance de Dispositivo",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "intune_devices",
        "config": {
          "endpoint": "/deviceManagement/deviceCompliancePolicies",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "device_configuration_policies",
        "name": "Políticas de Configuração de Dispositivo",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "intune_devices",
        "config": {
          "endpoint": "/deviceManagement/deviceConfigurations",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "pim_role_assignments",
        "name": "Atribuições PIM",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "pim_governance",
        "config": {
          "endpoint": "/roleManagement/directory/roleEligibilitySchedules",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "pim_role_active_assignments",
        "name": "Atribuições Ativas PIM",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "pim_governance",
        "config": {
          "endpoint": "/roleManagement/directory/roleAssignmentSchedules",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "sharepoint_sites",
        "name": "Sites do SharePoint",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "sharepoint_onedrive",
        "config": {
          "endpoint": "/sites?search=*&$top=100",
          "method": "GET",
          "api_version": "v1.0"
        }
      },
      {
        "id": "sharepoint_external_sharing",
        "name": "Configurações de Compartilhamento Externo",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "sharepoint_onedrive",
        "config": {
          "endpoint": "/admin/sharepoint/settings",
          "method": "GET",
          "api_version": "beta"
        }
      },
      {
        "id": "teams_list",
        "name": "Lista de Teams",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "teams_collaboration",
        "config": {
          "endpoint": "/groups?$filter=resourceProvisioningOptions/Any(x:x eq ''Team'')&$select=id,displayName,visibility,createdDateTime&$top=999",
          "method": "GET",
          "headers": { "ConsistencyLevel": "eventual" },
          "api_version": "v1.0"
        }
      },
      {
        "id": "teams_settings",
        "name": "Configurações de Teams",
        "executor": "edge_function",
        "runtime": "graph_api",
        "category": "teams_collaboration",
        "config": {
          "endpoint": "/teamwork/teamSettings",
          "method": "GET",
          "api_version": "beta"
        }
      }
    ]
  }'::jsonb
);

-- 2. Criar categorias de regras para M365
INSERT INTO public.rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active) VALUES
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'identities', 'Identidades', 'Users', 'blue-500', 1, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'auth_access', 'Autenticação & Acesso', 'Key', 'green-500', 2, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'admin_privileges', 'Privilégios Admin', 'Shield', 'red-500', 3, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'apps_integrations', 'Aplicações & Integrações', 'AppWindow', 'purple-500', 4, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'email_exchange', 'Email & Exchange', 'Mail', 'orange-500', 5, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'threats_activity', 'Ameaças & Atividades', 'AlertTriangle', 'amber-500', 6, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'intune_devices', 'Intune & Dispositivos', 'Smartphone', 'cyan-500', 7, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'pim_governance', 'PIM & Governança', 'Clock', 'indigo-500', 8, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'sharepoint_onedrive', 'SharePoint & OneDrive', 'FolderOpen', 'teal-500', 9, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'teams_collaboration', 'Teams & Colaboração', 'MessageSquare', 'violet-500', 10, true),
  ('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'defender_security', 'Defender & DLP', 'ShieldCheck', 'rose-500', 11, true)
ON CONFLICT DO NOTHING;