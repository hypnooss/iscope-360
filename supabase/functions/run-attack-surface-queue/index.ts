import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts';

// ── IP helpers ──────────────────────────────────────────────────────────────

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

function expandSubnet(ipField: string): string[] {
  const parts = ipField.trim().split(/\s+/)
  const ip = parts[0]
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return []
  if (parts.length < 2 || !parts[1] || !/^\d+\.\d+\.\d+\.\d+$/.test(parts[1])) return [ip]

  const mask = parts[1]
  const ipInt = ipToInt(ip)
  const maskInt = ipToInt(mask)
  const network = (ipInt & maskInt) >>> 0
  const broadcast = (network | (~maskInt >>> 0)) >>> 0
  const size = broadcast - network + 1

  // Safety: skip expansion for ranges > 256 hosts (/24 or larger)
  if (size > 256) return [ip]
  // /31 and /32 have no usable host range in traditional sense
  if (size <= 2) return [ip]

  const result: string[] = []
  for (let i = network + 1; i < broadcast; i++) {
    result.push(intToIp(i))
  }
  return result
}

interface SourceIP {
  ip: string
  source: 'dns' | 'firewall'
  label: string
}

// ── Extract IPs from domain analyses ────────────────────────────────────────

function extractDomainIPs(reportData: any, domainName: string): SourceIP[] {
  const ips: SourceIP[] = []
  const seen = new Set<string>()
  if (!reportData) return ips

  // subdomains array
  if (reportData.subdomains && Array.isArray(reportData.subdomains)) {
    for (const sub of reportData.subdomains) {
      if (sub.ips && Array.isArray(sub.ips)) {
        for (const ip of sub.ips) {
          if (typeof ip === 'string' && !seen.has(ip) && !isPrivateIP(ip)) {
            seen.add(ip)
            ips.push({ ip, source: 'dns', label: sub.subdomain || domainName })
          }
        }
      }
    }
  }

  // subdomain_summary (snake_case in actual data, camelCase fallback)
  const subSummary = reportData.subdomain_summary || reportData.subdomainSummary
  if (subSummary?.subdomains && Array.isArray(subSummary.subdomains)) {
    for (const sub of subSummary.subdomains) {
      if (sub.addresses && Array.isArray(sub.addresses)) {
        for (const addr of sub.addresses) {
          const ip = addr.ip || addr.value
          if (ip && !seen.has(ip) && !isPrivateIP(ip)) {
            seen.add(ip)
            ips.push({ ip, source: 'dns', label: sub.subdomain || sub.hostname || domainName })
          }
        }
      }
    }
  }

  // Deep search in checks rawData
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
              ips.push({ ip: obj[key], source: 'dns', label: obj.hostname || obj.name || domainName })
            }
          }
          for (const k of Object.keys(obj)) searchObj(obj[k], depth + 1)
        }
      }
      searchObj(raw)
    }
  }

  return ips
}

// ── Extract IPs from Firewall step results ──────────────────────────────────

