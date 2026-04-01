-- Insert M365 Exchange & SharePoint Agent Blueprint
INSERT INTO device_blueprints (
  device_type_id,
  name,
  description,
  executor_type,
  version,
  is_active,
  collection_steps
) VALUES (
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  'M365 - Exchange & SharePoint (Agent)',
  'Coleta de configurações do Exchange Online e SharePoint Online via PowerShell/CBA',
  'agent',
  '1.0.0',
  true,
  '{
    "steps": [
      {
        "id": "exo_mailbox_forwarding",
        "type": "powershell",
        "category": "Exchange - Mailbox",
        "description": "Encaminhamentos de e-mail configurados",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-Mailbox -ResultSize Unlimited | Where-Object { $_.ForwardingAddress -or $_.ForwardingSmtpAddress } | Select-Object DisplayName, PrimarySmtpAddress, ForwardingAddress, ForwardingSmtpAddress, DeliverToMailboxAndForward | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_inbox_rules",
        "type": "powershell",
        "category": "Exchange - Mailbox",
        "description": "Regras de inbox com redirecionamento ou encaminhamento",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-Mailbox -ResultSize 100 | ForEach-Object { Get-InboxRule -Mailbox $_.PrimarySmtpAddress -IncludeHidden -ErrorAction SilentlyContinue | Where-Object { $_.ForwardTo -or $_.ForwardAsAttachmentTo -or $_.RedirectTo } | Select-Object MailboxOwnerId, Name, Enabled, ForwardTo, ForwardAsAttachmentTo, RedirectTo } | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_cas_mailbox",
        "type": "powershell",
        "category": "Exchange - Mailbox",
        "description": "Protocolos habilitados por mailbox (IMAP, POP, EWS, etc.)",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-CASMailbox -ResultSize Unlimited | Select-Object Identity, PrimarySmtpAddress, ImapEnabled, PopEnabled, ActiveSyncEnabled, OWAEnabled, EwsEnabled, MAPIEnabled | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_transport_rules",
        "type": "powershell",
        "category": "Exchange - Transporte",
        "description": "Regras de fluxo de e-mail (Transport Rules)",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-TransportRule | Select-Object Name, State, Priority, FromScope, SentToScope, RedirectMessageTo, BlindCopyTo, DeleteMessage, Quarantine | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_connectors_inbound",
        "type": "powershell",
        "category": "Exchange - Transporte",
        "description": "Conectores de entrada",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-InboundConnector | Select-Object Name, Enabled, ConnectorType, SenderDomains, RequireTls, RestrictDomainsToCertificate | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_connectors_outbound",
        "type": "powershell",
        "category": "Exchange - Transporte",
        "description": "Conectores de saída",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-OutboundConnector | Select-Object Name, Enabled, ConnectorType, RecipientDomains, SmartHosts, TlsSettings, UseMXRecord | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_remote_domains",
        "type": "powershell",
        "category": "Exchange - Transporte",
        "description": "Configurações de domínios remotos",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-RemoteDomain | Select-Object DomainName, IsInternal, AllowedOOFType, AutoForwardEnabled, AutoReplyEnabled, DeliveryReportEnabled, NDREnabled | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_antispam_policy",
        "type": "powershell",
        "category": "Exchange - Segurança",
        "description": "Políticas anti-spam",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-HostedContentFilterPolicy | Select-Object Name, IsDefault, SpamAction, HighConfidenceSpamAction, PhishSpamAction, BulkSpamAction, BulkThreshold, QuarantineRetentionPeriod | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_antimalware_policy",
        "type": "powershell",
        "category": "Exchange - Segurança",
        "description": "Políticas anti-malware",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-MalwareFilterPolicy | Select-Object Name, IsDefault, Action, EnableFileFilter, FileTypes, ZapEnabled, QuarantineTag | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_dkim",
        "type": "powershell",
        "category": "Exchange - Segurança",
        "description": "Configuração DKIM por domínio",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-DkimSigningConfig | Select-Object Domain, Enabled, Status, Selector1CNAME, Selector2CNAME | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_audit_config",
        "type": "powershell",
        "category": "Exchange - Auditoria",
        "description": "Configuração de log de auditoria de admin",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-AdminAuditLogConfig | Select-Object UnifiedAuditLogIngestionEnabled, AdminAuditLogEnabled, AdminAuditLogCmdlets, AdminAuditLogParameters | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_org_config",
        "type": "powershell",
        "category": "Exchange - Organização",
        "description": "Configurações gerais da organização Exchange",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-OrganizationConfig | Select-Object Name, DefaultGroupAccessType, MailTipsAllTipsEnabled, MailTipsExternalRecipientsTipsEnabled, OAuth2ClientProfileEnabled | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "exo_owa_policy",
        "type": "powershell",
        "category": "Exchange - Organização",
        "description": "Políticas do Outlook Web App",
        "params": {
          "module": "ExchangeOnline",
          "commands": ["Get-OwaMailboxPolicy | Select-Object Name, IsDefault, DirectFileAccessOnPublicComputersEnabled, DirectFileAccessOnPrivateComputersEnabled, WacEditingEnabled | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "spo_tenant_settings",
        "type": "powershell",
        "category": "SharePoint - Tenant",
        "description": "Configurações globais do tenant SharePoint",
        "params": {
          "module": "PnP.PowerShell",
          "commands": ["Get-PnPTenant | Select-Object SharingCapability, DefaultSharingLinkType, DefaultLinkPermission, RequireAcceptingAccountMatchInvitedAccount, ExternalUserExpirationRequired, ExternalUserExpireInDays, ConditionalAccessPolicy, LegacyAuthProtocolsEnabled, DisableCustomAppAuthentication | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "spo_sites",
        "type": "powershell",
        "category": "SharePoint - Sites",
        "description": "Inventário de sites SharePoint",
        "params": {
          "module": "PnP.PowerShell",
          "commands": ["Get-PnPTenantSite -Detailed | Select-Object Url, Title, Template, SharingCapability, ConditionalAccessPolicy, LockState, StorageUsageCurrent, LastContentModifiedDate | ConvertTo-Json -Depth 5 -Compress"]
        }
      },
      {
        "id": "spo_sharing_settings",
        "type": "powershell",
        "category": "SharePoint - Compartilhamento",
        "description": "Configurações de compartilhamento externo",
        "params": {
          "module": "PnP.PowerShell",
          "commands": ["Get-PnPTenant | Select-Object SharingCapability, SharingDomainRestrictionMode, SharingAllowedDomainList, SharingBlockedDomainList, ShowEveryoneClaim, ShowEveryoneExceptExternalUsersClaim | ConvertTo-Json -Depth 5 -Compress"]
        }
      }
    ]
  }'::jsonb
);