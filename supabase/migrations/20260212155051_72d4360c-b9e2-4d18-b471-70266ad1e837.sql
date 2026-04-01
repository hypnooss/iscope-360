UPDATE public.device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps,4,config,path}',
  '"/api/v2/log/memory/event/system?filter=logdesc=~config&rows=500"'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';