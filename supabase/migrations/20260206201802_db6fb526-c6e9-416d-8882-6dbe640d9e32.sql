-- FortiGate: Alta Disponibilidade
UPDATE compliance_rules SET 
  technical_risk = 'Sem HA configurado, uma falha de hardware ou software no firewall resulta em indisponibilidade total da conectividade de rede e perda de inspeção de segurança.',
  business_impact = 'Interrupção completa das operações de rede, afetando todos os serviços dependentes de conectividade, incluindo acesso à internet, VPNs e comunicação entre filiais.',
  api_endpoint = '/api/v2/cmdb/system/ha'
WHERE code = 'ha-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Sem sincronização de sessões, um failover para o firewall secundário força o reestabelecimento de todas as conexões ativas, causando timeout em aplicações.',
  business_impact = 'Usuários experimentam desconexões abruptas durante failover, afetando transferências de arquivos, videoconferências e transações em andamento.',
  api_endpoint = '/api/v2/cmdb/system/ha'
WHERE code = 'ha-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Com apenas uma interface de heartbeat, uma falha nesse link pode causar split-brain, onde ambos os firewalls assumem papel primário simultaneamente.',
  business_impact = 'Conflitos de IP e instabilidade de rede podem causar interrupções intermitentes difíceis de diagnosticar, afetando a confiabilidade do ambiente.',
  api_endpoint = '/api/v2/cmdb/system/ha'
WHERE code = 'ha-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Firmware
UPDATE compliance_rules SET 
  technical_risk = 'Firmware desatualizado pode conter vulnerabilidades conhecidas (CVEs) que permitem exploração remota, bypass de autenticação ou execução de código arbitrário.',
  business_impact = 'Risco de comprometimento total do perímetro de segurança, podendo resultar em violação de dados, ransomware ou acesso não autorizado à rede corporativa.',
  api_endpoint = '/api/v2/monitor/system/firmware'
WHERE code = 'fw-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Autenticação
UPDATE compliance_rules SET 
  technical_risk = 'LDAP sem criptografia transmite credenciais em texto claro, permitindo interceptação via ataques man-in-the-middle na rede.',
  business_impact = 'Credenciais de usuários podem ser capturadas e utilizadas para acesso não autorizado a sistemas críticos, comprometendo a segurança de toda a organização.',
  api_endpoint = '/api/v2/cmdb/user/ldap'
WHERE code = 'auth-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'RADIUS sem redundância ou timeout adequado pode causar falhas de autenticação durante instabilidades de rede ou sobrecarga do servidor.',
  business_impact = 'Usuários legítimos podem ser impedidos de acessar recursos críticos durante janelas de indisponibilidade do servidor RADIUS.',
  api_endpoint = '/api/v2/cmdb/user/radius'
WHERE code = 'auth-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Sem FSSO, políticas baseadas em identidade não funcionam, forçando uso de regras baseadas apenas em IP que são menos granulares e seguras.',
  business_impact = 'Dificuldade em aplicar políticas de acesso por grupo/usuário, reduzindo a capacidade de segmentação e controle de acesso baseado em função.',
  api_endpoint = '/api/v2/cmdb/user/fsso'
WHERE code = 'auth-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Sem SAML, não é possível integrar com provedores de identidade modernos (Azure AD, Okta), dificultando a gestão centralizada de identidades.',
  business_impact = 'Impossibilidade de usar SSO corporativo para acesso ao firewall, aumentando a carga de gestão de credenciais e reduzindo a experiência do usuário.',
  api_endpoint = '/api/v2/cmdb/user/saml'
WHERE code = 'auth-004' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Backup
UPDATE compliance_rules SET 
  technical_risk = 'Sem backup automático, uma falha catastrófica ou erro de configuração pode resultar em perda total das configurações do firewall.',
  business_impact = 'Tempo de recuperação estendido após incidentes, podendo levar horas ou dias para reconfigurar o firewall manualmente, afetando a continuidade do negócio.',
  api_endpoint = '/api/v2/cmdb/system/automation-stitch'
