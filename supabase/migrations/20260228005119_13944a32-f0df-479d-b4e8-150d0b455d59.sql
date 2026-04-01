
-- 1. Add firewall_policy_stats step to FortiGate blueprint
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || '[{"id":"firewall_policy_stats","executor":"http_request","config":{"method":"GET","path":"/api/v2/monitor/firewall/policy","headers":{"Authorization":"Bearer {{api_key}}"},"timeout":60,"verify_ssl":false,"optional":true}}]'::jsonb
),
updated_at = now()
WHERE id = '1130a1f7-9e04-4df8-9c12-50f86066611b';

-- 2. Update net-004 rule to use firewall_policy_stats as source
UPDATE compliance_rules 
SET evaluation_logic = jsonb_set(evaluation_logic, '{source_key}', '"firewall_policy_stats"'::jsonb),
    updated_at = now()
WHERE code = 'net-004';
