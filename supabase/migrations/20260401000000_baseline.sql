


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."agent_task_status" AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'timeout',
    'cancelled'
);


ALTER TYPE "public"."agent_task_status" OWNER TO "postgres";


CREATE TYPE "public"."agent_task_type" AS ENUM (
    'fortigate_compliance',
    'fortigate_cve',
    'ssh_command',
    'snmp_query',
    'ping_check',
    'external_domain_analysis',
    'm365_powershell',
    'firewall_analyzer',
    'fortigate_analyzer',
    'geo_query',
    'm365_analyzer'
);


ALTER TYPE "public"."agent_task_type" OWNER TO "postgres";


CREATE TYPE "public"."app_role" AS ENUM (
    'super_admin',
    'workspace_admin',
    'user',
    'super_suporte'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."blueprint_executor_type" AS ENUM (
    'agent',
    'edge_function',
    'hybrid',
    'monitor'
);


ALTER TYPE "public"."blueprint_executor_type" OWNER TO "postgres";


CREATE TYPE "public"."device_category" AS ENUM (
    'firewall',
    'switch',
    'router',
    'wlc',
    'server',
    'other',
    'scanner'
);


ALTER TYPE "public"."device_category" OWNER TO "postgres";


CREATE TYPE "public"."m365_submodule" AS ENUM (
    'entra_id',
    'sharepoint',
    'exchange',
    'defender',
    'intune',
    'teams'
);


ALTER TYPE "public"."m365_submodule" OWNER TO "postgres";


CREATE TYPE "public"."module_permission" AS ENUM (
    'view',
    'edit',
    'full'
);


ALTER TYPE "public"."module_permission" OWNER TO "postgres";


CREATE TYPE "public"."parse_type" AS ENUM (
    'text',
    'boolean',
    'time',
    'list',
    'json',
    'number'
);


ALTER TYPE "public"."parse_type" OWNER TO "postgres";


CREATE TYPE "public"."permission_status" AS ENUM (
    'granted',
    'pending',
    'denied',
    'missing'
);


ALTER TYPE "public"."permission_status" OWNER TO "postgres";


CREATE TYPE "public"."rule_severity" AS ENUM (
    'critical',
    'high',
    'medium',
    'low',
    'info'
);


ALTER TYPE "public"."rule_severity" OWNER TO "postgres";


CREATE TYPE "public"."schedule_frequency" AS ENUM (
    'daily',
    'weekly',
    'monthly',
    'manual',
    'hourly'
);


ALTER TYPE "public"."schedule_frequency" OWNER TO "postgres";


CREATE TYPE "public"."scope_module" AS ENUM (
    'scope_firewall',
    'scope_network',
    'scope_cloud',
    'scope_m365'
);


ALTER TYPE "public"."scope_module" OWNER TO "postgres";


CREATE TYPE "public"."tenant_connection_status" AS ENUM (
    'pending',
    'connected',
    'partial',
    'failed',
    'disconnected'
);


ALTER TYPE "public"."tenant_connection_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_user"("_admin_id" "uuid", "_target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.has_role(_admin_id, 'super_admin')
    OR
    (
      public.has_role(_admin_id, 'workspace_admin')
      AND EXISTS (
        SELECT 1
        FROM public.user_clients admin_clients
        JOIN public.user_clients target_clients ON admin_clients.client_id = target_clients.client_id
        WHERE admin_clients.user_id = _admin_id
        AND target_clients.user_id = _target_user_id
      )
    )
$$;


ALTER FUNCTION "public"."can_manage_user"("_admin_id" "uuid", "_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_agent_metrics"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.agent_metrics
  WHERE collected_at < NOW() - INTERVAL '7 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_old_agent_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_rate_limits"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.rate_limits
  WHERE created_at < now() - INTERVAL '24 hours';
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_rate_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_step_results"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.task_step_results
  WHERE task_id IN (
    SELECT id FROM public.agent_tasks
    WHERE status IN ('completed', 'failed', 'timeout')
    AND completed_at < NOW() - INTERVAL '24 hours'
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_step_results"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_stuck_tasks"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE agent_tasks
  SET
    status = 'timeout',
    error_message = 'Task excedeu tempo máximo de execução (30 min)',
    completed_at = NOW()
  WHERE status = 'running'
    AND (
      timeout_at IS NOT NULL AND timeout_at < NOW()
      OR
      timeout_at IS NULL AND started_at < NOW() - INTERVAL '30 minutes'
    );
END;
$$;


ALTER FUNCTION "public"."cleanup_stuck_tasks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ext_domain_dashboard_summary"("p_domain_ids" "uuid"[]) RETURNS TABLE("domain_id" "uuid", "score" integer, "critical" integer, "high" integer, "medium" integer, "low" integer, "analyzed_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    sub.domain_id, sub.score,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='critical' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='high' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='medium' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='low' THEN 1 ELSE 0 END), 0)::integer,
    sub.created_at
  FROM (
    SELECT DISTINCT ON (ah.domain_id)
      ah.domain_id, ah.score::integer, ah.report_data, ah.created_at
    FROM external_domain_analysis_history ah
    WHERE ah.domain_id = ANY(p_domain_ids) AND ah.status = 'completed'
    ORDER BY ah.domain_id, ah.created_at DESC
  ) sub
  LEFT JOIN LATERAL (
    SELECT jsonb_array_elements(cat_value) AS chk
    FROM jsonb_each(sub.report_data->'categories') AS cats(cat_key, cat_value)
  ) c ON true
  GROUP BY sub.domain_id, sub.score, sub.created_at;
$$;


ALTER FUNCTION "public"."get_ext_domain_dashboard_summary"("p_domain_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_fw_dashboard_summary"("p_firewall_ids" "uuid"[]) RETURNS TABLE("firewall_id" "uuid", "score" integer, "critical" integer, "high" integer, "medium" integer, "low" integer, "analyzed_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    sub.firewall_id,
    sub.score,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='critical' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='high' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='medium' THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN c.chk->>'status'='fail' AND c.chk->>'severity'='low' THEN 1 ELSE 0 END), 0)::integer,
    sub.created_at
  FROM (
    SELECT DISTINCT ON (ah.firewall_id)
      ah.firewall_id, ah.score, ah.report_data, ah.created_at
    FROM analysis_history ah
    WHERE ah.firewall_id = ANY(p_firewall_ids)
    ORDER BY ah.firewall_id, ah.created_at DESC
  ) sub
  LEFT JOIN LATERAL (
    SELECT jsonb_array_elements(cat_value) AS chk
    FROM jsonb_each(sub.report_data->'categories') AS cats(cat_key, cat_value)
  ) c ON true
  GROUP BY sub.firewall_id, sub.score, sub.created_at;
$$;


ALTER FUNCTION "public"."get_fw_dashboard_summary"("p_firewall_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_insight_affected_entities"("p_history_id" "uuid", "p_insight_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_insights jsonb;
  v_agent_insights jsonb;
  v_result jsonb;
BEGIN
  SELECT insights, agent_insights
  INTO v_insights, v_agent_insights
  FROM m365_posture_history
  WHERE id = p_history_id;

  IF v_insights IS NULL AND v_agent_insights IS NULL THEN
    RETURN NULL;
  END IF;

  -- Search in insights array
  SELECT elem->'affectedEntities'
  INTO v_result
  FROM jsonb_array_elements(COALESCE(v_insights, '[]'::jsonb)) AS elem
  WHERE elem->>'code' = p_insight_code
     OR elem->>'id' = p_insight_code
  LIMIT 1;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Search in agent_insights array
  SELECT elem->'affectedEntities'
  INTO v_result
  FROM jsonb_array_elements(COALESCE(v_agent_insights, '[]'::jsonb)) AS elem
  WHERE elem->>'id' = p_insight_code
     OR elem->>'name' = p_insight_code
  LIMIT 1;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_insight_affected_entities"("p_history_id" "uuid", "p_insight_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_module_permission"("_user_id" "uuid", "_module_name" "text") RETURNS "public"."module_permission"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'super_admin') THEN 'full'::public.module_permission
    ELSE COALESCE(
      (
        SELECT ump.permission
        FROM public.user_module_permissions ump
        WHERE ump.user_id = _user_id
          AND ump.module_name = _module_name
        LIMIT 1
      ),
      'view'::public.module_permission
    )
  END;
$$;


ALTER FUNCTION "public"."get_module_permission"("_user_id" "uuid", "_module_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_posture_insights_lite"("p_tenant_record_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_record record;
  v_insights jsonb;
  v_agent_insights jsonb;
  v_result jsonb;
BEGIN
  SELECT id, score, classification, summary, category_breakdown,
         insights, agent_insights, agent_status, completed_at, created_at, errors
  INTO v_record
  FROM m365_posture_history
  WHERE tenant_record_id = p_tenant_record_id
    AND status = 'completed'
  ORDER BY completed_at DESC NULLS LAST
  LIMIT 1;

  IF v_record IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    (elem - 'affectedEntities' - 'evidencias') || jsonb_build_object(
      'affectedCount', COALESCE((elem->>'affectedCount')::numeric::int, jsonb_array_length(COALESCE(elem->'affectedEntities', '[]'::jsonb))),
      '_entitiesPreview', (
        SELECT COALESCE(jsonb_agg(e->>'displayName'), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(elem->'affectedEntities', '[]'::jsonb)) WITH ORDINALITY AS t(e, idx)
        WHERE idx <= 15
      )
    )
  ), '[]'::jsonb)
  INTO v_insights
  FROM jsonb_array_elements(COALESCE(v_record.insights, '[]'::jsonb)) AS elem;

  SELECT COALESCE(jsonb_agg(
    (elem - 'affectedEntities') || jsonb_build_object(
      '_entitiesPreview', (
        SELECT COALESCE(jsonb_agg(e->>'name'), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(elem->'affectedEntities', '[]'::jsonb)) WITH ORDINALITY AS t(e, idx)
        WHERE idx <= 15
      )
    )
  ), '[]'::jsonb)
  INTO v_agent_insights
  FROM jsonb_array_elements(COALESCE(v_record.agent_insights, '[]'::jsonb)) AS elem;

  v_result := jsonb_build_object(
    'id', v_record.id,
    'score', v_record.score,
    'classification', v_record.classification,
    'summary', v_record.summary,
    'category_breakdown', v_record.category_breakdown,
    'insights', v_insights,
    'agent_insights', v_agent_insights,
    'agent_status', v_record.agent_status,
    'completed_at', v_record.completed_at,
    'created_at', v_record.created_at,
    'errors', v_record.errors
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_posture_insights_lite"("p_tenant_record_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_modules"("_user_id" "uuid") RETURNS TABLE("module_id" "uuid", "code" "public"."scope_module", "name" "text", "description" "text", "icon" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT m.id, m.code::scope_module, m.name, m.description, m.icon
  FROM public.modules m
  WHERE m.is_active = true
  AND (
    has_role(_user_id, 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.user_modules um
      WHERE um.user_id = _user_id AND um.module_id = m.id
    )
  )
$$;


ALTER FUNCTION "public"."get_user_modules"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );

  -- Primeiro usuário é super_admin
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin');

    INSERT INTO public.user_module_permissions (user_id, module_name, permission)
    VALUES
      (NEW.id, 'dashboard', 'full'),
      (NEW.id, 'firewall', 'full'),
      (NEW.id, 'reports', 'full'),
      (NEW.id, 'users', 'full'),
      (NEW.id, 'm365', 'full'),
      (NEW.id, 'external_domain', 'full');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');

    INSERT INTO public.user_module_permissions (user_id, module_name, permission)
    VALUES
      (NEW.id, 'dashboard', 'view'),
      (NEW.id, 'firewall', 'view'),
      (NEW.id, 'reports', 'view'),
      (NEW.id, 'external_domain', 'view');
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_client_access"("_user_id" "uuid", "_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.has_role(_user_id, 'super_admin') OR
    EXISTS (
      SELECT 1
      FROM public.user_clients
      WHERE user_id = _user_id
        AND client_id = _client_id
    )
$$;


ALTER FUNCTION "public"."has_client_access"("_user_id" "uuid", "_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_modules um
    JOIN public.modules m ON um.module_id = m.id
    WHERE um.user_id = _user_id
    AND m.code = _module_code
    AND m.is_active = true
  ) OR has_role(_user_id, 'super_admin')
$$;


ALTER FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "public"."scope_module") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_modules um
    JOIN public.modules m ON um.module_id = m.id
    WHERE um.user_id = _user_id
    AND m.code = _module_code::text
    AND m.is_active = true
  ) OR has_role(_user_id, 'super_admin')
$$;


ALTER FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "public"."scope_module") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'workspace_admin')
  )
$$;


ALTER FUNCTION "public"."is_admin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_client_admin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT public.has_role(_user_id, 'workspace_admin') OR public.has_role(_user_id, 'super_admin')
$$;


ALTER FUNCTION "public"."is_client_admin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_agent_heartbeat"("p_agent_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."rpc_agent_heartbeat"("p_agent_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_get_agent_tasks"("p_agent_id" "uuid", "p_limit" integer DEFAULT 4) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- Regular agent logic with client authorization
  SELECT json_agg(task_data) INTO v_tasks
  FROM (
    -- Firewall tasks (with agent-client authorization)
    SELECT t.id, t.task_type, t.target_id, t.target_type, t.payload, t.priority, t.expires_at,
      json_build_object('id', f.id, 'type', 'firewall', 'base_url', f.fortigate_url,
        'credentials', json_build_object('api_key', f.api_key, 'username', f.auth_username, 'password', f.auth_password)) as target,
      COALESCE((SELECT jsonb_build_object('steps', COALESCE((SELECT jsonb_agg(step) FROM jsonb_array_elements(db.collection_steps->'steps') AS step WHERE COALESCE(step->>'executor', 'agent') NOT IN ('edge_function')), '[]'::jsonb))
        FROM public.device_blueprints db WHERE db.device_type_id = COALESCE(f.device_type_id, (SELECT id FROM public.device_types WHERE code = 'fortigate' AND is_active = true LIMIT 1))
        AND db.is_active = true AND db.executor_type = CASE WHEN t.task_type = 'fortigate_analyzer' THEN 'hybrid'::blueprint_executor_type ELSE 'agent'::blueprint_executor_type END
        ORDER BY db.version DESC LIMIT 1), '{"steps": []}'::jsonb) as blueprint
    FROM public.agent_tasks t LEFT JOIN public.firewalls f ON t.target_id = f.id AND t.target_type = 'firewall'
    WHERE t.agent_id = p_agent_id AND t.status = 'pending' AND t.expires_at > NOW() AND t.target_type = 'firewall'
      AND (f.id IS NULL OR EXISTS (
        SELECT 1 FROM public.agents a
        WHERE a.id = p_agent_id AND a.client_id = f.client_id
      ))

    UNION ALL

    -- External domain tasks (with agent-client authorization)
    SELECT t.id, t.task_type, t.target_id, t.target_type, t.payload, t.priority, t.expires_at,
      json_build_object('id', d.id, 'type', 'external_domain', 'domain', d.domain, 'base_url', ('https://' || d.domain), 'credentials', json_build_object()) as target,
      COALESCE((SELECT jsonb_build_object('steps', COALESCE((SELECT jsonb_agg(step) FROM jsonb_array_elements(db.collection_steps->'steps') AS step WHERE COALESCE(step->>'executor', 'agent') NOT IN ('edge_function')), '[]'::jsonb))
        FROM public.device_blueprints db WHERE db.device_type_id = (SELECT id FROM public.device_types WHERE code = 'external_domain' AND is_active = true LIMIT 1)
        AND db.is_active = true ORDER BY db.version DESC LIMIT 1), '{"steps": []}'::jsonb) as blueprint
    FROM public.agent_tasks t LEFT JOIN public.external_domains d ON t.target_id = d.id AND t.target_type = 'external_domain'
    WHERE t.agent_id = p_agent_id AND t.status = 'pending' AND t.expires_at > NOW() AND t.target_type = 'external_domain'
      AND (d.id IS NULL OR EXISTS (
        SELECT 1 FROM public.agents a
        WHERE a.id = p_agent_id AND a.client_id = d.client_id
      ))

    UNION ALL

    -- M365 tenant tasks (with agent-tenant authorization) — now includes spo_domain
    SELECT t.id, t.task_type, t.target_id, t.target_type, t.payload, t.priority, t.expires_at,
      json_build_object('id', mt.id, 'type', 'm365_tenant', 'tenant_id', mt.tenant_id, 'tenant_domain', mt.tenant_domain, 'display_name', mt.display_name, 'spo_domain', mt.spo_domain,
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
      AND (mt.id IS NULL OR EXISTS (
        SELECT 1 FROM public.m365_tenant_agents mta
        WHERE mta.agent_id = p_agent_id AND mta.tenant_record_id = mt.id AND mta.enabled = true
      ))

    UNION ALL

    -- geo_query tasks (target_type = 'agent')
    SELECT t.id, t.task_type, t.target_id, t.target_type, t.payload, t.priority, t.expires_at,
      json_build_object(
        'id', t.agent_id,
        'type', 'agent',
        'base_url', t.payload->>'url',
        'credentials', json_build_object('api_key', t.payload->>'api_key')
      ) as target,
      COALESCE(
        t.payload->'blueprint',
        '{"steps": []}'::jsonb
      ) as blueprint
    FROM public.agent_tasks t
    WHERE t.agent_id = p_agent_id AND t.status = 'pending' AND t.expires_at > NOW() AND t.target_type = 'agent'

    ORDER BY priority DESC, expires_at ASC LIMIT p_limit
  ) as task_data;

  UPDATE public.agent_tasks SET status = 'running', started_at = NOW(), timeout_at = NOW() + INTERVAL '30 minutes'
  WHERE id IN (SELECT id FROM public.agent_tasks WHERE agent_id = p_agent_id AND status = 'pending' AND expires_at > NOW()
    AND target_type IN ('firewall', 'external_domain', 'm365_tenant', 'agent')
    ORDER BY priority DESC, created_at ASC LIMIT p_limit);

  RETURN COALESCE(v_tasks, '[]'::json);
END;
$$;


ALTER FUNCTION "public"."rpc_get_agent_tasks"("p_agent_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "action_type" "text" DEFAULT 'general'::"text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "target_name" "text",
    "details" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_commands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "command" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "stdout" "text",
    "stderr" "text",
    "exit_code" integer,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "timeout_seconds" integer DEFAULT 60 NOT NULL,
    "cwd" "text" DEFAULT '/'::"text"
);


ALTER TABLE "public"."agent_commands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "cpu_percent" numeric(5,2),
    "cpu_count" integer,
    "load_avg_1m" numeric(6,2),
    "load_avg_5m" numeric(6,2),
    "load_avg_15m" numeric(6,2),
    "ram_total_mb" integer,
    "ram_used_mb" integer,
    "ram_percent" numeric(5,2),
    "disk_total_gb" numeric(8,2),
    "disk_used_gb" numeric(8,2),
    "disk_percent" numeric(5,2),
    "disk_path" "text" DEFAULT '/'::"text",
    "net_bytes_sent" bigint,
    "net_bytes_recv" bigint,
    "uptime_seconds" bigint,
    "hostname" "text",
    "os_info" "text",
    "process_count" integer,
    "monitor_version" "text",
    "collected_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "disk_partitions" "jsonb",
    "net_interfaces" "jsonb",
    "ip_addresses" "text"[]
);


ALTER TABLE "public"."agent_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "task_type" "public"."agent_task_type" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "target_type" "text" DEFAULT 'firewall'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "priority" integer DEFAULT 5 NOT NULL,
    "status" "public"."agent_task_status" DEFAULT 'pending'::"public"."agent_task_status" NOT NULL,
    "result" "jsonb",
    "step_results" "jsonb",
    "error_message" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "max_retries" integer DEFAULT 3 NOT NULL,
    "execution_time_ms" integer,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '01:00:00'::interval),
    "timeout_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "client_id" "uuid",
    "activation_code" "text",
    "activation_code_expires_at" timestamp with time zone,
    "jwt_secret" "text",
    "revoked" boolean DEFAULT false NOT NULL,
    "last_seen" timestamp with time zone,
    "config_updated_at" timestamp with time zone DEFAULT "now"(),
    "config_fetched_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_version" "text",
    "certificate_thumbprint" "text",
    "certificate_public_key" "text",
    "capabilities" "jsonb" DEFAULT '[]'::"jsonb",
    "azure_certificate_key_id" "text",
    "check_components" boolean DEFAULT false NOT NULL,
    "is_system_agent" boolean DEFAULT false NOT NULL,
    "shell_session_active" boolean DEFAULT false NOT NULL,
    "supervisor_version" "text"
);


ALTER TABLE "public"."agents" OWNER TO "postgres";


COMMENT ON COLUMN "public"."agents"."agent_version" IS 'Last reported agent version from heartbeat';



COMMENT ON COLUMN "public"."agents"."certificate_thumbprint" IS 'SHA1 thumbprint do certificado X.509 para autenticação M365 PowerShell';



COMMENT ON COLUMN "public"."agents"."certificate_public_key" IS 'Conteúdo do certificado público (.crt) em PEM para download';



COMMENT ON COLUMN "public"."agents"."capabilities" IS 'Lista de capacidades do agent: powershell, ssh, snmp, http, etc.';



COMMENT ON COLUMN "public"."agents"."azure_certificate_key_id" IS 'Key ID retornado pelo Azure após upload do certificado. Usado para revogar/atualizar.';



COMMENT ON COLUMN "public"."agents"."check_components" IS 'Flag to trigger system component verification on next heartbeat';



CREATE TABLE IF NOT EXISTS "public"."analysis_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "firewall_id" "uuid" NOT NULL,
    "score" integer NOT NULL,
    "report_data" "jsonb" NOT NULL,
    "analyzed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analysis_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analysis_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "firewall_id" "uuid" NOT NULL,
    "frequency" "public"."schedule_frequency" DEFAULT 'weekly'::"public"."schedule_frequency" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "next_run_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_hour" integer DEFAULT 0,
    "scheduled_day_of_week" integer DEFAULT 1,
    "scheduled_day_of_month" integer DEFAULT 1,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL
);


