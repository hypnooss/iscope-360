// deploy: 2026-03-09T19:30:00Z
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { getCorsHeaders } from '../_shared/cors.ts';

const AGENT_OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface TriggerRequest {
  domain_id: string;
}

interface TriggerResponse {
  success: boolean;
  task_id?: string;
  analysis_id?: string;
  message: string;
  error?: string;
  code?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Validate auth (allow service_role for internal/cron calls)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { domain_id }: TriggerRequest = await req.json();

    if (!domain_id) {
      return new Response(JSON.stringify({ success: false, error: 'domain_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[trigger-external-domain-analysis] Triggering analysis for domain: ${domain_id}, user: ${userId}`);

    const { data: domain, error: domainError } = await supabase
      .from('external_domains')
      .select('id, domain, agent_id, client_id')
      .eq('id', domain_id)
      .single();

    if (domainError || !domain) {
      console.error('[trigger-external-domain-analysis] Domain not found:', domainError);
      return new Response(JSON.stringify({ success: false, error: 'Domain not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Check user has access to this client (skip for service_role)
    if (!isServiceRole) {
      const { data: hasAccess } = await supabase.rpc('has_client_access', {
        _user_id: userId,
        _client_id: domain.client_id,
      });

      if (!hasAccess) {
        console.warn(`[trigger-external-domain-analysis] Access denied: user ${userId} → client ${domain.client_id}`);
        return new Response(JSON.stringify({ success: false, error: 'Acesso negado a este recurso' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!domain.agent_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Domínio não tem agent configurado',
          message: 'Configure um agent para este domínio antes de executar a análise.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if agent is online
    const { data: agent } = await supabase
      .from('agents')
      .select('id, name, last_seen')
      .eq('id', domain.agent_id)
      .single();

    if (agent) {
      const lastSeen = agent.last_seen ? new Date(agent.last_seen).getTime() : 0;
      const isOffline = (Date.now() - lastSeen) > AGENT_OFFLINE_THRESHOLD_MS;
      if (isOffline) {
        console.log(`[trigger-external-domain-analysis] Agent ${agent.name} offline (last_seen: ${agent.last_seen}), skipping domain ${domain.domain}`);
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

    // Auto-cleanup: mark expired tasks as timeout
    const now = new Date().toISOString();
    await supabase
      .from('agent_tasks')
      .update({
        status: 'timeout',
        error_message: 'Task expirada automaticamente pelo sistema',
        completed_at: now,
      })
      .eq('target_id', domain_id)
      .eq('target_type', 'external_domain')
      .in('status', ['pending', 'running'])
      .lt('expires_at', now);

    // Prevent duplicates (pending/running and non-expired)
    const { data: existingTask } = await supabase
      .from('agent_tasks')
      .select('id, status, expires_at')
      .eq('target_id', domain_id)
      .eq('target_type', 'external_domain')
      .in('status', ['pending', 'running'])
      .gt('expires_at', now)
      .maybeSingle();

    if (existingTask) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Já existe uma análise em andamento para este domínio',
          message: `Task ${existingTask.id} está com status: ${existingTask.status}`,
          task_id: existingTask.id,
        } satisfies TriggerResponse),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    // =========================================================
    // 1. Create Agent Task (DNS collection via Python Agent)
    // =========================================================
    const { data: newTask, error: taskError } = await supabase
      .from('agent_tasks')
      .insert({
        agent_id: domain.agent_id,
        task_type: 'external_domain_analysis',
        target_id: domain_id,
        target_type: 'external_domain',
        status: 'pending',
        priority: 5,
        expires_at: expiresAt.toISOString(),
        payload: {
          domain: domain.domain,
          client_id: domain.client_id,
        },
      })
      .select('id')
      .single();

    if (taskError || !newTask) {
      console.error('[trigger-external-domain-analysis] Failed to create task:', taskError);
      return new Response(JSON.stringify({ success: false, error: 'Failed to create analysis task' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[trigger-external-domain-analysis] Agent task created: ${newTask.id}`);

    // =========================================================
    // 2. Create API Analysis Record (Subdomain Enum via Edge Function)
    // =========================================================
    let analysisId: string | null = null;

    // Check for existing pending/running API analysis
    const { data: existingApiAnalysis } = await supabase
      .from('external_domain_analysis_history')
      .select('id')
      .eq('domain_id', domain_id)
      .eq('source', 'api')
      .in('status', ['pending', 'running'])
      .maybeSingle();

    if (!existingApiAnalysis) {
      const { data: analysisRecord, error: analysisError } = await supabase
        .from('external_domain_analysis_history')
        .insert({
          domain_id: domain_id,
          source: 'api',
          status: 'pending',
          analyzed_by: null,
          score: null,
          report_data: null,
        })
        .select('id')
        .single();

      if (analysisError || !analysisRecord) {
        console.error('[trigger-external-domain-analysis] Failed to create API analysis record:', analysisError);
      } else {
        analysisId = analysisRecord.id;
        console.log(`[trigger-external-domain-analysis] API analysis record created: ${analysisId}`);

        // Run subdomain-enum in background
        const runApiAnalysis = async () => {
          try {
            await supabase
              .from('external_domain_analysis_history')
              .update({ status: 'running', started_at: new Date().toISOString() })
              .eq('id', analysisId);

            console.log(`[trigger-external-domain-analysis] Starting subdomain-enum for ${domain.domain}...`);

            const startTime = Date.now();
            const res = await fetch(`${supabaseUrl}/functions/v1/subdomain-enum`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ domain: domain.domain, timeout: 30 }),
            });

            const executionTimeMs = Date.now() - startTime;

            if (!res.ok) {
              const errorText = await res.text();
              console.error(`[trigger-external-domain-analysis] subdomain-enum failed: ${res.status} ${errorText}`);
              await supabase
                .from('external_domain_analysis_history')
                .update({
                  status: 'failed',
                  completed_at: new Date().toISOString(),
                  execution_time_ms: executionTimeMs,
                  report_data: { error: `subdomain-enum failed: ${res.status}`, details: errorText },
                })
                .eq('id', analysisId);
              return;
            }

            const result = await res.json();
            console.log(`[trigger-external-domain-analysis] subdomain-enum completed: ${result.total_found} subdomains, ${result.alive_count} alive`);

            const subdomainScore = result.success ? Math.min(100, Math.round(
              (result.alive_count / Math.max(result.total_found, 1)) * 100
            )) : 0;

            await supabase
              .from('external_domain_analysis_history')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                execution_time_ms: executionTimeMs,
                score: subdomainScore,
                report_data: {
                  type: 'subdomain_enumeration',
                  domain: result.domain,
                  total_found: result.total_found,
                  alive_count: result.alive_count,
                  inactive_count: result.inactive_count,
                  sources: result.sources,
                  subdomains: result.subdomains,
                  errors: result.errors,
                },
              })
              .eq('id', analysisId);

            console.log(`[trigger-external-domain-analysis] API analysis ${analysisId} completed successfully`);

          } catch (e) {
            console.error(`[trigger-external-domain-analysis] Background API error:`, e);
            await supabase
              .from('external_domain_analysis_history')
              .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                report_data: { error: String(e) },
              })
              .eq('id', analysisId);
          }
        };

        EdgeRuntime.waitUntil(runApiAnalysis());
      }
    } else {
      console.log(`[trigger-external-domain-analysis] API analysis already in progress: ${existingApiAnalysis.id}`);
      analysisId = existingApiAnalysis.id;
    }

    // WHOIS data is now collected exclusively by the Python Agent via domain_whois executor.
    // The agent-task-result edge function extracts WHOIS fields and updates external_domains.

    const response: TriggerResponse = {
      success: true,
      task_id: newTask.id,
      analysis_id: analysisId || undefined,
      message: 'Análise agendada com sucesso. O agent e a API irão processar em paralelo.',
    };

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[trigger-external-domain-analysis] Unexpected error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
