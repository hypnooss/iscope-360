
-- Step 2: Update existing records from firewall_analyzer to fortigate_analyzer
UPDATE public.agent_tasks 
SET task_type = 'fortigate_analyzer' 
WHERE task_type = 'firewall_analyzer';

-- Update RPC function to use fortigate_analyzer
CREATE OR REPLACE FUNCTION public.rpc_get_agent_tasks(p_agent_id uuid, p_limit integer DEFAULT 10)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tasks JSON;
  v_is_system BOOLEAN;
BEGIN
  SELECT is_system_agent INTO v_is_system
  FROM agents WHERE id = p_agent_id;

  IF v_is_system = true THEN
    WITH claimed AS (
      UPDATE public.attack_surface_tasks
      SET status = 'assigned',
          assigned_agent_id = p_agent_id,
          started_at = NOW()
      WHERE id IN (
        SELECT ast.id
        FROM public.attack_surface_tasks ast
        WHERE ast.status = 'pending'
        ORDER BY ast.created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    )
    SELECT json_agg(json_build_object(
      'id', c.id,
      'task_type', 'attack_surface_scan',
      'target_id', c.snapshot_id,
      'target_type', 'attack_surface',
      'payload', json_build_object('ip', c.ip, 'source', c.source, 'label', c.label),
      'priority', 5,
      'expires_at', (NOW() + INTERVAL '2 hours')::text,
      'target', json_build_object('id', c.snapshot_id, 'type', 'attack_surface', 'ip', c.ip),
      'blueprint', json_build_object('steps', (
        SELECT COALESCE(
          (SELECT jsonb_agg(
            step || jsonb_build_object('params',
              COALESCE(step->'params', '{}'::jsonb) || jsonb_build_object('ip', c.ip)
            )
          ) FROM jsonb_array_elements(db.collection_steps->'steps') AS step),
          '[]'::jsonb
        )
        FROM public.device_blueprints db
        WHERE db.device_type_id = (SELECT id FROM public.device_types WHERE code = 'attack_surface' AND is_active = true LIMIT 1)
        AND db.is_active = true ORDER BY db.version DESC LIMIT 1
      ))
    ))
    INTO v_tasks FROM claimed c;

    RETURN COALESCE(v_tasks, '[]'::json);
  END IF;

  -- Regular agent logic
  SELECT json_agg(task_data) INTO v_tasks
  FROM (
    SELECT t.id, t.task_type, t.target_id, t.target_type, t.payload, t.priority, t.expires_at,
      json_build_object('id', f.id, 'type', 'firewall', 'base_url', f.fortigate_url,
        'credentials', json_build_object('api_key', f.api_key, 'username', f.auth_username, 'password', f.auth_password)) as target,
      COALESCE((SELECT jsonb_build_object('steps', COALESCE((SELECT jsonb_agg(step) FROM jsonb_array_elements(db.collection_steps->'steps') AS step WHERE COALESCE(step->>'executor', 'agent') NOT IN ('edge_function')), '[]'::jsonb))
        FROM public.device_blueprints db WHERE db.device_type_id = COALESCE(f.device_type_id, (SELECT id FROM public.device_types WHERE code = 'fortigate' AND is_active = true LIMIT 1))
        AND db.is_active = true AND db.executor_type = CASE WHEN t.task_type = 'fortigate_analyzer' THEN 'hybrid'::blueprint_executor_type ELSE 'agent'::blueprint_executor_type END
        ORDER BY db.version DESC LIMIT 1), '{"steps": []}'::jsonb) as blueprint
    FROM public.agent_tasks t LEFT JOIN public.firewalls f ON t.target_id = f.id AND t.target_type = 'firewall'
    WHERE t.agent_id = p_agent_id AND t.status = 'pending' AND t.expires_at > NOW() AND t.target_type = 'firewall'

    UNION ALL

    SELECT t.id, t.task_type, t.target_id, t.target_type, t.payload, t.priority, t.expires_at,
      json_build_object('id', d.id, 'type', 'external_domain', 'domain', d.domain, 'base_url', ('https://' || d.domain), 'credentials', json_build_object()) as target,
      COALESCE((SELECT jsonb_build_object('steps', COALESCE((SELECT jsonb_agg(step) FROM jsonb_array_elements(db.collection_steps->'steps') AS step WHERE COALESCE(step->>'executor', 'agent') NOT IN ('edge_function')), '[]'::jsonb))
        FROM public.device_blueprints db WHERE db.device_type_id = (SELECT id FROM public.device_types WHERE code = 'external_domain' AND is_active = true LIMIT 1)
        AND db.is_active = true ORDER BY db.version DESC LIMIT 1), '{"steps": []}'::jsonb) as blueprint
    FROM public.agent_tasks t LEFT JOIN public.external_domains d ON t.target_id = d.id AND t.target_type = 'external_domain'
    WHERE t.agent_id = p_agent_id AND t.status = 'pending' AND t.expires_at > NOW() AND t.target_type = 'external_domain'

    UNION ALL

    SELECT t.id, t.task_type, t.target_id, t.target_type, t.payload, t.priority, t.expires_at,
      json_build_object('id', mt.id, 'type', 'm365_tenant', 'tenant_id', mt.tenant_id, 'tenant_domain', mt.tenant_domain, 'display_name', mt.display_name,
        'credentials', json_build_object('azure_app_id', cred.azure_app_id, 'auth_type', cred.auth_type, 'certificate_thumbprint', COALESCE(cred.certificate_thumbprint, a.certificate_thumbprint))) as target,
      COALESCE((SELECT jsonb_build_object('steps', COALESCE((SELECT jsonb_agg(step) FROM jsonb_array_elements(db.collection_steps->'steps') AS step WHERE COALESCE(step->>'executor', 'agent') NOT IN ('edge_function')), '[]'::jsonb))
        FROM public.device_blueprints db WHERE db.device_type_id = (SELECT id FROM public.device_types WHERE code = 'm365' AND is_active = true LIMIT 1)
        AND db.executor_type IN ('agent', 'hybrid') AND db.is_active = true ORDER BY db.version DESC LIMIT 1),
        CASE WHEN t.payload->'commands' IS NOT NULL THEN jsonb_build_object('steps', jsonb_build_array(jsonb_build_object(
          'id', COALESCE(t.payload->>'test_type', 'powershell_exec'), 'type', 'powershell',
          'params', jsonb_build_object('module', COALESCE(t.payload->>'module', 'ExchangeOnline'), 'commands', t.payload->'commands',
            'app_id', cred.azure_app_id, 'tenant_id', mt.tenant_id, 'organization', COALESCE(t.payload->>'organization', mt.tenant_domain)))))
        ELSE '{"steps": []}'::jsonb END) as blueprint
    FROM public.agent_tasks t
    LEFT JOIN public.m365_tenants mt ON t.target_id = mt.id AND t.target_type = 'm365_tenant'
    LEFT JOIN public.m365_app_credentials cred ON cred.tenant_record_id = mt.id AND cred.is_active = true
    LEFT JOIN public.agents a ON a.id = t.agent_id
    WHERE t.agent_id = p_agent_id AND t.status = 'pending' AND t.expires_at > NOW() AND t.target_type = 'm365_tenant'

    ORDER BY priority DESC, expires_at ASC LIMIT p_limit
  ) as task_data;

  UPDATE public.agent_tasks SET status = 'running', started_at = NOW(), timeout_at = NOW() + INTERVAL '15 minutes'
  WHERE id IN (SELECT id FROM public.agent_tasks WHERE agent_id = p_agent_id AND status = 'pending' AND expires_at > NOW()
    ORDER BY priority DESC, created_at ASC LIMIT p_limit);

  RETURN COALESCE(v_tasks, '[]'::json);
END;
$function$;