ALTER TABLE "public"."analysis_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analyzer_config_changes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "firewall_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "snapshot_id" "uuid",
    "user_name" "text" NOT NULL,
    "action" "text" DEFAULT ''::"text" NOT NULL,
    "cfgpath" "text" DEFAULT ''::"text" NOT NULL,
    "cfgobj" "text" DEFAULT ''::"text",
    "cfgattr" "text" DEFAULT ''::"text",
    "msg" "text" DEFAULT ''::"text",
    "category" "text" DEFAULT 'Outros'::"text",
    "severity" "text" DEFAULT 'low'::"text",
    "changed_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analyzer_config_changes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analyzer_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "firewall_id" "uuid" NOT NULL,
    "frequency" "public"."schedule_frequency" DEFAULT 'daily'::"public"."schedule_frequency" NOT NULL,
    "scheduled_hour" integer DEFAULT 0,
    "scheduled_day_of_week" integer DEFAULT 1,
    "scheduled_day_of_month" integer DEFAULT 1,
    "is_active" boolean DEFAULT true NOT NULL,
    "next_run_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL
);


ALTER TABLE "public"."analyzer_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analyzer_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "firewall_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "agent_task_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "score" integer,
    "summary" "jsonb" DEFAULT '{"low": 0, "high": 0, "info": 0, "medium": 0, "critical": 0}'::"jsonb",
    "insights" "jsonb" DEFAULT '[]'::"jsonb",
    "metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analyzer_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_access_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "name" "text" NOT NULL,
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "expires_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_access_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_access_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "api_key_id" "uuid",
    "endpoint" "text" NOT NULL,
    "method" "text" DEFAULT 'GET'::"text" NOT NULL,
    "status_code" integer DEFAULT 200 NOT NULL,
    "ip_address" "text",
    "response_time_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_access_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "api_key_id" "uuid",
    "client_id" "uuid" NOT NULL,
    "domain_id" "uuid",
    "job_type" "text" DEFAULT 'full_pipeline'::"text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "current_step" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval)
);


ALTER TABLE "public"."api_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attack_surface_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "frequency" "public"."schedule_frequency" DEFAULT 'daily'::"public"."schedule_frequency" NOT NULL,
    "scheduled_hour" integer DEFAULT 15,
    "scheduled_day_of_week" integer DEFAULT 1,
    "scheduled_day_of_month" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "next_run_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL
);


ALTER TABLE "public"."attack_surface_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attack_surface_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source_ips" "jsonb" DEFAULT '[]'::"jsonb",
    "results" "jsonb" DEFAULT '{}'::"jsonb",
    "cve_matches" "jsonb" DEFAULT '[]'::"jsonb",
    "summary" "jsonb" DEFAULT '{"cves": 0, "services": 0, "total_ips": 0, "open_ports": 0}'::"jsonb",
    "score" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_by" "uuid"
);


ALTER TABLE "public"."attack_surface_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attack_surface_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_id" "uuid" NOT NULL,
    "ip" "text" NOT NULL,
    "source" "text" NOT NULL,
    "label" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "assigned_agent_id" "uuid",
    "result" "jsonb",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."attack_surface_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blueprint_step_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "executor" "public"."blueprint_executor_type" DEFAULT 'agent'::"public"."blueprint_executor_type" NOT NULL,
    "runtime" "text" NOT NULL,
    "default_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "category" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."blueprint_step_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."blueprint_step_templates" IS 'Templates reutilizáveis de steps para blueprints. Permite criar steps padrão que podem ser referenciados em múltiplos blueprints.';



