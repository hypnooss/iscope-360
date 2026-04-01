UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'teams_settings' 
        THEN jsonb_set(
          jsonb_set(step, '{config,endpoint}', '"/teamwork/teamsAppSettings"'),
          '{config,api_version}', '"v1.0"'
        )
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE id = '0478d423-918d-4483-98af-f30df3ade0d3';