import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

const AGENT_OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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

    const { firewall_id } = await req.json();

    if (!firewall_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'firewall_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[trigger-firewall-analyzer] Starting for firewall: ${firewall_id}, user: ${userId}`);

    // Fetch firewall
    const { data: firewall, error: fwError } = await supabase
      .from('firewalls')
      .select('id, name, agent_id, device_type_id, client_id')
      .eq('id', firewall_id)
      .single();

    if (fwError || !firewall) {
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
        console.warn(`[trigger-firewall-analyzer] Access denied: user ${userId} → client ${firewall.client_id}`);
        return new Response(
          JSON.stringify({ success: false, error: 'Acesso negado a este recurso' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!firewall.agent_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firewall sem agent configurado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auto-cleanup BEFORE agent check — ensures expired tasks are cleaned even if agent is offline
    const now = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    await supabase
      .from('agent_tasks')
      .update({ status: 'timeout', error_message: 'Task expirada', completed_at: now })
      .eq('target_id', firewall_id)
      .eq('task_type', 'fortigate_analyzer')
      .in('status', ['pending', 'running'])
      .lt('expires_at', now);

    // Cleanup pending tasks that were never picked up (stale > 30min)
    await supabase
      .from('agent_tasks')
      .update({ status: 'timeout', error_message: 'Task não foi executada pelo agent', completed_at: now })
      .eq('target_id', firewall_id)
      .eq('task_type', 'fortigate_analyzer')
      .eq('status', 'pending')
      .lt('created_at', staleThreshold);

    // Also mark orphaned snapshots as failed (stale > 30min)
    await supabase
      .from('analyzer_snapshots')
      .update({ status: 'failed' })
      .eq('firewall_id', firewall_id)
      .in('status', ['pending', 'processing'])
      .lt('created_at', staleThreshold);

    console.log(`[trigger-firewall-analyzer] Cleanup done for firewall ${firewall_id}`);

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
        console.log(`[trigger-firewall-analyzer] Agent ${agent.name} offline (last_seen: ${agent.last_seen}), skipping firewall ${firewall.name}`);
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

    // Check for existing active task
    const { data: existing } = await supabase
      .from('agent_tasks')
      .select('id, status')
      .eq('target_id', firewall_id)
      .eq('task_type', 'fortigate_analyzer')
      .in('status', ['pending', 'running'])
      .gt('expires_at', now)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: false, error: 'Análise já em andamento', task_id: existing.id, code: 'ALREADY_RUNNING' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch last completed snapshot to determine period_start
    const { data: lastSnapshot } = await supabase
      .from('analyzer_snapshots')
      .select('period_end')
      .eq('firewall_id', firewall_id)
      .eq('status', 'completed')
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    const maxWindowMs = 2 * 60 * 60 * 1000; // 2h cap
    let periodStart: string;
    if (lastSnapshot?.period_end) {
      const lastEnd = new Date(lastSnapshot.period_end).getTime();
      const minStart = Date.now() - maxWindowMs;
      periodStart = new Date(Math.max(lastEnd, minStart)).toISOString();
    } else {
      periodStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    }

    console.log(`[trigger-firewall-analyzer] period_start=${periodStart}, period_end=${now}, last_snapshot_end=${lastSnapshot?.period_end || 'none'}`);

    // Create analyzer snapshot in pending state
    const { data: snapshot, error: snapError } = await supabase
      .from('analyzer_snapshots')
      .insert({
        firewall_id,
        client_id: firewall.client_id,
        status: 'pending',
        period_start: periodStart,
        period_end: now,
      })
      .select('id')
      .single();

    if (snapError) {
      console.error('[trigger-firewall-analyzer] Failed to create snapshot:', snapError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create snapshot' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create agent task
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { data: newTask, error: taskError } = await supabase
      .from('agent_tasks')
      .insert({
        agent_id: firewall.agent_id,
        task_type: 'fortigate_analyzer',
        target_id: firewall_id,
        target_type: 'firewall',
        status: 'pending',
        priority: 5,
        expires_at: expiresAt,
        payload: {
          firewall_name: firewall.name,
          device_type_id: firewall.device_type_id,
          snapshot_id: snapshot.id,
          period_start: periodStart,
          period_end: now,
        },
      })
      .select('id')
      .single();

    if (taskError || !newTask) {
      console.error('[trigger-firewall-analyzer] Failed to create task:', taskError);
      // Cleanup snapshot
      await supabase.from('analyzer_snapshots').delete().eq('id', snapshot.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create task' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Link task to snapshot
    await supabase
      .from('analyzer_snapshots')
      .update({ agent_task_id: newTask.id })
      .eq('id', snapshot.id);

    console.log(`[trigger-firewall-analyzer] Task ${newTask.id} created, snapshot ${snapshot.id}`);

    return new Response(
      JSON.stringify({ success: true, task_id: newTask.id, snapshot_id: snapshot.id, message: 'Análise agendada com sucesso.' }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[trigger-firewall-analyzer] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