COMMENT ON COLUMN "public"."blueprint_step_templates"."runtime" IS 'Runtime do step: http_request, graph_api, powershell, ssh, snmp, dns_query, rest_api, etc.';



COMMENT ON COLUMN "public"."blueprint_step_templates"."default_config" IS 'Configuração padrão do step em JSON. Pode incluir endpoint, method, headers, params, etc.';



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_type_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "severity" "public"."rule_severity" DEFAULT 'medium'::"public"."rule_severity" NOT NULL,
    "weight" integer DEFAULT 1 NOT NULL,
    "evaluation_logic" "jsonb" NOT NULL,
    "pass_description" "text",
    "fail_description" "text",
    "recommendation" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "technical_risk" "text",
    "business_impact" "text",
    "api_endpoint" "text",
    "not_found_description" "text"
);


ALTER TABLE "public"."compliance_rules" OWNER TO "postgres";


COMMENT ON COLUMN "public"."compliance_rules"."technical_risk" IS 'Descrição do risco técnico que a regra avalia';



COMMENT ON COLUMN "public"."compliance_rules"."business_impact" IS 'Impacto no negócio caso a regra falhe';



COMMENT ON COLUMN "public"."compliance_rules"."api_endpoint" IS 'Endpoint de API utilizado para coletar os dados';



COMMENT ON COLUMN "public"."compliance_rules"."not_found_description" IS 'Mensagem exibida quando os dados para avaliação não são encontrados (recurso não configurado)';



CREATE TABLE IF NOT EXISTS "public"."cve_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cve_id" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "module_code" "text" NOT NULL,
    "severity" "text",
    "score" numeric,
    "title" "text",
    "description" "text",
    "products" "jsonb" DEFAULT '[]'::"jsonb",
    "published_date" "date",
    "advisory_url" "text",
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cve_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cve_severity_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module_code" "text" NOT NULL,
    "client_id" "uuid",
    "critical" integer DEFAULT 0 NOT NULL,
    "high" integer DEFAULT 0 NOT NULL,
    "medium" integer DEFAULT 0 NOT NULL,
    "low" integer DEFAULT 0 NOT NULL,
    "total_cves" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "top_cves" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."cve_severity_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cve_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "module_code" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_label" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_sync_status" "text" DEFAULT 'pending'::"text",
    "last_sync_error" "text",
    "last_sync_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_run_at" timestamp with time zone
);


ALTER TABLE "public"."cve_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cve_sync_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "cve_count" integer DEFAULT 0,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cve_sync_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dehashed_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "total_entries" integer DEFAULT 0 NOT NULL,
    "entries" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "databases" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "queried_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dehashed_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_blueprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_type_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "version" "text" DEFAULT 'any'::"text" NOT NULL,
    "collection_steps" "jsonb" DEFAULT '{"steps": []}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "executor_type" "public"."blueprint_executor_type" DEFAULT 'agent'::"public"."blueprint_executor_type" NOT NULL
);


ALTER TABLE "public"."device_blueprints" OWNER TO "postgres";


COMMENT ON COLUMN "public"."device_blueprints"."executor_type" IS 'Define quem executa os steps do blueprint: agent (Python Agent), edge_function (Deno Edge Function), ou hybrid (ambos)';



CREATE TABLE IF NOT EXISTS "public"."device_type_api_docs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_type_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "version" "text" NOT NULL,
    "doc_type" "text" DEFAULT 'log_api'::"text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."device_type_api_docs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "vendor" "text" NOT NULL,
    "category" "public"."device_category" DEFAULT 'firewall'::"public"."device_category" NOT NULL,
    "icon" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."device_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."evidence_parses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_type_id" "uuid" NOT NULL,
    "source_field" "text" NOT NULL,
    "display_label" "text" NOT NULL,
    "parse_type" "public"."parse_type" DEFAULT 'text'::"public"."parse_type" NOT NULL,
    "value_transformations" "jsonb" DEFAULT '{}'::"jsonb",
    "format_options" "jsonb" DEFAULT '{}'::"jsonb",
    "is_hidden" boolean DEFAULT false NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."evidence_parses" OWNER TO "postgres";


COMMENT ON TABLE "public"."evidence_parses" IS 'Stores translation/humanization rules for technical evidence fields';



COMMENT ON COLUMN "public"."evidence_parses"."source_field" IS 'The technical field path (e.g., data.has_dnskey)';



COMMENT ON COLUMN "public"."evidence_parses"."display_label" IS 'Human-readable label to display in UI';



COMMENT ON COLUMN "public"."evidence_parses"."parse_type" IS 'How to parse/format the value';



COMMENT ON COLUMN "public"."evidence_parses"."value_transformations" IS 'Map of value transformations (e.g., {true: "Ativado", false: "Desativado"})';



COMMENT ON COLUMN "public"."evidence_parses"."format_options" IS 'Additional formatting options (e.g., {time_unit: "seconds"})';



CREATE TABLE IF NOT EXISTS "public"."external_domain_analysis_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "domain_id" "uuid" NOT NULL,
    "score" integer,
    "report_data" "jsonb",
    "analyzed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "source" "text" DEFAULT 'agent'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "execution_time_ms" integer
);


ALTER TABLE "public"."external_domain_analysis_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_domain_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "domain_id" "uuid" NOT NULL,
    "frequency" "public"."schedule_frequency" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "next_run_at" timestamp with time zone,
    "scheduled_hour" integer DEFAULT 0,
    "scheduled_day_of_week" integer DEFAULT 1,
    "scheduled_day_of_month" integer DEFAULT 1,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL
);


ALTER TABLE "public"."external_domain_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "client_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "name" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "last_scan_at" timestamp with time zone,
    "last_score" integer,
    "whois_registrar" "text",
    "whois_expires_at" timestamp with time zone,
    "whois_created_at" timestamp with time zone,
    "whois_checked_at" timestamp with time zone
);


ALTER TABLE "public"."external_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."firewalls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "device_type_id" "uuid",
    "agent_id" "uuid",
    "fortigate_url" "text" NOT NULL,
    "api_key" "text" NOT NULL,
    "auth_username" "text",
    "auth_password" "text",
    "serial_number" "text",
    "description" "text",
    "last_score" integer,
    "last_analysis_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "geo_latitude" double precision,
    "geo_longitude" double precision,
    "cloud_public_ip" "text"
);


ALTER TABLE "public"."firewalls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_analyzer_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "frequency" "public"."schedule_frequency" DEFAULT 'hourly'::"public"."schedule_frequency" NOT NULL,
    "scheduled_hour" integer DEFAULT 0,
    "scheduled_day_of_week" integer DEFAULT 1,
    "scheduled_day_of_month" integer DEFAULT 1,
    "is_active" boolean DEFAULT true NOT NULL,
    "next_run_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL
);


ALTER TABLE "public"."m365_analyzer_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_analyzer_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "score" integer,
    "summary" "jsonb" DEFAULT '{"low": 0, "high": 0, "info": 0, "medium": 0, "critical": 0}'::"jsonb",
    "insights" "jsonb" DEFAULT '[]'::"jsonb",
    "metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "agent_task_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_analyzer_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_app_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "azure_app_id" "text" NOT NULL,
    "auth_type" "text" DEFAULT 'client_secret'::"text" NOT NULL,
    "client_secret_encrypted" "text",
    "certificate_thumbprint" "text",
    "expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sp_object_id" "text",
    "app_object_id" "text"
);


ALTER TABLE "public"."m365_app_credentials" OWNER TO "postgres";


COMMENT ON COLUMN "public"."m365_app_credentials"."sp_object_id" IS 'Service Principal Object ID no tenant do cliente, usado para setup do Exchange RBAC via PowerShell';



COMMENT ON COLUMN "public"."m365_app_credentials"."app_object_id" IS 'Object ID do App Registration no tenant do cliente. Necessário para PATCH /applications/{id} via Graph API para upload de certificados.';



CREATE TABLE IF NOT EXISTS "public"."m365_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid",
    "client_id" "uuid",
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "action_details" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_compliance_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "frequency" "public"."schedule_frequency" DEFAULT 'weekly'::"public"."schedule_frequency" NOT NULL,
    "scheduled_hour" integer DEFAULT 0,
    "scheduled_day_of_week" integer DEFAULT 1,
    "scheduled_day_of_month" integer DEFAULT 1,
    "is_active" boolean DEFAULT true NOT NULL,
    "next_run_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL
);


ALTER TABLE "public"."m365_compliance_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_dashboard_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "dashboard_type" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."m365_dashboard_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_external_movement_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "snapshot_id" "uuid",
    "user_id" "text" NOT NULL,
    "alert_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "risk_score" integer DEFAULT 0 NOT NULL,
    "z_score" numeric,
    "pct_increase" numeric,
    "is_new" boolean DEFAULT false NOT NULL,
    "is_anomalous" boolean DEFAULT false NOT NULL,
    "affected_domains" "text"[] DEFAULT '{}'::"text"[],
    "evidence" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_external_movement_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_global_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "app_id" "text" NOT NULL,
    "client_secret_encrypted" "text" NOT NULL,
    "validation_tenant_id" "text",
    "validated_permissions" "jsonb" DEFAULT '[]'::"jsonb",
    "last_validated_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "app_object_id" "text",
    "home_tenant_id" "text"
);


ALTER TABLE "public"."m365_global_config" OWNER TO "postgres";


COMMENT ON COLUMN "public"."m365_global_config"."app_object_id" IS 'Object ID do App Registration no Azure (diferente do App ID). Necessário para PATCH via Graph API.';



CREATE TABLE IF NOT EXISTS "public"."m365_posture_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "score" integer,
    "classification" "text",
    "summary" "jsonb",
    "category_breakdown" "jsonb",
    "insights" "jsonb",
    "errors" "jsonb",
    "analyzed_by" "uuid",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "environment_metrics" "jsonb",
    "agent_task_id" "uuid",
    "agent_insights" "jsonb",
    "agent_status" "text"
);


ALTER TABLE "public"."m365_posture_history" OWNER TO "postgres";


COMMENT ON COLUMN "public"."m365_posture_history"."agent_task_id" IS 'Reference to the agent task that collects PowerShell-based data (Exchange, SharePoint)';



COMMENT ON COLUMN "public"."m365_posture_history"."agent_insights" IS 'Insights collected via PowerShell agent (Exchange Online, SharePoint Online)';



COMMENT ON COLUMN "public"."m365_posture_history"."agent_status" IS 'Status of the agent task: pending, running, completed, failed';



CREATE TABLE IF NOT EXISTS "public"."m365_required_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "submodule" "public"."m365_submodule" NOT NULL,
    "permission_name" "text" NOT NULL,
    "permission_type" "text" DEFAULT 'Application'::"text" NOT NULL,
    "description" "text",
    "is_required" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "test_url" "text"
);


ALTER TABLE "public"."m365_required_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_tenant_agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."m365_tenant_agents" OWNER TO "postgres";


COMMENT ON TABLE "public"."m365_tenant_agents" IS 'Vínculo entre tenants M365 e agents para análises via PowerShell';



CREATE TABLE IF NOT EXISTS "public"."m365_tenant_licenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "sku_id" "text" NOT NULL,
    "sku_part_number" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "capability_status" "text" DEFAULT 'Enabled'::"text" NOT NULL,
    "total_units" integer DEFAULT 0 NOT NULL,
    "consumed_units" integer DEFAULT 0 NOT NULL,
    "warning_units" integer DEFAULT 0 NOT NULL,
    "suspended_units" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "collected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_tenant_licenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_tenant_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "permission_name" "text" NOT NULL,
    "permission_type" "text" DEFAULT 'Application'::"text" NOT NULL,
    "status" "public"."permission_status" DEFAULT 'pending'::"public"."permission_status" NOT NULL,
    "granted_at" timestamp with time zone,
    "granted_by" "text",
    "error_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_tenant_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_tenant_submodules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "submodule" "public"."m365_submodule" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_tenant_submodules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "tenant_id" "text" NOT NULL,
    "display_name" "text",
    "tenant_domain" "text",
    "connection_status" "public"."tenant_connection_status" DEFAULT 'pending'::"public"."tenant_connection_status" NOT NULL,
    "last_validated_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exchange_sp_registered" boolean DEFAULT false,
    "exchange_rbac_assigned" boolean DEFAULT false,
    "entra_dashboard_cache" "jsonb",
    "entra_dashboard_cached_at" timestamp with time zone,
    "exchange_dashboard_cache" "jsonb",
    "exchange_dashboard_cached_at" timestamp with time zone,
    "collaboration_dashboard_cache" "jsonb",
    "collaboration_dashboard_cached_at" timestamp with time zone,
    "spo_domain" "text"
);


