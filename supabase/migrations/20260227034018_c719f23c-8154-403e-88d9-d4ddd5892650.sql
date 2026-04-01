
-- FASE 2: Add 4 new steps to FortiGate Analyzer (hybrid) blueprint
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || '[
    {
      "id": "monitor_firewall_policy",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/firewall/policy",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 60,
        "verify_ssl": false,
        "optional": true
      }
    },
    {
      "id": "monitor_firewall_session",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/firewall/session?count=1",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 30,
        "verify_ssl": false,
        "optional": true
      }
    },
    {
      "id": "monitor_traffic_history",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/system/traffic-history/interface?time_period=1h",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 30,
        "verify_ssl": false,
        "optional": true
      }
    },
    {
      "id": "monitor_botnet_domains",
      "executor": "http_request",
      "config": {
        "method": "GET",
        "path": "/api/v2/monitor/system/botnet-domains/stat",
        "headers": {"Authorization": "Bearer {{api_key}}"},
        "timeout": 30,
        "verify_ssl": false,
        "optional": true
      }
    }
  ]'::jsonb
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
