
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'config_changes' 
        THEN jsonb_set(
          step, 
          '{config,path}', 
          '"/api/v2/log/memory/event/system?filter=subtype==config&rows=500"'::jsonb
        )
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
