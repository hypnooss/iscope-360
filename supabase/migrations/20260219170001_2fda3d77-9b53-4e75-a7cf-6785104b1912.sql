UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || '[{
    "id": "allowed_traffic",
    "executor": "http_request",
    "config": {
      "method": "GET",
      "path": "/api/v2/log/memory/traffic/forward?filter=action==accept&rows=500&extra=country_id",
      "headers": { "Authorization": "Bearer {{api_key}}" },
      "verify_ssl": false,
      "optional": true
    }
  }]'::jsonb
)
WHERE id IN (
  SELECT db.id 
  FROM device_blueprints db
  JOIN device_types dt ON db.device_type_id = dt.id
  WHERE dt.code = 'fortigate'
    AND db.is_active = true
    AND db.executor_type = 'hybrid'
);