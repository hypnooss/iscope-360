-- SonicWall: Alta Disponibilidade
UPDATE compliance_rules SET 
  technical_risk = 'Sem HA configurado, uma falha de hardware ou software no firewall resulta em indisponibilidade total da conectividade de rede.',
  business_impact = 'Interrupção completa das operações de rede, afetando todos os serviços dependentes de conectividade.',
  api_endpoint = '/api/sonicos/high-availability'
WHERE code = 'ha-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: Firmware
UPDATE compliance_rules SET 
  technical_risk = 'Firmware desatualizado pode conter vulnerabilidades conhecidas que permitem exploração remota ou bypass de autenticação.',
  business_impact = 'Risco de comprometimento do perímetro de segurança, podendo resultar em violação de dados ou acesso não autorizado.',
  api_endpoint = '/api/sonicos/version'
WHERE code = 'fw-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: Backup
UPDATE compliance_rules SET 
  technical_risk = 'Sem backup automático, uma falha pode resultar em perda total das configurações do firewall.',
  business_impact = 'Tempo de recuperação estendido após incidentes, podendo levar horas para reconfigurar manualmente.',
  api_endpoint = '/api/sonicos/administration'
WHERE code = 'bkp-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: Rede
UPDATE compliance_rules SET 
  technical_risk = 'Regras Any-Any eliminam o princípio do menor privilégio, permitindo qualquer tráfego sem restrição.',
  business_impact = 'Movimentação lateral irrestrita de atacantes, facilitando propagação de ransomware.',
  api_endpoint = '/api/sonicos/access-rules/ipv4'
WHERE code = 'net-003' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: Licenciamento
UPDATE compliance_rules SET 
  technical_risk = 'Sem contrato de suporte ativo, não há acesso a atualizações de firmware ou patches de segurança.',
  business_impact = 'Vulnerabilidades descobertas não podem ser corrigidas, aumentando o risco de exploração.',
  api_endpoint = '/api/sonicos/licenses'
WHERE code = 'lic-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'Sem licenças de segurança ativas, proteções como IPS, antivírus e filtro web não são atualizadas.',
  business_impact = 'Proteção contra ameaças emergentes fica desatualizada, aumentando a superfície de ataque.',
  api_endpoint = '/api/sonicos/licenses'
WHERE code = 'lic-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: Logging
UPDATE compliance_rules SET 
  technical_risk = 'Sem logging de eventos, não há visibilidade sobre tentativas de ataque ou comportamento anômalo.',
  business_impact = 'Impossibilidade de investigar incidentes e atender requisitos de compliance.',
  api_endpoint = '/api/sonicos/log/settings'
WHERE code = 'log-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'Logs apenas locais podem ser perdidos em caso de falha ou apagados por atacantes.',
  business_impact = 'Perda de evidências forenses e trilha de auditoria.',
  api_endpoint = '/api/sonicos/log/syslog'
WHERE code = 'log-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: UTM
UPDATE compliance_rules SET 
  technical_risk = 'Sem Web Filter, usuários podem acessar sites maliciosos que distribuem malware ou phishing.',
  business_impact = 'Maior exposição a malware via navegação web e downloads maliciosos.',
  api_endpoint = '/api/sonicos/content-filter'
WHERE code = 'utm-004' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'Sem Application Control, aplicações de risco podem operar livremente na rede.',
  business_impact = 'Shadow IT pode causar vazamento de dados e violações de conformidade.',
  api_endpoint = '/api/sonicos/app-control'
WHERE code = 'utm-007' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'Sem Antivírus no gateway, malware conhecido pode entrar na rede via downloads.',
  business_impact = 'Infecção de endpoints e propagação de ransomware.',
  api_endpoint = '/api/sonicos/gateway-anti-virus'
WHERE code = 'utm-009' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: Políticas de Segurança
UPDATE compliance_rules SET 
  technical_risk = 'Sem criptografia forte, o firewall pode aceitar cifras fracas vulneráveis a ataques.',
  business_impact = 'Comunicações administrativas podem ser interceptadas.',
  api_endpoint = '/api/sonicos/administration'
WHERE code = 'sec-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'Sem 2FA, credenciais de administrador comprometidas dão acesso total ao firewall.',
  business_impact = 'Atacante pode desabilitar proteções e comprometer toda a infraestrutura.',
  api_endpoint = '/api/sonicos/administration'
WHERE code = 'sec-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'Timeout longo mantém sessões administrativas ativas, permitindo uso não autorizado.',
  business_impact = 'Risco de acesso não autorizado por sessões abandonadas.',
  api_endpoint = '/api/sonicos/administration'
WHERE code = 'sec-003' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: Regras de Entrada
UPDATE compliance_rules SET 
  technical_risk = 'Regras de entrada sem restrição de IP permitem acesso de qualquer endereço da internet.',
  business_impact = 'Serviços expostos vulneráveis a ataques de toda a internet.',
  api_endpoint = '/api/sonicos/access-rules/ipv4'
WHERE code = 'inb-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'RDP exposto é alvo prioritário de ataques de força bruta e exploits.',
  business_impact = 'Comprometimento via RDP frequentemente resulta em ransomware.',
  api_endpoint = '/api/sonicos/access-rules/ipv4'
WHERE code = 'inb-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'SMB/CIFS exposto permite exploração de vulnerabilidades críticas como EternalBlue.',
  business_impact = 'Acesso direto a compartilhamentos pode resultar em roubo massivo de dados.',
  api_endpoint = '/api/sonicos/access-rules/ipv4'
WHERE code = 'inb-003' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'Sem IPS/IDS, tráfego malicioso passa despercebido pelo firewall.',
  business_impact = 'Ataques de exploração não são detectados ou bloqueados.',
  api_endpoint = '/api/sonicos/intrusion-prevention'
WHERE code = 'utm-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

-- SonicWall: Interfaces
UPDATE compliance_rules SET 
  technical_risk = 'HTTP em interfaces externas transmite dados administrativos em texto claro.',
  business_impact = 'Credenciais de administrador podem ser capturadas em trânsito.',
  api_endpoint = '/api/sonicos/interfaces/ipv4'
WHERE code = 'int-001' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'Telnet transmite comandos e credenciais em texto claro.',
  business_impact = 'Comandos administrativos podem ser interceptados.',
  api_endpoint = '/api/sonicos/interfaces/ipv4'
WHERE code = 'int-002' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';