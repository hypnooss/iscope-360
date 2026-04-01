
UPDATE compliance_rules
SET evaluation_logic = jsonb_set(
  evaluation_logic,
  '{evaluate,type}',
  '"check_sharepoint_anonymous_links_live"'
),
    api_endpoint = '/drives/{id}/root/permissions',
    updated_at = now()
WHERE code = 'SPO-002'
  AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';

UPDATE compliance_rules
SET evaluation_logic = jsonb_set(
  evaluation_logic,
  '{evaluate,type}',
  '"check_onedrive_sharing_live"'
),
    api_endpoint = '/users/{id}/drive/root/permissions',
    updated_at = now()
WHERE code = 'SPO-004'
  AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f';
