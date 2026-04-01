import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts';

// ── Crypto helpers (same as manage-api-keys) ────────────────────────────────

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

async function decryptSecret(encryptedData: string): Promise<string> {
  const encryptionKeyHex = Deno.env.get('M365_ENCRYPTION_KEY')
  if (!encryptionKeyHex) throw new Error('M365_ENCRYPTION_KEY not configured')

  const [ivHex, ciphertextHex] = encryptedData.split(':')
  if (!ivHex || !ciphertextHex) return encryptedData

  const iv = fromHex(ivHex)
  const ciphertext = fromHex(ciphertextHex)
  const keyBytes = fromHex(encryptionKeyHex)

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext)
  return new TextDecoder().decode(decrypted)
}

// ── Resolve API key: DB (encrypted) → env fallback ─────────────────────────

async function resolveApiKey(supabase: any, keyName: string): Promise<string | null> {
  try {
    const settingsKey = `api_key_${keyName}`
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', settingsKey)
      .maybeSingle()

    if (data?.value) {
      const raw = typeof data.value === 'string' ? data.value : JSON.stringify(data.value)
      const clean = raw.replace(/^"|"$/g, '')
      return await decryptSecret(clean)
    }
  } catch (e) {
    console.warn(`Failed to read ${keyName} from DB:`, (e as Error).message)
  }

  return Deno.env.get(keyName) || null
}

// ── IP helpers ──────────────────────────────────────────────────────────────

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p))) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true // APIPA / link-local
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

  if (size > 256) return [ip]
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

// ── Extract IPs from External Domain analyses ───────────────────────────────

function extractDomainIPs(reportData: any, domainName: string): SourceIP[] {
  const ips: SourceIP[] = []
  const seen = new Set<string>()
  if (!reportData) return ips

  // Path 0: subdomain enumeration format
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

  // Path 1: subdomainSummary
  const subSummary = reportData.subdomainSummary
  if (subSummary?.subdomains && Array.isArray(subSummary.subdomains)) {
    for (const sub of subSummary.subdomains) {
      if (sub.addresses && Array.isArray(sub.addresses)) {
        for (const addr of sub.addresses) {
          const ip = addr.ip || addr.value
          if (ip && !seen.has(ip) && !isPrivateIP(ip)) {
            seen.add(ip)
            ips.push({ ip, source: 'dns', label: `${sub.hostname || domainName}` })
          }
        }
      }
    }
  }

  // Path 2: checks[*].rawData
  if (reportData.checks && Array.isArray(reportData.checks)) {
    for (const check of reportData.checks) {
      const raw = check.rawData
      if (!raw) continue
      if (typeof raw === 'object') {
        const searchObj = (obj: any, depth = 0) => {
          if (depth > 5 || !obj) return
          if (Array.isArray(obj)) {
            for (const item of obj) searchObj(item, depth + 1)
          } else if (typeof obj === 'object') {
            if (obj.ip && typeof obj.ip === 'string' && !seen.has(obj.ip) && !isPrivateIP(obj.ip)) {
              seen.add(obj.ip)
              ips.push({ ip: obj.ip, source: 'dns', label: obj.hostname || obj.name || domainName })
            }
            if (obj.address && typeof obj.address === 'string' && !seen.has(obj.address) && !isPrivateIP(obj.address)) {
              seen.add(obj.address)
              ips.push({ ip: obj.address, source: 'dns', label: obj.hostname || obj.name || domainName })
            }
            for (const key of Object.keys(obj)) {
              searchObj(obj[key], depth + 1)
            }
          }
        }
        searchObj(raw)
      }
    }
  }

  return ips
}

// ── Extract IPs from Firewall analyses (WAN interfaces) ─────────────────────

