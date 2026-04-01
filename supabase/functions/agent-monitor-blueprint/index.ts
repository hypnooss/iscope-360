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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const deviceTypeCode = url.searchParams.get("device_type") || "linux_server";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch active blueprint for the device type
    const { data: blueprint, error } = await supabase
      .from("device_blueprints")
      .select("id, name, version, collection_steps, executor_type, device_type_id")
      .eq("is_active", true)
      .eq("executor_type", "monitor")
      .eq(
        "device_type_id",
        supabase
          .from("device_types")
          .select("id")
          .eq("code", deviceTypeCode)
          .eq("is_active", true)
          .limit(1)
      )
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    // The nested eq doesn't work as a subquery in PostgREST, so do it in two steps
    const { data: deviceType } = await supabase
      .from("device_types")
      .select("id")
      .eq("code", deviceTypeCode)
      .eq("is_active", true)
      .single();

    if (!deviceType) {
      return new Response(
        JSON.stringify({ error: "Device type not found", code: deviceTypeCode }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: bp, error: bpError } = await supabase
      .from("device_blueprints")
      .select("id, name, version, collection_steps")
      .eq("is_active", true)
      .eq("executor_type", "monitor")
      .eq("device_type_id", deviceType.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bpError || !bp) {
      return new Response(
        JSON.stringify({ error: "No active blueprint found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        blueprint: {
          id: bp.id,
          name: bp.name,
          version: bp.version,
          steps: bp.collection_steps?.steps || [],
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-monitor-blueprint error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
