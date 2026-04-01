import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized", message: "Token de autenticação ausente" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate user from JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "unauthorized", message: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // ── Mode 2: Server-side geolocation (no agent needed) ───────────────────
    if (Array.isArray(body?.ips)) {
      const ips: string[] = body.ips.filter((ip: any) => typeof ip === 'string' && ip.length > 0);
      if (ips.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "no_ips", message: "Nenhum IP fornecido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const geoRes = await fetch("http://ip-api.com/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          ips.map(ip => ({ query: ip, fields: "status,lat,lon,country,countryCode,regionName,city,query" }))
        ),
      });

      if (!geoRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "geo_api_error", message: "Erro ao contatar ip-api.com" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const geoData = await geoRes.json();
      return new Response(
        JSON.stringify({ success: true, results: geoData }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Mode 1: Create geo_query task via agent ──────────────────────────────
    const { agent_id, url, api_key } = body;

    if (!agent_id || !url || !api_key) {
      return new Response(
        JSON.stringify({ success: false, error: "missing_params", message: "agent_id, url e api_key são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate that the agent exists and belongs to a client the user has access to
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, client_id, name, revoked")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ success: false, error: "agent_not_found", message: "Agent não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (agent.revoked) {
      return new Response(
        JSON.stringify({ success: false, error: "agent_revoked", message: "Agent está revogado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user has access to the agent's client
    if (agent.client_id) {
      const { data: access } = await supabase.rpc("has_client_access", {
        _user_id: user.id,
        _client_id: agent.client_id,
      });
      if (!access) {
        return new Response(
          JSON.stringify({ success: false, error: "forbidden", message: "Sem acesso ao workspace do agent" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Normalize URL (remove trailing slash)
    const baseUrl = url.replace(/\/$/, "");

    // Inline blueprint: two http_request steps to collect WAN interface data
    const blueprint = {
      steps: [
        {
          id: "get_interfaces",
          type: "http_request",
          config: {
            method: "GET",
            url: `${baseUrl}/api/v2/cmdb/system/interface`,
            headers: { Authorization: `Bearer ${api_key}` },
            verify_ssl: false,
          },
        },
        {
          id: "get_sdwan",
          type: "http_request",
          config: {
            method: "GET",
            url: `${baseUrl}/api/v2/cmdb/system/sdwan`,
            headers: { Authorization: `Bearer ${api_key}` },
            verify_ssl: false,
            optional: true,
          },
        },
      ],
    };

    // Create agent_task of type geo_query
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    const { data: task, error: taskError } = await supabase
      .from("agent_tasks")
      .insert({
        agent_id,
        task_type: "geo_query",
        target_id: agent_id, // Use agent_id as placeholder target
        target_type: "agent",
        payload: {
          url: baseUrl,
          api_key,
          action: "get_wan_ips",
          blueprint,
        },
        priority: 10, // High priority — user is waiting
        expires_at: expiresAt,
        max_retries: 0, // No retries for interactive tasks
      } as any)
      .select("id")
      .single();

    if (taskError || !task) {
      console.error("resolve-firewall-geo: Failed to create task:", taskError);
      return new Response(
        JSON.stringify({ success: false, error: "task_creation_failed", message: "Falha ao criar task no agent" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`resolve-firewall-geo: Created geo_query task ${task.id} for agent ${agent_id}`);

    return new Response(
      JSON.stringify({ success: true, task_id: task.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("resolve-firewall-geo: Unexpected error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "internal_error", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
