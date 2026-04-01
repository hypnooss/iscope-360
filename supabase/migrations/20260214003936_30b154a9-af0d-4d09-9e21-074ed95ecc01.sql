-- Fix Analyzer blueprint: correct UTM paths and add country enrichment
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  jsonb_set(
    jsonb_set(
      collection_steps,
      '{steps,5,config,path}',
      '"/api/v2/log/memory/webfilter?filter=action==blocked&rows=500"'::jsonb
    ),
    '{steps,6,config,path}',
    '"/api/v2/log/memory/app-ctrl?filter=action==block&rows=500"'::jsonb
  ),
  '{steps,0,config,path}',
  '"/api/v2/log/memory/traffic/forward?filter=action==deny&rows=500&extra=country_id"'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
