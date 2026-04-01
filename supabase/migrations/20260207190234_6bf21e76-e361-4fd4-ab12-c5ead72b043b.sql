-- ========================================================
-- Template M365: Device Type, Categories e Compliance Rules
-- ========================================================

-- 1. Criar device_type para Microsoft 365
INSERT INTO device_types (code, name, vendor, category, icon, is_active)
VALUES ('m365', 'Microsoft 365', 'Microsoft', 'other', 'Cloud', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Criar 11 rule_categories para M365
INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'identities', 'Identidades', 'Users', 'blue-500', 1, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'auth_access', 'Autenticação & Acesso', 'KeyRound', 'purple-500', 2, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'admin_privileges', 'Privilégios Administrativos', 'Crown', 'amber-500', 3, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'apps_integrations', 'Aplicações & Integrações', 'Blocks', 'cyan-500', 4, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'email_exchange', 'Email & Exchange', 'Mail', 'indigo-500', 5, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'threats_activity', 'Ameaças & Atividades', 'AlertTriangle', 'red-500', 6, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'intune_devices', 'Intune & Dispositivos', 'Smartphone', 'green-500', 7, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'pim_governance', 'PIM & Governança', 'ShieldCheck', 'orange-500', 8, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'sharepoint_onedrive', 'SharePoint & OneDrive', 'HardDrive', 'teal-500', 9, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'teams_collaboration', 'Teams & Colaboração', 'MessageSquare', 'violet-500', 10, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO rule_categories (device_type_id, name, display_name, icon, color, display_order, is_active)
SELECT dt.id, 'defender_security', 'Defender & DLP', 'Shield', 'rose-500', 11, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- 3. Criar compliance_rules para M365 (57 regras)

-- ========== IDENTITIES (IDT-001 a IDT-006) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'IDT-001', 'Status de MFA dos Usuários', 'Verifica quantos usuários possuem MFA configurado', 'identities', 'critical', 8,
  'Acesse o portal Entra ID > Protection > Authentication methods > Configure políticas de MFA obrigatório.',
  'Todos os usuários possuem MFA configurado.',
  '{{count}} usuário(s) sem MFA configurado.',
  'Dados de MFA não disponíveis.',
  'Contas sem MFA são vulneráveis a ataques de phishing e credential stuffing.',
  'Acesso não autorizado pode resultar em vazamento de dados e comprometimento de sistemas.',
  '/reports/authenticationMethods/userRegistrationDetails',
  '{"type": "count_threshold", "field": "usersWithoutMfa", "threshold": 0, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'IDT-002', 'Usuários Inativos (>90 dias)', 'Identifica usuários ativos sem login há mais de 90 dias', 'identities', 'high', 4,
  'Revise a lista de usuários inativos > Desabilite contas de ex-funcionários > Considere automatizar cleanup com Access Reviews.',
  'Todos os usuários ativos têm atividade recente.',
  '{{count}} usuário(s) ativo(s) sem login há mais de 90 dias.',
  'Dados de atividade não disponíveis.',
  'Contas inativas são alvos de ataques e podem indicar ex-funcionários com acesso.',
  'Licenças desperdiçadas e superfície de ataque expandida.',
  '/users (beta com signInActivity)',
  '{"type": "count_threshold", "field": "inactiveUsers", "threshold": 5, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'IDT-003', 'Usuários Convidados (Guests) Problemáticos', 'Detecta guests pendentes ou muito antigos', 'identities', 'medium', 3,
  'Configure Access Reviews para guests > Remova convites pendentes antigos > Implemente política de expiração de guests.',
  'Todos os guests estão em estado válido.',
  '{{count}} guest(s) pendente(s) ou muito antigo(s) detectado(s).',
  'Dados de guests não disponíveis.',
  'Guests abandonados ou pendentes expandem superfície de ataque.',
  'Acesso externo descontrolado pode violar compliance.',
  '/users?$filter=userType eq Guest',
  '{"type": "count_threshold", "field": "problematicGuests", "threshold": 10, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'IDT-004', 'Guests Inativos (>60 dias)', 'Identifica guests sem atividade há mais de 60 dias', 'identities', 'medium', 3,
  'Configure Access Reviews automáticos para guests > Defina política de expiração de 90 dias.',
  'Todos os guests têm atividade recente.',
  '{{count}} guest(s) sem atividade há mais de 60 dias.',
  'Dados de atividade de guests não disponíveis.',
  'Guests inativos podem ser contas esquecidas com acessos ativos.',
  'Risco de acesso não autorizado por parceiros antigos.',
  '/users (beta com signInActivity)',
  '{"type": "count_threshold", "field": "inactiveGuests", "threshold": 15, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'IDT-005', 'Senhas Antigas (>1 ano)', 'Identifica usuários com senha não alterada há mais de 1 ano', 'identities', 'medium', 2,
  'Considere habilitar Self-Service Password Reset > Avalie política de rotação de senhas > Priorize MFA sobre rotação frequente.',
  'Todas as senhas foram alteradas recentemente.',
  '{{count}} usuário(s) com senha não alterada há mais de 1 ano.',
  'Dados de senha não disponíveis.',
  'Senhas antigas têm maior probabilidade de estarem comprometidas.',
  'Maior risco de acesso não autorizado.',
  '/users?$select=lastPasswordChangeDateTime',
  '{"type": "count_threshold", "field": "oldPasswords", "threshold": 20, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'IDT-006', 'Contas Desabilitadas', 'Contagem de contas desabilitadas para manutenção', 'identities', 'info', 0,
  'Revise contas desabilitadas periodicamente > Delete permanentemente contas não necessárias.',
  '{{count}} conta(s) desabilitada(s) no tenant.',
  '{{count}} conta(s) desabilitada(s) no tenant.',
  'Dados de contas não disponíveis.',
  'Contas desabilitadas devem ser periodicamente removidas.',
  'Manutenção de diretório e compliance.',
  '/users/$count',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== ADMIN PRIVILEGES (ADM-001 a ADM-006) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'ADM-001', 'Quantidade de Global Admins', 'Verifica se o número de Global Admins está dentro do limite recomendado', 'admin_privileges', 'critical', 6,
  'Revise a lista de Global Admins > Use roles mais específicos > Implemente PIM para acesso just-in-time.',
  '{{count}} Global Admin(s) - dentro do limite recomendado.',
  '{{count}} Global Admins detectados. Recomendado: máximo 5.',
  'Dados de roles não disponíveis.',
  'Excesso de Global Admins aumenta a superfície de ataque e dificulta auditoria.',
  'Maior risco de comprometimento de conta privilegiada.',
  '/directoryRoles',
  '{"type": "count_threshold", "field": "globalAdmins", "threshold": 5, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'ADM-002', 'MFA em Contas de Global Admin', 'Verifica se todos os Global Admins possuem MFA', 'admin_privileges', 'critical', 10,
  'Crie política de Conditional Access > Exija MFA para todas as roles administrativas.',
  'Todos os Global Admins possuem MFA.',
  '{{count}} Global Admin(s) sem MFA configurado!',
  'Dados de MFA de admins não disponíveis.',
  'Contas administrativas sem MFA são alvos prioritários de ataques.',
  'Comprometimento de admin pode resultar em controle total do tenant.',
  '/reports/authenticationMethods/userRegistrationDetails',
  '{"type": "count_threshold", "field": "adminsWithoutMfa", "threshold": 0, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'ADM-003', 'Total de Usuários Privilegiados', 'Contagem de usuários com roles administrativas', 'admin_privileges', 'high', 5,
  'Revise todas as atribuições de roles > Use o princípio do menor privilégio > Implemente PIM.',
  '{{count}} usuário(s) com roles administrativas no tenant.',
  '{{count}} usuário(s) com roles administrativas - acima do recomendado.',
  'Dados de roles não disponíveis.',
  'Quanto mais usuários privilegiados, maior a superfície de ataque.',
  'Dificuldade de auditoria e controle de acesso.',
  '/directoryRoles/*/members',
  '{"type": "count_threshold", "field": "totalPrivilegedUsers", "threshold": 30, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'ADM-004', 'Usuários com Múltiplas Roles Admin', 'Identifica usuários com mais de 2 roles administrativas', 'admin_privileges', 'medium', 3,
  'Revise usuários com múltiplas roles > Distribua responsabilidades entre pessoas diferentes.',
  'Nenhum usuário com acúmulo excessivo de roles.',
  '{{count}} usuário(s) com mais de 2 roles administrativas.',
  'Dados de roles não disponíveis.',
  'Acúmulo de roles viola segregação de funções.',
  'Risco de fraude e dificuldade de auditoria.',
  '/directoryRoles/*/members',
  '{"type": "count_threshold", "field": "multiRoleAdmins", "threshold": 5, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'ADM-005', 'Guests com Roles Administrativas', 'Detecta usuários guest com roles administrativas', 'admin_privileges', 'critical', 8,
  'Remova guests de roles administrativas imediatamente > Converta para usuário interno se necessário.',
  'Nenhum guest possui roles administrativas.',
  '{{count}} usuário(s) guest(s) com roles administrativas!',
  'Dados de roles não disponíveis.',
  'Guests com privilégios elevados são alto risco de segurança.',
  'Usuários externos com controle do tenant.',
  '/directoryRoles/*/members',
  '{"type": "count_threshold", "field": "guestAdmins", "threshold": 0, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'ADM-006', 'Service Principals com Roles Admin', 'Detecta service principals com roles administrativas', 'admin_privileges', 'medium', 4,
  'Revise SPs com roles administrativas > Use Managed Identities quando possível > Limite permissões ao mínimo necessário.',
  'Nenhum service principal com roles administrativas.',
  '{{count}} service principal(s) com roles administrativas.',
  'Dados de roles não disponíveis.',
  'SPs com privilégios podem ser explorados se credenciais vazarem.',
  'Automações com acesso excessivo.',
  '/directoryRoles/*/members',
  '{"type": "count_threshold", "field": "spAdmins", "threshold": 3, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== AUTH & ACCESS (AUT-001 a AUT-007) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'AUT-001', 'Security Defaults', 'Verifica se Security Defaults está habilitado', 'auth_access', 'medium', 4,
  'Habilite Security Defaults ou configure Conditional Access equivalente.',
  'Security Defaults está habilitado - proteções básicas ativas.',
  'Security Defaults está desabilitado. Verifique se Conditional Access está configurado.',
  'Status de Security Defaults não disponível.',
  'Sem Security Defaults ou Conditional Access, o tenant fica sem proteções básicas.',
  'Maior exposição a ataques comuns como password spray.',
  '/policies/identitySecurityDefaultsEnforcementPolicy',
  '{"type": "boolean", "field": "isEnabled", "expected": true}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'AUT-002', 'Políticas de Conditional Access', 'Verifica quantidade de políticas de CA ativas', 'auth_access', 'high', 5,
  'Crie políticas de Conditional Access para cenários críticos > Exija MFA para administradores e sign-ins de risco.',
  '{{count}} política(s) de Conditional Access ativa(s).',
  'Nenhuma política de Conditional Access configurada!',
  'Dados de Conditional Access não disponíveis.',
  'Sem Conditional Access, não há controle de acesso baseado em contexto.',
  'Qualquer pessoa pode acessar recursos de qualquer lugar.',
  '/identity/conditionalAccess/policies',
  '{"type": "count_threshold", "field": "enabledPolicies", "threshold": 0, "operator": "eq"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'AUT-003', 'Detecções de Risco (7 dias)', 'Monitora detecções de risco de sign-in nos últimos 7 dias', 'auth_access', 'critical', 8,
  'Investigue cada detecção de risco alto > Force reset de senha para usuários comprometidos > Configure políticas de risco automatizadas.',
  'Nenhuma detecção de risco nos últimos 7 dias.',
  '{{count}} detecção(ões): {{highRisk}} alta, {{mediumRisk}} média.',
  'Dados de detecção de risco não disponíveis (requer Azure AD P2).',
  'Detecções de risco indicam possíveis tentativas de comprometimento.',
  'Contas podem estar comprometidas ativamente.',
  '/identityProtection/riskDetections',
  '{"type": "risk_detection", "highThreshold": 0, "mediumThreshold": 5}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'AUT-004', 'Usuários de Risco', 'Monitora usuários marcados como em risco ou comprometidos', 'auth_access', 'critical', 10,
  'Force reset de senha imediato para confirmados > Investigue usuários em risco > Revogue sessões ativas.',
  'Nenhum usuário de risco identificado.',
  '{{count}} usuário(s) de risco: {{confirmed}} confirmado(s), {{atRisk}} em risco.',
  'Dados de usuários de risco não disponíveis (requer Azure AD P2).',
  'Usuários de risco podem ter credenciais comprometidas.',
  'Acesso não autorizado a dados e sistemas.',
  '/identityProtection/riskyUsers',
  '{"type": "risk_users", "confirmedThreshold": 0, "atRiskThreshold": 5}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'AUT-005', 'Métodos de Autenticação Configurados', 'Verifica quantos métodos de autenticação estão habilitados', 'auth_access', 'low', 0,
  'Habilite múltiplos métodos de autenticação > Priorize Authenticator e passkeys.',
  '{{count}} método(s) de autenticação habilitado(s).',
  '{{count}} método(s) de autenticação habilitado(s) - considere adicionar mais.',
  'Dados de métodos de autenticação não disponíveis.',
  'Poucos métodos limitam opções de recuperação e MFA.',
  'Usuários podem ter dificuldade em recuperar acesso.',
  '/policies/authenticationMethodsPolicy',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'AUT-007', 'Locais Nomeados (Named Locations)', 'Verifica se Named Locations estão configurados', 'auth_access', 'medium', 2,
  'Configure IPs/países confiáveis > Use em políticas de CA para acesso condicional.',
  '{{count}} local(is) configurado(s), {{trusted}} confiável(is).',
  'Nenhum local nomeado configurado.',
  'Dados de Named Locations não disponíveis.',
  'Sem named locations, não é possível aplicar políticas baseadas em localização.',
  'Falta de controle de acesso geográfico.',
  '/identity/conditionalAccess/namedLocations',
  '{"type": "count_threshold", "field": "locations", "threshold": 0, "operator": "eq"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== APPS & INTEGRATIONS (APP-001 a APP-007) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'APP-001', 'Credenciais Expirando em 30 dias', 'Identifica aplicações com credenciais prestes a expirar', 'apps_integrations', 'high', 4,
  'Acesse cada aplicação listada > Renove as credenciais antes da expiração > Configure alertas de expiração.',
  'Nenhuma credencial expirando em breve.',
  '{{count}} aplicação(ões) com credenciais expirando.',
  'Dados de credenciais não disponíveis.',
  'Credenciais expiradas podem causar interrupção de serviços.',
  'Integrações podem parar de funcionar sem aviso.',
  '/applications',
  '{"type": "count_threshold", "field": "expiringApps", "threshold": 5, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'APP-002', 'Credenciais Expiradas', 'Identifica aplicações com credenciais já expiradas', 'apps_integrations', 'high', 5,
  'Verifique se a aplicação ainda é necessária > Renove ou remova credenciais expiradas.',
  'Nenhuma credencial expirada.',
  '{{count}} aplicação(ões) com credenciais já expiradas.',
  'Dados de credenciais não disponíveis.',
  'Apps com credenciais expiradas não funcionam e podem indicar apps abandonados.',
  'Serviços dependentes podem estar indisponíveis.',
  '/applications',
  '{"type": "count_threshold", "field": "expiredApps", "threshold": 0, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'APP-003', 'Apps com Permissões Elevadas', 'Identifica aplicações com permissões de alto privilégio', 'apps_integrations', 'high', 5,
  'Revise permissões de cada app > Remova permissões não necessárias > Use permissões delegadas quando possível.',
  'Nenhum app com permissões excessivas detectado.',
  '{{count}} app(s) com permissões de alto privilégio.',
  'Dados de permissões não disponíveis.',
  'Apps com permissões elevadas podem causar danos significativos se comprometidos.',
  'Risco de vazamento de dados em larga escala.',
  '/applications',
  '{"type": "count_threshold", "field": "highPrivilegeApps", "threshold": 10, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'APP-004', 'Apps sem Owner Definido', 'Identifica aplicações sem owner atribuído', 'apps_integrations', 'medium', 3,
  'Identifique responsável por cada app > Adicione owners apropriados > Remova apps abandonados.',
  'Todos os apps têm owners definidos.',
  '{{count}} app(s) sem owner definido.',
  'Dados de owners não disponíveis.',
  'Apps órfãos dificultam gestão e podem ser abandonados.',
  'Falta de responsável para manutenção e segurança.',
  '/applications?$expand=owners',
  '{"type": "count_threshold", "field": "noOwnerApps", "threshold": 10, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'APP-005', 'Consentimentos OAuth (Admin Consent)', 'Monitora consentimentos admin-level para aplicações', 'apps_integrations', 'medium', 3,
  'Revise consentimentos admin-level > Revogue consentimentos não necessários > Configure admin consent workflow.',
  '{{count}} consentimento(s) para todos os usuários.',
  '{{count}} consentimento(s) para todos os usuários - acima do esperado.',
  'Dados de consentimentos não disponíveis.',
  'Admin consents dão acesso amplo a apps de terceiros.',
  'Dados de todos os usuários acessíveis por terceiros.',
  '/oauth2PermissionGrants',
  '{"type": "count_threshold", "field": "allPrincipalsGrants", "threshold": 20, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'APP-006', 'Service Principals (Enterprise Apps)', 'Contagem de Enterprise Applications no tenant', 'apps_integrations', 'info', 0,
  'Revise enterprise apps periodicamente > Remova apps não utilizados.',
  '{{count}} enterprise application(s) no tenant.',
  '{{count}} enterprise application(s) no tenant.',
  'Dados de service principals não disponíveis.',
  'Muitos enterprise apps aumentam superfície de ataque.',
  'Visibilidade de aplicações de terceiros.',
  '/servicePrincipals',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'APP-007', 'App Registrations', 'Contagem de App Registrations no tenant', 'apps_integrations', 'info', 0,
  'Revise app registrations periodicamente > Remova apps não utilizados.',
  '{{count}} app registration(s) no tenant.',
  '{{count}} app registration(s) no tenant.',
  'Dados de applications não disponíveis.',
  'Apps não utilizados devem ser removidos.',
  'Manutenção de diretório de aplicações.',
  '/applications',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== EMAIL & EXCHANGE (EXO-001 a EXO-005) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'EXO-001', 'Redirecionamento Externo de Email', 'Detecta regras de inbox redirecionando para fora do domínio', 'email_exchange', 'critical', 8,
  'Investigue cada regra listada > Confirme com usuários se são legítimas > Configure transport rule para bloquear auto-forward.',
  'Nenhuma regra de redirecionamento externo detectada.',
  '{{count}} regra(s) redirecionando para fora do domínio!',
  'Dados de regras de email não disponíveis.',
  'Forwarding externo pode exfiltrar dados automaticamente.',
  'Vazamento de informações confidenciais.',
  '/users/{id}/mailFolders/inbox/messageRules',
  '{"type": "count_threshold", "field": "externalForwarding", "threshold": 0, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'EXO-002', 'Redirecionamento Interno de Email', 'Monitora regras de forwarding interno', 'email_exchange', 'low', 0,
  'Revise regras de forwarding interno > Valide necessidade com usuários.',
  '{{count}} regra(s) de forwarding interno na amostra.',
  '{{count}} regra(s) de forwarding interno na amostra.',
  'Dados de regras de email não disponíveis.',
  'Forwarding interno pode indicar compartilhamento não autorizado.',
  'Possível vazamento interno de informações.',
  '/users/{id}/mailFolders/inbox/messageRules',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'EXO-003', 'Auto-Respostas Permanentes', 'Detecta usuários com auto-resposta sempre ativa', 'email_exchange', 'low', 0,
  'Revise auto-respostas permanentes > Configure política de OOF.',
  '{{count}} usuário(s) com auto-resposta sempre ativa na amostra.',
  '{{count}} usuário(s) com auto-resposta sempre ativa na amostra.',
  'Dados de mailbox settings não disponíveis.',
  'Auto-respostas permanentes podem vazar informações.',
  'Exposição de estrutura organizacional.',
  '/users/{id}/mailboxSettings',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'EXO-004', 'Mailboxes Analisadas', 'Contagem de mailboxes analisadas na amostra', 'email_exchange', 'info', 0,
  'Execute análise completa via PowerShell se necessário.',
  'Amostra de {{count}} mailbox(es) analisada(s).',
  'Amostra de {{count}} mailbox(es) analisada(s).',
  'Dados de mailboxes não disponíveis.',
  'Análise baseada em amostra representativa.',
  'Visibilidade parcial das configurações de email.',
  '/users',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'EXO-005', 'Acesso a Mailboxes (Graph API)', 'Verificação de acesso a mailboxes via Graph API', 'email_exchange', 'info', 0,
  'Revise delegações via Exchange Admin Center > Use Get-MailboxPermission para análise detalhada.',
  'Verificação de acesso realizada em {{count}} mailbox(es).',
  'Verificação de acesso realizada em {{count}} mailbox(es).',
  'Dados de mailbox folders não disponíveis.',
  'Para análise completa de delegação, use Exchange PowerShell.',
  'Delegações excessivas podem violar compliance.',
  '/users/{id}/mailFolders',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== THREATS & ACTIVITY (THR-001 a THR-005) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'THR-001', 'Alertas de Segurança Ativos', 'Monitora alertas de segurança não resolvidos', 'threats_activity', 'critical', 8,
  'Investigue cada alerta ativo > Priorize alertas de alta severidade > Documente ações de resposta.',
  'Nenhum alerta de segurança ativo.',
  '{{count}} alerta(s) ativo(s): {{high}} alto(s), {{medium}} médio(s).',
  'Dados de alertas de segurança não disponíveis.',
  'Alertas indicam possíveis ameaças ativas.',
  'Potencial comprometimento de sistemas.',
  '/security/alerts_v2',
  '{"type": "severity_count", "highThreshold": 0, "mediumThreshold": 5}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'THR-002', 'Sign-ins por País (7 dias)', 'Analisa distribuição geográfica de sign-ins', 'threats_activity', 'medium', 3,
  'Revise sign-ins de países incomuns > Configure Named Locations > Aplique políticas de CA por localização.',
  '{{count}} sign-in(s) de {{countries}} país(es). Principal: {{topCountry}}.',
  '{{count}} sign-in(s) de {{countries}} país(es) - países incomuns detectados.',
  'Dados de sign-ins não disponíveis (requer Azure AD P1).',
  'Sign-ins de múltiplos países podem indicar comprometimento.',
  'Acesso não autorizado de locais incomuns.',
  '/auditLogs/signIns',
  '{"type": "count_threshold", "field": "unusualCountries", "threshold": 5, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'THR-003', 'Sign-ins com Falha (7 dias)', 'Monitora sign-ins com falha nos últimos 7 dias', 'threats_activity', 'high', 5,
  'Investigue padrões de falha > Verifique se são ataques > Configure Smart Lockout.',
  '{{count}} sign-in(s) com falha detectado(s).',
  '{{count}} sign-in(s) com falha detectado(s) - acima do esperado.',
  'Dados de sign-ins não disponíveis.',
  'Muitas falhas podem indicar ataques de brute force.',
  'Tentativas de comprometimento de contas.',
  '/auditLogs/signIns',
  '{"type": "count_threshold", "field": "failedSignIns", "threshold": 50, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'THR-004', 'Atividades Sensíveis (24h)', 'Monitora atividades de alto risco nas últimas 24 horas', 'threats_activity', 'medium', 3,
  'Revise atividades sensíveis > Configure alertas para ações críticas > Implemente SIEM.',
  '{{sensitive}} atividade(s) sensível(is) de {{total}} evento(s) total.',
  '{{sensitive}} atividade(s) sensível(is) de {{total}} evento(s) total - acima do esperado.',
  'Dados de audit logs não disponíveis.',
  'Atividades de alto risco devem ser monitoradas.',
  'Possíveis alterações não autorizadas.',
  '/auditLogs/directoryAudits',
  '{"type": "count_threshold", "field": "sensitiveActivities", "threshold": 20, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'THR-005', 'Microsoft Secure Score', 'Avalia o Secure Score do tenant Microsoft 365', 'threats_activity', 'critical', 7,
  'Revise as ações recomendadas > Priorize por impacto no score > Implemente melhorias gradualmente.',
  'Score atual: {{current}} de {{max}} ({{percentage}}%).',
  'Score atual: {{current}} de {{max}} ({{percentage}}%) - abaixo do recomendado.',
  'Dados de Secure Score não disponíveis.',
  'Secure Score baixo indica muitas recomendações de segurança não implementadas.',
  'Postura de segurança abaixo das melhores práticas Microsoft.',
  '/security/secureScores',
  '{"type": "percentage_threshold", "field": "percentage", "threshold": 60, "operator": "lt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== INTUNE & DEVICES (INT-001 a INT-006) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'INT-001', 'Dispositivos Não-Compliance', 'Identifica dispositivos fora de compliance no Intune', 'intune_devices', 'critical', 7,
  'Acesse o Intune Portal > Filtre dispositivos por compliance status > Investigue cada dispositivo não-compliance > Force sincronização ou aplique políticas corretivas.',
  'Todos os {{total}} dispositivos estão em compliance.',
  '{{count}} de {{total}} dispositivo(s) não está(ão) em compliance.',
  'Dados de dispositivos não disponíveis.',
  'Dispositivos fora de compliance podem estar sem criptografia, antivírus ou atualizações.',
  'Dados corporativos podem estar expostos em dispositivos inseguros.',
  '/deviceManagement/managedDevices',
  '{"type": "count_threshold", "field": "nonCompliant", "threshold": 10, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'INT-002', 'Dispositivos Sem Criptografia', 'Identifica dispositivos sem criptografia de disco', 'intune_devices', 'critical', 8,
  'Crie política de criptografia obrigatória (BitLocker/FileVault) > Aplique a todos os dispositivos corporativos > Monitore o status de criptografia.',
  'Todos os dispositivos possuem criptografia ativada.',
  '{{count}} dispositivo(s) sem criptografia de disco ativada.',
  'Dados de criptografia não disponíveis.',
  'Dispositivos sem criptografia expõem dados em caso de perda ou roubo.',
  'Vazamento de dados sensíveis pode gerar multas e danos reputacionais.',
  '/deviceManagement/managedDevices?$select=isEncrypted',
  '{"type": "count_threshold", "field": "notEncrypted", "threshold": 5, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'INT-003', 'Dispositivos com Jailbreak/Root', 'Detecta dispositivos com jailbreak ou root', 'intune_devices', 'critical', 10,
  'Crie política que bloqueia dispositivos com jailbreak > Configure ação de bloqueio imediato > Notifique o usuário e revogue acesso.',
  'Nenhum dispositivo com jailbreak/root detectado.',
  '{{count}} dispositivo(s) com jailbreak/root detectado(s).',
  'Dados de jailbreak não disponíveis.',
  'Dispositivos modificados podem executar malware e ignorar controles de segurança.',
  'Risco severo de comprometimento de dados corporativos.',
  '/deviceManagement/managedDevices?$select=jailBroken',
  '{"type": "count_threshold", "field": "jailbroken", "threshold": 0, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'INT-004', 'Dispositivos com SO Desatualizado', 'Identifica dispositivos com sistema operacional desatualizado', 'intune_devices', 'high', 4,
  'Configure update rings para atualizações automáticas > Defina prazos para feature updates > Monitore compliance de versão.',
  'Todos os dispositivos estão com SO atualizado.',
  '{{count}} dispositivo(s) com sistema operacional desatualizado.',
  'Dados de versão de SO não disponíveis.',
  'SOs desatualizados contêm vulnerabilidades conhecidas sem patches.',
  'Maior exposição a exploits e malware.',
  '/deviceManagement/managedDevices?$select=osVersion',
  '{"type": "count_threshold", "field": "outdated", "threshold": 10, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'INT-005', 'Políticas de Compliance Configuradas', 'Verifica se há políticas de compliance configuradas no Intune', 'intune_devices', 'critical', 9,
  'Crie políticas para cada plataforma (Windows, iOS, Android) > Inclua requisitos de criptografia, senha e antivírus > Configure ações de não-compliance.',
  '{{count}} política(s) de compliance configurada(s).',
  'Nenhuma política de compliance configurada!',
  'Dados de políticas não disponíveis.',
  'Sem políticas de compliance, dispositivos não são avaliados quanto à segurança.',
  'Dispositivos inseguros podem acessar dados corporativos.',
  '/deviceManagement/deviceCompliancePolicies',
  '{"type": "count_threshold", "field": "policies", "threshold": 0, "operator": "eq"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'INT-006', 'Aplicativos Detectados em Dispositivos', 'Monitora aplicativos potencialmente arriscados em dispositivos', 'intune_devices', 'medium', 3,
  'Revise a lista de apps detectados > Crie políticas de proteção de app > Bloqueie apps não autorizados via compliance policy.',
  '{{count}} aplicativos inventariados - nenhum classificado como arriscado.',
  '{{count}} aplicativo(s) potencialmente arriscado(s) detectado(s) em dispositivos.',
  'Dados de aplicativos detectados não disponíveis.',
  'Aplicativos não gerenciados podem conter malware ou violar políticas.',
  'Shadow IT e possível vazamento de dados.',
  '/deviceManagement/detectedApps',
  '{"type": "count_threshold", "field": "riskyApps", "threshold": 0, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== PIM & GOVERNANCE (PIM-001 a PIM-004) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'PIM-001', 'Roles Elegíveis via PIM', 'Verifica se PIM está configurado com roles elegíveis', 'pim_governance', 'high', 6,
  'Configure PIM para todas as roles privilegiadas > Converta atribuições permanentes para elegíveis > Defina tempo máximo de ativação.',
  '{{count}} atribuição(ões) elegível(is) configurada(s) via PIM.',
  'PIM não está configurado ou não há roles elegíveis.',
  'Dados de PIM não disponíveis (requer licença Azure AD P2).',
  'Sem PIM, roles administrativas são permanentes e sempre ativas.',
  'Princípio de least privilege não está sendo aplicado.',
  '/roleManagement/directory/roleEligibilityScheduleInstances',
  '{"type": "count_threshold", "field": "eligibleAssignments", "threshold": 0, "operator": "eq"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'PIM-002', 'Ativações de Role Recentes (24h)', 'Monitora ativações de roles via PIM nas últimas 24 horas', 'pim_governance', 'info', 0,
  'Monitore ativações frequentes > Configure alertas para ativações suspeitas > Revise justificativas de ativação.',
  '{{count}} ativação(ões) de role nas últimas 24 horas.',
  '{{count}} ativação(ões) de role nas últimas 24 horas.',
  'Dados de ativações não disponíveis.',
  'Muitas ativações podem indicar uso excessivo de privilégios.',
  'Auditoria de uso de privilégios elevados.',
  '/roleManagement/directory/roleAssignmentScheduleInstances',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'PIM-003', 'Roles sem Requisito de Aprovação', 'Identifica roles que não requerem aprovação para ativação', 'pim_governance', 'medium', 4,
  'Configure requisito de aprovação para roles críticas > Defina aprovadores por role > Configure notificações para solicitações.',
  'Todas as roles verificadas possuem requisitos de aprovação.',
  '{{count}} role(s) privilegiada(s) não requer(em) aprovação para ativação.',
  'Dados de políticas de role não disponíveis.',
  'Roles sem aprovação podem ser ativadas instantaneamente sem supervisão.',
  'Ações privilegiadas podem ocorrer sem controle.',
  '/policies/roleManagementPolicies',
  '{"type": "count_threshold", "field": "rolesWithoutApproval", "threshold": 5, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'PIM-004', 'Proporção Permanente vs Elegível', 'Compara atribuições permanentes e elegíveis de roles', 'pim_governance', 'high', 5,
  'Identifique atribuições permanentes desnecessárias > Converta para elegíveis via PIM > Mantenha apenas emergency accounts como permanentes.',
  '{{permanent}} atribuição(ões) permanente(s) vs {{eligible}} elegível(is). {{ratio}}% são permanentes.',
  '{{permanent}} atribuição(ões) permanente(s) vs {{eligible}} elegível(is). {{ratio}}% são permanentes - acima do recomendado.',
  'Dados de atribuições não disponíveis.',
  'Alta proporção de roles permanentes indica baixa adoção de least privilege.',
  'Maior superfície de ataque com privilégios sempre ativos.',
  '/roleManagement/directory/roleAssignments',
  '{"type": "percentage_threshold", "field": "permanentRatio", "threshold": 50, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== SHAREPOINT & ONEDRIVE (SPO-001 a SPO-004) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'SPO-001', 'Sites com Compartilhamento Externo', 'Identifica sites SharePoint com compartilhamento externo habilitado', 'sharepoint_onedrive', 'high', 5,
  'Revise sites com compartilhamento externo > Restrinja compartilhamento para sites sensíveis > Configure domínios permitidos para compartilhamento.',
  'Nenhum site com compartilhamento externo habilitado.',
  '{{count}} de {{total}} site(s) permite(m) compartilhamento externo.',
  'Dados de sites não disponíveis.',
  'Compartilhamento externo pode expor dados sensíveis a terceiros.',
  'Risco de vazamento de informações confidenciais.',
  '/sites?$select=sharingCapability',
  '{"type": "count_threshold", "field": "externalSharingSites", "threshold": 20, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'SPO-002', 'Links de Compartilhamento Anônimos', 'Detecta links de compartilhamento anônimos em bibliotecas de documentos', 'sharepoint_onedrive', 'high', 6,
  'Desabilite links anônimos para sites sensíveis > Configure expiração automática de links > Prefira compartilhamento com autenticação.',
  'Nenhum link anônimo detectado nas bibliotecas verificadas.',
  '{{count}} link(s) anônimo(s) detectado(s) em bibliotecas de documentos.',
  'Dados de permissões de arquivos não disponíveis.',
  'Links anônimos permitem acesso sem autenticação.',
  'Qualquer pessoa com o link pode acessar os arquivos.',
  '/drives/{id}/root/permissions',
  '{"type": "count_threshold", "field": "anonymousLinksCount", "threshold": 10, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'SPO-003', 'Sites sem Label de Sensibilidade', 'Identifica sites sem sensitivity label configurado', 'sharepoint_onedrive', 'medium', 3,
  'Configure sensitivity labels no Microsoft Purview > Publique labels para sites SharePoint > Considere labels padrão para novos sites.',
  'Todos os sites possuem labels de sensibilidade configurados.',
  '{{count}} de {{total}} site(s) não possui(em) label de sensibilidade.',
  'Dados de sensitivity labels não disponíveis.',
  'Sites sem classificação podem conter dados sensíveis sem proteção adequada.',
  'Dificuldade em aplicar políticas de DLP e proteção.',
  '/sites?$select=sensitivityLabel',
  '{"type": "percentage_threshold", "field": "unlabeledPercentage", "threshold": 80, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'SPO-004', 'OneDrive com Compartilhamento Amplo', 'Monitora usuários com muitos arquivos compartilhados amplamente no OneDrive', 'sharepoint_onedrive', 'medium', 3,
  'Configure restrições de compartilhamento para OneDrive > Defina limites de expiração para links > Treine usuários sobre práticas seguras.',
  'Padrões de compartilhamento no OneDrive estão adequados.',
  '{{count}} usuário(s) com muitos arquivos compartilhados amplamente no OneDrive.',
  'Dados de OneDrive não disponíveis.',
  'Compartilhamento amplo no OneDrive pode expor dados pessoais e corporativos.',
  'Potencial vazamento de informações sensíveis.',
  '/users/{id}/drive/root/permissions',
  '{"type": "count_threshold", "field": "wideShareCount", "threshold": 5, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== TEAMS & COLLABORATION (TMS-001 a TMS-004) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'TMS-001', 'Teams com Membros Convidados', 'Identifica Teams que possuem membros guest', 'teams_collaboration', 'medium', 3,
  'Revise teams com muitos guests > Configure políticas de acesso de guest > Considere access reviews para guests.',
  'Nenhum team com membros convidados encontrado.',
  '{{count}} de {{total}} team(s) possui(em) membros convidados (guests).',
  'Dados de membros de Teams não disponíveis.',
  'Guests podem ter acesso a informações internas através do Teams.',
  'Potencial exposição de dados a parceiros externos.',
  '/groups/{id}/members',
  '{"type": "count_threshold", "field": "teamsWithGuests", "threshold": 20, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'TMS-002', 'Teams Públicos', 'Identifica Teams configurados como públicos', 'teams_collaboration', 'medium', 2,
  'Revise teams públicos com dados sensíveis > Altere para privado quando apropriado > Configure políticas de criação de teams.',
  'Nenhum team público encontrado.',
  '{{count}} team(s) configurado(s) como público(s) - qualquer usuário pode ingressar.',
  'Dados de visibilidade de Teams não disponíveis.',
  'Teams públicos permitem que qualquer funcionário acesse o conteúdo.',
  'Informações podem ser acessadas sem aprovação.',
  '/groups?$filter=visibility eq Public',
  '{"type": "count_threshold", "field": "publicTeams", "threshold": 30, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'TMS-003', 'Teams sem Owner ou com Owner Único', 'Identifica Teams sem owner ou com apenas um owner', 'teams_collaboration', 'high', 4,
  'Identifique teams sem owner > Atribua pelo menos 2 owners por team > Configure alertas para teams órfãos.',
  'Todos os teams têm múltiplos owners configurados.',
  '{{count}} team(s) sem owner ou com apenas 1 owner.',
  'Dados de owners de Teams não disponíveis.',
  'Teams sem owner podem ficar órfãos e sem gestão.',
  'Dificuldade em gerenciar acesso e conteúdo.',
  '/groups/{id}/owners',
  '{"type": "count_threshold", "field": "teamsWithoutOwners", "threshold": 10, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'TMS-004', 'Canais Privados no Teams', 'Monitora canais privados em Teams', 'teams_collaboration', 'info', 0,
  'Revise políticas de canais privados > Monitore criação de canais privados > Implemente governança para canais sensíveis.',
  '{{count}} canal(is) privado(s) em {{teams}} team(s).',
  '{{count}} canal(is) privado(s) em {{teams}} team(s).',
  'Dados de canais não disponíveis.',
  'Canais privados podem conter dados sensíveis com acesso restrito.',
  'Visibilidade de governança sobre canais privados.',
  '/teams/{id}/channels',
  '{"type": "informational"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

-- ========== DEFENDER & DLP (DEF-001 a DEF-005) ==========

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'DEF-001', 'Alertas de Segurança Ativos', 'Monitora alertas ativos no Microsoft Defender', 'defender_security', 'critical', 8,
  'Investigue alertas de alta severidade primeiro > Tome ações de remediação recomendadas > Documente e feche alertas resolvidos.',
  'Nenhum alerta de segurança ativo.',
  '{{count}} alerta(s) ativo(s), sendo {{high}} de alta/média severidade.',
  'Dados de alertas do Defender não disponíveis.',
  'Alertas não resolvidos indicam potenciais ameaças em andamento.',
  'Comprometimento de segurança pode levar a vazamento de dados.',
  '/security/alerts_v2',
  '{"type": "severity_count", "highThreshold": 5}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'DEF-002', 'Incidentes de Segurança Ativos', 'Monitora incidentes não resolvidos no Microsoft Defender', 'defender_security', 'critical', 9,
  'Priorize incidentes por severidade > Siga playbook de resposta a incidentes > Documente lições aprendidas.',
  'Nenhum incidente de segurança ativo.',
  '{{count}} incidente(s) não resolvido(s), {{active}} em investigação ativa.',
  'Dados de incidentes não disponíveis.',
  'Incidentes representam ameaças confirmadas ao ambiente.',
  'Incidentes não tratados podem escalar para brechas de segurança.',
  '/security/incidents',
  '{"type": "count_threshold", "field": "activeIncidents", "threshold": 2, "operator": "gt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'DEF-003', 'Simulações de Phishing', 'Avalia resultados de simulações de phishing do Attack Simulation Training', 'defender_security', 'high', 5,
  'Execute simulações de phishing regularmente > Atribua treinamento a usuários comprometidos > Monitore evolução da taxa de cliques.',
  '{{count}} simulação(ões) executada(s). Taxa de comprometimento: {{rate}}%.',
  'Nenhuma simulação de phishing foi executada recentemente ou taxa de comprometimento alta.',
  'Dados de Attack Simulation Training não disponíveis.',
  'Sem treinamento, usuários são mais vulneráveis a phishing real. Usuários que caíram em simulações precisam de treinamento adicional.',
  'Phishing é o principal vetor de ataques cibernéticos.',
  '/security/attackSimulation/simulations',
  '{"type": "simulation_rate", "threshold": 30}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'DEF-004', 'Microsoft Secure Score', 'Avalia o Secure Score do Microsoft Defender', 'defender_security', 'critical', 7,
  'Revise as ações recomendadas > Priorize por impacto no score > Implemente melhorias gradualmente.',
  'Score atual: {{current}} de {{max}} ({{percentage}}%).',
  'Score atual: {{current}} de {{max}} ({{percentage}}%) - abaixo do recomendado.',
  'Dados de Secure Score não disponíveis.',
  'Secure Score baixo indica muitas recomendações de segurança não implementadas.',
  'Postura de segurança abaixo das melhores práticas Microsoft.',
  '/security/secureScores',
  '{"type": "percentage_threshold", "field": "percentage", "threshold": 60, "operator": "lt"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, not_found_description, technical_risk, business_impact, api_endpoint, evaluation_logic, is_active)
SELECT dt.id, 'DEF-005', 'Labels de Proteção de Informação', 'Verifica configuração de sensitivity labels para DLP', 'defender_security', 'high', 5,
  'Defina taxonomia de classificação > Crie labels (Público, Interno, Confidencial, Restrito) > Configure proteção automática por label.',
  '{{count}} label(s) de sensibilidade configurado(s).',
  'Nenhum label de sensibilidade configurado ou poucos labels.',
  'Dados de sensitivity labels não disponíveis.',
  'Sem labels, dados sensíveis não são classificados nem protegidos automaticamente.',
  'Dificuldade em aplicar DLP e proteger dados críticos.',
  '/informationProtection/policy/labels',
  '{"type": "count_threshold", "field": "labels", "threshold": 0, "operator": "eq"}'::jsonb, true
FROM device_types dt WHERE dt.code = 'm365'
ON CONFLICT DO NOTHING;