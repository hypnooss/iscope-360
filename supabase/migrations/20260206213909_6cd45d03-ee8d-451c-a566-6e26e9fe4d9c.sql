
-- Populate correction guides for FortiGate template
-- Category: Alta Disponibilidade
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Cluster de Alta Disponibilidade (HA)',
  'Configuração que permite dois firewalls trabalharem juntos, onde um assume automaticamente se o outro falhar.',
  'Sem alta disponibilidade, uma falha no firewall causa queda total da conectividade de rede, afetando todos os serviços.',
  '["Indisponibilidade total da rede em caso de falha", "Interrupção de VPNs, acesso à internet e serviços críticos", "Tempo de inatividade prolongado até substituição manual"]'::jsonb,
  '["Adquira um segundo FortiGate do mesmo modelo", "Conecte os firewalls via interfaces dedicadas de heartbeat", "Configure HA no System > HA com modo active-passive", "Defina prioridade do dispositivo primário (maior número = primário)", "Sincronize as configurações entre os dispositivos"]'::jsonb,
  'high',
  '2-4 horas',
  '["FortiGate CLI", "FortiOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'ha-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Sincronização de Sessões em HA',
  'Recurso que mantém as conexões ativas durante uma troca de firewall primário para secundário.',
  'Sem sincronização, todas as conexões são perdidas durante failover, causando desconexões e timeout em aplicações.',
  '["Usuários perdem conexões ativas durante failover", "Transferências de arquivos são interrompidas", "Videoconferências e chamadas VoIP são desconectadas"]'::jsonb,
  '["Acesse System > HA no FortiGate primário", "Habilite Session Pickup (config system ha → set session-pickup enable)", "Verifique que a interface de heartbeat tem banda suficiente", "Teste com um failover controlado para validar"]'::jsonb,
  'low',
  '15 min',
  '["FortiGate CLI", "FortiOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'ha-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Links Redundantes de Heartbeat',
  'Múltiplas interfaces dedicadas para comunicação entre os firewalls do cluster HA.',
  'Com apenas um link de heartbeat, uma falha nessa interface pode causar split-brain, onde ambos os firewalls tentam ser primários.',
  '["Split-brain causa conflito de IPs e queda total", "Corrupção de tabelas ARP na rede", "Loops de roteamento e instabilidade", "Recuperação exige intervenção manual"]'::jsonb,
  '["Configure pelo menos 2 interfaces de heartbeat em System > HA", "Use interfaces dedicadas (não compartilhadas com tráfego de dados)", "Conecte as interfaces diretamente entre os firewalls ou via switch dedicado", "Defina prioridade das interfaces de heartbeat (hbdev)"]'::jsonb,
  'medium',
  '30 min',
  '["FortiGate CLI", "FortiOS GUI"]'::jsonb
FROM compliance_rules WHERE code = 'ha-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Atualizações e Firmware
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Atualização de Firmware FortiOS',
  'O sistema operacional do firewall que recebe correções de segurança e novas funcionalidades periodicamente.',
  'Firmware desatualizado pode conter vulnerabilidades conhecidas que permitem invasão remota do firewall.',
  '["Vulnerabilidades conhecidas podem ser exploradas", "Risco de ransomware e acesso não autorizado", "Comprometimento total do perímetro de segurança", "Perda de suporte do fabricante"]'::jsonb,
  '["Verifique a versão atual em System > Firmware", "Consulte o Upgrade Path Tool da Fortinet para sequência correta", "Faça backup completo antes de atualizar", "Agende a atualização para janela de manutenção", "Baixe o firmware do support.fortinet.com", "Aplique via System > Firmware > Upload"]'::jsonb,
  'medium',
  '1-2 horas',
  '["FortiGate GUI", "support.fortinet.com"]'::jsonb
FROM compliance_rules WHERE code = 'fw-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Autenticação
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Criptografia na Conexão LDAP',
  'Usar LDAPS ou STARTTLS para proteger a comunicação entre o firewall e o servidor de diretórios.',
  'LDAP sem criptografia transmite senhas em texto claro, permitindo captura por atacantes na rede.',
  '["Credenciais podem ser interceptadas na rede", "Acesso não autorizado a sistemas críticos", "Violação de compliance (LGPD, PCI-DSS)"]'::jsonb,
  '["Acesse User & Authentication > LDAP Servers", "Altere a porta de 389 para 636 (LDAPS)", "Habilite Secure Connection", "Importe o certificado CA do servidor LDAP", "Teste a conexão com as novas configurações"]'::jsonb,
  'medium',
  '30 min',
  '["Active Directory", "OpenLDAP"]'::jsonb
