
-- Marcar steps DNS opcionais como optional: true no blueprint External Domain DNS Scan
-- Isso garante que ausência de registros DNS não cause falha da tarefa inteira
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN step->>'id' IN ('ns_records', 'mx_records', 'soa_record', 'spf_record', 'dmarc_record')
        THEN jsonb_set(step, '{config,optional}', 'true'::jsonb)
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
)
WHERE id = '27b856b1-3b20-4180-b9da-ea5834c55ac6';