ALTER TABLE "public"."m365_tenants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."m365_tenants"."spo_domain" IS 'SharePoint Online domain prefix (e.g. precisioglobal). Used to build SPO Admin URL: https://{spo_domain}-admin.sharepoint.com';



CREATE TABLE IF NOT EXISTS "public"."m365_threat_dismissals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "dismissed_by" "uuid" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_threat_dismissals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "access_token_encrypted" "text",
    "refresh_token_encrypted" "text",
    "token_type" "text" DEFAULT 'Bearer'::"text",
    "scope" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_user_baselines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "user_principal_name" "text" NOT NULL,
    "avg_sent_daily" numeric DEFAULT 0,
    "avg_received_daily" numeric DEFAULT 0,
    "avg_recipients_per_msg" numeric DEFAULT 0,
    "typical_send_hours" "jsonb" DEFAULT '[]'::"jsonb",
    "baseline_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "sample_days" integer DEFAULT 1,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_user_baselines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_user_external_daily_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "date" "date" NOT NULL,
    "total_external_emails" integer DEFAULT 0 NOT NULL,
    "total_external_mb" numeric DEFAULT 0 NOT NULL,
    "unique_domains" integer DEFAULT 0 NOT NULL,
    "mean_hour" numeric,
    "std_hour" numeric,
    "hour_distribution" "jsonb" DEFAULT '{}'::"jsonb",
    "domains_list" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_user_external_daily_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."m365_user_external_domain_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_record_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "user_id" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "first_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_emails" integer DEFAULT 0 NOT NULL,
    "total_mb" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."m365_user_external_domain_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "color" "text" DEFAULT 'text-primary'::"text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "m365_analyzer_critical" boolean DEFAULT true NOT NULL,
    "m365_general" boolean DEFAULT true NOT NULL,
    "firewall_analysis" boolean DEFAULT true NOT NULL,
    "external_domain_analysis" boolean DEFAULT true NOT NULL,
    "attack_surface" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preview_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "target_workspace_id" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "reason" "text",
    "ip_address" "text",
    "user_agent" "text",
    "mode" "text" DEFAULT 'preview'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."preview_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."preview_sessions" IS 'Auditoria de sessões de visualização/impersonate de usuários';



COMMENT ON COLUMN "public"."preview_sessions"."mode" IS 'preview = somente leitura, impersonate = acesso completo (futuro)';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_type_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text",
    "icon" "text" DEFAULT 'shield'::"text" NOT NULL,
    "color" "text" DEFAULT 'slate-500'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rule_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."rule_categories" IS 'Stores visual configuration (icon, color, display name) for compliance rule categories per device type';



CREATE TABLE IF NOT EXISTS "public"."rule_correction_guides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "friendly_title" "text",
    "what_is" "text",
    "why_matters" "text",
    "impacts" "jsonb" DEFAULT '[]'::"jsonb",
    "how_to_fix" "jsonb" DEFAULT '[]'::"jsonb",
    "provider_examples" "jsonb" DEFAULT '[]'::"jsonb",
    "difficulty" "text" DEFAULT 'medium'::"text",
    "time_estimate" "text" DEFAULT '30 min'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rule_correction_guides_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"])))
);


ALTER TABLE "public"."rule_correction_guides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."source_key_endpoints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_type_id" "uuid" NOT NULL,
    "source_key" "text" NOT NULL,
    "endpoint_label" "text" NOT NULL,
    "endpoint_url" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."source_key_endpoints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "alert_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'warning'::"text" NOT NULL,
    "target_role" "public"."app_role",
    "is_active" boolean DEFAULT true NOT NULL,
    "dismissed_by" "uuid"[] DEFAULT '{}'::"uuid"[],
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "description" "text",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_step_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "step_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "data" "jsonb",
    "error_message" "text",
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."task_step_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_module_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_name" "text" NOT NULL,
    "permission" "public"."module_permission" DEFAULT 'view'::"public"."module_permission" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_module_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_id" "uuid" NOT NULL,
    "permission" "text" DEFAULT 'view'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'user'::"public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_activity_logs"
    ADD CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_commands"
    ADD CONSTRAINT "agent_commands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_metrics"
    ADD CONSTRAINT "agent_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analysis_history"
    ADD CONSTRAINT "analysis_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analysis_schedules"
    ADD CONSTRAINT "analysis_schedules_firewall_id_key" UNIQUE ("firewall_id");



ALTER TABLE ONLY "public"."analysis_schedules"
    ADD CONSTRAINT "analysis_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analyzer_config_changes"
    ADD CONSTRAINT "analyzer_config_changes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analyzer_schedules"
    ADD CONSTRAINT "analyzer_schedules_firewall_id_key" UNIQUE ("firewall_id");



ALTER TABLE ONLY "public"."analyzer_schedules"
    ADD CONSTRAINT "analyzer_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analyzer_snapshots"
    ADD CONSTRAINT "analyzer_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_access_keys"
    ADD CONSTRAINT "api_access_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_access_logs"
    ADD CONSTRAINT "api_access_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_jobs"
    ADD CONSTRAINT "api_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attack_surface_schedules"
    ADD CONSTRAINT "attack_surface_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attack_surface_snapshots"
    ADD CONSTRAINT "attack_surface_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attack_surface_tasks"
    ADD CONSTRAINT "attack_surface_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."blueprint_step_templates"
    ADD CONSTRAINT "blueprint_step_templates_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."blueprint_step_templates"
    ADD CONSTRAINT "blueprint_step_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_rules"
    ADD CONSTRAINT "compliance_rules_device_type_id_code_key" UNIQUE ("device_type_id", "code");



ALTER TABLE ONLY "public"."compliance_rules"
    ADD CONSTRAINT "compliance_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cve_cache"
    ADD CONSTRAINT "cve_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cve_severity_cache"
    ADD CONSTRAINT "cve_severity_cache_module_code_client_id_key" UNIQUE ("module_code", "client_id");



ALTER TABLE ONLY "public"."cve_severity_cache"
    ADD CONSTRAINT "cve_severity_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cve_sources"
    ADD CONSTRAINT "cve_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cve_sync_history"
    ADD CONSTRAINT "cve_sync_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dehashed_cache"
    ADD CONSTRAINT "dehashed_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_blueprints"
    ADD CONSTRAINT "device_blueprints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_type_api_docs"
    ADD CONSTRAINT "device_type_api_docs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_types"
    ADD CONSTRAINT "device_types_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."device_types"
    ADD CONSTRAINT "device_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."evidence_parses"
    ADD CONSTRAINT "evidence_parses_device_type_id_source_field_key" UNIQUE ("device_type_id", "source_field");



ALTER TABLE ONLY "public"."evidence_parses"
    ADD CONSTRAINT "evidence_parses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_domain_analysis_history"
    ADD CONSTRAINT "external_domain_analysis_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_domain_schedules"
    ADD CONSTRAINT "external_domain_schedules_domain_id_key" UNIQUE ("domain_id");



ALTER TABLE ONLY "public"."external_domain_schedules"
    ADD CONSTRAINT "external_domain_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_domains"
    ADD CONSTRAINT "external_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."firewalls"
    ADD CONSTRAINT "firewalls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_analyzer_schedules"
    ADD CONSTRAINT "m365_analyzer_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_analyzer_schedules"
    ADD CONSTRAINT "m365_analyzer_schedules_tenant_record_id_key" UNIQUE ("tenant_record_id");



ALTER TABLE ONLY "public"."m365_analyzer_snapshots"
    ADD CONSTRAINT "m365_analyzer_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_app_credentials"
    ADD CONSTRAINT "m365_app_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_app_credentials"
    ADD CONSTRAINT "m365_app_credentials_tenant_record_id_key" UNIQUE ("tenant_record_id");



ALTER TABLE ONLY "public"."m365_audit_logs"
    ADD CONSTRAINT "m365_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_compliance_schedules"
    ADD CONSTRAINT "m365_compliance_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_compliance_schedules"
    ADD CONSTRAINT "m365_compliance_schedules_tenant_record_id_key" UNIQUE ("tenant_record_id");



ALTER TABLE ONLY "public"."m365_dashboard_snapshots"
    ADD CONSTRAINT "m365_dashboard_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_external_movement_alerts"
    ADD CONSTRAINT "m365_external_movement_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_global_config"
    ADD CONSTRAINT "m365_global_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_posture_history"
    ADD CONSTRAINT "m365_posture_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_required_permissions"
    ADD CONSTRAINT "m365_required_permissions_permission_name_key" UNIQUE ("permission_name");



ALTER TABLE ONLY "public"."m365_required_permissions"
    ADD CONSTRAINT "m365_required_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_required_permissions"
    ADD CONSTRAINT "m365_required_permissions_submodule_permission_name_key" UNIQUE ("submodule", "permission_name");



ALTER TABLE ONLY "public"."m365_tenant_agents"
    ADD CONSTRAINT "m365_tenant_agents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_tenant_agents"
    ADD CONSTRAINT "m365_tenant_agents_tenant_record_id_agent_id_key" UNIQUE ("tenant_record_id", "agent_id");



ALTER TABLE ONLY "public"."m365_tenant_licenses"
    ADD CONSTRAINT "m365_tenant_licenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_tenant_permissions"
    ADD CONSTRAINT "m365_tenant_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_tenant_permissions"
    ADD CONSTRAINT "m365_tenant_permissions_tenant_record_id_permission_name_key" UNIQUE ("tenant_record_id", "permission_name");



ALTER TABLE ONLY "public"."m365_tenant_submodules"
    ADD CONSTRAINT "m365_tenant_submodules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_tenant_submodules"
    ADD CONSTRAINT "m365_tenant_submodules_tenant_record_id_submodule_key" UNIQUE ("tenant_record_id", "submodule");



ALTER TABLE ONLY "public"."m365_tenants"
    ADD CONSTRAINT "m365_tenants_client_id_tenant_id_key" UNIQUE ("client_id", "tenant_id");



ALTER TABLE ONLY "public"."m365_tenants"
    ADD CONSTRAINT "m365_tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_threat_dismissals"
    ADD CONSTRAINT "m365_threat_dismissals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_threat_dismissals"
    ADD CONSTRAINT "m365_threat_dismissals_tenant_record_id_type_label_key" UNIQUE ("tenant_record_id", "type", "label");



ALTER TABLE ONLY "public"."m365_tokens"
    ADD CONSTRAINT "m365_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_user_baselines"
    ADD CONSTRAINT "m365_user_baselines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_user_baselines"
    ADD CONSTRAINT "m365_user_baselines_tenant_record_id_user_principal_name_key" UNIQUE ("tenant_record_id", "user_principal_name");



ALTER TABLE ONLY "public"."m365_user_external_daily_stats"
    ADD CONSTRAINT "m365_user_external_daily_stat_tenant_record_id_user_id_date_key" UNIQUE ("tenant_record_id", "user_id", "date");



ALTER TABLE ONLY "public"."m365_user_external_daily_stats"
    ADD CONSTRAINT "m365_user_external_daily_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."m365_user_external_domain_history"
    ADD CONSTRAINT "m365_user_external_domain_his_tenant_record_id_user_id_doma_key" UNIQUE ("tenant_record_id", "user_id", "domain");



ALTER TABLE ONLY "public"."m365_user_external_domain_history"
    ADD CONSTRAINT "m365_user_external_domain_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."preview_sessions"
    ADD CONSTRAINT "preview_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_categories"
    ADD CONSTRAINT "rule_categories_device_type_id_name_key" UNIQUE ("device_type_id", "name");



ALTER TABLE ONLY "public"."rule_categories"
    ADD CONSTRAINT "rule_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_correction_guides"
    ADD CONSTRAINT "rule_correction_guides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_correction_guides"
    ADD CONSTRAINT "rule_correction_guides_rule_id_key" UNIQUE ("rule_id");



ALTER TABLE ONLY "public"."source_key_endpoints"
    ADD CONSTRAINT "source_key_endpoints_device_type_id_source_key_key" UNIQUE ("device_type_id", "source_key");



ALTER TABLE ONLY "public"."source_key_endpoints"
    ADD CONSTRAINT "source_key_endpoints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_alerts"
    ADD CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_step_results"
    ADD CONSTRAINT "task_step_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_step_results"
    ADD CONSTRAINT "task_step_results_task_id_step_id_unique" UNIQUE ("task_id", "step_id");



ALTER TABLE ONLY "public"."user_clients"
    ADD CONSTRAINT "user_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_module_permissions"
    ADD CONSTRAINT "user_module_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_module_permissions"
    ADD CONSTRAINT "user_module_permissions_user_id_module_name_key" UNIQUE ("user_id", "module_name");



