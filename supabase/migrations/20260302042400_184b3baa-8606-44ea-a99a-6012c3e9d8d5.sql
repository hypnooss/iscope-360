
-- =============================================
-- FASE 1: Correções imediatas
-- =============================================

-- 1. Remove sharepoint_external_sharing step from SharePoint blueprint
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT COALESCE(jsonb_agg(step), '[]'::jsonb)
    FROM jsonb_array_elements(collection_steps->'steps') AS step
    WHERE step->>'id' != 'sharepoint_external_sharing'
  )
),
updated_at = now()
WHERE device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
  AND is_active = true
  AND name ILIKE '%SharePoint%';

-- 2. Mark teams_settings step as optional
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN step->>'id' = 'teams_settings' THEN step || '{"optional": true}'::jsonb
        ELSE step
      END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  )
),
updated_at = now()
WHERE device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
  AND is_active = true
  AND name ILIKE '%Teams%';

-- 3. Add AUT-006 (Legacy Auth Block) if missing
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'AUT-006',
  'Bloqueio de Autenticação Legada',
  'Verifica se existe uma política de Acesso Condicional bloqueando protocolos de autenticação legada (ActiveSync, IMAP, POP3, etc.)',
  'auth_access',
  'critical',
  8,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "conditional_access_policies", "evaluate": {"type": "check_legacy_auth_block"}}'::jsonb,
  'Criar uma política de Acesso Condicional que bloqueie protocolos legados: Entra ID > Proteção > Acesso Condicional > Nova Política > Condições > Apps Cliente > Exchange ActiveSync e Outros clientes > Bloquear',
  'Autenticação legada está bloqueada por política de Acesso Condicional.',
  'Nenhuma política de Acesso Condicional bloqueia autenticação legada. Protocolos como IMAP, POP3 e ActiveSync podem ser explorados para bypass de MFA.',
  'Dados de políticas de Acesso Condicional não disponíveis.',
  'Protocolos legados (IMAP, POP3, SMTP, ActiveSync) não suportam MFA e são alvo frequente de ataques de credential stuffing e password spray.',
  'Comprometimento de contas corporativas via protocolos legados que ignoram MFA, permitindo acesso não autorizado a email e dados sensíveis.',
  '/identity/conditionalAccess/policies'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules
  WHERE code = 'AUT-006'
    AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- 4. Create EXO-022 (Suspicious Inbox Rules) rule
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'EXO-022',
  'Regras de Inbox Suspeitas (Forward/Redirect)',
  'Detecta regras de inbox que encaminham ou redirecionam emails para endereços externos, um indicador comum de comprometimento de conta.',
  'email_exchange',
  'critical',
  9,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "exo_inbox_rules", "evaluate": {"type": "check_suspicious_inbox_rules"}}'::jsonb,
  'Revisar e remover regras de inbox suspeitas: Exchange Admin Center > Mailboxes > Selecionar usuário > Mail Flow > Inbox Rules. Investigar possível comprometimento de conta.',
  'Nenhuma regra de inbox suspeita com encaminhamento/redirecionamento externo detectada.',
  '{count} regra(s) de inbox suspeita(s) detectada(s) com encaminhamento ou redirecionamento para endereços externos.',
  'Dados de regras de inbox não disponíveis. A coleta via Agent PowerShell pode não ter sido executada.',
  'Regras de inbox com ForwardTo/RedirectTo para endereços externos são frequentemente criadas por atacantes após comprometimento de conta para exfiltrar dados silenciosamente.',
  'Vazamento contínuo e silencioso de informações confidenciais, comunicações internas e dados financeiros para endereços controlados por atacantes.',
  'Get-InboxRule (PowerShell/Agent)'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules
  WHERE code = 'EXO-022'
    AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- =============================================
-- FASE 2: Novas regras com dados já disponíveis
-- =============================================

