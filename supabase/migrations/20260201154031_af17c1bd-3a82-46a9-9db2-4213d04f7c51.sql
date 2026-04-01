-- Popular tabela evidence_parses com dados de humanização de evidências
INSERT INTO public.evidence_parses (device_type_id, source_field, display_label, parse_type, value_transformations, is_active, display_order)
VALUES
  -- DNSSEC Status
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.has_dnskey', 'Status DNSSEC', 'boolean', '{"true": "DNSSEC Ativado", "false": "DNSSEC Desativado"}', true, 0),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.has_ds', 'Registro DS', 'boolean', '{"true": "Presente", "false": "Ausente"}', true, 1),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.validated', 'Validação DNSSEC', 'boolean', '{"true": "Validação OK", "false": "Não validado"}', true, 2),
  
  -- SOA Records
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.mname', 'Servidor Primário', 'text', '{}', true, 3),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.rname', 'Email do Responsável', 'text', '{}', true, 4),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.contact_email', 'Contato do Administrador', 'text', '{}', true, 5),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.refresh', 'Tempo de Refresh', 'time', '{}', true, 6),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.retry', 'Tempo de Retry', 'time', '{}', true, 7),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.expire', 'Tempo de Expiração', 'time', '{}', true, 8),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.minimum', 'TTL Mínimo', 'time', '{}', true, 9),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.serial', 'Número Serial', 'number', '{}', true, 10),
  
  -- SPF Records
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.raw', 'Registro Bruto', 'text', '{}', true, 11),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.includes', 'Mecanismos Include', 'list', '{}', true, 12),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.all', 'Política ALL', 'text', '{"-all": "Falha Rígida (recomendado)", "~all": "Falha Suave", "?all": "Neutro", "+all": "Aceitar Todos (inseguro)"}', true, 13),
  
  -- DKIM Records
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.found', 'Registros DKIM', 'list', '{}', true, 14),
  
  -- DMARC Records
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.p', 'Política DMARC', 'text', '{"reject": "Rejeitar", "quarantine": "Quarentena", "none": "Nenhuma"}', true, 15),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.sp', 'Política de Subdomínio', 'text', '{"reject": "Rejeitar", "quarantine": "Quarentena", "none": "Nenhuma"}', true, 16),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.aspf', 'Alinhamento SPF', 'text', '{"r": "Relaxado", "s": "Estrito"}', true, 17),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.adkim', 'Alinhamento DKIM', 'text', '{"r": "Relaxado", "s": "Estrito"}', true, 18),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.pct', 'Cobertura', 'number', '{"100": "100% (total)"}', true, 19),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.rua', 'Relatórios (RUA)', 'text', '{}', true, 20),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.parsed.ruf', 'Relatórios Forenses (RUF)', 'text', '{}', true, 21),
  
  -- Nameservers/MX
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.records', 'Registros', 'list', '{}', true, 22),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.records[].host', 'Nameserver', 'text', '{}', true, 23),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.records[].exchange', 'Servidor MX', 'text', '{}', true, 24),
  ('d5562218-5a3d-4ca6-9591-03e220dbf7e1', 'data.records[].priority', 'Prioridade', 'number', '{}', true, 25);