import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

interface UserDayData {
  user_id: string;
  total_external_emails: number;
  total_external_mb: number;
  unique_domains: number;
  mean_hour: number | null;
  std_hour: number | null;
  hour_distribution: Record<string, number>;
  domains_list: string[];
}

interface BaselineStats {
  mean: number;
  std: number;
  count: number;
}

function calcBaseline(values: number[]): BaselineStats {
  if (values.length === 0) return { mean: 0, std: 0, count: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance), count: values.length };
}

function zScore(value: number, baseline: BaselineStats): number {
  if (baseline.std === 0) {
    // Fallback: if value > mean * 3, treat as high anomaly
    if (baseline.mean > 0 && value > baseline.mean * 3) return 3.5;
    if (value > baseline.mean) return 1.5;
    return 0;
  }
  return (value - baseline.mean) / baseline.std;
}

function zSeverity(z: number): 'normal' | 'medium' | 'high' | 'critical' {
  if (z >= 3.5) return 'critical';
  if (z >= 2.5) return 'high';
  if (z >= 1.5) return 'medium';
  return 'normal';
}

function pctIncrease(value: number, mean: number): number {
  if (mean === 0) return value > 0 ? 999 : 0;
  return ((value - mean) / mean) * 100;
}

function pctSeverity(pct: number): 'normal' | 'medium' | 'high' | 'critical' {
  if (pct >= 500) return 'critical';
  if (pct >= 300) return 'high';
  if (pct >= 150) return 'medium';
  return 'normal';
}

function calcRiskScore(factors: {
  zHigh: boolean; volumeHigh: boolean; newDomain: boolean;
  offHours: boolean; forwardActive: boolean; suspiciousLogin: boolean;
  unusualCountry: boolean;
}): number {
  let score = 0;
  if (factors.zHigh) score += 30;
  if (factors.volumeHigh) score += 20;
  if (factors.newDomain) score += 15;
  if (factors.unusualCountry) score += 10;
  if (factors.forwardActive) score += 15;
  if (factors.suspiciousLogin) score += 10;
  if (factors.offHours) score += 10;
  return Math.min(100, score);
}