WHERE code = 'bkp-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Rede
UPDATE compliance_rules SET 
  technical_risk = 'Regras Any-Any eliminam o princípio do menor privilégio, permitindo qualquer tráfego entre zonas sem inspeção ou restrição.',
  business_impact = 'Movimentação lateral irrestrita de atacantes após comprometimento inicial, facilitando propagação de ransomware e exfiltração de dados sensíveis.',
  api_endpoint = '/api/v2/cmdb/firewall/policy'
WHERE code = 'net-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: VPN
UPDATE compliance_rules SET 
  technical_risk = 'IPsec com criptografia fraca (DES, 3DES) ou hashes vulneráveis (MD5, SHA1) pode ter o túnel comprometido por ataques de força bruta ou criptoanálise.',
  business_impact = 'Tráfego VPN pode ser interceptado e decifrado, expondo dados confidenciais transmitidos entre sites ou por usuários remotos.',
  api_endpoint = '/api/v2/cmdb/vpn.ipsec/phase1-interface'
WHERE code = 'vpn-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'VPN SSL com configurações fracas (versões antigas de TLS, cifras inseguras) é vulnerável a ataques como POODLE, BEAST ou downgrade.',
  business_impact = 'Credenciais e dados de usuários remotos podem ser interceptados, comprometendo o acesso remoto seguro da organização.',
  api_endpoint = '/api/v2/cmdb/vpn.ssl/settings'
WHERE code = 'vpn-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Licenciamento
UPDATE compliance_rules SET 
  technical_risk = 'Sem contrato FortiCare ativo, não há acesso a atualizações de firmware, patches de segurança ou suporte técnico da Fortinet.',
  business_impact = 'Vulnerabilidades descobertas não podem ser corrigidas, aumentando exponencialmente o risco de exploração e comprometimento do perímetro.',
  api_endpoint = '/api/v2/monitor/license/status'
WHERE code = 'lic-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Sem licenças FortiGuard ativas, assinaturas de IPS, antivírus, web filter e outras proteções não são atualizadas com novas ameaças.',
  business_impact = 'Proteção contra ameaças emergentes (zero-days, novos malwares, URLs maliciosas) fica desatualizada, aumentando a superfície de ataque.',
  api_endpoint = '/api/v2/monitor/license/status'
WHERE code = 'lic-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Logging
UPDATE compliance_rules SET 
  technical_risk = 'Sem logging de eventos, não há visibilidade sobre tentativas de ataque, violações de política ou comportamento anômalo na rede.',
  business_impact = 'Impossibilidade de investigar incidentes de segurança, atender requisitos de compliance e identificar a origem de comprometimentos.',
  api_endpoint = '/api/v2/cmdb/log/setting'
WHERE code = 'log-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Logs apenas locais podem ser perdidos em caso de falha do equipamento ou apagados por atacantes para encobrir rastros.',
  business_impact = 'Perda de evidências forenses e trilha de auditoria, dificultando resposta a incidentes e demonstração de conformidade regulatória.',
  api_endpoint = '/api/v2/cmdb/log.syslogd/setting'
WHERE code = 'log-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: UTM
UPDATE compliance_rules SET 
  technical_risk = 'Sem Web Filter, usuários podem acessar sites maliciosos que distribuem malware, phishing ou conteúdo que viola políticas corporativas.',
  business_impact = 'Maior exposição a malware via navegação web, downloads maliciosos e perda de produtividade por acesso a conteúdo não relacionado ao trabalho.',
  api_endpoint = '/api/v2/cmdb/webfilter/profile'
WHERE code = 'utm-004' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Sem Application Control, aplicações de risco (P2P, proxies anônimos, ferramentas de hacking) podem operar livremente na rede.',
  business_impact = 'Shadow IT e aplicações não autorizadas podem causar vazamento de dados, consumo excessivo de banda e violações de conformidade.',
  api_endpoint = '/api/v2/cmdb/application/list'
