import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const agentId = body.agent_id;

    if (!agentId) {
      return new Response(
        JSON.stringify({ error: "Missing agent_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify agent exists and is not revoked
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, revoked")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (agent.revoked) {
      return new Response(
        JSON.stringify({ error: "Agent revoked" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert metrics
    const { error: insertError } = await supabase.from("agent_metrics").insert({
      agent_id: agentId,
      cpu_percent: body.cpu_percent ?? null,
      cpu_count: body.cpu_count ?? null,
      load_avg_1m: body.load_avg_1m ?? null,
      load_avg_5m: body.load_avg_5m ?? null,
      load_avg_15m: body.load_avg_15m ?? null,
      ram_total_mb: body.ram_total_mb ?? null,
      ram_used_mb: body.ram_used_mb ?? null,
      ram_percent: body.ram_percent ?? null,
      disk_total_gb: body.disk_total_gb ?? null,
      disk_used_gb: body.disk_used_gb ?? null,
      disk_percent: body.disk_percent ?? null,
      disk_path: body.disk_path ?? "/",
      disk_partitions: body.disk_partitions ?? null,
      net_bytes_sent: body.net_bytes_sent ?? null,
      net_bytes_recv: body.net_bytes_recv ?? null,
      net_interfaces: body.net_interfaces ?? null,
      uptime_seconds: body.uptime_seconds ?? null,
      hostname: body.hostname ?? null,
      os_info: body.os_info ?? null,
      process_count: body.process_count ?? null,
      monitor_version: body.monitor_version ?? null,
      ip_addresses: body.ip_addresses ?? null,
      collected_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save metrics" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-monitor error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
