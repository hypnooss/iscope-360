UPDATE public.device_blueprints
SET collection_steps = jsonb_set(
  jsonb_set(
    collection_steps,
    '{steps,0,params}',
    '{"port_range": "1-65535", "rate": 1000}'::jsonb
  ),
  '{steps,0,timeout}',
  '300'::jsonb
),
updated_at = now()
WHERE name = 'Active Attack Surface Scan';