import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { getCorsHeaders } from '../_shared/cors.ts';

interface TestRequest {
  tenant_record_id: string;
}

interface TestResponse {
  success: boolean;
  task_id?: string;
  message: string;
  error?: string;
  agent?: {
    id: string;
    name: string;
    has_certificate: boolean;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[test-m365-exchange-connection] Auth error:', userError);
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse body
    const { tenant_record_id }: TestRequest = await req.json();

    if (!tenant_record_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'tenant_record_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[test-m365-exchange-connection] Testing Exchange connection for tenant: ${tenant_record_id}`);

    // Get tenant details with linked agent
    const { data: tenant, error: tenantError } = await supabase
      .from('m365_tenants')
      .select(`
        id,
        tenant_id,
        tenant_domain,
        display_name,
        client_id,
        connection_status
      `)
      .eq('id', tenant_record_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      console.error('[test-m365-exchange-connection] Tenant not found:', tenantError);
      return new Response(
        JSON.stringify({ success: false, error: 'Tenant não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get linked agent
    const { data: tenantAgent, error: taError } = await supabase
      .from('m365_tenant_agents')
      .select(`
        agent_id,
        enabled,
        agents(id, name, certificate_thumbprint, azure_certificate_key_id, last_seen, revoked)
      `)
      .eq('tenant_record_id', tenant_record_id)
      .eq('enabled', true)
      .maybeSingle();

    if (taError || !tenantAgent) {
      console.error('[test-m365-exchange-connection] No linked agent:', taError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Nenhum agent vinculado a este tenant',
          message: 'Vincule um agent ao tenant para testar a conexão Exchange Online.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = tenantAgent.agents as any;
    
    if (!agent) {
      return new Response(
        JSON.stringify({ success: false, error: 'Agent não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (agent.revoked) {
      return new Response(
        JSON.stringify({ success: false, error: 'Agent está revogado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if agent has certificate registered in Azure
    if (!agent.azure_certificate_key_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Agent não tem certificado registrado no Azure',
          message: 'Aguarde o próximo heartbeat do agent para registrar o certificado.',
          agent: {
            id: agent.id,
            name: agent.name,
            has_certificate: false
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get app credentials for this tenant
    const { data: credentials, error: credError } = await supabase
      .from('m365_app_credentials')
      .select('azure_app_id')
      .eq('tenant_record_id', tenant_record_id)
      .maybeSingle();

    if (credError || !credentials) {
      console.error('[test-m365-exchange-connection] No credentials found:', credError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Credenciais do Azure não encontradas',
          message: 'Complete o processo de consentimento admin primeiro.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for task creation
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Clean up expired test tasks
    const now = new Date().toISOString();
    await supabaseAdmin
      .from('agent_tasks')
      .update({
        status: 'timeout',
        error_message: 'Task expirada automaticamente',
        completed_at: now
      })
      .eq('target_id', tenant_record_id)
      .eq('target_type', 'm365_tenant')
      .eq('task_type', 'm365_powershell') // Use existing enum value
      .in('status', ['pending', 'running'])
      .lt('expires_at', now);

    // Check for existing pending task
    const { data: existingTask } = await supabaseAdmin
      .from('agent_tasks')
      .select('id, status, expires_at')
      .eq('target_id', tenant_record_id)
      .eq('target_type', 'm365_tenant')
      .eq('task_type', 'm365_powershell') // Use existing enum value
      .in('status', ['pending', 'running'])
      .gt('expires_at', now)
      .maybeSingle();

    if (existingTask) {
      console.log(`[test-m365-exchange-connection] Task already exists: ${existingTask.id}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Teste já em andamento',
          message: `Uma task de teste já está em execução (${existingTask.status})`,
          task_id: existingTask.id
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create test task for the agent
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 min timeout for test

    const organization = tenant.tenant_domain || `${tenant.tenant_id}.onmicrosoft.com`;

    const { data: newTask, error: taskError } = await supabaseAdmin
      .from('agent_tasks')
      .insert({
        agent_id: agent.id,
        task_type: 'm365_powershell', // Use existing enum value
        target_id: tenant_record_id,
        target_type: 'm365_tenant',
        status: 'pending',
        priority: 10, // High priority for tests
        expires_at: expiresAt.toISOString(),
        payload: {
          test_type: 'exchange_connection',
          tenant_display_name: tenant.display_name,
          azure_tenant_id: tenant.tenant_id,
          app_id: credentials.azure_app_id,
          organization: organization,
          // PowerShell commands to test connection
          module: 'ExchangeOnline',
          commands: [
            {
              name: 'test_connection',
              command: 'Get-EXOMailbox -ResultSize 1 | Select-Object DisplayName, PrimarySmtpAddress'
            },
            {
              name: 'organization_config',
              command: 'Get-OrganizationConfig | Select-Object Name, IsDehydrated'
            }
          ]
        }
      })
      .select('id')
      .single();

    if (taskError || !newTask) {
      console.error('[test-m365-exchange-connection] Failed to create task:', taskError);
      return new Response(
        JSON.stringify({ success: false, error: 'Falha ao criar task de teste' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[test-m365-exchange-connection] Test task created: ${newTask.id}`);

    // Log audit
    await supabaseAdmin.from('m365_audit_logs').insert({
      tenant_record_id,
      client_id: tenant.client_id,
      user_id: user.id,
      action: 'exchange_connection_test',
      action_details: { task_id: newTask.id, agent_id: agent.id },
    });

    const response: TestResponse = {
      success: true,
      task_id: newTask.id,
      message: 'Teste de conexão Exchange Online iniciado. Aguarde o agent processar.',
      agent: {
        id: agent.id,
        name: agent.name,
        has_certificate: true
      }
    };

    return new Response(
      JSON.stringify(response),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[test-m365-exchange-connection] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