function extractFirewallIPs(stepResults: any[], firewallName: string): SourceIP[] {
  const ips: SourceIP[] = []
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
      const expandedIPs = expandSubnet(ipField)
      const ifaceName = iface.name || 'unknown'
      for (const expandedIP of expandedIPs) {
        if (expandedIP === '0.0.0.0' || seen.has(expandedIP) || isPrivateIP(expandedIP)) continue
        seen.add(expandedIP)
        ips.push({ ip: expandedIP, source: 'firewall', label: `${firewallName} - ${ifaceName}` })
      }
    }
  }
  return ips
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

    // Validate caller is authorized (cron job, service role, or authenticated user)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    // Allow service role key OR validate as authenticated user
    if (token !== serviceKey) {
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token)
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // Read optional client_id and selected_ips from request body
    const body = await req.json().catch(() => ({}))
    const targetClientId = body.client_id
    const selectedIps: { ip: string; source: string; label: string }[] | undefined = body.selected_ips

    let clients: any[]
    if (targetClientId) {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('id', targetClientId)
        .single()
      if (error) throw error
      clients = [data]
    } else {
      const { data, error: clientsError } = await supabase
        .from('clients')
        .select('id, name')
      if (clientsError) throw clientsError
      clients = data || []
    }

    console.log(`[queue] Processing ${clients?.length || 0} clients`)

    let totalSnapshots = 0
    let totalTasks = 0

    for (const client of (clients || [])) {
      let allIPs: SourceIP[]

      // If selected_ips provided, use them directly instead of auto-collecting
      if (selectedIps && Array.isArray(selectedIps) && selectedIps.length > 0) {
        allIPs = selectedIps.map(s => ({
          ip: s.ip,
          source: (s.source === 'firewall' ? 'firewall' : 'dns') as 'dns' | 'firewall',
          label: s.label,
        }))
        console.log(`[queue] Client ${client.name}: using ${allIPs.length} user-selected IPs`)
      } else {
        // Auto-collect IPs from domain analyses
        const { data: domains } = await supabase
          .from('external_domains')
          .select('id, domain, name')
          .eq('client_id', client.id)

        allIPs = []
        const seenIPs = new Set<string>()

        for (const domain of (domains || [])) {
          const { data: analyses } = await supabase
            .from('external_domain_analysis_history')
            .select('report_data')
            .eq('domain_id', domain.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)

          if (analyses?.[0]?.report_data) {
            const domainIPs = extractDomainIPs(analyses[0].report_data, domain.domain)
            for (const dip of domainIPs) {
              if (!seenIPs.has(dip.ip)) {
                seenIPs.add(dip.ip)
                allIPs.push(dip)
              }
            }
          }
        }

        // Collect IPs from firewall analyses (step results with system_interface)
        const { data: firewalls } = await supabase
          .from('firewalls')
          .select('id, name')
          .eq('client_id', client.id)

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
              const fwIPs = extractFirewallIPs(stepResults, fw.name)
              for (const fip of fwIPs) {
                if (!seenIPs.has(fip.ip)) {
                  seenIPs.add(fip.ip)
                  allIPs.push(fip)
                }
              }
            }
          }
        }
      }

      if (allIPs.length === 0) {
        console.log(`[queue] Client ${client.name}: no public IPs found, skipping`)
        continue
      }

      console.log(`[queue] Client ${client.name}: ${allIPs.length} unique public IPs`)

      // Create snapshot
      const { data: snapshot, error: snapError } = await supabase
        .from('attack_surface_snapshots')
        .insert({
          client_id: client.id,
          status: 'pending',
          source_ips: allIPs,
          summary: { total_ips: allIPs.length, open_ports: 0, services: 0, cves: 0 },
        })
        .select('id')
        .single()

      if (snapError) {
        console.error(`[queue] Failed to create snapshot for ${client.name}:`, snapError.message)
        continue
      }

      // Create one task per IP
      const tasks = allIPs.map(ip => ({
        snapshot_id: snapshot.id,
        ip: ip.ip,
        source: ip.source,
        label: ip.label,
        status: 'pending',
      }))

      const { error: tasksError } = await supabase
        .from('attack_surface_tasks')
        .insert(tasks)

      if (tasksError) {
        console.error(`[queue] Failed to create tasks for ${client.name}:`, tasksError.message)
        continue
      }

      // Transition snapshot to running immediately after tasks are created
      await supabase
        .from('attack_surface_snapshots')
        .update({ status: 'running' })
        .eq('id', snapshot.id)

      totalSnapshots++
      totalTasks += tasks.length
      console.log(`[queue] Client ${client.name}: snapshot ${snapshot.id}, ${tasks.length} tasks created`)
    }

    // Check if any super agents are online (last_seen within 5 minutes)
    const { data: superAgents } = await supabase
      .from('agents')
      .select('id, name, last_seen')
      .eq('is_system_agent', true)
      .eq('revoked', false)

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const onlineAgents = (superAgents || []).filter(a => a.last_seen && a.last_seen > fiveMinAgo)

    if (totalTasks > 0 && onlineAgents.length === 0) {
      // Create alert
      await supabase.from('system_alerts').insert({
        alert_type: 'no_super_agent_online',
        severity: 'critical',
        title: 'Nenhum Super Agent online',
        message: `${totalTasks} tasks de Attack Surface foram criadas, mas nenhum Super Agent está online para processá-las. Inicie ou adicione um Super Agent.`,
        metadata: { total_tasks: totalTasks, total_snapshots: totalSnapshots },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
    }

    return new Response(JSON.stringify({
      success: true,
      snapshots_created: totalSnapshots,
      tasks_created: totalTasks,
      super_agents_online: onlineAgents.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[queue] Error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
