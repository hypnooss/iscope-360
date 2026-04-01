import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * Verify agent JWT token and return agent_id if valid.
 */
async function verifyAgentToken(req: Request, supabase: any): Promise<{ agentId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');

  let payload: { sub?: string; exp?: number };
  try {
    const [, payloadBase64] = decode(token);
    payload = payloadBase64 as { sub?: string; exp?: number };
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const agentId = payload.sub;
  if (!agentId) {
    return new Response(
      JSON.stringify({ error: 'No agent ID in token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return new Response(
      JSON.stringify({ error: 'Token expired' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('jwt_secret, revoked')
    .eq('id', agentId)
    .single();

  if (agentError || !agent || !agent.jwt_secret) {
    return new Response(
      JSON.stringify({ error: 'Agent not found' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (agent.revoked) {
    return new Response(
      JSON.stringify({ error: 'Agent revoked' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(agent.jwt_secret);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    await verify(token, cryptoKey);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid signature' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return { agentId };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (req.method === 'GET') {
      const authResult = await verifyAgentToken(req, supabase);
      if (authResult instanceof Response) return authResult;
      const { agentId } = authResult;

      const { data: commands, error } = await supabase
        .from('agent_commands')
        .select('id, command, timeout_seconds')
        .eq('agent_id', agentId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);

      if (error) {
        console.error('Error fetching commands:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch commands' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (commands && commands.length > 0) {
        const ids = commands.map((c: any) => c.id);
        await supabase
          .from('agent_commands')
          .update({ status: 'running', started_at: new Date().toISOString() })
          .in('id', ids);

        console.log(`Agent ${agentId}: ${commands.length} command(s) marked as running`);
      }

      // Read session_active flag so poller can stop immediately
      const { data: agentStatus } = await supabase
        .from('agents')
        .select('shell_session_active')
        .eq('id', agentId)
        .single();

      return new Response(
        JSON.stringify({
          commands: commands || [],
          session_active: agentStatus?.shell_session_active ?? false,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      const authResult = await verifyAgentToken(req, supabase);
      if (authResult instanceof Response) return authResult;
      const { agentId } = authResult;

      const body = await req.json();
      const { command_id, stdout, stderr, exit_code, status, cwd } = body;

      if (!command_id) {
        return new Response(
          JSON.stringify({ error: 'command_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isPartial = status === 'running';
      const finalStatus = status || (exit_code === 0 ? 'completed' : 'failed');

      const updatePayload: Record<string, any> = {
        stdout: stdout || null,
        stderr: stderr || null,
        exit_code: exit_code ?? null,
        status: finalStatus,
        cwd: cwd || null,
      };

      // Only set completed_at for final statuses
      if (!isPartial) {
        updatePayload.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('agent_commands')
        .update(updatePayload)
        .eq('id', command_id)
        .eq('agent_id', agentId);

      if (error) {
        console.error('Error updating command result:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to update command' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Agent ${agentId}: command ${command_id} -> ${finalStatus} (exit: ${exit_code})`);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
