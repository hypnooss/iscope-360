import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import { getCorsHeaders } from '../_shared/cors.ts';

// ── IP helpers (same as run-attack-surface-queue) ───────────────────────────

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 0) return true
  if (a >= 224) return true
  return false
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
}

function intToIp(n: number): string {
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
}

function maskToCidr(mask: string): number {
  const maskInt = ipToInt(mask)
  let bits = 0
  let n = maskInt
  while (n) { bits += n & 1; n >>>= 1 }
  return bits
}

function expandSubnet(ipField: string): { ips: string[]; subnet: string | null } {
  const parts = ipField.trim().split(/\s+/)
  const ip = parts[0]
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return { ips: [], subnet: null }
  if (parts.length < 2 || !parts[1] || !/^\d+\.\d+\.\d+\.\d+$/.test(parts[1])) return { ips: [ip], subnet: null }

  const mask = parts[1]
  const cidr = maskToCidr(mask)
  const subnet = `${ip}/${cidr}`
  const ipInt = ipToInt(ip)
  const maskInt = ipToInt(mask)
  const network = (ipInt & maskInt) >>> 0
  const broadcast = (network | (~maskInt >>> 0)) >>> 0
  const size = broadcast - network + 1

  if (size > 256) return { ips: [ip], subnet }
  if (size <= 2) return { ips: [ip], subnet }

  const result: string[] = []
  for (let i = network + 1; i < broadcast; i++) {
    result.push(intToIp(i))
  }
  return { ips: result, subnet }
}

interface DNSTarget {
  ip: string
  label: string
}

interface FirewallTarget {
  ip: string
  label: string
  subnet: string | null
  expanded_ips: string[]
}

// ── Extract IPs from domain analyses ────────────────────────────────────────

function extractDomainTargets(reportData: any, domainName: string): DNSTarget[] {
  const targets: DNSTarget[] = []
  const seen = new Set<string>()
  if (!reportData) return targets

  if (reportData.subdomains && Array.isArray(reportData.subdomains)) {
    for (const sub of reportData.subdomains) {
      if (sub.ips && Array.isArray(sub.ips)) {
        for (const ip of sub.ips) {
          if (typeof ip === 'string' && !seen.has(ip) && !isPrivateIP(ip)) {
            seen.add(ip)
            targets.push({ ip, label: sub.subdomain || domainName })
          }
        }
      }
    }
  }

  const subSummary = reportData.subdomain_summary || reportData.subdomainSummary
  if (subSummary?.subdomains && Array.isArray(subSummary.subdomains)) {
    for (const sub of subSummary.subdomains) {
      if (sub.addresses && Array.isArray(sub.addresses)) {
        for (const addr of sub.addresses) {
          const ip = addr.ip || addr.value
          if (ip && !seen.has(ip) && !isPrivateIP(ip)) {
            seen.add(ip)
            targets.push({ ip, label: sub.subdomain || sub.hostname || domainName })
          }
        }
      }
    }
  }

  if (reportData.checks && Array.isArray(reportData.checks)) {
    for (const check of reportData.checks) {
      const raw = check.rawData
      if (!raw || typeof raw !== 'object') continue
      const searchObj = (obj: any, depth = 0) => {
        if (depth > 5 || !obj) return
        if (Array.isArray(obj)) { for (const item of obj) searchObj(item, depth + 1) }
        else if (typeof obj === 'object') {
          for (const key of ['ip', 'address']) {
            if (obj[key] && typeof obj[key] === 'string' && !seen.has(obj[key]) && !isPrivateIP(obj[key])) {
              seen.add(obj[key])
              targets.push({ ip: obj[key], label: obj.hostname || obj.name || domainName })
            }
          }
          for (const k of Object.keys(obj)) searchObj(obj[k], depth + 1)
        }
      }
      searchObj(raw)
    }
  }

  return targets
}

// ── Extract IPs from Firewall step results ──────────────────────────────────

