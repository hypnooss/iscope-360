-- Alta Disponibilidade - HA pode não estar configurado
UPDATE compliance_rules SET not_found_description = 'Alta Disponibilidade não configurada — firewall operando em modo standalone'
WHERE code = 'ha-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Alta Disponibilidade não configurada — sincronização de sessões não aplicável'
WHERE code = 'ha-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Alta Disponibilidade não configurada — heartbeat não aplicável'
WHERE code = 'ha-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- Firmware - sempre existe, não precisa de not_found
-- (fw-001 não precisa de not_found_description)

-- Backup - pode não ter agendamento configurado
UPDATE compliance_rules SET not_found_description = 'Nenhum agendamento de backup configurado'
WHERE code = 'bkp-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- Configuração de Rede
UPDATE compliance_rules SET not_found_description = 'Nenhuma política de firewall configurada'
WHERE code = 'net-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- Licenciamento - sempre existe informação de licença
-- (lic-001 e lic-002 não precisam)

-- Logging
UPDATE compliance_rules SET not_found_description = 'Nenhuma configuração de logging encontrada'
WHERE code = 'log-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhum servidor Syslog ou FortiAnalyzer configurado'
WHERE code = 'log-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- Perfis UTM - podem não ter políticas com esses perfis
UPDATE compliance_rules SET not_found_description = 'Nenhuma política com Web Filter aplicado'
WHERE code = 'utm-004' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma política com Application Control aplicado'
WHERE code = 'utm-007' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma política com Antivírus aplicado'
WHERE code = 'utm-009' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- Políticas de Segurança - configurações globais, sempre existem
-- (sec-001, sec-002, sec-003 não precisam)

-- Regras de Entrada - podem não ter políticas inbound
UPDATE compliance_rules SET not_found_description = 'Nenhuma política de entrada (inbound) configurada'
WHERE code = 'inb-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma política com porta RDP (3389) exposta'
WHERE code = 'inb-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma política com portas SMB/CIFS (445, 139) expostas'
WHERE code = 'inb-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma política de entrada com IPS/IDS configurado'
WHERE code = 'utm-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- Segurança de Interfaces - pode não ter interfaces externas
UPDATE compliance_rules SET not_found_description = 'Nenhuma interface externa (WAN) identificada'
WHERE code = 'int-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma interface externa (WAN) identificada'
WHERE code = 'int-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma interface externa (WAN) identificada'
WHERE code = 'int-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma interface externa (WAN) identificada'
WHERE code = 'int-004' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET not_found_description = 'Nenhuma interface externa (WAN) identificada'
WHERE code = 'int-005' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';