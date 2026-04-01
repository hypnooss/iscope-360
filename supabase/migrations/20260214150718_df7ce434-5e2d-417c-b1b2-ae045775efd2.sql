UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps,0}',
  '{
    "id": "masscan_discovery",
    "name": "Port Discovery (nmap)",
    "type": "nmap_discovery",
    "params": {"port_range": "1-65535", "max_rate": 500},
    "timeout": 420,
    "description": "Descoberta de portas abertas usando nmap stealth scan"
  }'::jsonb
),
updated_at = now()
WHERE name = 'Active Attack Surface Scan';