import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Only allow service_role or authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    if (!isServiceRole) {
      const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // 1. Mark all expired agent_tasks as timeout (any task_type)
    const { data: expiredTasks, error: e1 } = await supabase
      .from('agent_tasks')
      .update({ status: 'timeout', error_message: 'Task expirada automaticamente', completed_at: now })
      .in('status', ['pending', 'running'])
      .lt('expires_at', now)
      .select('id, target_id, task_type');

    // 2. Mark stale pending tasks never picked up (>30min)
    const { data: staleTasks, error: e2 } = await supabase
      .from('agent_tasks')
      .update({ status: 'timeout', error_message: 'Task não foi executada pelo agent', completed_at: now })
      .eq('status', 'pending')
      .lt('created_at', staleThreshold)
      .is('started_at', null)
      .select('id, target_id, task_type');

    // 3. Mark orphaned analyzer_snapshots as failed
    const { data: orphanedSnapshots, error: e3 } = await supabase
      .from('analyzer_snapshots')
      .update({ status: 'failed' })
      .in('status', ['pending', 'processing'])
      .lt('created_at', staleThreshold)
      .select('id');

    // 4. Mark orphaned m365_analyzer_snapshots as failed
    const { data: orphanedM365, error: e4 } = await supabase
      .from('m365_analyzer_snapshots')
      .update({ status: 'failed' })
      .in('status', ['pending', 'processing'])
      .lt('created_at', staleThreshold)
      .select('id');

    // 5. Sync analyzer_snapshots whose agent_task already finished
    const { data: taskIds } = await supabase
      .from('agent_tasks')
      .select('id')
      .in('status', ['timeout', 'failed']);
    
    let syncedSnapshots = 0;
    let syncedM365Snapshots = 0;
    if (taskIds && taskIds.length > 0) {
      const finishedIds = taskIds.map((t: any) => t.id);
      
      const { data: s1 } = await supabase
        .from('analyzer_snapshots')
        .update({ status: 'failed' })
        .in('status', ['pending', 'processing'])
        .in('agent_task_id', finishedIds)
        .select('id');
      syncedSnapshots = s1?.length ?? 0;

      const { data: s2 } = await supabase
        .from('m365_analyzer_snapshots')
        .update({ status: 'failed' })
        .in('status', ['pending', 'processing'])
        .in('agent_task_id', finishedIds)
        .select('id');
      syncedM365Snapshots = s2?.length ?? 0;
    }

    const summary = {
      expired_tasks: expiredTasks?.length ?? 0,
      stale_tasks: staleTasks?.length ?? 0,
      orphaned_snapshots: orphanedSnapshots?.length ?? 0,
      orphaned_m365_snapshots: orphanedM365?.length ?? 0,
      synced_snapshots: syncedSnapshots,
      synced_m365_snapshots: syncedM365Snapshots,
      errors: [e1, e2, e3, e4].filter(Boolean).map(e => e?.message),
    };

    console.log('[cleanup-expired-tasks] Summary:', JSON.stringify(summary));

    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[cleanup-expired-tasks] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
