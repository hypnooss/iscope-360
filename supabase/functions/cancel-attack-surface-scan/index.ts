import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { client_id } = await req.json()
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find the latest pending/running snapshot for this client
    const { data: snapshot, error: snapError } = await supabase
      .from('attack_surface_snapshots')
      .select('id, status')
      .eq('client_id', client_id)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (snapError) throw snapError

    if (!snapshot) {
      return new Response(JSON.stringify({ success: true, message: 'No active scan found', cancelled_tasks: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cancel the snapshot
    const { error: updateSnapError } = await supabase
      .from('attack_surface_snapshots')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', snapshot.id)

    if (updateSnapError) throw updateSnapError

    // Cancel all pending/assigned/running tasks for this snapshot
    const { data: cancelledTasks, error: updateTasksError } = await supabase
      .from('attack_surface_tasks')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('snapshot_id', snapshot.id)
      .in('status', ['pending', 'assigned', 'running'])
      .select('id')

    if (updateTasksError) throw updateTasksError

    const cancelledCount = cancelledTasks?.length ?? 0

    console.log(`Cancelled snapshot ${snapshot.id} with ${cancelledCount} tasks`)

    return new Response(JSON.stringify({
      success: true,
      snapshot_id: snapshot.id,
      cancelled_tasks: cancelledCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error cancelling scan:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
