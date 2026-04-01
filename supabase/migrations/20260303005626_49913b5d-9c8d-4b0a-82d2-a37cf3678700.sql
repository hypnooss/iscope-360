
-- 1. Update exo_inbox_rules step to include InError field
UPDATE device_blueprints 
SET collection_steps = jsonb_set(
  collection_steps,
  '{steps}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN step->>'id' = 'exo_inbox_rules' 
        THEN jsonb_set(
          step, 
          '{params,commands,0,command}',
          to_jsonb('Get-Mailbox -ResultSize 200 | ForEach-Object { $mbx = $_.PrimarySmtpAddress; Get-InboxRule -Mailbox $mbx -ErrorAction SilentlyContinue | Select-Object @{N=''MailboxOwner'';E={$mbx}}, Name, Enabled, ForwardTo, ForwardAsAttachmentTo, RedirectTo, DeleteMessage, MoveToFolder, InError } | Where-Object { $_ -ne $null } | ConvertTo-Json -Depth 5'::text)
        )
        ELSE step
      END
    )
    FROM jsonb_array_elements(collection_steps->'steps') AS step
  ),
  true
),
updated_at = now()
WHERE id = 'e276576e-0de0-4463-a0ee-940b970c4f69';

-- 2. Insert EXO-023 compliance rule
INSERT INTO compliance_rules (
  code, name, description, category, severity, weight,
  device_type_id, evaluation_logic,
  pass_description, fail_description, not_found_description,
  recommendation, technical_risk, business_impact,
  api_endpoint, is_active
) VALUES (
  'EXO-023',
  'Regras de Inbox com Erros',
  'Verifica se existem regras de inbox corrompidas (InError=True) nas mailboxes do Exchange Online',
  'email_exchange',
  'medium',
  2,
  '5d1a7095-2d7b-4541-873d-4b03c3d6122f',
  '{"source_key": "exo_inbox_rules", "evaluate": {"type": "check_inbox_rules_in_error"}}',
  'Nenhuma regra de inbox com erros foi encontrada nas mailboxes analisadas.',
  '{count} regra(s) de inbox com erros detectada(s). Regras corrompidas podem causar comportamento inesperado no fluxo de e-mails.',
  'Dados de regras de inbox não disponíveis. Verifique se o módulo Exchange Online está conectado.',
  'Acesse o Exchange Admin Center > Mailboxes e edite ou recrie as regras de inbox corrompidas. Use o comando Get-InboxRule -Mailbox <email> para identificar as regras com InError=True e Remove-InboxRule para removê-las.',
  'Regras de inbox corrompidas (InError=True) podem falhar silenciosamente, permitindo que e-mails ignorem filtros de segurança, encaminhamentos ou ações configuradas pelo usuário. Atacantes podem explorar regras quebradas para ocultar evidências de comprometimento.',
  'Regras de inbox com erros podem resultar em perda de e-mails importantes, falha em processos automatizados de compliance, e dificultam a investigação de incidentes de segurança ao mascarar o fluxo real de mensagens.',
  'Get-InboxRule',
  true
);
