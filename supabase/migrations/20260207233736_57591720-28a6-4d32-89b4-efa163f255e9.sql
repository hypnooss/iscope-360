-- Atualizar a função rpc_get_agent_tasks para suportar tasks M365
CREATE OR REPLACE FUNCTION public.rpc_get_agent_tasks(p_agent_id uuid, p_limit integer DEFAULT 10)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tasks JSON;
BEGIN
  SELECT json_agg(task_data)
  INTO v_tasks
  FROM (
    -- ==========================================
    -- Firewall tasks (com blueprint de device)
    -- ==========================================
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
          FROM public.device_blueprints db
          WHERE db.device_type_id = COALESCE(f.device_type_id, (
            SELECT id FROM public.device_types WHERE code = 'fortigate' AND is_active = true LIMIT 1
          ))
          AND db.is_active = true
          ORDER BY db.version DESC
          LIMIT 1
        ),
        '{"steps": []}'::jsonb
      ) as blueprint
    FROM public.agent_tasks t
    LEFT JOIN public.firewalls f ON t.target_id = f.id AND t.target_type = 'firewall'
    WHERE t.agent_id = p_agent_id
      AND t.status = 'pending'
      AND t.expires_at > NOW()
      AND t.target_type = 'firewall'

    UNION ALL

    -- ==========================================
    -- External domain tasks (blueprint via banco)
    -- ==========================================
    SELECT
      t.id,
      t.task_type,
      t.target_id,
      t.target_type,
      t.payload,
      t.priority,
      t.expires_at,
      json_build_object(
        'id', d.id,
        'type', 'external_domain',
        'domain', d.domain,
        'base_url', ('https://' || d.domain),
        'credentials', json_build_object()
      ) as target,
      COALESCE(
        (
          SELECT db.collection_steps
          FROM public.device_blueprints db
          WHERE db.device_type_id = (
            SELECT id FROM public.device_types WHERE code = 'external_domain' AND is_active = true LIMIT 1
          )
          AND db.is_active = true
          ORDER BY db.version DESC
          LIMIT 1
        ),
        '{"steps": []}'::jsonb
      ) as blueprint
    FROM public.agent_tasks t
    LEFT JOIN public.external_domains d ON t.target_id = d.id AND t.target_type = 'external_domain'
    WHERE t.agent_id = p_agent_id
      AND t.status = 'pending'
      AND t.expires_at > NOW()
      AND t.target_type = 'external_domain'

    UNION ALL

    -- ==========================================
    -- M365 Tenant tasks (PowerShell via agent)
    -- Inclui dados do tenant, credenciais e certificado
    -- ==========================================
    SELECT
      t.id,
      t.task_type,
      t.target_id,
      t.target_type,
      t.payload,
      t.priority,
      t.expires_at,
      json_build_object(
        'id', mt.id,
        'type', 'm365_tenant',
        'tenant_id', mt.tenant_id,
        'tenant_domain', mt.tenant_domain,
        'display_name', mt.display_name,
        'credentials', json_build_object(
          'azure_app_id', cred.azure_app_id,
          'auth_type', cred.auth_type,
          'certificate_thumbprint', COALESCE(cred.certificate_thumbprint, a.certificate_thumbprint)
        )
      ) as target,
      '{"steps": []}'::jsonb as blueprint
    FROM public.agent_tasks t
    LEFT JOIN public.m365_tenants mt ON t.target_id = mt.id AND t.target_type = 'm365_tenant'
    LEFT JOIN public.m365_app_credentials cred ON cred.tenant_record_id = mt.id AND cred.is_active = true
    LEFT JOIN public.agents a ON a.id = t.agent_id
    WHERE t.agent_id = p_agent_id
      AND t.status = 'pending'
      AND t.expires_at > NOW()
      AND t.target_type = 'm365_tenant'

    ORDER BY priority DESC, expires_at ASC
    LIMIT p_limit
  ) as task_data;

  -- Marcar as tasks como running
  UPDATE public.agent_tasks
  SET 
    status = 'running',
    started_at = NOW(),
    timeout_at = NOW() + INTERVAL '15 minutes'
  WHERE id IN (
    SELECT id FROM public.agent_tasks
    WHERE agent_id = p_agent_id
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
  );

  RETURN COALESCE(v_tasks, '[]'::json);
END;
$function$;