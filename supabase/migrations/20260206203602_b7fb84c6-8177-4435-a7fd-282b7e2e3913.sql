-- Melhorar textos de Nome, Mensagem de Sucesso e Mensagem de Falha das regras FortiGate
-- Objetivo: Textos mais claros, objetivos e alinhados com tom profissional do relatório

UPDATE compliance_rules SET 
  name = 'Criptografia LDAP',
  pass_description = 'Servidores LDAP configurados com conexão criptografada (LDAPS ou STARTTLS)',
  fail_description = 'Servidores LDAP transmitindo credenciais sem criptografia'
WHERE code = 'auth-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Redundância RADIUS',
  pass_description = 'Servidores RADIUS configurados com redundância e timeouts adequados',
  fail_description = 'Servidor RADIUS sem redundância ou com timeouts inadequados'
WHERE code = 'auth-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Fortinet SSO (FSSO)',
  pass_description = 'FSSO configurado para autenticação transparente baseada em identidade',
  fail_description = 'FSSO não configurado — políticas baseadas em identidade indisponíveis'
WHERE code = 'auth-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Integração SAML',
  pass_description = 'SAML configurado para integração com provedor de identidade corporativo',
  fail_description = 'SAML não configurado — sem integração com IdP corporativo'
WHERE code = 'auth-004' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Backup Automático',
  pass_description = 'Backup automático de configuração habilitado e operacional',
  fail_description = 'Backup automático desabilitado — risco de perda de configuração'
WHERE code = 'bkp-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Versão do Firmware',
  pass_description = 'Firmware atualizado para versão estável recomendada pela Fortinet',
  fail_description = 'Firmware desatualizado — pode conter vulnerabilidades conhecidas (CVEs)'
WHERE code = 'fw-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Alta Disponibilidade (HA)',
  pass_description = 'Cluster HA configurado em modo ativo-passivo ou ativo-ativo',
  fail_description = 'Firewall operando em modo standalone — sem redundância de hardware'
WHERE code = 'ha-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Sincronização de Sessões HA',
  pass_description = 'Sincronização de sessões habilitada entre membros do cluster',
  fail_description = 'Sessões não sincronizadas — failover causará interrupção de conexões'
WHERE code = 'ha-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Heartbeat HA Redundante',
  pass_description = 'Múltiplas interfaces de heartbeat configuradas para redundância',
  fail_description = 'Apenas uma interface de heartbeat — risco de split-brain'
WHERE code = 'ha-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Restrição de Origem (Inbound)',
  pass_description = 'Todas as regras de entrada possuem origem restrita por IP ou geo',
  fail_description = 'Regras de entrada com source "all" — qualquer IP pode acessar'
WHERE code = 'inb-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Exposição RDP',
  pass_description = 'RDP (porta 3389) não exposto diretamente para internet',
  fail_description = 'RDP exposto para internet — vetor prioritário de ransomware'
WHERE code = 'inb-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Exposição SMB/CIFS',
  pass_description = 'SMB/CIFS (portas 445/139) não exposto para internet',
  fail_description = 'SMB exposto para internet — vulnerável a EternalBlue/WannaCry'
WHERE code = 'inb-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'HTTP em Interfaces Externas',
  pass_description = 'Gerenciamento HTTP desabilitado em interfaces WAN',
  fail_description = 'HTTP habilitado em interface WAN — credenciais em texto plano'
WHERE code = 'int-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'HTTPS em Interfaces Externas',
  pass_description = 'Gerenciamento HTTPS restrito a interfaces internas',
  fail_description = 'HTTPS habilitado em interface WAN — painel exposto à internet'
WHERE code = 'int-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'SSH em Interfaces Externas',
  pass_description = 'SSH restrito a interfaces internas ou IPs específicos',
  fail_description = 'SSH habilitado em interface WAN — exposto a força bruta'
WHERE code = 'int-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'SNMP em Interfaces Externas',
  pass_description = 'SNMP restrito a interfaces internas ou desabilitado em WAN',
  fail_description = 'SNMP habilitado em interface WAN — expõe informações do firewall'
WHERE code = 'int-004' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'ICMP Ping em Interfaces Externas',
  pass_description = 'ICMP ping desabilitado em interfaces WAN',
  fail_description = 'Ping habilitado em interface WAN — facilita reconhecimento'
WHERE code = 'int-005' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Contrato FortiCare',
  pass_description = 'FortiCare ativo com acesso a atualizações e suporte técnico',
  fail_description = 'FortiCare expirado — sem acesso a patches e suporte'
WHERE code = 'lic-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Licenças FortiGuard',
  pass_description = 'Todos os serviços FortiGuard ativos e atualizando assinaturas',
  fail_description = 'Licenças FortiGuard expiradas — proteções desatualizadas'
WHERE code = 'lic-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Logging de Eventos',
  pass_description = 'Logging habilitado para eventos de tráfego e segurança',
  fail_description = 'Logging desabilitado — sem visibilidade para investigação de incidentes'
WHERE code = 'log-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Centralização de Logs',
  pass_description = 'Logs enviados para Syslog, FortiAnalyzer ou SIEM',
  fail_description = 'Logs apenas locais — podem ser perdidos ou adulterados'
WHERE code = 'log-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Regras Any-Any',
  pass_description = 'Nenhuma regra permissiva "any-any" encontrada',
  fail_description = 'Regras any-any detectadas — tráfego irrestrito entre zonas'
WHERE code = 'net-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Criptografia Forte (Strong Crypto)',
  pass_description = 'Strong-crypto habilitado — apenas cifras e protocolos seguros',
  fail_description = 'Strong-crypto desabilitado — aceita cifras fracas e TLS obsoleto'
WHERE code = 'sec-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Autenticação Dois Fatores (2FA)',
  pass_description = 'Todos os administradores configurados com autenticação 2FA',
  fail_description = 'Administradores sem 2FA — vulneráveis a credential stuffing'
WHERE code = 'sec-002' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Timeout de Sessão Administrativa',
  pass_description = 'Timeout de sessão configurado para 30 minutos ou menos',
  fail_description = 'Timeout muito longo — sessões administrativas permanecem abertas'
WHERE code = 'sec-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'IPS/IDS em Tráfego Inbound',
  pass_description = 'IPS aplicado em todas as políticas de entrada WAN',
  fail_description = 'Políticas inbound sem IPS — exploits não são bloqueados'
WHERE code = 'utm-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Web Filter em Tráfego Outbound',
  pass_description = 'Web Filter aplicado nas políticas de navegação',
  fail_description = 'Navegação sem Web Filter — acesso a sites maliciosos permitido'
WHERE code = 'utm-004' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Application Control',
  pass_description = 'Application Control aplicado nas políticas de saída',
  fail_description = 'Sem Application Control — aplicações de risco podem operar'
WHERE code = 'utm-007' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Antivírus de Gateway',
  pass_description = 'Antivírus aplicado nas políticas de saída e entrada',
  fail_description = 'Políticas sem antivírus — malware não é bloqueado no perímetro'
WHERE code = 'utm-009' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Criptografia VPN IPsec',
  pass_description = 'VPN IPsec usando AES-256 e SHA-256 ou superior',
  fail_description = 'VPN IPsec com criptografia fraca (DES/3DES/MD5)'
WHERE code = 'vpn-001' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  name = 'Versão TLS em VPN SSL',
  pass_description = 'VPN SSL configurada apenas com TLS 1.2 ou superior',
  fail_description = 'VPN SSL permite TLS 1.0/1.1 — vulnerável a ataques conhecidos'
WHERE code = 'vpn-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';