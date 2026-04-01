-- =============================================
-- Create rule_correction_guides table
-- =============================================

CREATE TABLE public.rule_correction_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referência à regra
  rule_id UUID NOT NULL REFERENCES public.compliance_rules(id) ON DELETE CASCADE,
  
  -- Textos do guia
  friendly_title TEXT,
  what_is TEXT,
  why_matters TEXT,
  impacts JSONB DEFAULT '[]'::jsonb,
  how_to_fix JSONB DEFAULT '[]'::jsonb,
  provider_examples JSONB DEFAULT '[]'::jsonb,
  
  -- Metadados
  difficulty TEXT CHECK (difficulty IN ('low', 'medium', 'high')) DEFAULT 'medium',
  time_estimate TEXT DEFAULT '30 min',
  
  -- Controle
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(rule_id)
);

-- Trigger para updated_at
CREATE TRIGGER update_rule_correction_guides_updated_at
  BEFORE UPDATE ON public.rule_correction_guides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.rule_correction_guides ENABLE ROW LEVEL SECURITY;

-- Super admins can manage guides
CREATE POLICY "Super admins can manage guides"
  ON public.rule_correction_guides
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- Users can view guides
CREATE POLICY "Users can view guides"
  ON public.rule_correction_guides
  FOR SELECT
  USING (true);

-- =============================================
-- Migrate existing data from explanatoryContent.ts
-- =============================================

-- DMARC-001
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Proteção contra emails falsos (DMARC)',
  'Sistema que protege seu domínio contra envio de emails falsos por terceiros.',
  'Sem DMARC, qualquer pessoa pode enviar emails fingindo ser sua empresa, o que pode levar a fraudes e perda de confiança.',
  '["Clientes podem receber emails fraudulentos em seu nome", "Perda de confiança e danos à reputação da empresa", "Emails legítimos podem ir para a pasta de spam", "Risco de golpes financeiros usando sua marca"]'::jsonb,
  '["Acesse o painel DNS do seu domínio (Cloudflare, Registro.br, GoDaddy)", "Adicione um novo registro do tipo TXT", "Nome: _dmarc.seudominio.com.br", "Valor: v=DMARC1; p=none; rua=mailto:admin@seudominio.com.br", "Após 30 dias monitorando os relatórios, mude p=none para p=quarantine", "Após mais 30 dias sem problemas, mude para p=reject"]'::jsonb,
  'low', '15 min',
  '["Cloudflare", "Registro.br", "GoDaddy", "Microsoft 365"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DMARC-001' AND dt.code = 'external_domain';

-- DMARC-002
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Política DMARC muito permissiva',
  'O DMARC está configurado, mas não está bloqueando emails falsos automaticamente.',
  'Com política "none" ou "quarantine", emails fraudulentos ainda podem chegar aos destinatários, apenas com avisos.',
  '["Emails falsos ainda podem ser entregues", "Proteção parcial contra fraudes", "Menor eficácia na prevenção de phishing"]'::jsonb,
  '["Acesse o painel DNS do seu domínio", "Localize o registro TXT para _dmarc.seudominio.com.br", "Altere a política de p=none ou p=quarantine para p=reject", "Certifique-se de que SPF e DKIM estão funcionando antes de fazer essa mudança"]'::jsonb,
  'low', '10 min',
  '["Cloudflare", "Registro.br", "GoDaddy"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DMARC-002' AND dt.code = 'external_domain';

-- DMARC-003
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Relatórios DMARC não configurados',
  'O DMARC não está enviando relatórios sobre tentativas de uso indevido do seu domínio.',
  'Sem relatórios, você não sabe se alguém está tentando falsificar emails em nome da sua empresa.',
  '["Impossibilidade de detectar ataques de phishing", "Falta de visibilidade sobre uso do domínio", "Dificuldade em diagnosticar problemas de entrega de email"]'::jsonb,
  '["Edite o registro DMARC no seu DNS", "Adicione rua=mailto:dmarc-reports@seudominio.com.br ao valor", "Crie uma caixa de email para receber os relatórios", "Use ferramentas como DMARC Analyzer ou Postmark para visualizar relatórios"]'::jsonb,
  'low', '20 min',
  '["DMARC Analyzer", "Postmark", "Valimail"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DMARC-003' AND dt.code = 'external_domain';