WHERE code = 'utm-007' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Sem Antivírus no gateway, malware conhecido pode entrar na rede via downloads, anexos de email ou transferências de arquivos.',
  business_impact = 'Infecção de endpoints, propagação de ransomware e comprometimento de dados sensíveis por malware que poderia ser bloqueado no perímetro.',
  api_endpoint = '/api/v2/cmdb/antivirus/profile'
WHERE code = 'utm-009' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Políticas de Segurança
UPDATE compliance_rules SET 
  technical_risk = 'Sem strong-crypto, o firewall pode aceitar cifras fracas e protocolos obsoletos (SSLv3, TLS 1.0) vulneráveis a ataques conhecidos.',
  business_impact = 'Comunicações administrativas e de gestão podem ser interceptadas, permitindo captura de credenciais de administrador.',
  api_endpoint = '/api/v2/cmdb/system/global'
WHERE code = 'sec-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Sem 2FA, credenciais de administrador comprometidas (phishing, keylogger, reutilização) dão acesso total ao firewall.',
  business_impact = 'Atacante com acesso administrativo pode desabilitar proteções, criar backdoors e comprometer toda a infraestrutura de segurança.',
  api_endpoint = '/api/v2/cmdb/system/admin'
WHERE code = 'sec-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Timeout muito longo mantém sessões administrativas ativas, permitindo uso não autorizado de terminais deixados logados.',
  business_impact = 'Risco de acesso não autorizado por terceiros que encontrem sessões administrativas abandonadas em terminais desatendidos.',
  api_endpoint = '/api/v2/cmdb/system/global'
WHERE code = 'sec-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Regras de Entrada
UPDATE compliance_rules SET 
  technical_risk = 'Regras de entrada sem restrição de IP de origem permitem que qualquer endereço da internet acesse serviços internos publicados.',
  business_impact = 'Serviços expostos ficam vulneráveis a ataques de força bruta, exploits e varreduras de toda a internet, não apenas de IPs legítimos.',
  api_endpoint = '/api/v2/cmdb/firewall/policy'
WHERE code = 'inb-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'RDP exposto é alvo prioritário de ataques de força bruta e exploits (BlueKeep, DejaBlue), sendo vetor comum de ransomware.',
  business_impact = 'Comprometimento via RDP frequentemente resulta em ransomware enterprise-wide, exfiltração de dados e paralisação completa das operações.',
  api_endpoint = '/api/v2/cmdb/firewall/policy'
WHERE code = 'inb-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'SMB/CIFS exposto permite exploração de vulnerabilidades críticas (EternalBlue, MS17-010) e propagação de ransomware como WannaCry.',
  business_impact = 'Acesso direto a compartilhamentos de arquivo pode resultar em roubo massivo de dados, criptografia de arquivos corporativos e paralisação.',
  api_endpoint = '/api/v2/cmdb/firewall/policy'
WHERE code = 'inb-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Sem IPS/IDS, tráfego malicioso (exploits, ataques conhecidos, comportamento anômalo) passa despercebido pelo firewall.',
  business_impact = 'Ataques de exploração de vulnerabilidades em serviços publicados não são detectados ou bloqueados, facilitando comprometimento.',
  api_endpoint = '/api/v2/cmdb/ips/sensor'
WHERE code = 'utm-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- FortiGate: Interfaces
UPDATE compliance_rules SET 
  technical_risk = 'HTTP em interfaces externas transmite dados administrativos (credenciais, configurações) em texto claro, vulnerável a interceptação.',
  business_impact = 'Credenciais de administrador podem ser capturadas em trânsito, permitindo acesso total ao firewall por atacantes na rede.',
  api_endpoint = '/api/v2/cmdb/system/interface'
WHERE code = 'int-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'Telnet transmite comandos e credenciais em texto claro, sendo facilmente capturado por sniffers ou ataques MITM.',
  business_impact = 'Comandos administrativos e senhas podem ser interceptados, comprometendo a segurança de toda a infraestrutura de rede.',
  api_endpoint = '/api/v2/cmdb/system/interface'
WHERE code = 'int-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';