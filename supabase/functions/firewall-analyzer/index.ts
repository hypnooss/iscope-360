import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================
// Types
// ============================================

interface AnalyzerInsight {
  id: string;
  category: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  details?: string;
  sourceIPs?: string[];
  targetPorts?: number[];
  affectedUsers?: string[];
  count?: number;
  timeWindow?: string;
  recommendation?: string;
}

interface TopBlockedIP {
  ip: string;
  country?: string;
  count: number;
  targetPorts: number[];
}

// Sensitive ports
const SENSITIVE_PORTS = new Set([22, 23, 135, 139, 389, 445, 636, 1433, 1521, 3306, 3389, 5432, 5900, 8080, 8443]);
const PORT_SCAN_THRESHOLD = 10;
const BRUTE_FORCE_THRESHOLD = 5; // lowered from 10
const HIGH_VOLUME_AUTH_THRESHOLD = 20;
const HIGH_VOLUME_CONFIG_THRESHOLD = 50;
const HIGH_VOLUME_BLOCKED_THRESHOLD = 50; // lowered from 100

// ============================================
// GeoIP Resolution (fallback for FortiOS 7.2 and earlier)
// ============================================

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true; // not valid IPv4, skip
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  return false;
}

async function resolveGeoIP(ips: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  // Filter out private IPs
  const publicIPs = ips.filter(ip => !isPrivateIP(ip));
  if (publicIPs.length === 0) return result;

  // Limit to 100 IPs per batch (ip-api.com limit)
  const batch = publicIPs.slice(0, 100);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('http://ip-api.com/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch.map(ip => ({ query: ip, fields: 'query,country,status' }))),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[resolveGeoIP] API returned ${response.status}`);
      return result;
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      for (const entry of data) {
        if (entry.status === 'success' && entry.query && entry.country) {
          result[entry.query] = entry.country;
        }
      }
    }
    console.log(`[resolveGeoIP] Resolved ${Object.keys(result).length}/${batch.length} IPs`);
  } catch (err) {
    console.warn(`[resolveGeoIP] Fallback failed (silent):`, err instanceof Error ? err.message : err);
  }

  return result;
}

// ============================================
// Config change categories
// ============================================

function categorizeCfgPath(cfgpath: string): { category: string; label: string; severity: AnalyzerInsight['severity'] } {
  const p = cfgpath.toLowerCase();
  if (p.includes('firewall.policy') || p.includes('firewall.address') || p.includes('firewall.addrgrp') || p.includes('firewall.service'))
    return { category: 'Política de Firewall', label: 'Regras de acesso e objetos de firewall', severity: 'high' };
  if (p.includes('vpn.ipsec') || p.includes('vpn.ssl'))
    return { category: 'VPN', label: 'Configuração de túneis VPN', severity: 'high' };
  if (p.includes('system.admin') || p.includes('system.accprofile'))
    return { category: 'Administração', label: 'Contas e perfis administrativos', severity: 'critical' };
  if (p.includes('system.ha'))
    return { category: 'Alta Disponibilidade', label: 'Configuração de HA/cluster', severity: 'high' };
  if (p.includes('router.') || p.includes('system.interface'))
    return { category: 'Rede/Roteamento', label: 'Interfaces e rotas', severity: 'medium' };
  if (p.includes('system.'))
    return { category: 'Sistema', label: 'Configurações gerais do sistema', severity: 'low' };
  return { category: 'Outros', label: 'Outras configurações', severity: 'low' };
}

// ============================================
// Analysis Modules
// ============================================

function analyzeDeniedTraffic(logs: any[]): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  if (!Array.isArray(logs) || logs.length === 0) return { insights, metrics: { totalDenied: 0, topInboundBlockedIPs: [], topInboundBlockedCountries: [], inboundBlocked: 0 } };

  const ipMap: Record<string, { count: number; ports: Set<number>; country?: string }> = {};
  // Separate inbound blocked: public src → private/firewall dst
  const inboundIPMap: Record<string, { count: number; ports: Set<number>; country?: string }> = {};
  let inboundBlockedCount = 0;

  for (const log of logs) {
    const srcip = log.srcip || log.src || log.source;
    const dstip = log.dstip || log.dst || '';
    const dstport = parseInt(log.dstport || log.dst_port || log.service_port || '0');
    const country = log.srccountry || log.src_country || undefined;
    if (!srcip) continue;

    if (!ipMap[srcip]) ipMap[srcip] = { count: 0, ports: new Set(), country };
    ipMap[srcip].count++;
    if (dstport > 0) ipMap[srcip].ports.add(dstport);

    // Inbound blocked: source is public IP, dst is public IP, exclude management-plane traffic (subtype=local)
    const subtype = (log.subtype || '').toLowerCase();
    if (!isPrivateIP(srcip) && (!dstip || !isPrivateIP(dstip)) && subtype !== 'local') {
      inboundBlockedCount++;
      if (!inboundIPMap[srcip]) inboundIPMap[srcip] = { count: 0, ports: new Set(), country };
      inboundIPMap[srcip].count++;
      if (dstport > 0) inboundIPMap[srcip].ports.add(dstport);
    }
  }

  const topBlockedIPs: TopBlockedIP[] = Object.entries(ipMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([ip, data]) => ({
      ip,
      country: data.country,
      count: data.count,
      targetPorts: [...data.ports].sort((a, b) => a - b),
    }));

  // Inbound blocked rankings
  const topInboundBlockedIPs: TopBlockedIP[] = Object.entries(inboundIPMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([ip, data]) => ({
      ip,
      country: data.country,
      count: data.count,
      targetPorts: [...data.ports].sort((a, b) => a - b),
    }));

  const inboundCountryMap: Record<string, number> = {};
  for (const data of Object.values(inboundIPMap)) {
    if (data.country) inboundCountryMap[data.country] = (inboundCountryMap[data.country] || 0) + data.count;
  }
  const topInboundBlockedCountries = Object.entries(inboundCountryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, count]) => ({ country, count }));

  // Port scans
  for (const [ip, data] of Object.entries(ipMap)) {
    if (data.ports.size >= PORT_SCAN_THRESHOLD) {
      insights.push({
        id: `portscan_${ip}`,
        category: 'denied_traffic',
        name: 'Port Scan Detectado',
        description: `IP ${ip} tentou ${data.ports.size} portas diferentes`,
        severity: 'critical',
        sourceIPs: [ip],
        targetPorts: [...data.ports].sort((a, b) => a - b).slice(0, 20),
        count: data.count,
        recommendation: 'Considere bloquear este IP no firewall e investigar a origem.',
      });
    }
  }

  // Sensitive port attacks
  for (const [ip, data] of Object.entries(ipMap)) {
    const sensitivePorts = [...data.ports].filter(p => SENSITIVE_PORTS.has(p));
    if (sensitivePorts.length > 0 && data.count >= 5) {
      insights.push({
        id: `sensitive_${ip}`,
        category: 'denied_traffic',
        name: 'Tentativa em Porta Sensível',
        description: `IP ${ip} realizou ${data.count} tentativas para portas sensíveis: ${sensitivePorts.join(', ')}`,
        severity: data.count > 50 ? 'high' : 'medium',
        sourceIPs: [ip],
        targetPorts: sensitivePorts,
        count: data.count,
        recommendation: 'Verifique se estes serviços devem estar expostos externamente.',
      });
    }
  }

  // High-volume blocked IPs (threshold lowered to 50)
  for (const [ip, data] of Object.entries(ipMap)) {
    if (data.count >= HIGH_VOLUME_BLOCKED_THRESHOLD) {
      insights.push({
        id: `highvol_${ip}`,
        category: 'denied_traffic',
        name: 'Volume Alto de Bloqueios',
        description: `IP ${ip} teve ${data.count} tentativas bloqueadas`,
        severity: data.count >= 500 ? 'high' : 'medium',
        sourceIPs: [ip],
        count: data.count,
      });
    }
  }

  // Top countries
  const countryMap: Record<string, number> = {};
  for (const data of Object.values(ipMap)) {
    if (data.country) countryMap[data.country] = (countryMap[data.country] || 0) + data.count;
  }
  const topCountries = Object.entries(countryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, count]) => ({ country, count }));

  return {
    insights,
    metrics: {
      totalDenied: logs.length,
      topBlockedIPs,
      topCountries,
      topInboundBlockedIPs,
      topInboundBlockedCountries,
      inboundBlocked: inboundBlockedCount,
    },
  };
}

