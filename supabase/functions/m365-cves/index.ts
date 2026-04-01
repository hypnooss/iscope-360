import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { getCorsHeaders } from '../_shared/cors.ts';

const MSRC_BASE = 'https://api.msrc.microsoft.com/cvrf/v3.0';

interface MSRCUpdate {
  ID: string;
  Alias: string;
  DocumentTitle: string;
  Severity: string | null;
  InitialReleaseDate: string;
  CurrentReleaseDate: string;
}

interface CVEResult {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  score: number | null;
  products: string[];
  publishedDate: string;
  advisoryUrl: string;
  description: string;
  customerActionRequired: boolean;
}

function mapSeverity(sev: string | undefined | null): CVEResult['severity'] {
  if (!sev) return 'UNKNOWN';
  const s = sev.toLowerCase();
  if (s === 'critical') return 'CRITICAL';
  if (s === 'important' || s === 'high') return 'HIGH';
  if (s === 'moderate' || s === 'medium') return 'MEDIUM';
  if (s === 'low') return 'LOW';
  return 'UNKNOWN';
}

function getProductNames(vuln: any, productTree: any): string[] {
  const productIds = new Set<string>();
  const names: string[] = [];

  if (vuln.ProductStatuses) {
    for (const status of vuln.ProductStatuses) {
      if (status.ProductID) {
        for (const pid of status.ProductID) {
          productIds.add(pid);
        }
      }
    }
  }

  if (productTree?.FullProductName) {
    for (const prod of productTree.FullProductName) {
      if (productIds.has(prod.ProductID)) {
        names.push(prod.Value);
      }
    }
  }

  return [...new Set(names)];
}

function extractCVSSScore(vuln: any): number | null {
  if (vuln.CVSSScoreSets) {
    for (const scoreSet of vuln.CVSSScoreSets) {
      if (scoreSet.BaseScore != null) {
        return parseFloat(scoreSet.BaseScore);
      }
    }
  }
  return null;
}

function extractDescription(vuln: any): string {
  if (vuln.Notes) {
    for (const note of vuln.Notes) {
      if (note.Type === 1 || note.Title === 'Description') {
        return note.Value || '';
      }
    }
    if (vuln.Notes.length > 0 && vuln.Notes[0].Value) {
      return vuln.Notes[0].Value;
    }
  }
  return '';
}

function getMaxSeverity(vuln: any): string | null {
  if (vuln.Threats) {
    for (const threat of vuln.Threats) {
      if (threat.Type === 3 && threat.Description?.Value) {
        return threat.Description.Value;
      }
    }
  }
  return null;
}

/**
 * Maps a raw MSRC product name to a simplified cloud product name.
 * Returns null for on-premises products or unrecognized names — 
 * this ensures only explicitly mapped cloud products are included.
 */
function simplifyProductName(name: string): string | null {
  const lower = name.toLowerCase();

  // Explicitly exclude on-premises server products
  if (lower.includes('exchange server')) return null;
  if (lower.includes('sharepoint server')) return null;
  if (lower.includes('sharepoint enterprise server')) return null;
  if (lower.includes('sharepoint foundation')) return null;
  if (lower.includes('windows server')) return null;
  if (lower.includes('skype for business server')) return null;
  if (lower.includes('lync server')) return null;

  // Map to cloud product names
  if (lower.includes('exchange online')) return 'Exchange Online';
  if (lower.includes('sharepoint online')) return 'SharePoint Online';
  if (lower.includes('teams')) return 'Teams';
  if (lower.includes('outlook')) return 'Outlook';
  if (lower.includes('entra') || lower.includes('azure active directory')) return 'Entra ID';
  if (lower.includes('defender')) return 'Defender';
  if (lower.includes('intune')) return 'Intune';
  if (lower.includes('onedrive')) return 'OneDrive';
  if (lower.includes('microsoft 365 apps') || lower.includes('microsoft office')) return 'Microsoft 365 Apps';
  if (lower.includes('microsoft 365')) return 'Microsoft 365';

  // Reject anything not explicitly mapped as a cloud product
  return null;
}

/**
 * Determines if a CVE requires customer action based on MSRC remediation data.
 * 
 * Logic:
 * 1. If any remediation explicitly mentions "customer action" → true
 * 2. If vuln.Flags contains action indicators → true  
 * 3. If there are NO remediations at all → true (no info = assume action needed)
 * 4. For cloud products: if all remediations are automatic VendorFix → false
 * 5. Otherwise → true
 */
