
-- ==========================================
-- TEMPLATE: SonicWall (5fca6b8b-f8a5-4c20-8992-c09f023e7634)
-- Preenchendo not_found_description para regras aplicáveis
-- ==========================================

-- ha-001: Alta Disponibilidade pode não estar configurada
UPDATE compliance_rules 
SET not_found_description = 'Alta Disponibilidade não configurada neste appliance'
WHERE code = 'ha-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- fw-001: Firmware sempre existe - não precisa mensagem not_found
-- Mantém null

-- bkp-001: Backup pode não estar configurado
UPDATE compliance_rules 
SET not_found_description = 'Nenhum agendamento de backup configurado'
WHERE code = 'bkp-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- net-003: Regras sempre existem - é uma análise de regras existentes
-- Mantém null

-- lic-001: Licenciamento sempre pode ser verificado
-- Mantém null

-- lic-002: Licenças de segurança podem não existir
UPDATE compliance_rules 
SET not_found_description = 'Nenhuma licença de segurança ativa encontrada'
WHERE code = 'lic-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- log-001: Logging pode não estar habilitado
UPDATE compliance_rules 
SET not_found_description = 'Configuração de logging não identificada'
WHERE code = 'log-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- log-002: Syslog pode não estar configurado
UPDATE compliance_rules 
SET not_found_description = 'Nenhum servidor Syslog configurado'
WHERE code = 'log-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- utm-004: Content Filter pode não existir
UPDATE compliance_rules 
SET not_found_description = 'Nenhum perfil de Content Filter configurado'
WHERE code = 'utm-004' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- utm-007: App Control pode não existir
UPDATE compliance_rules 
SET not_found_description = 'Nenhum perfil de Application Control configurado'
WHERE code = 'utm-007' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- utm-009: Gateway AV pode não existir
UPDATE compliance_rules 
SET not_found_description = 'Gateway Antivirus não licenciado ou não configurado'
WHERE code = 'utm-009' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- sec-001: Configuração global sempre existe
-- Mantém null

-- sec-002: 2FA pode não estar configurado
UPDATE compliance_rules 
SET not_found_description = 'Autenticação de dois fatores não configurada para administradores'
WHERE code = 'sec-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- sec-003: Timeout sempre existe como configuração
-- Mantém null

-- inb-001: Regras de entrada podem não existir
UPDATE compliance_rules 
SET not_found_description = 'Nenhuma política de entrada (WAN→LAN) configurada'
WHERE code = 'inb-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- inb-002: Regras RDP podem não existir (bom)
UPDATE compliance_rules 
SET not_found_description = 'Nenhuma regra RDP identificada - verificação não aplicável'
WHERE code = 'inb-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- inb-003: Regras SMB podem não existir (bom)
UPDATE compliance_rules 
SET not_found_description = 'Nenhuma regra SMB identificada - verificação não aplicável'
WHERE code = 'inb-003' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- utm-001: IPS pode não estar licenciado/configurado
UPDATE compliance_rules 
SET not_found_description = 'IPS/IDS não licenciado ou não configurado'
WHERE code = 'utm-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- int-001 até int-005: Interfaces WAN sempre existem
UPDATE compliance_rules 
SET not_found_description = 'Nenhuma interface externa (WAN) identificada'
WHERE code LIKE 'int-%' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';