FROM compliance_rules WHERE code = 'auth-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Servidor RADIUS Redundante',
  'Configurar um servidor RADIUS secundário para garantir autenticação mesmo se o primário falhar.',
  'Sem redundância, a indisponibilidade do servidor RADIUS impede login de todos os usuários.',
  '["Usuários não conseguem autenticar", "VPN e acesso Wi-Fi ficam indisponíveis", "Operações críticas são interrompidas"]'::jsonb,
  '["Acesse User & Authentication > RADIUS Servers", "Configure um servidor secundário com IP diferente", "Defina timeout adequado (5-10 segundos)", "Use secrets fortes e diferentes para cada servidor", "Teste failover desabilitando temporariamente o primário"]'::jsonb,
  'medium',
  '30 min',
  '["Windows NPS", "FreeRADIUS", "FortiAuthenticator"]'::jsonb
FROM compliance_rules WHERE code = 'auth-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Single Sign-On com Fortinet (FSSO)',
  'Integração que identifica usuários automaticamente pelo login no Windows/AD, sem exigir autenticação adicional.',
  'Sem FSSO, políticas baseadas em usuário/grupo não funcionam, limitando o controle de acesso.',
  '["Impossibilidade de criar regras por usuário/grupo", "Usuários precisam autenticar manualmente", "Menor granularidade no controle de acesso"]'::jsonb,
  '["Instale o FSSO Collector Agent no servidor AD", "Configure o agente com as credenciais de leitura do AD", "No FortiGate, acesse Security Fabric > External Connectors", "Adicione o agente FSSO com IP e senha", "Crie grupos de usuários referenciando grupos do AD"]'::jsonb,
  'high',
  '2-3 horas',
  '["Active Directory", "FortiAuthenticator"]'::jsonb
FROM compliance_rules WHERE code = 'auth-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Autenticação SAML para SSO',
  'Protocolo que permite login único usando provedores de identidade como Azure AD ou Okta.',
  'Sem SAML, não é possível usar autenticação corporativa centralizada para acesso ao firewall.',
  '["Gestão descentralizada de credenciais", "Usuários precisam de senhas separadas", "Impossibilidade de usar MFA corporativo"]'::jsonb,
  '["Registre o FortiGate como aplicação no seu IdP (Azure AD, Okta)", "Obtenha o metadata XML do IdP", "No FortiGate, acesse User & Authentication > Single Sign-On", "Importe o metadata e configure o Service Provider", "Teste o login SSO com um usuário piloto"]'::jsonb,
  'high',
  '1-2 horas',
  '["Azure AD", "Okta", "OneLogin"]'::jsonb
FROM compliance_rules WHERE code = 'auth-004' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Backup e Recovery
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Backup Automático de Configuração',
  'Agendamento que salva automaticamente a configuração do firewall em local externo (FTP, SFTP, email).',
  'Sem backup, uma falha ou erro de configuração pode resultar em perda total e recuperação manual demorada.',
  '["Perda total de configurações em caso de falha", "Horas ou dias para reconfigurar manualmente", "Interrupção prolongada dos serviços de rede"]'::jsonb,
  '["Acesse Security Fabric > Automation", "Crie um novo Automation Stitch", "Configure trigger agendado (diário ou semanal)", "Adicione ação de backup-config para FTP/SFTP externo", "Teste executando o stitch manualmente", "Valide que o backup foi salvo no destino"]'::jsonb,
  'medium',
  '30 min',
  '["FTP Server", "SFTP", "FortiManager"]'::jsonb
FROM compliance_rules WHERE code = 'bkp-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Configuração de Rede
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Eliminação de Regras Any-Any',
  'Regras de firewall que permitem qualquer origem, destino e serviço, violando o princípio do menor privilégio.',
  'Regras Any-Any eliminam a proteção do firewall, permitindo qualquer tráfego sem inspeção ou restrição.',
  '["Movimentação lateral irrestrita de atacantes", "Propagação facilitada de ransomware", "Exfiltração de dados sem detecção", "Violação de compliance"]'::jsonb,
  '["Identifique as regras Any-Any em Policy & Objects > Firewall Policy", "Analise os logs para entender o tráfego real", "Crie regras específicas para cada fluxo necessário", "Defina origem, destino e serviços explicitamente", "Habilite logging nas novas regras", "Remova ou desabilite a regra Any-Any original"]'::jsonb,
  'high',
  '2-4 horas',
  '["FortiGate GUI", "FortiAnalyzer"]'::jsonb
