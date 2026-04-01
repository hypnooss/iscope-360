import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

// Scope-to-blueprint pattern mapping for determining if agent is needed
const SCOPE_BLUEPRINT_PATTERNS: Record<string, string> = {
  exchange_online: '%Exchange%',
  entra_id: '%Entra%',
};

async function checkScopeNeedsAgent(supabaseAdmin: any, scope?: string): Promise<boolean> {
  // No scope = full analysis, always needs agent if available
  if (!scope) return true;
  
  // Get M365 device type
  const { data: deviceType } = await supabaseAdmin
    .from('device_types')
    .select('id')
    .eq('code', 'm365')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  
  if (!deviceType) return true; // Fallback: create task
  
  // Check if there are agent/hybrid blueprints matching this scope
  let query = supabaseAdmin
    .from('device_blueprints')
    .select('id')
    .eq('device_type_id', deviceType.id)
    .eq('is_active', true)
    .in('executor_type', ['agent', 'hybrid']);
  
  const pattern = SCOPE_BLUEPRINT_PATTERNS[scope];
  if (pattern) {
    query = query.ilike('name', pattern);
  }
  
  const { data: agentBlueprints } = await query;
  
  const needs = (agentBlueprints?.length || 0) > 0;
  console.log(`[trigger-m365-posture-analysis] checkScopeNeedsAgent('${scope}'): ${needs} (found ${agentBlueprints?.length || 0} agent/hybrid blueprints)`);
  return needs;
}

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const token = authHeader.replace('Bearer ', '');

    // Detect service_role calls (from scheduler) — bypass user auth
    const isServiceRole = token === serviceRoleKey;
    let userId: string | null = null;

    if (isServiceRole) {
      console.log('[trigger-m365-posture-analysis] Service-role call detected (scheduler/system)');
      userId = null; // system-initiated, analyzed_by will be null
    } else {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('[trigger-m365-posture-analysis] Auth error:', userError);
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    // Parse body
    const body = await req.json();
    const { tenant_record_id, scope } = body;

    if (!tenant_record_id) {
      return new Response(JSON.stringify({ error: 'tenant_record_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[trigger-m365-posture-analysis] Starting analysis for tenant: ${tenant_record_id}, user: ${userId ?? 'system'}`);

    // Get tenant details (use admin client for service_role, user client otherwise)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('m365_tenants')
      .select('id, tenant_id, tenant_domain, display_name, client_id')
      .eq('id', tenant_record_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      console.error('[trigger-m365-posture-analysis] Tenant not found:', tenantError);
      return new Response(JSON.stringify({ error: 'Tenant not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check user has access to this client (skip for service_role)
    if (!isServiceRole && userId) {
      const { data: hasAccess } = await supabaseAdmin.rpc('has_client_access', {
        _user_id: userId,
        _client_id: tenant.client_id,
      });

      if (!hasAccess) {
        console.warn(`[trigger-m365-posture-analysis] Access denied: user ${userId} → client ${tenant.client_id}`);
        return new Response(JSON.stringify({ error: 'Acesso negado a este recurso' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    const { data: pendingAnalysis } = await supabaseAdmin
      .from('m365_posture_history')
      .select('id, status, created_at')
      .eq('tenant_record_id', tenant_record_id)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingAnalysis) {
      console.log(`[trigger-m365-posture-analysis] Analysis already in progress: ${pendingAnalysis.id}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Analysis already in progress',
        existing_id: pendingAnalysis.id,
      }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create pending record
    const { data: historyRecord, error: insertError } = await supabaseAdmin
      .from('m365_posture_history')
      .insert({
        tenant_record_id,
        client_id: tenant.client_id,
        status: 'pending',
        analyzed_by: userId, // null for system calls
      })
      .select('id')
      .single();

    if (insertError || !historyRecord) {
      console.error('[trigger-m365-posture-analysis] Failed to create history record:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create analysis record' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[trigger-m365-posture-analysis] Created pending record: ${historyRecord.id}`);

    // Check if tenant has linked agent for PowerShell-based collection
    let agentTaskId: string | null = null;
    const { data: tenantAgent } = await supabaseAdmin
      .from('m365_tenant_agents')
      .select('agent_id')
      .eq('tenant_record_id', tenant_record_id)
      .eq('enabled', true)
      .maybeSingle();

    if (tenantAgent?.agent_id) {
      console.log(`[trigger-m365-posture-analysis] Tenant has linked agent: ${tenantAgent.agent_id}`);
      
      // Check if the requested scope actually needs agent-based collection
      const needsAgent = await checkScopeNeedsAgent(supabaseAdmin, scope);
      
      if (needsAgent) {
        // Create agent task for PowerShell-based collection (Exchange, SharePoint)
        const { data: agentTask, error: agentTaskError } = await supabaseAdmin
          .from('agent_tasks')
          .insert({
            agent_id: tenantAgent.agent_id,
            task_type: 'm365_powershell',
            target_id: tenant_record_id,
            target_type: 'm365_tenant',
            status: 'pending',
            priority: 5,
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
            payload: {
              analysis_id: historyRecord.id,
              tenant_id: tenant.tenant_id,
              tenant_domain: tenant.tenant_domain,
              ...(scope ? { scope } : {}),
            },
          })
          .select('id')
          .single();

        if (agentTaskError) {
          console.error('[trigger-m365-posture-analysis] Failed to create agent task:', agentTaskError);
          // Don't fail the whole operation - Graph API analysis can still proceed
        } else {
          agentTaskId = agentTask?.id || null;
          console.log(`[trigger-m365-posture-analysis] Agent task created: ${agentTaskId}`);
          
          // Link agent task to the posture history record
          await supabaseAdmin
            .from('m365_posture_history')
            .update({ 
              agent_task_id: agentTaskId,
              agent_status: 'pending',
            })
            .eq('id', historyRecord.id);
        }
      } else {
        console.log(`[trigger-m365-posture-analysis] Scope '${scope}' does not require agent collection, skipping task creation`);
      }
    } else {
      console.log(`[trigger-m365-posture-analysis] No agent linked to tenant, skipping PowerShell collection`);
    }

    // Start background analysis using EdgeRuntime.waitUntil (Graph API)
    const runAnalysis = async () => {
      try {
        // Update status to running
        await supabaseAdmin
          .from('m365_posture_history')
          .update({ status: 'running', started_at: new Date().toISOString() })
          .eq('id', historyRecord.id);

        console.log(`[trigger-m365-posture-analysis] Starting m365-security-posture call...`);

        // Call the main analysis function
        const res = await fetch(`${supabaseUrl}/functions/v1/m365-security-posture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ tenant_record_id, ...(scope ? { blueprint_filter: scope } : {}) }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.error(`[trigger-m365-posture-analysis] Analysis failed: ${res.status} ${errorText}`);
          
          await supabaseAdmin
            .from('m365_posture_history')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              errors: { message: `Analysis failed: ${res.status}`, details: errorText },
            })
            .eq('id', historyRecord.id);
          return;
        }

        const result = await res.json();
        console.log(`[trigger-m365-posture-analysis] Analysis completed. Score: ${result.score}`);

        const allInsights = result.insights || [];

        // Recalculate summary with ALL insights
        const recalculatedSummary = {
          critical: allInsights.filter((i: any) => i.status === 'fail' && i.severity === 'critical').length,
          high: allInsights.filter((i: any) => i.status === 'fail' && i.severity === 'high').length,
          medium: allInsights.filter((i: any) => i.status === 'fail' && i.severity === 'medium').length,
          low: allInsights.filter((i: any) => i.status === 'fail' && i.severity === 'low').length,
          info: allInsights.filter((i: any) => i.severity === 'info').length,
          total: allInsights.length,
        };

        // Check if agent already completed before us (race condition handling)
        const { data: currentRecord } = await supabaseAdmin
          .from('m365_posture_history')
          .select('agent_status, agent_insights')
          .eq('id', historyRecord.id)
          .maybeSingle();

        const agentAlreadyCompleted = currentRecord?.agent_status === 'completed';
        const agentInsightsData = Array.isArray(currentRecord?.agent_insights) ? currentRecord.agent_insights : [];

        let finalStatus: string;
        let finalScore = result.score;
        let finalSummary = recalculatedSummary;

        if (agentAlreadyCompleted && agentInsightsData.length > 0) {
          // Agent finished first — merge agent insights and mark as completed
          const mergedInsights = [...allInsights, ...agentInsightsData];
          finalSummary = {
            critical: mergedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'critical').length,
            high: mergedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'high').length,
            medium: mergedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'medium').length,
            low: mergedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'low').length,
            info: mergedInsights.filter((i: any) => i.severity === 'info').length,
            total: mergedInsights.length,
          };
          // Recalculate score with merged data
          const applicableInsights = mergedInsights.filter((i: any) => i.status !== 'not_found');
          const totalChecks = applicableInsights.length;
          let totalPenalty = 0;
          for (const insight of applicableInsights) {
            const i = insight as any;
            if (i.status === 'fail') {
              const sevWeight = i.severity === 'critical' ? 4 : i.severity === 'high' ? 3 : i.severity === 'medium' ? 2 : 1;
              totalPenalty += sevWeight;
            }
          }
          const maxPenalty = totalChecks * 4;
          finalScore = maxPenalty > 0 ? Math.max(0, Math.round(100 - (totalPenalty / maxPenalty) * 100)) : result.score;
          finalStatus = 'completed';
          console.log(`[trigger-m365-posture-analysis] Agent already completed — merging ${agentInsightsData.length} agent insights. Final score: ${finalScore}, total: ${mergedInsights.length}`);
        } else if (agentTaskId) {
          // Agent hasn't completed yet — save as partial
          finalStatus = 'partial';
          console.log(`[trigger-m365-posture-analysis] Agent not ready yet — saving as partial`);
        } else {
          // No agent — completed
          finalStatus = 'completed';
          console.log(`[trigger-m365-posture-analysis] No agent task — marking as completed`);
        }

        // Update history record with results
        await supabaseAdmin
          .from('m365_posture_history')
          .update({
            status: finalStatus,
            completed_at: finalStatus === 'completed' ? new Date().toISOString() : undefined,
            score: finalScore,
            classification: result.classification,
            summary: finalSummary,
            category_breakdown: result.categoryBreakdown,
            insights: allInsights,
            environment_metrics: result.environmentMetrics || null,
            errors: result.errors ? { errors: result.errors } : null,
          })
          .eq('id', historyRecord.id);

        console.log(`[trigger-m365-posture-analysis] Record ${historyRecord.id} updated with status: ${finalStatus}`);

        // Re-check after writing partial: agent may have completed between our first read and this write
        if (finalStatus === 'partial') {
          const { data: recheck } = await supabaseAdmin
            .from('m365_posture_history')
            .select('agent_status, agent_insights')
            .eq('id', historyRecord.id)
            .maybeSingle();

          if (recheck?.agent_status === 'completed' && Array.isArray(recheck.agent_insights) && recheck.agent_insights.length > 0) {
            console.log(`[trigger-m365-posture-analysis] Re-check: agent completed during our write — merging now`);
            const mergedInsights = [...allInsights, ...recheck.agent_insights];
            const mergedSummary = {
              critical: mergedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'critical').length,
              high: mergedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'high').length,
              medium: mergedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'medium').length,
              low: mergedInsights.filter((i: any) => i.status === 'fail' && i.severity === 'low').length,
              info: mergedInsights.filter((i: any) => i.severity === 'info').length,
              total: mergedInsights.length,
            };
            const applicableMerged = mergedInsights.filter((i: any) => i.status !== 'not_found');
            const totalMerged = applicableMerged.length;
            let penaltyMerged = 0;
            for (const insight of applicableMerged) {
              const i = insight as any;
              if (i.status === 'fail') {
                const w = i.severity === 'critical' ? 4 : i.severity === 'high' ? 3 : i.severity === 'medium' ? 2 : 1;
                penaltyMerged += w;
              }
            }
            const maxP = totalMerged * 4;
            const mergedScore = maxP > 0 ? Math.max(0, Math.round(100 - (penaltyMerged / maxP) * 100)) : finalScore;

            await supabaseAdmin
              .from('m365_posture_history')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                score: mergedScore,
                summary: mergedSummary,
              })
              .eq('id', historyRecord.id);

            console.log(`[trigger-m365-posture-analysis] Re-check merge complete. Score: ${mergedScore}, total: ${mergedInsights.length}`);
          }
        }

      } catch (e) {
        console.error(`[trigger-m365-posture-analysis] Background error:`, e);
        
        await supabaseAdmin
          .from('m365_posture_history')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            errors: { message: String(e) },
          })
          .eq('id', historyRecord.id);
      }
    };

    // Run analysis in background
    EdgeRuntime.waitUntil(runAnalysis());

    // Return immediately with the job ID
    return new Response(JSON.stringify({
      success: true,
      message: 'Analysis started',
      analysis_id: historyRecord.id,
      agent_task_id: agentTaskId,
      has_agent: !!tenantAgent?.agent_id,
      tenant: {
        id: tenant.tenant_id,
        domain: tenant.tenant_domain,
        displayName: tenant.display_name,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error(`[trigger-m365-posture-analysis] Error:`, e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