-- SPF-001
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Lista de servidores autorizados (SPF)',
  'Registro que define quais servidores podem enviar emails em nome do seu domínio.',
  'Sem SPF, qualquer servidor pode enviar emails fingindo ser do seu domínio, facilitando golpes.',
  '["Emails podem ser falsificados facilmente", "Maior risco de phishing usando seu domínio", "Emails legítimos podem ser rejeitados por outros servidores"]'::jsonb,
  '["Acesse o painel DNS do seu domínio", "Adicione um registro TXT para @ (raiz do domínio)", "Valor básico: v=spf1 include:_spf.google.com ~all (para Google Workspace)", "Ou: v=spf1 include:spf.protection.outlook.com ~all (para Microsoft 365)", "Adapte incluindo todos os serviços que enviam email em seu nome"]'::jsonb,
  'low', '15 min',
  '["Google Workspace", "Microsoft 365", "SendGrid", "Mailchimp"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'SPF-001' AND dt.code = 'external_domain';

-- SPF-002
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'SPF com muitas consultas',
  'O registro SPF está complexo demais e pode falhar durante a verificação.',
  'SPF permite no máximo 10 consultas. Se ultrapassar, a verificação falha e emails podem ser rejeitados.',
  '["Emails legítimos podem ser rejeitados", "Proteção SPF pode ser ignorada", "Problemas intermitentes de entrega de email"]'::jsonb,
  '["Liste todos os serviços incluídos no seu SPF atual", "Remova serviços que não usa mais", "Use serviços de \"flattening\" SPF como SPF Macro ou Cloudflare Email Routing", "Considere consolidar serviços de email em menos provedores"]'::jsonb,
  'medium', '30 min',
  '["SPF Surveyor", "MXToolbox", "Cloudflare"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'SPF-002' AND dt.code = 'external_domain';

-- SPF-003
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Política SPF muito permissiva',
  'O SPF está configurado com +all ou ?all, que aceita emails de qualquer servidor.',
  'Uma política permissiva anula o propósito do SPF, permitindo que qualquer servidor envie emails.',
  '["SPF efetivamente desabilitado", "Nenhuma proteção contra falsificação", "DMARC não funcionará corretamente"]'::jsonb,
  '["Edite o registro SPF no seu DNS", "Substitua +all ou ?all por ~all (soft fail) ou -all (hard fail)", "Teste com ~all primeiro, depois mude para -all após confirmar que tudo funciona"]'::jsonb,
  'low', '10 min',
  '["Cloudflare", "Registro.br", "GoDaddy"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'SPF-003' AND dt.code = 'external_domain';

-- DKIM-001
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Assinatura digital de emails (DKIM)',
  'Sistema que adiciona uma assinatura digital aos emails para provar que são autênticos.',
  'DKIM permite que servidores de destino verifiquem que o email realmente veio do seu domínio e não foi alterado.',
  '["Emails podem ser falsificados mais facilmente", "DMARC não funciona corretamente sem DKIM", "Menor taxa de entrega de emails legítimos", "Perda de credibilidade do domínio"]'::jsonb,
  '["Acesse o painel do seu provedor de email (Google Workspace, Microsoft 365)", "Gere as chaves DKIM no painel de administração", "Copie o registro CNAME ou TXT fornecido", "Adicione o registro no DNS do seu domínio", "Ative o DKIM no painel do provedor de email"]'::jsonb,
  'medium', '30 min',
  '["Google Workspace", "Microsoft 365", "Zoho Mail"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DKIM-001' AND dt.code = 'external_domain';

-- DKIM-002
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Chave DKIM fraca',
  'A chave de assinatura DKIM tem menos de 1024 bits, o que a torna vulnerável.',
  'Chaves fracas podem ser quebradas por atacantes, permitindo que falsifiquem assinaturas.',
  '["Assinaturas podem ser forjadas", "Proteção DKIM comprometida", "Risco de falsificação de emails"]'::jsonb,
  '["Acesse o painel do seu provedor de email", "Gere uma nova chave DKIM com 2048 bits", "Atualize o registro DNS com a nova chave", "Remova a chave antiga após 48 horas"]'::jsonb,
  'medium', '30 min',
  '["Google Workspace", "Microsoft 365"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DKIM-002' AND dt.code = 'external_domain';