FROM compliance_rules WHERE code = 'net-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Configuração VPN
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Criptografia Forte em VPN IPsec',
  'Usar algoritmos modernos (AES-256) e hashes seguros (SHA-256) nos túneis VPN.',
  'Criptografia fraca pode ser quebrada, permitindo interceptação de todo o tráfego VPN.',
  '["Dados VPN podem ser decifrados", "Credenciais e informações sensíveis expostas", "Comunicação entre sites comprometida"]'::jsonb,
  '["Acesse VPN > IPsec Tunnels e edite o túnel", "Na Phase 1, altere Encryption para AES256", "Altere Authentication para SHA256 ou SHA512", "Na Phase 2, repita as configurações de criptografia", "Coordene a mudança com o peer VPN remoto", "Teste a reconexão do túnel"]'::jsonb,
  'medium',
  '30 min',
  '["FortiGate", "Cisco ASA", "Palo Alto"]'::jsonb
FROM compliance_rules WHERE code = 'vpn-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'TLS Moderno em VPN SSL',
  'Desabilitar versões antigas e inseguras de TLS (1.0 e 1.1) na VPN SSL.',
  'TLS 1.0 e 1.1 têm vulnerabilidades conhecidas que permitem ataques de downgrade e interceptação.',
  '["Credenciais VPN podem ser interceptadas", "Ataques POODLE, BEAST exploráveis", "Dados de usuários remotos expostos"]'::jsonb,
  '["Acesse VPN > SSL-VPN Settings", "Em SSL/TLS Version, selecione TLS 1.2 ou superior", "Verifique que clientes VPN suportam TLS 1.2+", "Atualize FortiClient nos endpoints se necessário", "Teste conexão após a mudança"]'::jsonb,
  'low',
  '15 min',
  '["FortiClient", "Browser-based VPN"]'::jsonb
FROM compliance_rules WHERE code = 'vpn-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Licenciamento
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Renovação do Contrato FortiCare',
  'Contrato de suporte que dá acesso a atualizações de firmware, patches de segurança e suporte técnico.',
  'Sem FortiCare, não há acesso a correções de vulnerabilidades e o equipamento fica desprotegido.',
  '["Sem acesso a atualizações de segurança", "Vulnerabilidades não podem ser corrigidas", "Sem suporte técnico do fabricante", "Risco crescente de exploração"]'::jsonb,
  '["Verifique o status em System > FortiGuard", "Contate seu parceiro Fortinet ou revendedor", "Obtenha cotação para renovação do FortiCare", "Registre o novo contrato no support.fortinet.com", "Aplique a licença no firewall"]'::jsonb,
  'low',
  '1-2 dias (processo comercial)',
  '["Fortinet Partner", "support.fortinet.com"]'::jsonb
FROM compliance_rules WHERE code = 'lic-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Renovação das Licenças FortiGuard',
  'Licenças de serviços de segurança (IPS, Antivírus, Web Filter, App Control) que precisam de renovação anual.',
  'Sem licenças ativas, as assinaturas de ameaças não são atualizadas e novas ameaças passam despercebidas.',
  '["Proteção contra novas ameaças desatualizada", "IPS não detecta exploits recentes", "Antivírus não reconhece novos malwares", "Web Filter com categorias desatualizadas"]'::jsonb,
  '["Verifique licenças expiradas em System > FortiGuard", "Identifique quais serviços precisam renovação", "Contate seu parceiro Fortinet", "Aplique as novas licenças no firewall", "Aguarde atualização automática das assinaturas"]'::jsonb,
  'low',
  '1-2 dias (processo comercial)',
  '["Fortinet Partner", "support.fortinet.com"]'::jsonb
FROM compliance_rules WHERE code = 'lic-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Logging e Monitoramento
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Habilitação de Logging de Eventos',
  'Registro de eventos de segurança, tráfego e sistema para auditoria e investigação de incidentes.',
  'Sem logging, não há visibilidade sobre ataques, violações de política ou comportamento anômalo.',
  '["Impossibilidade de investigar incidentes", "Sem evidências para compliance", "Ataques passam despercebidos", "Dificuldade em troubleshooting"]'::jsonb,
  '["Acesse Log & Report > Log Settings", "Habilite logging para Traffic, Event e Security", "Nas políticas de firewall, habilite Log Allowed Traffic", "Configure severidade mínima como Information ou Notice", "Verifique espaço em disco para logs locais"]'::jsonb,
  'low',
  '15 min',
  '["FortiGate GUI", "FortiAnalyzer"]'::jsonb
