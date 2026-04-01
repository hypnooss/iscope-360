import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================
// Types
// ============================================

interface M365AnalyzerInsight {
  id: string;
  category: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status?: 'pass' | 'fail';
  details?: string;
  affectedUsers?: string[];
  count?: number;
  recommendation?: string;
  metadata?: Record<string, any>;
}

interface GraphTokenResult {
  access_token: string;
  expires_in: number;
}

// ============================================
// Robust normalizer for step results
// ============================================

function normalizeStepData(raw: unknown): any[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try { return normalizeStepData(JSON.parse(raw)); } catch { return []; }
  }
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, any>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.value)) return obj.value;
    if (Array.isArray(obj.results)) return obj.results;
    if (Array.isArray(obj.Result)) return obj.Result;
    return [obj];
  }
  return [];
}

// ============================================
// PowerShell size string parser
// ============================================

function parseSizeToBytes(sizeStr: unknown): number {
  if (typeof sizeStr === 'number') return sizeStr;
  if (typeof sizeStr !== 'string' || !sizeStr) return 0;

  // Try "(1,234,567 bytes)" pattern first
  const bytesMatch = sizeStr.match(/\(([0-9,.]+)\s*bytes\)/i);
  if (bytesMatch) {
    return parseInt(bytesMatch[1].replace(/[,.\s]/g, ''), 10) || 0;
  }

  // Try "1.234 GB" / "500 MB" / "100 KB" pattern
  const unitMatch = sizeStr.match(/([\d,.]+)\s*(TB|GB|MB|KB|B)/i);
  if (unitMatch) {
    const val = parseFloat(unitMatch[1].replace(',', '.'));
    const unit = unitMatch[2].toUpperCase();
    const multipliers: Record<string, number> = {
      B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4,
    };
    return Math.round(val * (multipliers[unit] || 1));
  }

  // "Unlimited"
  if (sizeStr.toLowerCase().includes('unlimited')) return 0;

  return 0;
}

// ============================================
// Graph API Helper
// ============================================

// Decrypt AES-256-GCM secret (hex IV:ciphertext format used by m365_global_config)
async function decryptSecretHex(encrypted: string): Promise<string | null> {
  if (!encrypted.includes(':')) return null;
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex || keyHex.length !== 64) return null;
  try {
    const [ivHex, ctHex] = encrypted.split(':');
    const keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) keyBytes[i] = parseInt(keyHex.substr(i * 2, 2), 16);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const iv = new Uint8Array(ivHex.length / 2);
    for (let i = 0; i < iv.length; i++) iv[i] = parseInt(ivHex.substr(i * 2, 2), 16);
    const ct = new Uint8Array(ctHex.length / 2);
    for (let i = 0; i < ct.length; i++) ct[i] = parseInt(ctHex.substr(i * 2, 2), 16);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error('[m365-analyzer] Hex decryption failed:', e);
    return null;
  }
}

// Decrypt AES-GCM secret (legacy Base64 format used by m365_app_credentials)
async function decryptSecretBase64(encrypted: string): Promise<string | null> {
  const encryptionKey = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!encryptionKey) return null;
  try {
    const keyBytes = new TextEncoder().encode(encryptionKey.padEnd(32, '0').slice(0, 32));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// Unified decryption: tries hex format first, then base64 legacy
async function decryptSecret(encrypted: string): Promise<string | null> {
  if (encrypted.includes(':')) return await decryptSecretHex(encrypted);
  return await decryptSecretBase64(encrypted);
}

async function requestGraphToken(tenantId: string, clientId: string, clientSecret: string): Promise<string | null> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });
  const res = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) {
    console.error('[m365-analyzer] Token request failed:', await res.text());
    return null;
  }
  const tokenData: GraphTokenResult = await res.json();
  return tokenData.access_token;
}

