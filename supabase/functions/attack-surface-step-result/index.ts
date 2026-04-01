import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

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

    const body = await req.json()
    const { task_id, status, result } = body

    if (!task_id) {
      return new Response(JSON.stringify({ error: 'task_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[step-result] Task ${task_id}: status=${status}`)

    // Update the task
    const updateData: Record<string, any> = {
      status: status === 'success' ? 'completed' : (status === 'failed' ? 'failed' : status),
      completed_at: new Date().toISOString(),
    }

    if (result) {
      updateData.result = result
    }

    const { data: task, error: updateError } = await supabase
      .from('attack_surface_tasks')
      .update(updateData)
      .eq('id', task_id)
      .select('snapshot_id, ip')
      .single()

    if (updateError) {
      console.error(`[step-result] Failed to update task ${task_id}:`, updateError.message)
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const snapshotId = task.snapshot_id

    // Check if all tasks for this snapshot are done
    const { data: pendingTasks } = await supabase
      .from('attack_surface_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('snapshot_id', snapshotId)
      .in('status', ['pending', 'assigned', 'running'])

    const pendingCount = pendingTasks?.length ?? 0

    if (pendingCount === 0) {
      console.log(`[step-result] All tasks for snapshot ${snapshotId} completed. Triggering consolidation (fire-and-forget)...`)

      // Fire-and-forget: trigger consolidation without blocking the response
      fetch(`${supabaseUrl}/functions/v1/consolidate-attack-surface`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ snapshot_id: snapshotId }),
      }).catch(err => console.error('[step-result] fire-and-forget consolidation failed:', err.message))
    } else {
      // Update snapshot status to running if still pending
      await supabase
        .from('attack_surface_snapshots')
        .update({ status: 'running' })
        .eq('id', snapshotId)
        .eq('status', 'pending')
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[step-result] Error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