FROM compliance_rules WHERE code = 'log-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Envio de Logs para Servidor Externo',
  'Encaminhar logs para FortiAnalyzer, FortiCloud ou SIEM para armazenamento seguro e análise.',
  'Logs apenas locais podem ser perdidos em falhas ou apagados por atacantes para encobrir rastros.',
  '["Perda de evidências em caso de falha", "Atacantes podem apagar logs locais", "Sem trilha de auditoria confiável", "Dificuldade em análise correlacionada"]'::jsonb,
  '["Acesse Log & Report > Log Settings", "Configure FortiAnalyzer ou Syslog com IP do servidor", "Defina porta e protocolo (UDP 514 ou TCP 514)", "Habilite reliable delivery se disponível", "Teste enviando um evento e verificando no destino"]'::jsonb,
  'medium',
  '30 min',
  '["FortiAnalyzer", "FortiCloud", "Splunk", "Elastic"]'::jsonb
FROM compliance_rules WHERE code = 'log-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Perfis UTM
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Filtro Web em Tráfego de Saída',
  'Perfil que bloqueia acesso a sites maliciosos, phishing e categorias de conteúdo não permitidas.',
  'Sem Web Filter, usuários podem acessar sites que distribuem malware ou violam políticas corporativas.',
  '["Infecção por malware via sites maliciosos", "Phishing e roubo de credenciais", "Acesso a conteúdo inadequado", "Perda de produtividade"]'::jsonb,
  '["Acesse Security Profiles > Web Filter", "Crie ou edite um perfil", "Configure categorias a bloquear (Malware, Phishing, etc.)", "Aplique o perfil nas políticas de saída (LAN→WAN)", "Habilite FortiGuard Category Filtering", "Monitore logs para ajustar categorias"]'::jsonb,
  'medium',
  '30 min',
  '["FortiGuard", "FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'utm-004' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Controle de Aplicações',
  'Perfil que identifica e controla aplicações como P2P, proxies anônimos e ferramentas de risco.',
  'Sem Application Control, aplicações não autorizadas podem operar livremente, causando riscos.',
  '["Shadow IT e aplicações não autorizadas", "Vazamento de dados por apps de compartilhamento", "Consumo excessivo de banda", "Ferramentas de hacking na rede"]'::jsonb,
  '["Acesse Security Profiles > Application Control", "Crie ou edite um perfil", "Defina ações para categorias (Block: P2P, Proxy, etc.)", "Aplique o perfil nas políticas de saída", "Monitore logs para identificar aplicações", "Ajuste conforme necessidades do negócio"]'::jsonb,
  'medium',
  '30 min',
  '["FortiGuard", "FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'utm-007' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Antivírus de Gateway',
  'Inspeção de arquivos e downloads no perímetro para bloquear malware antes de chegar aos endpoints.',
  'Sem antivírus no gateway, malware conhecido pode entrar na rede via downloads e transferências.',
  '["Infecção de endpoints por malware", "Propagação de ransomware", "Comprometimento de dados sensíveis"]'::jsonb,
  '["Acesse Security Profiles > AntiVirus", "Crie ou edite um perfil", "Habilite inspeção para HTTP, HTTPS, FTP, SMTP", "Configure ação como Block para vírus detectados", "Aplique o perfil nas políticas de saída", "Verifique que SSL Inspection está habilitado"]'::jsonb,
  'medium',
  '30 min',
  '["FortiGuard", "FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'utm-009' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Políticas de Segurança
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Habilitação de Criptografia Forte',
  'Configuração que força uso de algoritmos modernos e desabilita cifras fracas em todas as comunicações.',
  'Sem strong-crypto, o firewall aceita cifras vulneráveis que podem ser exploradas em ataques.',
  '["Comunicações podem ser interceptadas", "Credenciais de admin capturadas", "Ataques de downgrade possíveis"]'::jsonb,
  '["Acesse System > Settings via CLI", "Execute: config system global", "Execute: set strong-crypto enable", "Execute: end", "Verifique que clientes suportam TLS 1.2+", "Teste acesso administrativo após a mudança"]'::jsonb,
  'low',
  '10 min',
  '["FortiGate CLI"]'::jsonb
