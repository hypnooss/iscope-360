
-- =============================================
-- Segmentar blueprints M365 por produto
-- =============================================

-- 1. Atualizar "M365 - Postura de Segurança" -> "M365 - Entra ID" (25 steps)
UPDATE device_blueprints 
SET name = 'M365 - Entra ID',
    description = 'Coleta de dados do Entra ID via Graph API: identidades, autenticação, privilégios, aplicações, PIM e ambiente.',
    executor_type = 'edge_function',
    version = '2.0.0',
    updated_at = now(),
    collection_steps = '{
      "steps": [
        {"id":"org_info","name":"Informações da Organização","executor":"edge_function","runtime":"graph_api","category":"environment","config":{"endpoint":"/organization","method":"GET","api_version":"v1.0"}},
        {"id":"domains","name":"Domínios Verificados","executor":"edge_function","runtime":"graph_api","category":"environment","config":{"endpoint":"/domains","method":"GET","api_version":"v1.0"}},
        {"id":"users_count","name":"Contagem Total de Usuários","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/users/$count","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"users_active_count","name":"Contagem de Usuários Ativos","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/users/$count?$filter=accountEnabled eq true","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"users_guests_count","name":"Contagem de Guests","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/users/$count?$filter=userType eq ''Guest''","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"mfa_registration_details","name":"Status de Registro MFA","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/reports/authenticationMethods/userRegistrationDetails?$top=999","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"users_signin_activity","name":"Atividade de Login dos Usuários","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/users?$select=id,displayName,userPrincipalName,signInActivity,accountEnabled&$filter=accountEnabled eq true&$top=999","method":"GET","api_version":"beta","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"guests_list","name":"Lista de Guests","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/users?$filter=userType eq ''Guest''&$select=id,displayName,userPrincipalName,mail,createdDateTime,externalUserState&$top=500","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"guests_signin_activity","name":"Atividade de Login dos Guests","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/users?$filter=userType eq ''Guest''&$select=id,displayName,userPrincipalName,signInActivity&$top=500","method":"GET","api_version":"beta","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"users_password_info","name":"Informações de Senha dos Usuários","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/users?$select=id,displayName,userPrincipalName,lastPasswordChangeDateTime,passwordPolicies&$top=999","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"users_disabled_count","name":"Contagem de Usuários Desabilitados","executor":"edge_function","runtime":"graph_api","category":"identities","config":{"endpoint":"/users/$count?$filter=accountEnabled eq false","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"directory_roles","name":"Roles do Diretório","executor":"edge_function","runtime":"graph_api","category":"admin_privileges","config":{"endpoint":"/directoryRoles","method":"GET","api_version":"v1.0"}},
        {"id":"security_defaults","name":"Política de Security Defaults","executor":"edge_function","runtime":"graph_api","category":"auth_access","config":{"endpoint":"/policies/identitySecurityDefaultsEnforcementPolicy","method":"GET","api_version":"v1.0"}},
        {"id":"conditional_access_policies","name":"Políticas de Conditional Access","executor":"edge_function","runtime":"graph_api","category":"auth_access","config":{"endpoint":"/identity/conditionalAccess/policies","method":"GET","api_version":"v1.0"}},
        {"id":"risk_detections","name":"Detecções de Risco (7 dias)","executor":"edge_function","runtime":"graph_api","category":"auth_access","config":{"endpoint":"/identityProtection/riskDetections?$filter=detectedDateTime ge {7_days_ago}&$top=100","method":"GET","api_version":"beta","dynamic_params":{"7_days_ago":"datetime_subtract(now, 7d)"}}},
        {"id":"risky_users","name":"Usuários de Risco","executor":"edge_function","runtime":"graph_api","category":"auth_access","config":{"endpoint":"/identityProtection/riskyUsers?$filter=riskState eq ''atRisk'' or riskState eq ''confirmedCompromised''&$top=100","method":"GET","api_version":"beta"}},
        {"id":"auth_methods_policy","name":"Política de Métodos de Autenticação","executor":"edge_function","runtime":"graph_api","category":"auth_access","config":{"endpoint":"/policies/authenticationMethodsPolicy","method":"GET","api_version":"beta"}},
        {"id":"named_locations","name":"Locais Nomeados","executor":"edge_function","runtime":"graph_api","category":"auth_access","config":{"endpoint":"/identity/conditionalAccess/namedLocations","method":"GET","api_version":"v1.0"}},
        {"id":"applications","name":"Aplicações Registradas","executor":"edge_function","runtime":"graph_api","category":"apps_integrations","config":{"endpoint":"/applications?$select=id,displayName,appId,passwordCredentials,keyCredentials,requiredResourceAccess,createdDateTime&$expand=owners&$top=500","method":"GET","api_version":"v1.0"}},
        {"id":"applications_count","name":"Contagem de App Registrations","executor":"edge_function","runtime":"graph_api","category":"apps_integrations","config":{"endpoint":"/applications/$count","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"service_principals","name":"Service Principals","executor":"edge_function","runtime":"graph_api","category":"apps_integrations","config":{"endpoint":"/servicePrincipals?$select=id,displayName,appId,servicePrincipalType,createdDateTime&$top=999","method":"GET","api_version":"v1.0"}},
        {"id":"enterprise_apps_count","name":"Contagem de Enterprise Apps","executor":"edge_function","runtime":"graph_api","category":"apps_integrations","config":{"endpoint":"/servicePrincipals/$count?$filter=servicePrincipalType eq ''Application'' and appOwnerOrganizationId ne f8cdef31-a31e-4b4a-93e4-5f571e91255a","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
        {"id":"oauth2_permissions","name":"Consentimentos OAuth2","executor":"edge_function","runtime":"graph_api","category":"apps_integrations","config":{"endpoint":"/oauth2PermissionGrants?$top=500","method":"GET","api_version":"v1.0"}},
        {"id":"pim_role_assignments","name":"Atribuições PIM","executor":"edge_function","runtime":"graph_api","category":"pim_governance","config":{"endpoint":"/roleManagement/directory/roleEligibilitySchedules","method":"GET","api_version":"v1.0"}},
        {"id":"pim_role_active_assignments","name":"Atribuições Ativas PIM","executor":"edge_function","runtime":"graph_api","category":"pim_governance","config":{"endpoint":"/roleManagement/directory/roleAssignmentSchedules","method":"GET","api_version":"v1.0"}}
      ]
    }'::jsonb
WHERE id = '164ad4d2-35c6-46cd-9c70-bcd27b044b73';

-- 2. Atualizar "M365 - Exchange & SharePoint (Agent)" -> "M365 - Exchange Online" (hybrid)
-- Adicionar step Graph API sample_users_for_mailbox aos steps PowerShell existentes
UPDATE device_blueprints 
SET name = 'M365 - Exchange Online',
    description = 'Coleta híbrida do Exchange Online: PowerShell via Agent (CBA) + Graph API para amostragem de mailboxes.',
    executor_type = 'hybrid',
    version = '2.0.0',
    updated_at = now(),
    collection_steps = '{
      "steps": [
        {"id":"sample_users_for_mailbox","name":"Amostra de Usuários para Mailbox","executor":"edge_function","runtime":"graph_api","category":"email_exchange","config":{"endpoint":"/users?$select=id,displayName,mail,userType&$filter=userType eq ''Member''&$top=50","method":"GET","api_version":"v1.0"}},
        {"id":"exo_mailbox_forwarding","type":"powershell","category":"Exchange - Mailbox","params":{"module":"ExchangeOnline","timeout":120,"commands":[{"name":"exo_mailbox_forwarding","command":"Get-Mailbox -ResultSize 500 | Where-Object { $_.ForwardingAddress -or $_.ForwardingSmtpAddress } | Select-Object DisplayName, PrimarySmtpAddress, ForwardingAddress, ForwardingSmtpAddress, DeliverToMailboxAndForward"}]}},
        {"id":"exo_transport_rules","type":"powershell","category":"Exchange - Policies","params":{"module":"ExchangeOnline","timeout":60,"commands":[{"name":"exo_transport_rules","command":"Get-TransportRule | Where-Object { $_.State -eq ''Enabled'' -and ($_.RedirectMessageTo -or $_.CopyTo -or $_.BlindCopyTo -or $_.DeleteMessage) } | Select-Object Name, Priority, State, RedirectMessageTo, CopyTo, BlindCopyTo, DeleteMessage, SentTo, SentToMemberOf"}]}},
        {"id":"exo_anti_phish_policy","type":"powershell","category":"Exchange - Security","params":{"module":"ExchangeOnline","timeout":30,"commands":[{"name":"exo_anti_phish_policy","command":"Get-AntiPhishPolicy | Select-Object Name, Enabled, EnableMailboxIntelligence, EnableMailboxIntelligenceProtection, EnableSpoofIntelligence, EnableFirstContactSafetyTips, AuthenticationFailAction"}]}},
        {"id":"exo_malware_filter_policy","type":"powershell","category":"Exchange - Security","params":{"module":"ExchangeOnline","timeout":30,"commands":[{"name":"exo_malware_filter_policy","command":"Get-MalwareFilterPolicy | Select-Object Name, EnableFileFilter, FileTypeAction, ZapEnabled, EnableInternalSenderAdminNotifications"}]}},
        {"id":"exo_hosted_content_filter","type":"powershell","category":"Exchange - Security","params":{"module":"ExchangeOnline","timeout":30,"commands":[{"name":"exo_hosted_content_filter","command":"Get-HostedContentFilterPolicy | Select-Object Name, BulkThreshold, HighConfidenceSpamAction, SpamAction, PhishSpamAction, EnableEndUserSpamNotifications"}]}},
        {"id":"exo_safe_links_policy","type":"powershell","category":"Exchange - Defender","params":{"module":"ExchangeOnline","timeout":30,"commands":[{"name":"exo_safe_links_policy","command":"Get-SafeLinksPolicy -ErrorAction SilentlyContinue | Select-Object Name, EnableSafeLinksForEmail, EnableSafeLinksForTeams, TrackClicks, AllowClickThrough, ScanUrls, EnableForInternalSenders"}]}},
        {"id":"exo_safe_attachment_policy","type":"powershell","category":"Exchange - Defender","params":{"module":"ExchangeOnline","timeout":30,"commands":[{"name":"exo_safe_attachment_policy","command":"Get-SafeAttachmentPolicy -ErrorAction SilentlyContinue | Select-Object Name, Enable, Action, Redirect, RedirectAddress, ActionOnError"}]}},
        {"id":"exo_dkim_config","type":"powershell","category":"Exchange - Email Auth","params":{"module":"ExchangeOnline","timeout":30,"commands":[{"name":"exo_dkim_config","command":"Get-DkimSigningConfig | Select-Object Domain, Enabled, Status, LastChecked"}]}},
        {"id":"exo_remote_domains","type":"powershell","category":"Exchange - Mail Flow","params":{"module":"ExchangeOnline","timeout":30,"commands":[{"name":"exo_remote_domains","command":"Get-RemoteDomain | Select-Object DomainName, AllowedOOFType, AutoForwardEnabled, AutoReplyEnabled, DeliveryReportEnabled"}]}},
        {"id":"exo_owa_mailbox_policy","type":"powershell","category":"Exchange - Access","params":{"module":"ExchangeOnline","timeout":30,"commands":[{"name":"exo_owa_mailbox_policy","command":"Get-OwaMailboxPolicy | Select-Object Name, DirectFileAccessOnPublicComputersEnabled, DirectFileAccessOnPrivateComputersEnabled, WacViewingOnPublicComputersEnabled"}]}}
      ]
    }'::jsonb
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';

-- 3. Criar "M365 - SharePoint & OneDrive" (edge_function)
INSERT INTO device_blueprints (device_type_id, name, description, executor_type, version, is_active, collection_steps)
VALUES (
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  'M365 - SharePoint & OneDrive',
  'Coleta de dados do SharePoint e OneDrive via Graph API: sites e configurações de compartilhamento.',
  'edge_function',
  '2.0.0',
  true,
  '{
    "steps": [
      {"id":"sharepoint_sites","name":"Sites do SharePoint","executor":"edge_function","runtime":"graph_api","category":"sharepoint_onedrive","config":{"endpoint":"/sites?search=*&$top=100","method":"GET","api_version":"v1.0"}},
      {"id":"sharepoint_external_sharing","name":"Configurações de Compartilhamento Externo","executor":"edge_function","runtime":"graph_api","category":"sharepoint_onedrive","config":{"endpoint":"/admin/sharepoint/settings","method":"GET","api_version":"beta"}}
    ]
  }'::jsonb
);

-- 4. Criar "M365 - Teams" (edge_function)
INSERT INTO device_blueprints (device_type_id, name, description, executor_type, version, is_active, collection_steps)
VALUES (
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  'M365 - Teams',
  'Coleta de dados do Microsoft Teams via Graph API: lista de teams e configurações de colaboração.',
  'edge_function',
  '2.0.0',
  true,
  '{
    "steps": [
      {"id":"teams_list","name":"Lista de Teams","executor":"edge_function","runtime":"graph_api","category":"teams_collaboration","config":{"endpoint":"/groups?$filter=resourceProvisioningOptions/Any(x:x eq ''Team'')&$select=id,displayName,visibility,createdDateTime&$top=999","method":"GET","api_version":"v1.0","headers":{"ConsistencyLevel":"eventual"}}},
      {"id":"teams_settings","name":"Configurações de Teams","executor":"edge_function","runtime":"graph_api","category":"teams_collaboration","config":{"endpoint":"/teamwork/teamSettings","method":"GET","api_version":"beta"}}
    ]
  }'::jsonb
);

-- 5. Criar "M365 - Intune & Defender" (edge_function)
INSERT INTO device_blueprints (device_type_id, name, description, executor_type, version, is_active, collection_steps)
VALUES (
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  'M365 - Intune & Defender',
  'Coleta de dados do Intune e Microsoft Defender via Graph API: dispositivos, compliance, alertas e secure score.',
  'edge_function',
  '2.0.0',
  true,
  '{
    "steps": [
      {"id":"managed_devices","name":"Dispositivos Gerenciados (Intune)","executor":"edge_function","runtime":"graph_api","category":"intune_devices","config":{"endpoint":"/deviceManagement/managedDevices?$select=id,deviceName,operatingSystem,osVersion,complianceState,isEncrypted,lastSyncDateTime&$top=999","method":"GET","api_version":"v1.0"}},
      {"id":"device_compliance_policies","name":"Políticas de Compliance de Dispositivo","executor":"edge_function","runtime":"graph_api","category":"intune_devices","config":{"endpoint":"/deviceManagement/deviceCompliancePolicies","method":"GET","api_version":"v1.0"}},
      {"id":"device_configuration_policies","name":"Políticas de Configuração de Dispositivo","executor":"edge_function","runtime":"graph_api","category":"intune_devices","config":{"endpoint":"/deviceManagement/deviceConfigurations","method":"GET","api_version":"v1.0"}},
      {"id":"security_alerts_v2","name":"Alertas de Segurança v2","executor":"edge_function","runtime":"graph_api","category":"threats_activity","config":{"endpoint":"/security/alerts_v2?$top=100&$orderby=createdDateTime desc","method":"GET","api_version":"beta"}},
      {"id":"security_alerts_v1","name":"Alertas de Segurança v1 (fallback)","executor":"edge_function","runtime":"graph_api","category":"threats_activity","config":{"endpoint":"/security/alerts?$top=50","method":"GET","api_version":"v1.0"}},
      {"id":"signin_logs","name":"Logs de Sign-In (7 dias)","executor":"edge_function","runtime":"graph_api","category":"threats_activity","config":{"endpoint":"/auditLogs/signIns?$filter=createdDateTime ge {7_days_ago}&$top=200&$orderby=createdDateTime desc","method":"GET","api_version":"v1.0","dynamic_params":{"7_days_ago":"datetime_subtract(now, 7d)"}}},
      {"id":"failed_signins","name":"Sign-Ins com Falha (7 dias)","executor":"edge_function","runtime":"graph_api","category":"threats_activity","config":{"endpoint":"/auditLogs/signIns?$filter=createdDateTime ge {7_days_ago} and status/errorCode ne 0&$top=100","method":"GET","api_version":"v1.0","dynamic_params":{"7_days_ago":"datetime_subtract(now, 7d)"}}},
      {"id":"audit_logs","name":"Logs de Auditoria (7 dias)","executor":"edge_function","runtime":"graph_api","category":"threats_activity","config":{"endpoint":"/auditLogs/directoryAudits?$filter=activityDateTime ge {7_days_ago}&$top=100&$orderby=activityDateTime desc","method":"GET","api_version":"v1.0","dynamic_params":{"7_days_ago":"datetime_subtract(now, 7d)"}}},
      {"id":"secure_scores","name":"Microsoft Secure Score","executor":"edge_function","runtime":"graph_api","category":"threats_activity","config":{"endpoint":"/security/secureScores?$top=1","method":"GET","api_version":"v1.0"}}
    ]
  }'::jsonb
);