async function getGraphToken(supabase: any, tenantRecordId: string): Promise<string | null> {
  const { data: tenant } = await supabase
    .from('m365_tenants')
    .select('tenant_id')
    .eq('id', tenantRecordId)
    .single();

  if (!tenant) return null;

  // Strategy 1: Per-tenant credentials (m365_app_credentials)
  const { data: cred } = await supabase
    .from('m365_app_credentials')
    .select('azure_app_id, client_secret_encrypted, auth_type')
    .eq('tenant_record_id', tenantRecordId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (cred?.client_secret_encrypted) {
    const secret = await decryptSecret(cred.client_secret_encrypted);
    if (secret) {
      console.log('[m365-analyzer] Using per-tenant credentials');
      const token = await requestGraphToken(tenant.tenant_id, cred.azure_app_id, secret);
      if (token) return token;
    }
  }

  // Strategy 2: Global multi-tenant app (m365_global_config) — same pattern as other edge functions
  const { data: globalConfig } = await supabase
    .from('m365_global_config')
    .select('app_id, client_secret_encrypted')
    .limit(1)
    .maybeSingle();

  if (globalConfig?.client_secret_encrypted && globalConfig?.app_id) {
    const secret = await decryptSecret(globalConfig.client_secret_encrypted);
    if (secret) {
      console.log('[m365-analyzer] Using global multi-tenant credentials (fallback)');
      return await requestGraphToken(tenant.tenant_id, globalConfig.app_id, secret);
    }
  }

  console.warn('[m365-analyzer] No valid credentials found for tenant', tenantRecordId);
  return null;
}

async function graphGet(token: string, url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ConsistencyLevel: 'eventual' },
    });
    if (!res.ok) {
      const errorBody = await res.text();
      console.warn(`[m365-analyzer] Graph API ${res.status}: ${url} — ${errorBody.substring(0, 300)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`[m365-analyzer] Graph fetch error for ${url}:`, e);
    return null;
  }
}

// ============================================
// Module 1: Phishing & Threats (EXO-aware)
// ============================================

function analyzePhishingThreats(
  emailActivity: any[],
  threatData: any[],
  exoAntiPhish: any[],
  exoSafeLinks: any[],
  exoSafeAttach: any[],
  exoContentFilter: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    totalBlocked: 0,
    quarantined: 0,
    topAttackedUsers: [],
    topSenderDomains: [],
  };

  // --- Graph-based threat data ---
  if (Array.isArray(threatData) && threatData.length > 0) {
    const phishingMessages = threatData.filter((t: any) =>
      (t.verdictSource || '').toLowerCase().includes('phish') ||
      (t.threatType || '').toLowerCase().includes('phish') ||
      (t.deliveryAction || '').toLowerCase().includes('blocked')
    );
    metrics.totalBlocked = phishingMessages.length;

    const userMap: Record<string, number> = {};
    for (const msg of phishingMessages) {
      const user = msg.recipientEmailAddress || msg.userPrincipalName || 'unknown';
      userMap[user] = (userMap[user] || 0) + 1;
    }
    metrics.topAttackedUsers = Object.entries(userMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([user, count]) => ({ user, count }));

    const domainMap: Record<string, number> = {};
    for (const msg of phishingMessages) {
      const sender = msg.senderAddress || msg.senderFromAddress || '';
      const domain = sender.includes('@') ? sender.split('@')[1] : sender;
      if (domain) domainMap[domain] = (domainMap[domain] || 0) + 1;
    }
    metrics.topSenderDomains = Object.entries(domainMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, count]) => ({ domain, count }));

    if (phishingMessages.length > 50) {
      insights.push({
        id: 'high_phishing_volume',
        category: 'phishing_threats',
        name: 'Alto Volume de Phishing',
        description: `${phishingMessages.length} emails de phishing detectados no período`,
        severity: phishingMessages.length > 200 ? 'critical' : 'high',
        count: phishingMessages.length,
        status: 'fail',
        recommendation: 'Revise as políticas de anti-phishing e considere treinamento de conscientização.',
      });
    } else {
      insights.push({
        id: 'phishing_volume_ok',
        category: 'phishing_threats',
        name: 'Volume de Phishing Controlado',
        description: `Apenas ${phishingMessages.length} emails de phishing detectados — dentro do esperado.`,
        severity: 'info',
        status: 'pass',
        count: phishingMessages.length,
      });
    }
  }

  // --- EXO Anti-Phish Policy analysis ---
  for (const policy of exoAntiPhish) {
    const name = policy.Name || policy.Identity || 'Default';
    const enabled = policy.Enabled !== false && policy.EnableTargetedPhishingProtection !== false;
    const spoofEnabled = policy.EnableSpoofIntelligence !== false;
    const mailboxIntelEnabled = policy.EnableMailboxIntelligenceProtection !== false;

    if (!enabled) {
      insights.push({
        id: `antiphish_disabled_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'phishing_threats',
        name: 'Política Anti-Phishing Desabilitada',
        description: `A política "${name}" está desabilitada, expondo o tenant a ataques de phishing`,
        severity: 'critical',
        recommendation: 'Habilite a política anti-phishing imediatamente.',
        metadata: { policyName: name },
      });
    }

    if (enabled && !spoofEnabled) {
      insights.push({
        id: `antiphish_nospoof_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'phishing_threats',
        name: 'Spoof Intelligence Desabilitado',
        description: `A política "${name}" não tem Spoof Intelligence ativado`,
        severity: 'high',
        recommendation: 'Ative Spoof Intelligence para detectar emails falsificados.',
      });
    }

    if (enabled && !mailboxIntelEnabled) {
      insights.push({
        id: `antiphish_nomailboxintel_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'phishing_threats',
        name: 'Mailbox Intelligence Desabilitado',
        description: `A política "${name}" não tem Mailbox Intelligence Protection ativado`,
        severity: 'medium',
        recommendation: 'Ative Mailbox Intelligence para melhorar detecção de ameaças.',
      });
    }
  }

  // --- Safe Links ---
  let safeLinksOk = true;
  if (exoSafeLinks.length === 0) {
    safeLinksOk = false;
    insights.push({
      id: 'safe_links_missing',
      category: 'phishing_threats',
      name: 'Safe Links Não Configurado',
      description: 'Nenhuma política de Safe Links encontrada. URLs maliciosas não serão verificadas.',
      severity: 'high',
      status: 'fail',
      recommendation: 'Configure políticas de Safe Links no Microsoft Defender for Office 365.',
    });
  } else {
    for (const policy of exoSafeLinks) {
      const name = policy.Name || policy.Identity || 'Default';
      if (policy.EnableSafeLinksForEmail === false) {
        safeLinksOk = false;
        insights.push({
          id: `safe_links_disabled_${name.replace(/[^a-z0-9]/gi, '_')}`,
          category: 'phishing_threats',
          name: 'Safe Links Desabilitado para Email',
          description: `Safe Links desabilitado na política "${name}"`,
          severity: 'high',
          status: 'fail',
          recommendation: 'Habilite Safe Links para proteção contra URLs maliciosas.',
        });
      }
    }
  }
  if (safeLinksOk) {
    insights.push({
      id: 'safe_links_ok',
      category: 'phishing_threats',
      name: 'Safe Links Configurado Corretamente',
      description: 'Todas as políticas de Safe Links estão habilitadas e protegendo contra URLs maliciosas.',
      severity: 'info',
      status: 'pass',
    });
  }

  // --- Safe Attachments ---
  let safeAttachOk = true;
  if (exoSafeAttach.length === 0) {
    safeAttachOk = false;
    insights.push({
      id: 'safe_attachments_missing',
      category: 'phishing_threats',
      name: 'Safe Attachments Não Configurado',
      description: 'Nenhuma política de Safe Attachments encontrada. Anexos maliciosos não serão verificados.',
      severity: 'high',
      status: 'fail',
      recommendation: 'Configure políticas de Safe Attachments no Microsoft Defender for Office 365.',
    });
  } else {
    for (const policy of exoSafeAttach) {
      const name = policy.Name || policy.Identity || 'Default';
      const action = (policy.Action || '').toLowerCase();
      if (action === 'allow' || policy.Enable === false) {
        safeAttachOk = false;
        insights.push({
          id: `safe_attach_weak_${name.replace(/[^a-z0-9]/gi, '_')}`,
          category: 'phishing_threats',
          name: 'Safe Attachments com Ação Fraca',
          description: `Política "${name}" configurada como "${action}" — anexos maliciosos podem passar`,
          severity: 'high',
          status: 'fail',
          recommendation: 'Configure a ação para "Block" ou "Replace" para proteção adequada.',
        });
      }
    }
  }
  if (safeAttachOk) {
    insights.push({
      id: 'safe_attachments_ok',
      category: 'phishing_threats',
      name: 'Safe Attachments Configurado Corretamente',
      description: 'Políticas de Safe Attachments ativas com ações de bloqueio adequadas.',
      severity: 'info',
      status: 'pass',
    });
  }

  // --- Content Filter (anti-spam) ---
  // Note: HighConfidencePhishAction is NOT evaluated here because Microsoft's
  // "Secure by Default" policy automatically overrides MoveToJmf to Quarantine
  // for High Confidence Phishing. See: https://learn.microsoft.com/defender-office-365/secure-by-default
  for (const policy of exoContentFilter) {
    const name = policy.Name || policy.Identity || 'Default';
    const spamAction = (policy.SpamAction || '').toLowerCase();
    const hcSpamAction = (policy.HighConfidenceSpamAction || '').toLowerCase();
    const weakActions = ['movetojmf', 'addxheader', ''];
    if (weakActions.includes(spamAction) || weakActions.includes(hcSpamAction)) {
      insights.push({
        id: `spam_filter_weak_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'phishing_threats',
        name: 'Filtro Anti-Spam com Ação Fraca',
        description: `Política "${name}": Spam ou High Confidence Spam usa ação fraca ("${spamAction || 'default'}" / "${hcSpamAction || 'default'}") em vez de quarentena`,
        severity: 'medium',
        recommendation: 'Configure SpamAction e HighConfidenceSpamAction para Quarantine. High Confidence Phishing já é protegido pelo "Secure by Default" da Microsoft.',
      });
    }
  }

  return { insights, metrics };
}

// ============================================
// Module 2: Mailbox Capacity (EXO Statistics + Quota)
// ============================================

function analyzeMailboxCapacity(
  mailboxUsage: any[],
  exoMailboxStats: any[],
  exoMailboxQuota: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    totalMailboxes: 0,
    above80Pct: 0,
    above90Pct: 0,
    topMailboxes: [],
  };

  // Build merged mailbox data from EXO PowerShell if available
  let mergedMailboxes: { user: string; usedBytes: number; quotaBytes: number }[] = [];

  if (exoMailboxStats.length > 0) {
    // Build quota lookup from exo_mailbox_quota
    const quotaMap: Record<string, number> = {};
    for (const q of exoMailboxQuota) {
      const key = (q.PrimarySmtpAddress || q.DisplayName || '').toLowerCase();
      const quotaVal = parseSizeToBytes(q.ProhibitSendReceiveQuota);
      if (key && quotaVal > 0) quotaMap[key] = quotaVal;
    }

    const defaultQuota = 53687091200; // 50 GB default

    for (const stat of exoMailboxStats) {
      const displayName = stat.DisplayName || '';
      const usedBytes = parseSizeToBytes(stat.TotalItemSize);
      const key = displayName.toLowerCase();
      const quotaBytes = quotaMap[key] || defaultQuota;

      mergedMailboxes.push({ user: displayName, usedBytes, quotaBytes });
    }

    console.log(`[m365-analyzer] Parsed ${mergedMailboxes.length} mailbox stats from PowerShell`);
  }

  // Fallback to Graph API mailboxUsage
  if (mergedMailboxes.length === 0 && mailboxUsage.length > 0) {
    for (const mb of mailboxUsage) {
      const used = mb.storageUsedInBytes || 0;
      const quota = mb.prohibitSendReceiveQuotaInBytes || mb.issueWarningQuotaInBytes || 53687091200;
      const user = mb.userPrincipalName || mb.displayName || 'unknown';
      mergedMailboxes.push({ user, usedBytes: used, quotaBytes: quota });
    }
  }

  if (mergedMailboxes.length === 0) return { insights, metrics };

  metrics.totalMailboxes = mergedMailboxes.length;
  const critical: string[] = [];
  const warning: string[] = [];
  const topList: { user: string; usedGB: number; pct: number }[] = [];

  for (const mb of mergedMailboxes) {
    if (mb.quotaBytes === 0) continue;
    const pct = (mb.usedBytes / mb.quotaBytes) * 100;
    const usedGB = Math.round((mb.usedBytes / (1024 ** 3)) * 100) / 100;

    topList.push({ user: mb.user, usedGB, pct: Math.round(pct) });

    if (pct >= 90) {
      critical.push(mb.user);
      metrics.above90Pct++;
    } else if (pct >= 80) {
      warning.push(mb.user);
      metrics.above80Pct++;
    }
  }

  metrics.topMailboxes = topList.sort((a, b) => b.pct - a.pct).slice(0, 10);

  if (critical.length > 0) {
    insights.push({
      id: 'mailbox_critical_capacity',
      category: 'mailbox_capacity',
      name: 'Caixas Postais Acima de 90%',
      description: `${critical.length} caixa(s) postal(is) estão acima de 90% da capacidade`,
      severity: 'critical',
      affectedUsers: critical.slice(0, 20),
      count: critical.length,
      recommendation: 'Solicite limpeza ou aumente a cota dessas caixas postais.',
    });
  }

  if (warning.length > 0) {
    insights.push({
      id: 'mailbox_warning_capacity',
      category: 'mailbox_capacity',
      name: 'Caixas Postais Acima de 80%',
      description: `${warning.length} caixa(s) postal(is) estão entre 80-90% da capacidade`,
      severity: 'medium',
      affectedUsers: warning.slice(0, 20),
      count: warning.length,
      recommendation: 'Monitore essas caixas para evitar interrupção de serviço.',
    });
  }

  if (critical.length === 0 && warning.length === 0) {
    insights.push({
      id: 'mailbox_capacity_ok',
      category: 'mailbox_capacity',
      name: 'Capacidade de Caixas Postais Saudável',
      description: 'Todas as caixas postais estão abaixo de 80% da capacidade.',
      severity: 'info',
      status: 'pass',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module 3: Behavioral Baseline (Message Trace aware)
// ============================================

function analyzeBehavioralBaseline(
  emailActivity: any[],
  baselines: any[],
  messageTrace: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = { anomalousUsers: 0, deviations: [] };

  // Build emailActivity from messageTrace if not available from Graph
  let effectiveActivity = emailActivity;
  if (effectiveActivity.length === 0 && messageTrace.length > 0) {
    const userSendCount: Record<string, number> = {};
    const userRecvCount: Record<string, number> = {};
    for (const msg of messageTrace) {
      const sender = (msg.SenderAddress || '').toLowerCase();
      const recipient = (msg.RecipientAddress || '').toLowerCase();
      if (sender) userSendCount[sender] = (userSendCount[sender] || 0) + 1;
      if (recipient) userRecvCount[recipient] = (userRecvCount[recipient] || 0) + 1;
    }
    const allUsers = new Set([...Object.keys(userSendCount), ...Object.keys(userRecvCount)]);
    effectiveActivity = [...allUsers].map(user => ({
      userPrincipalName: user,
      sendCount: userSendCount[user] || 0,
      receiveCount: userRecvCount[user] || 0,
    }));
    console.log(`[m365-analyzer] Built email activity from message trace: ${effectiveActivity.length} users`);
  }

  if (!Array.isArray(effectiveActivity) || effectiveActivity.length === 0) return { insights, metrics };

  const baselineMap: Record<string, any> = {};
  if (Array.isArray(baselines)) {
    for (const b of baselines) baselineMap[b.user_principal_name] = b;
  }

  for (const activity of effectiveActivity) {
    const user = activity.userPrincipalName || '';
    const sentCount = activity.sendCount || 0;
    const baseline = baselineMap[user];
    if (!baseline) continue;

    const avgSent = parseFloat(baseline.avg_sent_daily) || 0;
    if (avgSent > 0 && sentCount > avgSent * 5) {
      const deviationPct = Math.round((sentCount / avgSent) * 100);
      metrics.anomalousUsers++;
      metrics.deviations.push({ user, metric: 'sent', current: sentCount, baseline: Math.round(avgSent), deviationPct });
      insights.push({
        id: `send_anomaly_${user.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'behavioral_baseline',
        name: 'Envio Anômalo de Emails',
        description: `${user} enviou ${sentCount} emails (${deviationPct}% da média diária de ${Math.round(avgSent)})`,
        severity: deviationPct >= 500 ? 'critical' : deviationPct >= 200 ? 'high' : 'medium',
        affectedUsers: [user],
        count: sentCount,
        recommendation: 'Verifique se é atividade legítima ou possível comprometimento de conta.',
      });
    }
  }

  // Save effective activity for baseline creation later
  (metrics as any)._effectiveActivity = effectiveActivity;

  // Pass insight when no anomalies detected
  if (insights.length === 0) {
    insights.push({
      id: 'behavioral_baseline_ok',
      category: 'behavioral_baseline',
      name: 'Comportamento Dentro do Baseline',
      description: 'Nenhum desvio significativo foi detectado em relação ao baseline de envio de emails.',
      severity: 'info',
      status: 'pass',
      recommendation: 'Continue monitorando o baseline comportamental.',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module 4: Account Compromise Detection
// ============================================

function analyzeAccountCompromise(signInLogs: any[], emailActivity: any[], inboxRules: any[]): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    suspiciousLogins: 0,
    correlatedAlerts: 0,
    topRiskUsers: [],
  };

  // Analyze inbox rules for suspicious patterns even without signInLogs
  const suspiciousRuleUsers: { user: string; reasons: string[] }[] = [];
  if (Array.isArray(inboxRules) && inboxRules.length > 0) {
    for (const rule of inboxRules) {
      const user = rule.MailboxOwner || rule.userPrincipalName || rule.PrimarySmtpAddress || '';
      const enabled = rule.Enabled !== false;
      if (!enabled || !user) continue;

      const forwardTo = rule.ForwardTo || rule.ForwardAsAttachmentTo || '';
      const redirectTo = rule.RedirectTo || '';
      const deleteMsg = rule.DeleteMessage === true;

      const reasons: string[] = [];
      if (forwardTo) reasons.push(`forward para ${forwardTo}`);
      if (redirectTo) reasons.push(`redirect para ${redirectTo}`);
      if (deleteMsg) reasons.push('deleta mensagens');

      if (reasons.length > 0) {
        suspiciousRuleUsers.push({ user, reasons });
      }
    }
  }

  if (signInLogs.length === 0 && suspiciousRuleUsers.length === 0) return { insights, metrics };

  const suspiciousUsers = new Set<string>();
  const userLocations: Record<string, Set<string>> = {};

  for (const log of signInLogs) {
    const user = log.userPrincipalName || '';
    const country = log.location?.countryOrRegion || '';
    const riskLevel = (log.riskLevelDuringSignIn || '').toLowerCase();

    if (!userLocations[user]) userLocations[user] = new Set();
    if (country) userLocations[user].add(country);

    if (riskLevel === 'high' || riskLevel === 'medium') {
      suspiciousUsers.add(user);
      metrics.suspiciousLogins++;
    }
  }

  const activityMap: Record<string, number> = {};
  if (Array.isArray(emailActivity)) {
    for (const a of emailActivity) activityMap[a.userPrincipalName || ''] = a.sendCount || 0;
  }

  const ruleUsers = new Set<string>();
  for (const ru of suspiciousRuleUsers) ruleUsers.add(ru.user);
  if (Array.isArray(inboxRules)) {
    for (const rule of inboxRules) {
      if (rule.userPrincipalName) ruleUsers.add(rule.userPrincipalName);
    }
  }

  for (const user of suspiciousUsers) {
    const highSend = (activityMap[user] || 0) > 50;
    const hasNewRule = ruleUsers.has(user);
    const multiCountry = (userLocations[user]?.size || 0) > 2;

    if (highSend || hasNewRule || multiCountry) {
      metrics.correlatedAlerts++;
      const reasons: string[] = [];
      if (highSend) reasons.push(`envio massivo (${activityMap[user]} emails)`);
      if (hasNewRule) reasons.push('criação de regra de inbox');
      if (multiCountry) reasons.push(`login de ${userLocations[user]?.size} países`);

      metrics.topRiskUsers.push({ user, reasons });
      insights.push({
        id: `compromise_${user.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'account_compromise',
        name: 'Alta Probabilidade de Conta Comprometida',
        description: `${user}: login suspeito correlacionado com ${reasons.join(', ')}`,
        severity: 'critical',
        affectedUsers: [user],
        recommendation: 'Bloqueie a conta imediatamente, revogue sessões ativas e investigue.',
      });
    }
  }

  // Also report suspicious inbox rules standalone (without needing sign-in correlation)
  for (const sru of suspiciousRuleUsers) {
    if (!suspiciousUsers.has(sru.user)) {
      // Not already flagged by sign-in correlation
      metrics.topRiskUsers.push({ user: sru.user, reasons: sru.reasons });
      insights.push({
        id: `inbox_rule_risk_${sru.user.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'account_compromise',
        name: 'Regra de Inbox Suspeita',
        description: `${sru.user}: ${sru.reasons.join(', ')}`,
        severity: 'high',
        affectedUsers: [sru.user],
        recommendation: 'Verifique se as regras de inbox são legítimas e autorizadas.',
      });
    }
  }

  // Pass insight when no account compromise detected
  if (insights.length === 0) {
    insights.push({
      id: 'account_compromise_ok',
      category: 'account_compromise',
      name: 'Nenhuma Conta Comprometida',
      description: 'Nenhuma correlação de comprometimento de conta detectada no período.',
      severity: 'info',
      status: 'pass',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module 5: Suspicious Rules (EXO-aware)
// ============================================

function analyzeSuspiciousRules(
  auditLogs: any[],
  exoForwarding: any[],
  exoTransportRules: any[],
  exoInboxRules: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    externalForwards: 0,
    autoDelete: 0,
    suspiciousRules: [] as { user: string; ruleName: string; action: string; destination?: string }[],
  };

  // --- EXO Mailbox Forwarding ---
  for (const fwd of exoForwarding) {
    const user = fwd.PrimarySmtpAddress || fwd.DisplayName || fwd.Identity || 'unknown';
    const forwardAddr = fwd.ForwardingSmtpAddress || fwd.ForwardingAddress || '';
    const deliverToMailbox = fwd.DeliverToMailboxAndForward;

    if (forwardAddr) {
      metrics.externalForwards++;
      const entry = { user, ruleName: 'Mailbox Forwarding', action: 'forward', destination: forwardAddr };
      metrics.suspiciousRules.push(entry);
      insights.push({
        id: `fwd_${user.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'suspicious_rules',
        name: 'Encaminhamento de Mailbox Ativo',
        description: `${user} tem encaminhamento para ${forwardAddr}${deliverToMailbox ? ' (com cópia na caixa)' : ' (sem cópia na caixa)'}`,
        severity: forwardAddr.includes('external') || !forwardAddr.includes(user.split('@')[1] || '') ? 'critical' : 'high',
        affectedUsers: [user],
        metadata: { forwardAddr, deliverToMailbox },
        recommendation: 'Verifique se o encaminhamento é autorizado. Encaminhamentos não autorizados podem indicar comprometimento.',
      });
    }
  }

  // --- EXO Transport Rules ---
  for (const rule of exoTransportRules) {
    const name = rule.Name || rule.Identity || 'Unknown';
    const state = (rule.State || '').toLowerCase();
    if (state === 'disabled') continue;

    const redirectTo = rule.RedirectMessageTo || '';
    const copyTo = rule.CopyTo || '';
    const blindCopyTo = rule.BlindCopyTo || '';
    const deleteMsg = rule.DeleteMessage === true;

    if (redirectTo || copyTo || blindCopyTo) {
      const dest = redirectTo || copyTo || blindCopyTo;
      metrics.externalForwards++;
      metrics.suspiciousRules.push({ user: 'TransportRule', ruleName: name, action: 'redirect', destination: String(dest) });
      insights.push({
        id: `transport_redirect_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'suspicious_rules',
        name: 'Transport Rule com Redirecionamento',
        description: `Regra de transporte "${name}" redireciona emails para ${dest}`,
        severity: 'high',
        recommendation: 'Verifique se esta regra de transporte é necessária e autorizada.',
        metadata: { redirectTo, copyTo, blindCopyTo },
      });
    }

    if (deleteMsg) {
      metrics.autoDelete++;
      metrics.suspiciousRules.push({ user: 'TransportRule', ruleName: name, action: 'delete' });
      insights.push({
        id: `transport_delete_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'suspicious_rules',
        name: 'Transport Rule com Exclusão',
        description: `Regra de transporte "${name}" deleta emails automaticamente`,
        severity: 'high',
        recommendation: 'Regras de exclusão automática podem ocultar atividade maliciosa. Investigue.',
      });
    }
  }

  // --- EXO Inbox Rules (per-mailbox) ---
  for (const rule of exoInboxRules) {
    const user = rule.MailboxOwner || rule.MailboxOwnerId || 'unknown';
    const ruleName = rule.Name || 'unnamed';
    const enabled = rule.Enabled !== false;
    if (!enabled) continue;

    const forwardTo = rule.ForwardTo || rule.ForwardAsAttachmentTo || '';
    const redirectTo = rule.RedirectTo || '';
    const deleteMsg = rule.DeleteMessage === true;

    if (forwardTo || redirectTo) {
      const dest = forwardTo || redirectTo;
      metrics.externalForwards++;
      metrics.suspiciousRules.push({ user, ruleName, action: 'forward', destination: String(dest) });
      insights.push({
        id: `inbox_rule_fwd_${user.replace(/[^a-z0-9]/gi, '_')}_${ruleName.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'suspicious_rules',
        name: 'Regra de Inbox com Encaminhamento',
        description: `${user}: regra "${ruleName}" encaminha para ${dest}`,
        severity: 'high',
        affectedUsers: [user],
        recommendation: 'Verifique se o encaminhamento via inbox rule é autorizado.',
      });
    }

    if (deleteMsg) {
      metrics.autoDelete++;
      metrics.suspiciousRules.push({ user, ruleName, action: 'delete' });
      insights.push({
        id: `inbox_rule_del_${user.replace(/[^a-z0-9]/gi, '_')}_${ruleName.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'suspicious_rules',
        name: 'Regra de Inbox com Exclusão Automática',
        description: `${user}: regra "${ruleName}" deleta emails automaticamente`,
        severity: 'high',
        affectedUsers: [user],
        recommendation: 'Regras que deletam emails podem ocultar atividade maliciosa.',
      });
    }
  }

  // --- Audit log-based rules (Graph API data) ---
  if (Array.isArray(auditLogs)) {
    for (const log of auditLogs) {
      const activity = (log.activityDisplayName || log.operationName || '').toLowerCase();
      const target = log.targetResources?.[0]?.displayName || '';
      const user = log.initiatedBy?.user?.userPrincipalName || log.userId || '';

      if (activity.includes('inbox rule') || activity.includes('new-inboxrule') || activity.includes('set-inboxrule')) {
        const modifiedProps = log.targetResources?.[0]?.modifiedProperties || [];
        for (const prop of modifiedProps) {
          const propName = (prop.displayName || '').toLowerCase();
          const val = (prop.newValue || '').toLowerCase();
          if (propName.includes('forwardto') || propName.includes('redirectto')) {
            metrics.externalForwards++;
            metrics.suspiciousRules.push({ user, ruleName: target, action: 'forward', destination: prop.newValue || '' });
            insights.push({
              id: `audit_fwd_${user.replace(/[^a-z0-9]/gi, '_')}_${target.replace(/[^a-z0-9]/gi, '_')}`,
              category: 'suspicious_rules',
              name: 'Regra de Redirecionamento via Audit',
              description: `${user} criou regra "${target}" com forward para ${prop.newValue}`,
              severity: 'critical',
              affectedUsers: [user],
              recommendation: 'Verifique se o redirecionamento é autorizado.',
            });
          }
          if (propName.includes('deletemessage') && val === 'true') {
            metrics.autoDelete++;
            metrics.suspiciousRules.push({ user, ruleName: target, action: 'delete' });
            insights.push({
              id: `audit_delete_${user.replace(/[^a-z0-9]/gi, '_')}_${target.replace(/[^a-z0-9]/gi, '_')}`,
              category: 'suspicious_rules',
              name: 'Regra de Exclusão Automática via Audit',
              description: `${user} criou regra "${target}" que deleta emails`,
              severity: 'high',
              affectedUsers: [user],
              recommendation: 'Investigue a finalidade dessa regra.',
            });
          }
        }
      }
    }
  }

  // Pass insights when no suspicious rules found
  if (insights.length === 0) {
    insights.push({
      id: 'suspicious_rules_ok',
      category: 'suspicious_rules',
      name: 'Nenhuma Regra Suspeita Detectada',
      description: 'Não foram encontrados encaminhamentos, regras de exclusão automática ou redirecionamentos suspeitos.',
      severity: 'info',
      status: 'pass',
      recommendation: 'Continue monitorando periodicamente.',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module 6: Exfiltration Detection (Message Trace aware)
// ============================================

function analyzeExfiltration(
  emailActivity: any[],
  messageTrace: any[],
  tenantDomains: string[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    highVolumeExternal: 0,
    topExternalDomains: [],
  };

  // Build external domain stats from message trace
  if (messageTrace.length > 0) {
    const externalDomainCount: Record<string, { count: number; attachments: number }> = {};
    const userExternalSent: Record<string, number> = {};

    for (const msg of messageTrace) {
      const sender = (msg.SenderAddress || '').toLowerCase();
      const recipient = (msg.RecipientAddress || '').toLowerCase();
      const recipientDomain = recipient.includes('@') ? recipient.split('@')[1] : '';

      if (!recipientDomain) continue;

      // Check if external
      const isExternal = tenantDomains.length > 0
        ? !tenantDomains.some(d => recipientDomain.endsWith(d.toLowerCase()))
        : recipientDomain !== (sender.includes('@') ? sender.split('@')[1] : '');

      if (isExternal) {
        if (!externalDomainCount[recipientDomain]) {
          externalDomainCount[recipientDomain] = { count: 0, attachments: 0 };
        }
        externalDomainCount[recipientDomain].count++;
        // Estimate attachment from size (>100KB)
        const size = parseSizeToBytes(msg.Size);
        if (size > 102400) externalDomainCount[recipientDomain].attachments++;

        if (sender) userExternalSent[sender] = (userExternalSent[sender] || 0) + 1;
      }
    }

    metrics.topExternalDomains = Object.entries(externalDomainCount)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([domain, data]) => ({ domain, count: data.count, attachments: data.attachments }));

    // Flag users with high external volume
    for (const [user, count] of Object.entries(userExternalSent)) {
      if (count > 100) {
        metrics.highVolumeExternal++;
        insights.push({
          id: `exfiltration_mt_${user.replace(/[^a-z0-9]/gi, '_')}`,
          category: 'exfiltration',
          name: 'Alto Volume de Envio Externo',
          description: `${user} enviou ${count} emails para domínios externos nas últimas 24h`,
          severity: count > 500 ? 'critical' : 'high',
          affectedUsers: [user],
          count,
          recommendation: 'Verifique se o volume de envio externo é compatível com a função do usuário.',
        });
      }
    }

    if (metrics.topExternalDomains.length > 0 && metrics.topExternalDomains[0].count > 50) {
      const topDomain = metrics.topExternalDomains[0];
      insights.push({
        id: `exfiltration_domain_${topDomain.domain.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'exfiltration',
        name: 'Domínio Externo com Alto Volume',
        description: `${topDomain.count} emails enviados para ${topDomain.domain} (${topDomain.attachments} com anexos grandes)`,
        severity: topDomain.count > 200 ? 'high' : 'medium',
        recommendation: 'Analise se esse domínio é um destino legítimo para o volume de emails.',
        metadata: { domain: topDomain.domain, count: topDomain.count },
      });
    }

    console.log(`[m365-analyzer] Exfiltration analysis from message trace: ${Object.keys(userExternalSent).length} senders, ${Object.keys(externalDomainCount).length} external domains`);
  }

  // Fallback: Graph emailActivity
  if (messageTrace.length === 0 && Array.isArray(emailActivity)) {
    for (const activity of emailActivity) {
      const user = activity.userPrincipalName || '';
      const externalSent = activity.sendCount || 0;
      if (externalSent > 100) {
        metrics.highVolumeExternal++;
        insights.push({
          id: `exfiltration_${user.replace(/[^a-z0-9]/gi, '_')}`,
          category: 'exfiltration',
          name: 'Possível Exfiltração de Dados',
          description: `${user} enviou ${externalSent} emails com alto volume no período`,
          severity: externalSent > 500 ? 'critical' : 'high',
          affectedUsers: [user],
          count: externalSent,
          recommendation: 'Verifique se o volume de envio externo é compatível com a função do usuário.',
        });
      }
    }
  }

  // Pass insight when no exfiltration detected
  if (insights.length === 0) {
    insights.push({
      id: 'exfiltration_ok',
      category: 'exfiltration',
      name: 'Nenhuma Exfiltração Detectada',
      description: 'Não foram identificados padrões de envio externo anômalo ou volume suspeito de dados.',
      severity: 'info',
      status: 'pass',
      recommendation: 'Continue monitorando os padrões de envio externo.',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module 7: Operational Risks (EXO-aware)
// ============================================

function analyzeOperationalRisks(
  signInLogs: any[],
  auditLogs: any[],
  exoOrgConfig: any[],
  exoRemoteDomains: any[],
  exoMalwareFilter: any[],
  exoAuthPolicy: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    smtpAuthEnabled: 0,
    legacyProtocols: 0,
    inactiveWithActivity: 0,
    fullAccessGrants: 0,
  };

  // --- EXO Org Config: SMTP Auth ---
  for (const cfg of exoOrgConfig) {
    const smtpAuth = cfg.SmtpClientAuthenticationDisabled;
    if (smtpAuth === false) {
      metrics.smtpAuthEnabled = 1;
      insights.push({
        id: 'smtp_auth_enabled',
        category: 'operational_risks',
        name: 'SMTP Auth Habilitado no Nível Organizacional',
        description: 'SmtpClientAuthenticationDisabled=false — SMTP Auth está habilitado para toda a organização',
        severity: 'high',
        recommendation: 'Desabilite SMTP Auth org-wide e habilite apenas para mailboxes que necessitam.',
      });
    }

    const oauthEnabled = cfg.OAuth2ClientProfileEnabled;
    if (oauthEnabled === false) {
      insights.push({
        id: 'oauth_disabled',
        category: 'operational_risks',
        name: 'OAuth2 Desabilitado',
        description: 'OAuth2ClientProfileEnabled=false — Autenticação moderna está desabilitada',
        severity: 'critical',
        recommendation: 'Habilite OAuth2 para autenticação moderna.',
      });
    }
  }

  // --- EXO Auth Policy: Legacy Protocols ---
  for (const policy of exoAuthPolicy) {
    const name = policy.Name || 'Default';
    const legacyEnabled: string[] = [];

    if (policy.AllowBasicAuthSmtp === true) legacyEnabled.push('SMTP');
    if (policy.AllowBasicAuthImap === true) legacyEnabled.push('IMAP');
    if (policy.AllowBasicAuthPop === true) legacyEnabled.push('POP');
    if (policy.AllowBasicAuthActiveSync === true) legacyEnabled.push('ActiveSync');
    if (policy.AllowBasicAuthMapi === true) legacyEnabled.push('MAPI');

    if (legacyEnabled.length > 0) {
      metrics.legacyProtocols += legacyEnabled.length;
      insights.push({
        id: `auth_policy_legacy_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'operational_risks',
        name: 'Autenticação Básica Permitida',
        description: `Política "${name}" permite autenticação básica para: ${legacyEnabled.join(', ')}`,
        severity: legacyEnabled.length > 2 ? 'critical' : 'high',
        recommendation: 'Desabilite autenticação básica e migre para autenticação moderna (OAuth2).',
        metadata: { protocols: legacyEnabled },
      });
    }
  }

  // --- Remote Domains: auto-forward ---
  for (const domain of exoRemoteDomains) {
    const name = domain.DomainName || domain.Name || 'Default';
    if (domain.AutoForwardEnabled === true) {
      insights.push({
        id: `remote_domain_fwd_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'operational_risks',
        name: 'Auto-Forward Habilitado em Remote Domain',
        description: `Remote domain "${name}" permite auto-forward de emails`,
        severity: name === '*' || name === 'Default' ? 'critical' : 'high',
        recommendation: 'Desabilite auto-forward em remote domains, especialmente no domínio padrão (*)',
      });
    }
  }

  // --- Malware Filter ---
  for (const policy of exoMalwareFilter) {
    const name = policy.Name || policy.Identity || 'Default';
    if (policy.EnableFileFilter === false) {
      insights.push({
        id: `malware_nofilefilter_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'operational_risks',
        name: 'Filtro de Anexos Desabilitado',
        description: `Política de malware "${name}" tem FileFilter desabilitado`,
        severity: 'high',
        recommendation: 'Habilite o filtro de tipos de arquivo comuns (exe, scr, etc.).',
      });
    }
    if (policy.ZapEnabled === false) {
      insights.push({
        id: `malware_nozap_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'operational_risks',
        name: 'ZAP Desabilitado para Malware',
        description: `Política de malware "${name}" tem Zero-hour Auto Purge desabilitado`,
        severity: 'medium',
        recommendation: 'Habilite ZAP para remover automaticamente mensagens maliciosas já entregues.',
      });
    }
  }

  // --- Legacy auth from sign-in logs ---
  if (Array.isArray(signInLogs)) {
    const legacyUsers = new Set<string>();
    for (const log of signInLogs) {
      const clientApp = (log.clientAppUsed || '').toLowerCase();
      if (clientApp.includes('smtp') || clientApp.includes('imap') || clientApp.includes('pop3') || clientApp.includes('other')) {
        legacyUsers.add(log.userPrincipalName || '');
      }
    }
    if (legacyUsers.size > 0) {
      metrics.legacyProtocols = Math.max(metrics.legacyProtocols, legacyUsers.size);
      insights.push({
        id: 'legacy_auth_detected',
        category: 'operational_risks',
        name: 'Protocolo Legado em Uso',
        description: `${legacyUsers.size} usuário(s) utilizando SMTP/IMAP/POP3`,
        severity: 'medium',
        affectedUsers: [...legacyUsers].slice(0, 20),
        count: legacyUsers.size,
        recommendation: 'Desabilite protocolos legados e migre para autenticação moderna.',
      });
    }
  }

  // --- FullAccess grants from audit logs ---
  if (Array.isArray(auditLogs)) {
    for (const log of auditLogs) {
      const activity = (log.activityDisplayName || '').toLowerCase();
      if (activity.includes('mailbox permission') || activity.includes('fullaccess') || activity.includes('add-mailboxpermission')) {
        const user = log.initiatedBy?.user?.userPrincipalName || '';
        metrics.fullAccessGrants++;
        insights.push({
          id: `fullaccess_${user.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`,
          category: 'operational_risks',
          name: 'Permissão FullAccess Concedida',
          description: `${user} concedeu permissão FullAccess a uma caixa postal`,
          severity: 'high',
          affectedUsers: [user],
          recommendation: 'Verifique se a concessão de acesso completo é autorizada.',
        });
      }
    }
  }

  // Granular pass insights per sub-check
  if (metrics.smtpAuthEnabled === 0 && exoOrgConfig.length > 0) {
    insights.push({
      id: 'smtp_auth_disabled',
      category: 'operational_risks',
      name: 'SMTP Auth Desabilitado',
      description: 'SMTP Auth está desabilitado no nível organizacional — configuração segura.',
      severity: 'info',
      status: 'pass',
    });
  }

  if (metrics.legacyProtocols === 0 && exoAuthPolicy.length > 0) {
    insights.push({
      id: 'no_legacy_protocols',
      category: 'operational_risks',
      name: 'Sem Protocolos Legados',
      description: 'Nenhum protocolo legado (SMTP/IMAP/POP) habilitado nas políticas de autenticação.',
      severity: 'info',
      status: 'pass',
    });
  }

  if (metrics.fullAccessGrants === 0) {
    insights.push({
      id: 'no_fullaccess_grants',
      category: 'operational_risks',
      name: 'Nenhuma Permissão FullAccess',
      description: 'Nenhuma concessão de permissão FullAccess detectada no período.',
      severity: 'info',
      status: 'pass',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module: Threat Protection (SPAM, Phishing, Malware)
// ============================================

function analyzeThreatProtection(
  exoMessageTrace: any[],
  threatData: any[],
  exoContentFilter: any[],
  exoMalwareFilter: any[],
  exoAntiPhish: any[],
  exoSafeLinks: any[],
  exoSafeAttach: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    spamBlocked: 0,
    phishingDetected: 0,
    malwareBlocked: 0,
    quarantined: 0,
    totalDelivered: 0,
    totalFiltered: 0,
    topSpamSenderDomains: [],
    topPhishingTargets: [],
    topMalwareSenders: [],
    topSpamRecipients: [],
    deliveryBreakdown: [],
    policyStatus: {
      antiSpam: 'disabled' as string,
      antiPhish: 'disabled' as string,
      safeLinks: 'disabled' as string,
      safeAttach: 'disabled' as string,
      malwareFilter: 'disabled' as string,
    },
  };

  const statusMap: Record<string, number> = {};
  const spamDomainMap: Record<string, number> = {};
  const spamRecipientMap: Record<string, number> = {};
  const phishTargetMap: Record<string, number> = {};
  const malwareDomainMap: Record<string, number> = {};

  // Enriched detail maps for side-sheet
  const spamDomainDetails: Record<string, { recipients: Set<string>; subjects: string[] }> = {};
  const phishTargetDetails: Record<string, { senders: Set<string>; subjects: string[] }> = {};
  const malwareDomainDetails: Record<string, { recipients: Set<string>; subjects: string[] }> = {};

  for (const msg of exoMessageTrace) {
    const status = (msg.Status || '').toLowerCase();
    const sender = (msg.SenderAddress || '').toLowerCase();
    const recipient = (msg.RecipientAddress || '').toLowerCase();
    const subject = msg.Subject || '';
    const senderDomain = sender.includes('@') ? sender.split('@')[1] : sender;
    statusMap[status] = (statusMap[status] || 0) + 1;

    if (status === 'filteredasspam' || status === 'spamfiltered') {
      metrics.spamBlocked++;
      metrics.totalFiltered++;
      if (senderDomain) {
        spamDomainMap[senderDomain] = (spamDomainMap[senderDomain] || 0) + 1;
        if (!spamDomainDetails[senderDomain]) spamDomainDetails[senderDomain] = { recipients: new Set(), subjects: [] };
        if (recipient) spamDomainDetails[senderDomain].recipients.add(recipient);
        if (subject && spamDomainDetails[senderDomain].subjects.length < 10) spamDomainDetails[senderDomain].subjects.push(subject);
      }
      if (recipient) spamRecipientMap[recipient] = (spamRecipientMap[recipient] || 0) + 1;
    } else if (status === 'quarantined') {
      metrics.quarantined++;
      metrics.totalFiltered++;
      metrics.phishingDetected++;
      if (recipient) {
        phishTargetMap[recipient] = (phishTargetMap[recipient] || 0) + 1;
        if (!phishTargetDetails[recipient]) phishTargetDetails[recipient] = { senders: new Set(), subjects: [] };
        if (senderDomain) phishTargetDetails[recipient].senders.add(senderDomain);
        if (subject && phishTargetDetails[recipient].subjects.length < 10) phishTargetDetails[recipient].subjects.push(subject);
      }
    } else if (status === 'failed') {
      metrics.malwareBlocked++;
      metrics.totalFiltered++;
      if (senderDomain) {
        malwareDomainMap[senderDomain] = (malwareDomainMap[senderDomain] || 0) + 1;
        if (!malwareDomainDetails[senderDomain]) malwareDomainDetails[senderDomain] = { recipients: new Set(), subjects: [] };
        if (recipient) malwareDomainDetails[senderDomain].recipients.add(recipient);
        if (subject && malwareDomainDetails[senderDomain].subjects.length < 10) malwareDomainDetails[senderDomain].subjects.push(subject);
      }
    } else if (status === 'delivered') {
      metrics.totalDelivered++;
    }
  }

  for (const t of threatData) {
    const threatType = (t.threatType || '').toLowerCase();
    const recipient = (t.recipientEmailAddress || '').toLowerCase();
    const sender = (t.senderAddress || '').toLowerCase();
    const senderDomain = sender.includes('@') ? sender.split('@')[1] : sender;
    const subject = t.subject || '';
    if (threatType.includes('phish')) {
      metrics.phishingDetected++;
      if (recipient) {
        phishTargetMap[recipient] = (phishTargetMap[recipient] || 0) + 1;
        if (!phishTargetDetails[recipient]) phishTargetDetails[recipient] = { senders: new Set(), subjects: [] };
        if (senderDomain) phishTargetDetails[recipient].senders.add(senderDomain);
        if (subject && phishTargetDetails[recipient].subjects.length < 10) phishTargetDetails[recipient].subjects.push(subject);
      }
    } else if (threatType.includes('malware')) {
      metrics.malwareBlocked++;
      if (senderDomain) {
        malwareDomainMap[senderDomain] = (malwareDomainMap[senderDomain] || 0) + 1;
        if (!malwareDomainDetails[senderDomain]) malwareDomainDetails[senderDomain] = { recipients: new Set(), subjects: [] };
        if (recipient) malwareDomainDetails[senderDomain].recipients.add(recipient);
        if (subject && malwareDomainDetails[senderDomain].subjects.length < 10) malwareDomainDetails[senderDomain].subjects.push(subject);
      }
    }
  }

  metrics.topSpamSenderDomains = Object.entries(spamDomainMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, count]) => ({
    domain, count,
    recipients: [...(spamDomainDetails[domain]?.recipients || [])].slice(0, 20),
    sampleSubjects: (spamDomainDetails[domain]?.subjects || []).slice(0, 10),
  }));
  metrics.topPhishingTargets = Object.entries(phishTargetMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([user, count]) => ({
    user, count,
    senders: [...(phishTargetDetails[user]?.senders || [])].slice(0, 20),
    sampleSubjects: (phishTargetDetails[user]?.subjects || []).slice(0, 10),
  }));
  metrics.topMalwareSenders = Object.entries(malwareDomainMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, count]) => ({
    domain, count,
    recipients: [...(malwareDomainDetails[domain]?.recipients || [])].slice(0, 20),
    sampleSubjects: (malwareDomainDetails[domain]?.subjects || []).slice(0, 10),
  }));
  metrics.topSpamRecipients = Object.entries(spamRecipientMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([user, count]) => ({ user, count }));
  metrics.deliveryBreakdown = Object.entries(statusMap).sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ status, count }));

  // Contextual insights
  for (const entry of metrics.topSpamSenderDomains.slice(0, 3)) {
    if (entry.count >= 10) {
      insights.push({
        id: `spam_domain_${entry.domain.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'threat_protection',
        name: `SPAM massivo de ${entry.domain}`,
        description: `O domínio ${entry.domain} enviou ${entry.count} emails de SPAM para sua organização`,
        severity: entry.count >= 100 ? 'high' : 'medium',
        count: entry.count,
        recommendation: `Considere bloquear o domínio ${entry.domain} nas políticas de transporte.`,
        metadata: { domain: entry.domain },
      });
    }
  }

  for (const entry of metrics.topPhishingTargets.slice(0, 3)) {
    if (entry.count >= 3) {
      insights.push({
        id: `phish_target_${entry.user.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'threat_protection',
        name: `Alvo principal de phishing`,
        description: `${entry.user} recebeu ${entry.count} tentativas de phishing`,
        severity: entry.count >= 20 ? 'critical' : entry.count >= 10 ? 'high' : 'medium',
        count: entry.count,
        affectedUsers: [entry.user],
        recommendation: 'Aplique treinamento de conscientização e reforce MFA para este usuário.',
      });
    }
  }

  for (const entry of metrics.topMalwareSenders.slice(0, 3)) {
    if (entry.count >= 3) {
      insights.push({
        id: `malware_domain_${entry.domain.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'threat_protection',
        name: `Malware detectado de ${entry.domain}`,
        description: `${entry.count} emails com malware bloqueados do domínio ${entry.domain}`,
        severity: entry.count >= 20 ? 'critical' : 'high',
        count: entry.count,
        recommendation: `Bloqueie o domínio ${entry.domain} e investigue possíveis comprometimentos.`,
      });
    }
  }

  if (metrics.spamBlocked > 100) {
    insights.push({
      id: 'spam_volume_high',
      category: 'threat_protection',
      name: 'Alto volume de SPAM',
      description: `${metrics.spamBlocked} emails de SPAM bloqueados no período`,
      severity: metrics.spamBlocked > 500 ? 'high' : 'medium',
      count: metrics.spamBlocked,
      recommendation: 'Revise as regras de transporte e considere reforçar os filtros anti-spam.',
    });
  }

  if (metrics.quarantined > 10) {
    insights.push({
      id: 'quarantine_volume',
      category: 'threat_protection',
      name: 'Emails em quarentena',
      description: `${metrics.quarantined} emails enviados para quarentena no período`,
      severity: metrics.quarantined > 50 ? 'high' : 'medium',
      count: metrics.quarantined,
      recommendation: 'Revise os emails em quarentena para identificar falsos positivos.',
    });
  }

  // Policy status evaluation
  if (exoContentFilter.length > 0) {
    // Evaluate SpamAction/HighConfidenceSpamAction instead of HighConfidencePhishAction
    // because Microsoft "Secure by Default" overrides HCPhish to Quarantine automatically
    const weakActions = ['movetojmf', 'addxheader', ''];
    const hasWeakAction = exoContentFilter.some((p: any) => {
      const spam = (p.SpamAction || '').toLowerCase();
      const hcSpam = (p.HighConfidenceSpamAction || '').toLowerCase();
      return weakActions.includes(spam) || weakActions.includes(hcSpam);
    });
    metrics.policyStatus.antiSpam = hasWeakAction ? 'weak' : 'enabled';
  }

  if (exoAntiPhish.length > 0) {
    const allDisabled = exoAntiPhish.every((p: any) => p.Enabled === false);
    const hasWeakConfig = exoAntiPhish.some((p: any) => p.EnableSpoofIntelligence === false);
    metrics.policyStatus.antiPhish = allDisabled ? 'disabled' : hasWeakConfig ? 'weak' : 'enabled';
  }

  if (exoSafeLinks.length > 0) {
    const allDisabled = exoSafeLinks.every((p: any) => p.EnableSafeLinksForEmail === false);
    metrics.policyStatus.safeLinks = allDisabled ? 'disabled' : 'enabled';
  }

  if (exoSafeAttach.length > 0) {
    const hasWeak = exoSafeAttach.some((p: any) => {
      const action = (p.Action || '').toLowerCase();
      return action === 'allow' || p.Enable === false;
    });
    metrics.policyStatus.safeAttach = hasWeak ? 'disabled' : 'enabled';
  }

  if (exoMalwareFilter.length > 0) {
    const hasWeakConfig = exoMalwareFilter.some((p: any) => p.EnableFileFilter === false);
    metrics.policyStatus.malwareFilter = hasWeakConfig ? 'weak' : 'enabled';
  }

  return { insights, metrics };
}

// ============================================
// Module 8: Security & Risk (Entra ID sign-ins)
// ============================================

function analyzeSecurityRisk(
  signInLogs: any[],
  riskyUsersData: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    highRiskSignIns: 0,
    mfaFailures: 0,
    impossibleTravel: 0,
    blockedAccounts: 0,
    riskyUsers: 0,
  };

  // Risky users from Identity Protection
  if (riskyUsersData.length > 0) {
    const highRisk = riskyUsersData.filter((u: any) => u.riskLevel === 'high');
    const medRisk = riskyUsersData.filter((u: any) => u.riskLevel === 'medium');
    metrics.riskyUsers = riskyUsersData.length;

    if (highRisk.length > 0) {
      insights.push({
        id: 'risky_users_high',
        category: 'security_risk',
        name: 'Usuários com Risco Alto',
        description: `${highRisk.length} usuário(s) com nível de risco ALTO no Identity Protection`,
        severity: 'critical',
        affectedUsers: highRisk.slice(0, 20).map((u: any) => u.userPrincipalName || u.userDisplayName || ''),
        count: highRisk.length,
        recommendation: 'Force reset de senha e investigue possível comprometimento.',
      });
    }
    if (medRisk.length > 0) {
      insights.push({
        id: 'risky_users_medium',
        category: 'security_risk',
        name: 'Usuários com Risco Médio',
        description: `${medRisk.length} usuário(s) com nível de risco MÉDIO`,
        severity: 'high',
        affectedUsers: medRisk.slice(0, 20).map((u: any) => u.userPrincipalName || u.userDisplayName || ''),
        count: medRisk.length,
        recommendation: 'Valide a legitimidade dos sign-ins com os usuários.',
      });
    }
  }

  // Analyze sign-in logs for MFA failures, blocked accounts, impossible travel
  if (signInLogs.length > 0) {
    const mfaFailureCodes = new Set([50074, 50076, 53003, 500121]);
    const blockedCode = 50053;
    const mfaFailUsers = new Set<string>();
    const blockedUsers = new Set<string>();
    const userCountryTimestamps: Record<string, { country: string; time: number }[]> = {};

    for (const log of signInLogs) {
      const user = log.userPrincipalName || '';
      const errorCode = log.status?.errorCode ?? log.errorCode ?? 0;
      const country = log.location?.countryOrRegion || '';
      const ts = new Date(log.createdDateTime || 0).getTime();
      const riskLevel = (log.riskLevelDuringSignIn || '').toLowerCase();

      if (riskLevel === 'high' || riskLevel === 'medium') {
        metrics.highRiskSignIns++;
      }

      if (mfaFailureCodes.has(errorCode)) {
        metrics.mfaFailures++;
        mfaFailUsers.add(user);
      }

      if (errorCode === blockedCode) {
        blockedUsers.add(user);
      }

      if (user && country && ts > 0) {
        if (!userCountryTimestamps[user]) userCountryTimestamps[user] = [];
        userCountryTimestamps[user].push({ country, time: ts });
      }
    }

    metrics.blockedAccounts = blockedUsers.size;

    if (mfaFailUsers.size > 0) {
      insights.push({
        id: 'mfa_failures',
        category: 'security_risk',
        name: 'Falhas de MFA Detectadas',
        description: `${mfaFailUsers.size} usuário(s) com falhas de MFA — possível password spray`,
        severity: mfaFailUsers.size > 10 ? 'critical' : 'high',
        affectedUsers: [...mfaFailUsers].slice(0, 20),
        count: metrics.mfaFailures,
        recommendation: 'Verifique se há tentativa de ataque de password spray.',
      });
    }

    if (blockedUsers.size > 0) {
      insights.push({
        id: 'blocked_accounts',
        category: 'security_risk',
        name: 'Contas Bloqueadas',
        description: `${blockedUsers.size} conta(s) bloqueada(s) — possível brute force`,
        severity: blockedUsers.size > 5 ? 'critical' : 'high',
        affectedUsers: [...blockedUsers].slice(0, 20),
        count: blockedUsers.size,
        recommendation: 'Investigue tentativas de brute force e valide com os usuários.',
      });
    }

    // Impossible travel detection
    for (const [user, entries] of Object.entries(userCountryTimestamps)) {
      const sorted = entries.sort((a, b) => a.time - b.time);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].country !== sorted[i - 1].country) {
          const timeDiffMin = (sorted[i].time - sorted[i - 1].time) / 60000;
          if (timeDiffMin < 60) {
            metrics.impossibleTravel++;
            insights.push({
              id: `impossible_travel_${user.replace(/[^a-z0-9]/gi, '_')}`,
              category: 'security_risk',
              name: 'Impossible Travel Detectado',
              description: `${user}: login de ${sorted[i - 1].country} e ${sorted[i].country} em ${Math.round(timeDiffMin)}min`,
              severity: 'critical',
              affectedUsers: [user],
              recommendation: 'Valide legitimidade com o usuário imediatamente.',
            });
            break;
          }
        }
      }
    }
  }

  // Granular pass insights per sub-check
  const hasHighRisk = riskyUsersData.some((u: any) => u.riskLevel === 'high');
  if (!hasHighRisk) {
    insights.push({
      id: 'no_high_risk_users',
      category: 'security_risk',
      name: 'Nenhum Usuário de Alto Risco',
      description: 'Nenhum usuário com nível de risco ALTO no Identity Protection.',
      severity: 'info',
      status: 'pass',
    });
  }

  if (metrics.impossibleTravel === 0) {
    insights.push({
      id: 'no_impossible_travel',
      category: 'security_risk',
      name: 'Nenhum Impossible Travel',
      description: 'Nenhum login de locais geograficamente impossíveis detectado no período.',
      severity: 'info',
      status: 'pass',
    });
  }

  if (metrics.blockedAccounts === 0) {
    insights.push({
      id: 'no_blocked_accounts',
      category: 'security_risk',
      name: 'Nenhuma Conta Bloqueada',
      description: 'Nenhuma conta bloqueada por tentativas de brute force no período.',
      severity: 'info',
      status: 'pass',
    });
  }

  if (metrics.mfaFailures === 0) {
    insights.push({
      id: 'no_mfa_failures',
      category: 'security_risk',
      name: 'Nenhuma Falha de MFA',
      description: 'Nenhuma falha de autenticação multifator detectada no período.',
      severity: 'info',
      status: 'pass',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module 9: Identity & Access
// ============================================

function analyzeIdentityAccess(
  auditLogs: any[],
  credentialRegistration: any[],
  recentApps: any[],
  signInLogs: any[],
  exoSharedMailboxes: any[] = [],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    newUsers: 0,
    disabledUsers: 0,
    noMfaUsers: 0,
    noConditionalAccess: 0,
    serviceAccountInteractive: 0,
    recentAppRegistrations: 0,
  };

  // New users and disabled users from audit logs
  if (Array.isArray(auditLogs)) {
    for (const log of auditLogs) {
      const activity = (log.activityDisplayName || '').toLowerCase();
      if (activity === 'add user' || activity.includes('add user')) {
        metrics.newUsers++;
      }
      if (activity === 'disable account' || activity.includes('disable account')) {
        metrics.disabledUsers++;
      }
    }
    if (metrics.newUsers > 0) {
      insights.push({
        id: 'new_users_created',
        category: 'identity_access',
        name: 'Novos Usuários Criados',
        description: `${metrics.newUsers} novo(s) usuário(s) criado(s) no período`,
        severity: metrics.newUsers > 10 ? 'medium' : 'info',
        count: metrics.newUsers,
        recommendation: 'Verifique se os novos usuários foram criados com autorização.',
      });
    }
  }

  // MFA registration status — filter out guests and shared mailboxes
  if (credentialRegistration.length > 0) {
    // Build shared mailbox Sets for UPN and DisplayName matching
    const sharedMailboxUpns = new Set<string>();
    const sharedMailboxNames = new Set<string>();
    for (const m of exoSharedMailboxes) {
      const upn = (m.UserPrincipalName || m.PrimarySmtpAddress || '').toLowerCase();
      if (upn) sharedMailboxUpns.add(upn);
      const name = (m.DisplayName || m.displayName || '').toLowerCase().trim();
      if (name) sharedMailboxNames.add(name);
    }

    // Filter to member users only (exclude guests and shared mailboxes)
    const memberUsers = credentialRegistration.filter((u: any) => {
      // Exclude guests
      if (u.userType && u.userType.toLowerCase() !== 'member') return false;
      // Exclude shared mailboxes by UPN or DisplayName
      const upn = (u.userPrincipalName || '').toLowerCase();
      const displayName = (u.userDisplayName || '').toLowerCase().trim();
      if (sharedMailboxUpns.has(upn) || sharedMailboxNames.has(displayName)) return false;
      return true;
    });

    const noMfa = memberUsers.filter((u: any) =>
      u.isMfaRegistered === false || u.isMfaCapable === false
    );
    metrics.noMfaUsers = noMfa.length;

    if (noMfa.length > 0) {
      insights.push({
        id: 'users_no_mfa',
        category: 'identity_access',
        name: 'Usuários sem MFA Configurado',
        description: `${noMfa.length} usuário(s) sem registro de MFA — gap de segurança`,
        severity: noMfa.length > 20 ? 'critical' : noMfa.length > 5 ? 'high' : 'medium',
        affectedUsers: noMfa.slice(0, 20).map((u: any) => u.userPrincipalName || ''),
        count: noMfa.length,
        recommendation: 'Exija registro de MFA para todos os usuários.',
      });
    }
  }

  // Recent app registrations
  if (recentApps.length > 0) {
    metrics.recentAppRegistrations = recentApps.length;
    const recentOnes = recentApps.filter((app: any) => {
      const created = new Date(app.createdDateTime || 0).getTime();
      return Date.now() - created < 7 * 24 * 60 * 60 * 1000; // 7 days
    });
    if (recentOnes.length > 0) {
      insights.push({
        id: 'recent_app_registrations',
        category: 'identity_access',
        name: 'App Registrations Recentes',
        description: `${recentOnes.length} app(s) registrada(s) nos últimos 7 dias — possível Shadow IT`,
        severity: recentOnes.length > 5 ? 'high' : 'medium',
        count: recentOnes.length,
        recommendation: 'Verifique se os registros de aplicação são autorizados.',
      });
    }
  }

  // Service accounts with interactive login
  if (signInLogs.length > 0) {
    const serviceAccounts = new Set<string>();
    for (const log of signInLogs) {
      const user = (log.userPrincipalName || '').toLowerCase();
      if (user.includes('svc') || user.includes('service') || user.includes('noreply') || user.includes('admin@')) {
        if (log.isInteractive === true) {
          serviceAccounts.add(user);
        }
      }
    }
    metrics.serviceAccountInteractive = serviceAccounts.size;
    if (serviceAccounts.size > 0) {
      insights.push({
        id: 'service_account_interactive',
        category: 'identity_access',
        name: 'Service Account com Login Interativo',
        description: `${serviceAccounts.size} service account(s) com uso interativo indevido`,
        severity: 'high',
        affectedUsers: [...serviceAccounts].slice(0, 20),
        count: serviceAccounts.size,
        recommendation: 'Service accounts devem usar apenas autenticação não-interativa.',
      });
    }
  }

  // Granular pass insights per sub-check
  if (metrics.serviceAccountInteractive === 0) {
    insights.push({
      id: 'no_service_account_interactive',
      category: 'identity_access',
      name: 'Nenhum Service Account Interativo',
      description: 'Nenhum service account com login interativo detectado.',
      severity: 'info',
      status: 'pass',
    });
  }

  if (metrics.noMfaUsers === 0 && credentialRegistration.length > 0) {
    insights.push({
      id: 'all_users_mfa',
      category: 'identity_access',
      name: 'Todos Usuários com MFA',
      description: 'Todos os usuários possuem MFA configurado.',
      severity: 'info',
      status: 'pass',
    });
  }

  const recentAppsCount = recentApps.filter((app: any) => {
    const created = new Date(app.createdDateTime || 0).getTime();
    return Date.now() - created < 7 * 24 * 60 * 60 * 1000;
  }).length;
  if (recentAppsCount === 0) {
    insights.push({
      id: 'no_recent_app_registrations',
      category: 'identity_access',
      name: 'App Registrations em Conformidade',
      description: 'Nenhum registro de aplicação nos últimos 7 dias.',
      severity: 'info',
      status: 'pass',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module 10: Conditional Access
// ============================================

function analyzeConditionalAccess(
  caPolicies: any[],
  auditLogs: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    disabledPolicies: 0,
    reportOnlyPolicies: 0,
    excludedUsers: 0,
    recentlyCreated: 0,
  };

  if (caPolicies.length === 0) {
    insights.push({
      id: 'no_ca_policies',
      category: 'conditional_access',
      name: 'Nenhuma Política de Conditional Access',
      description: 'O tenant não tem políticas de Conditional Access configuradas',
      severity: 'critical',
      recommendation: 'Implemente políticas de CA para proteger o acesso ao tenant.',
    });
    return { insights, metrics };
  }

  for (const policy of caPolicies) {
    const name = policy.displayName || policy.id || 'Unknown';
    const state = (policy.state || '').toLowerCase();

    if (state === 'disabled') {
      metrics.disabledPolicies++;
      insights.push({
        id: `ca_disabled_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'conditional_access',
        name: 'Política de CA Desabilitada',
        description: `Política "${name}" está desabilitada — alto risco de exposição`,
        severity: 'high',
        recommendation: 'Ative a política ou documente o motivo da desabilitação.',
      });
    }

    if (state === 'enabledforreportingbutnotenforced') {
      metrics.reportOnlyPolicies++;
      insights.push({
        id: `ca_reportonly_${name.replace(/[^a-z0-9]/gi, '_')}`,
        category: 'conditional_access',
        name: 'Política de CA em Report-Only',
        description: `Política "${name}" em Report-only — não está sendo aplicada`,
        severity: 'medium',
        recommendation: 'Avalie se a política deve ser ativada.',
      });
    }

    // Check excluded users
    const excludedUsers = policy.conditions?.users?.excludeUsers || [];
    const excludedGroups = policy.conditions?.users?.excludeGroups || [];
    const totalExcluded = excludedUsers.length + excludedGroups.length;
    if (totalExcluded > 0) {
      metrics.excludedUsers += totalExcluded;
      if (totalExcluded > 5) {
        insights.push({
          id: `ca_excluded_${name.replace(/[^a-z0-9]/gi, '_')}`,
          category: 'conditional_access',
          name: 'Muitas Exclusões em Política de CA',
          description: `Política "${name}" tem ${totalExcluded} exclusão(ões) — backdoor involuntário`,
          severity: totalExcluded > 10 ? 'high' : 'medium',
          recommendation: 'Minimize exclusões em políticas de Conditional Access.',
        });
      }
    }
  }

  // New policies from audit logs
  if (Array.isArray(auditLogs)) {
    for (const log of auditLogs) {
      const activity = (log.activityDisplayName || '').toLowerCase();
      if (activity.includes('conditional access') && (activity.includes('add') || activity.includes('create'))) {
        metrics.recentlyCreated++;
      }
    }
    if (metrics.recentlyCreated > 0) {
      insights.push({
        id: 'ca_new_policies',
        category: 'conditional_access',
        name: 'Novas Políticas de CA Criadas',
        description: `${metrics.recentlyCreated} nova(s) política(s) de CA criada(s) no período`,
        severity: 'info',
        count: metrics.recentlyCreated,
        recommendation: 'Verifique se as mudanças foram planejadas.',
      });
    }
  }

  // Granular pass insights per sub-check
  if (metrics.disabledPolicies === 0 && caPolicies.length > 0) {
    insights.push({
      id: 'no_disabled_ca_policies',
      category: 'conditional_access',
      name: 'Nenhuma Política de CA Desabilitada',
      description: 'Todas as políticas de Conditional Access estão ativas.',
      severity: 'info',
      status: 'pass',
    });
  }

  if (metrics.excludedUsers === 0 && caPolicies.length > 0) {
    insights.push({
      id: 'no_excessive_ca_exclusions',
      category: 'conditional_access',
      name: 'Sem Exclusões Excessivas em CA',
      description: 'Nenhuma política de CA possui exclusões excessivas de usuários.',
      severity: 'info',
      status: 'pass',
    });
  }

  return { insights, metrics };
}

// ============================================
// Module 11: Exchange Health
// ============================================

function analyzeExchangeHealth(
  serviceHealthData: any[],
  exoMessageTrace: any[],
  exoSharedMailboxes: any[],
  exoConnectors: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    serviceIncidents: 0,
    messageTraceFailures: 0,
    sharedMailboxesNoOwner: 0,
    connectorFailures: 0,
  };

  // Service health incidents
  if (serviceHealthData.length > 0) {
    const activeIncidents = serviceHealthData.filter((i: any) =>
      (i.status || '').toLowerCase() !== 'resolved' && (i.status || '').toLowerCase() !== 'servicerestored'
    );
    metrics.serviceIncidents = activeIncidents.length;
    if (activeIncidents.length > 0) {
      insights.push({
        id: 'service_health_incidents',
        category: 'exchange_health',
        name: 'Incidentes Ativos Microsoft',
        description: `${activeIncidents.length} incidente(s) ativo(s) de serviço Exchange Online`,
        severity: activeIncidents.length > 2 ? 'high' : 'medium',
        count: activeIncidents.length,
        recommendation: 'Monitore os incidentes no painel de Service Health da Microsoft.',
      });
    }
  }

  // Message trace failures
  if (exoMessageTrace.length > 0) {
    const failures = exoMessageTrace.filter((msg: any) => {
      const status = (msg.Status || msg.DeliveryStatus || '').toLowerCase();
      return status !== 'delivered' && status !== 'resolved' && status !== '';
    });
    metrics.messageTraceFailures = failures.length;
    if (failures.length > 0) {
      insights.push({
        id: 'message_trace_failures',
        category: 'exchange_health',
        name: 'Falhas na Entrega de Email',
        description: `${failures.length} email(s) com falha de entrega no período`,
        severity: failures.length > 50 ? 'high' : 'medium',
        count: failures.length,
        recommendation: 'Investigue os problemas de entrega e verifique conectores.',
      });
    }
  }

  // Shared mailboxes without owner
  if (exoSharedMailboxes.length > 0) {
    const noOwner = exoSharedMailboxes.filter((mb: any) =>
      (mb.RecipientTypeDetails || '').includes('Shared') &&
      (!mb.GrantSendOnBehalfTo || mb.GrantSendOnBehalfTo === '{}' || mb.GrantSendOnBehalfTo === '')
    );
    metrics.sharedMailboxesNoOwner = noOwner.length;
    if (noOwner.length > 0) {
      insights.push({
        id: 'shared_mailbox_no_owner',
        category: 'exchange_health',
        name: 'Shared Mailboxes sem Owner',
        description: `${noOwner.length} shared mailbox(es) sem proprietário definido — falta de governança`,
        severity: 'medium',
        count: noOwner.length,
        recommendation: 'Atribua proprietários a todas as shared mailboxes.',
      });
    }
  }

  // Connector failures
  if (exoConnectors.length > 0) {
    const failedConnectors = exoConnectors.filter((c: any) =>
      (c.Status || c.Enabled) === false || (c.LastValidationResult || '').toLowerCase().includes('fail')
    );
    metrics.connectorFailures = failedConnectors.length;
    if (failedConnectors.length > 0) {
      insights.push({
        id: 'connector_failures',
        category: 'exchange_health',
        name: 'Problemas em Conectores',
        description: `${failedConnectors.length} conector(es) com falha ou desabilitado(s)`,
        severity: 'high',
        count: failedConnectors.length,
        recommendation: 'Verifique a configuração e validação dos conectores híbridos.',
      });
    }
  }

  return { insights, metrics };
}

// ============================================
// Module 12: Audit & Compliance
// ============================================

function analyzeAuditCompliance(
  auditLogs: any[],
  exoInboxRules: any[],
): { insights: M365AnalyzerInsight[]; metrics: Record<string, any> } {
  const insights: M365AnalyzerInsight[] = [];
  const metrics: Record<string, any> = {
    mailboxAuditAlerts: 0,
    adminAuditChanges: 0,
    newDelegations: 0,
    activeEdiscovery: 0,
  };

  if (!Array.isArray(auditLogs)) return { insights, metrics };

  for (const log of auditLogs) {
    const activity = (log.activityDisplayName || '').toLowerCase();
    const user = log.initiatedBy?.user?.userPrincipalName || '';

    // Admin audit changes
    if (activity.includes('reset password') || activity.includes('update user') ||
        activity.includes('add member to role') || activity.includes('remove member from role')) {
      metrics.adminAuditChanges++;
    }

    // New delegations
    if (activity.includes('add-mailboxpermission') || activity.includes('mailbox permission') ||
        activity.includes('add delegated') || activity.includes('grant') && activity.includes('access')) {
      metrics.newDelegations++;
      insights.push({
        id: `delegation_${user.replace(/[^a-z0-9]/gi, '_')}_${metrics.newDelegations}`,
        category: 'audit_compliance',
        name: 'Nova Delegação de Acesso',
        description: `${user} concedeu delegação: ${log.activityDisplayName || activity}`,
        severity: 'high',
        affectedUsers: user ? [user] : [],
        recommendation: 'Verifique se a delegação foi autorizada.',
      });
    }

    // E-discovery
    if (activity.includes('ediscovery') || activity.includes('compliance search') || activity.includes('content search')) {
      metrics.activeEdiscovery++;
    }

    // Mailbox audit alerts (non-owner access)
    if (activity.includes('mailboxlogin') || activity.includes('mailbox audit') ||
        (activity.includes('access') && activity.includes('mailbox'))) {
      metrics.mailboxAuditAlerts++;
    }
  }

  if (metrics.adminAuditChanges > 0) {
    insights.push({
      id: 'admin_audit_changes',
      category: 'audit_compliance',
      name: 'Mudanças Administrativas Críticas',
      description: `${metrics.adminAuditChanges} mudança(s) administrativa(s) crítica(s) detectada(s)`,
      severity: metrics.adminAuditChanges > 10 ? 'high' : 'medium',
      count: metrics.adminAuditChanges,
      recommendation: 'Monitore mudanças de senhas, roles e permissões.',
    });
  }

  if (metrics.mailboxAuditAlerts > 0) {
    insights.push({
      id: 'mailbox_audit_alerts',
      category: 'audit_compliance',
      name: 'Acessos a Mailbox Detectados',
      description: `${metrics.mailboxAuditAlerts} acesso(s) a caixas postais de terceiros detectado(s)`,
      severity: metrics.mailboxAuditAlerts > 5 ? 'high' : 'medium',
      count: metrics.mailboxAuditAlerts,
      recommendation: 'Verifique se os acessos são autorizados.',
    });
  }

  return { insights, metrics };
}

// ============================================
// Score Calculator
// ============================================

function calculateScore(insights: M365AnalyzerInsight[]): { score: number; summary: Record<string, number> } {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const insight of insights) {
    summary[insight.severity]++;
  }
  let score = 100;
  score -= summary.critical * 15;
  score -= summary.high * 8;
  score -= summary.medium * 3;
  score -= summary.low * 1;
  score = Math.max(0, Math.min(100, score));
  return { score, summary };
}

// ============================================
// Insight Consolidation (merge duplicates by name)
// ============================================

const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function consolidateInsights(insights: M365AnalyzerInsight[]): M365AnalyzerInsight[] {
  const groups = new Map<string, M365AnalyzerInsight[]>();

  for (const ins of insights) {
    const key = `${ins.category}::${ins.name}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ins);
  }

  const result: M365AnalyzerInsight[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Merge group
    const allUsers: string[] = [];
    let totalCount = 0;
    let highestSev = 'info';
    const userDetails: { user: string; description: string; count: number }[] = [];

    for (const ins of group) {
      if (ins.affectedUsers) {
        for (const u of ins.affectedUsers) {
          if (!allUsers.includes(u)) allUsers.push(u);
        }
      }
      const c = ins.count ?? 0;
      totalCount += c;

      if ((SEVERITY_ORDER[ins.severity] ?? 0) > (SEVERITY_ORDER[highestSev] ?? 0)) {
        highestSev = ins.severity;
      }

      // Capture per-user detail
      const userName = ins.affectedUsers?.[0] || 'desconhecido';
      userDetails.push({ user: userName, description: ins.description, count: c });
    }

    const base = group[0];
    const merged: M365AnalyzerInsight = {
      ...base,
      severity: highestSev as M365AnalyzerInsight['severity'],
      affectedUsers: allUsers,
      count: totalCount,
      description: `${allUsers.length} usuário(s) detectado(s) com ${base.name.toLowerCase()}. Total: ${totalCount} ocorrência(s).`,
      metadata: {
        ...(base.metadata || {}),
        userDetails,
      },
    };

    result.push(merged);
  }

  return result;
}


Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { snapshot_id, raw_data } = await req.json();

    if (!snapshot_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'snapshot_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[m365-analyzer] Processing snapshot: ${snapshot_id}, has raw_data: ${!!raw_data}`);

    // Fetch snapshot
    const { data: snapshot, error: snapError } = await supabase
      .from('m365_analyzer_snapshots')
      .select('*')
      .eq('id', snapshot_id)
      .single();

    if (snapError || !snapshot) {
      return new Response(
        JSON.stringify({ success: false, error: 'Snapshot not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase
      .from('m365_analyzer_snapshots')
      .update({ status: 'processing' })
      .eq('id', snapshot_id);

    // Data variables
    let emailActivity: any[] = [];
    let mailboxUsage: any[] = [];
    let signInLogs: any[] = [];
    let auditLogs: any[] = [];
    let threatData: any[] = [];
    let inboxRules: any[] = [];

    // EXO-specific data from agent
    let exoForwarding: any[] = [];
    let exoTransportRules: any[] = [];
    let exoOrgConfig: any[] = [];
    let exoSafeLinks: any[] = [];
    let exoSafeAttach: any[] = [];
    let exoAntiPhish: any[] = [];
    let exoContentFilter: any[] = [];
    let exoMalwareFilter: any[] = [];
    let exoRemoteDomains: any[] = [];

    // Phase 3 operational data
    let exoMailboxStats: any[] = [];
    let exoMailboxQuota: any[] = [];
    let exoMessageTrace: any[] = [];
    let exoInboxRules: any[] = [];
    let exoAuthPolicy: any[] = [];

    // NEW: Entra ID / Identity data
    let riskyUsersData: any[] = [];
    let credentialRegistration: any[] = [];
    let caPolicies: any[] = [];
    let recentApps: any[] = [];
    let serviceHealthData: any[] = [];
    let exoSharedMailboxes: any[] = [];
    let exoConnectors: any[] = [];

    let dataSource = 'none';
    let stepsReceived: string[] = [];

    // ── Strategy: try raw_data from agent first ──
    if (raw_data && typeof raw_data === 'object') {
      dataSource = 'agent';

      const keys = Object.keys(raw_data);
      stepsReceived = keys;
      console.log(`[m365-analyzer] raw_data keys (${keys.length}): ${keys.join(', ')}`);

      const get = (key: string) => normalizeStepData(raw_data[key]);

      // Graph API-style data
      signInLogs = get('signin_logs').concat(get('failed_signins'));
      auditLogs = get('audit_logs');
      emailActivity = get('email_activity');
      mailboxUsage = get('mailbox_usage');
      threatData = get('threat_data');
      inboxRules = get('inbox_rules');

      // EXO PowerShell config data
      exoForwarding = get('exo_mailbox_forwarding');
      exoTransportRules = get('exo_transport_rules');
      exoOrgConfig = get('exo_org_config');
      exoSafeLinks = get('exo_safe_links_policy');
      exoSafeAttach = get('exo_safe_attachment_policy');
      exoAntiPhish = get('exo_anti_phish_policy');
      exoContentFilter = get('exo_hosted_content_filter');
      exoMalwareFilter = get('exo_malware_filter_policy');
      exoRemoteDomains = get('exo_remote_domains');

      // NEW Phase 3: operational data
      exoMailboxStats = get('exo_mailbox_statistics');
      exoMailboxQuota = get('exo_mailbox_quota');
      exoMessageTrace = get('exo_message_trace');
      exoInboxRules = get('exo_inbox_rules');
      exoAuthPolicy = get('exo_auth_policy');

      // NEW: Entra ID / Identity data from agent
      riskyUsersData = get('risky_users');
      credentialRegistration = get('credential_registration');
      caPolicies = get('conditional_access_policies');
      recentApps = get('recent_app_registrations');
      serviceHealthData = get('service_health');
      exoSharedMailboxes = get('exo_shared_mailboxes');
      exoConnectors = get('exo_connectors');

      // Fallback: merge separate inbound/outbound connectors if exo_connectors is empty
      if (exoConnectors.length === 0) {
        exoConnectors = [...get('exo_inbound_connectors'), ...get('exo_outbound_connectors')];
      }

      // Alternate key names
      if (exoForwarding.length === 0) exoForwarding = get('exo_forwarding');
      if (exoAntiPhish.length === 0) exoAntiPhish = get('exo_antiphish_policy');
      if (exoContentFilter.length === 0) exoContentFilter = get('exo_content_filter');

      // Build inboxRules from forwarding + exoInboxRules for compromise module
      if (inboxRules.length === 0) {
        inboxRules = [
          ...exoForwarding
            .filter((f: any) => f.ForwardingSmtpAddress || f.ForwardingAddress)
            .map((f: any) => ({
              userPrincipalName: f.PrimarySmtpAddress || f.DisplayName || '',
              MailboxOwner: f.PrimarySmtpAddress || f.DisplayName || '',
              ruleName: 'Mailbox Forwarding',
              forwardTo: f.ForwardingSmtpAddress || f.ForwardingAddress || '',
              ForwardTo: f.ForwardingSmtpAddress || f.ForwardingAddress || '',
            })),
          ...exoInboxRules,
        ];
      }

      const exoTotal = exoForwarding.length + exoTransportRules.length + exoOrgConfig.length +
        exoSafeLinks.length + exoSafeAttach.length + exoAntiPhish.length +
        exoContentFilter.length + exoMalwareFilter.length + exoRemoteDomains.length +
        exoMailboxStats.length + exoMailboxQuota.length + exoMessageTrace.length +
        exoInboxRules.length + exoAuthPolicy.length;
      const graphTotal = signInLogs.length + auditLogs.length + emailActivity.length + mailboxUsage.length + threatData.length;
      const entraTotal = riskyUsersData.length + credentialRegistration.length + caPolicies.length + recentApps.length + serviceHealthData.length;

      console.log(`[m365-analyzer] Agent data: EXO=${exoTotal}, Graph=${graphTotal}, Entra=${entraTotal}`);
    }

    // ── Graph API fallback: only if NO useful data at all ──
    const hasAgentData = dataSource === 'agent' && (
      exoForwarding.length > 0 || exoTransportRules.length > 0 || exoOrgConfig.length > 0 ||
      exoSafeLinks.length > 0 || exoSafeAttach.length > 0 || exoAntiPhish.length > 0 ||
      exoContentFilter.length > 0 || exoMalwareFilter.length > 0 || exoRemoteDomains.length > 0 ||
      exoMailboxStats.length > 0 || exoMessageTrace.length > 0 || exoInboxRules.length > 0 ||
      signInLogs.length > 0 || auditLogs.length > 0 || emailActivity.length > 0
    );

    if (!hasAgentData) {
      const token = await getGraphToken(supabase, snapshot.tenant_record_id);
      if (token) {
        console.log('[m365-analyzer] Got Graph API token, collecting data...');
        dataSource = dataSource === 'agent' ? 'hybrid' : 'graph_api';

        // Use snapshot period window (consecutive, non-overlapping) — fallback to 1h if missing
        const periodStartISO = snapshot.period_start || new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const periodEndISO = snapshot.period_end || new Date().toISOString();
        const periodFilter = `&$filter=createdDateTime ge ${periodStartISO} and createdDateTime le ${periodEndISO}`;
        console.log(`[m365-analyzer] Graph API fallback window: ${periodStartISO} → ${periodEndISO}`);

        const [emailData, mailboxData, signInData, auditData, threatStatus,
               riskyUsersRes, credRegRes, caPoliciesRes, recentAppsRes, serviceHealthRes] = await Promise.all([
          graphGet(token, 'https://graph.microsoft.com/v1.0/reports/getEmailActivityUserDetail(period=\'D1\')'),
          graphGet(token, 'https://graph.microsoft.com/v1.0/reports/getMailboxUsageDetail(period=\'D1\')'),
          graphGet(token, `https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=500${periodFilter}`),
          graphGet(token, `https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?$top=500${periodFilter}`),
          graphGet(token, 'https://graph.microsoft.com/v1.0/reports/getEmailActivityUserDetail(period=\'D1\')'),
          graphGet(token, 'https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?$top=100'),
          graphGet(token, 'https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?$top=999'),
          graphGet(token, 'https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies'),
          graphGet(token, 'https://graph.microsoft.com/v1.0/applications?$orderby=createdDateTime desc&$top=50'),
          graphGet(token, 'https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$top=50'),
        ]);

        if (emailActivity.length === 0) emailActivity = Array.isArray(emailData?.value) ? emailData.value : [];
        if (mailboxUsage.length === 0) mailboxUsage = Array.isArray(mailboxData?.value) ? mailboxData.value : [];
        if (signInLogs.length === 0) signInLogs = Array.isArray(signInData?.value) ? signInData.value : [];
        if (auditLogs.length === 0) auditLogs = Array.isArray(auditData?.value) ? auditData.value : [];
        if (threatData.length === 0) threatData = Array.isArray(threatStatus?.value) ? threatStatus.value : [];
        if (riskyUsersData.length === 0) riskyUsersData = Array.isArray(riskyUsersRes?.value) ? riskyUsersRes.value : [];
        if (credentialRegistration.length === 0) credentialRegistration = Array.isArray(credRegRes?.value) ? credRegRes.value : [];
        if (caPolicies.length === 0) caPolicies = Array.isArray(caPoliciesRes?.value) ? caPoliciesRes.value : [];
        if (recentApps.length === 0) recentApps = Array.isArray(recentAppsRes?.value) ? recentAppsRes.value : [];
        if (serviceHealthData.length === 0) serviceHealthData = Array.isArray(serviceHealthRes?.value) ? serviceHealthRes.value : [];

        console.log(`[m365-analyzer] Graph enrichment: riskyUsers=${riskyUsersData.length}, credReg=${credentialRegistration.length}, caPolicies=${caPolicies.length}, apps=${recentApps.length}, serviceHealth=${serviceHealthData.length}`);
      } else if (dataSource === 'none') {
        console.error('[m365-analyzer] No data source available');
        await supabase
          .from('m365_analyzer_snapshots')
          .update({ status: 'failed', insights: [], metrics: { error: 'No data source: Graph API failed and no agent data' } })
          .eq('id', snapshot_id);
        return new Response(
          JSON.stringify({ success: false, error: 'No data source available' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.log('[m365-analyzer] Graph API unavailable, proceeding with agent data only');
      }
    }

    // Always try to enrich with Graph API for new modules (even if agent data exists)
    if (dataSource === 'agent' && (riskyUsersData.length === 0 || caPolicies.length === 0 || signInLogs.length === 0 || auditLogs.length === 0)) {
      const token = await getGraphToken(supabase, snapshot.tenant_record_id);
      if (token) {
        console.log('[m365-analyzer] Enriching agent data with Graph API for Entra ID modules...');
        // Use snapshot period window (consecutive, non-overlapping) — fallback to 1h if missing
        const enrichPeriodStartISO = snapshot.period_start || new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const enrichPeriodEndISO = snapshot.period_end || new Date().toISOString();
        const periodFilter = `&$filter=createdDateTime ge ${enrichPeriodStartISO} and createdDateTime le ${enrichPeriodEndISO}`;
        console.log(`[m365-analyzer] Graph enrichment window: ${enrichPeriodStartISO} → ${enrichPeriodEndISO}`);
        const enrichCalls = [];

        // Existing enrichment calls
        if (riskyUsersData.length === 0) enrichCalls.push(graphGet(token, 'https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?$top=100'));
        else enrichCalls.push(Promise.resolve(null));
        if (credentialRegistration.length === 0) enrichCalls.push(graphGet(token, 'https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?$top=999'));
        else enrichCalls.push(Promise.resolve(null));
        if (caPolicies.length === 0) enrichCalls.push(graphGet(token, 'https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies'));
        else enrichCalls.push(Promise.resolve(null));
        if (recentApps.length === 0) enrichCalls.push(graphGet(token, 'https://graph.microsoft.com/v1.0/applications?$orderby=createdDateTime desc&$top=50'));
        else enrichCalls.push(Promise.resolve(null));
        if (serviceHealthData.length === 0) enrichCalls.push(graphGet(token, 'https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$top=50'));
        else enrichCalls.push(Promise.resolve(null));

        // NEW: Sign-in logs and audit logs for Security Risk, Identity, and Audit modules
        if (signInLogs.length === 0) enrichCalls.push(graphGet(token, `https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=500${periodFilter}`));
        else enrichCalls.push(Promise.resolve(null));
        if (auditLogs.length === 0) enrichCalls.push(graphGet(token, `https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?$top=500${periodFilter}`));
        else enrichCalls.push(Promise.resolve(null));

        const [riskRes, credRes, caRes, appRes, shRes, signInRes, auditRes] = await Promise.all(enrichCalls);
        if (riskRes && riskyUsersData.length === 0) riskyUsersData = Array.isArray(riskRes.value) ? riskRes.value : [];
        if (credRes && credentialRegistration.length === 0) credentialRegistration = Array.isArray(credRes.value) ? credRes.value : [];
        if (caRes && caPolicies.length === 0) caPolicies = Array.isArray(caRes.value) ? caRes.value : [];
        if (appRes && recentApps.length === 0) recentApps = Array.isArray(appRes.value) ? appRes.value : [];
        if (shRes && serviceHealthData.length === 0) serviceHealthData = Array.isArray(shRes.value) ? shRes.value : [];
        if (signInRes && signInLogs.length === 0) signInLogs = Array.isArray(signInRes.value) ? signInRes.value : [];
        if (auditRes && auditLogs.length === 0) auditLogs = Array.isArray(auditRes.value) ? auditRes.value : [];

        dataSource = 'hybrid';
        console.log(`[m365-analyzer] Enriched: riskyUsers=${riskyUsersData.length}, credReg=${credentialRegistration.length}, caPolicies=${caPolicies.length}, signIns=${signInLogs.length}, audits=${auditLogs.length}`);
      }
    }

    console.log(`[m365-analyzer] Data ready (source=${dataSource}): emails=${emailActivity.length}, mailboxes=${mailboxUsage.length}, signIns=${signInLogs.length}, audits=${auditLogs.length}, exoFwd=${exoForwarding.length}, exoTransport=${exoTransportRules.length}, exoAntiPhish=${exoAntiPhish.length}, exoOrgCfg=${exoOrgConfig.length}, exoMbxStats=${exoMailboxStats.length}, exoMsgTrace=${exoMessageTrace.length}, exoInboxRules=${exoInboxRules.length}, exoAuthPolicy=${exoAuthPolicy.length}`);

    // Fetch tenant domains for exfiltration analysis
    let tenantDomains: string[] = [];
    try {
      const { data: acceptedDomains } = await supabase
        .from('m365_tenants')
        .select('tenant_domain')
        .eq('id', snapshot.tenant_record_id)
        .single();
      if (acceptedDomains?.tenant_domain) {
        tenantDomains = [acceptedDomains.tenant_domain];
      }
    } catch { /* ignore */ }

    // Also try accepted domains from EXO data
    const exoAcceptedDomains = normalizeStepData(raw_data?.exo_accepted_domains);
    for (const d of exoAcceptedDomains) {
      if (d.DomainName) tenantDomains.push(d.DomainName);
    }

    // Fetch existing baselines
    const { data: baselines } = await supabase
      .from('m365_user_baselines')
      .select('*')
      .eq('tenant_record_id', snapshot.tenant_record_id);

    // ── Run analysis modules ──
    const allInsights: M365AnalyzerInsight[] = [];

    const securityRisk = analyzeSecurityRisk(signInLogs, riskyUsersData);
    allInsights.push(...securityRisk.insights);

    const identityAccess = analyzeIdentityAccess(auditLogs, credentialRegistration, recentApps, signInLogs, exoSharedMailboxes);
    allInsights.push(...identityAccess.insights);

    const conditionalAccessResult = analyzeConditionalAccess(caPolicies, auditLogs);
    allInsights.push(...conditionalAccessResult.insights);

    const exchangeHealth = analyzeExchangeHealth(serviceHealthData, exoMessageTrace, exoSharedMailboxes, exoConnectors);
    allInsights.push(...exchangeHealth.insights);

    const auditCompliance = analyzeAuditCompliance(auditLogs, exoInboxRules);
    allInsights.push(...auditCompliance.insights);

    const phishing = analyzePhishingThreats(emailActivity, threatData, exoAntiPhish, exoSafeLinks, exoSafeAttach, exoContentFilter);
    allInsights.push(...phishing.insights);

    const mailbox = analyzeMailboxCapacity(mailboxUsage, exoMailboxStats, exoMailboxQuota);
    allInsights.push(...mailbox.insights);

    const behavioral = analyzeBehavioralBaseline(emailActivity, baselines || [], exoMessageTrace);
    allInsights.push(...behavioral.insights);

    const compromise = analyzeAccountCompromise(signInLogs, emailActivity, inboxRules);
    allInsights.push(...compromise.insights);

    const rules = analyzeSuspiciousRules(auditLogs, exoForwarding, exoTransportRules, exoInboxRules);
    allInsights.push(...rules.insights);

    const exfiltration = analyzeExfiltration(emailActivity, exoMessageTrace, tenantDomains);
    allInsights.push(...exfiltration.insights);

    const operational = analyzeOperationalRisks(signInLogs, auditLogs, exoOrgConfig, exoRemoteDomains, exoMalwareFilter, exoAuthPolicy);
    allInsights.push(...operational.insights);

    const threatProtection = analyzeThreatProtection(exoMessageTrace, threatData, exoContentFilter, exoMalwareFilter, exoAntiPhish, exoSafeLinks, exoSafeAttach);
    allInsights.push(...threatProtection.insights);

    const allMetrics = {
      securityRisk: {
        highRiskSignIns: securityRisk.metrics.highRiskSignIns || 0,
        mfaFailures: securityRisk.metrics.mfaFailures || 0,
        impossibleTravel: securityRisk.metrics.impossibleTravel || 0,
        blockedAccounts: securityRisk.metrics.blockedAccounts || 0,
        riskyUsers: securityRisk.metrics.riskyUsers || 0,
      },
      identity: {
        newUsers: identityAccess.metrics.newUsers || 0,
        disabledUsers: identityAccess.metrics.disabledUsers || 0,
        noMfaUsers: identityAccess.metrics.noMfaUsers || 0,
        noConditionalAccess: identityAccess.metrics.noConditionalAccess || 0,
        serviceAccountInteractive: identityAccess.metrics.serviceAccountInteractive || 0,
        recentAppRegistrations: identityAccess.metrics.recentAppRegistrations || 0,
      },
      conditionalAccess: {
        disabledPolicies: conditionalAccessResult.metrics.disabledPolicies || 0,
        reportOnlyPolicies: conditionalAccessResult.metrics.reportOnlyPolicies || 0,
        excludedUsers: conditionalAccessResult.metrics.excludedUsers || 0,
        recentlyCreated: conditionalAccessResult.metrics.recentlyCreated || 0,
      },
      exchangeHealth: {
        serviceIncidents: exchangeHealth.metrics.serviceIncidents || 0,
        messageTraceFailures: exchangeHealth.metrics.messageTraceFailures || 0,
        sharedMailboxesNoOwner: exchangeHealth.metrics.sharedMailboxesNoOwner || 0,
        connectorFailures: exchangeHealth.metrics.connectorFailures || 0,
      },
      audit: {
        mailboxAuditAlerts: auditCompliance.metrics.mailboxAuditAlerts || 0,
        adminAuditChanges: auditCompliance.metrics.adminAuditChanges || 0,
        newDelegations: auditCompliance.metrics.newDelegations || 0,
        activeEdiscovery: auditCompliance.metrics.activeEdiscovery || 0,
      },
      phishing: {
        totalBlocked: phishing.metrics.totalBlocked || 0,
        quarantined: phishing.metrics.quarantined || 0,
        topAttackedUsers: phishing.metrics.topAttackedUsers || [],
        topSenderDomains: phishing.metrics.topSenderDomains || [],
      },
      mailbox: {
        totalMailboxes: mailbox.metrics.totalMailboxes || 0,
        above80Pct: mailbox.metrics.above80Pct || 0,
        above90Pct: mailbox.metrics.above90Pct || 0,
        topMailboxes: mailbox.metrics.topMailboxes || [],
      },
      behavioral: {
        anomalousUsers: behavioral.metrics.anomalousUsers || 0,
        deviations: behavioral.metrics.deviations || [],
      },
      compromise: {
        suspiciousLogins: compromise.metrics.suspiciousLogins || 0,
        correlatedAlerts: compromise.metrics.correlatedAlerts || 0,
        topRiskUsers: compromise.metrics.topRiskUsers || [],
      },
      rules: {
        externalForwards: rules.metrics.externalForwards || 0,
        autoDelete: rules.metrics.autoDelete || 0,
        suspiciousRules: rules.metrics.suspiciousRules || [],
      },
      exfiltration: {
        highVolumeExternal: exfiltration.metrics.highVolumeExternal || 0,
        topExternalDomains: exfiltration.metrics.topExternalDomains || [],
      },
      operational: {
        smtpAuthEnabled: operational.metrics.smtpAuthEnabled || 0,
        legacyProtocols: operational.metrics.legacyProtocols || 0,
        inactiveWithActivity: operational.metrics.inactiveWithActivity || 0,
        fullAccessGrants: operational.metrics.fullAccessGrants || 0,
      },
      threatProtection: threatProtection.metrics,
      // ── Email Traffic Totals (contiguous window) ──
      emailTraffic: (() => {
        const tenantDomainsLower = tenantDomains.map(d => d.toLowerCase());
        let sentCount = 0;
        let receivedCount = 0;
        for (const msg of exoMessageTrace) {
          const sender = (msg.SenderAddress || msg.Sender || '').toLowerCase();
          const recipient = (msg.RecipientAddress || msg.Recipient || '').toLowerCase();
          const senderIsInternal = tenantDomainsLower.some(d => sender.endsWith('@' + d));
          const recipientIsInternal = tenantDomainsLower.some(d => recipient.endsWith('@' + d));
          if (senderIsInternal) sentCount++;
          if (recipientIsInternal) receivedCount++;
        }
        return { sent: sentCount, received: receivedCount, totalMessages: exoMessageTrace.length };
      })(),
      // ── Email Traffic Rankings ──
      emailTrafficRankings: (() => {
        const senderMap: Record<string, number> = {};
        const recipientMap: Record<string, number> = {};
        const destDomainMap: Record<string, number> = {};
        const srcDomainMap: Record<string, number> = {};
        for (const msg of exoMessageTrace) {
          const sender = (msg.SenderAddress || msg.Sender || '').toLowerCase();
          const recipient = (msg.RecipientAddress || msg.Recipient || '').toLowerCase();
          if (sender) senderMap[sender] = (senderMap[sender] || 0) + 1;
          if (recipient) recipientMap[recipient] = (recipientMap[recipient] || 0) + 1;
          // Domain extraction
          const destDomain = recipient.includes('@') ? recipient.split('@')[1] : '';
          const srcDomain = sender.includes('@') ? sender.split('@')[1] : '';
          if (destDomain) destDomainMap[destDomain] = (destDomainMap[destDomain] || 0) + 1;
          if (srcDomain) srcDomainMap[srcDomain] = (srcDomainMap[srcDomain] || 0) + 1;
        }
        const toTop = (map: Record<string, number>) =>
          Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count }));
        return {
          topSenders: toTop(senderMap),
          topRecipients: toTop(recipientMap),
          topDestinationDomains: toTop(destDomainMap),
          topSourceDomains: toTop(srcDomainMap),
        };
      })(),
      // ── Mailbox Detail Rankings ──
      mailboxRankings: (() => {
        const topForwarding = exoForwarding
          .filter((f: any) => f.ForwardingSmtpAddress || f.ForwardingAddress)
          .slice(0, 15)
          .map((f: any) => ({
            name: f.PrimarySmtpAddress || f.DisplayName || f.Identity || 'unknown',
            forwardTo: f.ForwardingSmtpAddress || f.ForwardingAddress || '',
          }));
        const topInactive = exoMailboxStats
          .filter((s: any) => {
            const ll = s.LastLogonTime || s.LastLoggedOnUserAccount;
            if (!ll) return true;
            const d = new Date(ll);
            return !isNaN(d.getTime()) && (Date.now() - d.getTime()) > 30 * 24 * 60 * 60 * 1000;
          })
          .slice(0, 15)
          .map((s: any) => ({
            name: s.DisplayName || s.MailboxIdentity || 'unknown',
            lastLogin: s.LastLogonTime || 'Nunca',
          }));
        const topOverQuota = exoMailboxStats
          .map((s: any) => {
            const used = parseSizeToBytes(s.TotalItemSize);
            const quota = 53687091200; // 50GB default
            return { name: s.DisplayName || s.MailboxIdentity || 'unknown', usagePct: Math.round((used / quota) * 100) };
          })
          .filter((m: any) => m.usagePct > 80)
          .sort((a: any, b: any) => b.usagePct - a.usagePct)
          .slice(0, 15);
        return { topForwarding, topInactive, topOverQuota };
      })(),
      // Shared mailbox UPNs for cross-referencing by entra-id-dashboard
      exoSharedMailboxes: exoSharedMailboxes.map((m: any) => ({
        UserPrincipalName: m.UserPrincipalName || m.PrimarySmtpAddress || '',
        DisplayName: m.DisplayName || '',
      })),
      dataSource,
      normalizationVersion: 4,
      stepsReceived,
    };

    // ── Consolidate duplicate insights (same name) ──
    const consolidatedInsights = consolidateInsights(allInsights);
    console.log(`[m365-analyzer] Consolidated ${allInsights.length} insights into ${consolidatedInsights.length}`);

    const { score, summary } = calculateScore(consolidatedInsights);

    console.log(`[m365-analyzer] Result: score=${score}, insights=${consolidatedInsights.length}, summary=${JSON.stringify(summary)}`);

    await supabase
      .from('m365_analyzer_snapshots')
      .update({
        status: 'completed',
        score,
        summary,
        insights: consolidatedInsights,
        metrics: allMetrics,
      })
      .eq('id', snapshot_id);

    // ── Invoke m365-external-movement to process user external metrics ──
    try {
      // Build user_metrics from exoMessageTrace grouped by sender
      const extUserMap: Record<string, { emails: number; sizeMB: number; domains: Set<string>; hours: number[]; domainsList: string[] }> = {};
      const tenantDomainsLower = tenantDomains.map(d => d.toLowerCase());

      for (const msg of exoMessageTrace) {
        const sender = (msg.SenderAddress || '').toLowerCase();
        const recipient = (msg.RecipientAddress || '').toLowerCase();
        const recipientDomain = recipient.includes('@') ? recipient.split('@')[1] : '';
        if (!recipientDomain || !sender) continue;

        const isExternal = tenantDomainsLower.length > 0
          ? !tenantDomainsLower.some(d => recipientDomain.endsWith(d))
          : recipientDomain !== (sender.includes('@') ? sender.split('@')[1] : '');

        if (!isExternal) continue;

        if (!extUserMap[sender]) {
          extUserMap[sender] = { emails: 0, sizeMB: 0, domains: new Set(), hours: [], domainsList: [] };
        }
        extUserMap[sender].emails++;
        extUserMap[sender].sizeMB += parseSizeToBytes(msg.Size) / (1024 * 1024);
        extUserMap[sender].domains.add(recipientDomain);

        // Parse hour from Received or Date field
        const dateStr = msg.Received || msg.Date || '';
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) extUserMap[sender].hours.push(d.getUTCHours());
        }
      }

      const userMetricsArray = Object.entries(extUserMap).map(([userId, u]) => {
        const hourArr = u.hours;
        const meanHour = hourArr.length > 0 ? hourArr.reduce((a, b) => a + b, 0) / hourArr.length : null;
        let stdHour: number | null = null;
        if (hourArr.length > 1 && meanHour !== null) {
          const variance = hourArr.reduce((sum, h) => sum + (h - meanHour) ** 2, 0) / hourArr.length;
          stdHour = Math.sqrt(variance);
        }
        const hourDist: Record<string, number> = {};
        for (const h of hourArr) { const k = String(h); hourDist[k] = (hourDist[k] || 0) + 1; }

        return {
          user_id: userId,
          total_external_emails: u.emails,
          total_external_mb: Math.round(u.sizeMB * 100) / 100,
          unique_domains: u.domains.size,
          mean_hour: meanHour !== null ? Math.round(meanHour * 10) / 10 : null,
          std_hour: stdHour !== null ? Math.round(stdHour * 10) / 10 : null,
          hour_distribution: hourDist,
          domains_list: Array.from(u.domains),
        };
      });

      if (userMetricsArray.length > 0) {
        // Build security signals from compromise/securityRisk insights
        const securitySignalsMap: Record<string, string[]> = {};
        for (const ins of allInsights) {
          if (ins.affectedUsers && (ins.category === 'account_compromise' || ins.category === 'security_risk')) {
            for (const u of ins.affectedUsers) {
              const uLower = u.toLowerCase();
              if (!securitySignalsMap[uLower]) securitySignalsMap[uLower] = [];
              securitySignalsMap[uLower].push(ins.id);
            }
          }
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const emResp = await fetch(`${supabaseUrl}/functions/v1/m365-external-movement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            tenant_record_id: snapshot.tenant_record_id,
            client_id: snapshot.client_id,
            snapshot_id,
            user_metrics: userMetricsArray,
            security_signals: securitySignalsMap,
          }),
        });
        const emBody = await emResp.text();
        console.log(`[m365-analyzer] m365-external-movement response (${emResp.status}): ${emBody.slice(0, 200)}`);
      } else {
        console.log('[m365-analyzer] No external user metrics to send to m365-external-movement');
      }
    } catch (emErr) {
      console.warn('[m365-analyzer] Failed to invoke m365-external-movement:', emErr);
    }

    // Proactive alert: insert system_alert when critical incidents detected
    if (summary.critical > 0) {
      try {
        // Fetch tenant display name for alert message
        const { data: tenantRow } = await supabase
          .from('m365_tenants')
          .select('display_name, tenant_domain')
          .eq('id', snapshot.tenant_record_id)
          .single();
        const tenantName = tenantRow?.display_name || tenantRow?.tenant_domain || 'Tenant';
        await supabase
          .from('system_alerts')
          .insert({
            alert_type: 'm365_analyzer_critical',
            severity: summary.critical >= 3 ? 'error' : 'warning',
            title: `M365 Analyzer: ${summary.critical} incidente${summary.critical > 1 ? 's' : ''} crítico${summary.critical > 1 ? 's' : ''} detectado${summary.critical > 1 ? 's' : ''}`,
            message: `Análise do tenant "${tenantName}" encontrou ${summary.critical} incidente(s) de severidade crítica. Verifique o Radar de Incidentes.`,
            metadata: {
              tenant_record_id: snapshot.tenant_record_id,
              snapshot_id,
              critical_count: summary.critical,
              high_count: summary.high,
              score,
            },
            is_active: true,
          });
        console.log(`[m365-analyzer] Created system_alert for ${summary.critical} critical incidents`);
      } catch (alertErr) {
        console.warn('[m365-analyzer] Failed to create system_alert:', alertErr);
      }
    }

    // Update baselines from effective activity (message trace or graph)
    const effectiveActivity = (behavioral.metrics as any)._effectiveActivity || emailActivity;
    if (effectiveActivity.length > 0 && (!baselines || baselines.length === 0)) {
      const baselineRows = effectiveActivity
        .filter((a: any) => a.userPrincipalName)
        .map((a: any) => ({
          tenant_record_id: snapshot.tenant_record_id,
          user_principal_name: a.userPrincipalName,
          avg_sent_daily: a.sendCount || 0,
          avg_received_daily: a.receiveCount || 0,
          avg_recipients_per_msg: 0,
          typical_send_hours: [],
          baseline_date: new Date().toISOString().split('T')[0],
          sample_days: 1,
        }));

      if (baselineRows.length > 0) {
        await supabase
          .from('m365_user_baselines')
          .upsert(baselineRows, { onConflict: 'tenant_record_id,user_principal_name' });
        console.log(`[m365-analyzer] Created ${baselineRows.length} baseline entries`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, snapshot_id, score, summary, insights_count: allInsights.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[m365-analyzer] Error:', error);
    try {
      const body = await req.clone().json().catch(() => ({}));
      const failSnapshotId = body?.snapshot_id;
      if (failSnapshotId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const sbAdmin = createClient(supabaseUrl, supabaseServiceKey);
        await sbAdmin
          .from('m365_analyzer_snapshots')
          .update({ status: 'failed', metrics: { error: String(error) } })
          .eq('id', failSnapshotId)
          .in('status', ['pending', 'processing']);
      }
    } catch { /* ignore cleanup error */ }

    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