FROM compliance_rules WHERE code = 'sec-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Autenticação de Dois Fatores para Admins',
  'Exigir um segundo fator (token, app) além da senha para login administrativo.',
  'Sem 2FA, credenciais comprometidas dão acesso total ao firewall, permitindo desabilitar proteções.',
  '["Acesso não autorizado ao firewall", "Atacante pode criar backdoors", "Proteções podem ser desabilitadas", "Comprometimento total da segurança"]'::jsonb,
  '["Configure FortiToken ou FortiToken Mobile", "Acesse User & Authentication > FortiTokens", "Associe tokens aos administradores", "Em System > Administrators, habilite Two-factor Authentication", "Teste login com 2FA habilitado"]'::jsonb,
  'medium',
  '1 hora',
  '["FortiToken", "FortiToken Mobile", "FortiAuthenticator"]'::jsonb
FROM compliance_rules WHERE code = 'sec-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Timeout de Sessão Administrativa',
  'Tempo limite após o qual sessões administrativas inativas são encerradas automaticamente.',
  'Timeout longo permite que sessões abandonadas sejam usadas por terceiros não autorizados.',
  '["Acesso não autorizado via terminal abandonado", "Risco de alterações maliciosas", "Violação de políticas de segurança"]'::jsonb,
  '["Acesse System > Settings", "Configure Admin Session Timeout para 15-30 minutos", "Ou via CLI: config system global → set admintimeout 30", "Teste que a sessão expira após o tempo configurado"]'::jsonb,
  'low',
  '5 min',
  '["FortiGate GUI", "FortiGate CLI"]'::jsonb
FROM compliance_rules WHERE code = 'sec-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Regras de Entrada
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Restrição de IPs de Origem',
  'Limitar quais endereços IP podem acessar serviços publicados na internet.',
  'Sem restrição, qualquer IP da internet pode tentar acessar os serviços, aumentando a superfície de ataque.',
  '["Ataques de força bruta de toda a internet", "Maior exposição a exploits", "Varreduras automatizadas constantes"]'::jsonb,
  '["Identifique as regras inbound em Policy & Objects", "Para cada regra, defina Source específico", "Crie objetos de endereço para parceiros/clientes", "Use Geography objects para restringir por país", "Nunca use all como origem em regras públicas"]'::jsonb,
  'medium',
  '30 min',
  '["FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'inb-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Bloqueio de RDP Exposto',
  'Remote Desktop Protocol (porta 3389) nunca deve ser acessível diretamente da internet.',
  'RDP exposto é alvo prioritário de ataques de força bruta e exploits, sendo vetor comum de ransomware.',
  '["Ransomware via acesso RDP comprometido", "Força bruta automatizada 24/7", "Exploits como BlueKeep/DejaBlue", "Comprometimento total dos servidores"]'::jsonb,
  '["Identifique regras que permitem porta 3389 da internet", "Remova ou desabilite essas regras imediatamente", "Implemente acesso via VPN SSL ou IPsec", "Considere usar bastion host/jump server", "Habilite NLA (Network Level Authentication) nos servidores"]'::jsonb,
  'medium',
  '1 hora',
  '["FortiGate VPN", "Azure Bastion", "Jump Server"]'::jsonb
FROM compliance_rules WHERE code = 'inb-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Bloqueio de SMB Exposto',
  'Portas de compartilhamento de arquivos (445, 139) nunca devem ser acessíveis da internet.',
  'SMB exposto permite exploração de vulnerabilidades críticas como EternalBlue, usada pelo WannaCry.',
  '["Propagação de ransomware (WannaCry, NotPetya)", "Exploits críticos (EternalBlue, MS17-010)", "Acesso direto a compartilhamentos", "Roubo massivo de dados"]'::jsonb,
  '["Verifique regras que permitem portas 445/139 da internet", "Bloqueie imediatamente essas portas", "SMB só deve ser acessível via VPN", "Monitore tentativas de conexão nessas portas", "Considere habilitar IPS para detectar exploits SMB"]'::jsonb,
  'low',
  '15 min',
  '["FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'inb-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'IPS/IDS em Tráfego de Entrada',
  'Sistema de prevenção de intrusões que detecta e bloqueia ataques em tempo real.',
  'Sem IPS, exploits e ataques conhecidos passam despercebidos pelo firewall.',
  '["Exploits não são detectados", "Ataques conhecidos têm sucesso", "Comprometimento de serviços publicados"]'::jsonb,
  '["Acesse Security Profiles > Intrusion Prevention", "Crie ou edite um perfil IPS", "Habilite assinaturas para severidades Critical e High", "Configure ação como Block", "Aplique o perfil em todas as políticas inbound", "Monitore logs de IPS para ajustes"]'::jsonb,
  'medium',
  '30 min',
  '["FortiGuard IPS", "FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'utm-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

