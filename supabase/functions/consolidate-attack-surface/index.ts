import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { snapshot_id } = await req.json()

    if (!snapshot_id) {
      return new Response(JSON.stringify({ error: 'snapshot_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[consolidate] Starting consolidation for snapshot ${snapshot_id}`)

    // Idempotency check: only consolidate if not already completed
    const { data: snapshot } = await supabase
      .from('attack_surface_snapshots')
      .select('status')
      .eq('id', snapshot_id)
      .single()

    if (!snapshot) {
      console.error(`[consolidate] Snapshot ${snapshot_id} not found`)
      return new Response(JSON.stringify({ error: 'Snapshot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (snapshot.status === 'completed') {
      console.log(`[consolidate] Snapshot ${snapshot_id} already completed, skipping`)
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch all tasks for this snapshot
    const { data: allTasks } = await supabase
      .from('attack_surface_tasks')
      .select('ip, source, label, status, result')
      .eq('snapshot_id', snapshot_id)

    // Fetch existing results from snapshot to merge
    const { data: existingSnapshot } = await supabase
      .from('attack_surface_snapshots')
      .select('results')
      .eq('id', snapshot_id)
      .single()

    const existingResults: Record<string, any> = (existingSnapshot?.results as Record<string, any>) || {}

    // Consolidate: start with existing results, then overlay task results
    const results: Record<string, any> = { ...existingResults }
    let totalPorts = 0
    let totalServices = 0
    const allVulns = new Set<string>()

    // Update only IPs that had tasks in this batch
    for (const t of (allTasks || [])) {
      const r = t.result || {}
      results[t.ip] = {
        ports: r.ports || [],
        services: r.services || [],
        web_services: r.web_services || [],
        vulns: r.vulns || [],
        os: r.os || '',
        hostnames: r.hostnames || [],
        asn: r.raw_steps?.asn_classifier?.data || null,
        error: t.status === 'failed' ? (r.error || 'Task failed') : undefined,
      }
    }

    // Recalculate summary from ALL IPs (existing + updated)
    for (const ip of Object.keys(results)) {
      const r = results[ip]
      totalPorts += (r.ports || []).length
      totalServices += (r.services || []).length + (r.web_services || []).length
      for (const v of (r.vulns || [])) allVulns.add(v)
    }

    // Calculate exposure score (0-100, lower is better)
    const totalIPs = Object.keys(results).length
    const vulnCount = allVulns.size
    let score = 100
    if (totalIPs > 0) {
      const avgPorts = totalPorts / totalIPs
      const portPenalty = Math.min(avgPorts * 2, 40)
      const servicePenalty = Math.min(totalServices * 1.5, 30)
      const vulnPenalty = Math.min(vulnCount * 5, 30)
      score = Math.max(0, Math.round(100 - portPenalty - servicePenalty - vulnPenalty))
    }

    // Match CVEs from cve_cache based on CPEs found (vendor-aware)
    const allCPEs: string[] = []
    for (const ip of Object.keys(results)) {
      for (const svc of (results[ip].services || [])) {
        if (svc.cpe && Array.isArray(svc.cpe)) {
          allCPEs.push(...svc.cpe)
        }
      }
    }

    let cveMatches: any[] = []
    if (allCPEs.length > 0) {
      const entries = allCPEs.map((cpe: string) => {
        const parts = cpe.replace('cpe:2.3:', '').replace('cpe:/', '').split(':')
        const vendor = (parts[1] || '').replace(/_/g, ' ').toLowerCase()
        const product = (parts[2] || '').replace(/_/g, ' ').toLowerCase()
        return { vendor, product }
      }).filter(e => e.product.length > 2)

      // Deduplicate by vendor+product
      const seen = new Set<string>()
      const uniqueEntries = entries.filter(e => {
        const key = `${e.vendor}:${e.product}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      for (const entry of uniqueEntries.slice(0, 10)) {
        const { data: cves } = await supabase
          .from('cve_cache')
          .select('cve_id, title, severity, score, advisory_url, products')
          .ilike('title', `%${entry.product}%`)
          .order('score', { ascending: false })
          .limit(20)

        if (cves) {
          for (const cve of cves) {
            if (cveMatches.find(c => c.cve_id === cve.cve_id)) continue
            const titleLower = (cve.title || '').toLowerCase()
            const vendorMatch = titleLower.includes(entry.vendor) ||
              (Array.isArray(cve.products) && cve.products.some((p: any) => String(p).toLowerCase().includes(entry.vendor)))
            if (vendorMatch) {
              cveMatches.push(cve)
            }
          }
        }
      }
    }

    // Update snapshot
    await supabase
      .from('attack_surface_snapshots')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results,
        cve_matches: cveMatches,
        summary: {
          total_ips: totalIPs,
          open_ports: totalPorts,
          services: totalServices,
          cves: vulnCount + cveMatches.length,
        },
        score,
      })
      .eq('id', snapshot_id)

    console.log(`[consolidate] Snapshot ${snapshot_id} completed: score=${score}, ips=${totalIPs}, ports=${totalPorts}`)

    return new Response(JSON.stringify({ success: true, score, total_ips: totalIPs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[consolidate] Error:', (error as Error).message)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