-- DNS-001
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Proteção contra falsificação de DNS (DNSSEC)',
  'Sistema de segurança que protege o DNS contra ataques de envenenamento de cache.',
  'Sem DNSSEC, atacantes podem redirecionar visitantes do seu site para páginas falsas sem você saber.',
  '["Visitantes podem ser redirecionados para sites falsos", "Risco de roubo de credenciais", "Emails podem ser interceptados"]'::jsonb,
  '["Acesse o painel do seu provedor DNS (Cloudflare, AWS, etc.)", "Ative o DNSSEC nas configurações do domínio", "Copie os registros DS gerados", "Adicione os registros DS no registrador do domínio (Registro.br, etc.)"]'::jsonb,
  'medium', '30 min',
  '["Cloudflare", "Registro.br", "AWS Route 53"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DNS-001' AND dt.code = 'external_domain';

-- DNS-002
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Registro DS na Zona Pai',
  'Registro que conecta o DNSSEC do seu domínio com a zona pai (.com.br, .com, etc.).',
  'Sem o registro DS, o DNSSEC não funciona pois falta o elo de confiança com a hierarquia DNS.',
  '["DNSSEC não funciona mesmo se ativado", "Proteção contra falsificação fica inativa", "Possíveis falhas de resolução DNS"]'::jsonb,
  '["Acesse o painel do seu provedor DNS e copie os registros DS", "Vá ao registrador do domínio (Registro.br, GoDaddy, etc.)", "Adicione os registros DS na configuração DNSSEC", "Aguarde até 48 horas para propagação"]'::jsonb,
  'medium', '30 min',
  '["Registro.br", "GoDaddy", "Cloudflare"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DNS-002' AND dt.code = 'external_domain';

-- DNS-003
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Redundância de Nameservers',
  'Ter múltiplos servidores DNS para garantir disponibilidade mesmo se um falhar.',
  'Com apenas um servidor DNS, qualquer falha deixa todo o domínio inacessível.',
  '["Ponto único de falha", "Risco de indisponibilidade total", "Menor resiliência a ataques DDoS"]'::jsonb,
  '["Acesse o painel do registrador do seu domínio", "Adicione pelo menos um servidor DNS secundário", "Use provedores diferentes para máxima resiliência (ex: Cloudflare + AWS)", "Verifique que ambos os servidores respondem corretamente"]'::jsonb,
  'medium', '30 min',
  '["Cloudflare", "AWS Route 53", "Google Cloud DNS"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DNS-003' AND dt.code = 'external_domain';

-- DNS-004
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Diversidade de Infraestrutura DNS',
  'Usar servidores DNS em redes diferentes para maior proteção contra falhas.',
  'Se todos os servidores DNS estão na mesma rede, uma falha nessa rede derruba tudo.',
  '["Vulnerável a falhas de rede", "Menor proteção contra ataques", "Risco de indisponibilidade regional"]'::jsonb,
  '["Verifique os IPs dos seus nameservers atuais", "Configure nameservers em redes diferentes (diferentes prefixos IP)", "Considere usar um provedor DNS secundário de outra empresa"]'::jsonb,
  'medium', '1h',
  '["Cloudflare + AWS", "Registro.br + Google"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DNS-004' AND dt.code = 'external_domain';

-- DNS-005
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Atualização do SOA Serial',
  'Número de série do registro SOA que indica quando a zona foi atualizada.',
  'Servidores DNS usam o serial para saber quando sincronizar alterações.',
  '["Alterações DNS podem não propagar corretamente", "Servidores secundários podem ter dados desatualizados"]'::jsonb,
  '["Verifique o formato do serial (recomendado: YYYYMMDDNN)", "Atualize o serial sempre que fizer alterações na zona", "A maioria dos provedores faz isso automaticamente"]'::jsonb,
  'low', '10 min',
  '[]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DNS-005' AND dt.code = 'external_domain';

