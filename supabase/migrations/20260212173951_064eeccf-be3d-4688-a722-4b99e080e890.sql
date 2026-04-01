-- Update FortiGate Analyzer blueprint to use more specific API filters
-- to avoid returning the same mixed log buffer for auth and VPN events
UPDATE public.device_blueprints 
SET collection_steps = jsonb_build_object(
  'steps', jsonb_build_array(
    jsonb_build_object(
      'id', 'denied_traffic',
      'executor', 'http_request',
      'config', jsonb_build_object(
        'method', 'GET',
        'path', '/api/v2/log/memory/traffic/forward?filter=action==deny&rows=500',
        'headers', jsonb_build_object('Authorization', 'Bearer {{api_key}}'),
        'verify_ssl', false
      )
    ),
    jsonb_build_object(
      'id', 'auth_events',
      'executor', 'http_request',
      'config', jsonb_build_object(
        'method', 'GET',
        'path', '/api/v2/log/memory/event/system?filter=subtype==system&rows=500',
        'headers', jsonb_build_object('Authorization', 'Bearer {{api_key}}'),
        'verify_ssl', false
      )
    ),
    jsonb_build_object(
      'id', 'vpn_events',
      'executor', 'http_request',
      'config', jsonb_build_object(
        'method', 'GET',
        'path', '/api/v2/log/memory/event/vpn?filter=subtype==vpn&rows=500',
        'headers', jsonb_build_object('Authorization', 'Bearer {{api_key}}'),
        'verify_ssl', false
      )
    ),
    jsonb_build_object(
      'id', 'ips_events',
      'executor', 'http_request',
      'config', jsonb_build_object(
        'method', 'GET',
        'path', '/api/v2/log/memory/ips/forward?filter=severity<=2&rows=500',
        'headers', jsonb_build_object('Authorization', 'Bearer {{api_key}}'),
        'verify_ssl', false
      )
    ),
    jsonb_build_object(
      'id', 'config_changes',
      'executor', 'http_request',
      'config', jsonb_build_object(
        'method', 'GET',
        'path', '/api/v2/log/memory/event/system?filter=logdesc=~config&rows=500',
        'headers', jsonb_build_object('Authorization', 'Bearer {{api_key}}'),
        'verify_ssl', false
      )
    )
  )
),
updated_at = now()
WHERE id = '9e33ae45-053c-4ea2-9723-c9e0cf01549c';
