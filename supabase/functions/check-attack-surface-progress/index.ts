import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    // Find snapshots created today that are still not completed
    const { data: pendingSnapshots } = await supabase
      .from('attack_surface_snapshots')
      .select('id, client_id, status, created_at')
      .in('status', ['pending', 'running'])
      .gte('created_at', todayISO)

    if (!pendingSnapshots || pendingSnapshots.length === 0) {
      console.log('[progress] No pending snapshots for today')
      return new Response(JSON.stringify({ success: true, message: 'No pending snapshots' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[progress] Found ${pendingSnapshots.length} pending/running snapshots`)

    let totalTasks = 0
    let completedTasks = 0

    for (const snap of pendingSnapshots) {
      const { count: total } = await supabase
        .from('attack_surface_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('snapshot_id', snap.id)

      const { count: done } = await supabase
        .from('attack_surface_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('snapshot_id', snap.id)
        .in('status', ['completed', 'failed'])

      totalTasks += (total ?? 0)
      completedTasks += (done ?? 0)
    }

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    console.log(`[progress] Overall: ${completedTasks}/${totalTasks} tasks (${progress}%)`)

    if (progress < 80 && totalTasks > 0) {
      // Create overload alert
      await supabase.from('system_alerts').insert({
        alert_type: 'super_agent_overload',
        severity: 'warning',
        title: 'Scan de superfície atrasado',
        message: `Apenas ${progress}% das tasks de Attack Surface foram concluídas hoje (${completedTasks}/${totalTasks}). Considere adicionar mais Super Agents para distribuir a carga.`,
        metadata: {
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          progress_percent: progress,
          pending_snapshots: pendingSnapshots.length,
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })

      console.log(`[progress] Alert created: ${progress}% completion`)
    }

    return new Response(JSON.stringify({
      success: true,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      progress_percent: progress,
      alert_created: progress < 80,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[progress] Error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