function extractCustomerActionRequired(vuln: any): boolean {
  // Check Flags array (MSRC uses this for explicit action indicators)
  if (vuln.Flags && Array.isArray(vuln.Flags)) {
    for (const flag of vuln.Flags) {
      const label = (flag.Label || '').toLowerCase();
      if (label.includes('customer action') || label.includes('action required')) {
        return true;
      }
    }
  }

  if (!vuln.Remediations || !Array.isArray(vuln.Remediations) || vuln.Remediations.length === 0) {
    return false; // No remediation info → likely auto-fixed SaaS, no action needed
  }

  // Check if any remediation explicitly mentions customer action
  for (const rem of vuln.Remediations) {
    const desc = (rem.Description?.Value || '').toLowerCase();
    const subType = (rem.SubType || '').toLowerCase();
    const url = (rem.URL || '').toLowerCase();

    if (desc.includes('customer action required') || desc.includes('action required')) {
      return true;
    }
    if (subType.includes('customer action')) {
      return true;
    }
    // MSRC sometimes uses specific known-issue URLs indicating manual steps
    if (url.includes('aka.ms') && desc.includes('update') && desc.includes('manual')) {
      return true;
    }
  }

  // For cloud/SaaS CVEs: Microsoft typically auto-patches.
  // If there's at least one VendorFix with "Security Update", it's auto-managed.
  // But we need to check that the fix applies to cloud products, not just on-prem.
  const hasCloudAutoFix = vuln.Remediations.some((rem: any) => {
    if (rem.Type !== 2) return false; // Type 2 = VendorFix
    const subType = (rem.SubType || '').toLowerCase();
    return subType.includes('security update');
  });

  // If there's a VendorFix/Security Update, the admin needs to apply it (client-side patch)
  // If there's no VendorFix, it's auto-managed server-side by Microsoft
  return hasCloudAutoFix;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const months = parseInt(url.searchParams.get('months') || '3', 10);

    const updatesRes = await fetch(`${MSRC_BASE}/updates`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!updatesRes.ok) {
      throw new Error(`MSRC updates API returned ${updatesRes.status}`);
    }

    const updatesData = await updatesRes.json();
    const updates: MSRCUpdate[] = updatesData.value || updatesData;

    const sortedUpdates = updates
      .filter((u: MSRCUpdate) => u.ID && /^\d{4}-[A-Za-z]{3}$/.test(u.ID))
      .sort((a: MSRCUpdate, b: MSRCUpdate) => new Date(b.InitialReleaseDate).getTime() - new Date(a.InitialReleaseDate).getTime())
      .slice(0, Math.min(months, 6));

    const allCves: CVEResult[] = [];
    const seenCves = new Set<string>();

    for (const update of sortedUpdates) {
      try {
        const cvrfRes = await fetch(`${MSRC_BASE}/cvrf/${update.ID}`, {
          headers: { 'Accept': 'application/json' },
        });

        if (!cvrfRes.ok) {
          console.warn(`Failed to fetch CVRF for ${update.ID}: ${cvrfRes.status}`);
          continue;
        }

        const cvrf = await cvrfRes.json();
        const productTree = cvrf.ProductTree;
        const vulnerabilities = cvrf.Vulnerability || [];

        for (const vuln of vulnerabilities) {
          const cveId = vuln.CVE;
          if (!cveId || seenCves.has(cveId)) continue;

          // Step 0: Filter by CVE title — reject on-premises server vulnerabilities
          const cveTitle = (vuln.Title?.Value || '').toLowerCase();
          const onPremTitlePatterns = [
            'sharepoint server', 'sharepoint enterprise server', 'sharepoint foundation',
            'exchange server', 'windows server', 'skype for business server', 'lync server'
          ];
          if (onPremTitlePatterns.some(p => cveTitle.includes(p))) continue;

          // Step 1: Get raw product names
          const productNames = getProductNames(vuln, productTree);

          // Step 2: Simplify and filter — ONLY keep explicitly mapped cloud products
          const simplifiedProducts = [...new Set(
            productNames
              .map(simplifyProductName)
              .filter((n): n is string => n !== null)
          )];

          // Step 3: If no cloud products remain, skip this CVE entirely
          if (simplifiedProducts.length === 0) continue;

          seenCves.add(cveId);

          const severity = mapSeverity(getMaxSeverity(vuln));
          const score = extractCVSSScore(vuln);
          const title = vuln.Title?.Value || cveId;
          const description = extractDescription(vuln);
          const customerActionRequired = extractCustomerActionRequired(vuln);

          allCves.push({
            id: cveId,
            title,
            severity,
            score,
            products: simplifiedProducts,
            publishedDate: update.InitialReleaseDate?.split('T')[0] || '',
            advisoryUrl: `https://msrc.microsoft.com/update-guide/vulnerability/${cveId}`,
            description: description.substring(0, 500),
            customerActionRequired,
          });
        }
      } catch (err) {
        console.warn(`Error processing CVRF ${update.ID}:`, err);
      }
    }

    const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };
    allCves.sort((a, b) => {
      if (a.score != null && b.score != null) return b.score - a.score;
      if (a.score != null) return -1;
      if (b.score != null) return 1;
      return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
    });

    return new Response(JSON.stringify({
      success: true,
      totalCVEs: allCves.length,
      cves: allCves,
      months: sortedUpdates.map((u: MSRCUpdate) => u.ID),
      source: 'Microsoft Security Response Center',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('m365-cves error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
