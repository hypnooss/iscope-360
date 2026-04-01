-- Otimizar blueprint M365 Agent com comandos mais eficientes
-- Remove comandos que iteram todas as mailboxes e usa amostragem

UPDATE public.device_blueprints
SET collection_steps = '{
  "steps": [
    {
      "id": "exo_mailbox_forwarding",
      "type": "powershell",
      "category": "Exchange - Mailbox",
      "params": {
        "module": "ExchangeOnline",
        "timeout": 120,
        "commands": [
          {
            "name": "exo_mailbox_forwarding",
            "command": "Get-Mailbox -ResultSize 500 | Where-Object { $_.ForwardingAddress -or $_.ForwardingSmtpAddress } | Select-Object DisplayName, PrimarySmtpAddress, ForwardingAddress, ForwardingSmtpAddress, DeliverToMailboxAndForward"
          }
        ]
      }
    },
    {
      "id": "exo_transport_rules",
      "type": "powershell",
      "category": "Exchange - Policies",
      "params": {
        "module": "ExchangeOnline",
        "timeout": 60,
        "commands": [
          {
            "name": "exo_transport_rules",
            "command": "Get-TransportRule | Where-Object { $_.State -eq ''Enabled'' -and ($_.RedirectMessageTo -or $_.CopyTo -or $_.BlindCopyTo -or $_.DeleteMessage) } | Select-Object Name, Priority, State, RedirectMessageTo, CopyTo, BlindCopyTo, DeleteMessage, SentTo, SentToMemberOf"
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
        "timeout": 30,
        "commands": [
          {
            "name": "exo_anti_phish_policy",
            "command": "Get-AntiPhishPolicy | Select-Object Name, Enabled, EnableMailboxIntelligence, EnableMailboxIntelligenceProtection, EnableSpoofIntelligence, EnableFirstContactSafetyTips, AuthenticationFailAction"
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
        "timeout": 30,
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
        "timeout": 30,
        "commands": [
          {
            "name": "exo_hosted_content_filter",
            "command": "Get-HostedContentFilterPolicy | Select-Object Name, BulkThreshold, HighConfidenceSpamAction, SpamAction, PhishSpamAction, EnableEndUserSpamNotifications"
          }
        ]
      }
    },
    {
      "id": "exo_safe_links_policy",
      "type": "powershell",
      "category": "Exchange - Defender",
      "params": {
        "module": "ExchangeOnline",
        "timeout": 30,
        "commands": [
          {
            "name": "exo_safe_links_policy",
            "command": "Get-SafeLinksPolicy -ErrorAction SilentlyContinue | Select-Object Name, EnableSafeLinksForEmail, EnableSafeLinksForTeams, TrackClicks, AllowClickThrough, ScanUrls, EnableForInternalSenders"
          }
        ]
      }
    },
    {
      "id": "exo_safe_attachment_policy",
      "type": "powershell",
      "category": "Exchange - Defender",
      "params": {
        "module": "ExchangeOnline",
        "timeout": 30,
        "commands": [
          {
            "name": "exo_safe_attachment_policy",
            "command": "Get-SafeAttachmentPolicy -ErrorAction SilentlyContinue | Select-Object Name, Enable, Action, Redirect, RedirectAddress, ActionOnError"
          }
        ]
      }
    },
    {
      "id": "exo_dkim_config",
      "type": "powershell",
      "category": "Exchange - Email Auth",
      "params": {
        "module": "ExchangeOnline",
        "timeout": 30,
        "commands": [
          {
            "name": "exo_dkim_config",
            "command": "Get-DkimSigningConfig | Select-Object Domain, Enabled, Status, LastChecked"
          }
        ]
      }
    },
    {
      "id": "exo_remote_domains",
      "type": "powershell",
      "category": "Exchange - Mail Flow",
      "params": {
        "module": "ExchangeOnline",
        "timeout": 30,
        "commands": [
          {
            "name": "exo_remote_domains",
            "command": "Get-RemoteDomain | Select-Object DomainName, AllowedOOFType, AutoForwardEnabled, AutoReplyEnabled, DeliveryReportEnabled"
          }
        ]
      }
    },
    {
      "id": "exo_owa_mailbox_policy",
      "type": "powershell",
      "category": "Exchange - Access",
      "params": {
        "module": "ExchangeOnline",
        "timeout": 30,
        "commands": [
          {
            "name": "exo_owa_mailbox_policy",
            "command": "Get-OwaMailboxPolicy | Select-Object Name, DirectFileAccessOnPublicComputersEnabled, DirectFileAccessOnPrivateComputersEnabled, WacViewingOnPublicComputersEnabled"
          }
        ]
      }
    }
  ]
}'::jsonb,
updated_at = NOW()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';