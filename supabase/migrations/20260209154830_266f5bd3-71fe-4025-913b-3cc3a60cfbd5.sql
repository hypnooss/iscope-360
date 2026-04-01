
-- ============================================================
-- 1. ADD 8 NEW POWERSHELL STEPS TO EXCHANGE ONLINE BLUEPRINT
-- Using escaped single quotes for PowerShell commands
-- ============================================================
UPDATE public.device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (collection_steps->'steps') || jsonb_build_array(
    jsonb_build_object(
      'id', 'exo_audit_config',
      'type', 'powershell',
      'category', 'Exchange - Audit',
      'params', jsonb_build_object(
        'module', 'ExchangeOnline',
        'timeout', 30,
        'commands', jsonb_build_array(jsonb_build_object(
          'name', 'exo_audit_config',
          'command', 'Get-AdminAuditLogConfig | Select-Object UnifiedAuditLogIngestionEnabled, AdminAuditLogEnabled, AdminAuditLogAgeLimit | ConvertTo-Json -Depth 5'
        ))
      )
    ),
    jsonb_build_object(
      'id', 'exo_org_config',
      'type', 'powershell',
      'category', 'Exchange - Organization',
      'params', jsonb_build_object(
        'module', 'ExchangeOnline',
        'timeout', 30,
        'commands', jsonb_build_array(jsonb_build_object(
          'name', 'exo_org_config',
          'command', 'Get-OrganizationConfig | Select-Object SmtpClientAuthenticationDisabled, OAuth2ClientProfileEnabled, DefaultPublicFolderAgeLimit, FocusedInboxOn, AuditDisabled | ConvertTo-Json -Depth 5'
        ))
      )
    ),
    jsonb_build_object(
      'id', 'exo_accepted_domains',
      'type', 'powershell',
      'category', 'Exchange - Domains',
      'params', jsonb_build_object(
        'module', 'ExchangeOnline',
        'timeout', 30,
        'commands', jsonb_build_array(jsonb_build_object(
          'name', 'exo_accepted_domains',
          'command', 'Get-AcceptedDomain | Select-Object DomainName, DomainType, Default | ConvertTo-Json -Depth 5'
        ))
      )
    ),
    jsonb_build_object(
      'id', 'exo_inbound_connectors',
      'type', 'powershell',
      'category', 'Exchange - Mail Flow',
      'params', jsonb_build_object(
        'module', 'ExchangeOnline',
        'timeout', 30,
        'commands', jsonb_build_array(jsonb_build_object(
          'name', 'exo_inbound_connectors',
          'command', 'Get-InboundConnector | Select-Object Name, Enabled, ConnectorType, RequireTls, RestrictDomainsToIPAddresses, RestrictDomainsToCertificate, CloudServicesMailEnabled, TreatMessagesAsInternal | ConvertTo-Json -Depth 5'
        ))
      )
    ),
    jsonb_build_object(
      'id', 'exo_outbound_connectors',
      'type', 'powershell',
      'category', 'Exchange - Mail Flow',
      'params', jsonb_build_object(
        'module', 'ExchangeOnline',
        'timeout', 30,
        'commands', jsonb_build_array(jsonb_build_object(
          'name', 'exo_outbound_connectors',
          'command', 'Get-OutboundConnector | Select-Object Name, Enabled, ConnectorType, TlsSettings, RecipientDomains, SmartHosts, UseMXRecord | ConvertTo-Json -Depth 5'
        ))
      )
    ),
    jsonb_build_object(
      'id', 'exo_role_assignments',
      'type', 'powershell',
      'category', 'Exchange - Governance',
      'params', jsonb_build_object(
        'module', 'ExchangeOnline',
        'timeout', 60,
        'commands', jsonb_build_array(jsonb_build_object(
          'name', 'exo_role_assignments',
          'command', E'Get-RoleGroupMember -Identity \'Organization Management\' -ResultSize 100 | Select-Object Name, RecipientType, PrimarySmtpAddress | ConvertTo-Json -Depth 5'
        ))
      )
    ),
    jsonb_build_object(
      'id', 'exo_mailbox_audit',
      'type', 'powershell',
      'category', 'Exchange - Audit',
      'params', jsonb_build_object(
        'module', 'ExchangeOnline',
        'timeout', 120,
        'commands', jsonb_build_array(jsonb_build_object(
          'name', 'exo_mailbox_audit',
          'command', 'Get-EXOMailbox -ResultSize 100 -PropertySets Audit | Select-Object DisplayName, PrimarySmtpAddress, AuditEnabled, AuditLogAgeLimit | ConvertTo-Json -Depth 5'
        ))
      )
    ),
    jsonb_build_object(
      'id', 'exo_auth_policy',
      'type', 'powershell',
      'category', 'Exchange - Security',
      'params', jsonb_build_object(
        'module', 'ExchangeOnline',
        'timeout', 30,
        'commands', jsonb_build_array(jsonb_build_object(
          'name', 'exo_auth_policy',
          'command', 'Get-AuthenticationPolicy -ErrorAction SilentlyContinue | Select-Object Name, AllowBasicAuthActiveSync, AllowBasicAuthAutodiscover, AllowBasicAuthImap, AllowBasicAuthMapi, AllowBasicAuthPop, AllowBasicAuthSmtp, AllowBasicAuthWebServices, AllowBasicAuthPowershell | ConvertTo-Json -Depth 5'
        ))
      )
    )
  )
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';

