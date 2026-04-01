
-- Desativar 5 steps per-mailbox no blueprint M365 - Exchange Online
-- Adiciona "enabled": false aos steps que iteram caixa por caixa
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN step->>'id' IN ('exo_inbox_rules', 'exo_mailbox_audit', 'exo_mailbox_forwarding', 'exo_mailbox_quota', 'exo_mailbox_statistics')
        THEN step || '{"enabled": false}'::jsonb
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';
