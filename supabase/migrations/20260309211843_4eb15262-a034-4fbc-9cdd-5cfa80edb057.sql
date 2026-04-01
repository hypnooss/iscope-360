
-- Add domain_whois step to external_domain blueprint
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || '[{"id": "domain_whois", "type": "domain_whois", "executor": "agent", "config": {"optional": true, "whois_servers": {".br": "whois.registro.br", ".com": "whois.verisign-grs.com", ".net": "whois.verisign-grs.com", ".org": "whois.pir.org", "default": "whois.iana.org"}}}]'::jsonb
),
updated_at = NOW()
WHERE id = '27b856b1-3b20-4180-b9da-ea5834c55ac6';
