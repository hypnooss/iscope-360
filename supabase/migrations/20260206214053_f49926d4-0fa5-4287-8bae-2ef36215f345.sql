
-- Populate correction guides for SonicWall template
-- Category: Alta Disponibilidade
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Cluster de Alta Disponibilidade (HA)',
  'Configuração que permite dois firewalls SonicWall trabalharem juntos para failover automático.',
  'Sem alta disponibilidade, uma falha no firewall causa queda total da conectividade de rede.',
  '["Indisponibilidade total da rede em caso de falha", "Interrupção de VPNs e acesso à internet", "Tempo de inatividade prolongado"]'::jsonb,
  '["Adquira um segundo SonicWall do mesmo modelo", "Conecte os firewalls via interface HA dedicada", "Acesse High Availability na GUI", "Configure modo Active/Standby ou Stateful HA", "Sincronize licenças e configurações"]'::jsonb,
  'high',
  '2-4 horas',
  '["SonicOS GUI", "SonicWall Documentation"]'::jsonb
FROM compliance_rules WHERE code = 'ha-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Atualizações e Firmware
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Atualização de Firmware SonicOS',
  'O sistema operacional do SonicWall que recebe correções de segurança e melhorias.',
  'Firmware desatualizado pode conter vulnerabilidades conhecidas que permitem invasão remota.',
  '["Vulnerabilidades podem ser exploradas", "Risco de ransomware e acesso não autorizado", "Perda de suporte do fabricante"]'::jsonb,
  '["Acesse Settings > Firmware & Backups", "Verifique a versão atual do SonicOS", "Baixe o firmware mais recente do MySonicWall", "Faça backup da configuração antes de atualizar", "Upload e instale o novo firmware"]'::jsonb,
  'medium',
  '1-2 horas',
  '["MySonicWall Portal", "SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'fw-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Backup e Recovery
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Backup Automático de Configuração',
  'Agendamento que salva automaticamente a configuração do firewall em local externo.',
  'Sem backup, uma falha pode resultar em perda total e recuperação manual demorada.',
  '["Perda total de configurações em caso de falha", "Horas para reconfigurar manualmente", "Interrupção prolongada dos serviços"]'::jsonb,
  '["Acesse Settings > Firmware & Backups", "Configure backup automático para FTP/SCP", "Defina frequência (diária/semanal)", "Configure retenção de backups", "Teste restauração do backup"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI", "FTP Server"]'::jsonb
FROM compliance_rules WHERE code = 'bkp-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Configuração de Rede
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Eliminação de Regras Any-Any',
  'Regras de firewall que permitem qualquer origem, destino e serviço indiscriminadamente.',
  'Regras Any-Any eliminam a proteção do firewall, permitindo qualquer tráfego sem restrição.',
  '["Movimentação lateral irrestrita de atacantes", "Propagação facilitada de ransomware", "Violação de compliance"]'::jsonb,
  '["Identifique regras Any-Any em Rules and Policies > Access Rules", "Analise os logs para entender o tráfego real", "Crie regras específicas para cada fluxo necessário", "Defina origem, destino e serviços explicitamente", "Remova a regra Any-Any original"]'::jsonb,
  'high',
  '2-4 horas',
  '["SonicOS GUI", "Analyzer"]'::jsonb
FROM compliance_rules WHERE code = 'net-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Licenciamento
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Renovação do Suporte SonicWall',
  'Contrato que dá acesso a atualizações de firmware, patches e suporte técnico.',
  'Sem contrato ativo, não há acesso a correções de segurança e o equipamento fica vulnerável.',
  '["Sem acesso a atualizações de segurança", "Vulnerabilidades não podem ser corrigidas", "Sem suporte técnico"]'::jsonb,
  '["Verifique o status em Settings > Licenses", "Acesse o portal MySonicWall", "Contate seu revendedor SonicWall", "Obtenha cotação para renovação", "Aplique a nova licença no firewall"]'::jsonb,
  'low',
  '1-2 dias (processo comercial)',
  '["MySonicWall Portal", "SonicWall Partner"]'::jsonb
FROM compliance_rules WHERE code = 'lic-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Renovação das Licenças de Segurança',
  'Licenças de serviços como Gateway Anti-Virus, IPS, Content Filtering e App Control.',
  'Sem licenças ativas, as assinaturas não são atualizadas e novas ameaças passam despercebidas.',
  '["Proteção contra novas ameaças desatualizada", "IPS não detecta exploits recentes", "Antivírus desatualizado"]'::jsonb,
  '["Verifique licenças em Settings > Licenses", "Identifique quais serviços estão expirados", "Contate seu revendedor SonicWall", "Aplique as novas licenças", "Aguarde atualização das assinaturas"]'::jsonb,
  'low',
  '1-2 dias (processo comercial)',
  '["MySonicWall Portal", "SonicWall Partner"]'::jsonb
