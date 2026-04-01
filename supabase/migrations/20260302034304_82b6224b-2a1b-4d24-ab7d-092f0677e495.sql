
-- Update TMS-001 to use teams_members step (which has $expand=members)
UPDATE compliance_rules 
SET evaluation_logic = jsonb_set(evaluation_logic, '{source_key}', '"teams_members"'::jsonb),
    updated_at = now()
WHERE code = 'TMS-001' 
  AND device_type_id = (SELECT id FROM device_types WHERE code = 'm365' LIMIT 1);
