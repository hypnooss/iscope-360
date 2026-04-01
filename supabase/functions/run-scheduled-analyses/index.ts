import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

const AGENT_OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

type SupabaseClient = ReturnType<typeof createClient>;
type SectionResult = { triggered: number; skipped: number; errors: number; total: number };

/**
 * Deterministic stagger offset based on schedule ID.
 * Returns 0-14 minutes to stay within the 15-minute cron window.
 */
function getStaggerOffsetMinutes(scheduleId: string): number {
  let hash = 0;
  for (let i = 0; i < scheduleId.length; i++) {
    hash = ((hash << 5) - hash) + scheduleId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 15;
}

/**
 * Get the UTC offset in hours for a given IANA timezone.
 * Uses Intl.DateTimeFormat to dynamically resolve offset (handles DST).
 */
function getUtcOffsetHours(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(now);
  const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
  const match = offsetStr.match(/GMT([+-]?\d+)?(?::(\d+))?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  return hours + (hours >= 0 ? minutes / 60 : -minutes / 60);
}

function calculateNextRunAt(
  frequency: string,
  hour: number, // stored in the schedule's timezone
  dayOfWeek: number,
  dayOfMonth: number,
  scheduleId: string,
  timezone: string = 'America/Sao_Paulo'
): string {
  const now = new Date();
  const offset = getStaggerOffsetMinutes(scheduleId);
  const offsetHours = getUtcOffsetHours(timezone);
  const utcHourRaw = hour - offsetHours;
  const utcHour = ((Math.floor(utcHourRaw) % 24) + 24) % 24;
  const dayOff = utcHourRaw < 0 ? -1 : utcHourRaw >= 24 ? 1 : 0;
  let next: Date;

  if (frequency === 'hourly') {
    next = new Date(now);
    next.setUTCMinutes(offset, 0, 0);
    next.setUTCHours(next.getUTCHours() + 1);
  } else if (frequency === 'daily') {
    next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOff, utcHour, offset, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  } else if (frequency === 'weekly') {
    next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOff, utcHour, offset, 0));
    const currentDay = next.getUTCDay();
    let daysAhead = dayOfWeek - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    next.setUTCDate(next.getUTCDate() + daysAhead);
  } else {
    next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dayOfMonth + dayOff, utcHour, offset, 0));
    if (next <= now) next.setUTCMonth(next.getUTCMonth() + 1);
  }

  return next.toISOString();
}

async function isAgentOnline(supabase: SupabaseClient, agentId: string | null): Promise<{ online: boolean; agentName?: string; lastSeen?: string }> {
  if (!agentId) return { online: false, agentName: 'N/A', lastSeen: 'never' };
  
  const { data: agent } = await supabase
    .from('agents')
    .select('name, last_seen')
    .eq('id', agentId)
    .single();
  
  if (!agent) return { online: false, agentName: 'unknown', lastSeen: 'never' };
  
  const lastSeen = agent.last_seen ? new Date(agent.last_seen).getTime() : 0;
  const online = (Date.now() - lastSeen) <= AGENT_OFFLINE_THRESHOLD_MS;
  
  return { online, agentName: agent.name, lastSeen: agent.last_seen || 'never' };
}

// ========================================================
// Section processors — each runs independently
// ========================================================

