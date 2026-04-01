-- Preencher guias de correção faltantes para regras de Domínio Externo

-- DKIM-003 - Redundância DKIM
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Múltiplos seletores DKIM',
  'Ter mais de um seletor DKIM configurado para garantir continuidade caso um precise ser rotacionado.',
  'Com apenas um seletor DKIM, a rotação de chaves pode causar falhas temporárias na autenticação de emails.',
  '["Interrupção na autenticação durante rotação de chaves", "Emails podem falhar verificação DKIM temporariamente", "Dificuldade em migrar para novas chaves"]'::jsonb,
  '["Acesse o painel do seu provedor de email (Google Workspace, Microsoft 365)", "Gere um segundo seletor DKIM com nome diferente (ex: google2, selector2)", "Adicione o novo registro DKIM no DNS mantendo o anterior ativo", "Teste ambos os seletores antes de desativar o antigo"]'::jsonb,
  'medium',
  '45 min',
  '["Google Workspace", "Microsoft 365", "Zoho Mail"]'::jsonb
FROM compliance_rules WHERE code = 'DKIM-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'external_domain')
ON CONFLICT (rule_id) DO NOTHING;

-- DMARC-004 - Cobertura DMARC Total
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Cobertura total do DMARC',
  'Configurar o DMARC para que 100% dos emails passem pela verificação (pct=100).',
  'Com cobertura parcial, apenas uma porcentagem dos emails é verificada, deixando brechas para ataques.',
  '["Emails fraudulentos podem passar sem verificação", "Proteção incompleta contra phishing", "Falsa sensação de segurança"]'::jsonb,
  '["Acesse o registro DMARC no seu DNS", "Localize o parâmetro pct= (se existir)", "Remova o parâmetro pct ou altere para pct=100", "Valor padrão já é 100%, então remover é suficiente"]'::jsonb,
  'low',
  '10 min',
  '["Cloudflare", "Registro.br", "GoDaddy"]'::jsonb
FROM compliance_rules WHERE code = 'DMARC-004' AND device_type_id = (SELECT id FROM device_types WHERE code = 'external_domain')
ON CONFLICT (rule_id) DO NOTHING;

-- DMARC-005 - Alinhamento SPF Estrito
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Alinhamento SPF rigoroso',
  'Exigir que o domínio do envelope (Return-Path) seja idêntico ao domínio do From, não apenas do mesmo domínio pai.',
  'Alinhamento relaxado permite que subdomínios passem pela verificação, o que pode ser explorado por atacantes.',
  '["Subdomínios não autorizados podem passar na verificação", "Menor proteção contra spoofing sofisticado", "Possível exploração via subdomínios"]'::jsonb,
  '["Edite o registro DMARC no DNS", "Adicione ou altere o parâmetro aspf=s (strict)", "Exemplo: v=DMARC1; p=reject; aspf=s; adkim=s", "Teste antes para garantir que emails legítimos não serão bloqueados"]'::jsonb,
  'low',
  '15 min',
  '["Cloudflare", "Registro.br", "GoDaddy"]'::jsonb
FROM compliance_rules WHERE code = 'DMARC-005' AND device_type_id = (SELECT id FROM device_types WHERE code = 'external_domain')
ON CONFLICT (rule_id) DO NOTHING;

-- DMARC-006 - Alinhamento DKIM Estrito
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Alinhamento DKIM rigoroso',
  'Exigir que o domínio na assinatura DKIM seja idêntico ao domínio do From, não apenas do mesmo domínio pai.',
  'Alinhamento relaxado permite que emails assinados por subdomínios passem, reduzindo a eficácia da proteção.',
  '["Assinaturas de subdomínios podem validar emails do domínio principal", "Menor granularidade na verificação", "Possível bypass via subdomínios comprometidos"]'::jsonb,
  '["Edite o registro DMARC no DNS", "Adicione ou altere o parâmetro adkim=s (strict)", "Exemplo: v=DMARC1; p=reject; aspf=s; adkim=s", "Verifique se todos os emails legítimos usam DKIM do domínio correto"]'::jsonb,
  'low',
  '15 min',
  '["Cloudflare", "Registro.br", "GoDaddy"]'::jsonb
FROM compliance_rules WHERE code = 'DMARC-006' AND device_type_id = (SELECT id FROM device_types WHERE code = 'external_domain')
ON CONFLICT (rule_id) DO NOTHING;

-- MX-003 - Prioridades MX Configuradas
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Prioridades dos servidores de email',
  'Cada registro MX tem uma prioridade que define a ordem de tentativa de entrega de emails.',
  'Sem prioridades corretas, emails podem ser enviados para servidores errados ou backup antes do principal.',
  '["Emails podem ir para servidor secundário desnecessariamente", "Sobrecarga no servidor de backup", "Atrasos na entrega de emails"]'::jsonb,
  '["Acesse o painel DNS do seu domínio", "Verifique os registros MX existentes", "Configure prioridades diferentes (10, 20, 30, etc.)", "Menor número = maior prioridade (servidor principal deve ter menor valor)"]'::jsonb,
  'low',
  '15 min',
  '["Cloudflare", "Registro.br", "GoDaddy"]'::jsonb
FROM compliance_rules WHERE code = 'MX-003' AND device_type_id = (SELECT id FROM device_types WHERE code = 'external_domain')
ON CONFLICT (rule_id) DO NOTHING;

-- MX-004 - MX Aponta para Hostname
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'MX deve apontar para hostname',
  'Registros MX devem apontar para nomes de host (FQDN), nunca diretamente para endereços IP.',
  'Apontar MX para IP viola as especificações de email (RFC) e pode causar problemas de entrega.',
  '["Violação das especificações de email (RFC 5321)", "Alguns servidores podem rejeitar emails", "Problemas de compatibilidade com serviços de email"]'::jsonb,
  '["Verifique se seus registros MX apontam para IPs", "Crie registros A para os servidores de email", "Altere os MX para apontar para hostnames (ex: mail.seudominio.com.br)", "Nunca use IPs diretamente em registros MX"]'::jsonb,
  'low',
  '20 min',
  '["Cloudflare", "Registro.br", "GoDaddy"]'::jsonb
FROM compliance_rules WHERE code = 'MX-004' AND device_type_id = (SELECT id FROM device_types WHERE code = 'external_domain')
ON CONFLICT (rule_id) DO NOTHING;

-- MX-005 - Contato Administrativo DNS
INSERT INTO rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT id,
  'Email de contato no DNS',
  'O registro SOA contém um email de contato administrativo para o domínio.',
  'Este email é usado para notificações importantes sobre o domínio, como problemas de DNS ou segurança.',
  '["Não receber alertas críticos sobre o domínio", "Dificuldade de contato em caso de problemas", "Pode afetar resolução de disputas de domínio"]'::jsonb,
  '["Verifique o registro SOA do seu domínio", "O campo RNAME/contact deve conter um email válido", "Formato: admin.seudominio.com.br (@ é substituído por ponto)", "Contate seu provedor DNS se precisar alterar"]'::jsonb,
  'low',
  '15 min',
  '["Cloudflare", "Registro.br", "AWS Route 53"]'::jsonb
FROM compliance_rules WHERE code = 'MX-005' AND device_type_id = (SELECT id FROM device_types WHERE code = 'external_domain')
ON CONFLICT (rule_id) DO NOTHING;