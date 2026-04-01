-- Subdividir categoria "Autenticação de Email" em SPF, DKIM e DMARC

UPDATE compliance_rules 
SET category = 'Autenticação de Email - SPF'
WHERE code LIKE 'SPF-%';

UPDATE compliance_rules 
SET category = 'Autenticação de Email - DKIM'
WHERE code LIKE 'DKIM-%';

UPDATE compliance_rules 
SET category = 'Autenticação de Email - DMARC'
WHERE code LIKE 'DMARC-%';