
-- Insert device_type for attack_surface scanner
INSERT INTO public.device_types (code, name, vendor, category, icon, is_active)
VALUES ('attack_surface', 'Attack Surface Scanner', 'iScope', 'scanner', 'Radar', true);

-- Insert blueprint with masscan + nmap + httpx steps
INSERT INTO public.device_blueprints (device_type_id, name, description, executor_type, version, is_active, collection_steps)
VALUES (
  (SELECT id FROM public.device_types WHERE code = 'attack_surface' LIMIT 1),
  'Active Attack Surface Scan',
  'Scan ativo de superfície de ataque: masscan (portas) → nmap (serviços) → httpx (web stack)',
  'agent',
  '1.0.0',
  true,
  '{
    "steps": [
      {
        "id": "masscan_discovery",
        "type": "masscan",
        "name": "Port Discovery (masscan)",
        "description": "Descoberta rápida de portas abertas usando masscan",
        "params": {
          "port_range": "1-65535",
          "rate": 10000
        },
        "timeout": 120
      },
      {
        "id": "nmap_fingerprint",
        "type": "nmap",
        "name": "Service Fingerprint (nmap)",
        "description": "Fingerprint de serviços e versões nas portas descobertas",
        "params": {},
        "depends_on": "masscan_discovery",
        "timeout": 300
      },
      {
        "id": "httpx_webstack",
        "type": "httpx",
        "name": "Web Stack Detection (httpx)",
        "description": "Detecção de tecnologias web, TLS e headers",
        "params": {},
        "depends_on": "masscan_discovery",
        "timeout": 60
      }
    ]
  }'::jsonb
);