function extractFirewallTargets(stepResults: any[], firewallName: string): FirewallTarget[] {
  const targets: FirewallTarget[] = []
  const seen = new Set<string>()

  for (const step of stepResults) {
    if (step.step_id !== 'system_interface') continue
    const resultData = step.data
    if (!resultData) continue
    const interfaces = Array.isArray(resultData) ? resultData : (resultData.results || resultData.data || [])
    if (!Array.isArray(interfaces)) continue

    for (const iface of interfaces) {
      const role = (iface.role || '').toLowerCase()
      if (role !== 'wan') continue
      const ipField = iface.ip || ''
      const { ips: expandedIPs, subnet } = expandSubnet(ipField)
      const ifaceName = iface.name || 'unknown'
      
      const publicIPs = expandedIPs.filter(eip => eip !== '0.0.0.0' && !isPrivateIP(eip))
      if (publicIPs.length === 0) continue

      // Deduplicate
      const newIPs = publicIPs.filter(eip => !seen.has(eip))
      for (const eip of newIPs) seen.add(eip)
      if (newIPs.length === 0) continue

      targets.push({
        ip: newIPs[0],
        label: `${firewallName} - ${ifaceName}`,
        subnet,
        expanded_ips: newIPs,
      })
    }
  }
  return targets
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = await req.json().catch(() => ({}))
    const clientId = body.client_id
    if (!clientId) {
      return new Response(JSON.stringify({ error: 'client_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Collect DNS targets
    const { data: domains } = await supabase
      .from('external_domains')
      .select('id, domain, name')
      .eq('client_id', clientId)

    const dnsTargets: DNSTarget[] = []
    const seenDNS = new Set<string>()

    for (const domain of (domains || [])) {
      const { data: analyses } = await supabase
        .from('external_domain_analysis_history')
        .select('report_data')
        .eq('domain_id', domain.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)

      if (analyses?.[0]?.report_data) {
        const extracted = extractDomainTargets(analyses[0].report_data, domain.domain)
        for (const t of extracted) {
          if (!seenDNS.has(t.ip)) {
            seenDNS.add(t.ip)
            dnsTargets.push(t)
          }
        }
      }
    }

    // Collect Firewall targets
    const { data: firewalls } = await supabase
      .from('firewalls')
      .select('id, name, cloud_public_ip')
      .eq('client_id', clientId)

    const firewallTargets: FirewallTarget[] = []

    for (const fw of (firewalls || [])) {
      const { data: tasks } = await supabase
        .from('agent_tasks')
        .select('id')
        .eq('target_id', fw.id)
        .eq('target_type', 'firewall')
        .eq('task_type', 'fortigate_compliance')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)

      if (tasks?.[0]?.id) {
        const { data: stepResults } = await supabase
          .from('task_step_results')
          .select('step_id, data')
          .eq('task_id', tasks[0].id)
          .eq('step_id', 'system_interface')

        if (stepResults && stepResults.length > 0) {
          const fwTargets = extractFirewallTargets(stepResults, fw.name)
          for (const ft of fwTargets) {
            // Check for overlap with DNS
          const filteredIPs = ft.expanded_ips.filter(eip => !seenDNS.has(eip))
            if (filteredIPs.length > 0) {
              firewallTargets.push({ ...ft, expanded_ips: filteredIPs })
            }
          }
        }
      }

      // Add cloud_public_ip if available and not already included
      if (fw.cloud_public_ip && !isPrivateIP(fw.cloud_public_ip) && !seenDNS.has(fw.cloud_public_ip)) {
        const alreadyIncluded = firewallTargets.some(ft => ft.expanded_ips.includes(fw.cloud_public_ip));
        if (!alreadyIncluded) {
          firewallTargets.push({
            ip: fw.cloud_public_ip,
            label: `${fw.name} - Cloud Public IP`,
            subnet: null,
            expanded_ips: [fw.cloud_public_ip],
          });
        }
      }
    }

    return new Response(JSON.stringify({
      dns: dnsTargets,
      firewall: firewallTargets,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[preview] Error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