ALTER TABLE ONLY "public"."user_modules"
    ADD CONSTRAINT "user_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_modules"
    ADD CONSTRAINT "user_modules_user_id_module_id_key" UNIQUE ("user_id", "module_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_key" UNIQUE ("user_id");



CREATE UNIQUE INDEX "attack_surface_schedules_client_id_key" ON "public"."attack_surface_schedules" USING "btree" ("client_id");



CREATE UNIQUE INDEX "cve_severity_cache_module_global" ON "public"."cve_severity_cache" USING "btree" ("module_code") WHERE ("client_id" IS NULL);



CREATE INDEX "idx_agent_commands_agent_status" ON "public"."agent_commands" USING "btree" ("agent_id", "status");



CREATE INDEX "idx_agent_commands_created_at" ON "public"."agent_commands" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_agent_metrics_agent_time" ON "public"."agent_metrics" USING "btree" ("agent_id", "collected_at" DESC);



CREATE INDEX "idx_agents_client_id_revoked" ON "public"."agents" USING "btree" ("client_id", "revoked");



CREATE INDEX "idx_analyzer_config_changes_changed_at" ON "public"."analyzer_config_changes" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_analyzer_config_changes_client" ON "public"."analyzer_config_changes" USING "btree" ("client_id");



CREATE UNIQUE INDEX "idx_analyzer_config_changes_dedup" ON "public"."analyzer_config_changes" USING "btree" ("firewall_id", "user_name", "action", "cfgpath", "cfgobj", "changed_at");



CREATE INDEX "idx_analyzer_config_changes_firewall" ON "public"."analyzer_config_changes" USING "btree" ("firewall_id");



CREATE INDEX "idx_analyzer_config_changes_firewall_changed" ON "public"."analyzer_config_changes" USING "btree" ("firewall_id", "changed_at" DESC);



CREATE INDEX "idx_analyzer_schedules_firewall" ON "public"."analyzer_schedules" USING "btree" ("firewall_id");



CREATE INDEX "idx_analyzer_schedules_next_run" ON "public"."analyzer_schedules" USING "btree" ("next_run_at") WHERE ("is_active" = true);



CREATE INDEX "idx_analyzer_snapshots_client" ON "public"."analyzer_snapshots" USING "btree" ("client_id");



CREATE INDEX "idx_analyzer_snapshots_created" ON "public"."analyzer_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_analyzer_snapshots_firewall" ON "public"."analyzer_snapshots" USING "btree" ("firewall_id");



CREATE INDEX "idx_api_access_keys_active" ON "public"."api_access_keys" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_api_access_keys_client" ON "public"."api_access_keys" USING "btree" ("client_id");



CREATE UNIQUE INDEX "idx_api_access_keys_hash" ON "public"."api_access_keys" USING "btree" ("key_hash");



CREATE INDEX "idx_api_access_logs_created" ON "public"."api_access_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_api_access_logs_key" ON "public"."api_access_logs" USING "btree" ("api_key_id");



CREATE INDEX "idx_api_jobs_api_key_id" ON "public"."api_jobs" USING "btree" ("api_key_id");



CREATE INDEX "idx_api_jobs_client_id" ON "public"."api_jobs" USING "btree" ("client_id");



CREATE INDEX "idx_api_jobs_created_at" ON "public"."api_jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_api_jobs_domain_id" ON "public"."api_jobs" USING "btree" ("domain_id");



CREATE INDEX "idx_api_jobs_status" ON "public"."api_jobs" USING "btree" ("status");



CREATE INDEX "idx_attack_surface_snapshots_client_id" ON "public"."attack_surface_snapshots" USING "btree" ("client_id");



CREATE INDEX "idx_attack_surface_snapshots_status" ON "public"."attack_surface_snapshots" USING "btree" ("status");



CREATE INDEX "idx_attack_surface_tasks_agent" ON "public"."attack_surface_tasks" USING "btree" ("assigned_agent_id") WHERE ("assigned_agent_id" IS NOT NULL);



CREATE INDEX "idx_attack_surface_tasks_snapshot" ON "public"."attack_surface_tasks" USING "btree" ("snapshot_id");



CREATE INDEX "idx_attack_surface_tasks_status" ON "public"."attack_surface_tasks" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_blueprint_step_templates_active" ON "public"."blueprint_step_templates" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_blueprint_step_templates_category" ON "public"."blueprint_step_templates" USING "btree" ("category");



CREATE INDEX "idx_blueprint_step_templates_code" ON "public"."blueprint_step_templates" USING "btree" ("code");



CREATE INDEX "idx_blueprint_step_templates_executor" ON "public"."blueprint_step_templates" USING "btree" ("executor");



CREATE INDEX "idx_blueprint_step_templates_runtime" ON "public"."blueprint_step_templates" USING "btree" ("runtime");



CREATE UNIQUE INDEX "idx_cve_cache_cve_source" ON "public"."cve_cache" USING "btree" ("cve_id", "source_id");



CREATE INDEX "idx_cve_cache_module" ON "public"."cve_cache" USING "btree" ("module_code");



CREATE INDEX "idx_cve_cache_score" ON "public"."cve_cache" USING "btree" ("score" DESC NULLS LAST);



CREATE INDEX "idx_cve_cache_severity" ON "public"."cve_cache" USING "btree" ("severity");



CREATE INDEX "idx_cve_sync_history_created_at" ON "public"."cve_sync_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_cve_sync_history_source_id" ON "public"."cve_sync_history" USING "btree" ("source_id");



CREATE INDEX "idx_daily_stats_tenant_user" ON "public"."m365_user_external_daily_stats" USING "btree" ("tenant_record_id", "user_id", "date" DESC);



CREATE INDEX "idx_dash_snap_tenant_type" ON "public"."m365_dashboard_snapshots" USING "btree" ("tenant_record_id", "dashboard_type", "created_at" DESC);



CREATE INDEX "idx_dehashed_cache_client_domain" ON "public"."dehashed_cache" USING "btree" ("client_id", "domain");



CREATE INDEX "idx_domain_history_tenant_user" ON "public"."m365_user_external_domain_history" USING "btree" ("tenant_record_id", "user_id");



CREATE INDEX "idx_evidence_parses_active" ON "public"."evidence_parses" USING "btree" ("device_type_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_evidence_parses_device_type" ON "public"."evidence_parses" USING "btree" ("device_type_id");



CREATE INDEX "idx_ext_domain_analysis_source" ON "public"."external_domain_analysis_history" USING "btree" ("source");



CREATE INDEX "idx_ext_domain_analysis_status" ON "public"."external_domain_analysis_history" USING "btree" ("status");



CREATE INDEX "idx_ext_domain_history_domain_created_at" ON "public"."external_domain_analysis_history" USING "btree" ("domain_id", "created_at" DESC);



CREATE INDEX "idx_external_domain_schedules_domain_id" ON "public"."external_domain_schedules" USING "btree" ("domain_id");



CREATE INDEX "idx_external_domains_agent_id" ON "public"."external_domains" USING "btree" ("agent_id");



CREATE INDEX "idx_external_domains_client_id" ON "public"."external_domains" USING "btree" ("client_id");



CREATE INDEX "idx_m365_analyzer_snapshots_client" ON "public"."m365_analyzer_snapshots" USING "btree" ("client_id");



CREATE INDEX "idx_m365_analyzer_snapshots_tenant" ON "public"."m365_analyzer_snapshots" USING "btree" ("tenant_record_id", "status");



CREATE INDEX "idx_m365_posture_history_agent_task" ON "public"."m365_posture_history" USING "btree" ("agent_task_id") WHERE ("agent_task_id" IS NOT NULL);



CREATE INDEX "idx_m365_posture_history_client" ON "public"."m365_posture_history" USING "btree" ("client_id");



CREATE INDEX "idx_m365_posture_history_created" ON "public"."m365_posture_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_m365_posture_history_status" ON "public"."m365_posture_history" USING "btree" ("status");



CREATE INDEX "idx_m365_posture_history_tenant" ON "public"."m365_posture_history" USING "btree" ("tenant_record_id");



CREATE INDEX "idx_m365_tenant_licenses_client_id" ON "public"."m365_tenant_licenses" USING "btree" ("client_id");



CREATE INDEX "idx_m365_tenant_licenses_tenant_record_id" ON "public"."m365_tenant_licenses" USING "btree" ("tenant_record_id");



CREATE INDEX "idx_m365_user_baselines_tenant" ON "public"."m365_user_baselines" USING "btree" ("tenant_record_id");



CREATE INDEX "idx_movement_alerts_severity" ON "public"."m365_external_movement_alerts" USING "btree" ("tenant_record_id", "severity");



CREATE INDEX "idx_movement_alerts_tenant" ON "public"."m365_external_movement_alerts" USING "btree" ("tenant_record_id", "created_at" DESC);



CREATE INDEX "idx_preview_sessions_active" ON "public"."preview_sessions" USING "btree" ("admin_id") WHERE ("ended_at" IS NULL);



CREATE INDEX "idx_preview_sessions_admin_id" ON "public"."preview_sessions" USING "btree" ("admin_id");



CREATE INDEX "idx_preview_sessions_target_user_id" ON "public"."preview_sessions" USING "btree" ("target_user_id");



CREATE INDEX "idx_rate_limits_created_at" ON "public"."rate_limits" USING "btree" ("created_at");



CREATE INDEX "idx_system_alerts_active_created" ON "public"."system_alerts" USING "btree" ("is_active", "created_at" DESC);



CREATE INDEX "idx_user_module_permissions_user_id" ON "public"."user_module_permissions" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "cleanup_rate_limits_trigger" AFTER INSERT ON "public"."rate_limits" FOR EACH STATEMENT EXECUTE FUNCTION "public"."cleanup_old_rate_limits"();



CREATE OR REPLACE TRIGGER "trg_external_domain_schedules_updated_at" BEFORE UPDATE ON "public"."external_domain_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_external_domains_updated_at" BEFORE UPDATE ON "public"."external_domains" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_analysis_schedules_updated_at" BEFORE UPDATE ON "public"."analysis_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_analyzer_schedules_updated_at" BEFORE UPDATE ON "public"."analyzer_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_api_access_keys_updated_at" BEFORE UPDATE ON "public"."api_access_keys" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_attack_surface_schedules_updated_at" BEFORE UPDATE ON "public"."attack_surface_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_blueprint_step_templates_updated_at" BEFORE UPDATE ON "public"."blueprint_step_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_compliance_rules_updated_at" BEFORE UPDATE ON "public"."compliance_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cve_cache_updated_at" BEFORE UPDATE ON "public"."cve_cache" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cve_sources_updated_at" BEFORE UPDATE ON "public"."cve_sources" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_device_blueprints_updated_at" BEFORE UPDATE ON "public"."device_blueprints" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_device_type_api_docs_updated_at" BEFORE UPDATE ON "public"."device_type_api_docs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_device_types_updated_at" BEFORE UPDATE ON "public"."device_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_evidence_parses_updated_at" BEFORE UPDATE ON "public"."evidence_parses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_firewalls_updated_at" BEFORE UPDATE ON "public"."firewalls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_m365_app_credentials_updated_at" BEFORE UPDATE ON "public"."m365_app_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_m365_compliance_schedules_updated_at" BEFORE UPDATE ON "public"."m365_compliance_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_m365_global_config_updated_at" BEFORE UPDATE ON "public"."m365_global_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_m365_tenant_agents_updated_at" BEFORE UPDATE ON "public"."m365_tenant_agents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_m365_tenant_permissions_updated_at" BEFORE UPDATE ON "public"."m365_tenant_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_m365_tenant_submodules_updated_at" BEFORE UPDATE ON "public"."m365_tenant_submodules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_m365_tenants_updated_at" BEFORE UPDATE ON "public"."m365_tenants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_m365_tokens_updated_at" BEFORE UPDATE ON "public"."m365_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_modules_updated_at" BEFORE UPDATE ON "public"."modules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_rule_categories_updated_at" BEFORE UPDATE ON "public"."rule_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_rule_correction_guides_updated_at" BEFORE UPDATE ON "public"."rule_correction_guides" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_source_key_endpoints_updated_at" BEFORE UPDATE ON "public"."source_key_endpoints" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_system_alerts_updated_at" BEFORE UPDATE ON "public"."system_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_system_settings_updated_at" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."agent_commands"
    ADD CONSTRAINT "agent_commands_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_metrics"
    ADD CONSTRAINT "agent_metrics_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agents"
    ADD CONSTRAINT "agents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."analysis_history"
    ADD CONSTRAINT "analysis_history_firewall_id_fkey" FOREIGN KEY ("firewall_id") REFERENCES "public"."firewalls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analysis_schedules"
    ADD CONSTRAINT "analysis_schedules_firewall_id_fkey" FOREIGN KEY ("firewall_id") REFERENCES "public"."firewalls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analyzer_config_changes"
    ADD CONSTRAINT "analyzer_config_changes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analyzer_config_changes"
    ADD CONSTRAINT "analyzer_config_changes_firewall_id_fkey" FOREIGN KEY ("firewall_id") REFERENCES "public"."firewalls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analyzer_config_changes"
    ADD CONSTRAINT "analyzer_config_changes_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."analyzer_snapshots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."analyzer_schedules"
    ADD CONSTRAINT "analyzer_schedules_firewall_id_fkey" FOREIGN KEY ("firewall_id") REFERENCES "public"."firewalls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analyzer_snapshots"
    ADD CONSTRAINT "analyzer_snapshots_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id");



ALTER TABLE ONLY "public"."analyzer_snapshots"
    ADD CONSTRAINT "analyzer_snapshots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."analyzer_snapshots"
    ADD CONSTRAINT "analyzer_snapshots_firewall_id_fkey" FOREIGN KEY ("firewall_id") REFERENCES "public"."firewalls"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_access_keys"
    ADD CONSTRAINT "api_access_keys_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_access_keys"
    ADD CONSTRAINT "api_access_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_access_logs"
    ADD CONSTRAINT "api_access_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_access_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_jobs"
    ADD CONSTRAINT "api_jobs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_access_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_jobs"
    ADD CONSTRAINT "api_jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."api_jobs"
    ADD CONSTRAINT "api_jobs_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."external_domains"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attack_surface_schedules"
    ADD CONSTRAINT "attack_surface_schedules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."attack_surface_tasks"
    ADD CONSTRAINT "attack_surface_tasks_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id");