FROM compliance_rules WHERE code = 'lic-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Logging e Monitoramento
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Habilitação de Logging de Eventos',
  'Registro de eventos de segurança e tráfego para auditoria e investigação.',
  'Sem logging, não há visibilidade sobre ataques ou comportamento anômalo na rede.',
  '["Impossibilidade de investigar incidentes", "Ataques passam despercebidos", "Dificuldade em troubleshooting"]'::jsonb,
  '["Acesse Device > Log > Settings", "Habilite logging para categorias de segurança", "Configure nível de log adequado", "Nas regras de acesso, habilite Logging", "Verifique espaço para logs locais"]'::jsonb,
  'low',
  '15 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'log-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Envio de Logs para Syslog',
  'Encaminhar logs para servidor Syslog ou SIEM para armazenamento seguro.',
  'Logs apenas locais podem ser perdidos em falhas ou apagados por atacantes.',
  '["Perda de evidências em caso de falha", "Logs podem ser apagados", "Sem análise correlacionada"]'::jsonb,
  '["Acesse Device > Log > Syslog", "Configure IP do servidor Syslog", "Defina porta e facility", "Selecione categorias de log a enviar", "Teste verificando logs no servidor"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI", "Splunk", "Elastic"]'::jsonb
FROM compliance_rules WHERE code = 'log-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Perfis UTM
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Content Filter em Tráfego de Saída',
  'Perfil que bloqueia acesso a sites maliciosos e categorias de conteúdo não permitidas.',
  'Sem filtro web, usuários podem acessar sites que distribuem malware ou violam políticas.',
  '["Infecção por malware via sites maliciosos", "Phishing e roubo de credenciais", "Acesso a conteúdo inadequado"]'::jsonb,
  '["Acesse Security Services > Content Filter", "Configure categorias a bloquear", "Crie políticas de CFS por grupo de usuários", "Aplique nas regras de acesso de saída", "Monitore logs para ajustes"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'utm-004' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'App Control em Tráfego de Saída',
  'Perfil que identifica e controla aplicações como P2P, proxies e ferramentas de risco.',
  'Sem Application Control, aplicações não autorizadas podem operar livremente.',
  '["Shadow IT e apps não autorizadas", "Vazamento de dados", "Consumo excessivo de banda"]'::jsonb,
  '["Acesse Security Services > App Control", "Configure políticas para categorias de risco", "Bloqueie P2P, Proxy, Remote Access", "Aplique nas regras de saída", "Monitore logs para identificar apps"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'utm-007' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Gateway Anti-Virus',
  'Inspeção de arquivos no perímetro para bloquear malware antes de chegar aos endpoints.',
  'Sem antivírus no gateway, malware conhecido pode entrar na rede via downloads.',
  '["Infecção de endpoints", "Propagação de ransomware", "Comprometimento de dados"]'::jsonb,
  '["Acesse Security Services > Gateway Anti-Virus", "Habilite GAV para protocolos (HTTP, FTP, SMTP)", "Configure ação como Block", "Aplique nas regras de acesso", "Verifique que assinaturas estão atualizadas"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'utm-009' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Políticas de Segurança
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Habilitação de Criptografia Forte',
  'Configuração que força uso de algoritmos modernos e desabilita cifras fracas.',
  'Sem criptografia forte, o firewall aceita cifras vulneráveis que podem ser exploradas.',
  '["Comunicações podem ser interceptadas", "Ataques de downgrade possíveis"]'::jsonb,
  '["Acesse Settings > Administration", "Habilite SSL/TLS com versão mínima TLS 1.2", "Desabilite cifras fracas", "Teste acesso administrativo após a mudança"]'::jsonb,
  'low',
  '15 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'sec-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Autenticação de Dois Fatores para Admins',
  'Exigir um segundo fator além da senha para login administrativo.',
  'Sem 2FA, credenciais comprometidas dão acesso total ao firewall.',
  '["Acesso não autorizado ao firewall", "Proteções podem ser desabilitadas", "Comprometimento total"]'::jsonb,
  '["Acesse Settings > Administration > One-Time Password", "Configure TOTP para administradores", "Use app autenticador (Google Authenticator, etc.)", "Teste login com 2FA habilitado"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI", "Google Authenticator"]'::jsonb
