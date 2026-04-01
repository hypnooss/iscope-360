-- Remove subdomain_enum step from external_domain blueprint
-- This step now runs server-side in the subdomain-enum Edge Function
UPDATE device_blueprints 
SET collection_steps = '{"steps": [
  {"id": "ns_records", "type": "dns_query", "config": {"query_type": "NS"}},
  {"id": "mx_records", "type": "dns_query", "config": {"query_type": "MX"}},
  {"id": "soa_record", "type": "dns_query", "config": {"query_type": "SOA"}},
  {"id": "spf_record", "type": "dns_query", "config": {"query_type": "SPF"}},
  {"id": "dmarc_record", "type": "dns_query", "config": {"query_type": "DMARC"}},
  {"id": "dkim_records", "type": "dns_query", "config": {"query_type": "DKIM", "selectors": ["amazonses", "ses", "ses1", "ses2", "mailchimp", "mc", "k1", "k2", "k3", "mailgun", "mg", "hubspot", "hs", "hs1", "s1", "s2", "sendgrid", "hs2", "salesforce", "sfmc", "pardot", "ex", "cttarget", "opendkim", "postfix", "mx1", "mx2", "cpanel", "plesk", "sendinblue", "mailjet", "mailcow", "zimbra", "icewarp", "tiflux", "selector1", "selector2", "default"], "best_effort": true}},
  {"id": "dnssec_status", "type": "dns_query", "config": {"query_type": "DNSSEC", "best_effort": true}}
]}'::jsonb,
updated_at = NOW()
WHERE id = '27b856b1-3b20-4180-b9da-ea5834c55ac6';