ALTER TABLE ONLY "public"."attack_surface_tasks"
    ADD CONSTRAINT "attack_surface_tasks_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."attack_surface_snapshots"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compliance_rules"
    ADD CONSTRAINT "compliance_rules_device_type_id_fkey" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cve_cache"
    ADD CONSTRAINT "cve_cache_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."cve_sources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cve_severity_cache"
    ADD CONSTRAINT "cve_severity_cache_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cve_sync_history"
    ADD CONSTRAINT "cve_sync_history_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."cve_sources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dehashed_cache"
    ADD CONSTRAINT "dehashed_cache_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_blueprints"
    ADD CONSTRAINT "device_blueprints_device_type_id_fkey" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_type_api_docs"
    ADD CONSTRAINT "device_type_api_docs_device_type_id_fkey" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."evidence_parses"
    ADD CONSTRAINT "evidence_parses_device_type_id_fkey" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_domain_analysis_history"
    ADD CONSTRAINT "external_domain_analysis_history_analyzed_by_fkey" FOREIGN KEY ("analyzed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."external_domain_analysis_history"
    ADD CONSTRAINT "external_domain_analysis_history_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."external_domains"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_domain_schedules"
    ADD CONSTRAINT "external_domain_schedules_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "public"."external_domains"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_domains"
    ADD CONSTRAINT "external_domains_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."external_domains"
    ADD CONSTRAINT "external_domains_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."firewalls"
    ADD CONSTRAINT "firewalls_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."firewalls"
    ADD CONSTRAINT "firewalls_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."firewalls"
    ADD CONSTRAINT "firewalls_device_type_id_fkey" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_types"("id");



ALTER TABLE ONLY "public"."m365_analyzer_schedules"
    ADD CONSTRAINT "m365_analyzer_schedules_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_analyzer_snapshots"
    ADD CONSTRAINT "m365_analyzer_snapshots_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id");



ALTER TABLE ONLY "public"."m365_analyzer_snapshots"
    ADD CONSTRAINT "m365_analyzer_snapshots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_analyzer_snapshots"
    ADD CONSTRAINT "m365_analyzer_snapshots_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_app_credentials"
    ADD CONSTRAINT "m365_app_credentials_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_audit_logs"
    ADD CONSTRAINT "m365_audit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."m365_audit_logs"
    ADD CONSTRAINT "m365_audit_logs_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."m365_compliance_schedules"
    ADD CONSTRAINT "m365_compliance_schedules_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_dashboard_snapshots"
    ADD CONSTRAINT "m365_dashboard_snapshots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."m365_dashboard_snapshots"
    ADD CONSTRAINT "m365_dashboard_snapshots_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_external_movement_alerts"
    ADD CONSTRAINT "m365_external_movement_alerts_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."m365_analyzer_snapshots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."m365_external_movement_alerts"
    ADD CONSTRAINT "m365_external_movement_alerts_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_posture_history"
    ADD CONSTRAINT "m365_posture_history_agent_task_id_fkey" FOREIGN KEY ("agent_task_id") REFERENCES "public"."agent_tasks"("id");



ALTER TABLE ONLY "public"."m365_posture_history"
    ADD CONSTRAINT "m365_posture_history_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_posture_history"
    ADD CONSTRAINT "m365_posture_history_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_tenant_agents"
    ADD CONSTRAINT "m365_tenant_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_tenant_agents"
    ADD CONSTRAINT "m365_tenant_agents_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_tenant_licenses"
    ADD CONSTRAINT "m365_tenant_licenses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_tenant_licenses"
    ADD CONSTRAINT "m365_tenant_licenses_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_tenant_permissions"
    ADD CONSTRAINT "m365_tenant_permissions_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_tenant_submodules"
    ADD CONSTRAINT "m365_tenant_submodules_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_tenants"
    ADD CONSTRAINT "m365_tenants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_threat_dismissals"
    ADD CONSTRAINT "m365_threat_dismissals_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_tokens"
    ADD CONSTRAINT "m365_tokens_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_user_baselines"
    ADD CONSTRAINT "m365_user_baselines_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_user_external_daily_stats"
    ADD CONSTRAINT "m365_user_external_daily_stats_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."m365_user_external_domain_history"
    ADD CONSTRAINT "m365_user_external_domain_history_tenant_record_id_fkey" FOREIGN KEY ("tenant_record_id") REFERENCES "public"."m365_tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."preview_sessions"
    ADD CONSTRAINT "preview_sessions_target_workspace_id_fkey" FOREIGN KEY ("target_workspace_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."rule_categories"
    ADD CONSTRAINT "rule_categories_device_type_id_fkey" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rule_correction_guides"
    ADD CONSTRAINT "rule_correction_guides_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."compliance_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."source_key_endpoints"
    ADD CONSTRAINT "source_key_endpoints_device_type_id_fkey" FOREIGN KEY ("device_type_id") REFERENCES "public"."device_types"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_step_results"
    ADD CONSTRAINT "task_step_results_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_clients"
    ADD CONSTRAINT "user_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_modules"
    ADD CONSTRAINT "user_modules_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage agent tasks" ON "public"."agent_tasks" USING ((EXISTS ( SELECT 1
   FROM "public"."agents" "a"
  WHERE (("a"."id" = "agent_tasks"."agent_id") AND ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND "public"."has_client_access"("auth"."uid"(), "a"."client_id")))))));



CREATE POLICY "Admins can manage all agents" ON "public"."agents" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = ANY (ARRAY['workspace_admin'::"public"."app_role", 'super_admin'::"public"."app_role"]))))));



CREATE POLICY "Admins can manage client associations" ON "public"."user_clients" USING (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND "public"."has_client_access"("auth"."uid"(), "client_id"))));



CREATE POLICY "Admins can manage permissions" ON "public"."user_module_permissions" USING (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."user_clients" "admin_clients"
     JOIN "public"."user_clients" "target_clients" ON (("admin_clients"."client_id" = "target_clients"."client_id")))
  WHERE (("admin_clients"."user_id" = "auth"."uid"()) AND ("target_clients"."user_id" = "user_module_permissions"."user_id")))))));



CREATE POLICY "Admins can manage roles" ON "public"."user_roles" USING (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND ("role" <> 'super_admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."user_clients" "admin_clients"
     JOIN "public"."user_clients" "target_clients" ON (("admin_clients"."client_id" = "target_clients"."client_id")))
  WHERE (("admin_clients"."user_id" = "auth"."uid"()) AND ("target_clients"."user_id" = "user_roles"."user_id")))))));



CREATE POLICY "Admins can manage user module access" ON "public"."user_modules" USING (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."user_clients" "admin_clients"
     JOIN "public"."user_clients" "target_clients" ON (("admin_clients"."client_id" = "target_clients"."client_id")))
  WHERE (("admin_clients"."user_id" = "auth"."uid"()) AND ("target_clients"."user_id" = "user_modules"."user_id")))))));



CREATE POLICY "Admins can update assigned clients" ON "public"."clients" FOR UPDATE USING (("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND "public"."has_client_access"("auth"."uid"(), "id") AND ("public"."get_module_permission"("auth"."uid"(), 'firewall'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Admins can view agent tasks" ON "public"."agent_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."agents" "a"
  WHERE (("a"."id" = "agent_tasks"."agent_id") AND ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND "public"."has_client_access"("auth"."uid"(), "a"."client_id")))))));



CREATE POLICY "Admins can view assigned clients" ON "public"."clients" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "id"));



CREATE POLICY "Admins can view task step results" ON "public"."task_step_results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."agent_tasks" "t"
     JOIN "public"."agents" "a" ON (("a"."id" = "t"."agent_id")))
  WHERE (("t"."id" = "task_step_results"."task_id") AND ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND "public"."has_client_access"("auth"."uid"(), "a"."client_id")))))));



CREATE POLICY "Authenticated users can read metrics" ON "public"."agent_metrics" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."agents" "a"
     JOIN "public"."user_clients" "uc" ON (("uc"."client_id" = "a"."client_id")))
  WHERE (("a"."id" = "agent_metrics"."agent_id") AND ("uc"."user_id" = "auth"."uid"())))) OR "public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role")));



CREATE POLICY "Authenticated users can view CVE cache" ON "public"."cve_cache" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view CVE sources" ON "public"."cve_sources" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view api docs" ON "public"."device_type_api_docs" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view required permissions" ON "public"."m365_required_permissions" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can view sync history" ON "public"."cve_sync_history" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Client admins can view their agents" ON "public"."agents" FOR SELECT USING (("client_id" IN ( SELECT "user_clients"."client_id"
   FROM "public"."user_clients"
  WHERE ("user_clients"."user_id" = "auth"."uid"()))));



CREATE POLICY "Only service role can access tokens" ON "public"."m365_tokens" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can insert API access logs" ON "public"."api_access_logs" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can insert metrics" ON "public"."agent_metrics" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can manage CVE cache" ON "public"."cve_cache" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage CVE cache" ON "public"."cve_severity_cache" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage alerts" ON "public"."system_alerts" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage all licenses" ON "public"."m365_tenant_licenses" TO "authenticated" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage all tasks" ON "public"."agent_tasks" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage analyzer snapshots" ON "public"."analyzer_snapshots" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage attack surface schedules" ON "public"."attack_surface_schedules" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage attack surface snapshots" ON "public"."attack_surface_snapshots" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage attack surface tasks" ON "public"."attack_surface_tasks" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage commands" ON "public"."agent_commands" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage config changes" ON "public"."analyzer_config_changes" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage dashboard snapshots" ON "public"."m365_dashboard_snapshots" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage dehashed cache" ON "public"."dehashed_cache" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage external domain history" ON "public"."external_domain_analysis_history" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage m365 analyzer schedules" ON "public"."m365_analyzer_schedules" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage m365 analyzer snapshots" ON "public"."m365_analyzer_snapshots" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage m365 compliance schedules" ON "public"."m365_compliance_schedules" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage m365 user baselines" ON "public"."m365_user_baselines" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage posture history" ON "public"."m365_posture_history" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage rate limits" ON "public"."rate_limits" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage sync history" ON "public"."cve_sync_history" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage task step results" ON "public"."task_step_results" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage tenant agents" ON "public"."m365_tenant_agents" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can read system settings" ON "public"."system_settings" FOR SELECT USING (true);



CREATE POLICY "Service role can select metrics" ON "public"."agent_metrics" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Service role full access on daily stats" ON "public"."m365_user_external_daily_stats" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role full access on domain history" ON "public"."m365_user_external_domain_history" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role full access on movement alerts" ON "public"."m365_external_movement_alerts" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role full access to api_jobs" ON "public"."api_jobs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Super admins and super_suporte can manage preview sessions" ON "public"."preview_sessions" USING (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'super_suporte'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'super_suporte'::"public"."app_role")));



