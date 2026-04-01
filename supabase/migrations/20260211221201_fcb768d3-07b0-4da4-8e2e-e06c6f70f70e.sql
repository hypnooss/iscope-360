
UPDATE device_blueprints
SET collection_steps = '{
  "steps": [
    {
      "id": "denied_traffic",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/log/memory/traffic/forward?filter=action==deny&rows=500",
        "headers": { "Authorization": "Bearer {{api_key}}" },
        "verify_ssl": false
      }
    },
    {
      "id": "auth_events",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/log/memory/event/system?filter=logdesc=~auth&rows=500",
        "headers": { "Authorization": "Bearer {{api_key}}" },
        "verify_ssl": false
      }
    },
    {
      "id": "vpn_events",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/log/memory/event/vpn?rows=500",
        "headers": { "Authorization": "Bearer {{api_key}}" },
        "verify_ssl": false
      }
    },
    {
      "id": "ips_events",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/log/memory/ips/forward?filter=severity<=2&rows=500",
        "headers": { "Authorization": "Bearer {{api_key}}" },
        "verify_ssl": false
      }
    },
    {
      "id": "config_changes",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/log/memory/event/system?filter=logdesc=~config&rows=200",
        "headers": { "Authorization": "Bearer {{api_key}}" },
        "verify_ssl": false
      }
    }
  ]
}'::jsonb,
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
