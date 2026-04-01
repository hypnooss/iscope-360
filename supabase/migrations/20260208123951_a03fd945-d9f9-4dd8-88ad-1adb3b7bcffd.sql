-- Desativar regras EXO que dependem de Graph API per-user (não funcionais atualmente)
-- Exchange Online será avaliado exclusivamente via Agent (PowerShell)
UPDATE compliance_rules
SET 
  is_active = false,
  updated_at = now()
WHERE code IN ('EXO-001', 'EXO-002', 'EXO-003', 'EXO-004', 'EXO-005')
  AND api_endpoint LIKE '/users%';

-- Comentário: Estas regras requerem chamadas N+1 (uma por usuário) via Graph API
-- O Agent já coleta esses dados de forma mais completa via PowerShell