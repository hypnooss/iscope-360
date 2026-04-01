UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'masscan_discovery' 
        THEN jsonb_set(step, '{timeout}', '750'::jsonb)
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = '939c3274-2c70-4169-a700-4392b52ce082';