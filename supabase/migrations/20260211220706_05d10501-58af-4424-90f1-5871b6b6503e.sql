UPDATE public.device_blueprints
SET collection_steps = '{
  "steps": [
    {
      "id": "denied_traffic",
      "executor": "http_request",
      "config": {
        "path": "/api/v2/log/traffic/forward?filter=action==deny&rows=500",
        "method": "GET",
        "verify_ssl": false,
        "headers": { "Authorization": "Bearer {{api_key}}" }
      }
    },
    {
      "id": "auth_events",
      "executor": "http_request",
      "config": {
        "path": "/api/v2/log/event/system?filter=logdesc=~auth&rows=500",
        "method": "GET",
        "verify_ssl": false,
        "headers": { "Authorization": "Bearer {{api_key}}" }
      }
    },
    {
      "id": "vpn_events",
      "executor": "http_request",
      "config": {
        "path": "/api/v2/log/event/vpn?rows=500",
        "method": "GET",
        "verify_ssl": false,
        "headers": { "Authorization": "Bearer {{api_key}}" }
      }
    },
    {
      "id": "ips_events",
      "executor": "http_request",
      "config": {
        "path": "/api/v2/log/ips/forward?filter=severity<=2&rows=500",
        "method": "GET",
        "verify_ssl": false,
        "headers": { "Authorization": "Bearer {{api_key}}" }
      }
    },
    {
      "id": "config_changes",
      "executor": "http_request",
      "config": {
        "path": "/api/v2/log/event/system?filter=logdesc=~config&rows=200",
        "method": "GET",
        "verify_ssl": false,
        "headers": { "Authorization": "Bearer {{api_key}}" }
      }
    }
  ]
}'::jsonb,
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
