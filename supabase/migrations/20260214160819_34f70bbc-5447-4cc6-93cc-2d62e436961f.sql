
UPDATE device_blueprints
SET collection_steps = '{
  "steps": [
    {
      "id": "asn_classifier",
      "name": "ASN/Provider Classification",
      "description": "Identifica se o IP pertence a CDN/Cloud para adaptar estratégia de scan",
      "type": "asn_classifier",
      "params": {},
      "timeout": 20
    },
    {
      "id": "masscan_discovery",
      "name": "Port Discovery (nmap)",
      "description": "Descoberta de portas abertas usando nmap stealth scan (cloud-aware)",
      "type": "nmap_discovery",
      "depends_on": "asn_classifier",
      "params": {"port_range": "1-65535", "max_rate": 500},
      "timeout": 420
    },
    {
      "id": "nmap_fingerprint",
      "name": "Service Fingerprint (nmap)",
      "description": "Fingerprint de serviços e versões nas portas descobertas",
      "type": "nmap",
      "depends_on": "masscan_discovery",
      "params": {},
      "timeout": 300
    },
    {
      "id": "httpx_webstack",
      "name": "Web Stack Detection (httpx)",
      "description": "Detecção de tecnologias web, TLS e headers (browser simulation para CDN)",
      "type": "httpx",
      "depends_on": "masscan_discovery",
      "params": {},
      "timeout": 60
    }
  ]
}'::jsonb
WHERE id = '939c3274-2c70-4169-a700-4392b52ce082';
