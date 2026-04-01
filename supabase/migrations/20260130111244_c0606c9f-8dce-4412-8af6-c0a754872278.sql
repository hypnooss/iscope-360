-- =============================================
-- Regras de Compliance para Domínios Externos
-- Categoria: Autenticação de Email, Segurança DNS, Infraestrutura
-- Nível: Avançado
-- =============================================

-- Device Type ID para external_domain
-- d5562218-5a3d-4ca6-9591-03e220dbf7e1

-- ==========================================
-- CATEGORIA: Autenticação de Email - SPF
-- ==========================================

INSERT INTO compliance_rules (device_type_id, code, name, description, category, severity, weight, recommendation, pass_description, fail_description, evaluation_logic, is_active) VALUES
-- SPF-001: Registro SPF Configurado
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'SPF-001', 'Registro SPF Configurado', 
'Verifica se o domínio possui um registro SPF (Sender Policy Framework) configurado para autenticar emails enviados.',
'Autenticação de Email', 'critical', 10,
'Configure um registro SPF válido no DNS do domínio. Exemplo: v=spf1 include:_spf.google.com ~all',
'O domínio possui registro SPF configurado corretamente.',
'O domínio não possui registro SPF, permitindo que qualquer servidor envie emails em nome do domínio.',
'{"step_id": "spf_record", "field": "data.raw", "operator": "not_null"}',
true),

-- SPF-002: Política SPF Restritiva
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'SPF-002', 'Política SPF Restritiva', 
'Verifica se o registro SPF utiliza "-all" (hard fail) ou "~all" (soft fail) para rejeitar emails não autorizados.',
'Autenticação de Email', 'high', 8,
'Altere a política SPF de "?all" ou "+all" para "~all" (soft fail) ou preferencialmente "-all" (hard fail).',
'O registro SPF utiliza política restritiva (~all ou -all).',
'O registro SPF usa política permissiva (+all ou ?all), permitindo qualquer servidor enviar emails.',
'{"step_id": "spf_record", "field": "data.parsed.all", "operator": "in", "values": ["-all", "~all"]}',
true),

-- SPF-003: SPF não excede limite de lookups
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'SPF-003', 'Limite de DNS Lookups SPF', 
'O SPF possui limite de 10 mecanismos que causam lookups DNS (include, a, mx, ptr, exists, redirect).',
'Autenticação de Email', 'medium', 5,
'Reduza o número de includes no SPF. Considere usar ip4/ip6 diretamente ou consolidar domínios.',
'O registro SPF respeita o limite de lookups DNS.',
'O registro SPF pode exceder o limite de 10 lookups, causando falhas de validação.',
'{"step_id": "spf_record", "field": "data.parsed.includes", "operator": "array_length_lte", "value": 10}',
true),

-- ==========================================
-- CATEGORIA: Autenticação de Email - DKIM
-- ==========================================

-- DKIM-001: DKIM Configurado
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DKIM-001', 'DKIM Configurado', 
'Verifica se o domínio possui pelo menos um registro DKIM (DomainKeys Identified Mail) válido.',
'Autenticação de Email', 'critical', 10,
'Configure registros DKIM para os seletores utilizados pelo seu provedor de email (ex: google, selector1, selector2).',
'O domínio possui ao menos um registro DKIM configurado.',
'Nenhum registro DKIM encontrado. Emails podem ser marcados como suspeitos.',
'{"step_id": "dkim_records", "field": "data.found", "operator": "array_length_gte", "value": 1}',
true),

-- DKIM-002: Chave DKIM com tamanho adequado
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DKIM-002', 'Tamanho da Chave DKIM', 
'Verifica se as chaves DKIM têm pelo menos 1024 bits (recomendado 2048 bits).',
'Autenticação de Email', 'high', 8,
'Gere novas chaves DKIM com pelo menos 2048 bits para maior segurança.',
'As chaves DKIM utilizam tamanho adequado (≥1024 bits).',
'Chaves DKIM com menos de 1024 bits são consideradas fracas e vulneráveis.',
'{"step_id": "dkim_records", "field": "data.found[0].key_size_bits", "operator": "gte", "value": 1024}',
true),

-- DKIM-003: Múltiplos seletores DKIM
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DKIM-003', 'Redundância DKIM', 
'Verifica se há múltiplos seletores DKIM para permitir rotação de chaves.',
'Autenticação de Email', 'low', 3,
'Configure múltiplos seletores DKIM para facilitar rotação de chaves sem interrupção.',
'O domínio possui múltiplos seletores DKIM configurados.',
'Apenas um seletor DKIM encontrado. Recomenda-se múltiplos para rotação.',
'{"step_id": "dkim_records", "field": "data.found", "operator": "array_length_gte", "value": 2}',
true),