function analyzeAuthentication(authLogs: any[], vpnLogs: any[], ipCountryMap: Record<string, string> = {}): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  const rawAuth = Array.isArray(authLogs) ? authLogs : [];
  const rawVpn = Array.isArray(vpnLogs) ? vpnLogs : [];
  if (rawAuth.length === 0 && rawVpn.length === 0) return { insights, metrics: { vpnFailures: 0, firewallAuthFailures: 0, firewallAuthSuccesses: 0, vpnSuccesses: 0, topAuthIPs: [], topAuthCountries: [], topAuthIPsFailed: [], topAuthIPsSuccess: [], topAuthCountriesFailed: [], topAuthCountriesSuccess: [] } };

  // ── Deduplication: prevent the same log from being counted in both sets ──
  const seenIds = new Set<string>();
  const dedup = (logs: any[]) => logs.filter(l => {
    const logId = l.id || l.eventid || `${l.date}_${l.time}_${l.srcip}_${l.user}`;
    if (seenIds.has(logId)) return false;
    seenIds.add(logId);
    return true;
  });

  // ── Trust the agent's collection separation: authData = FW admin logs, vpnData = VPN logs ──
  // No subtype filtering — the agent already collected them from distinct endpoints.
  // Dedup removes any cross-collection duplicates by event ID.
  const safeAuth = dedup(rawAuth);
  const safeVpn = dedup(rawVpn);

  console.log(`[analyzeAuthentication] After filtering: auth=${safeAuth.length} (raw=${rawAuth.length}), vpn=${safeVpn.length} (raw=${rawVpn.length})`);

  const isFailure = (l: any) => {
    const action = (l.action || l.status || '').toLowerCase();
    const logdesc = (l.logdesc || l.msg || '').toLowerCase();
    return action.includes('deny') || action.includes('fail') || logdesc.includes('fail') || logdesc.includes('denied');
  };

  const isSuccess = (l: any) => {
    if (isFailure(l)) return false;
    const action = (l.action || l.status || '').toLowerCase();
    const logdesc = (l.logdesc || l.msg || '').toLowerCase();
    return action.includes('success') || action.includes('allow') || action.includes('accept') ||
           logdesc.includes('success') || logdesc.includes('logged in') || logdesc.includes('tunnel up');
  };

  // Separate failures and successes
  const firewallFailures = safeAuth.filter(isFailure);
  const vpnOnlyFailures = safeVpn.filter(isFailure);
  const firewallSuccesses = safeAuth.filter(isSuccess);
  const vpnSuccesses = safeVpn.filter(isSuccess);

  // Helper to collect IP and country rankings from a set of logs
  // Extract IP from FortiOS 'ui' field (e.g. "https(10.0.0.1)" or "ssh(1.2.3.4)")
  const extractIpFromUi = (ui: string): string | null => {
    if (!ui) return null;
    const match = ui.match(/\(([^)]+)\)/);
    return match?.[1] || null;
  };

  const collectRankings = (logs: any[]) => {
    const ipMap: Record<string, { count: number; country?: string; ports: Set<number> }> = {};
    const countryMap: Record<string, number> = {};
    for (const log of logs) {
      const ip = log.srcip || log.remip || log.src || extractIpFromUi(log.ui);
      const country = log.srccountry || log.src_country || (ip ? ipCountryMap[ip] : undefined) || undefined;
      if (!ip) continue;
      if (!ipMap[ip]) ipMap[ip] = { count: 0, country, ports: new Set() };
      ipMap[ip].count++;
      const port = parseInt(log.dstport || log.dst_port || '0');
      if (port > 0) ipMap[ip].ports.add(port);
      if (country) countryMap[country] = (countryMap[country] || 0) + 1;
    }
    const topIPs = Object.entries(ipMap)
      .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
      .map(([ip, data]) => ({ ip, country: data.country, count: data.count, targetPorts: [...data.ports].sort((a, b) => a - b) }));
    const topCountries = Object.entries(countryMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([country, count]) => ({ country, count }));
    return { topIPs, topCountries };
  };

  const allFailed = [...firewallFailures, ...vpnOnlyFailures];
  const allSuccess = [...firewallSuccesses, ...vpnSuccesses];
  const failedRank = collectRankings(allFailed);
  const successRank = collectRankings(allSuccess);
  // Combined (backward compat)
  const combinedRank = collectRankings([...allFailed, ...allSuccess]);

  // Group failures by user for brute force detection
  const groupByUser = (logs: any[]) => {
    const map: Record<string, { count: number; ips: Set<string> }> = {};
    for (const log of logs) {
      const user = log.user || log.username || log.srcuser || 'unknown';
      if (!map[user]) map[user] = { count: 0, ips: new Set() };
      map[user].count++;
      const ip = log.srcip || log.remip || log.src;
      if (ip) map[user].ips.add(ip);
    }
    return map;
  };

  const fwUserFailures = groupByUser(firewallFailures);
  const vpnUserFailures = groupByUser(vpnOnlyFailures);

  // Brute force per user
  const detectBruteForce = (userMap: Record<string, { count: number; ips: Set<string> }>, source: string) => {
    for (const [user, data] of Object.entries(userMap)) {
      if (data.count >= BRUTE_FORCE_THRESHOLD) {
        insights.push({
          id: `bruteforce_${source}_${user}`,
          category: 'authentication',
          name: `Possível Brute Force (${source})`,
          description: `Usuário "${user}" teve ${data.count} falhas de login via ${source}`,
          severity: data.count >= 50 ? 'critical' : data.count >= 20 ? 'high' : 'medium',
          affectedUsers: [user],
          sourceIPs: [...data.ips],
          count: data.count,
          recommendation: 'Verifique se a conta está comprometida. Considere bloqueio temporário.',
        });
      }
    }
  };
  detectBruteForce(fwUserFailures, 'Firewall');
  detectBruteForce(vpnUserFailures, 'VPN');

  // High volume firewall auth failures insight
  if (firewallFailures.length >= HIGH_VOLUME_AUTH_THRESHOLD) {
    const topUsers = Object.entries(fwUserFailures).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const topUsersDesc = topUsers.map(([user, data]) => `${user} (${data.count} falhas, IPs: ${[...data.ips].slice(0, 3).join(', ')})`).join('; ');
    insights.push({
      id: 'high_volume_firewall_auth_failures',
      category: 'authentication',
      name: 'Alto Volume de Falhas de Login no Firewall',
      description: `${firewallFailures.length} falhas de login administrativo detectadas no período`,
      severity: firewallFailures.length >= 100 ? 'critical' : firewallFailures.length >= 50 ? 'high' : 'medium',
      count: firewallFailures.length,
      details: `Top usuários: ${topUsersDesc}`,
      affectedUsers: topUsers.map(([u]) => u),
      recommendation: 'Investigue tentativas de acesso não autorizado ao painel administrativo do firewall.',
    });
  }

  // High volume VPN failures insight
  if (vpnOnlyFailures.length >= HIGH_VOLUME_AUTH_THRESHOLD) {
    let sslCount = 0, ipsecCount = 0, otherCount = 0;
    for (const log of vpnOnlyFailures) {
      const tunnel = (log.tunneltype || log.logdesc || log.msg || '').toLowerCase();
      if (tunnel.includes('ssl')) sslCount++;
      else if (tunnel.includes('ipsec')) ipsecCount++;
      else otherCount++;
    }
    const typeBreakdown = [sslCount > 0 ? `SSL: ${sslCount}` : '', ipsecCount > 0 ? `IPsec: ${ipsecCount}` : '', otherCount > 0 ? `Outros: ${otherCount}` : ''].filter(Boolean).join(', ');
    const topUsers = Object.entries(vpnUserFailures).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const topUsersDesc = topUsers.map(([user, data]) => `${user} (${data.count} falhas)`).join('; ');
    insights.push({
      id: 'high_volume_vpn_failures',
      category: 'authentication',
      name: 'Alto Volume de Falhas de VPN',
      description: `${vpnOnlyFailures.length} falhas de VPN detectadas no período`,
      severity: vpnOnlyFailures.length >= 100 ? 'critical' : vpnOnlyFailures.length >= 50 ? 'high' : 'medium',
      count: vpnOnlyFailures.length,
      details: `Tipos: ${typeBreakdown}. Top usuários: ${topUsersDesc}`,
      affectedUsers: topUsers.map(([u]) => u),
      recommendation: 'Investigue a origem das falhas de VPN. Verifique credenciais e configurações de acesso remoto.',
    });
  }

  // Detect admin login via WAN
  const allLogs = [...safeAuth, ...safeVpn];
  for (const log of allLogs) {
    const user = (log.user || log.username || '').toLowerCase();
    const ui = (log.ui || log.interface || '').toLowerCase();
    const action = (log.action || log.status || '').toLowerCase();
    if ((user.includes('admin') || log.group === 'admin') && (ui.includes('wan') || ui.includes('external')) && action.includes('success')) {
      insights.push({
        id: `admin_wan_${user}`,
        category: 'authentication',
        name: 'Login Admin via WAN',
        description: `Administrador "${user}" autenticou via interface pública`,
        severity: 'critical',
        affectedUsers: [user],
        sourceIPs: [log.srcip || log.remip].filter(Boolean),
        recommendation: 'Login admin via WAN é um risco crítico. Restrinja acesso administrativo à LAN.',
      });
      break;
    }
  }

  // Separated FW and VPN rankings
  const fwFailedRank = collectRankings(firewallFailures);
  const fwSuccessRank = collectRankings(firewallSuccesses);
  const vpnFailedRank = collectRankings(vpnOnlyFailures);
  const vpnSuccessRank = collectRankings(vpnSuccesses);

  // VPN user rankings (fallback when IP data is unavailable)
  const vpnSuccessUsers = groupByUser(vpnSuccesses);
  const topVpnUsersFailed = Object.entries(vpnUserFailures)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
    .map(([user, data]) => ({ user, ip: [...data.ips][0], count: data.count }));
  const topVpnUsersSuccess = Object.entries(vpnSuccessUsers)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
    .map(([user, data]) => ({ user, ip: [...data.ips][0], count: data.count }));

  return {
    insights,
    metrics: {
      vpnFailures: vpnOnlyFailures.length,
      firewallAuthFailures: firewallFailures.length,
      firewallAuthSuccesses: firewallSuccesses.length,
      vpnSuccesses: vpnSuccesses.length,
      topAuthIPs: combinedRank.topIPs,
      topAuthCountries: combinedRank.topCountries,
      topAuthIPsFailed: failedRank.topIPs,
      topAuthIPsSuccess: successRank.topIPs,
      topAuthCountriesFailed: failedRank.topCountries,
      topAuthCountriesSuccess: successRank.topCountries,
      // Separated by source
      topFwAuthIPsFailed: fwFailedRank.topIPs,
      topFwAuthIPsSuccess: fwSuccessRank.topIPs,
      topFwAuthCountriesFailed: fwFailedRank.topCountries,
      topFwAuthCountriesSuccess: fwSuccessRank.topCountries,
      topVpnAuthIPsFailed: vpnFailedRank.topIPs,
      topVpnAuthIPsSuccess: vpnSuccessRank.topIPs,
      topVpnAuthCountriesFailed: vpnFailedRank.topCountries,
      topVpnAuthCountriesSuccess: vpnSuccessRank.topCountries,
      topVpnUsersFailed,
      topVpnUsersSuccess,
    },
  };
}