async function processFirewallComplianceSchedules(supabase: SupabaseClient, supabaseUrl: string, serviceKey: string): Promise<SectionResult> {
  const result: SectionResult = { triggered: 0, skipped: 0, errors: 0, total: 0 };

  const { data: dueSchedules, error: fetchError } = await supabase
    .from('analysis_schedules')
    .select('id, firewall_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month, next_run_at, timezone')
    .eq('is_active', true)
    .not('frequency', 'eq', 'manual')
    .or(`next_run_at.lte.${new Date().toISOString()},next_run_at.is.null`);

  if (fetchError) {
    console.error('[run-scheduled-analyses][FW] Error fetching schedules:', fetchError);
    return result;
  }

  result.total = dueSchedules?.length ?? 0;
  if (!dueSchedules || dueSchedules.length === 0) {
    console.log('[run-scheduled-analyses][FW] No firewall schedules due.');
    return result;
  }

  console.log(`[run-scheduled-analyses][FW] Found ${dueSchedules.length} schedule(s) due.`);

  for (const schedule of dueSchedules) {
    try {
      const nextRunAt = calculateNextRunAt(
        schedule.frequency, schedule.scheduled_hour ?? 0,
        schedule.scheduled_day_of_week ?? 1, schedule.scheduled_day_of_month ?? 1,
        schedule.id, schedule.timezone ?? 'America/Sao_Paulo'
      );

      if (!schedule.next_run_at) {
        await supabase.from('analysis_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
        console.log(`[run-scheduled-analyses][FW] Recalculated next_run_at for ${schedule.id}: ${nextRunAt}`);
        continue;
      }

      const { data: fw } = await supabase.from('firewalls').select('agent_id, name').eq('id', schedule.firewall_id).single();
      const agentStatus = await isAgentOnline(supabase, fw?.agent_id || null);

      if (!agentStatus.online) {
        console.log(`[run-scheduled-analyses][FW] Skipping ${fw?.name || schedule.firewall_id}: agent ${agentStatus.agentName} offline`);
        result.skipped++;
      } else {
        const triggerUrl = `${supabaseUrl}/functions/v1/trigger-firewall-analysis`;
        const response = await fetch(triggerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ firewall_id: schedule.firewall_id }),
        });
        const res = await response.json();
        if (res.success || response.status === 409 || res.code === 'ALREADY_RUNNING') {
          console.log(`[run-scheduled-analyses][FW] Triggered ${schedule.firewall_id}: ${res.message || 'success'}`);
          result.triggered++;
        } else {
          console.error(`[run-scheduled-analyses][FW] Failed ${schedule.firewall_id}:`, res.error);
          result.errors++;
        }
      }

      await supabase.from('analysis_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
    } catch (err) {
      console.error(`[run-scheduled-analyses][FW] Error processing ${schedule.id}:`, err);
      result.errors++;
    }
  }

  console.log(`[run-scheduled-analyses][FW] Done. Triggered: ${result.triggered}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
  return result;
}

async function processExternalDomainSchedules(supabase: SupabaseClient, supabaseUrl: string, serviceKey: string): Promise<SectionResult> {
  const result: SectionResult = { triggered: 0, skipped: 0, errors: 0, total: 0 };

  const { data: dueSchedules, error: fetchError } = await supabase
    .from('external_domain_schedules')
    .select('id, domain_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month, next_run_at, timezone')
    .eq('is_active', true)
    .not('frequency', 'eq', 'manual')
    .or(`next_run_at.lte.${new Date().toISOString()},next_run_at.is.null`);

  if (fetchError) {
    console.error('[run-scheduled-analyses][Domain] Error fetching schedules:', fetchError);
    return result;
  }

  result.total = dueSchedules?.length ?? 0;
  if (!dueSchedules || dueSchedules.length === 0) {
    console.log('[run-scheduled-analyses][Domain] No domain schedules due.');
    return result;
  }

  console.log(`[run-scheduled-analyses][Domain] Found ${dueSchedules.length} schedule(s) due.`);

  for (const schedule of dueSchedules) {
    try {
      const nextRunAt = calculateNextRunAt(
        schedule.frequency, schedule.scheduled_hour ?? 0,
        schedule.scheduled_day_of_week ?? 1, schedule.scheduled_day_of_month ?? 1,
        schedule.id, schedule.timezone ?? 'America/Sao_Paulo'
      );

      if (!schedule.next_run_at) {
        await supabase.from('external_domain_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
        console.log(`[run-scheduled-analyses][Domain] Recalculated next_run_at for ${schedule.id}: ${nextRunAt}`);
        continue;
      }

      const { data: dom } = await supabase.from('external_domains').select('agent_id, domain').eq('id', schedule.domain_id).single();
      const agentStatus = await isAgentOnline(supabase, dom?.agent_id || null);

      if (!agentStatus.online) {
        console.log(`[run-scheduled-analyses][Domain] Skipping ${dom?.domain || schedule.domain_id}: agent ${agentStatus.agentName} offline`);
        result.skipped++;
      } else {
        const triggerUrl = `${supabaseUrl}/functions/v1/trigger-external-domain-analysis`;
        const response = await fetch(triggerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ domain_id: schedule.domain_id }),
        });
        const res = await response.json();
        if (res.success || response.status === 409 || res.code === 'ALREADY_RUNNING') {
          console.log(`[run-scheduled-analyses][Domain] Triggered ${schedule.domain_id}: ${res.message || 'success'}`);
          result.triggered++;
        } else {
          console.error(`[run-scheduled-analyses][Domain] Failed ${schedule.domain_id}:`, res.error);
          result.errors++;
        }
      }

      await supabase.from('external_domain_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
    } catch (err) {
      console.error(`[run-scheduled-analyses][Domain] Error processing ${schedule.id}:`, err);
      result.errors++;
    }
  }

  console.log(`[run-scheduled-analyses][Domain] Done. Triggered: ${result.triggered}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
  return result;
}

