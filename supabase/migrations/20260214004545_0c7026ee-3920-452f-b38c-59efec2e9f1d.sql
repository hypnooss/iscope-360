
-- Add extra=country_id to auth_events and vpn_events steps for geolocation enrichment
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  jsonb_set(collection_steps, '{steps,1,config,path}', '"/api/v2/log/memory/event/system?filter=subtype==system&rows=500&extra=country_id"'::jsonb),
  '{steps,2,config,path}', '"/api/v2/log/memory/event/vpn?filter=subtype==vpn&rows=500&extra=country_id"'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
