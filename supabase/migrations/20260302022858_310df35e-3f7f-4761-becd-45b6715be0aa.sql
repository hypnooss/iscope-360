-- Fix {{count}} → {count} in pass_description and fail_description
UPDATE compliance_rules SET 
  pass_description = REPLACE(pass_description, '{{count}}', '{count}'),
  fail_description = REPLACE(fail_description, '{{count}}', '{count}')
WHERE code IN ('ADM-003','ADM-004','ADM-005','APP-001','APP-002','APP-005','APP-006','APP-007');

-- Rename APP-001 and APP-002 to clarify they refer to application credentials
UPDATE compliance_rules SET name = 'Credenciais de Aplicativos Expirando em 30 dias' WHERE code = 'APP-001';
UPDATE compliance_rules SET name = 'Credenciais de Aplicativos Expiradas' WHERE code = 'APP-002';