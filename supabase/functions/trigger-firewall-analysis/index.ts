import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

const AGENT_OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface TriggerRequest {
  firewall_id: string;
}

interface TriggerResponse {
  success: boolean;
  task_id?: string;
  message: string;
  error?: string;
  code?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Validate auth (allow service_role for internal/cron calls)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;
    let userId = 'system';

    if (!isServiceRole) {
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = user.id;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { firewall_id }: TriggerRequest = await req.json();

    if (!firewall_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'firewall_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[trigger-firewall-analysis] Triggering analysis for firewall: ${firewall_id}, user: ${userId}`);

    // Fetch firewall details
    const { data: firewall, error: fwError } = await supabase
      .from('firewalls')
      .select('id, name, agent_id, device_type_id, client_id')
      .eq('id', firewall_id)
      .single();

    if (fwError || !firewall) {
      console.error('[trigger-firewall-analysis] Firewall not found:', fwError);
      return new Response(
        JSON.stringify({ success: false, error: 'Firewall not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check user has access to this client (skip for service_role)
    if (!isServiceRole) {
      const { data: hasAccess } = await supabase.rpc('has_client_access', {
        _user_id: userId,
        _client_id: firewall.client_id,
      });

      if (!hasAccess) {
        console.warn(`[trigger-firewall-analysis] Access denied: user ${userId} → client ${firewall.client_id}`);
        return new Response(
          JSON.stringify({ success: false, error: 'Acesso negado a este recurso' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[trigger-firewall-analysis] Firewall found:`, firewall);

    if (!firewall.agent_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Firewall não tem agent configurado',
          message: 'Configure um agent para este firewall antes de executar a análise.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!firewall.device_type_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Firewall não tem tipo de dispositivo configurado',
          message: 'Configure o tipo de dispositivo para este firewall.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if agent is online
    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, last_seen')
      .eq('id', firewall.agent_id)
      .single();

    if (agent) {
      const lastSeen = agent.last_seen ? new Date(agent.last_seen).getTime() : 0;
      const isOffline = (Date.now() - lastSeen) > AGENT_OFFLINE_THRESHOLD_MS;
      if (isOffline) {
        console.log(`[trigger-firewall-analysis] Agent ${agent.name} offline (last_seen: ${agent.last_seen}), skipping firewall ${firewall.name}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Agent ${agent.name} está offline (último contato: ${agent.last_seen || 'nunca'})`,
            code: 'AGENT_OFFLINE',
            message: 'O agent precisa estar online para executar a análise.'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Auto-cleanup: Mark expired tasks as timeout before checking for duplicates
    const now = new Date().toISOString();
    const { data: expiredTasks } = await supabase
      .from('agent_tasks')
      .update({
        status: 'timeout',
        error_message: 'Task expirada automaticamente pelo sistema',
        completed_at: now
      })
      .eq('target_id', firewall_id)
      .eq('target_type', 'firewall')
      .in('status', ['pending', 'running'])
      .lt('expires_at', now)
      .select('id');

    if (expiredTasks?.length) {
      console.log(`[trigger-firewall-analysis] Auto-cleaned ${expiredTasks.length} expired tasks`);
    }

    // Check if there's already a pending/running task for this firewall (only non-expired)
    const { data: existingTask } = await supabase
      .from('agent_tasks')
      .select('id, status, expires_at')
      .eq('target_id', firewall_id)
      .eq('target_type', 'firewall')
      .in('status', ['pending', 'running'])
      .gt('expires_at', now)
      .maybeSingle();

    if (existingTask) {
      console.log(`[trigger-firewall-analysis] Task already exists: ${existingTask.id} (${existingTask.status})`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Já existe uma análise em andamento para este firewall',
          message: `Task ${existingTask.id} está com status: ${existingTask.status}`,
          task_id: existingTask.id
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new task
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const { data: newTask, error: taskError } = await supabase
      .from('agent_tasks')
      .insert({
        agent_id: firewall.agent_id,
        task_type: 'fortigate_compliance',
        target_id: firewall_id,
        target_type: 'firewall',
        status: 'pending',
        priority: 5,
        expires_at: expiresAt.toISOString(),
        payload: {
          firewall_name: firewall.name,
          device_type_id: firewall.device_type_id
        }
      })
      .select('id')
      .single();

    if (taskError || !newTask) {
      console.error('[trigger-firewall-analysis] Failed to create task:', taskError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create analysis task' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[trigger-firewall-analysis] Task created successfully: ${newTask.id}`);

    const response: TriggerResponse = {
      success: true,
      task_id: newTask.id,
      message: 'Análise agendada com sucesso. O agent irá processar em breve.'
    };

    return new Response(
      JSON.stringify(response),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[trigger-firewall-analysis] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
