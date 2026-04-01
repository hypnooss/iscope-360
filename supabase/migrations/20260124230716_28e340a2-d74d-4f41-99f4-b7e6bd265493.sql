-- Corrigir endpoints da API SonicOS 7.x no blueprint SonicWall
UPDATE device_blueprints
SET collection_steps = '{
  "steps": [
    {
      "id": "auth_login",
      "type": "http_session",
      "action": "login",
      "method": "POST",
      "path": "/api/sonicos/auth",
      "headers": {"Content-Type": "application/json"},
      "body_template": "{\"user\": \"{{auth_username}}\", \"password\": \"{{auth_password}}\"}",
      "save_session": true
    },
    {
      "id": "system_status",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/reporting/system/status",
      "use_session": true
    },
    {
      "id": "version",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/version",
      "use_session": true
    },
    {
      "id": "interfaces",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/interfaces/ipv4",
      "use_session": true
    },
    {
      "id": "access_rules",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/access-rules/ipv4",
      "use_session": true
    },
    {
      "id": "nat_policies",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/nat-policies/ipv4",
      "use_session": true
    },
    {
      "id": "gateway_av",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/gateway-anti-virus/base",
      "use_session": true
    },
    {
      "id": "ips",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/intrusion-prevention/base",
      "use_session": true
    },
    {
      "id": "anti_spyware",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/anti-spyware/base",
      "use_session": true
    },
    {
      "id": "app_control",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/app-control/policies",
      "use_session": true
    },
    {
      "id": "content_filter",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/content-filter/profiles",
      "use_session": true
    },
    {
      "id": "geo_ip",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/geo-ip/base",
      "use_session": true
    },
    {
      "id": "botnet",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/botnet/base",
      "use_session": true
    },
    {
      "id": "vpn_ssl",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/ssl-vpn/server/settings",
      "use_session": true
    },
    {
      "id": "vpn_ipsec",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/vpn/policies/site-to-site/ipv4",
      "use_session": true
    },
    {
      "id": "log_settings",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/log/automation",
      "use_session": true
    },
    {
      "id": "administration",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/administration/base-settings",
      "use_session": true
    },
    {
      "id": "licenses",
      "type": "http_request",
      "method": "GET",
      "path": "/api/sonicos/licenses/status",
      "use_session": true
    },
    {
      "id": "auth_logout",
      "type": "http_session",
      "action": "logout",
      "method": "DELETE",
      "path": "/api/sonicos/auth",
      "use_session": true
    }
  ]
}'::jsonb,
updated_at = now()
WHERE id = 'f1c656c0-75ed-43c6-b0a3-696498833094';