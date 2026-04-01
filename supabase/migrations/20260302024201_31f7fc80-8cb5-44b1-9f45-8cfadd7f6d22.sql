UPDATE compliance_rules 
SET not_found_description = 'Dados de detecção de risco não disponíveis. Verifique se a permissão IdentityRiskEvent.Read.All foi concedida e o Admin Consent foi realizado.'
WHERE code = 'AUT-003';