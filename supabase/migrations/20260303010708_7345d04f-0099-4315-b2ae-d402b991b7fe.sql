UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'exo_inbox_rules' 
        THEN jsonb_set(
          step,
          '{params,commands}',
          '[{"name": "exo_inbox_rules", "command": "Get-Mailbox -ResultSize 200 | ForEach-Object { $mbx = $_.PrimarySmtpAddress; Get-InboxRule -Mailbox $mbx -ErrorAction SilentlyContinue -WarningAction SilentlyContinue | Select-Object @{N=''MailboxOwner'';E={$mbx}}, Name, Enabled, ForwardTo, ForwardAsAttachmentTo, RedirectTo, DeleteMessage, MoveToFolder, InError } | Where-Object { $_ -ne $null } | ConvertTo-Json -Depth 5"}]'::jsonb
        )
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';