function extractFirewallIPs(stepResults: any[], firewallName: string): SourceIP[] {
  const ips: SourceIP[] = []
  const seen = new Set<string>()

  for (const step of stepResults) {
    if (step.step_id !== 'system_interface') continue
    const resultData = step.data
    if (!resultData) continue
    const interfaces = Array.isArray(resultData)
      ? resultData
      : (resultData.results || resultData.data || [])
    if (!Array.isArray(interfaces)) continue

    for (const iface of interfaces) {
      const role = (iface.role || '').toLowerCase()
      if (role !== 'wan') continue
      const ipField = iface.ip || ''
      const expandedIPs = expandSubnet(ipField)
      const ifaceName = iface.name || 'unknown'
      const label = `${firewallName} - ${ifaceName} (WAN)`
      for (const expandedIP of expandedIPs) {
        if (expandedIP === '0.0.0.0' || seen.has(expandedIP) || isPrivateIP(expandedIP)) continue
        seen.add(expandedIP)
        ips.push({ ip: expandedIP, source: 'firewall', label })
      }
    }
  }
  return ips
}

// ── Enrichment result type ──────────────────────────────────────────────────

type EnrichmentSource = 'shodan' | 'censys' | 'shodan+censys' | 'internetdb' | 'shodan+st' | 'censys+st' | 'shodan+censys+st' | 'internetdb+st' | 'none'

interface EnrichedIP {
  ip: string
  ports: number[]
  services: Array<{
    port: number
    transport: string
    product: string
    version: string
    banner: string
    cpe: string[]
  }>
  vulns: string[]
  os: string
  hostnames: string[]
  tags: string[]
  enrichment_source: EnrichmentSource
  error?: string
}

// ── Shodan API (primary) ────────────────────────────────────────────────────

async function queryShodan(ip: string, apiKey: string): Promise<EnrichedIP | null> {
  try {
    const resp = await fetch(`https://api.shodan.io/shodan/host/${ip}?key=${apiKey}`, {
      signal: AbortSignal.timeout(15000),
    })

    if (!resp.ok) return null

    const data = await resp.json()
    const services: EnrichedIP['services'] = []

    if (data.data && Array.isArray(data.data)) {
      for (const svc of data.data) {
        services.push({
          port: svc.port || 0,
          transport: svc.transport || 'tcp',
          product: svc.product || '',
          version: svc.version || '',
          banner: (svc.data || '').substring(0, 500),
          cpe: svc.cpe || svc.cpe23 || [],
        })
      }
    }

    return {
      ip,
      ports: data.ports || [],
      services,
      vulns: data.vulns ? Object.keys(data.vulns) : [],
      os: data.os || '',
      hostnames: data.hostnames || [],
      tags: data.tags || [],
      enrichment_source: 'shodan',
    }
  } catch (e) {
    console.warn(`Shodan API failed for ${ip}: ${(e as Error).message}`)
    return null
  }
}

// ── Censys API (primary) ────────────────────────────────────────────────────

