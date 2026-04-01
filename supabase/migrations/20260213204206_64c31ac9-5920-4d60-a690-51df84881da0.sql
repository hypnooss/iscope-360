-- Update ips_events: fix path (remove severity filter) + add optional:true
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps,3}',
  '{"id":"ips_events","executor":"http_request","config":{"method":"GET","path":"/api/v2/log/memory/ips?rows=500","headers":{"Authorization":"Bearer {{api_key}}"},"verify_ssl":false,"optional":true}}'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';

-- Update webfilter_blocked: add optional:true to existing config
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps,5,config,optional}',
  'true'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';

-- Update appctrl_blocked: add optional:true to existing config
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps,6,config,optional}',
  'true'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';