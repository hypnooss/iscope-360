
-- Update exo_mailbox_statistics: fix -ResultSize parameter (pipe from Get-EXOMailbox)
-- Update exo_message_trace: replace deprecated Get-MessageTrace with Get-MessageTraceV2
-- Add exo_shared_mailboxes step
UPDATE public.device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN step->>'id' = 'exo_mailbox_statistics' THEN
          jsonb_set(step, '{params,commands}', '[{"name":"exo_mailbox_statistics","command":"Get-EXOMailbox -ResultSize 500 | Get-EXOMailboxStatistics | Select-Object DisplayName, ItemCount, TotalItemSize, LastLogonTime, MailboxTypeDetail | ConvertTo-Json -Depth 5"}]'::jsonb)
        WHEN step->>'id' = 'exo_message_trace' THEN
          jsonb_set(step, '{params,commands}', '[{"name":"exo_message_trace","command":"Get-MessageTraceV2 -StartDate (Get-Date).AddHours(-24) -EndDate (Get-Date) | Select-Object Received, SenderAddress, RecipientAddress, Subject, Status, Size, MessageTraceId | ConvertTo-Json -Depth 5"}]'::jsonb)
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  ) || '[{"id":"exo_shared_mailboxes","type":"powershell","params":{"module":"ExchangeOnline","timeout":120,"commands":[{"name":"exo_shared_mailboxes","command":"Get-Mailbox -RecipientTypeDetails SharedMailbox -ResultSize 500 | Select-Object DisplayName, PrimarySmtpAddress, RecipientTypeDetails, GrantSendOnBehalfTo | ConvertTo-Json -Depth 5"}]},"category":"Exchange - Mailbox","optional":true}]'::jsonb
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';
