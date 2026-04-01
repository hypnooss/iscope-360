-- Update the exo_message_trace step in the M365 hybrid blueprint to use dynamic period params
-- instead of hardcoded 24h window, preventing duplicate data collection across snapshots
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'exo_message_trace' THEN
          jsonb_set(
            step,
            '{params,commands}',
            jsonb_build_array(
              jsonb_build_object(
                'name', 'exo_message_trace',
                'command', 'Get-MessageTraceV2 -StartDate "{period_start}" -EndDate "{period_end}" | Select-Object Received, SenderAddress, RecipientAddress, Subject, Status, Size, MessageTraceId | ConvertTo-Json -Depth 5'
              )
            )
          )
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';