function analyzeIPS(logs: any[], ipCountryMap: Record<string, string> = {}): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  if (!Array.isArray(logs) || logs.length === 0) {
    return { insights, metrics: { ipsEvents: 0, topIpsAttackTypes: [], topIpsSrcIPs: [], topIpsSrcCountries: [], topIpsDstIPs: [] } };
  }

  const attackMap: Record<string, { count: number; severity: string; srcIPs: Set<string>; dstIPs: Set<string> }> = {};
  const srcIPMap: Record<string, { count: number; country?: string }> = {};
  const dstIPMap: Record<string, { count: number }> = {};
  const srcCountryMap: Record<string, number> = {};

  for (const log of logs) {
    const attack = log.attack || log.msg || log.logdesc || 'unknown';
    const severity = (log.severity || log.crseverity || '').toString();
    const srcip = log.srcip || log.src || '';
    const dstip = log.dstip || log.dst || '';
    const country = log.srccountry || log.src_country || (srcip ? ipCountryMap[srcip] : undefined) || undefined;

    if (!attackMap[attack]) attackMap[attack] = { count: 0, severity, srcIPs: new Set(), dstIPs: new Set() };
    attackMap[attack].count++;
    if (srcip) attackMap[attack].srcIPs.add(srcip);
    if (dstip) attackMap[attack].dstIPs.add(dstip);

    // Aggregate srcip for rankings
    if (srcip) {
      if (!srcIPMap[srcip]) srcIPMap[srcip] = { count: 0, country };
      srcIPMap[srcip].count++;
      if (country) srcCountryMap[country] = (srcCountryMap[country] || 0) + 1;
    }
    // Aggregate dstip for rankings
    if (dstip) {
      if (!dstIPMap[dstip]) dstIPMap[dstip] = { count: 0 };
      dstIPMap[dstip].count++;
    }
  }

  // C2 patterns
  for (const log of logs) {
    const msg = ((log.msg || '') + ' ' + (log.attack || '')).toLowerCase();
    if (msg.includes('command') && msg.includes('control') || msg.includes('c2') || msg.includes('beacon') || msg.includes('botnet')) {
      insights.push({
        id: `c2_${log.srcip || 'unknown'}`,
        category: 'ips_ids',
        name: 'Comunicação C2 Detectada',
        description: `Possível comunicação com servidor de Comando e Controle: ${log.msg || log.attack}`,
        severity: 'critical',
        sourceIPs: [log.srcip].filter(Boolean),
        details: `Destino: ${log.dstip || 'N/A'}, Porta: ${log.dstport || 'N/A'}`,
        recommendation: 'Isole o host imediatamente e investigue possível comprometimento.',
      });
    }
  }

  // Per attack type insight
  for (const [attack, data] of Object.entries(attackMap)) {
    const sevNum = parseInt(data.severity);
    const mappedSeverity: AnalyzerInsight['severity'] = 
      sevNum <= 1 ? 'critical' : sevNum <= 2 ? 'high' : sevNum <= 3 ? 'medium' : 'low';

    insights.push({
      id: `ips_${attack.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}`,
      category: 'ips_ids',
      name: attack.length > 60 ? attack.slice(0, 57) + '...' : attack,
      description: `${data.count} evento(s) detectado(s) afetando ${data.dstIPs.size} host(s) interno(s)`,
      severity: mappedSeverity,
      sourceIPs: [...data.srcIPs].slice(0, 10),
      count: data.count,
    });
  }

  // Build ranking arrays
  const topIpsAttackTypes = Object.entries(attackMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([category, data]) => ({ category, count: data.count }));

  const topIpsSrcIPs = Object.entries(srcIPMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([ip, data]) => ({ ip, country: data.country, count: data.count, targetPorts: [] }));

  const topIpsSrcCountries = Object.entries(srcCountryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, count]) => ({ country, count }));

  const topIpsDstIPs = Object.entries(dstIPMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([ip, data]) => ({ ip, count: data.count, targetPorts: [] }));

  return {
    insights,
    metrics: {
      ipsEvents: logs.length,
      topIpsAttackTypes,
      topIpsSrcIPs,
      topIpsSrcCountries,
      topIpsDstIPs,
    },
  };
}