-- AUT-008: Password Expiration Policy
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'AUT-008',
  'Política de Expiração de Senha',
  'Verifica se os domínios verificados do tenant possuem política de expiração de senha configurada (não infinita).',
  'auth_access',
  'high',
  6,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "domains", "evaluate": {"type": "check_password_expiration"}}'::jsonb,
  'Configurar política de expiração de senha: Microsoft 365 Admin Center > Settings > Org Settings > Security & Privacy > Password expiration policy. A Microsoft recomenda desativar expiração se MFA estiver habilitado.',
  'Política de expiração de senha configurada adequadamente nos domínios verificados.',
  '{count} domínio(s) com expiração de senha infinita (2147483647 dias ou não definida). Sem MFA habilitado, isso permite que senhas comprometidas sejam usadas indefinidamente.',
  'Dados de domínios não disponíveis.',
  'Senhas sem expiração em ambientes sem MFA podem permanecer comprometidas por longos períodos sem detecção.',
  'Contas com senhas comprometidas permanecem acessíveis indefinidamente, aumentando janela de exposição a ataques.',
  '/domains'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules WHERE code = 'AUT-008' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- AUT-009: Self-Service Password Reset
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'AUT-009',
  'Self-Service Password Reset (SSPR)',
  'Verifica se o Self-Service Password Reset está habilitado para reduzir chamados de suporte e melhorar a experiência do usuário.',
  'auth_access',
  'medium',
  4,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "authorization_policy", "evaluate": {"type": "check_sspr_enabled"}}'::jsonb,
  'Habilitar SSPR: Entra ID > Proteção > Password Reset > Habilitar para All Users. Configurar métodos de autenticação e registro obrigatório.',
  'Self-Service Password Reset (SSPR) está habilitado para os usuários.',
  'Self-Service Password Reset (SSPR) não está habilitado. Usuários dependem de help desk para redefinição de senhas.',
  'Dados da política de autorização não disponíveis.',
  'Sem SSPR, usuários podem recorrer a práticas inseguras (anotar senhas) quando não conseguem redefinir, e o tempo de recuperação de conta comprometida aumenta.',
  'Aumento de chamados de suporte, downtime do usuário e possível uso prolongado de credenciais comprometidas até intervenção manual do helpdesk.',
  '/policies/authorizationPolicy'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules WHERE code = 'AUT-009' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- AUT-010: CA with Sign-In Risk
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'AUT-010',
  'Acesso Condicional com Risco de Sign-In',
  'Verifica se existe política de Acesso Condicional que considera o nível de risco do sign-in (Identity Protection).',
  'auth_access',
  'high',
  7,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "conditional_access_policies", "evaluate": {"type": "check_ca_signin_risk"}}'::jsonb,
  'Criar política de CA baseada em risco: Entra ID > Proteção > Acesso Condicional > Nova Política > Condições > Sign-in Risk > Selecionar High e Medium > Exigir MFA ou Bloquear.',
  'Existe política de Acesso Condicional ativa que avalia risco de sign-in.',
  'Nenhuma política de Acesso Condicional avalia o risco de sign-in. Tentativas de login de locais anômalos ou com padrões suspeitos não são bloqueadas automaticamente.',
  'Dados de políticas de Acesso Condicional não disponíveis.',
  'Sem políticas baseadas em risco de sign-in, o sistema não responde automaticamente a logins de IPs maliciosos, viagens impossíveis ou padrões de ataque conhecidos.',
  'Contas podem ser comprometidas por ataques sofisticados que seriam detectados e bloqueados automaticamente por políticas de risco.',
  '/identity/conditionalAccess/policies'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules WHERE code = 'AUT-010' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- AUT-011: CA with User Risk
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'AUT-011',
  'Acesso Condicional com Risco de Usuário',
  'Verifica se existe política de Acesso Condicional que considera o nível de risco do usuário (Identity Protection).',
  'auth_access',
  'high',
  7,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "conditional_access_policies", "evaluate": {"type": "check_ca_user_risk"}}'::jsonb,
  'Criar política de CA baseada em risco do usuário: Entra ID > Proteção > Acesso Condicional > Nova Política > Condições > User Risk > Selecionar High > Exigir alteração de senha ou Bloquear.',
  'Existe política de Acesso Condicional ativa que avalia risco do usuário.',
  'Nenhuma política de Acesso Condicional avalia o risco do usuário. Contas sinalizadas como comprometidas pelo Identity Protection não são forçadas a trocar senha.',
  'Dados de políticas de Acesso Condicional não disponíveis.',
  'Sem políticas de risco de usuário, contas com credenciais vazadas ou comportamento anômalo continuam operando normalmente sem exigência de remediação.',
  'Usuários com alto risco de comprometimento mantêm acesso irrestrito a recursos corporativos, ampliando a superfície de ataque.',
  '/identity/conditionalAccess/policies'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules WHERE code = 'AUT-011' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- ADM-007: Break Glass Accounts
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'ADM-007',
  'Contas de Emergência (Break Glass)',
  'Verifica se existem contas de acesso de emergência entre os Global Admins, essenciais para recuperação em cenários de lockout.',
  'admin_privileges',
  'critical',
  8,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "directory_roles_members", "secondary_source_key": "mfa_registration_details", "evaluate": {"type": "check_break_glass_accounts"}}'::jsonb,
  'Criar pelo menos 2 contas de emergência cloud-only, excluídas de Acesso Condicional e MFA. Documentar senhas em cofre físico seguro. Monitorar uso via Log Analytics.',
  'Foram identificadas {count} conta(s) de emergência (break glass) entre os Global Admins.',
  'Nenhuma conta de emergência (break glass) identificada. Em cenário de lockout de MFA ou falha de IdP federado, não há forma de recuperar acesso administrativo.',
  'Dados de roles de diretório não disponíveis.',
  'Sem contas de emergência, um lockout de MFA, falha de IdP federado ou perda de acesso de todos os admins resulta em perda total de controle do tenant.',
  'Impossibilidade de administrar o tenant em situações de emergência, exigindo processo lento e burocrático de recuperação via Microsoft Support.',
  '/directoryRoles (expand members)'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules WHERE code = 'ADM-007' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- APP-008: Long-Lived Credentials
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'APP-008',
  'Aplicações com Credenciais de Longa Duração',
  'Detecta aplicações registradas cujas credenciais (certificates/secrets) possuem validade superior a 2 anos.',
  'apps_integrations',
  'medium',
  5,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "app_registrations", "evaluate": {"type": "count_long_lived_credentials", "max_days": 730}}'::jsonb,
  'Rotacionar credenciais de aplicações para validade máxima de 1-2 anos: Entra ID > App Registrations > Selecionar app > Certificates & Secrets > Adicionar nova credencial e remover a antiga.',
  'Nenhuma aplicação com credenciais de longa duração (>2 anos) detectada.',
  '{count} aplicação(ões) possuem credenciais (certificates/secrets) com validade superior a 2 anos.',
  'Dados de aplicações registradas não disponíveis.',
  'Credenciais de longa duração aumentam a janela de exposição em caso de vazamento, pois a chave comprometida permanece válida por muito mais tempo.',
  'Aplicações com credenciais comprometidas mantêm acesso aos recursos do tenant por períodos prolongados sem exigência de rotação.',
  '/applications'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules WHERE code = 'APP-008' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- IDT-007: Users Without License
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight, device_type_id, is_active,
  evaluation_logic, recommendation, pass_description, fail_description, not_found_description,
  technical_risk, business_impact, api_endpoint
)
SELECT
  'IDT-007',
  'Usuários Sem Licença Atribuída',
  'Identifica usuários habilitados que não possuem nenhuma licença atribuída, indicando possíveis contas órfãs ou shadow IT.',
  'identities',
  'low',
  2,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  true,
  '{"source_key": "users_signin_activity", "evaluate": {"type": "count_unlicensed_users"}}'::jsonb,
  'Revisar e desativar contas sem licença: Entra ID > Usuários > Filtrar por licença não atribuída > Desativar ou excluir contas desnecessárias.',
  'Todos os usuários habilitados possuem pelo menos uma licença atribuída.',
  '{count} usuário(s) habilitado(s) sem licença atribuída. Podem ser contas órfãs que ampliam a superfície de ataque.',
  'Dados de usuários não disponíveis.',
  'Contas sem licença podem indicar contas abandonadas, de teste ou criadas por atacantes, representando vetores de ataque latentes.',
  'Contas não gerenciadas e sem licença consomem identidades no diretório e podem ser alvos de comprometimento sem monitoramento adequado.',
  '/users (signInActivity, assignedLicenses)'
WHERE NOT EXISTS (
  SELECT 1 FROM compliance_rules WHERE code = 'IDT-007' AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
);

-- 5. Add authorization_policy step to Entra ID blueprint
UPDATE device_blueprints
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  collection_steps->'steps' || '[
    {
      "id": "authorization_policy",
      "name": "Authorization Policy (SSPR)",
      "executor": "edge_function",
      "runtime": "graph_api",
      "category": "auth_access",
      "config": {
        "endpoint": "/policies/authorizationPolicy",
        "method": "GET",
        "api_version": "v1.0"
      }
    }
  ]'::jsonb
),
updated_at = now()
WHERE device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
  AND is_active = true
  AND name ILIKE '%Entra%'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(collection_steps->'steps') AS step
    WHERE step->>'id' = 'authorization_policy'
  );

-- 6. Clean up inactive EXO placeholder rules (EXO-002, 003, 004, 005)
DELETE FROM compliance_rules
WHERE code IN ('EXO-002', 'EXO-003', 'EXO-004', 'EXO-005')
  AND device_type_id = '5d1a7095-2d7b-4541-873d-4b03c3d6122f'
  AND is_active = false;
