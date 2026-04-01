-- Corrigir o formato do blueprint M365 - Exchange & SharePoint (Agent)
-- O formato atual usa strings em 'commands', mas o PowerShellExecutor espera objetos com 'name' e 'command'

UPDATE public.device_blueprints
SET collection_steps = '{
  "steps": [
    {
      "id": "exo_mailbox_forwarding",
      "type": "powershell",
      "category": "Exchange - Mailbox",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_mailbox_forwarding",
            "command": "Get-Mailbox -ResultSize Unlimited | Where-Object { $_.ForwardingAddress -or $_.ForwardingSmtpAddress } | Select-Object DisplayName, PrimarySmtpAddress, ForwardingAddress, ForwardingSmtpAddress, DeliverToMailboxAndForward"
          }
        ]
      }
    },
    {
      "id": "exo_mailbox_permissions",
      "type": "powershell",
      "category": "Exchange - Mailbox",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_mailbox_permissions",
            "command": "Get-Mailbox -ResultSize Unlimited | Get-MailboxPermission | Where-Object { $_.User -ne \"NT AUTHORITY\\SELF\" -and $_.IsInherited -eq $false } | Select-Object Identity, User, AccessRights"
          }
        ]
      }
    },
    {
      "id": "exo_inbox_rules",
      "type": "powershell",
      "category": "Exchange - Mailbox",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_inbox_rules",
            "command": "Get-Mailbox -ResultSize Unlimited | ForEach-Object { Get-InboxRule -Mailbox $_.PrimarySmtpAddress -ErrorAction SilentlyContinue | Where-Object { $_.ForwardTo -or $_.ForwardAsAttachmentTo -or $_.RedirectTo } | Select-Object MailboxOwnerId, Name, ForwardTo, ForwardAsAttachmentTo, RedirectTo, Enabled }"
          }
        ]
      }
    },
    {
      "id": "exo_transport_rules",
      "type": "powershell",
      "category": "Exchange - Transport",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_transport_rules",
            "command": "Get-TransportRule | Select-Object Name, State, Priority, FromScope, SentToScope, BlindCopyTo, RedirectMessageTo"
          }
        ]
      }
    },
    {
      "id": "exo_remote_domains",
      "type": "powershell",
      "category": "Exchange - Transport",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_remote_domains",
            "command": "Get-RemoteDomain | Select-Object DomainName, AutoForwardEnabled, AutoReplyEnabled, DeliveryReportEnabled, NDREnabled, TNEFEnabled"
          }
        ]
      }
    },
    {
      "id": "exo_accepted_domains",
      "type": "powershell",
      "category": "Exchange - Transport",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_accepted_domains",
            "command": "Get-AcceptedDomain | Select-Object DomainName, DomainType, Default, AuthenticationType"
          }
        ]
      }
    },
    {
      "id": "exo_connectors_inbound",
      "type": "powershell",
      "category": "Exchange - Connectors",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_connectors_inbound",
            "command": "Get-InboundConnector | Select-Object Name, Enabled, ConnectorType, SenderDomains, RequireTls, RestrictDomainsToCertificate"
          }
        ]
      }
    },
    {
      "id": "exo_connectors_outbound",
      "type": "powershell",
      "category": "Exchange - Connectors",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_connectors_outbound",
            "command": "Get-OutboundConnector | Select-Object Name, Enabled, ConnectorType, RecipientDomains, TlsSettings, UseMXRecord, SmartHosts"
          }
        ]
      }
    },
    {
      "id": "exo_anti_phish_policy",
      "type": "powershell",
      "category": "Exchange - Security",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_anti_phish_policy",
            "command": "Get-AntiPhishPolicy | Select-Object Name, Enabled, EnableMailboxIntelligence, EnableMailboxIntelligenceProtection, EnableSpoofIntelligence, EnableFirstContactSafetyTips"
          }
        ]
      }
    },
    {
      "id": "exo_malware_filter_policy",
      "type": "powershell",
      "category": "Exchange - Security",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_malware_filter_policy",
            "command": "Get-MalwareFilterPolicy | Select-Object Name, EnableFileFilter, FileTypeAction, ZapEnabled, EnableInternalSenderAdminNotifications"
          }
        ]
      }
    },
    {
      "id": "exo_hosted_content_filter",
      "type": "powershell",
      "category": "Exchange - Security",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_hosted_content_filter",
            "command": "Get-HostedContentFilterPolicy | Select-Object Name, HighConfidenceSpamAction, SpamAction, BulkSpamAction, PhishSpamAction, EnableEndUserSpamNotifications"
          }
        ]
      }
    },
    {
      "id": "exo_dkim_config",
      "type": "powershell",
      "category": "Exchange - Authentication",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_dkim_config",
            "command": "Get-DkimSigningConfig | Select-Object Domain, Enabled, Status, Selector1CNAME, Selector2CNAME"
          }
        ]
      }
    },
    {
      "id": "exo_org_config",
      "type": "powershell",
      "category": "Exchange - Organization",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_org_config",
            "command": "Get-OrganizationConfig | Select-Object Name, DefaultAuthenticationPolicy, OAuth2ClientProfileEnabled, SmtpActionableMessagesEnabled, MailTipsAllTipsEnabled, AuditDisabled"
          }
        ]
      }
    },
    {
      "id": "exo_sharing_policy",
      "type": "powershell",
      "category": "Exchange - Sharing",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_sharing_policy",
            "command": "Get-SharingPolicy | Select-Object Name, Enabled, Default, Domains"
          }
        ]
      }
    },
    {
      "id": "exo_owa_mailbox_policy",
      "type": "powershell",
      "category": "Exchange - OWA",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_owa_mailbox_policy",
            "command": "Get-OwaMailboxPolicy | Select-Object Name, WacViewingOnPublicComputersEnabled, WacViewingOnPrivateComputersEnabled, DirectFileAccessOnPublicComputersEnabled, DirectFileAccessOnPrivateComputersEnabled"
          }
        ]
      }
    },
    {
      "id": "exo_admin_audit_log",
      "type": "powershell",
      "category": "Exchange - Audit",
      "params": {
        "module": "ExchangeOnline",
        "commands": [
          {
            "name": "exo_admin_audit_log",
            "command": "Get-AdminAuditLogConfig | Select-Object UnifiedAuditLogIngestionEnabled, AdminAuditLogEnabled, AdminAuditLogCmdlets, AdminAuditLogParameters"
          }
        ]
      }
    }
  ]
}'::jsonb,
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';