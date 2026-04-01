-- Domínio Externo: DKIM
UPDATE compliance_rules SET 
  technical_risk = 'Sem DKIM, emails enviados pelo domínio não são autenticados criptograficamente, facilitando spoofing e phishing.',
  business_impact = 'Emails legítimos da empresa podem ser rejeitados ou marcados como spam, afetando comunicação com clientes e parceiros.',
  api_endpoint = 'DNS Query (DKIM/TXT)'
WHERE code = 'DKIM-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Chaves DKIM menores que 1024 bits podem ser quebradas por força bruta, invalidando a autenticação de emails.',
  business_impact = 'Atacantes podem forjar emails autenticados em nome da organização após comprometer a chave DKIM.',
  api_endpoint = 'DNS Query (DKIM/TXT)'
WHERE code = 'DKIM-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Sem múltiplos seletores DKIM, rotação de chaves requer downtime ou período sem autenticação DKIM.',
  business_impact = 'Dificuldade em rotacionar chaves comprometidas ou expiradas sem afetar a entregabilidade de emails.',
  api_endpoint = 'DNS Query (DKIM/TXT)'
WHERE code = 'DKIM-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- Domínio Externo: DMARC
UPDATE compliance_rules SET 
  technical_risk = 'Sem DMARC, não há política definida para emails que falham autenticação SPF/DKIM, permitindo spoofing irrestrito.',
  business_impact = 'O domínio da empresa pode ser usado livremente em campanhas de phishing contra clientes, parceiros e funcionários.',
  api_endpoint = 'DNS Query (DMARC/TXT)'
WHERE code = 'DMARC-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Política DMARC "none" apenas monitora, não bloqueia emails falsificados, mantendo a vulnerabilidade a spoofing.',
  business_impact = 'Atacantes continuam podendo falsificar emails do domínio mesmo com DMARC configurado.',
  api_endpoint = 'DNS Query (DMARC/TXT)'
WHERE code = 'DMARC-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Sem relatórios DMARC (rua), não há visibilidade sobre tentativas de spoofing ou problemas de autenticação.',
  business_impact = 'Impossibilidade de identificar ataques de phishing usando o domínio ou corrigir problemas de configuração.',
  api_endpoint = 'DNS Query (DMARC/TXT)'
WHERE code = 'DMARC-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Cobertura DMARC parcial (pct<100) deixa uma porcentagem dos emails falsificados sem bloqueio.',
  business_impact = 'Atacantes podem explorar a brecha para enviar emails falsificados que escapam da política.',
  api_endpoint = 'DNS Query (DMARC/TXT)'
WHERE code = 'DMARC-004' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Alinhamento SPF relaxado permite que subdomínios não autorizados passem na verificação DMARC.',
  business_impact = 'Atacantes podem usar subdomínios para enviar emails que parecem legítimos.',
  api_endpoint = 'DNS Query (DMARC/TXT)'
WHERE code = 'DMARC-005' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Alinhamento DKIM relaxado permite que assinaturas de subdomínios validem emails do domínio principal.',
  business_impact = 'Menor controle sobre quais fontes podem enviar emails autenticados em nome do domínio.',
  api_endpoint = 'DNS Query (DMARC/TXT)'
WHERE code = 'DMARC-006' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- Domínio Externo: SPF
UPDATE compliance_rules SET 
  technical_risk = 'Sem SPF, qualquer servidor pode enviar emails em nome do domínio, facilitando phishing e spoofing.',
  business_impact = 'O domínio da empresa pode ser falsificado em campanhas de email maliciosas, prejudicando a reputação.',
  api_endpoint = 'DNS Query (SPF/TXT)'
WHERE code = 'SPF-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'SPF com "?all" ou "+all" não rejeita emails de servidores não autorizados, anulando a proteção.',
  business_impact = 'Emails falsificados passam na verificação SPF, enganando destinatários e sistemas de filtro.',
  api_endpoint = 'DNS Query (SPF/TXT)'