-- ============================================================
-- 2. REACTIVATE EXO-001
-- ============================================================
UPDATE public.compliance_rules
SET 
  is_active = true,
  evaluation_logic = '{"source_key":"exo_mailbox_forwarding","conditions":[{"field":"data","operator":"array_empty","value":true}],"pass_when":"array_empty","description":"Verifica se existem mailboxes com redirecionamento externo configurado"}'::jsonb,
  recommendation = 'Remova redirecionamentos externos desnecessários via Set-Mailbox -ForwardingSmtpAddress $null.',
  pass_description = 'Nenhuma mailbox com redirecionamento externo ativo encontrada.',
  fail_description = 'Mailboxes com redirecionamento externo detectadas, dados podem estar sendo exfiltrados.',
  technical_risk = 'Redirecionamento externo permite que cópias de emails sejam enviadas para fora da organização.',
  business_impact = 'Risco de vazamento massivo de dados confidenciais.',
  api_endpoint = 'Get-Mailbox | Where-Object { ForwardingAddress/ForwardingSmtpAddress }',
  category = 'email_exchange',
  updated_at = now()
WHERE id = '4f83b2ec-64cb-473a-b146-c325bef7a98a';

-- ============================================================
-- 3. INSERT COMPLIANCE RULES EXO-006 TO EXO-020
-- ============================================================