function analyzeConfigChanges(logs: any[]): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  if (!Array.isArray(logs) || logs.length === 0) return { insights, metrics: { configChanges: 0 } };

  // === Categorize by cfgpath for FortiGate-specific parsing ===
  const cfgCategories: Record<string, { count: number; users: Set<string>; objects: Set<string>; actions: Set<string> }> = {};

  for (const log of logs) {
    const msg = (log.msg || log.logdesc || log.action || '').toLowerCase();
    const user = log.user || log.ui || 'unknown';
    const cfgpath = log.cfgpath || '';
    const cfgobj = log.cfgobj || '';
    const cfgattr = log.cfgattr || '';
    const logAction = (log.action || '').toLowerCase();

    // --- FortiGate cfgpath-based detection ---
    if (cfgpath) {
      const cat = categorizeCfgPath(cfgpath);
      const key = cat.category;
      if (!cfgCategories[key]) cfgCategories[key] = { count: 0, users: new Set(), objects: new Set(), actions: new Set() };
      cfgCategories[key].count++;
      cfgCategories[key].users.add(user);
      if (cfgobj) cfgCategories[key].objects.add(`${cfgpath}:${cfgobj}`);
      if (logAction) cfgCategories[key].actions.add(logAction);
    }

    // --- Legacy msg-based detection ---
    // Detect admin creation
    if (msg.includes('add') && msg.includes('admin')) {
      insights.push({
        id: `newadmin_${user}`,
        category: 'config_changes',
        name: 'Novo Admin Criado',
        description: `Usuário admin criado por "${user}"`,
        severity: 'high',
        affectedUsers: [user],
        recommendation: 'Verifique se esta ação foi autorizada.',
      });
    }

    // Detect policy/rule changes (expanded keywords)
    if (msg.includes('policy') || msg.includes('rule') || msg.includes('firewall') ||
        msg.includes('edit') || msg.includes('set') || msg.includes('delete') ||
        msg.includes('modify') || msg.includes('add')) {
      // Only create individual insight for critical keywords (policy/rule/firewall/admin)
      if (msg.includes('policy') || msg.includes('rule') || msg.includes('firewall')) {
        insights.push({
          id: `configchg_${log.logid || log.id || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          category: 'config_changes',
          name: 'Alteração de Política',
          description: `Alteração detectada: ${log.msg || log.logdesc || 'política de segurança modificada'}`,
          severity: 'medium',
          affectedUsers: [user],
          details: `Usuário: ${user}, Ação: ${log.action || 'N/A'}${cfgpath ? `, Path: ${cfgpath}` : ''}${cfgobj ? `, Objeto: ${cfgobj}` : ''}`,
        });
      }
    }
  }

  // === NEW: Generate insights per cfgpath category ===
  for (const [catName, data] of Object.entries(cfgCategories)) {
    if (data.count >= 1) {
      const cat = categorizeCfgPath(
        catName === 'Política de Firewall' ? 'firewall.policy' :
        catName === 'VPN' ? 'vpn.ipsec' :
        catName === 'Administração' ? 'system.admin' :
        catName === 'Alta Disponibilidade' ? 'system.ha' :
        catName === 'Rede/Roteamento' ? 'router.static' :
        catName === 'Sistema' ? 'system.global' : 'other'
      );

      const objectsList = [...data.objects].slice(0, 5).join(', ');

      insights.push({
        id: `cfgcat_${catName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`,
        category: 'config_changes',
        name: `Alterações em ${catName}`,
        description: `${data.count} alteração(ões) em ${catName.toLowerCase()} por ${data.users.size} usuário(s)`,
        severity: cat.severity,
        count: data.count,
        affectedUsers: [...data.users],
        details: objectsList ? `Objetos alterados: ${objectsList}` : undefined,
        recommendation: catName === 'Administração'
          ? 'Alterações administrativas devem ser auditadas com rigor. Verifique se foram autorizadas.'
          : catName === 'Política de Firewall'
          ? 'Mudanças em políticas de firewall podem abrir brechas de segurança. Revise as alterações.'
          : undefined,
      });
    }
  }

  // Filter real modifications (not reads/queries)
  const MODIFY_ACTIONS = ['add', 'edit', 'delete', 'set', 'move', 'modify', 'create', 'remove'];
  // System action patterns to exclude (IPsec SA negotiations, VPN tunnel events)
  const SYSTEM_ACTION_PATTERNS = ['phase1_sa', 'phase2_sa', 'tunnel-up', 'tunnel-down', 'tunnel-stats', 'negotiate', 'ike_'];
  const IP_REGEX = /^\d+\.\d+\.\d+/;

  const realChanges = logs.filter(log => {
    const action = (log.action || '').toLowerCase();
    const msg = (log.msg || log.logdesc || '').toLowerCase();
    const user = (log.user || log.ui || '').trim();
    const cfgpath = (log.cfgpath || '').trim();

    // Must be a modification action
    const isModify = action
      ? MODIFY_ACTIONS.some(a => action.includes(a))
      : MODIFY_ACTIONS.some(a => msg.includes(a));
    if (!isModify) return false;

    // Exclude system/automated actions (IPsec, VPN tunnel events)
    if (SYSTEM_ACTION_PATTERNS.some(p => action.includes(p) || msg.includes(p))) return false;

    // Exclude entries where user is an IP address (automated system events)
    if (!user || user === 'unknown' || IP_REGEX.test(user)) return false;

    // Require cfgpath to be present (real config changes always have a path)
    if (!cfgpath) return false;

    return true;
  });

  const realCount = realChanges.length;

  // === Aggregate high-volume config changes insight ===
  if (realCount >= HIGH_VOLUME_CONFIG_THRESHOLD) {
    const allUsers = new Set<string>();
    for (const log of (realChanges.length > 0 ? realChanges : logs)) {
      allUsers.add(log.user || log.ui || 'unknown');
    }

    insights.push({
      id: 'high_volume_config_changes',
      category: 'config_changes',
      name: 'Volume Elevado de Alterações',
      description: `${realCount} alterações de configuração detectadas no período`,
      severity: realCount >= 200 ? 'high' : 'medium',
      count: realCount,
      affectedUsers: [...allUsers],
      details: `Realizado por ${allUsers.size} usuário(s). Categorias: ${Object.keys(cfgCategories).join(', ') || 'não categorizadas'}`,
      recommendation: 'Um volume alto de alterações pode indicar manutenção programada ou atividade não autorizada. Revise o contexto.',
    });
  }

  // Build configChangeDetails for audit page
  const configChangeDetails = (realChanges.length > 0 ? realChanges : []).map((log: any) => {
    const cfgpath = log.cfgpath || '';
    const cat = cfgpath ? categorizeCfgPath(cfgpath) : { category: 'Outros', severity: 'low' as const };
    return {
      user: log.user || log.ui || 'unknown',
      action: log.action || '',
      cfgpath,
      cfgobj: log.cfgobj || '',
      cfgattr: log.cfgattr || '',
      msg: log.msg || log.logdesc || '',
      date: (log.date && log.time) ? `${log.date}T${log.time}-03:00` : log.date || log.eventtime || '',
      category: cat.category,
      severity: cat.severity,
    };
  });

  return {
    insights,
    metrics: { configChanges: realCount, configChangeDetails },
  };
}

// ============================================
// Web Filter & App Control Analysis
// ============================================

function analyzeWebFilter(logs: any[]): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  if (!Array.isArray(logs) || logs.length === 0) return { insights, metrics: { webFilterBlocked: 0, topWebFilterCategories: [], topWebFilterUsers: [] } };

  const catMap: Record<string, number> = {};
  const userMap: Record<string, { count: number; ip?: string }> = {};

  for (const log of logs) {
    const category = log.catdesc || log.cat || log.category || 'Uncategorized';
    catMap[category] = (catMap[category] || 0) + 1;

    const user = log.user || log.srcuser || '';
    const ip = log.srcip || log.src || '';
    const key = user || ip || 'unknown';
    if (!userMap[key]) userMap[key] = { count: 0, ip: user ? ip : undefined };
    userMap[key].count++;
  }

  const topWebFilterCategories = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([category, count]) => ({ category, count }));

  const topWebFilterUsers = Object.entries(userMap)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
    .map(([user, data]) => ({ user, ip: data.ip, count: data.count }));

  // High-risk categories insight
  const highRiskKeywords = ['malware', 'phishing', 'botnet', 'command-and-control', 'malicious', 'spam', 'ransomware'];
  for (const [cat, count] of Object.entries(catMap)) {
    if (highRiskKeywords.some(k => cat.toLowerCase().includes(k)) && count >= 1) {
      insights.push({
        id: `webfilter_highrisk_${cat.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`,
        category: 'dns_security',
        name: `Web Filter: Categoria de Alto Risco`,
        description: `${count} bloqueio(s) na categoria "${cat}"`,
        severity: count >= 20 ? 'critical' : count >= 5 ? 'high' : 'medium',
        count,
        recommendation: 'Investigue os hosts internos que tentaram acessar estas categorias.',
      });
    }
  }

  return { insights, metrics: { webFilterBlocked: logs.length, topWebFilterCategories, topWebFilterUsers } };
}

function analyzeAppControl(logs: any[]): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  if (!Array.isArray(logs) || logs.length === 0) return { insights, metrics: { appControlBlocked: 0, topAppControlApps: [], topAppControlUsers: [] } };

  const appMap: Record<string, { count: number; category?: string }> = {};
  const userMap: Record<string, { count: number; ip?: string }> = {};

  for (const log of logs) {
    const app = log.app || log.appname || log.appcat || 'Unknown';
    const appcat = log.appcat || log.appcategory || undefined;
    if (!appMap[app]) appMap[app] = { count: 0, category: appcat };
    appMap[app].count++;

    const user = log.user || log.srcuser || '';
    const ip = log.srcip || log.src || '';
    const key = user || ip || 'unknown';
    if (!userMap[key]) userMap[key] = { count: 0, ip: user ? ip : undefined };
    userMap[key].count++;
  }

  const topAppControlApps = Object.entries(appMap)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
    .map(([app, data]) => ({ app: app, category: data.category, count: data.count }));

  const topAppControlUsers = Object.entries(userMap)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
    .map(([user, data]) => ({ user, ip: data.ip, count: data.count }));

  // High-risk app categories
  const highRiskApps = ['p2p', 'proxy', 'remote.access', 'tor', 'vpn.tunnel', 'botnet'];
  for (const [app, data] of Object.entries(appMap)) {
    const appLower = app.toLowerCase();
    const catLower = (data.category || '').toLowerCase();
    if (highRiskApps.some(k => appLower.includes(k) || catLower.includes(k)) && data.count >= 1) {
      insights.push({
        id: `appctrl_highrisk_${app.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`,
        category: 'traffic_behavior',
        name: `App Control: Aplicação de Alto Risco`,
        description: `${data.count} bloqueio(s) da aplicação "${app}"`,
        severity: data.count >= 20 ? 'critical' : data.count >= 5 ? 'high' : 'medium',
        count: data.count,
        recommendation: 'Verifique se o uso desta aplicação é autorizado na política de segurança.',
      });
    }
  }

  return { insights, metrics: { appControlBlocked: logs.length, topAppControlApps, topAppControlUsers } };
}

// ============================================
// Anomaly Analysis (DoS/DDoS, protocol anomalies, scans)
// ============================================

function analyzeAnomalies(logs: any[], ipCountryMap: Record<string, string> = {}): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  if (!Array.isArray(logs) || logs.length === 0) return { insights, metrics: { anomalyEvents: 0, anomalyDropped: 0, topAnomalySources: [], topAnomalyTypes: [] } };

  const ipMap: Record<string, { count: number; country?: string; ports: Set<number> }> = {};
  const attackMap: Record<string, number> = {};
  let droppedCount = 0;

  for (const log of logs) {
    const srcip = log.srcip || log.src || '';
    const attack = log.attack || log.attackname || log.msg || 'unknown';
    const action = (log.action || '').toLowerCase();
    const dstport = parseInt(log.dstport || '0');
    const country = log.srccountry || log.src_country || (srcip ? ipCountryMap[srcip] : undefined) || undefined;

    if (action === 'drop' || action === 'dropped' || action === 'blocked') droppedCount++;

    attackMap[attack] = (attackMap[attack] || 0) + 1;

    if (srcip) {
      if (!ipMap[srcip]) ipMap[srcip] = { count: 0, country, ports: new Set() };
      ipMap[srcip].count++;
      if (dstport > 0) ipMap[srcip].ports.add(dstport);
    }
  }

  const topAnomalySources: TopBlockedIP[] = Object.entries(ipMap)
    .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
    .map(([ip, data]) => ({ ip, country: data.country, count: data.count, targetPorts: [...data.ports].sort((a, b) => a - b) }));

  const topAnomalyTypes = Object.entries(attackMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([category, count]) => ({ category, count }));

  // Detect floods (critical)
  const floodKeywords = ['flood', 'syn_flood', 'udp_flood', 'icmp_flood', 'tcp_flood'];
  for (const [attack, count] of Object.entries(attackMap)) {
    const lower = attack.toLowerCase();
    if (floodKeywords.some(k => lower.includes(k))) {
      insights.push({
        id: `anomaly_flood_${attack.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`,
        category: 'anomaly',
        name: `Flood Detectado: ${attack}`,
        description: `${count} evento(s) de ${attack} detectado(s)`,
        severity: count >= 50 ? 'critical' : count >= 10 ? 'high' : 'medium',
        count,
        recommendation: 'Verifique os limiares de DoS no sensor de anomalia e considere ajustar as políticas de proteção.',
      });
    }
  }

  // Detect scans (high)
  const scanKeywords = ['scan', 'portscan', 'port_scan', 'sweep'];
  for (const [attack, count] of Object.entries(attackMap)) {
    const lower = attack.toLowerCase();
    if (scanKeywords.some(k => lower.includes(k))) {
      insights.push({
        id: `anomaly_scan_${attack.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`,
        category: 'anomaly',
        name: `Scan Detectado: ${attack}`,
        description: `${count} evento(s) de varredura detectado(s)`,
        severity: count >= 20 ? 'high' : 'medium',
        count,
        recommendation: 'Investigue a origem da varredura. Pode indicar reconhecimento pré-ataque.',
      });
    }
  }

  // Detect excessive sessions per IP (medium)
  const sessionKeywords = ['session', 'limit', 'rate'];
  for (const [attack, count] of Object.entries(attackMap)) {
    const lower = attack.toLowerCase();
    if (sessionKeywords.some(k => lower.includes(k)) && count >= 5) {
      insights.push({
        id: `anomaly_session_${attack.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`,
        category: 'anomaly',
        name: `Limite de Sessões: ${attack}`,
        description: `${count} evento(s) de limite de sessão excedido`,
        severity: 'medium',
        count,
        recommendation: 'Revise os limites de sessão por IP e verifique se há aplicações legítimas sendo impactadas.',
      });
    }
  }

  // High-volume anomaly IPs
  for (const [ip, data] of Object.entries(ipMap)) {
    if (data.count >= 20) {
      insights.push({
        id: `anomaly_highvol_${ip}`,
        category: 'anomaly',
        name: 'IP com Alto Volume de Anomalias',
        description: `IP ${ip} gerou ${data.count} eventos de anomalia`,
        severity: data.count >= 100 ? 'critical' : data.count >= 50 ? 'high' : 'medium',
        sourceIPs: [ip],
        count: data.count,
        recommendation: 'Considere bloquear este IP e investigar possível ataque em andamento.',
      });
    }
  }

  // General anomaly volume insight
  if (logs.length >= 10) {
    insights.push({
      id: 'anomaly_volume_total',
      category: 'anomaly',
      name: 'Volume de Anomalias Detectadas',
      description: `${logs.length} anomalia(s) detectada(s), ${droppedCount} bloqueada(s) (${Math.round(droppedCount / logs.length * 100)}%)`,
      severity: logs.length >= 200 ? 'high' : logs.length >= 50 ? 'medium' : 'low',
      count: logs.length,
      details: `Tipos distintos: ${Object.keys(attackMap).length}. Top: ${topAnomalyTypes.slice(0, 3).map(t => `${t.category} (${t.count})`).join(', ')}`,
    });
  }

  return {
    insights,
    metrics: { anomalyEvents: logs.length, anomalyDropped: droppedCount, topAnomalySources, topAnomalyTypes },
  };
}

// ============================================
// Outbound Traffic Analysis
// ============================================

function analyzeOutboundTraffic(allowedLogs: any[], blockedLogs: any[], ipCountryMap: Record<string, string> = {}): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  const emptyResult = { insights, metrics: { outboundConnections: 0, topOutboundIPs: [], topOutboundCountries: [], outboundBlocked: 0, topOutboundBlockedIPs: [], topOutboundBlockedCountries: [], inboundBlocked: 0, topInboundBlockedIPs: [], topInboundBlockedCountries: [], inboundAllowed: 0, topInboundAllowedIPs: [], topInboundAllowedCountries: [] } };
  if ((!Array.isArray(allowedLogs) || allowedLogs.length === 0) && (!Array.isArray(blockedLogs) || blockedLogs.length === 0)) return emptyResult;

  // Filter allowed logs for outbound candidates (private src → public dst)
  const isOutboundCandidate = (log: any) => {
    const src = log.srcip || log.src || '';
    const dst = log.dstip || log.dst || '';
    const direction = (log.direction || '').toLowerCase();
    if (direction === 'outbound') return true;
    return isPrivateIP(src) && dst && !isPrivateIP(dst);
  };

  // Filter for inbound candidates (public src → public dst, i.e. hitting firewall WAN IP)
  const isInboundCandidate = (log: any) => {
    const src = log.srcip || log.src || '';
    const dst = log.dstip || log.dst || '';
    const subtype = (log.subtype || '').toLowerCase();
    if (subtype === 'local') return false;
    return src && !isPrivateIP(src) && dst && !isPrivateIP(dst);
  };

  const filteredAllowed = (allowedLogs || []).filter(isOutboundCandidate);
  // blockedLogs already pre-filtered externally (private src → public dst, deny action)

  // Inbound allowed: from allowed logs, public src → private dst
  const inboundAllowedLogs = (allowedLogs || []).filter(isInboundCandidate);

  // Helper: build IP and country rankings from destination
  const buildDstRankings = (subset: any[]) => {
    const dstIPMap: Record<string, { count: number; country?: string; ports: Set<number> }> = {};
    const countryMap: Record<string, number> = {};

    for (const log of subset) {
      const dstip = log.dstip || log.dst || '';
      if (!dstip || isPrivateIP(dstip)) continue;
      const country = log.dstcountry || log.dst_country || (dstip ? ipCountryMap[dstip] : undefined) || undefined;
      const dstport = parseInt(log.dstport || '0');

      if (!dstIPMap[dstip]) dstIPMap[dstip] = { count: 0, country, ports: new Set() };
      dstIPMap[dstip].count++;
      if (dstport > 0) dstIPMap[dstip].ports.add(dstport);
      if (country) countryMap[country] = (countryMap[country] || 0) + 1;
    }

    const topIPs = Object.entries(dstIPMap)
      .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
      .map(([ip, data]) => ({ ip, country: data.country, count: data.count, targetPorts: [...data.ports].sort((a, b) => a - b) }));

    const topCountries = Object.entries(countryMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([country, count]) => ({ country, count }));

    return { topIPs, topCountries };
  };

  // Helper: build IP and country rankings from source (for inbound traffic)
  const buildSrcRankings = (subset: any[]) => {
    const srcIPMap: Record<string, { count: number; country?: string; ports: Set<number> }> = {};
    const countryMap: Record<string, number> = {};

    for (const log of subset) {
      const srcip = log.srcip || log.src || '';
      if (!srcip || isPrivateIP(srcip)) continue;
      const country = log.srccountry || log.src_country || (srcip ? ipCountryMap[srcip] : undefined) || undefined;
      const dstport = parseInt(log.dstport || '0');

      if (!srcIPMap[srcip]) srcIPMap[srcip] = { count: 0, country, ports: new Set() };
      srcIPMap[srcip].count++;
      if (dstport > 0) srcIPMap[srcip].ports.add(dstport);
      if (country) countryMap[country] = (countryMap[country] || 0) + 1;
    }

    const topIPs = Object.entries(srcIPMap)
      .sort((a, b) => b[1].count - a[1].count).slice(0, 20)
      .map(([ip, data]) => ({ ip, country: data.country, count: data.count, targetPorts: [...data.ports].sort((a, b) => a - b) }));

    const topCountries = Object.entries(countryMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([country, count]) => ({ country, count }));

    return { topIPs, topCountries };
  };

  const allowedRank = buildDstRankings(filteredAllowed);
  const blockedRank = buildDstRankings(blockedLogs || []);
  const inboundAllowedRank = buildSrcRankings(inboundAllowedLogs);

  // High-volume single destination insight (allowed)
  for (const ip of allowedRank.topIPs) {
    if (ip.count >= 100) {
      insights.push({
        id: `outbound_highvol_${ip.ip}`,
        category: 'traffic_behavior',
        name: 'Destino Externo com Alto Volume',
        description: `${ip.count} conexões de saída para ${ip.ip}`,
        severity: ip.count >= 500 ? 'high' : 'medium',
        sourceIPs: [ip.ip],
        count: ip.count,
        recommendation: 'Investigue o destino. Pode indicar exfiltração de dados ou comunicação com serviço não autorizado.',
      });
    }
  }

  // High-volume blocked outbound insight
  if (blockedLogs.length >= 10) {
    insights.push({
      id: 'outbound_blocked_volume',
      category: 'traffic_behavior',
      name: 'Conexões de Saída Bloqueadas',
      description: `${blockedLogs.length} tentativas de conexão de saída foram bloqueadas pelo firewall`,
      severity: blockedLogs.length >= 500 ? 'high' : blockedLogs.length >= 100 ? 'medium' : 'low',
      count: blockedLogs.length,
      recommendation: 'Verifique as políticas de saída e se os destinos bloqueados representam ameaças ou serviços legítimos.',
    });
  }

  return {
    insights,
    metrics: {
      outboundConnections: allowedLogs.length,
      topOutboundIPs: allowedRank.topIPs,
      topOutboundCountries: allowedRank.topCountries,
      outboundBlocked: blockedLogs.length,
      topOutboundBlockedIPs: blockedRank.topIPs,
      topOutboundBlockedCountries: blockedRank.topCountries,
      // Inbound allowed
      inboundAllowed: inboundAllowedLogs.length,
      topInboundAllowedIPs: inboundAllowedRank.topIPs,
      topInboundAllowedCountries: inboundAllowedRank.topCountries,
    },
  };
}

// ============================================
// Active Sessions Analysis
// ============================================

function analyzeActiveSessions(sessionData: any): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  const results = sessionData?.results || sessionData || {};
  const totalSessions = parseInt(results.total || results.count || '0');
  
  if (totalSessions === 0) return { insights, metrics: { activeSessions: 0 } };

  if (totalSessions >= 100000) {
    insights.push({
      id: 'high_session_count',
      category: 'traffic_behavior',
      name: 'Volume Elevado de Sessões Ativas',
      description: `${totalSessions.toLocaleString()} sessões ativas simultâneas detectadas`,
      severity: totalSessions >= 500000 ? 'critical' : totalSessions >= 200000 ? 'high' : 'medium',
      count: totalSessions,
      recommendation: 'Verifique se o volume de sessões está dentro da capacidade do appliance. Considere otimizar session timeouts.',
    });
  }

  return {
    insights,
    metrics: { activeSessions: totalSessions },
  };
}

// ============================================
// Bandwidth / Interface Traffic Analysis
// ============================================

interface InterfaceBandwidth {
  name: string;
  tx_bytes: number;
  rx_bytes: number;
  tx_rate: number;
  rx_rate: number;
}

function analyzeBandwidth(trafficData: any): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  const results = Array.isArray(trafficData) ? trafficData : trafficData?.results || [];
  if (!results || (typeof results !== 'object')) return { insights, metrics: { interfaceBandwidth: [] } };

  // The response is typically an object keyed by interface name
  const interfaces: InterfaceBandwidth[] = [];
  
  const processInterface = (name: string, data: any) => {
    const history = Array.isArray(data) ? data : data?.history || [];
    if (!Array.isArray(history) || history.length === 0) return;
    
    let totalTx = 0, totalRx = 0;
    let maxTxRate = 0, maxRxRate = 0;
    
    for (const point of history) {
      totalTx += parseInt(point.tx_byte || point.tx_bytes || '0');
      totalRx += parseInt(point.rx_byte || point.rx_bytes || '0');
      const txRate = parseInt(point.tx_rate || point.tx_bandwidth || '0');
      const rxRate = parseInt(point.rx_rate || point.rx_bandwidth || '0');
      if (txRate > maxTxRate) maxTxRate = txRate;
      if (rxRate > maxRxRate) maxRxRate = rxRate;
    }
    
    interfaces.push({ name, tx_bytes: totalTx, rx_bytes: totalRx, tx_rate: maxTxRate, rx_rate: maxRxRate });
  };

  if (Array.isArray(results)) {
    for (const item of results) {
      if (item.name || item.interface) {
        processInterface(item.name || item.interface, item);
      }
    }
  } else if (typeof results === 'object') {
    for (const [name, data] of Object.entries(results)) {
      processInterface(name, data);
    }
  }

  // Sort by total traffic
  interfaces.sort((a, b) => (b.tx_bytes + b.rx_bytes) - (a.tx_bytes + a.rx_bytes));

  return {
    insights,
    metrics: { interfaceBandwidth: interfaces.slice(0, 20) },
  };
}

// ============================================
// Botnet Domain Analysis
// ============================================

function analyzeBotnetDomains(botnetData: any): { insights: AnalyzerInsight[]; metrics: Partial<Record<string, any>> } {
  const insights: AnalyzerInsight[] = [];
  const results = botnetData?.results || botnetData || {};
  
  const totalDetections = parseInt(results.total || results.dns_block_count || results.count || '0');
  const domains = Array.isArray(results.domains) ? results.domains : [];

  if (totalDetections > 0 || domains.length > 0) {
    insights.push({
      id: 'botnet_domains_detected',
      category: 'ioc_correlation',
      name: 'Comunicação com Domínios de Botnet',
      description: `${totalDetections || domains.length} detecção(ões) de comunicação com domínios maliciosos de botnet`,
      severity: totalDetections >= 50 ? 'critical' : totalDetections >= 10 ? 'high' : 'medium',
      count: totalDetections || domains.length,
      details: domains.length > 0 ? `Domínios: ${domains.slice(0, 5).map((d: any) => d.domain || d.name || d).join(', ')}` : undefined,
      recommendation: 'Investigue os hosts internos que tentaram comunicação com domínios de botnet. Possível comprometimento.',
    });
  }

  return {
    insights,
    metrics: {
      botnetDetections: totalDetections || domains.length,
      botnetDomains: domains.slice(0, 20).map((d: any) => ({
        domain: d.domain || d.name || String(d),
        count: d.count || d.hits || 1,
      })),
    },
  };
}

// ============================================
// Score Calculation
// ============================================

function calculateScore(insights: AnalyzerInsight[]): number {
  if (insights.length === 0) return 100;

  let penalty = 0;
  for (const i of insights) {
    switch (i.severity) {
      case 'critical': penalty += 15; break;
      case 'high': penalty += 8; break;
      case 'medium': penalty += 3; break;
      case 'low': penalty += 1; break;
    }
  }

  return Math.max(0, Math.min(100, 100 - penalty));
}

// ============================================
// Main Handler
// ============================================

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { snapshot_id, task_id, raw_data } = await req.json();

    if (!snapshot_id || !raw_data) {
      return new Response(
        JSON.stringify({ success: false, error: 'snapshot_id and raw_data required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[firewall-analyzer] Processing snapshot ${snapshot_id}`);

    await supabase.from('analyzer_snapshots').update({ status: 'processing' }).eq('id', snapshot_id);

    // ── Fetch period_start and period_end from snapshot for time-based filtering ──
    const { data: snapMeta } = await supabase
      .from('analyzer_snapshots')
      .select('period_start, period_end')
      .eq('id', snapshot_id)
      .single();

    const periodStart = snapMeta?.period_start
      ? new Date(snapMeta.period_start)
      : new Date(Date.now() - 60 * 60 * 1000); // fallback: 1h ago

    const periodEnd = snapMeta?.period_end
      ? new Date(snapMeta.period_end)
      : null; // null = no upper bound (backward compat)

    console.log(`[firewall-analyzer] period window: ${periodStart.toISOString()} → ${periodEnd ? periodEnd.toISOString() : 'none'}`);

    // ── Helper: extract timestamp in ms from a log entry ──
    function extractTimestampMs(log: any): number | null {
      if (log.eventtime) {
        let et = Number(log.eventtime);
        // Normalize to milliseconds:
        if (et > 1e17) et = et / 1e6;       // nanoseconds -> ms
        else if (et > 1e14) et = et / 1e3;  // microseconds -> ms
        else if (et < 1e12) et = et * 1e3;  // seconds -> ms
        // else: already ms
        return et;
      }
      if (log.date) {
        const timeStr = log.time || '00:00:00';
        const parsed = new Date(`${log.date}T${timeStr}-03:00`);
        if (!isNaN(parsed.getTime())) return parsed.getTime();
      }
      return null;
    }

    // ── Helper: filter logs by timestamp within [cutoffStart, cutoffEnd) ──
    function filterLogsByTime(logs: any[], cutoffStart: Date, cutoffEnd: Date | null): any[] {
      if (!Array.isArray(logs) || logs.length === 0) return logs;

      const startMs = cutoffStart.getTime();
      const endMs = cutoffEnd ? cutoffEnd.getTime() : null;

      const filtered = logs.filter(log => {
        const ms = extractTimestampMs(log);
        if (ms === null) return true; // keep unknowns
        if (ms < startMs) return false;
        if (endMs && ms >= endMs) return false;
        return true;
      });

      if (filtered.length !== logs.length) {
        console.log(`[firewall-analyzer] filterLogsByTime: ${logs.length} → ${filtered.length} (removed ${logs.length - filtered.length} outside window)`);
      }

      return filtered;
    }

    // ── Helper: deduplicate logs by logid + eventtime ──
    function deduplicateLogs(logs: any[]): any[] {
      if (!Array.isArray(logs) || logs.length === 0) return logs;

      const seen = new Set<string>();
      const deduped = logs.filter(log => {
        const key = log.logid && log.eventtime
          ? `${log.logid}_${log.eventtime}`
          : null;
        if (!key) return true; // keep entries without logid
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (deduped.length !== logs.length) {
        console.log(`[firewall-analyzer] deduplicateLogs: ${logs.length} → ${deduped.length} (removed ${logs.length - deduped.length} duplicates)`);
      }

      return deduped;
    }

    // Extract step data
    const rawDeniedData = raw_data.denied_traffic?.data || raw_data.denied_traffic || [];
    const rawAuthData = raw_data.auth_events?.data || raw_data.auth_events || [];
    const rawVpnData = raw_data.vpn_events?.data || raw_data.vpn_events || [];
    const rawIpsData = raw_data.ips_events?.data || raw_data.ips_events || [];
    const rawConfigData = raw_data.config_changes?.data || raw_data.config_changes || [];
    const rawWebfilterData = raw_data.webfilter_blocked?.data || raw_data.webfilter_blocked || [];
    const rawAppctrlData = raw_data.appctrl_blocked?.data || raw_data.appctrl_blocked || [];
    const rawAnomalyData = raw_data.anomaly_events?.data || raw_data.anomaly_events || [];

    // Apply time-based filtering to all log types
    const deniedData = deduplicateLogs(filterLogsByTime(Array.isArray(rawDeniedData) ? rawDeniedData : rawDeniedData?.results || [], periodStart, periodEnd));
    const authDataAll = deduplicateLogs(filterLogsByTime(Array.isArray(rawAuthData) ? rawAuthData : rawAuthData?.results || [], periodStart, periodEnd));

    // Filter auth logs to actual admin login events only (exclude DHCP, SNMP, threat feed, perf-stats etc.)
    const AUTH_LOGIDS = new Set(['0100032001', '0100032002', '0100032003']);
    const authData = authDataAll.filter((l: any) => {
      // Match by logid (most reliable — covers all FortiOS versions)
      if (l.logid && AUTH_LOGIDS.has(l.logid)) return true;
      // Match by action=login (fallback for non-standard logid)
      if ((l.action || '').toLowerCase() === 'login') return true;
      // Match by logdesc containing "Admin login"
      if ((l.logdesc || '').toLowerCase().includes('admin login')) return true;
      return false;
    });
    console.log(`[firewall-analyzer] Auth filter: ${authDataAll.length} raw → ${authData.length} real admin login events`);
    const vpnData = deduplicateLogs(filterLogsByTime(Array.isArray(rawVpnData) ? rawVpnData : rawVpnData?.results || [], periodStart, periodEnd));
    const ipsData = deduplicateLogs(filterLogsByTime(Array.isArray(rawIpsData) ? rawIpsData : rawIpsData?.results || [], periodStart, periodEnd));
    const configData = deduplicateLogs(filterLogsByTime(Array.isArray(rawConfigData) ? rawConfigData : rawConfigData?.results || [], periodStart, periodEnd));
    const webfilterData = deduplicateLogs(filterLogsByTime(Array.isArray(rawWebfilterData) ? rawWebfilterData : rawWebfilterData?.results || [], periodStart, periodEnd));
    const appctrlData = deduplicateLogs(filterLogsByTime(Array.isArray(rawAppctrlData) ? rawAppctrlData : rawAppctrlData?.results || [], periodStart, periodEnd));
    const anomalyData = deduplicateLogs(filterLogsByTime(Array.isArray(rawAnomalyData) ? rawAnomalyData : rawAnomalyData?.results || [], periodStart, periodEnd));

    const deniedLogs = deniedData;

    // Run analysis modules
    const deniedResult = analyzeDeniedTraffic(deniedLogs);

    // Build IP->Country map from denied traffic for auth enrichment
    const ipCountryMap: Record<string, string> = {};
    for (const log of deniedLogs) {
      const ip = log.srcip || log.src || log.source;
      const country = log.srccountry || log.src_country;
      if (ip && country) ipCountryMap[ip] = country;
    }

    // Enrich from auth and VPN logs (they often have srccountry for external IPs)
    const authLogs = authData;
    const vpnLogs = vpnData;
    // Helper to extract IP from FortiOS 'ui' field (e.g. "https(10.0.0.1)")
    const extractIpFromUiField = (ui: string): string | null => {
      if (!ui) return null;
      const match = ui.match(/\(([^)]+)\)/);
      return match?.[1] || null;
    };

    for (const log of [...authLogs, ...vpnLogs]) {
      const ip = log.srcip || log.remip || log.src || extractIpFromUiField(log.ui);
      const country = log.srccountry || log.src_country;
    if (ip && country && !ipCountryMap[ip]) ipCountryMap[ip] = country;
    }
    console.log(`[firewall-analyzer] Built ipCountryMap with ${Object.keys(ipCountryMap).length} entries (incl. auth/vpn)`);

    // GeoIP fallback: resolve countries for auth/vpn IPs missing from ipCountryMap
    const authIPsWithoutCountry = new Set<string>();
    for (const log of [...authLogs, ...vpnLogs]) {
      const ip = log.srcip || log.remip || log.src || extractIpFromUiField(log.ui);
      if (ip && !ipCountryMap[ip]) authIPsWithoutCountry.add(ip);
    }
    if (authIPsWithoutCountry.size > 0) {
      console.log(`[firewall-analyzer] ${authIPsWithoutCountry.size} auth/vpn IPs without country, resolving via GeoIP...`);
      const geoResults = await resolveGeoIP([...authIPsWithoutCountry]);
      for (const [ip, country] of Object.entries(geoResults)) {
        ipCountryMap[ip] = country;
      }
      console.log(`[firewall-analyzer] ipCountryMap now has ${Object.keys(ipCountryMap).length} entries (after GeoIP)`);
    }

    const authResult = analyzeAuthentication(authData, vpnData, ipCountryMap);
    const ipsResult = analyzeIPS(ipsData, ipCountryMap);
    const configResult = analyzeConfigChanges(configData);
    const webfilterResult = analyzeWebFilter(webfilterData);
    const appctrlResult = analyzeAppControl(appctrlData);
    const anomalyResult = analyzeAnomalies(anomalyData, ipCountryMap);

    // Outbound traffic: separate allowed and blocked sources
    const rawAllowedData = raw_data.allowed_traffic?.data || raw_data.allowed_traffic || [];
    const rawAllowedLogs = deduplicateLogs(filterLogsByTime(Array.isArray(rawAllowedData) ? rawAllowedData : rawAllowedData?.results || [], periodStart, periodEnd));
    // Fallback: check if denied_traffic has accept entries (some blueprints put all forward traffic there)
    const acceptedFromDenied = deniedLogs.filter((l: any) => {
      const action = (l.action || '').toLowerCase();
      return action === 'accept' || action === 'allow' || action === 'pass';
    });
    const outboundAllowedLogs = rawAllowedLogs.length > 0 ? rawAllowedLogs : acceptedFromDenied;

    // Blocked outbound: from denied_traffic, private src → public dst with deny action
    const outboundBlockedLogs = deniedLogs.filter((l: any) => {
      const action = (l.action || '').toLowerCase();
      const src = l.srcip || l.src || '';
      const dst = l.dstip || l.dst || '';
      const isDeny = action === 'deny' || action === 'block' || action === 'blocked' || action === '';
      return isDeny && isPrivateIP(src) && dst && !isPrivateIP(dst);
    });

    const outboundResult = analyzeOutboundTraffic(outboundAllowedLogs, outboundBlockedLogs, ipCountryMap);

    // Fase 2: New analysis modules
    const rawPolicyData = raw_data.monitor_firewall_policy?.data || raw_data.monitor_firewall_policy || {};
    const rawSessionData = raw_data.monitor_firewall_session?.data || raw_data.monitor_firewall_session || {};
    const rawTrafficData = raw_data.monitor_traffic_history?.data || raw_data.monitor_traffic_history || {};
    const rawBotnetData = raw_data.monitor_botnet_domains?.data || raw_data.monitor_botnet_domains || {};

    const sessionResult = analyzeActiveSessions(rawSessionData);
    const bandwidthResult = analyzeBandwidth(rawTrafficData);
    const botnetResult = analyzeBotnetDomains(rawBotnetData);

    console.log(`[firewall-analyzer] Fase 2: sessions=${sessionResult.metrics.activeSessions}, botnet=${botnetResult.metrics.botnetDetections}`);

    // Combine all insights
    const allInsights = [
      ...deniedResult.insights,
      ...authResult.insights,
      ...ipsResult.insights,
      ...configResult.insights,
      ...webfilterResult.insights,
      ...appctrlResult.insights,
      ...anomalyResult.insights,
      ...outboundResult.insights,
      ...sessionResult.insights,
      ...bandwidthResult.insights,
      ...botnetResult.insights,
    ];

    // Deduplicate by id
    const uniqueInsights = [...new Map(allInsights.map(i => [i.id, i])).values()];

    const summary = {
      critical: uniqueInsights.filter(i => i.severity === 'critical').length,
      high: uniqueInsights.filter(i => i.severity === 'high').length,
      medium: uniqueInsights.filter(i => i.severity === 'medium').length,
      low: uniqueInsights.filter(i => i.severity === 'low').length,
      info: uniqueInsights.filter(i => i.severity === 'info').length,
    };

    const metrics = {
      topBlockedIPs: deniedResult.metrics.topBlockedIPs || [],
      topCountries: deniedResult.metrics.topCountries || [],
      vpnFailures: authResult.metrics.vpnFailures || 0,
      firewallAuthFailures: authResult.metrics.firewallAuthFailures || 0,
      firewallAuthSuccesses: authResult.metrics.firewallAuthSuccesses || 0,
      vpnSuccesses: authResult.metrics.vpnSuccesses || 0,
      topAuthIPs: authResult.metrics.topAuthIPs || [],
      topAuthCountries: authResult.metrics.topAuthCountries || [],
      topAuthIPsFailed: authResult.metrics.topAuthIPsFailed || [],
      topAuthIPsSuccess: authResult.metrics.topAuthIPsSuccess || [],
      topAuthCountriesFailed: authResult.metrics.topAuthCountriesFailed || [],
      topAuthCountriesSuccess: authResult.metrics.topAuthCountriesSuccess || [],
      // Separated by source
      topFwAuthIPsFailed: authResult.metrics.topFwAuthIPsFailed || [],
      topFwAuthIPsSuccess: authResult.metrics.topFwAuthIPsSuccess || [],
      topFwAuthCountriesFailed: authResult.metrics.topFwAuthCountriesFailed || [],
      topFwAuthCountriesSuccess: authResult.metrics.topFwAuthCountriesSuccess || [],
      topVpnAuthIPsFailed: authResult.metrics.topVpnAuthIPsFailed || [],
      topVpnAuthIPsSuccess: authResult.metrics.topVpnAuthIPsSuccess || [],
      topVpnAuthCountriesFailed: authResult.metrics.topVpnAuthCountriesFailed || [],
      topVpnAuthCountriesSuccess: authResult.metrics.topVpnAuthCountriesSuccess || [],
      topVpnUsersFailed: authResult.metrics.topVpnUsersFailed || [],
      topVpnUsersSuccess: authResult.metrics.topVpnUsersSuccess || [],
      // Outbound
      topOutboundIPs: outboundResult.metrics.topOutboundIPs || [],
      topOutboundCountries: outboundResult.metrics.topOutboundCountries || [],
      outboundConnections: outboundResult.metrics.outboundConnections || 0,
      outboundBlocked: outboundResult.metrics.outboundBlocked || 0,
      topOutboundBlockedIPs: outboundResult.metrics.topOutboundBlockedIPs || [],
      topOutboundBlockedCountries: outboundResult.metrics.topOutboundBlockedCountries || [],
      // Inbound
      topInboundBlockedIPs: deniedResult.metrics.topInboundBlockedIPs || [],
      topInboundBlockedCountries: deniedResult.metrics.topInboundBlockedCountries || [],
      inboundBlocked: deniedResult.metrics.inboundBlocked || 0,
      topInboundAllowedIPs: outboundResult.metrics.topInboundAllowedIPs || [],
      topInboundAllowedCountries: outboundResult.metrics.topInboundAllowedCountries || [],
      inboundAllowed: outboundResult.metrics.inboundAllowed || 0,
      ipsEvents: ipsResult.metrics.ipsEvents || 0,
      topIpsAttackTypes: ipsResult.metrics.topIpsAttackTypes || [],
      topIpsSrcIPs: ipsResult.metrics.topIpsSrcIPs || [],
      topIpsSrcCountries: ipsResult.metrics.topIpsSrcCountries || [],
      topIpsDstIPs: ipsResult.metrics.topIpsDstIPs || [],
      configChanges: configResult.metrics.configChanges || 0,
      configChangeDetails: configResult.metrics.configChangeDetails || [],
      totalDenied: deniedResult.metrics.totalDenied || 0,
      topWebFilterCategories: webfilterResult.metrics.topWebFilterCategories || [],
      topWebFilterUsers: webfilterResult.metrics.topWebFilterUsers || [],
      topAppControlApps: appctrlResult.metrics.topAppControlApps || [],
      topAppControlUsers: appctrlResult.metrics.topAppControlUsers || [],
      webFilterBlocked: webfilterResult.metrics.webFilterBlocked || 0,
      appControlBlocked: appctrlResult.metrics.appControlBlocked || 0,
      anomalyEvents: anomalyResult.metrics.anomalyEvents || 0,
      anomalyDropped: anomalyResult.metrics.anomalyDropped || 0,
      topAnomalySources: anomalyResult.metrics.topAnomalySources || [],
      topAnomalyTypes: anomalyResult.metrics.topAnomalyTypes || [],
      totalEvents: (deniedResult.metrics.totalDenied || 0) + (authResult.metrics.vpnFailures || 0) + (authResult.metrics.firewallAuthFailures || 0) + (ipsResult.metrics.ipsEvents || 0) + (configResult.metrics.configChanges || 0) + (webfilterResult.metrics.webFilterBlocked || 0) + (appctrlResult.metrics.appControlBlocked || 0) + (anomalyResult.metrics.anomalyEvents || 0),
      // Fase 2: Sessions, Bandwidth, Botnet
      activeSessions: sessionResult.metrics.activeSessions || 0,
      interfaceBandwidth: bandwidthResult.metrics.interfaceBandwidth || [],
      botnetDetections: botnetResult.metrics.botnetDetections || 0,
      botnetDomains: botnetResult.metrics.botnetDomains || [],
    };

    const score = calculateScore(uniqueInsights);

    const { error: updateError } = await supabase
      .from('analyzer_snapshots')
      .update({
        status: 'completed',
        score,
        summary,
        insights: uniqueInsights,
        metrics,
      })
      .eq('id', snapshot_id);

    if (updateError) {
      console.error('[firewall-analyzer] Failed to save:', updateError);
      await supabase.from('analyzer_snapshots').update({ status: 'failed' }).eq('id', snapshot_id);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save results' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Persist config change details to dedicated table
    const configDetails = (configResult.metrics.configChangeDetails || []) as any[];
    if (configDetails.length > 0) {
      // Get snapshot info for firewall_id and client_id
      const { data: snapInfo } = await supabase
        .from('analyzer_snapshots')
        .select('firewall_id, client_id')
        .eq('id', snapshot_id)
        .single();

      if (snapInfo) {
        const rows = configDetails.map((d: any) => ({
          firewall_id: snapInfo.firewall_id,
          client_id: snapInfo.client_id,
          snapshot_id,
          user_name: d.user || 'unknown',
          action: d.action || '',
          cfgpath: d.cfgpath || '',
          cfgobj: d.cfgobj || '',
          cfgattr: d.cfgattr || '',
          msg: d.msg || '',
          category: d.category || 'Outros',
          severity: d.severity || 'low',
          changed_at: d.date ? new Date(d.date).toISOString() : new Date().toISOString(),
        }));

        const { error: insertErr } = await supabase
          .from('analyzer_config_changes')
          .upsert(rows, { onConflict: 'firewall_id,user_name,action,cfgpath,cfgobj,changed_at', ignoreDuplicates: true });

        if (insertErr) {
          console.error('[firewall-analyzer] Failed to persist config changes:', insertErr);
        } else {
          console.log(`[firewall-analyzer] Persisted ${rows.length} config changes to history`);
        }
      }
    }

    console.log(`[firewall-analyzer] Completed: score=${score}, insights=${uniqueInsights.length}, critical=${summary.critical}`);

    return new Response(
      JSON.stringify({ success: true, score, summary, insights_count: uniqueInsights.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[firewall-analyzer] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