async function queryCensys(ip: string, apiKey: string): Promise<EnrichedIP | null> {
  try {
    // apiKey format: API_ID:API_SECRET
    const basicAuth = btoa(apiKey)

    const resp = await fetch(`https://search.censys.io/api/v2/hosts/${ip}`, {
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!resp.ok) {
      console.warn(`Censys API error for ${ip}: ${resp.status}`)
      return null
    }

    const json = await resp.json()
    const host = json.result || {}

    const ports: number[] = []
    const services: EnrichedIP['services'] = []
    const vulns: string[] = []

    // Parse services
    if (host.services && Array.isArray(host.services)) {
      for (const svc of host.services) {
        const port = svc.port || 0
        if (port && !ports.includes(port)) ports.push(port)

        const product = svc.software?.product || svc.service_name || ''
        const version = svc.software?.version || ''
        const banner = (svc.banner || '').substring(0, 500)
        const transport = svc.transport_protocol?.toLowerCase() || 'tcp'

        // Extract CPEs from software
        const cpe: string[] = []
        if (svc.software?.uniform_resource_identifier) {
          cpe.push(svc.software.uniform_resource_identifier)
        }

        services.push({ port, transport, product, version, banner, cpe })

        // Collect CVEs from observed_at or labels
        if (svc.cve && Array.isArray(svc.cve)) {
          for (const c of svc.cve) vulns.push(typeof c === 'string' ? c : c.id || '')
        }
      }
    }

    // OS detection
    const os = host.operating_system?.product
      ? `${host.operating_system.vendor || ''} ${host.operating_system.product} ${host.operating_system.version || ''}`.trim()
      : ''

    // Hostnames from DNS
    const hostnames: string[] = []
    if (host.dns?.names && Array.isArray(host.dns.names)) {
      hostnames.push(...host.dns.names)
    }
    if (host.dns?.reverse_dns?.names && Array.isArray(host.dns.reverse_dns.names)) {
      for (const h of host.dns.reverse_dns.names) {
        if (!hostnames.includes(h)) hostnames.push(h)
      }
    }

    return {
      ip,
      ports,
      services,
      vulns: [...new Set(vulns.filter(Boolean))],
      os,
      hostnames,
      tags: host.labels || [],
      enrichment_source: 'censys',
    }
  } catch (e) {
    console.warn(`Censys API failed for ${ip}: ${(e as Error).message}`)
    return null
  }
}

// ── Merge Shodan + Censys results ───────────────────────────────────────────

function mergeEnrichmentResults(shodan: EnrichedIP | null, censys: EnrichedIP | null, ip: string): EnrichedIP | null {
  if (!shodan && !censys) return null
  if (!shodan) return censys!
  if (!censys) return shodan

  // Both succeeded — merge
  const ports = [...new Set([...shodan.ports, ...censys.ports])].sort((a, b) => a - b)

  // Merge services: prefer the one with more info per port
  const serviceMap = new Map<number, EnrichedIP['services'][0]>()
  for (const svc of shodan.services) {
    serviceMap.set(svc.port, svc)
  }
  for (const svc of censys.services) {
    const existing = serviceMap.get(svc.port)
    if (!existing) {
      serviceMap.set(svc.port, svc)
    } else {
      // Prefer whichever has more detail (banner or product)
      if (!existing.product && svc.product) {
        serviceMap.set(svc.port, { ...svc, cpe: [...new Set([...existing.cpe, ...svc.cpe])] })
      } else if (existing.product && svc.banner && !existing.banner) {
        serviceMap.set(svc.port, { ...existing, banner: svc.banner, cpe: [...new Set([...existing.cpe, ...svc.cpe])] })
      }
    }
  }

  const vulns = [...new Set([...shodan.vulns, ...censys.vulns])]
  const hostnames = [...new Set([...shodan.hostnames, ...censys.hostnames])]
  const tags = [...new Set([...shodan.tags, ...censys.tags])]

  return {
    ip,
    ports,
    services: Array.from(serviceMap.values()),
    vulns,
    os: shodan.os || censys.os, // Prefer Shodan OS
    hostnames,
    tags,
    enrichment_source: 'shodan+censys',
  }
}

// ── Shodan InternetDB (fallback, free) ──────────────────────────────────────

// Well-known port to service mapping
const KNOWN_PORTS: Record<number, { product: string; transport: string }> = {
  21: { product: 'FTP', transport: 'tcp' },
  22: { product: 'OpenSSH', transport: 'tcp' },
  23: { product: 'Telnet', transport: 'tcp' },
  25: { product: 'SMTP', transport: 'tcp' },
  53: { product: 'DNS', transport: 'udp' },
  80: { product: 'HTTP', transport: 'tcp' },
  110: { product: 'POP3', transport: 'tcp' },
  143: { product: 'IMAP', transport: 'tcp' },
  443: { product: 'HTTPS', transport: 'tcp' },
  445: { product: 'SMB', transport: 'tcp' },
  465: { product: 'SMTPS', transport: 'tcp' },
  587: { product: 'SMTP Submission', transport: 'tcp' },
  993: { product: 'IMAPS', transport: 'tcp' },
  995: { product: 'POP3S', transport: 'tcp' },
  1433: { product: 'MSSQL', transport: 'tcp' },
  1723: { product: 'PPTP VPN', transport: 'tcp' },
  2082: { product: 'cPanel', transport: 'tcp' },
  2083: { product: 'cPanel SSL', transport: 'tcp' },
  2053: { product: 'Cloudflare DNS', transport: 'tcp' },
  2086: { product: 'WHM', transport: 'tcp' },
  2087: { product: 'WHM SSL', transport: 'tcp' },
  2096: { product: 'Webmail SSL', transport: 'tcp' },
  3306: { product: 'MySQL', transport: 'tcp' },
  3389: { product: 'RDP', transport: 'tcp' },
  5432: { product: 'PostgreSQL', transport: 'tcp' },
  5900: { product: 'VNC', transport: 'tcp' },
  8080: { product: 'HTTP Proxy', transport: 'tcp' },
  8443: { product: 'HTTPS Alt', transport: 'tcp' },
  8880: { product: 'HTTP Alt', transport: 'tcp' },
  8888: { product: 'HTTP Alt', transport: 'tcp' },
  9090: { product: 'Web Admin', transport: 'tcp' },
  10000: { product: 'Webmin', transport: 'tcp' },
  10443: { product: 'FortiGate Admin', transport: 'tcp' },
}

function parseCPE(cpe: string): { vendor: string; product: string; version: string } {
  const parts = cpe.replace('cpe:2.3:', '').replace('cpe:/', '').split(':')
  return {
    vendor: parts[1] || '',
    product: (parts[2] || '').replace(/_/g, ' '),
    version: parts[3] || '',
  }
}

async function queryInternetDB(ip: string): Promise<EnrichedIP | null> {
  try {
    const resp = await fetch(`https://internetdb.shodan.io/${ip}`, {
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) return null

    const data = await resp.json()
    const ports: number[] = data.ports || []
    const cpes: string[] = data.cpes || []
    const parsedCpes = cpes.map(parseCPE)

    let os = ''
    for (const cpe of cpes) {
      const normalized = cpe.replace('cpe:2.3:', '').replace('cpe:/', '')
      if (normalized.startsWith('o:')) {
        const parsed = parseCPE(cpe)
        os = `${parsed.vendor} ${parsed.product} ${parsed.version}`.trim()
        break
      }
    }

    const services: EnrichedIP['services'] = []
    for (const port of ports) {
      const known = KNOWN_PORTS[port]
      let matchedProduct = known?.product || ''
      let matchedVersion = ''
      const matchedCpeList: string[] = []

      for (let i = 0; i < parsedCpes.length; i++) {
        const pc = parsedCpes[i]
        const productLower = pc.product.toLowerCase()
        const isMatch =
          (port === 22 && productLower.includes('ssh')) ||
          (port === 21 && productLower.includes('ftp')) ||
          ((port === 80 || port === 443 || port === 8080 || port === 8443) &&
            (productLower.includes('apache') || productLower.includes('nginx') ||
             productLower.includes('iis') || productLower.includes('http') ||
             productLower.includes('lighttpd') || productLower.includes('litespeed'))) ||
          ((port === 25 || port === 465 || port === 587) &&
            (productLower.includes('smtp') || productLower.includes('postfix') ||
             productLower.includes('exim') || productLower.includes('sendmail'))) ||
          (port === 53 && (productLower.includes('dns') || productLower.includes('bind'))) ||
          (port === 3306 && productLower.includes('mysql')) ||
          (port === 5432 && productLower.includes('postgres')) ||
          (port === 3389 && productLower.includes('rdp'))

        if (isMatch) {
          matchedProduct = pc.product || matchedProduct
          matchedVersion = pc.version || matchedVersion
          matchedCpeList.push(cpes[i])
          break
        }
      }

      services.push({
        port,
        transport: known?.transport || 'tcp',
        product: matchedProduct,
        version: matchedVersion,
        banner: '',
        cpe: matchedCpeList,
      })
    }

    return {
      ip,
      ports,
      services,
      vulns: data.vulns || [],
      os,
      hostnames: data.hostnames || [],
      tags: data.tags || [],
      enrichment_source: 'internetdb',
    }
  } catch (e) {
    console.warn(`InternetDB failed for ${ip}: ${(e as Error).message}`)
    return null
  }
}

// ── SecurityTrails (reverse DNS only) ───────────────────────────────────────

interface SecurityTrailsData {
  hostnames: string[]
  domains: string[]
}

async function querySecurityTrails(ip: string, apiKey: string): Promise<SecurityTrailsData | null> {
  try {
    const resp = await fetch(`https://api.securitytrails.com/v1/ips/nearby/${ip}`, {
      headers: { 'APIKEY': apiKey, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) {
      console.warn(`SecurityTrails API error for ${ip}: ${resp.status}`)
      return null
    }

    const data = await resp.json()
    const hostnames: string[] = []
    const domains = new Set<string>()

    if (data.blocks && Array.isArray(data.blocks)) {
      for (const block of data.blocks) {
        if (block.hostnames && Array.isArray(block.hostnames)) {
          for (const h of block.hostnames) {
            if (typeof h === 'string') {
              hostnames.push(h)
              const parts = h.split('.')
              if (parts.length >= 2) {
                domains.add(parts.slice(-2).join('.'))
              }
            }
          }
        }
      }
    }

    return { hostnames, domains: Array.from(domains) }
  } catch (e) {
    console.warn(`SecurityTrails failed for ${ip}: ${(e as Error).message}`)
    return null
  }
}

// ── Enrichment orchestrator ─────────────────────────────────────────────────

async function enrichIP(
  ip: string,
  shodanApiKey: string | null,
  censysApiKey: string | null,
  securityTrailsApiKey: string | null,
): Promise<EnrichedIP> {
  let result: EnrichedIP = {
    ip,
    ports: [],
    services: [],
    vulns: [],
    os: '',
    hostnames: [],
    tags: [],
    enrichment_source: 'none',
  }

  // Step 1: Shodan + Censys in parallel (primary)
  const primaryPromises: Promise<EnrichedIP | null>[] = []
  if (shodanApiKey) primaryPromises.push(queryShodan(ip, shodanApiKey))
  else primaryPromises.push(Promise.resolve(null))
  if (censysApiKey) primaryPromises.push(queryCensys(ip, censysApiKey))
  else primaryPromises.push(Promise.resolve(null))

  const [shodanSettled, censysSettled] = await Promise.allSettled(primaryPromises)

  const shodanResult = shodanSettled.status === 'fulfilled' ? shodanSettled.value : null
  const censysResult = censysSettled.status === 'fulfilled' ? censysSettled.value : null

  const merged = mergeEnrichmentResults(shodanResult, censysResult, ip)

  if (merged) {
    result = merged
  } else {
    // Step 2: Both failed → InternetDB fallback
    console.log(`Primary APIs failed for ${ip}, trying InternetDB fallback`)
    const idbResult = await queryInternetDB(ip)
    if (idbResult) {
      result = idbResult
    }
  }

  // Step 3: SecurityTrails for reverse DNS only
  if (securityTrailsApiKey) {
    const stData = await querySecurityTrails(ip, securityTrailsApiKey)
    if (stData) {
      const existingHostnames = new Set(result.hostnames)
      for (const h of stData.hostnames) {
        if (!existingHostnames.has(h)) {
          result.hostnames.push(h)
        }
      }
      // Append +st to source
      if (result.enrichment_source !== 'none') {
        result.enrichment_source = `${result.enrichment_source}+st` as EnrichmentSource
      }
    }
  }

  return result
}

// ── CVE Correlation ─────────────────────────────────────────────────────────

async function correlateCVEs(
  enrichedResults: EnrichedIP[],
  supabase: any,
): Promise<any[]> {
  const matchMap = new Map<string, any>()

  // 1. Match by direct vuln IDs (existing logic)
  const allVulnIds = new Set<string>()
  for (const r of enrichedResults) {
    for (const v of r.vulns) {
      allVulnIds.add(v)
    }
  }

  if (allVulnIds.size > 0) {
    const vulnArray = Array.from(allVulnIds)
    for (let i = 0; i < vulnArray.length; i += 50) {
      const batch = vulnArray.slice(i, i + 50)
      const { data } = await supabase
        .from('cve_cache')
        .select('cve_id, title, severity, score, advisory_url, products')
        .in('cve_id', batch)

      if (data) {
        for (const d of data) matchMap.set(d.cve_id, d)
      }
    }
  }

  // 2. Match by CPE vendor+product names from local cache (vendor-aware)
  const cpeEntries: { vendor: string; product: string }[] = []
  for (const r of enrichedResults) {
    for (const svc of r.services) {
      for (const cpe of svc.cpe || []) {
        const parts = cpe.replace('cpe:2.3:', '').replace('cpe:/', '').split(':')
        const vendor = (parts[1] || '').replace(/_/g, ' ').toLowerCase()
        const product = (parts[2] || '').replace(/_/g, ' ').toLowerCase()
        if (product && product.length > 2) cpeEntries.push({ vendor, product })
      }
    }
  }

  // Deduplicate
  const seenCpe = new Set<string>()
  const uniqueCpeEntries = cpeEntries.filter(e => {
    const key = `${e.vendor}:${e.product}`
    if (seenCpe.has(key)) return false
    seenCpe.add(key)
    return true
  })

  if (uniqueCpeEntries.length > 0) {
    // Query CVEs from external_domain module in local cache
    const { data: webCves } = await supabase
      .from('cve_cache')
      .select('cve_id, title, severity, score, advisory_url, products')
      .eq('module_code', 'external_domain')
      .limit(1000)

    if (webCves) {
      for (const cve of webCves) {
        if (matchMap.has(cve.cve_id)) continue
        const titleLower = (cve.title || '').toLowerCase()
        const cveProducts = (cve.products || []).map((p: any) => String(p).toLowerCase())
        for (const entry of uniqueCpeEntries) {
          const productMatch = titleLower.includes(entry.product) || cveProducts.some((cp: string) => cp.includes(entry.product))
          const vendorMatch = titleLower.includes(entry.vendor) || cveProducts.some((cp: string) => cp.includes(entry.vendor))
          if (productMatch && vendorMatch) {
            matchMap.set(cve.cve_id, cve)
            break
          }
        }
      }
    }
  }

  return Array.from(matchMap.values())
}

// ── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { client_id } = await req.json()
    if (!client_id) {
      return new Response(JSON.stringify({ error: 'client_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve API keys: DB (encrypted) → env fallback
    const [shodanApiKey, censysApiKey, securityTrailsApiKey] = await Promise.all([
      resolveApiKey(supabase, 'SHODAN_API_KEY'),
      resolveApiKey(supabase, 'CENSYS_API_KEY'),
      resolveApiKey(supabase, 'SECURITYTRAILS_API_KEY'),
    ])

    console.log(`API keys resolved — Shodan: ${shodanApiKey ? 'yes' : 'no'}, Censys: ${censysApiKey ? 'yes' : 'no'}, SecurityTrails: ${securityTrailsApiKey ? 'yes' : 'no'}`)

    // Create snapshot record
    const { data: snapshot, error: snapError } = await supabase
      .from('attack_surface_snapshots')
      .insert({ client_id, status: 'processing' })
      .select('id')
      .single()

    if (snapError) throw snapError
    const snapshotId = snapshot.id

    try {
      // ── Step 1: Collect IPs ──────────────────────────────────────────

      const allIPs: SourceIP[] = []

      // 1a. From external domain analyses
      const { data: domains } = await supabase
        .from('external_domains')
        .select('id, domain, name')
        .eq('client_id', client_id)

      if (domains && domains.length > 0) {
        for (const domain of domains) {
          const { data: analyses } = await supabase
            .from('external_domain_analysis_history')
            .select('report_data, source')
            .eq('domain_id', domain.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(5)

          if (analyses && analyses.length > 0) {
            for (const analysis of analyses) {
              if (analysis.report_data) {
                const domainIPs = extractDomainIPs(analysis.report_data, domain.domain)
                allIPs.push(...domainIPs)
              }
            }
          }
        }
      }

      // 1b. From firewall analyses (WAN interfaces)
      const { data: firewalls } = await supabase
        .from('firewalls')
        .select('id, name, cloud_public_ip')
        .eq('client_id', client_id)

      if (firewalls && firewalls.length > 0) {
        for (const fw of firewalls) {
          // Cloud public IP: add directly if present and not private
          if (fw.cloud_public_ip && !isPrivateIP(fw.cloud_public_ip)) {
            allIPs.push({ ip: fw.cloud_public_ip, source: 'firewall', label: `${fw.name} - Cloud Public IP` })
          }

          const { data: tasks } = await supabase
            .from('agent_tasks')
            .select('id')
            .eq('target_id', fw.id)
            .eq('target_type', 'firewall')
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(1)

          if (tasks && tasks.length > 0) {
            const { data: stepResults } = await supabase
              .from('task_step_results')
              .select('step_id, data')
              .eq('task_id', tasks[0].id)
              .eq('step_id', 'system_interface')

            if (stepResults) {
              const fwIPs = extractFirewallIPs(stepResults, fw.name)
              allIPs.push(...fwIPs)
            }
          }
        }
      }

      // Deduplicate IPs
      const uniqueIPs = Array.from(
        allIPs.reduce((map, item) => {
          if (!map.has(item.ip)) {
            map.set(item.ip, item)
          } else {
            const existing = map.get(item.ip)!
            if (existing.source !== item.source) {
              existing.source = 'dns'
              existing.label = `${existing.label} + ${item.label}`
            }
          }
          return map
        }, new Map<string, SourceIP>()).values(),
      )

      console.log(`Collected ${uniqueIPs.length} unique public IPs for enrichment`)

      // ── Step 2: Enrich IPs (Shodan+Censys → InternetDB fallback → SecurityTrails DNS) ─

      const enrichedResults: EnrichedIP[] = []

      for (let i = 0; i < uniqueIPs.length; i++) {
        // Rate limit: ~1.1s between IPs (Shodan 1req/s, Censys 2.5req/s)
        if (i > 0) await new Promise(r => setTimeout(r, 1100))

        const result = await enrichIP(uniqueIPs[i].ip, shodanApiKey, censysApiKey, securityTrailsApiKey)
        enrichedResults.push(result)

        console.log(`[${i + 1}/${uniqueIPs.length}] ${result.ip}: ${result.enrichment_source} — ${result.ports.length} ports, ${result.vulns.length} vulns`)
      }

      // ── Step 3: Correlate CVEs ───────────────────────────────────────

      const cveMatches = await correlateCVEs(enrichedResults, supabase)

      // ── Step 4: Build results ────────────────────────────────────────

      const resultsMap: Record<string, any> = {}
      let totalPorts = 0
      let totalServices = 0

      for (const er of enrichedResults) {
        totalPorts += er.ports.length
        totalServices += er.services.filter(s => s.product).length
        resultsMap[er.ip] = {
          ports: er.ports,
          services: er.services,
          vulns: er.vulns,
          os: er.os,
          hostnames: er.hostnames,
          tags: er.tags,
          enrichment_source: er.enrichment_source,
          error: er.enrichment_source === 'none' ? 'No enrichment data available' : undefined,
        }
      }

      // Calculate exposure score (0-100)
      let score = 0
      if (uniqueIPs.length > 0) {
        const portScore = Math.min(totalPorts * 2, 40)
        const cveScore = Math.min(cveMatches.length * 5, 40)
        const ipScore = Math.min(uniqueIPs.length * 2, 20)
        score = Math.min(portScore + cveScore + ipScore, 100)
      }

      // ── Step 5: Persist results ──────────────────────────────────────

      const summary = {
        total_ips: uniqueIPs.length,
        open_ports: totalPorts,
        services: totalServices,
        cves: cveMatches.length,
      }

      await supabase
        .from('attack_surface_snapshots')
        .update({
          status: 'completed',
          source_ips: uniqueIPs,
          results: resultsMap,
          cve_matches: cveMatches,
          summary,
          score,
          completed_at: new Date().toISOString(),
        })
        .eq('id', snapshotId)

      console.log(`Scan completed: ${uniqueIPs.length} IPs, ${totalPorts} ports, ${cveMatches.length} CVEs, score=${score}`)

      return new Response(
        JSON.stringify({ success: true, snapshot_id: snapshotId, summary }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } catch (processError) {
      await supabase
        .from('attack_surface_snapshots')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          results: { error: (processError as Error).message },
        })
        .eq('id', snapshotId)

      throw processError
    }
  } catch (error) {
    console.error('Attack surface scan error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
