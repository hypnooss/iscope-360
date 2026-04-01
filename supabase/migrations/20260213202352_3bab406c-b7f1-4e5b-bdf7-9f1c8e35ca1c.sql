
UPDATE public.device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || '[
    {"id":"webfilter_blocked","executor":"http_request","config":{"method":"GET","path":"/api/v2/log/memory/utm/webfilter?filter=action==blocked&rows=500","headers":{"Authorization":"Bearer {{api_key}}"},"verify_ssl":false}},
    {"id":"appctrl_blocked","executor":"http_request","config":{"method":"GET","path":"/api/v2/log/memory/utm/app-ctrl?filter=action==block&rows=500","headers":{"Authorization":"Bearer {{api_key}}"},"verify_ssl":false}}
  ]'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
