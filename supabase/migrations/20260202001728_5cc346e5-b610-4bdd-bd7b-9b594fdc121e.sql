-- Atualizar recomendação da regra utm-007
UPDATE compliance_rules 
SET recommendation = 'Aplicar perfil Application Control em regras de saída'
WHERE code = 'utm-007';