async function processAnalyzerSchedules(supabase: SupabaseClient, supabaseUrl: string, serviceKey: string): Promise<SectionResult> {
  const result: SectionResult = { triggered: 0, skipped: 0, errors: 0, total: 0 };

  const { data: dueSchedules, error: fetchError } = await supabase
    .from('analyzer_schedules')
    .select('id, firewall_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month, next_run_at, timezone')
    .eq('is_active', true)
    .not('frequency', 'eq', 'manual')
    .or(`next_run_at.lte.${new Date().toISOString()},next_run_at.is.null`);

  if (fetchError) {
    console.error('[run-scheduled-analyses][Analyzer] Error fetching schedules:', fetchError);
    return result;
  }

  result.total = dueSchedules?.length ?? 0;
  if (!dueSchedules || dueSchedules.length === 0) {
    console.log('[run-scheduled-analyses][Analyzer] No analyzer schedules due.');
    return result;
  }

  console.log(`[run-scheduled-analyses][Analyzer] Found ${dueSchedules.length} schedule(s) due.`);

  for (const schedule of dueSchedules) {
    try {
      const nextRunAt = calculateNextRunAt(
        schedule.frequency, schedule.scheduled_hour ?? 0,
        schedule.scheduled_day_of_week ?? 1, schedule.scheduled_day_of_month ?? 1,
        schedule.id, schedule.timezone ?? 'America/Sao_Paulo'
      );

      if (!schedule.next_run_at) {
        await supabase.from('analyzer_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
        console.log(`[run-scheduled-analyses][Analyzer] Recalculated next_run_at for ${schedule.id}: ${nextRunAt}`);
        continue;
      }

      const { data: fw } = await supabase.from('firewalls').select('agent_id, name').eq('id', schedule.firewall_id).single();
      const agentStatus = await isAgentOnline(supabase, fw?.agent_id || null);

      if (!agentStatus.online) {
        console.log(`[run-scheduled-analyses][Analyzer] Skipping ${fw?.name || schedule.firewall_id}: agent ${agentStatus.agentName} offline`);
        result.skipped++;
      } else {
        const triggerUrl = `${supabaseUrl}/functions/v1/trigger-firewall-analyzer`;
        const response = await fetch(triggerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ firewall_id: schedule.firewall_id }),
        });
        const res = await response.json();
        if (res.success || response.status === 409 || res.code === 'ALREADY_RUNNING') {
          result.triggered++;
        } else {
          result.errors++;
        }
      }

      await supabase.from('analyzer_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
    } catch (err) {
      console.error(`[run-scheduled-analyses][Analyzer] Error:`, err);
      result.errors++;
    }
  }

  console.log(`[run-scheduled-analyses][Analyzer] Done. Triggered: ${result.triggered}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
  return result;
}

async function processAttackSurfaceSchedules(supabase: SupabaseClient, supabaseUrl: string, serviceKey: string): Promise<SectionResult> {
  const result: SectionResult = { triggered: 0, skipped: 0, errors: 0, total: 0 };

  const { data: dueSchedules, error: fetchError } = await supabase
    .from('attack_surface_schedules')
    .select('id, client_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month, next_run_at, timezone')
    .eq('is_active', true)
    .not('frequency', 'eq', 'manual')
    .or(`next_run_at.lte.${new Date().toISOString()},next_run_at.is.null`);

  if (fetchError) {
    console.error('[run-scheduled-analyses][AttackSurface] Error fetching schedules:', fetchError);
    return result;
  }

  result.total = dueSchedules?.length ?? 0;
  if (!dueSchedules || dueSchedules.length === 0) {
    console.log('[run-scheduled-analyses][AttackSurface] No schedules due.');
    return result;
  }

  console.log(`[run-scheduled-analyses][AttackSurface] Found ${dueSchedules.length} schedule(s) due.`);

  for (const schedule of dueSchedules) {
    try {
      const nextRunAt = calculateNextRunAt(
        schedule.frequency, schedule.scheduled_hour ?? 0,
        schedule.scheduled_day_of_week ?? 1, schedule.scheduled_day_of_month ?? 1,
        schedule.id, schedule.timezone ?? 'America/Sao_Paulo'
      );

      if (!schedule.next_run_at) {
        await supabase.from('attack_surface_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
        console.log(`[run-scheduled-analyses][AttackSurface] Recalculated next_run_at for ${schedule.id}: ${nextRunAt}`);
        continue;
      }

      const triggerUrl = `${supabaseUrl}/functions/v1/run-attack-surface-queue`;
      const response = await fetch(triggerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ client_id: schedule.client_id }),
      });
      const res = await response.json();
      if (res.success || response.status === 409) {
        console.log(`[run-scheduled-analyses][AttackSurface] Triggered client ${schedule.client_id}: ${res.message || 'success'}`);
        result.triggered++;
      } else {
        console.error(`[run-scheduled-analyses][AttackSurface] Failed client ${schedule.client_id}:`, res.error);
        result.errors++;
      }

      await supabase.from('attack_surface_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
    } catch (err) {
      console.error(`[run-scheduled-analyses][AttackSurface] Error:`, err);
      result.errors++;
    }
  }

  console.log(`[run-scheduled-analyses][AttackSurface] Done. Triggered: ${result.triggered}, Errors: ${result.errors}`);
  return result;
}

async function processM365AnalyzerSchedules(supabase: SupabaseClient, supabaseUrl: string, serviceKey: string): Promise<SectionResult> {
  const result: SectionResult = { triggered: 0, skipped: 0, errors: 0, total: 0 };

  const { data: dueSchedules, error: fetchError } = await supabase
    .from('m365_analyzer_schedules')
    .select('id, tenant_record_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month, next_run_at, timezone')
    .eq('is_active', true)
    .not('frequency', 'eq', 'manual')
    .or(`next_run_at.lte.${new Date().toISOString()},next_run_at.is.null`);

  if (fetchError) {
    console.error('[run-scheduled-analyses][M365Analyzer] Error fetching schedules:', fetchError);
    return result;
  }

  result.total = dueSchedules?.length ?? 0;
  if (!dueSchedules || dueSchedules.length === 0) {
    console.log('[run-scheduled-analyses][M365Analyzer] No schedules due.');
    return result;
  }

  console.log(`[run-scheduled-analyses][M365Analyzer] Found ${dueSchedules.length} schedule(s) due.`);

  for (const schedule of dueSchedules) {
    try {
      const nextRunAt = calculateNextRunAt(
        schedule.frequency, schedule.scheduled_hour ?? 0,
        schedule.scheduled_day_of_week ?? 1, schedule.scheduled_day_of_month ?? 1,
        schedule.id, schedule.timezone ?? 'America/Sao_Paulo'
      );

      if (!schedule.next_run_at) {
        await supabase.from('m365_analyzer_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
        console.log(`[run-scheduled-analyses][M365Analyzer] Recalculated next_run_at for ${schedule.id}: ${nextRunAt}`);
        continue;
      }

      const { data: tenantAgent } = await supabase
        .from('m365_tenant_agents')
        .select('agent_id')
        .eq('tenant_record_id', schedule.tenant_record_id)
        .eq('enabled', true)
        .limit(1)
        .maybeSingle();

      const agentStatus = await isAgentOnline(supabase, tenantAgent?.agent_id || null);

      if (!agentStatus.online) {
        console.log(`[run-scheduled-analyses][M365Analyzer] Skipping tenant ${schedule.tenant_record_id}: agent ${agentStatus.agentName} offline`);
        result.skipped++;
      } else {
        const triggerUrl = `${supabaseUrl}/functions/v1/trigger-m365-analyzer`;
        const response = await fetch(triggerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ tenant_record_id: schedule.tenant_record_id }),
        });
        const res = await response.json();
        if (res.success || response.status === 409 || res.code === 'ALREADY_RUNNING') {
          console.log(`[run-scheduled-analyses][M365Analyzer] Triggered tenant ${schedule.tenant_record_id}`);
          result.triggered++;

          // Also trigger all dashboard refreshes in parallel
          const dashboardFunctions = ['exchange-dashboard', 'entra-id-dashboard', 'collaboration-dashboard'];
          await Promise.all(dashboardFunctions.map(async (fnName) => {
            try {
              const dashUrl = `${supabaseUrl}/functions/v1/${fnName}`;
              const dashResp = await fetch(dashUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
                body: JSON.stringify({ tenant_record_id: schedule.tenant_record_id }),
              });
              const dashResult = await dashResp.json();
              if (!dashResult.success) {
                console.warn(`[run-scheduled-analyses][M365Analyzer] ${fnName} first attempt failed, retrying...`);
                const retryResp = await fetch(dashUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
                  body: JSON.stringify({ tenant_record_id: schedule.tenant_record_id }),
                });
                const retryResult = await retryResp.json();
                if (retryResult.success) {
                  console.log(`[run-scheduled-analyses][M365Analyzer] ${fnName} succeeded on retry`);
                } else {
                  console.error(`[run-scheduled-analyses][M365Analyzer] ${fnName} failed after retry:`, retryResult.error);
                }
              } else {
                console.log(`[run-scheduled-analyses][M365Analyzer] ${fnName} succeeded`);
              }
            } catch (e) {
              console.error(`[run-scheduled-analyses][M365Analyzer] ${fnName} error:`, e);
            }
          }));
        } else {
          console.error(`[run-scheduled-analyses][M365Analyzer] Failed tenant ${schedule.tenant_record_id}:`, res.error);
          result.errors++;
        }
      }

      await supabase.from('m365_analyzer_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
    } catch (err) {
      console.error(`[run-scheduled-analyses][M365Analyzer] Error:`, err);
      result.errors++;
    }
  }

  console.log(`[run-scheduled-analyses][M365Analyzer] Done. Triggered: ${result.triggered}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
  return result;
}

