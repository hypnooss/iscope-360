import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { client_id, ip, source, label, snapshot_id } = await req.json();

    if (!client_id || !ip || !source || !snapshot_id) {
      return new Response(
        JSON.stringify({ error: "client_id, ip, source and snapshot_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify snapshot exists and belongs to client
    const { data: snapshot, error: snapErr } = await supabase
      .from("attack_surface_snapshots")
      .select("id, client_id")
      .eq("id", snapshot_id)
      .eq("client_id", client_id)
      .single();

    if (snapErr || !snapshot) {
      return new Response(
        JSON.stringify({ error: "Snapshot not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a single task linked to the existing snapshot
    const { error: taskErr } = await supabase
      .from("attack_surface_tasks")
      .insert({
        snapshot_id,
        ip,
        source,
        label: label || ip,
        status: "pending",
      });

    if (taskErr) throw taskErr;

    // Mark snapshot as running
    await supabase
      .from("attack_surface_snapshots")
      .update({ status: "running" })
      .eq("id", snapshot_id);

    return new Response(
      JSON.stringify({ success: true, snapshot_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("attack-surface-rescan-ip error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
