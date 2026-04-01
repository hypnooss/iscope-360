-- Adicionar coluna para mensagem de "não encontrado"
ALTER TABLE compliance_rules 
ADD COLUMN not_found_description TEXT;

COMMENT ON COLUMN compliance_rules.not_found_description IS 
  'Mensagem exibida quando os dados para avaliação não são encontrados (recurso não configurado)';

-- Popular mensagens para regras que fazem sentido ter estado "não encontrado"
-- Autenticação
UPDATE compliance_rules SET not_found_description = 'Nenhum servidor LDAP configurado' 
WHERE code = 'auth-001';

UPDATE compliance_rules SET not_found_description = 'Nenhum servidor RADIUS configurado' 
WHERE code = 'auth-002';

UPDATE compliance_rules SET not_found_description = 'Nenhum agente FSSO configurado' 
WHERE code = 'auth-003';

UPDATE compliance_rules SET not_found_description = 'Nenhum provedor SAML configurado' 
WHERE code = 'auth-004';

-- VPN
UPDATE compliance_rules SET not_found_description = 'Nenhum túnel VPN IPsec configurado' 
WHERE code = 'vpn-001';

UPDATE compliance_rules SET not_found_description = 'Nenhum túnel SSL-VPN configurado' 
WHERE code = 'vpn-002';

UPDATE compliance_rules SET not_found_description = 'Nenhuma VPN configurada' 
WHERE code = 'vpn-003';