async function processM365ComplianceSchedules(supabase: SupabaseClient, supabaseUrl: string, serviceKey: string): Promise<SectionResult> {
  const result: SectionResult = { triggered: 0, skipped: 0, errors: 0, total: 0 };

  const { data: dueSchedules, error: fetchError } = await supabase
    .from('m365_compliance_schedules')
    .select('id, tenant_record_id, frequency, scheduled_hour, scheduled_day_of_week, scheduled_day_of_month, next_run_at, timezone')
    .eq('is_active', true)
    .not('frequency', 'eq', 'manual')
    .or(`next_run_at.lte.${new Date().toISOString()},next_run_at.is.null`);

  if (fetchError) {
    console.error('[run-scheduled-analyses][M365Compliance] Error fetching schedules:', fetchError);
    return result;
  }

  result.total = dueSchedules?.length ?? 0;
  if (!dueSchedules || dueSchedules.length === 0) {
    console.log('[run-scheduled-analyses][M365Compliance] No schedules due.');
    return result;
  }

  console.log(`[run-scheduled-analyses][M365Compliance] Found ${dueSchedules.length} schedule(s) due.`);

  for (const schedule of dueSchedules) {
    try {
      const nextRunAt = calculateNextRunAt(
        schedule.frequency, schedule.scheduled_hour ?? 0,
        schedule.scheduled_day_of_week ?? 1, schedule.scheduled_day_of_month ?? 1,
        schedule.id, schedule.timezone ?? 'America/Sao_Paulo'
      );

      if (!schedule.next_run_at) {
        await supabase.from('m365_compliance_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
        console.log(`[run-scheduled-analyses][M365Compliance] Recalculated next_run_at for ${schedule.id}: ${nextRunAt}`);
        continue;
      }

      const { data: tenantAgent } = await supabase
        .from('m365_tenant_agents')
        .select('agent_id')
        .eq('tenant_record_id', schedule.tenant_record_id)
        .eq('enabled', true)
        .limit(1)
        .maybeSingle();

      const agentStatus = await isAgentOnline(supabase, tenantAgent?.agent_id || null);
      let triggerSuccess = false;

      if (!agentStatus.online) {
        console.log(`[run-scheduled-analyses][M365Compliance] Skipping tenant ${schedule.tenant_record_id}: agent offline`);
        result.skipped++;
        triggerSuccess = true; // advance schedule to avoid infinite retry
      } else {
        const triggerUrl = `${supabaseUrl}/functions/v1/trigger-m365-posture-analysis`;
        const response = await fetch(triggerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ tenant_record_id: schedule.tenant_record_id }),
        });
        const res = await response.json();
        if (res.success || response.status === 409) {
          console.log(`[run-scheduled-analyses][M365Compliance] Triggered tenant ${schedule.tenant_record_id}`);
          result.triggered++;
          triggerSuccess = true;
        } else {
          console.error(`[run-scheduled-analyses][M365Compliance] Failed tenant ${schedule.tenant_record_id}:`, res.error);
          result.errors++;
        }
      }

      if (triggerSuccess) {
        await supabase.from('m365_compliance_schedules').update({ next_run_at: nextRunAt }).eq('id', schedule.id);
      } else {
        console.warn(`[run-scheduled-analyses][M365Compliance] Keeping next_run_at for retry (trigger failed for ${schedule.tenant_record_id})`);
      }
    } catch (err) {
      console.error(`[run-scheduled-analyses][M365Compliance] Error:`, err);
      result.errors++;
    }
  }

  console.log(`[run-scheduled-analyses][M365Compliance] Done. Triggered: ${result.triggered}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
  return result;
}

// ========================================================
// Main handler
// ========================================================

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[run-scheduled-analyses] Starting scheduled analysis check...');

    // Cleanup stuck/timed-out tasks before dispatching new ones
    const { error: cleanupError } = await supabase.rpc('cleanup_stuck_tasks');
    if (cleanupError) {
      console.error('[run-scheduled-analyses] cleanup_stuck_tasks error:', cleanupError);
    }

    // Process all 6 sections IN PARALLEL
    const [fwResult, domainResult, analyzerResult, attackResult, m365AnalyzerResult, m365ComplianceResult] = await Promise.all([
      processFirewallComplianceSchedules(supabase, supabaseUrl, supabaseServiceKey),
      processExternalDomainSchedules(supabase, supabaseUrl, supabaseServiceKey),
      processAnalyzerSchedules(supabase, supabaseUrl, supabaseServiceKey),
      processAttackSurfaceSchedules(supabase, supabaseUrl, supabaseServiceKey),
      processM365AnalyzerSchedules(supabase, supabaseUrl, supabaseServiceKey),
      processM365ComplianceSchedules(supabase, supabaseUrl, supabaseServiceKey),
    ]);

    // CVE Cache Refresh (sequential, after all schedules)
    let cveRefreshSuccess = false;
    try {
      console.log('[run-scheduled-analyses] Triggering CVE cache refresh...');
      const cveRes = await fetch(`${supabaseUrl}/functions/v1/refresh-cve-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({}),
      });
      const cveResult = await cveRes.json();
      cveRefreshSuccess = !!cveResult.success;
      console.log(`[run-scheduled-analyses] CVE refresh: ${cveRefreshSuccess ? 'success' : 'failed'}`);
    } catch (err) {
      console.error('[run-scheduled-analyses] CVE refresh error:', err);
    }

    const totalTriggered = fwResult.triggered + domainResult.triggered + analyzerResult.triggered + attackResult.triggered + m365AnalyzerResult.triggered + m365ComplianceResult.triggered;
    const totalErrors = fwResult.errors + domainResult.errors + analyzerResult.errors + attackResult.errors + m365AnalyzerResult.errors + m365ComplianceResult.errors;
    const totalSkipped = fwResult.skipped + domainResult.skipped + analyzerResult.skipped + m365AnalyzerResult.skipped + m365ComplianceResult.skipped;

    console.log(`[run-scheduled-analyses] Done. Triggered: ${totalTriggered}, Skipped (offline): ${totalSkipped}, Errors: ${totalErrors}`);
    console.log(`[run-scheduled-analyses] Breakdown — Firewalls: ${fwResult.triggered}/${fwResult.skipped}skip, Domains: ${domainResult.triggered}/${domainResult.skipped}skip, Analyzers: ${analyzerResult.triggered}/${analyzerResult.skipped}skip, AttackSurface: ${attackResult.triggered}, M365Analyzer: ${m365AnalyzerResult.triggered}/${m365AnalyzerResult.skipped}skip, M365Compliance: ${m365ComplianceResult.triggered}/${m365ComplianceResult.skipped}skip, CVE: ${cveRefreshSuccess}`);

    return new Response(
      JSON.stringify({
        success: true,
        triggered: totalTriggered,
        skipped_offline: totalSkipped,
        errors: totalErrors,
        firewalls: { triggered: fwResult.triggered, skipped: fwResult.skipped, errors: fwResult.errors, total: fwResult.total },
        domains: { triggered: domainResult.triggered, skipped: domainResult.skipped, errors: domainResult.errors, total: domainResult.total },
        analyzers: { triggered: analyzerResult.triggered, skipped: analyzerResult.skipped, errors: analyzerResult.errors, total: analyzerResult.total },
        attack_surface: { triggered: attackResult.triggered, errors: attackResult.errors, total: attackResult.total },
        m365_analyzer: { triggered: m365AnalyzerResult.triggered, skipped: m365AnalyzerResult.skipped, errors: m365AnalyzerResult.errors, total: m365AnalyzerResult.total },
        m365_compliance: { triggered: m365ComplianceResult.triggered, skipped: m365ComplianceResult.skipped, errors: m365ComplianceResult.errors, total: m365ComplianceResult.total },
        cve_refresh: cveRefreshSuccess,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[run-scheduled-analyses] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