INSERT INTO public.compliance_rules (device_type_id, code, name, description, category, severity, weight, evaluation_logic, is_active, recommendation, pass_description, fail_description, technical_risk, business_impact, api_endpoint) VALUES
('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-006', 'Política Anti-Phishing Desabilitada', 'Verifica se as políticas de proteção contra phishing estão habilitadas.', 'email_exchange', 'critical', 5,
 '{"source_key":"exo_anti_phish_policy","conditions":[{"field":"Enabled","operator":"equals","value":true},{"field":"EnableMailboxIntelligence","operator":"equals","value":true},{"field":"EnableSpoofIntelligence","operator":"equals","value":true}],"pass_when":"all_match","description":"Políticas Anti-Phish habilitadas com inteligência ativa"}'::jsonb,
 true, 'Habilite Anti-Phishing no Defender > Políticas de Ameaça.', 'Políticas Anti-Phishing configuradas corretamente.', 'Política Anti-Phishing desabilitada, expondo usuários a phishing.', 'Atacantes podem falsificar remetentes confiáveis.', 'Comprometimento de contas e ransomware via phishing.', 'Get-AntiPhishPolicy'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-007', 'Safe Links Desabilitado', 'Verifica se Safe Links está habilitado para email.', 'threats_activity', 'high', 4,
 '{"source_key":"exo_safe_links_policy","conditions":[{"field":"EnableSafeLinksForEmail","operator":"equals","value":true},{"field":"ScanUrls","operator":"equals","value":true}],"pass_when":"all_match","description":"Safe Links habilitado com verificação de URLs"}'::jsonb,
 true, 'Habilite Safe Links no Defender > Políticas de Ameaça.', 'Safe Links habilitado e verificando URLs.', 'Safe Links desabilitado, URLs maliciosas não verificadas.', 'Usuários podem clicar em links de phishing ou malware.', 'Roubo de credenciais e infecção por malware via URLs.', 'Get-SafeLinksPolicy'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-008', 'Safe Attachments Desabilitado', 'Verifica se Safe Attachments está habilitado.', 'threats_activity', 'high', 4,
 '{"source_key":"exo_safe_attachment_policy","conditions":[{"field":"Enable","operator":"equals","value":true},{"field":"Action","operator":"not_equals","value":"Allow"}],"pass_when":"all_match","description":"Safe Attachments habilitado com ação de proteção"}'::jsonb,
 true, 'Habilite Safe Attachments no Defender com ação Block ou Replace.', 'Safe Attachments habilitado com proteção ativa.', 'Safe Attachments desabilitado, anexos maliciosos podem chegar aos usuários.', 'Arquivos maliciosos entregues sem análise de sandbox.', 'Infecção por ransomware e trojans via anexos.', 'Get-SafeAttachmentPolicy'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-009', 'DKIM Não Configurado', 'Verifica se DKIM está habilitado para os domínios.', 'email_exchange', 'high', 4,
 '{"source_key":"exo_dkim_config","conditions":[{"field":"Enabled","operator":"equals","value":true}],"pass_when":"all_match","description":"DKIM habilitado para todos os domínios"}'::jsonb,
 true, 'Habilite DKIM no Exchange Admin Center > Mail Flow > DKIM.', 'DKIM habilitado para os domínios.', 'DKIM não habilitado, emails podem ser rejeitados ou falsificados.', 'Sem garantia criptográfica de integridade dos emails.', 'Emails rejeitados e danos à reputação do domínio.', 'Get-DkimSigningConfig'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-010', 'Filtro de Malware Sem File Filter', 'Verifica se filtro de tipos de arquivo perigosos está habilitado.', 'threats_activity', 'medium', 3,
 '{"source_key":"exo_malware_filter_policy","conditions":[{"field":"EnableFileFilter","operator":"equals","value":true},{"field":"ZapEnabled","operator":"equals","value":true}],"pass_when":"all_match","description":"File filter e ZAP habilitados"}'::jsonb,
 true, 'Habilite File Filter na política anti-malware e ative ZAP.', 'Filtro de arquivos e ZAP habilitados.', 'Filtro de tipos de arquivo desabilitado, extensões perigosas passam.', 'Executáveis e scripts podem ser entregues via email.', 'Execução de malware comprometendo a rede.', 'Get-MalwareFilterPolicy'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-011', 'Auto-Forward em Remote Domains', 'Verifica se encaminhamento automático está desabilitado nos remote domains.', 'email_exchange', 'high', 4,
 '{"source_key":"exo_remote_domains","conditions":[{"field":"AutoForwardEnabled","operator":"equals","value":false}],"pass_when":"all_match","description":"Auto-forward desabilitado em todos os remote domains"}'::jsonb,
 true, 'Desabilite auto-forward: Set-RemoteDomain -AutoForwardEnabled $false.', 'Encaminhamento automático desabilitado.', 'Encaminhamento automático habilitado, permitindo exfiltração.', 'Usuários podem redirecionar todos os emails para fora.', 'Exfiltração silenciosa de dados corporativos.', 'Get-RemoteDomain'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-012', 'Transport Rules Redirecionando para Externo', 'Verifica se existem regras de transporte que redirecionam emails externamente.', 'email_exchange', 'critical', 5,
 '{"source_key":"exo_transport_rules","conditions":[{"field":"data","operator":"array_empty","value":true}],"pass_when":"array_empty","description":"Nenhuma regra de transporte suspeita"}'::jsonb,
 true, 'Revise e remova Transport Rules não autorizadas.', 'Nenhuma regra de transporte suspeita detectada.', 'Regras de transporte redirecionando emails, possível comprometimento.', 'Regras maliciosas podem redirecionar emails para atacantes.', 'Comprometimento total da comunicação corporativa.', 'Get-TransportRule'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-013', 'Spam Filter Permissivo', 'Verifica se filtro de spam está configurado com ações adequadas.', 'threats_activity', 'medium', 3,
 '{"source_key":"exo_hosted_content_filter","conditions":[{"field":"HighConfidenceSpamAction","operator":"not_equals","value":"MoveToJmf"},{"field":"PhishSpamAction","operator":"not_equals","value":"MoveToJmf"}],"pass_when":"none_match","description":"Spam/phishing com ação restritiva"}'::jsonb,
 true, 'Configure ações Quarantine para spam de alta confiança e phishing.', 'Filtro de spam com ações restritivas.', 'Filtro permissivo, mensagens maliciosas na inbox.', 'Emails de phishing passam pelas defesas.', 'Maior exposição a phishing e comprometimento de contas.', 'Get-HostedContentFilterPolicy'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-014', 'OWA Permite Download em PCs Públicos', 'Verifica se download direto está desabilitado para PCs públicos no OWA.', 'email_exchange', 'medium', 2,
 '{"source_key":"exo_owa_mailbox_policy","conditions":[{"field":"DirectFileAccessOnPublicComputersEnabled","operator":"equals","value":false}],"pass_when":"all_match","description":"Download direto desabilitado em PCs públicos"}'::jsonb,
 true, 'Desabilite download direto em PCs públicos no OWA.', 'Download desabilitado para PCs públicos.', 'Download habilitado em PCs públicos, dados podem vazar.', 'Anexos baixados em máquinas não gerenciadas.', 'Vazamento via downloads em equipamentos de terceiros.', 'Get-OwaMailboxPolicy'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-015', 'Auditoria Admin Desabilitada', 'Verifica se auditoria unificada e administrativa estão habilitadas.', 'email_exchange', 'critical', 5,
 '{"source_key":"exo_audit_config","conditions":[{"field":"UnifiedAuditLogIngestionEnabled","operator":"equals","value":true},{"field":"AdminAuditLogEnabled","operator":"equals","value":true}],"pass_when":"all_match","description":"Auditorias habilitadas"}'::jsonb,
 true, 'Habilite auditoria: Set-AdminAuditLogConfig -UnifiedAuditLogIngestionEnabled $true.', 'Auditoria unificada e administrativa habilitadas.', 'Auditoria desabilitada, ações não registradas.', 'Sem rastreamento de ações maliciosas ou administrativas.', 'Impossibilidade de investigar incidentes, não conformidade regulatória.', 'Get-AdminAuditLogConfig'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-016', 'SMTP Auth Global Habilitado', 'Verifica se SMTP Auth está desabilitado globalmente.', 'email_exchange', 'high', 4,
 '{"source_key":"exo_org_config","conditions":[{"field":"SmtpClientAuthenticationDisabled","operator":"equals","value":true}],"pass_when":"all_match","description":"SMTP Auth desabilitado globalmente"}'::jsonb,
 true, 'Desabilite SMTP Auth: Set-TransportConfig -SmtpClientAuthenticationDisabled $true.', 'SMTP Auth desabilitado globalmente.', 'SMTP Auth habilitado, superfície de ataque exposta.', 'SMTP Auth permite password spray e brute force.', 'Comprometimento massivo de contas via ataques automatizados.', 'Get-OrganizationConfig'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-017', 'Domínio Aceito como Relay', 'Verifica se existem domínios configurados como InternalRelay.', 'email_exchange', 'high', 4,
 '{"source_key":"exo_accepted_domains","conditions":[{"field":"DomainType","operator":"not_equals","value":"Authoritative"}],"pass_when":"none_match","description":"Todos os domínios devem ser Authoritative"}'::jsonb,
 true, 'Altere domínios InternalRelay para Authoritative quando possível.', 'Todos os domínios são Authoritative.', 'Domínio(s) como InternalRelay, emails encaminhados para fora.', 'Domínios relay encaminham emails de destinatários desconhecidos para servidores externos.', 'Emails sensíveis encaminhados para servidores não controlados.', 'Get-AcceptedDomain'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-018', 'Conector Inbound com Bypass de Segurança', 'Verifica se conectores inbound tratam mensagens como internas.', 'email_exchange', 'critical', 5,
 '{"source_key":"exo_inbound_connectors","conditions":[{"field":"TreatMessagesAsInternal","operator":"equals","value":true}],"pass_when":"none_match","description":"Nenhum conector deve tratar mensagens como internas"}'::jsonb,
 true, 'Configure conectores: Set-InboundConnector -TreatMessagesAsInternal $false.', 'Nenhum conector trata mensagens como internas.', 'Conector(es) tratando mensagens como internas, bypass de filtros.', 'Emails externos passam sem verificação de spam/phishing.', 'Ataques de phishing atingem usuários sem proteção.', 'Get-InboundConnector'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-019', 'Conector Outbound sem TLS', 'Verifica se conectores outbound exigem TLS.', 'email_exchange', 'high', 4,
 '{"source_key":"exo_outbound_connectors","conditions":[{"field":"TlsSettings","operator":"not_equals","value":""}],"pass_when":"all_match","description":"Todos os conectores devem ter TLS"}'::jsonb,
 true, 'Configure TLS: Set-OutboundConnector -TlsSettings CertificateValidation.', 'Conectores outbound com TLS configurado.', 'Conector(es) sem TLS, emails em texto plano.', 'Emails interceptáveis em trânsito via man-in-the-middle.', 'Exposição de dados confidenciais durante transmissão.', 'Get-OutboundConnector'),

('5d1a7095-2d7b-4541-873d-4b03c3d6122f', 'EXO-020', 'Auditoria de Mailbox Desabilitada', 'Verifica se auditoria está habilitada nas mailboxes.', 'email_exchange', 'medium', 3,
 '{"source_key":"exo_mailbox_audit","conditions":[{"field":"AuditEnabled","operator":"equals","value":true}],"pass_when":"all_match","description":"Auditoria habilitada em todas as mailboxes"}'::jsonb,
 true, 'Habilite auditoria: Set-Mailbox -AuditEnabled $true.', 'Auditoria habilitada em todas as mailboxes amostradas.', 'Mailboxes com auditoria desabilitada.', 'Acessos não autorizados não são rastreáveis.', 'Impossibilidade de detectar acessos indevidos.', 'Get-EXOMailbox -PropertySets Audit');
