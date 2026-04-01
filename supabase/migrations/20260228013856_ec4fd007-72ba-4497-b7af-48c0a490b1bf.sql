UPDATE compliance_rules
SET evaluation_logic = jsonb_set(
  jsonb_set(evaluation_logic, '{evidence_label}', '"Regra #{policyid}"'),
  '{evidence_value}', '"{name}"'
),
updated_at = now()
WHERE code = 'net-004';