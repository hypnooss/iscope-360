
CREATE OR REPLACE FUNCTION public.rpc_agent_heartbeat(p_agent_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agent RECORD;
  v_pending_count INTEGER;
  v_attack_pending INTEGER;
  v_config_flag INTEGER;
  v_heartbeat_interval INTEGER;
BEGIN
  SELECT COALESCE((value#>>'{}')::integer, 120)
  INTO v_heartbeat_interval
  FROM system_settings
  WHERE key = 'agent_heartbeat_interval';
  
  IF v_heartbeat_interval IS NULL THEN
    v_heartbeat_interval := 120;
  END IF;

  SELECT id, jwt_secret, revoked, config_updated_at, config_fetched_at, is_system_agent
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
  
  UPDATE agents SET last_seen = NOW() WHERE id = p_agent_id;
  
  SELECT COUNT(*) INTO v_pending_count
  FROM agent_tasks
  WHERE agent_id = p_agent_id
    AND status = 'pending'
    AND expires_at > NOW();

  -- For system agents, also check attack_surface_tasks
  IF v_agent.is_system_agent THEN
    SELECT COUNT(*) INTO v_attack_pending
    FROM attack_surface_tasks
    WHERE status = 'pending';

    v_pending_count := v_pending_count + v_attack_pending;
  END IF;
  
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
$function$;
