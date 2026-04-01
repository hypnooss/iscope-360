-- Nova regra: DMARC-006 (Alinhamento DKIM Estrito)
INSERT INTO compliance_rules (
  device_type_id,
  code,
  name,
  description,
  category,
  severity,
  weight,
  evaluation_logic,
  pass_description,
  fail_description,
  recommendation,
  is_active
) VALUES (
  'd5562218-5a3d-4ca6-9591-03e220dbf7e1',
  'DMARC-006',
  'Alinhamento DKIM Estrito',
  'Verifica se o DMARC exige alinhamento estrito de DKIM (adkim=s).',
  'Autenticação de Email - DMARC',
  'low',
  3,
  '{"field": "data.parsed.adkim", "operator": "eq", "step_id": "dmarc_record", "value": "s"}',
  'Alinhamento DKIM estrito está configurado.',
  'Alinhamento DKIM relaxado permite subdomínios, reduzindo proteção.',
  'Adicione "adkim=s" ao DMARC para exigir correspondência exata do domínio DKIM.',
  true
);