-- ==========================================
-- CATEGORIA: Autenticação de Email - DMARC
-- ==========================================

-- DMARC-001: DMARC Configurado
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DMARC-001', 'DMARC Configurado', 
'Verifica se o domínio possui registro DMARC para políticas de autenticação de email.',
'Autenticação de Email', 'critical', 10,
'Configure um registro DMARC no DNS: _dmarc.dominio.com TXT "v=DMARC1; p=reject; rua=mailto:dmarc@dominio.com"',
'O domínio possui registro DMARC configurado.',
'O domínio não possui DMARC, não há política definida para emails que falham SPF/DKIM.',
'{"step_id": "dmarc_record", "field": "data.raw", "operator": "not_null"}',
true),

-- DMARC-002: Política DMARC Restritiva
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DMARC-002', 'Política DMARC Restritiva', 
'Verifica se o DMARC utiliza política "quarantine" ou "reject" para emails não autenticados.',
'Autenticação de Email', 'critical', 10,
'Altere a política DMARC de "p=none" para "p=quarantine" ou "p=reject" após período de monitoramento.',
'O DMARC está configurado com política restritiva (quarantine ou reject).',
'O DMARC usa p=none, que apenas monitora sem bloquear emails fraudulentos.',
'{"step_id": "dmarc_record", "field": "data.parsed.p", "operator": "in", "values": ["quarantine", "reject"]}',
true),

-- DMARC-003: Relatórios DMARC Configurados
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DMARC-003', 'Relatórios DMARC (RUA)', 
'Verifica se o DMARC possui endereço de relatório agregado (rua) configurado.',
'Autenticação de Email', 'medium', 5,
'Adicione "rua=mailto:dmarc-reports@seudominio.com" ao registro DMARC para receber relatórios.',
'Relatórios agregados DMARC estão configurados.',
'Sem relatórios DMARC, não há visibilidade sobre tentativas de spoofing.',
'{"step_id": "dmarc_record", "field": "data.parsed.rua", "operator": "not_null"}',
true),

-- DMARC-004: Porcentagem DMARC 100%
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DMARC-004', 'Cobertura DMARC Total', 
'Verifica se o DMARC aplica a política a 100% dos emails (pct=100 ou ausente).',
'Autenticação de Email', 'medium', 5,
'Remova ou defina pct=100 no DMARC para aplicar a política a todos os emails.',
'A política DMARC é aplicada a 100% dos emails.',
'O DMARC está configurado para aplicar política apenas a uma porcentagem dos emails.',
'{"step_id": "dmarc_record", "field": "data.parsed.pct", "operator": "in", "values": [null, "100"]}',
true),

-- DMARC-005: Alinhamento SPF Estrito
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DMARC-005', 'Alinhamento SPF Estrito', 
'Verifica se o DMARC exige alinhamento estrito de SPF (aspf=s).',
'Autenticação de Email', 'low', 3,
'Adicione "aspf=s" ao DMARC para exigir correspondência exata do domínio SPF.',
'Alinhamento SPF estrito está configurado.',
'Alinhamento SPF relaxado permite subdomínios, reduzindo proteção.',
'{"step_id": "dmarc_record", "field": "data.parsed.aspf", "operator": "eq", "value": "s"}',
true),

-- ==========================================
-- CATEGORIA: Segurança DNS
-- ==========================================

-- DNS-001: DNSSEC Ativo
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DNS-001', 'DNSSEC Habilitado', 
'Verifica se o domínio possui DNSSEC configurado para proteger contra ataques de DNS spoofing.',
'Segurança DNS', 'high', 8,
'Habilite DNSSEC junto ao seu registrador de domínio e configure os registros DS na zona pai.',
'DNSSEC está habilitado para o domínio.',
'DNSSEC não está configurado. O domínio está vulnerável a ataques de cache poisoning.',
'{"step_id": "dnssec_status", "field": "data.has_dnskey", "operator": "eq", "value": true}',
true),

-- DNS-002: Registro DS Publicado
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DNS-002', 'Registro DS na Zona Pai', 
'Verifica se o registro DS (Delegation Signer) está publicado na zona pai para DNSSEC.',
'Segurança DNS', 'high', 7,
'Publique o registro DS no registrador do domínio para completar a cadeia de confiança DNSSEC.',
'Registro DS está publicado na zona pai.',
'Registro DS ausente. A cadeia de confiança DNSSEC está incompleta.',
'{"step_id": "dnssec_status", "field": "data.has_ds", "operator": "eq", "value": true}',
true),

