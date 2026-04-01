
UPDATE compliance_rules
SET evaluation_logic = jsonb_set(
  evaluation_logic::jsonb,
  '{join_source}',
  '{"key": "firewall_policy", "on": "policyid", "fields": ["status", "action", "name", "srcintf", "dstintf"]}'::jsonb
),
    updated_at = now()
WHERE code = 'net-004'
  AND (evaluation_logic::jsonb->>'type') = 'filtered_count_check'
  AND (evaluation_logic::jsonb->>'source_key') = 'firewall_policy_stats';