FROM compliance_rules WHERE code = 'sec-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Timeout de Sessão Administrativa',
  'Tempo limite após o qual sessões inativas são encerradas automaticamente.',
  'Timeout longo permite que sessões abandonadas sejam usadas por terceiros.',
  '["Acesso não autorizado via terminal abandonado", "Risco de alterações maliciosas"]'::jsonb,
  '["Acesse Settings > Administration", "Configure Inactivity Timeout para 15-30 minutos", "Teste que a sessão expira corretamente"]'::jsonb,
  'low',
  '5 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'sec-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Regras de Entrada
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Restrição de IPs de Origem',
  'Limitar quais endereços IP podem acessar serviços publicados.',
  'Sem restrição, qualquer IP da internet pode tentar acessar os serviços.',
  '["Ataques de força bruta", "Maior exposição a exploits", "Varreduras constantes"]'::jsonb,
  '["Identifique regras inbound em Rules and Policies", "Para cada regra, defina Source específico", "Crie objetos de endereço para IPs autorizados", "Nunca use Any como origem em regras públicas"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'inb-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Bloqueio de RDP Exposto',
  'Remote Desktop (porta 3389) nunca deve ser acessível diretamente da internet.',
  'RDP exposto é alvo prioritário de ataques e vetor comum de ransomware.',
  '["Ransomware via RDP comprometido", "Força bruta automatizada", "Exploits conhecidos"]'::jsonb,
  '["Identifique regras que permitem porta 3389", "Remova ou desabilite essas regras", "Implemente acesso via VPN", "Use bastion host se necessário"]'::jsonb,
  'medium',
  '1 hora',
  '["SonicOS GUI", "SonicWall VPN"]'::jsonb
FROM compliance_rules WHERE code = 'inb-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Bloqueio de SMB Exposto',
  'Portas de compartilhamento (445, 139) nunca devem ser acessíveis da internet.',
  'SMB exposto permite exploração de vulnerabilidades críticas como EternalBlue.',
  '["Propagação de ransomware", "Exploits críticos", "Roubo massivo de dados"]'::jsonb,
  '["Verifique regras que permitem portas 445/139", "Bloqueie imediatamente essas portas", "SMB só deve ser acessível via VPN"]'::jsonb,
  'low',
  '15 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'inb-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'IPS/IDS em Tráfego de Entrada',
  'Sistema de prevenção de intrusões que detecta e bloqueia ataques.',
  'Sem IPS, exploits e ataques conhecidos passam despercebidos.',
  '["Exploits não são detectados", "Ataques têm sucesso", "Serviços comprometidos"]'::jsonb,
  '["Acesse Security Services > Intrusion Prevention", "Habilite IPS para tráfego inbound", "Configure ação como Prevent", "Aplique em regras de entrada WAN", "Monitore logs de IPS"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'utm-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Segurança de Interfaces
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Desabilitar HTTP em Interfaces Externas',
  'Acesso administrativo via HTTP transmite dados sem criptografia.',
  'HTTP permite captura de credenciais de administrador por atacantes.',
  '["Credenciais em texto claro", "Sessões podem ser sequestradas"]'::jsonb,
  '["Acesse Settings > Administration", "Desabilite HTTP Management", "Mantenha apenas HTTPS", "Teste acesso via HTTPS"]'::jsonb,
  'low',
  '10 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'int-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Restringir HTTPS em Interfaces Externas',
  'Limitar acesso HTTPS apenas a IPs de gerenciamento confiáveis.',
  'HTTPS exposto permite ataques de força bruta contra a interface de admin.',
  '["Ataques de força bruta", "Exploits na interface", "Tentativas de acesso não autorizado"]'::jsonb,
  '["Desabilite HTTPS Management na interface WAN se possível", "Se necessário, restrinja a IPs específicos", "Use VPN para acesso remoto", "Configure regras de acesso restritivas"]'::jsonb,
  'medium',
  '30 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'int-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Restringir SSH em Interfaces Externas',
  'SSH exposto permite ataques de força bruta contra a autenticação.',
  'Atacantes podem comprometer o acesso administrativo via SSH exposto.',
  '["Ataques de força bruta SSH", "Tentativas de login automatizadas"]'::jsonb,
  '["Desabilite SSH Management na interface WAN", "Se necessário, restrinja a IPs específicos", "Use VPN para acesso SSH remoto"]'::jsonb,
  'medium',
  '20 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'int-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Restringir SNMP em Interfaces Externas',
  'SNMP pode expor informações de configuração e deve ser restrito.',
  'SNMP em interfaces externas permite enumeração de informações sensíveis.',
  '["Exposição de informações", "Planejamento de ataques direcionados"]'::jsonb,
  '["Desabilite SNMP em interfaces WAN", "Restrinja à rede de gerenciamento", "Use SNMPv3 com autenticação"]'::jsonb,
  'low',
  '15 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'int-004' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Desabilitar ICMP Ping em Interfaces Externas',
  'Responder a ping permite descoberta e fingerprinting do firewall.',
  'ICMP habilitado facilita identificação do firewall por atacantes.',
  '["Descoberta do firewall", "Fingerprinting do dispositivo"]'::jsonb,
  '["Acesse Network > Interfaces", "Desabilite Ping em interfaces WAN", "Permita ping apenas de IPs de monitoramento se necessário"]'::jsonb,
  'low',
  '5 min',
  '["SonicOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'int-005' AND device_type_id = (SELECT id FROM device_types WHERE code = 'sonicwall')
ON CONFLICT (rule_id) DO NOTHING;