CREATE POLICY "Super admins can delete global config" ON "public"."m365_global_config" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can delete profiles" ON "public"."profiles" FOR DELETE USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can insert activity logs" ON "public"."admin_activity_logs" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can insert global config" ON "public"."m365_global_config" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage API access keys" ON "public"."api_access_keys" TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage CVE sources" ON "public"."cve_sources" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage all alerts" ON "public"."system_alerts" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage all clients" ON "public"."clients" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage api docs" ON "public"."device_type_api_docs" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage attack surface schedules" ON "public"."attack_surface_schedules" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage blueprints" ON "public"."device_blueprints" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage categories" ON "public"."rule_categories" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage commands" ON "public"."agent_commands" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage dashboard snapshots" ON "public"."m365_dashboard_snapshots" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage dehashed cache" ON "public"."dehashed_cache" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage device types" ON "public"."device_types" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage guides" ON "public"."rule_correction_guides" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage m365 analyzer schedules" ON "public"."m365_analyzer_schedules" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage m365 compliance schedules" ON "public"."m365_compliance_schedules" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage modules" ON "public"."modules" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage parses" ON "public"."evidence_parses" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage rules" ON "public"."compliance_rules" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage source key endpoints" ON "public"."source_key_endpoints" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage step templates" ON "public"."blueprint_step_templates" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can manage system settings" ON "public"."system_settings" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can read API access logs" ON "public"."api_access_logs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can update global config" ON "public"."m365_global_config" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can view all activity logs" ON "public"."admin_activity_logs" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can view all jobs" ON "public"."api_jobs" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can view attack surface tasks" ON "public"."attack_surface_tasks" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Super admins can view global config" ON "public"."m365_global_config" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role"));



CREATE POLICY "Users can insert own preferences" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can read own preferences" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own preferences" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view CVE cache for accessible clients" ON "public"."cve_severity_cache" FOR SELECT USING ((("client_id" IS NULL) OR "public"."has_client_access"("auth"."uid"(), "client_id")));



CREATE POLICY "Users can view active blueprints" ON "public"."device_blueprints" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view active categories" ON "public"."rule_categories" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view active device types" ON "public"."device_types" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view active modules" ON "public"."modules" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view active parses" ON "public"."evidence_parses" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view active rules" ON "public"."compliance_rules" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view active source key endpoints" ON "public"."source_key_endpoints" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view active step templates" ON "public"."blueprint_step_templates" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view analyzer schedules of accessible firewalls" ON "public"."analyzer_schedules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."firewalls" "f"
  WHERE (("f"."id" = "analyzer_schedules"."firewall_id") AND "public"."has_client_access"("auth"."uid"(), "f"."client_id")))));



CREATE POLICY "Users can view analyzer snapshots of accessible firewalls" ON "public"."analyzer_snapshots" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view applicable active alerts" ON "public"."system_alerts" FOR SELECT USING ((("is_active" = true) AND (("target_role" IS NULL) OR "public"."has_role"("auth"."uid"(), "target_role")) AND (("expires_at" IS NULL) OR ("expires_at" > "now"())) AND (NOT ("auth"."uid"() = ANY ("dismissed_by")))));



CREATE POLICY "Users can view attack surface schedules of accessible clients" ON "public"."attack_surface_schedules" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view attack surface snapshots of accessible clients" ON "public"."attack_surface_snapshots" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view attack surface tasks of accessible snapshots" ON "public"."attack_surface_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."attack_surface_snapshots" "s"
  WHERE (("s"."id" = "attack_surface_tasks"."snapshot_id") AND "public"."has_client_access"("auth"."uid"(), "s"."client_id")))));



CREATE POLICY "Users can view audit logs of accessible clients" ON "public"."m365_audit_logs" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR "public"."has_client_access"("auth"."uid"(), "client_id")));



CREATE POLICY "Users can view client associations" ON "public"."user_clients" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND "public"."has_client_access"("auth"."uid"(), "client_id"))));



CREATE POLICY "Users can view config changes of accessible firewalls" ON "public"."analyzer_config_changes" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view credentials of accessible tenants" ON "public"."m365_app_credentials" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_app_credentials"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id")))));



CREATE POLICY "Users can view daily stats of accessible clients" ON "public"."m365_user_external_daily_stats" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view dashboard snapshots of accessible clients" ON "public"."m365_dashboard_snapshots" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view dehashed cache of accessible clients" ON "public"."dehashed_cache" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view dismissals of accessible tenants" ON "public"."m365_threat_dismissals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_threat_dismissals"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id")))));



CREATE POLICY "Users can view domain history of accessible clients" ON "public"."m365_user_external_domain_history" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view external domains of accessible clients" ON "public"."external_domains" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view firewalls of accessible clients" ON "public"."firewalls" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view guides" ON "public"."rule_correction_guides" FOR SELECT USING (true);



CREATE POLICY "Users can view history of accessible external domains" ON "public"."external_domain_analysis_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."external_domains" "d"
  WHERE (("d"."id" = "external_domain_analysis_history"."domain_id") AND "public"."has_client_access"("auth"."uid"(), "d"."client_id")))));



CREATE POLICY "Users can view history of accessible firewalls" ON "public"."analysis_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."firewalls" "f"
  WHERE (("f"."id" = "analysis_history"."firewall_id") AND "public"."has_client_access"("auth"."uid"(), "f"."client_id")))));



CREATE POLICY "Users can view licenses of accessible clients" ON "public"."m365_tenant_licenses" FOR SELECT TO "authenticated" USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view m365 analyzer schedules of accessible tenants" ON "public"."m365_analyzer_schedules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_analyzer_schedules"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id")))));



CREATE POLICY "Users can view m365 analyzer snapshots of accessible clients" ON "public"."m365_analyzer_snapshots" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view m365 compliance schedules of accessible tenants" ON "public"."m365_compliance_schedules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_compliance_schedules"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id")))));



CREATE POLICY "Users can view m365 user baselines of accessible tenants" ON "public"."m365_user_baselines" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_user_baselines"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id")))));



CREATE POLICY "Users can view movement alerts of accessible clients" ON "public"."m365_external_movement_alerts" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view own module access" ON "public"."user_modules" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."user_clients" "admin_clients"
     JOIN "public"."user_clients" "target_clients" ON (("admin_clients"."client_id" = "target_clients"."client_id")))
  WHERE (("admin_clients"."user_id" = "auth"."uid"()) AND ("target_clients"."user_id" = "user_modules"."user_id")))))));



CREATE POLICY "Users can view permissions" ON "public"."user_module_permissions" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."user_clients" "admin_clients"
     JOIN "public"."user_clients" "target_clients" ON (("admin_clients"."client_id" = "target_clients"."client_id")))
  WHERE (("admin_clients"."user_id" = "auth"."uid"()) AND ("target_clients"."user_id" = "user_module_permissions"."user_id")))))));



CREATE POLICY "Users can view posture history of accessible tenants" ON "public"."m365_posture_history" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users can view profiles" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR "public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."user_clients" "admin_clients"
     JOIN "public"."user_clients" "target_clients" ON (("admin_clients"."client_id" = "target_clients"."client_id")))
  WHERE (("admin_clients"."user_id" = "auth"."uid"()) AND ("target_clients"."user_id" = "profiles"."id")))))));



CREATE POLICY "Users can view roles" ON "public"."user_roles" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."user_clients" "admin_clients"
     JOIN "public"."user_clients" "target_clients" ON (("admin_clients"."client_id" = "target_clients"."client_id")))
  WHERE (("admin_clients"."user_id" = "auth"."uid"()) AND ("target_clients"."user_id" = "user_roles"."user_id")))))));



CREATE POLICY "Users can view schedules of accessible external domains" ON "public"."external_domain_schedules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."external_domains" "d"
  WHERE (("d"."id" = "external_domain_schedules"."domain_id") AND "public"."has_client_access"("auth"."uid"(), "d"."client_id")))));



CREATE POLICY "Users can view schedules of accessible firewalls" ON "public"."analysis_schedules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."firewalls" "f"
  WHERE (("f"."id" = "analysis_schedules"."firewall_id") AND "public"."has_client_access"("auth"."uid"(), "f"."client_id")))));



CREATE POLICY "Users can view submodules of accessible tenants" ON "public"."m365_tenant_submodules" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_tenant_submodules"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id")))));



CREATE POLICY "Users can view tenant agents of accessible tenants" ON "public"."m365_tenant_agents" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_tenant_agents"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id")))));



CREATE POLICY "Users can view tenant permissions of accessible tenants" ON "public"."m365_tenant_permissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_tenant_permissions"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id")))));



CREATE POLICY "Users can view tenants of accessible clients" ON "public"."m365_tenants" FOR SELECT USING ("public"."has_client_access"("auth"."uid"(), "client_id"));



CREATE POLICY "Users with edit permission can delete dismissals" ON "public"."m365_threat_dismissals" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_threat_dismissals"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can insert analyzer snapshots" ON "public"."analyzer_snapshots" FOR INSERT WITH CHECK (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'firewall'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Users with edit permission can insert attack surface snapshots" ON "public"."attack_surface_snapshots" FOR INSERT WITH CHECK (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Users with edit permission can insert audit logs" ON "public"."m365_audit_logs" FOR INSERT WITH CHECK (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR "public"."has_client_access"("auth"."uid"(), "client_id")));



CREATE POLICY "Users with edit permission can insert dismissals" ON "public"."m365_threat_dismissals" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_threat_dismissals"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can insert external domain history" ON "public"."external_domain_analysis_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."external_domains" "d"
  WHERE (("d"."id" = "external_domain_analysis_history"."domain_id") AND "public"."has_client_access"("auth"."uid"(), "d"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can insert history" ON "public"."analysis_history" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."firewalls" "f"
  WHERE (("f"."id" = "analysis_history"."firewall_id") AND "public"."has_client_access"("auth"."uid"(), "f"."client_id")))));



