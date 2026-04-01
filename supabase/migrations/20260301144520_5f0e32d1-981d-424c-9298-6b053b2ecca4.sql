UPDATE compliance_rules 
SET evaluation_logic = '{"source_key":"oauth2_permissions","secondary_source_key":"service_principals","evaluate":{"type":"count_oauth_consents","threshold":20}}'::jsonb,
    updated_at = now()
WHERE code = 'APP-005';