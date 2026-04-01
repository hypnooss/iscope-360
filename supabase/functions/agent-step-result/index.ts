import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================
// Types
// ============================================

interface StepResultRequest {
  task_id: string;
  step_id: string;
  status: 'success' | 'failed' | 'skipped';
  data?: Record<string, unknown>;
  error?: string;
  duration_ms: number;
}

interface StepResultSuccessResponse {
  success: true;
  task_id: string;
  step_id: string;
  steps_completed: number;
  steps_total: number;
}

interface StepResultErrorResponse {
  error: string;
  code: 'TOKEN_EXPIRED' | 'INVALID_SIGNATURE' | 'INVALID_TOKEN' | 'BLOCKED' | 'UNREGISTERED' | 'NOT_FOUND' | 'FORBIDDEN' | 'INTERNAL_ERROR' | 'DUPLICATE_STEP';
}

// ============================================
// Main Handler
// ============================================

serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Extract Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Token de autorização ausente ou inválido', code: 'INVALID_TOKEN' } as StepResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Decode token to get the agent_id (sub claim)
    let tokenPayload: { sub?: string; exp?: number };
    try {
      const [, payloadBase64] = decode(token);
      tokenPayload = payloadBase64 as { sub?: string; exp?: number };
    } catch (decodeError) {
      console.error('Failed to decode token:', decodeError);
      return new Response(
        JSON.stringify({ error: 'Token inválido', code: 'INVALID_TOKEN' } as StepResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentId = tokenPayload.sub;
    if (!agentId) {
      console.log('Token does not contain agent ID (sub claim)');
      return new Response(
        JSON.stringify({ error: 'Token não contém identificação do agent', code: 'INVALID_TOKEN' } as StepResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch agent data
    const { data: agent, error: fetchError } = await supabase
      .from('agents')
      .select('id, jwt_secret, revoked')
      .eq('id', agentId)
      .single();

    if (fetchError || !agent) {
      console.log('Agent not found:', agentId);
      return new Response(
        JSON.stringify({ error: 'Agent não encontrado', code: 'INVALID_TOKEN' } as StepResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if agent is revoked
    if (agent.revoked) {
      console.log('Agent is blocked:', agentId);
      return new Response(
        JSON.stringify({ error: 'Agent bloqueado', code: 'BLOCKED' } as StepResultErrorResponse),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if agent has jwt_secret (is registered)
    if (!agent.jwt_secret) {
      console.log('Agent is not registered (no jwt_secret):', agentId);
      return new Response(
        JSON.stringify({ error: 'Agent desregistrado', code: 'UNREGISTERED' } as StepResultErrorResponse),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check token expiration
    if (tokenPayload.exp && tokenPayload.exp < Math.floor(Date.now() / 1000)) {
      console.log('Token has expired:', agentId);
      return new Response(
        JSON.stringify({ error: 'Token expirado', code: 'TOKEN_EXPIRED' } as StepResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the token signature
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(agent.jwt_secret);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      await verify(token, cryptoKey);
    } catch (verifyError) {
      console.error('Token signature verification failed:', verifyError);
      return new Response(
        JSON.stringify({ error: 'Assinatura do token inválida', code: 'INVALID_SIGNATURE' } as StepResultErrorResponse),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let body: StepResultRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Corpo da requisição inválido', code: 'INTERNAL_ERROR' } as StepResultErrorResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    if (!body.task_id || !body.step_id || !body.status) {
      return new Response(
        JSON.stringify({ error: 'task_id, step_id e status são obrigatórios', code: 'INTERNAL_ERROR' } as StepResultErrorResponse),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the task to verify ownership and get total steps
    const { data: task, error: taskError } = await supabase
      .from('agent_tasks')
      .select('id, agent_id, status, payload')
      .eq('id', body.task_id)
      .single();

    if (taskError || !task) {
      // Fallback: check attack_surface_tasks for Super Agent tasks
      const { data: asTask, error: asError } = await supabase
        .from('attack_surface_tasks')
        .select('id, assigned_agent_id, status, snapshot_id, ip, result')
        .eq('id', body.task_id)
        .maybeSingle();

      if (!asError && asTask) {
        // Verify agent owns this attack surface task
        if (asTask.assigned_agent_id !== agentId) {
          return new Response(
            JSON.stringify({ error: 'Tarefa não pertence a este agent', code: 'FORBIDDEN' } as StepResultErrorResponse),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update task to running if still assigned/pending
        if (asTask.status === 'pending' || asTask.status === 'assigned') {
          await supabase
            .from('attack_surface_tasks')
            .update({ status: 'running', started_at: new Date().toISOString() })
            .eq('id', body.task_id);
        }

        // Accumulate step result into the task's result field
        const currentResult = (asTask as any).result || {};
        const updatedResult = {
          ...currentResult,
          [body.step_id]: {
            status: body.status,
            data: body.data || null,
            error: body.error || null,
            duration_ms: body.duration_ms || 0,
          },
        };

        await supabase
          .from('attack_surface_tasks')
          .update({ result: updatedResult })
          .eq('id', body.task_id);

        console.log(`[attack-surface] Step ${body.step_id} saved for task ${body.task_id} (ip: ${asTask.ip})`);

        return new Response(
          JSON.stringify({ success: true, task_id: body.task_id, step_id: body.step_id, steps_completed: Object.keys(updatedResult).length, steps_total: 3 }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Task not found in agent_tasks or attack_surface_tasks:', body.task_id);
      return new Response(
        JSON.stringify({ error: 'Tarefa não encontrada', code: 'NOT_FOUND' } as StepResultErrorResponse),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify agent owns this task
    if (task.agent_id !== agentId) {
      console.log('Agent does not own this task:', { agentId, taskAgentId: task.agent_id });
      return new Response(
        JSON.stringify({ error: 'Tarefa não pertence a este agent', code: 'FORBIDDEN' } as StepResultErrorResponse),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update task to running if still pending
    if (task.status === 'pending') {
      await supabase
        .from('agent_tasks')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', body.task_id);
    }

    // Get total steps from task payload
    const stepsTotal = (task.payload?.steps as unknown[])?.length || 0;

    // Insert step result using upsert to handle duplicates gracefully
    const { error: insertError } = await supabase
      .from('task_step_results')
      .upsert({
        task_id: body.task_id,
        step_id: body.step_id,
        status: body.status,
        data: body.data || null,
        error_message: body.error || null,
        duration_ms: body.duration_ms || 0,
      }, { onConflict: 'task_id,step_id' });

    if (insertError) {
      console.error('Failed to insert step result:', insertError);
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar resultado do step', code: 'INTERNAL_ERROR' } as StepResultErrorResponse),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count completed steps
    const { count: stepsCompleted } = await supabase
      .from('task_step_results')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', body.task_id);

    console.log(`Step ${body.step_id} saved for task ${body.task_id}: ${stepsCompleted}/${stepsTotal} steps`);

    const response: StepResultSuccessResponse = {
      success: true,
      task_id: body.task_id,
      step_id: body.step_id,
      steps_completed: stepsCompleted || 0,
      steps_total: stepsTotal,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in agent-step-result:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' } as StepResultErrorResponse),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