WHERE code = 'SPF-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'SPF com mais de 10 lookups DNS causa falha de validação (PermError), invalidando toda a proteção.',
  business_impact = 'Emails legítimos podem ser rejeitados devido ao erro de SPF, afetando comunicações críticas.',
  api_endpoint = 'DNS Query (SPF/TXT)'
WHERE code = 'SPF-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- Domínio Externo: MX
UPDATE compliance_rules SET 
  technical_risk = 'Sem registros MX, o domínio não pode receber emails, indicando configuração incompleta ou abandono.',
  business_impact = 'Impossibilidade de receber comunicações por email, afetando operações e relacionamento com clientes.',
  api_endpoint = 'DNS Query (MX)'
WHERE code = 'MX-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Com apenas um servidor MX, uma falha resulta em perda de todos os emails durante o período de indisponibilidade.',
  business_impact = 'Emails importantes podem ser perdidos ou atrasados durante falhas do servidor de email principal.',
  api_endpoint = 'DNS Query (MX)'
WHERE code = 'MX-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'MX sem prioridades distintas pode causar distribuição incorreta de carga ou failover imprevisível.',
  business_impact = 'Comportamento inconsistente na entrega de emails e dificuldade em gerenciar servidores de backup.',
  api_endpoint = 'DNS Query (MX)'
WHERE code = 'MX-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'MX apontando diretamente para IP viola RFC 5321 e pode causar problemas de entrega com alguns servidores.',
  business_impact = 'Emails podem ser rejeitados por servidores que seguem estritamente as especificações do protocolo.',
  api_endpoint = 'DNS Query (MX)'
WHERE code = 'MX-004' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Sem contato administrativo no SOA, não há como relatar problemas de DNS ou segurança para o domínio.',
  business_impact = 'Dificuldade para terceiros reportarem problemas, podendo atrasar a resposta a incidentes.',
  api_endpoint = 'DNS Query (SOA)'
WHERE code = 'MX-005' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

-- Domínio Externo: DNS
UPDATE compliance_rules SET 
  technical_risk = 'Sem DNSSEC, respostas DNS podem ser falsificadas (DNS spoofing/cache poisoning), redirecionando tráfego.',
  business_impact = 'Usuários podem ser direcionados para sites falsos, comprometendo credenciais e dados sensíveis.',
  api_endpoint = 'DNS Query (DNSSEC)'
WHERE code = 'DNS-001' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Sem registro DS na zona pai, a cadeia de confiança DNSSEC está quebrada, invalidando a proteção.',
  business_impact = 'DNSSEC configurado não oferece proteção real sem a delegação correta na zona pai.',
  api_endpoint = 'DNS Query (DNSSEC)'
WHERE code = 'DNS-002' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Com apenas um nameserver, uma falha resulta em indisponibilidade total de resolução DNS do domínio.',
  business_impact = 'Todos os serviços do domínio (web, email, APIs) ficam inacessíveis durante a falha do NS.',
  api_endpoint = 'DNS Query (NS)'
WHERE code = 'DNS-003' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Menos de 3 nameservers reduz a resiliência a falhas múltiplas ou ataques DDoS direcionados.',
  business_impact = 'Maior vulnerabilidade a interrupções de DNS durante incidentes que afetem múltiplos servidores.',
  api_endpoint = 'DNS Query (NS)'
WHERE code = 'DNS-004' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';

UPDATE compliance_rules SET 
  technical_risk = 'Nameservers no mesmo provedor ou ASN podem falhar simultaneamente durante incidentes do provedor.',
  business_impact = 'Risco de indisponibilidade total do domínio durante falhas do provedor de DNS.',
  api_endpoint = 'DNS Query (NS)'
WHERE code = 'DNS-005' AND device_type_id = 'd5562218-5a3d-4ca6-9591-03e220dbf7e1';