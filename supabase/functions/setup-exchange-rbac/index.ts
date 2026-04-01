import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { tenant_record_id } = body;

    if (!tenant_record_id) {
      return new Response(
        JSON.stringify({ error: "Campo obrigatório: tenant_record_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[setup-exchange-rbac] Starting Exchange CBA verification for tenant ${tenant_record_id}`);

    // Fetch tenant info
    const { data: tenant, error: tenantError } = await supabase
      .from('m365_tenants')
      .select(`
        id,
        tenant_id,
        tenant_domain,
        display_name,
        client_id
      `)
      .eq('id', tenant_record_id)
      .single();

    if (tenantError || !tenant) {
      console.error("Tenant not found:", tenantError);
      return new Response(
        JSON.stringify({ error: "Tenant não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tenant.tenant_domain) {
      return new Response(
        JSON.stringify({ error: "Domínio do tenant não configurado. Edite o tenant e adicione o domínio." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch app credentials (for app_id)
    const { data: credentials, error: credError } = await supabase
      .from('m365_app_credentials')
      .select('azure_app_id')
      .eq('tenant_record_id', tenant_record_id)
      .single();

    if (credError || !credentials) {
      console.error("Credentials not found:", credError);
      return new Response(
        JSON.stringify({ error: "Credenciais do app não encontradas. Complete a conexão do tenant primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch linked agent with certificate
    const { data: tenantAgent, error: agentLinkError } = await supabase
      .from('m365_tenant_agents')
      .select(`
        agent_id,
        agents(id, name, revoked, certificate_thumbprint)
      `)
      .eq('tenant_record_id', tenant_record_id)
      .eq('enabled', true)
      .single();

    if (agentLinkError || !tenantAgent) {
      console.error("Agent not linked:", agentLinkError);
      return new Response(
        JSON.stringify({ error: "Nenhum agent vinculado a este tenant. Vincule um agent primeiro." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const agent = tenantAgent.agents as any;
    if (!agent || agent.revoked) {
      return new Response(
        JSON.stringify({ error: "Agent vinculado está inativo ou revogado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!agent.certificate_thumbprint) {
      return new Response(
        JSON.stringify({ error: "Certificado não registrado no agent. Reconecte o tenant para gerar o certificado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build Exchange CBA verification command
    // This tests if the CBA connection works after Exchange.ManageAsApp is granted
    const verificationCommands = [
      {
        name: "get_organization_config",
        command: `Get-OrganizationConfig | Select-Object -Property Name, DisplayName | ConvertTo-Json -Compress`,
      },
    ];

    console.log(`[setup-exchange-rbac] Creating CBA verification task for agent ${agent.id}`);

    // Create agent task with CBA auth (uses certificate from agent)
    const { data: task, error: taskError } = await supabase
      .from('agent_tasks')
      .insert({
        agent_id: agent.id,
        task_type: 'm365_powershell',
        target_id: tenant_record_id,
        target_type: 'm365_tenant',
        priority: 10,
        payload: {
          type: 'exchange_cba_verification',
          module: 'ExchangeOnline',
          auth_mode: 'cba',
          commands: verificationCommands,
          tenant_id: tenant.tenant_id,
          organization: tenant.tenant_domain,
          app_id: credentials.azure_app_id,
          certificate_thumbprint: agent.certificate_thumbprint,
        },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (taskError) {
      console.error("Task creation failed:", taskError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar tarefa de verificação." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[setup-exchange-rbac] Task ${task.id} created successfully`);

    // Create audit log
    await supabase.from('m365_audit_logs').insert({
      action: 'exchange_cba_verification_initiated',
      user_id: user.id,
      client_id: tenant.client_id,
      tenant_record_id: tenant_record_id,
      action_details: {
        task_id: task.id,
        agent_id: agent.id,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        task_id: task.id,
        message: "Verificação do Exchange iniciada. O agent testará a conexão CBA em breve.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[setup-exchange-rbac] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
