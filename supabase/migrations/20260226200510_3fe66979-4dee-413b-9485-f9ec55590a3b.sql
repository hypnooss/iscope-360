-- Update M365 Exchange Online blueprint with new operational data collection steps
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || '[
    {
      "id": "exo_mailbox_statistics",
      "type": "powershell",
      "category": "Exchange - Mailbox",
      "optional": true,
      "params": {
        "module": "ExchangeOnline",
        "timeout": 180,
        "commands": [{
          "name": "exo_mailbox_statistics",
          "command": "Get-EXOMailboxStatistics -ResultSize 500 | Select-Object DisplayName, ItemCount, TotalItemSize, LastLogonTime, MailboxTypeDetail | ConvertTo-Json -Depth 5"
        }]
      }
    },
    {
      "id": "exo_mailbox_quota",
      "type": "powershell",
      "category": "Exchange - Mailbox",
      "optional": true,
      "params": {
        "module": "ExchangeOnline",
        "timeout": 180,
        "commands": [{
          "name": "exo_mailbox_quota",
          "command": "Get-Mailbox -ResultSize 500 | Select-Object DisplayName, PrimarySmtpAddress, ProhibitSendQuota, ProhibitSendReceiveQuota, IssueWarningQuota, UseDatabaseQuotaDefaults | ConvertTo-Json -Depth 5"
        }]
      }
    },
    {
      "id": "exo_message_trace",
      "type": "powershell",
      "category": "Exchange - Mail Flow",
      "optional": true,
      "params": {
        "module": "ExchangeOnline",
        "timeout": 300,
        "commands": [{
          "name": "exo_message_trace",
          "command": "Get-MessageTrace -StartDate (Get-Date).AddHours(-24) -EndDate (Get-Date) -PageSize 5000 | Select-Object Received, SenderAddress, RecipientAddress, Subject, Status, Size, MessageTraceId | ConvertTo-Json -Depth 5"
        }]
      }
    },
    {
      "id": "exo_inbox_rules",
      "type": "powershell",
      "category": "Exchange - Mailbox",
      "optional": true,
      "params": {
        "module": "ExchangeOnline",
        "timeout": 300,
        "commands": [{
          "name": "exo_inbox_rules",
          "command": "Get-Mailbox -ResultSize 200 | ForEach-Object { $mbx = $_.PrimarySmtpAddress; Get-InboxRule -Mailbox $mbx -ErrorAction SilentlyContinue | Select-Object @{N=''MailboxOwner'';E={$mbx}}, Name, Enabled, ForwardTo, ForwardAsAttachmentTo, RedirectTo, DeleteMessage, MoveToFolder } | Where-Object { $_ -ne $null } | ConvertTo-Json -Depth 5"
        }]
      }
    },
    {
      "id": "exo_auth_policy",
      "type": "powershell",
      "category": "Exchange - Security",
      "optional": true,
      "params": {
        "module": "ExchangeOnline",
        "timeout": 30,
        "commands": [{
          "name": "exo_auth_policy",
          "command": "Get-AuthenticationPolicy -ErrorAction SilentlyContinue | Select-Object Name, AllowBasicAuthSmtp, AllowBasicAuthImap, AllowBasicAuthPop, AllowBasicAuthActiveSync, AllowBasicAuthMapi | ConvertTo-Json -Depth 5"
        }]
      }
    }
  ]'::jsonb
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';