CREATE POLICY "Users with edit permission can insert m365 analyzer snapshots" ON "public"."m365_analyzer_snapshots" FOR INSERT WITH CHECK (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Users with edit permission can insert posture history" ON "public"."m365_posture_history" FOR INSERT WITH CHECK (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Users with edit permission can manage analyzer schedules" ON "public"."analyzer_schedules" USING ((EXISTS ( SELECT 1
   FROM "public"."firewalls" "f"
  WHERE (("f"."id" = "analyzer_schedules"."firewall_id") AND "public"."has_client_access"("auth"."uid"(), "f"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'firewall'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."firewalls" "f"
  WHERE (("f"."id" = "analyzer_schedules"."firewall_id") AND "public"."has_client_access"("auth"."uid"(), "f"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'firewall'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can manage attack surface schedules" ON "public"."attack_surface_schedules" USING (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))) WITH CHECK (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Users with edit permission can manage credentials" ON "public"."m365_app_credentials" USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_app_credentials"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can manage external domain schedules" ON "public"."external_domain_schedules" USING ((EXISTS ( SELECT 1
   FROM "public"."external_domains" "d"
  WHERE (("d"."id" = "external_domain_schedules"."domain_id") AND "public"."has_client_access"("auth"."uid"(), "d"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."external_domains" "d"
  WHERE (("d"."id" = "external_domain_schedules"."domain_id") AND "public"."has_client_access"("auth"."uid"(), "d"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can manage external domains" ON "public"."external_domains" USING (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))) WITH CHECK (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Users with edit permission can manage firewalls" ON "public"."firewalls" USING (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'firewall'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Users with edit permission can manage m365 analyzer schedules" ON "public"."m365_analyzer_schedules" USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_analyzer_schedules"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_analyzer_schedules"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can manage m365 compliance schedules" ON "public"."m365_compliance_schedules" USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_compliance_schedules"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_compliance_schedules"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can manage schedules" ON "public"."analysis_schedules" USING ((EXISTS ( SELECT 1
   FROM "public"."firewalls" "f"
  WHERE (("f"."id" = "analysis_schedules"."firewall_id") AND "public"."has_client_access"("auth"."uid"(), "f"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'firewall'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can manage submodules" ON "public"."m365_tenant_submodules" USING (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_tenant_submodules"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))))));



CREATE POLICY "Users with edit permission can manage tenant agents" ON "public"."m365_tenant_agents" USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_tenant_agents"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_tenant_agents"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can manage tenant permissions" ON "public"."m365_tenant_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."m365_tenants" "t"
  WHERE (("t"."id" = "m365_tenant_permissions"."tenant_record_id") AND "public"."has_client_access"("auth"."uid"(), "t"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can manage tenants" ON "public"."m365_tenants" USING (("public"."has_role"("auth"."uid"(), 'super_admin'::"public"."app_role") OR ("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))));



CREATE POLICY "Users with edit permission can update external domain history" ON "public"."external_domain_analysis_history" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."external_domains" "d"
  WHERE (("d"."id" = "external_domain_analysis_history"."domain_id") AND "public"."has_client_access"("auth"."uid"(), "d"."client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'external_domain'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))))));



CREATE POLICY "Users with edit permission can update m365 analyzer snapshots" ON "public"."m365_analyzer_snapshots" FOR UPDATE TO "authenticated" USING (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"])))) WITH CHECK (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Users with edit permission can update posture history" ON "public"."m365_posture_history" FOR UPDATE USING (("public"."has_client_access"("auth"."uid"(), "client_id") AND ("public"."get_module_permission"("auth"."uid"(), 'm365'::"text") = ANY (ARRAY['edit'::"public"."module_permission", 'full'::"public"."module_permission"]))));



CREATE POLICY "Workspace admins can delete managed profiles" ON "public"."profiles" FOR DELETE USING (("public"."has_role"("auth"."uid"(), 'workspace_admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM ("public"."user_clients" "admin_clients"
     JOIN "public"."user_clients" "target_clients" ON (("admin_clients"."client_id" = "target_clients"."client_id")))
  WHERE (("admin_clients"."user_id" = "auth"."uid"()) AND ("target_clients"."user_id" = "profiles"."id"))))));



ALTER TABLE "public"."admin_activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_commands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analysis_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analysis_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analyzer_config_changes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analyzer_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analyzer_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_access_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_access_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attack_surface_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attack_surface_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attack_surface_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blueprint_step_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compliance_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cve_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cve_severity_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cve_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cve_sync_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dehashed_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_blueprints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_type_api_docs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."device_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."evidence_parses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_domain_analysis_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_domain_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."firewalls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_analyzer_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_analyzer_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_app_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_compliance_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_dashboard_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_external_movement_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_global_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_posture_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_required_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_tenant_agents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_tenant_licenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_tenant_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_tenant_submodules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_tenants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_threat_dismissals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_user_baselines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_user_external_daily_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."m365_user_external_domain_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."preview_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rule_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rule_correction_guides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."source_key_endpoints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_step_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_module_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_commands";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."system_alerts";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."can_manage_user"("_admin_id" "uuid", "_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_user"("_admin_id" "uuid", "_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_user"("_admin_id" "uuid", "_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_agent_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_agent_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_agent_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_step_results"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_step_results"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_step_results"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_stuck_tasks"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_stuck_tasks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_stuck_tasks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ext_domain_dashboard_summary"("p_domain_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_ext_domain_dashboard_summary"("p_domain_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ext_domain_dashboard_summary"("p_domain_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_fw_dashboard_summary"("p_firewall_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_fw_dashboard_summary"("p_firewall_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_fw_dashboard_summary"("p_firewall_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_insight_affected_entities"("p_history_id" "uuid", "p_insight_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_insight_affected_entities"("p_history_id" "uuid", "p_insight_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_insight_affected_entities"("p_history_id" "uuid", "p_insight_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_module_permission"("_user_id" "uuid", "_module_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_module_permission"("_user_id" "uuid", "_module_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_module_permission"("_user_id" "uuid", "_module_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_posture_insights_lite"("p_tenant_record_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_posture_insights_lite"("p_tenant_record_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_posture_insights_lite"("p_tenant_record_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_modules"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_modules"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_modules"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_client_access"("_user_id" "uuid", "_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_client_access"("_user_id" "uuid", "_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_client_access"("_user_id" "uuid", "_client_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "public"."scope_module") TO "anon";
GRANT ALL ON FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "public"."scope_module") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_module_access"("_user_id" "uuid", "_module_code" "public"."scope_module") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_client_admin"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_client_admin"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_client_admin"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_agent_heartbeat"("p_agent_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_agent_heartbeat"("p_agent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_agent_heartbeat"("p_agent_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_get_agent_tasks"("p_agent_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_get_agent_tasks"("p_agent_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_get_agent_tasks"("p_agent_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;









GRANT ALL ON TABLE "public"."admin_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."agent_commands" TO "anon";
GRANT ALL ON TABLE "public"."agent_commands" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_commands" TO "service_role";



GRANT ALL ON TABLE "public"."agent_metrics" TO "anon";
GRANT ALL ON TABLE "public"."agent_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."agent_tasks" TO "anon";
GRANT ALL ON TABLE "public"."agent_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."agents" TO "anon";
GRANT ALL ON TABLE "public"."agents" TO "authenticated";
GRANT ALL ON TABLE "public"."agents" TO "service_role";



GRANT ALL ON TABLE "public"."analysis_history" TO "anon";
GRANT ALL ON TABLE "public"."analysis_history" TO "authenticated";
GRANT ALL ON TABLE "public"."analysis_history" TO "service_role";



GRANT ALL ON TABLE "public"."analysis_schedules" TO "anon";
GRANT ALL ON TABLE "public"."analysis_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."analysis_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."analyzer_config_changes" TO "anon";
GRANT ALL ON TABLE "public"."analyzer_config_changes" TO "authenticated";
GRANT ALL ON TABLE "public"."analyzer_config_changes" TO "service_role";



GRANT ALL ON TABLE "public"."analyzer_schedules" TO "anon";
GRANT ALL ON TABLE "public"."analyzer_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."analyzer_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."analyzer_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."analyzer_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."analyzer_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."api_access_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_access_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_access_keys" TO "service_role";



GRANT ALL ON TABLE "public"."api_access_logs" TO "anon";
GRANT ALL ON TABLE "public"."api_access_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."api_access_logs" TO "service_role";



GRANT ALL ON TABLE "public"."api_jobs" TO "anon";
GRANT ALL ON TABLE "public"."api_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."api_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."attack_surface_schedules" TO "anon";
GRANT ALL ON TABLE "public"."attack_surface_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."attack_surface_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."attack_surface_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."attack_surface_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."attack_surface_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."attack_surface_tasks" TO "anon";
GRANT ALL ON TABLE "public"."attack_surface_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."attack_surface_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."blueprint_step_templates" TO "anon";
GRANT ALL ON TABLE "public"."blueprint_step_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."blueprint_step_templates" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."compliance_rules" TO "anon";
GRANT ALL ON TABLE "public"."compliance_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_rules" TO "service_role";



GRANT ALL ON TABLE "public"."cve_cache" TO "anon";
GRANT ALL ON TABLE "public"."cve_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."cve_cache" TO "service_role";



GRANT ALL ON TABLE "public"."cve_severity_cache" TO "anon";
GRANT ALL ON TABLE "public"."cve_severity_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."cve_severity_cache" TO "service_role";



GRANT ALL ON TABLE "public"."cve_sources" TO "anon";
GRANT ALL ON TABLE "public"."cve_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."cve_sources" TO "service_role";



GRANT ALL ON TABLE "public"."cve_sync_history" TO "anon";
GRANT ALL ON TABLE "public"."cve_sync_history" TO "authenticated";
GRANT ALL ON TABLE "public"."cve_sync_history" TO "service_role";



GRANT ALL ON TABLE "public"."dehashed_cache" TO "anon";
GRANT ALL ON TABLE "public"."dehashed_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."dehashed_cache" TO "service_role";



GRANT ALL ON TABLE "public"."device_blueprints" TO "anon";
GRANT ALL ON TABLE "public"."device_blueprints" TO "authenticated";
GRANT ALL ON TABLE "public"."device_blueprints" TO "service_role";



GRANT ALL ON TABLE "public"."device_type_api_docs" TO "anon";
GRANT ALL ON TABLE "public"."device_type_api_docs" TO "authenticated";
GRANT ALL ON TABLE "public"."device_type_api_docs" TO "service_role";



GRANT ALL ON TABLE "public"."device_types" TO "anon";
GRANT ALL ON TABLE "public"."device_types" TO "authenticated";
GRANT ALL ON TABLE "public"."device_types" TO "service_role";



GRANT ALL ON TABLE "public"."evidence_parses" TO "anon";
GRANT ALL ON TABLE "public"."evidence_parses" TO "authenticated";
GRANT ALL ON TABLE "public"."evidence_parses" TO "service_role";



GRANT ALL ON TABLE "public"."external_domain_analysis_history" TO "anon";
GRANT ALL ON TABLE "public"."external_domain_analysis_history" TO "authenticated";
GRANT ALL ON TABLE "public"."external_domain_analysis_history" TO "service_role";



GRANT ALL ON TABLE "public"."external_domain_schedules" TO "anon";
GRANT ALL ON TABLE "public"."external_domain_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."external_domain_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."external_domains" TO "anon";
GRANT ALL ON TABLE "public"."external_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."external_domains" TO "service_role";



GRANT ALL ON TABLE "public"."firewalls" TO "anon";
GRANT ALL ON TABLE "public"."firewalls" TO "authenticated";
GRANT ALL ON TABLE "public"."firewalls" TO "service_role";



GRANT ALL ON TABLE "public"."m365_analyzer_schedules" TO "anon";
GRANT ALL ON TABLE "public"."m365_analyzer_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_analyzer_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."m365_analyzer_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."m365_analyzer_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_analyzer_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."m365_app_credentials" TO "anon";
GRANT ALL ON TABLE "public"."m365_app_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_app_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."m365_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."m365_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."m365_compliance_schedules" TO "anon";
GRANT ALL ON TABLE "public"."m365_compliance_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_compliance_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."m365_dashboard_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."m365_dashboard_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_dashboard_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."m365_external_movement_alerts" TO "anon";
GRANT ALL ON TABLE "public"."m365_external_movement_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_external_movement_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."m365_global_config" TO "anon";
GRANT ALL ON TABLE "public"."m365_global_config" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_global_config" TO "service_role";



GRANT ALL ON TABLE "public"."m365_posture_history" TO "anon";
GRANT ALL ON TABLE "public"."m365_posture_history" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_posture_history" TO "service_role";



GRANT ALL ON TABLE "public"."m365_required_permissions" TO "anon";
GRANT ALL ON TABLE "public"."m365_required_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_required_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."m365_tenant_agents" TO "anon";
GRANT ALL ON TABLE "public"."m365_tenant_agents" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_tenant_agents" TO "service_role";



GRANT ALL ON TABLE "public"."m365_tenant_licenses" TO "anon";
GRANT ALL ON TABLE "public"."m365_tenant_licenses" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_tenant_licenses" TO "service_role";



GRANT ALL ON TABLE "public"."m365_tenant_permissions" TO "anon";
GRANT ALL ON TABLE "public"."m365_tenant_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_tenant_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."m365_tenant_submodules" TO "anon";
GRANT ALL ON TABLE "public"."m365_tenant_submodules" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_tenant_submodules" TO "service_role";



GRANT ALL ON TABLE "public"."m365_tenants" TO "anon";
GRANT ALL ON TABLE "public"."m365_tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_tenants" TO "service_role";



GRANT ALL ON TABLE "public"."m365_threat_dismissals" TO "anon";
GRANT ALL ON TABLE "public"."m365_threat_dismissals" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_threat_dismissals" TO "service_role";



GRANT ALL ON TABLE "public"."m365_tokens" TO "anon";
GRANT ALL ON TABLE "public"."m365_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."m365_user_baselines" TO "anon";
GRANT ALL ON TABLE "public"."m365_user_baselines" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_user_baselines" TO "service_role";



GRANT ALL ON TABLE "public"."m365_user_external_daily_stats" TO "anon";
GRANT ALL ON TABLE "public"."m365_user_external_daily_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_user_external_daily_stats" TO "service_role";



GRANT ALL ON TABLE "public"."m365_user_external_domain_history" TO "anon";
GRANT ALL ON TABLE "public"."m365_user_external_domain_history" TO "authenticated";
GRANT ALL ON TABLE "public"."m365_user_external_domain_history" TO "service_role";



GRANT ALL ON TABLE "public"."modules" TO "anon";
GRANT ALL ON TABLE "public"."modules" TO "authenticated";
GRANT ALL ON TABLE "public"."modules" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."preview_sessions" TO "anon";
GRANT ALL ON TABLE "public"."preview_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."preview_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."rule_categories" TO "anon";
GRANT ALL ON TABLE "public"."rule_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_categories" TO "service_role";



GRANT ALL ON TABLE "public"."rule_correction_guides" TO "anon";
GRANT ALL ON TABLE "public"."rule_correction_guides" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_correction_guides" TO "service_role";



GRANT ALL ON TABLE "public"."source_key_endpoints" TO "anon";
GRANT ALL ON TABLE "public"."source_key_endpoints" TO "authenticated";
GRANT ALL ON TABLE "public"."source_key_endpoints" TO "service_role";



GRANT ALL ON TABLE "public"."system_alerts" TO "anon";
GRANT ALL ON TABLE "public"."system_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."system_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."task_step_results" TO "anon";
GRANT ALL ON TABLE "public"."task_step_results" TO "authenticated";
GRANT ALL ON TABLE "public"."task_step_results" TO "service_role";



GRANT ALL ON TABLE "public"."user_clients" TO "anon";
GRANT ALL ON TABLE "public"."user_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."user_clients" TO "service_role";



GRANT ALL ON TABLE "public"."user_module_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_module_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_module_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."user_modules" TO "anon";
GRANT ALL ON TABLE "public"."user_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."user_modules" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