-- DNS-003: Múltiplos Nameservers
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DNS-003', 'Redundância de Nameservers', 
'Verifica se o domínio possui pelo menos 2 nameservers para alta disponibilidade.',
'Segurança DNS', 'high', 7,
'Configure pelo menos 2 nameservers em redes diferentes para garantir disponibilidade.',
'O domínio possui múltiplos nameservers configurados.',
'Apenas 1 nameserver. Falha do servidor causará indisponibilidade total.',
'{"step_id": "ns_records", "field": "data.records", "operator": "array_length_gte", "value": 2}',
true),

-- DNS-004: Nameservers em redes distintas
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DNS-004', 'Diversidade de Nameservers', 
'Verifica se há pelo menos 3 nameservers para melhor resiliência.',
'Segurança DNS', 'medium', 5,
'Considere adicionar um terceiro nameserver, preferencialmente em provedor diferente.',
'O domínio possui 3 ou mais nameservers.',
'Menos de 3 nameservers. Considere adicionar mais para resiliência.',
'{"step_id": "ns_records", "field": "data.records", "operator": "array_length_gte", "value": 3}',
true),

-- DNS-005: SOA Serial Válido
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DNS-005', 'SOA Serial Atualizado', 
'Verifica se o registro SOA possui serial number válido e recente.',
'Segurança DNS', 'low', 2,
'O serial do SOA deve ser incrementado a cada alteração na zona DNS.',
'O registro SOA possui serial number válido.',
'O serial SOA parece desatualizado ou com formato incorreto.',
'{"step_id": "soa_record", "field": "data.serial", "operator": "gte", "value": 1}',
true),

-- DNS-006: SOA Refresh Adequado
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'DNS-006', 'SOA Refresh Adequado', 
'Verifica se o tempo de refresh do SOA está entre 1h e 24h (3600-86400 segundos).',
'Segurança DNS', 'low', 2,
'Configure o refresh do SOA entre 3600 e 86400 segundos para balancear atualização e carga.',
'O tempo de refresh do SOA está adequado.',
'O refresh do SOA está fora do intervalo recomendado.',
'{"step_id": "soa_record", "field": "data.refresh", "operator": "between", "min": 3600, "max": 86400}',
true),

-- ==========================================
-- CATEGORIA: Infraestrutura de Email
-- ==========================================

-- MX-001: Registro MX Configurado
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'MX-001', 'Registro MX Configurado', 
'Verifica se o domínio possui registros MX para recebimento de emails.',
'Infraestrutura de Email', 'critical', 10,
'Configure registros MX apontando para seus servidores de email.',
'O domínio possui registros MX configurados.',
'Sem registros MX, o domínio não pode receber emails.',
'{"step_id": "mx_records", "field": "data.records", "operator": "array_length_gte", "value": 1}',
true),

-- MX-002: Múltiplos servidores MX
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'MX-002', 'Redundância MX', 
'Verifica se há pelo menos 2 servidores MX para alta disponibilidade.',
'Infraestrutura de Email', 'high', 7,
'Configure pelo menos 2 registros MX com prioridades diferentes para failover.',
'O domínio possui múltiplos servidores MX.',
'Apenas 1 servidor MX. Falha causará perda de emails.',
'{"step_id": "mx_records", "field": "data.records", "operator": "array_length_gte", "value": 2}',
true),

-- MX-003: Prioridades MX Distintas
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'MX-003', 'Prioridades MX Configuradas', 
'Verifica se os registros MX possuem prioridades distintas para failover adequado.',
'Infraestrutura de Email', 'medium', 5,
'Configure prioridades diferentes para cada servidor MX (ex: 10, 20, 30).',
'Os servidores MX possuem prioridades distintas.',
'Servidores MX com mesma prioridade podem causar comportamento imprevisível.',
'{"step_id": "mx_records", "field": "data.records", "operator": "has_distinct_priorities"}',
true),

-- MX-004: MX não aponta para IP
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'MX-004', 'MX Aponta para Hostname', 
'Verifica se os registros MX apontam para hostnames e não diretamente para IPs.',
'Infraestrutura de Email', 'medium', 5,
'Registros MX devem apontar para hostnames (ex: mail.dominio.com), nunca para IPs.',
'Todos os registros MX apontam para hostnames válidos.',
'Registros MX apontando para IP violam RFC 2181.',
'{"step_id": "mx_records", "field": "data.records[0].exchange", "operator": "not_matches", "pattern": "^[0-9]+\\\\.[0-9]+\\\\.[0-9]+\\\\.[0-9]+$"}',
true),

-- MX-005: Contato SOA válido
('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'MX-005', 'Contato Administrativo DNS', 
'Verifica se o registro SOA possui email de contato do administrador configurado.',
'Infraestrutura de Email', 'low', 3,
'Configure o campo RNAME do SOA com email válido do administrador DNS.',
'Email de contato do administrador DNS está configurado.',
'Sem contato administrativo definido no SOA.',
'{"step_id": "soa_record", "field": "data.contact_email", "operator": "not_null"}',
true);
