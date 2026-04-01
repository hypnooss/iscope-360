
-- Add anomaly_events step to FortiGate - Analyzer blueprint
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  collection_steps->'steps' || '[{"id":"anomaly_events","executor":"http_request","config":{"method":"GET","path":"/api/v2/log/memory/anomaly?rows=500&extra=country_id","headers":{"Authorization":"Bearer {{api_key}}"},"verify_ssl":false,"optional":true}}]'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