function isExfiltration(factors: {
  zHigh: boolean; volumeHigh: boolean; newDomain: boolean;
  offHours: boolean; forwardActive: boolean; suspiciousLogin: boolean;
  mfaFailed: boolean;
}): boolean {
  const checks = [
    factors.zHigh, factors.volumeHigh, factors.newDomain,
    factors.offHours, factors.forwardActive, factors.suspiciousLogin,
    factors.mfaFailed,
  ];
  return checks.filter(Boolean).length >= 3;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tenant_record_id, client_id, snapshot_id, user_metrics, security_signals } = await req.json();

    if (!tenant_record_id || !client_id) {
      return new Response(JSON.stringify({ success: false, error: 'tenant_record_id and client_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[m365-external-movement] Processing tenant=${tenant_record_id}, users=${(user_metrics ?? []).length}`);

    const today = new Date().toISOString().split('T')[0];
    const alerts: any[] = [];

    // user_metrics: array of UserDayData from the analyzer
    const metrics: UserDayData[] = user_metrics ?? [];

    for (const um of metrics) {
      // 1. Upsert daily stats
      await supabase.from('m365_user_external_daily_stats').upsert({
        tenant_record_id,
        client_id,
        user_id: um.user_id,
        date: today,
        total_external_emails: um.total_external_emails,
        total_external_mb: um.total_external_mb,
        unique_domains: um.unique_domains,
        mean_hour: um.mean_hour,
        std_hour: um.std_hour,
        hour_distribution: um.hour_distribution,
        domains_list: um.domains_list,
      }, { onConflict: 'tenant_record_id,user_id,date' });

      // 2. Upsert domain history
      for (const domain of um.domains_list) {
        await supabase.from('m365_user_external_domain_history').upsert({
          tenant_record_id,
          client_id,
          user_id: um.user_id,
          domain,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          total_emails: 1,
          total_mb: 0,
        }, { onConflict: 'tenant_record_id,user_id,domain' });

        // Update last_seen for existing
        await supabase.from('m365_user_external_domain_history')
          .update({ last_seen: new Date().toISOString() })
          .eq('tenant_record_id', tenant_record_id)
          .eq('user_id', um.user_id)
          .eq('domain', domain);
      }

      // 3. Fetch baseline (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const { data: historyRows } = await supabase
        .from('m365_user_external_daily_stats')
        .select('total_external_emails, total_external_mb, unique_domains, mean_hour, std_hour, date')
        .eq('tenant_record_id', tenant_record_id)
        .eq('user_id', um.user_id)
        .gte('date', thirtyDaysAgo)
        .neq('date', today)
        .order('date', { ascending: false });

      const history = historyRows ?? [];

      // Skip if user has < 7 days of history
      if (history.length < 7) {
        console.log(`[m365-external-movement] Skipping ${um.user_id}: only ${history.length} days of history`);
        continue;
      }

      // Compute baselines
      const emailBaseline = calcBaseline(history.map(h => h.total_external_emails));
      const mbBaseline = calcBaseline(history.map(h => h.total_external_mb));
      const domainBaseline = calcBaseline(history.map(h => h.unique_domains));

      const emailZ = zScore(um.total_external_emails, emailBaseline);
      const mbZ = zScore(um.total_external_mb, mbBaseline);
      const emailPct = pctIncrease(um.total_external_emails, emailBaseline.mean);
      const mbPct = pctIncrease(um.total_external_mb, mbBaseline.mean);

      const maxZ = Math.max(emailZ, mbZ);
      const maxPct = Math.max(emailPct, mbPct);

      // 4. Check for new domains
      const { data: knownDomains } = await supabase
        .from('m365_user_external_domain_history')
        .select('domain')
        .eq('tenant_record_id', tenant_record_id)
        .eq('user_id', um.user_id);

      const knownSet = new Set((knownDomains ?? []).map(d => d.domain));
      const newDomains = um.domains_list.filter(d => !knownSet.has(d));
      const hasNewDomain = newDomains.length > 0;

      // 5. Off-hours detection
      const hourHistory = history.filter(h => h.mean_hour !== null);
      const hourBaseline = calcBaseline(hourHistory.map(h => h.mean_hour!));
      const isOffHours = um.mean_hour !== null && hourBaseline.count >= 7 &&
        Math.abs(um.mean_hour - hourBaseline.mean) > 2 * (hourBaseline.std || 2);

      // 6. Security signals (passed from analyzer)
      const signals = security_signals?.[um.user_id] ?? {};
      const hasForward = !!signals.forward_active;
      const hasSuspiciousLogin = !!signals.suspicious_login;
      const hasMfaFailed = !!signals.mfa_failed;

      const volumeHigh = um.total_external_mb > 500;
      const zHigh = maxZ >= 3;

      // Risk score
      const riskScore = calcRiskScore({
        zHigh,
        volumeHigh,
        newDomain: hasNewDomain,
        offHours: isOffHours,
        forwardActive: hasForward,
        suspiciousLogin: hasSuspiciousLogin,
        unusualCountry: false,
      });

      // Exfiltration check
      const exfiltrationDetected = isExfiltration({
        zHigh,
        volumeHigh,
        newDomain: hasNewDomain,
        offHours: isOffHours,
        forwardActive: hasForward,
        suspiciousLogin: hasSuspiciousLogin,
        mfaFailed: hasMfaFailed,
      });

      const baseEvidence = {
        email_z: emailZ.toFixed(2),
        mb_z: mbZ.toFixed(2),
        email_pct: emailPct.toFixed(0),
        mb_pct: mbPct.toFixed(0),
        emails_today: um.total_external_emails,
        mb_today: um.total_external_mb,
        email_baseline_mean: emailBaseline.mean.toFixed(1),
        mb_baseline_mean: mbBaseline.mean.toFixed(1),
        domains_today: um.unique_domains,
      };

      // Generate alerts
      if (exfiltrationDetected) {
        alerts.push({
          tenant_record_id, client_id, snapshot_id,
          user_id: um.user_id,
          alert_type: 'exfiltration',
          severity: 'critical',
          title: `Possível Exfiltração Detectada — ${um.user_id}`,
          description: `Múltiplos indicadores de exfiltração detectados: Z-score=${maxZ.toFixed(1)}, Volume=${um.total_external_mb.toFixed(0)}MB, ${hasNewDomain ? 'novos domínios' : ''}, ${isOffHours ? 'fora do horário' : ''}.`,
          risk_score: Math.max(riskScore, 81),
          z_score: maxZ,
          pct_increase: maxPct,
          is_new: false,
          is_anomalous: true,
          affected_domains: newDomains.length > 0 ? newDomains : um.domains_list.slice(0, 5),
          evidence: { ...baseEvidence, forward_active: hasForward, suspicious_login: hasSuspiciousLogin, mfa_failed: hasMfaFailed },
        });
      } else {
        // High volume alert
        const volSev = zSeverity(maxZ);
        const pctSev = pctSeverity(maxPct);
        const finalSev = volSev === 'critical' || pctSev === 'critical' ? 'critical'
          : volSev === 'high' || pctSev === 'high' ? 'high'
          : 'medium';

        if (volSev !== 'normal' || pctSev !== 'normal') {
          alerts.push({
            tenant_record_id, client_id, snapshot_id,
            user_id: um.user_id,
            alert_type: 'high_volume',
            severity: finalSev,
            title: `Alto Volume Externo — ${um.user_id}`,
            description: `Volume de envio externo ${emailPct.toFixed(0)}% acima do baseline (Z=${maxZ.toFixed(1)}).`,
            risk_score: riskScore,
            z_score: maxZ,
            pct_increase: maxPct,
            is_new: false,
            is_anomalous: maxZ >= 2.5,
            affected_domains: um.domains_list.slice(0, 5),
            evidence: baseEvidence,
          });
        }

        // New domain alert
        if (hasNewDomain) {
          alerts.push({
            tenant_record_id, client_id, snapshot_id,
            user_id: um.user_id,
            alert_type: 'new_domain',
            severity: newDomains.length >= 3 ? 'high' : 'medium',
            title: `Novo Domínio Externo — ${um.user_id}`,
            description: `${newDomains.length} domínio(s) externo(s) nunca utilizados: ${newDomains.slice(0, 3).join(', ')}.`,
            risk_score: Math.min(riskScore, 60),
            z_score: null,
            pct_increase: null,
            is_new: true,
            is_anomalous: false,
            affected_domains: newDomains,
            evidence: { new_domains: newDomains },
          });
        }

        // Off-hours alert
        if (isOffHours) {
          alerts.push({
            tenant_record_id, client_id, snapshot_id,
            user_id: um.user_id,
            alert_type: 'off_hours',
            severity: zHigh ? 'high' : 'medium',
            title: `Envio Fora do Horário Padrão — ${um.user_id}`,
            description: `Envio às ${um.mean_hour?.toFixed(0)}h, fora do padrão (${hourBaseline.mean.toFixed(0)}h ± ${(hourBaseline.std * 2).toFixed(0)}h).`,
            risk_score: Math.min(riskScore, 50),
            z_score: null,
            pct_increase: null,
            is_new: false,
            is_anomalous: true,
            affected_domains: um.domains_list.slice(0, 3),
            evidence: { mean_hour_today: um.mean_hour, baseline_mean_hour: hourBaseline.mean.toFixed(1), baseline_std_hour: hourBaseline.std.toFixed(1) },
          });
        }

        // Forward alert
        if (hasForward) {
          alerts.push({
            tenant_record_id, client_id, snapshot_id,
            user_id: um.user_id,
            alert_type: 'external_forward',
            severity: 'high',
            title: `Forward Externo Recente — ${um.user_id}`,
            description: `Regra de encaminhamento externo ativa detectada para o usuário.`,
            risk_score: Math.min(riskScore, 70),
            z_score: null,
            pct_increase: null,
            is_new: false,
            is_anomalous: false,
            affected_domains: [],
            evidence: { forward_active: true },
          });
        }
      }
    }

    // Clear old alerts for this tenant (keep last 48h)
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('m365_external_movement_alerts')
      .delete()
      .eq('tenant_record_id', tenant_record_id)
      .lt('created_at', cutoff48h);

    // Insert new alerts
    if (alerts.length > 0) {
      const { error: insertError } = await supabase
        .from('m365_external_movement_alerts')
        .insert(alerts);

      if (insertError) {
        console.error('[m365-external-movement] Insert alerts error:', insertError);
      }
    }

    console.log(`[m365-external-movement] Done: ${alerts.length} alerts generated for ${metrics.length} users`);

    return new Response(
      JSON.stringify({ success: true, alerts_count: alerts.length, users_processed: metrics.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[m365-external-movement] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
