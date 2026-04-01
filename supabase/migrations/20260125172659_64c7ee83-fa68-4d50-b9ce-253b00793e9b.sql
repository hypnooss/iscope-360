-- =====================================================
-- FASE 1: Otimização do Heartbeat e Controle de Tarefas
-- =====================================================

-- 1.1 Adicionar campos de controle de execução na tabela agent_tasks
ALTER TABLE public.agent_tasks 
ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER,
ADD COLUMN IF NOT EXISTS step_results JSONB,
ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMP WITH TIME ZONE;

-- 1.2 Criar RPC para heartbeat otimizado (1 round-trip ao invés de 3)
CREATE OR REPLACE FUNCTION public.rpc_agent_heartbeat(
  p_agent_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_pending_count INTEGER;
  v_config_flag INTEGER;
BEGIN
  -- Buscar e validar agent em uma única query
  SELECT id, jwt_secret, revoked, config_updated_at, config_fetched_at
  INTO v_agent
  FROM agents
  WHERE id = p_agent_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'AGENT_NOT_FOUND', 'success', false);
  END IF;
  
  IF v_agent.revoked THEN
    RETURN json_build_object('error', 'BLOCKED', 'success', false);
  END IF;
  
  IF v_agent.jwt_secret IS NULL THEN
    RETURN json_build_object('error', 'UNREGISTERED', 'success', false);
  END IF;
  
  -- Atualizar last_seen atomicamente
  UPDATE agents SET last_seen = NOW() WHERE id = p_agent_id;
  
  -- Contar tarefas pendentes não expiradas
  SELECT COUNT(*) INTO v_pending_count
  FROM agent_tasks
  WHERE agent_id = p_agent_id
    AND status = 'pending'
    AND expires_at > NOW();
  
  -- Calcular config_flag (1 se há config nova, 0 caso contrário)
  v_config_flag := CASE 
    WHEN v_agent.config_updated_at > COALESCE(v_agent.config_fetched_at, '1970-01-01'::timestamptz)
    THEN 1 ELSE 0 
  END;
  
  RETURN json_build_object(
    'success', true,
    'agent_id', p_agent_id,
    'jwt_secret', v_agent.jwt_secret,
    'config_flag', v_config_flag,
    'has_pending_tasks', v_pending_count > 0,
    'next_heartbeat_in', 120
  );
END;
$$;

-- 1.3 Criar RPC para buscar tarefas com JOINs (elimina N+1)
CREATE OR REPLACE FUNCTION public.rpc_get_agent_tasks(
  p_agent_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tasks JSON;
BEGIN
  -- Buscar tarefas com dados do firewall e blueprint em uma única query
  SELECT json_agg(task_data)
  INTO v_tasks
  FROM (
    SELECT 
      t.id,
      t.task_type,
      t.target_id,
      t.target_type,
      t.payload,
      t.priority,
      t.expires_at,
      json_build_object(
        'id', f.id,
        'type', 'firewall',
        'base_url', f.fortigate_url,
        'credentials', json_build_object(
          'api_key', f.api_key,
          'username', f.auth_username,
          'password', f.auth_password
        )
      ) as target,
      COALESCE(
        (
          SELECT db.collection_steps
          FROM device_blueprints db
          WHERE db.device_type_id = COALESCE(f.device_type_id, (
            SELECT id FROM device_types WHERE code = 'fortigate' AND is_active = true LIMIT 1
          ))
          AND db.is_active = true
          ORDER BY db.version DESC
          LIMIT 1
        ),
        '{"steps": []}'::jsonb
      ) as blueprint
    FROM agent_tasks t
    LEFT JOIN firewalls f ON t.target_id = f.id AND t.target_type = 'firewall'
    WHERE t.agent_id = p_agent_id
      AND t.status = 'pending'
      AND t.expires_at > NOW()
    ORDER BY t.priority DESC, t.created_at ASC
    LIMIT p_limit
  ) as task_data;
  
  -- Marcar tarefas como running em batch
  UPDATE agent_tasks
  SET 
    status = 'running',
    started_at = NOW(),
    timeout_at = NOW() + INTERVAL '15 minutes'
  WHERE id IN (
    SELECT id FROM agent_tasks
    WHERE agent_id = p_agent_id
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
  );
  
  RETURN COALESCE(v_tasks, '[]'::json);
END;
$$;

-- 1.4 Criar função para auto-timeout de tarefas travadas
CREATE OR REPLACE FUNCTION public.cleanup_stuck_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Marcar tarefas running por mais de 15 minutos como timeout
  UPDATE agent_tasks
  SET 
    status = 'timeout',
    error_message = 'Task excedeu tempo máximo de execução (15 min)',
    completed_at = NOW()
  WHERE status = 'running'
    AND (
      timeout_at IS NOT NULL AND timeout_at < NOW()
      OR
      timeout_at IS NULL AND started_at < NOW() - INTERVAL '15 minutes'
    );
END;
$$;

-- 1.5 Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_status_pending 
ON agent_tasks(agent_id, status) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_agent_tasks_running_timeout 
ON agent_tasks(status, timeout_at) 
WHERE status = 'running';