-- DNS-006
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Intervalo de Refresh do SOA',
  'Tempo que servidores secundários esperam antes de verificar atualizações.',
  'Valor muito alto atrasa propagação; muito baixo sobrecarrega os servidores.',
  '["Alterações DNS podem demorar a propagar", "Possível sobrecarga de consultas DNS"]'::jsonb,
  '["Valor recomendado: 3600 a 86400 segundos (1 a 24 horas)", "Ajuste no registro SOA da zona DNS", "Provedores gerenciados geralmente usam valores otimizados"]'::jsonb,
  'low', '10 min',
  '[]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DNS-006' AND dt.code = 'external_domain';

-- DNSSEC-001
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Proteção contra falsificação de DNS (DNSSEC)',
  'Sistema de segurança que protege o DNS contra ataques de envenenamento de cache.',
  'Sem DNSSEC, atacantes podem redirecionar visitantes do seu site para páginas falsas sem você saber.',
  '["Visitantes podem ser redirecionados para sites falsos", "Risco de roubo de credenciais", "Emails podem ser interceptados", "Perda de confiança dos usuários"]'::jsonb,
  '["Acesse o painel do seu provedor DNS (Cloudflare, AWS, etc.)", "Ative o DNSSEC nas configurações do domínio", "Copie os registros DS gerados", "Adicione os registros DS no registrador do domínio (Registro.br, etc.)", "Aguarde até 48 horas para ativação completa"]'::jsonb,
  'medium', '30 min',
  '["Cloudflare", "Registro.br", "AWS Route 53"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DNSSEC-001' AND dt.code = 'external_domain';

-- DNSSEC-002
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Assinatura DNSSEC incompleta',
  'O DNSSEC está parcialmente configurado - faltam registros no DNS ou no registrador.',
  'Uma configuração incompleta pode causar falhas de resolução, deixando o site inacessível.',
  '["Site pode ficar inacessível para alguns usuários", "Proteção DNSSEC não funciona", "Possíveis erros de validação"]'::jsonb,
  '["Verifique se o registro DS está no registrador do domínio", "Verifique se os registros DNSKEY estão no provedor DNS", "Use ferramentas como DNSViz para diagnosticar problemas", "Se houver erros, desative o DNSSEC e reconfigure do zero"]'::jsonb,
  'medium', '45 min',
  '["DNSViz", "Verisign DNSSEC Debugger"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'DNSSEC-002' AND dt.code = 'external_domain';

-- MX-001
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Servidores de email (MX)',
  'Registros que definem quais servidores recebem emails para o seu domínio.',
  'Sem registros MX, ninguém consegue enviar emails para endereços @seudominio.com.br.',
  '["Impossibilidade de receber emails", "Perda de comunicação com clientes", "Falha em cadastros e recuperação de senhas"]'::jsonb,
  '["Acesse o painel DNS do seu domínio", "Adicione registros MX apontando para seu provedor de email", "Para Google Workspace: ASPMX.L.GOOGLE.COM (prioridade 1)", "Para Microsoft 365: seudominio-com-br.mail.protection.outlook.com (prioridade 0)"]'::jsonb,
  'low', '15 min',
  '["Google Workspace", "Microsoft 365", "Zoho Mail"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'MX-001' AND dt.code = 'external_domain';

-- MX-002
INSERT INTO public.rule_correction_guides (rule_id, friendly_title, what_is, why_matters, impacts, how_to_fix, difficulty, time_estimate, provider_examples)
SELECT cr.id,
  'Redundância de servidores de email',
  'Ter múltiplos servidores MX para garantir entrega mesmo se um falhar.',
  'Com apenas um servidor MX, qualquer falha impede a recepção de todos os emails.',
  '["Ponto único de falha para emails", "Perda de emails durante manutenções", "Menor confiabilidade de comunicação"]'::jsonb,
  '["A maioria dos provedores já fornece múltiplos servidores MX", "Verifique se todos os registros MX recomendados estão configurados", "Para Google: adicione ALT1, ALT2, ALT3, ALT4.ASPMX.L.GOOGLE.COM", "Configure prioridades diferentes (10, 20, 30, etc.)"]'::jsonb,
  'low', '15 min',
  '["Google Workspace", "Microsoft 365"]'::jsonb
FROM public.compliance_rules cr
JOIN public.device_types dt ON cr.device_type_id = dt.id
WHERE cr.code = 'MX-002' AND dt.code = 'external_domain';