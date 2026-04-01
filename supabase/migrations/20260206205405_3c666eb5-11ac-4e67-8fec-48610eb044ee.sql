
-- ==========================================
-- TEMPLATE: Domínio Externo (d5562218-5a3d-4ca6-9591-03e220dbf7e1)
-- Preenchendo not_found_description para regras aplicáveis
-- ==========================================

-- DKIM-001: Pode não ter registro
UPDATE compliance_rules 
SET not_found_description = 'Nenhum registro DKIM encontrado para os seletores verificados'
WHERE code = 'DKIM-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DKIM-002: Pode não ter chave para verificar
UPDATE compliance_rules 
SET not_found_description = 'Nenhuma chave DKIM encontrada para análise de tamanho'
WHERE code = 'DKIM-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DKIM-003: Pode não ter seletores
UPDATE compliance_rules 
SET not_found_description = 'Nenhum seletor DKIM configurado no domínio'
WHERE code = 'DKIM-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DMARC-001: Pode não ter registro
UPDATE compliance_rules 
SET not_found_description = 'Registro DMARC não encontrado no DNS do domínio'
WHERE code = 'DMARC-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DMARC-002: Depende de DMARC existir
UPDATE compliance_rules 
SET not_found_description = 'Registro DMARC não configurado - impossível avaliar política'
WHERE code = 'DMARC-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DMARC-003: Depende de DMARC existir
UPDATE compliance_rules 
SET not_found_description = 'Registro DMARC não configurado - impossível avaliar relatórios'
WHERE code = 'DMARC-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DMARC-004: Depende de DMARC existir
UPDATE compliance_rules 
SET not_found_description = 'Registro DMARC não configurado - impossível avaliar cobertura'
WHERE code = 'DMARC-004' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- SPF-001: Pode não ter registro
UPDATE compliance_rules 
SET not_found_description = 'Registro SPF não encontrado no DNS do domínio'
WHERE code = 'SPF-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- SPF-002: Depende de SPF existir
UPDATE compliance_rules 
SET not_found_description = 'Registro SPF não configurado - impossível avaliar política'
WHERE code = 'SPF-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- SPF-003: Depende de SPF existir
UPDATE compliance_rules 
SET not_found_description = 'Registro SPF não configurado - impossível avaliar lookups'
WHERE code = 'SPF-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- SPF-004: Depende de SPF existir
UPDATE compliance_rules 
SET not_found_description = 'Registro SPF não configurado - impossível avaliar mecanismos'
WHERE code = 'SPF-004' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- SPF-005: Depende de SPF existir
UPDATE compliance_rules 
SET not_found_description = 'Registro SPF não configurado - impossível avaliar mecanismo PTR'
WHERE code = 'SPF-005' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- MX-001: Pode não ter registros
UPDATE compliance_rules 
SET not_found_description = 'Nenhum registro MX configurado para o domínio'
WHERE code = 'MX-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- MX-002: Depende de MX existir
UPDATE compliance_rules 
SET not_found_description = 'Nenhum registro MX encontrado - impossível avaliar redundância'
WHERE code = 'MX-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- MX-003: Depende de MX existir
UPDATE compliance_rules 
SET not_found_description = 'Nenhum registro MX encontrado - impossível avaliar consistência PTR'
WHERE code = 'MX-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- MTA-STS-001: Pode não ter registro
UPDATE compliance_rules 
SET not_found_description = 'Registro MTA-STS não encontrado no DNS do domínio'
WHERE code = 'MTA-STS-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DNS-001: Nameservers sempre existem, mas pode haver problemas
UPDATE compliance_rules 
SET not_found_description = 'Nenhum nameserver identificado para o domínio'
WHERE code = 'DNS-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DNS-002: Depende de nameservers
UPDATE compliance_rules 
SET not_found_description = 'Nenhum nameserver encontrado - impossível avaliar redundância'
WHERE code = 'DNS-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DNS-003: DNSSEC pode não estar configurado
UPDATE compliance_rules 
SET not_found_description = 'DNSSEC não configurado no domínio'
WHERE code = 'DNS-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- BIMI-001: Pode não ter registro
UPDATE compliance_rules 
SET not_found_description = 'Registro BIMI não encontrado no DNS do domínio'
WHERE code = 'BIMI-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- TLS-RPT-001: Pode não ter registro
UPDATE compliance_rules 
SET not_found_description = 'Registro TLS-RPT não encontrado no DNS do domínio'
WHERE code = 'TLS-RPT-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- CAA-001: Pode não ter registro
UPDATE compliance_rules 
SET not_found_description = 'Registro CAA não encontrado no DNS do domínio'
WHERE code = 'CAA-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- DANE-001: Pode não ter registro
UPDATE compliance_rules 
SET not_found_description = 'Registro DANE/TLSA não encontrado no DNS do domínio'
WHERE code = 'DANE-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';
