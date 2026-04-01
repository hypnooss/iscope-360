-- Tabela para configurações globais do sistema
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Apenas super_admin pode gerenciar (INSERT, UPDATE, DELETE)
CREATE POLICY "Super admins can manage system settings"
    ON public.system_settings FOR ALL
    USING (has_role(auth.uid(), 'super_admin'));

-- Inserir valor padrão do heartbeat
INSERT INTO public.system_settings (key, value, description)
VALUES (
    'agent_heartbeat_interval',
    '120'::jsonb,
    'Intervalo em segundos entre heartbeats dos agents (60-300)'
);

-- Trigger para updated_at
CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Atualizar função RPC para ler o intervalo da tabela
CREATE OR REPLACE FUNCTION public.rpc_agent_heartbeat(p_agent_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agent RECORD;
  v_pending_count INTEGER;
  v_config_flag INTEGER;
  v_heartbeat_interval INTEGER;
BEGIN
  -- Buscar intervalo de heartbeat configurado
  SELECT COALESCE((value#>>'{}')::integer, 120)
  INTO v_heartbeat_interval
  FROM system_settings
  WHERE key = 'agent_heartbeat_interval';
  
  -- Fallback se não encontrar
  IF v_heartbeat_interval IS NULL THEN
    v_heartbeat_interval := 120;
  END IF;

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
    'next_heartbeat_in', v_heartbeat_interval
  );
END;
$function$