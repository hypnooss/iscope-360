
-- ============================================================================
-- Fase 1: Super Agent Infrastructure (retry without system_alerts)
-- ============================================================================

-- 1. Add is_system_agent flag to agents table
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS is_system_agent BOOLEAN NOT NULL DEFAULT false;

-- 2. Add 'scanner' to device_category enum
ALTER TYPE public.device_category ADD VALUE IF NOT EXISTS 'scanner';

-- 3. Create attack_surface_tasks table
CREATE TABLE IF NOT EXISTS public.attack_surface_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.attack_surface_snapshots(id) ON DELETE CASCADE,
  ip TEXT NOT NULL,
  source TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_agent_id UUID REFERENCES public.agents(id),
  result JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attack_surface_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attack_surface_tasks' AND policyname = 'Service role can manage attack surface tasks') THEN
    CREATE POLICY "Service role can manage attack surface tasks"
      ON public.attack_surface_tasks FOR ALL
      USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
      WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attack_surface_tasks' AND policyname = 'Super admins can view attack surface tasks') THEN
    CREATE POLICY "Super admins can view attack surface tasks"
      ON public.attack_surface_tasks FOR SELECT
      USING (has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'attack_surface_tasks' AND policyname = 'Users can view attack surface tasks of accessible snapshots') THEN
    CREATE POLICY "Users can view attack surface tasks of accessible snapshots"
      ON public.attack_surface_tasks FOR SELECT
      USING (EXISTS (
        SELECT 1 FROM public.attack_surface_snapshots s
        WHERE s.id = attack_surface_tasks.snapshot_id
        AND has_client_access(auth.uid(), s.client_id)
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attack_surface_tasks_snapshot ON public.attack_surface_tasks(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_attack_surface_tasks_status ON public.attack_surface_tasks(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_attack_surface_tasks_agent ON public.attack_surface_tasks(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

-- 4. Update RPC to support Super Agent task fetching
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
          (SELECT jsonb_agg(step) FROM jsonb_array_elements(db.collection_steps->'steps') AS step),
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
        AND db.is_active = true AND db.executor_type = CASE WHEN t.task_type = 'firewall_analyzer' THEN 'hybrid'::blueprint_executor_type ELSE 'agent'::blueprint_executor_type END
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