-- Category: Segurança de Interfaces
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Desabilitar HTTP em Interfaces Externas',
  'Acesso administrativo via HTTP transmite dados sem criptografia e deve ser desabilitado.',
  'HTTP em interfaces externas permite captura de credenciais de administrador por atacantes.',
  '["Credenciais transmitidas em texto claro", "Sessões podem ser sequestradas", "Acesso não autorizado ao firewall"]'::jsonb,
  '["Acesse Network > Interfaces", "Edite cada interface WAN/externa", "Em Administrative Access, desmarque HTTP", "Mantenha apenas HTTPS se necessário", "Teste acesso via HTTPS após a mudança"]'::jsonb,
  'low',
  '10 min',
  '["FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'int-001' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Restringir HTTPS em Interfaces Externas',
  'Limitar acesso administrativo HTTPS apenas a IPs confiáveis de gerenciamento.',
  'HTTPS exposto à internet permite ataques de força bruta e exploits contra a interface de admin.',
  '["Ataques de força bruta contra login", "Exploits na interface administrativa", "Tentativas de acesso não autorizado"]'::jsonb,
  '["Desabilite HTTPS na interface WAN se possível", "Se necessário, crie Local-In Policy restritiva", "Permita apenas IPs de gerenciamento específicos", "Use VPN para acesso administrativo remoto", "Monitore logs de tentativas de acesso"]'::jsonb,
  'medium',
  '30 min',
  '["FortiGate GUI", "FortiGate CLI"]'::jsonb
FROM compliance_rules WHERE code = 'int-002' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Restringir SSH em Interfaces Externas',
  'SSH exposto permite ataques de força bruta contra a autenticação do firewall.',
  'Atacantes podem tentar comprometer o acesso administrativo via SSH exposto à internet.',
  '["Ataques de força bruta SSH", "Tentativas de login automatizadas", "Risco de comprometimento"]'::jsonb,
  '["Desabilite SSH na interface WAN", "Se necessário, restrinja a IPs específicos via Local-In Policy", "Use VPN para acesso SSH remoto", "Configure fail2ban ou similar se disponível", "Monitore tentativas de login SSH"]'::jsonb,
  'medium',
  '20 min',
  '["FortiGate GUI", "FortiGate CLI"]'::jsonb
FROM compliance_rules WHERE code = 'int-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Restringir SNMP em Interfaces Externas',
  'SNMP pode expor informações de configuração e deve ser limitado à rede de gerenciamento.',
  'SNMP em interfaces externas permite enumeração e coleta de informações sensíveis.',
  '["Exposição de informações de infraestrutura", "Enumeração de configurações", "Planejamento de ataques direcionados"]'::jsonb,
  '["Desabilite SNMP em interfaces WAN", "Restrinja SNMP apenas à VLAN de gerenciamento", "Use SNMPv3 com autenticação e criptografia", "Configure community strings fortes", "Limite hosts permitidos para consultas SNMP"]'::jsonb,
  'low',
  '15 min',
  '["FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'int-004' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;

INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Desabilitar ICMP Ping em Interfaces Externas',
  'Responder a ping permite descoberta e fingerprinting do firewall por atacantes.',
  'ICMP habilitado facilita identificação da presença e tipo do firewall na internet.',
  '["Descoberta do firewall por atacantes", "Fingerprinting do dispositivo", "Planejamento de ataques direcionados"]'::jsonb,
  '["Acesse Network > Interfaces", "Edite cada interface WAN/externa", "Em Administrative Access, desmarque PING", "Considere permitir ping apenas de IPs de monitoramento", "Use Local-In Policy para controle granular"]'::jsonb,
  'low',
  '5 min',
  '["FortiGate GUI"]'::jsonb
FROM compliance_rules WHERE code = 'int-005' AND device_type_id = (SELECT id FROM device_types WHERE code = 'fortigate')
ON CONFLICT (rule_id) DO NOTHING;
