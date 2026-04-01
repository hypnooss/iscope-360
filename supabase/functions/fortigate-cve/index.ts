import { getCorsHeaders } from '../_shared/cors.ts';

interface VendorConfig {
  cpeVendor: string;
  cpeProduct: string;
  cpeType: string;
  keyword: string;
  descriptionFilter: string;
  vendorLabel: string;
}

const VENDOR_CONFIG: Record<string, VendorConfig> = {
  fortinet: {
    cpeVendor: 'fortinet',
    cpeProduct: 'fortios',
    cpeType: 'o',
    keyword: 'FortiOS',
    descriptionFilter: 'fortios',
    vendorLabel: 'Fortinet',
  },
  sonicwall: {
    cpeVendor: 'sonicwall',
    cpeProduct: 'sonicos',
    cpeType: 'o',
    keyword: 'SonicOS',
    descriptionFilter: 'sonicos',
    vendorLabel: 'SonicWall',
  },
};

interface CVEItem {
  id: string;
  description: string;
  affectedVersions?: string;
  severity: string;
  score: number;
  publishedDate: string;
  lastModifiedDate: string;
  references: string[];
}

// Extracts version-specific info from NVD descriptions for the given vendor product
function extractVendorInfo(fullDescription: string, config: VendorConfig): {
  productDescription: string;
  affectedVersions: string;
  technicalDescription: string;
} {
  const descLower = fullDescription.toLowerCase();
  const filterTerm = config.descriptionFilter.toLowerCase();

  if (!descLower.includes(filterTerm)) {
    return {
      productDescription: fullDescription,
      affectedVersions: '',
      technicalDescription: fullDescription,
    };
  }

  const keyword = config.keyword;

  // Common version range patterns
  const rangePattern = new RegExp(
    `${keyword}\\s+(?:version\\s+)?(\\d+\\.\\d+(?:\\.\\d+)?)\\s*(?:through|to|before|and later|and earlier|-)\\s*(\\d+\\.\\d+(?:\\.\\d+)?)`,
    'gi'
  );
  const singlePattern = new RegExp(
    `${keyword}\\s+(?:version\\s+)?(\\d+\\.\\d+(?:\\.\\d+)?(?:\\s*,?\\s*\\d+\\.\\d+(?:\\.\\d+)?)*)`,
    'gi'
  );
  const allVersionsPattern = new RegExp(
    `${keyword}\\s+(?:version\\s+)?(\\d+\\.\\d+(?:\\.\\d+)?)\\s+all\\s+versions`,
    'gi'
  );

  let affectedVersions = '';

  // Check "all versions" pattern first
  const allVersionsMatches = fullDescription.match(allVersionsPattern);
  if (allVersionsMatches && allVersionsMatches.length > 0) {
    affectedVersions = allVersionsMatches.join(', ');
  }

  // Then check range patterns
  if (!affectedVersions) {
    const matches = fullDescription.match(rangePattern);
    if (matches && matches.length > 0) {
      affectedVersions = matches.join(', ');
    }
  }

  // Then check single version
  if (!affectedVersions) {
    const singleMatches = fullDescription.match(singlePattern);
    if (singleMatches) {
      affectedVersions = singleMatches.join(', ');
    }
  }

  // Extract technical description
  const technicalPatterns = [
    /\b(allows?\s+.+)/i,
    /\b(may\s+allow\s+.+)/i,
    /\b(enables?\s+.+)/i,
    /\b(could\s+allow\s+.+)/i,
    /\b(permits?\s+.+)/i,
    /\b(makes?\s+it\s+possible\s+.+)/i,
  ];

  let technicalDescription = '';
  for (const pattern of technicalPatterns) {
    const techMatch = fullDescription.match(pattern);
    if (techMatch) {
      technicalDescription = techMatch[1];
      break;
    }
  }

  // Build product-focused description
  let productDescription = '';
  if (affectedVersions) {
    productDescription = affectedVersions;
    if (technicalDescription) {
      productDescription += ' - ' + technicalDescription;
    }
  } else {
    const sentences = fullDescription.split(/[.;]/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes(filterTerm)) {
        productDescription = sentence.trim();
        break;
      }
    }
    if (!productDescription) {
      productDescription = fullDescription;
    }
  }

  return {
    productDescription: productDescription.substring(0, 400) + (productDescription.length > 400 ? '...' : ''),
    affectedVersions,
    technicalDescription: technicalDescription || fullDescription,
  };
}

function parseCVEFromNVD(vuln: any, config: VendorConfig): CVEItem | null {
  const cve = vuln.cve;

  // Ensure CVE actually mentions the vendor product
  const desc = cve.descriptions?.find((d: any) => d.lang === 'en')?.value || '';
  if (!desc.toLowerCase().includes(config.descriptionFilter)) {
    return null;
  }

  // Get CVSS score and severity
  let score = 0;
  let severity = 'UNKNOWN';

  if (cve.metrics?.cvssMetricV31?.[0]) {
    score = cve.metrics.cvssMetricV31[0].cvssData.baseScore;
    severity = cve.metrics.cvssMetricV31[0].cvssData.baseSeverity;
  } else if (cve.metrics?.cvssMetricV30?.[0]) {
    score = cve.metrics.cvssMetricV30[0].cvssData.baseScore;
    severity = cve.metrics.cvssMetricV30[0].cvssData.baseSeverity;
  } else if (cve.metrics?.cvssMetricV2?.[0]) {
    score = cve.metrics.cvssMetricV2[0].cvssData.baseScore;
    if (score >= 9.0) severity = 'CRITICAL';
    else if (score >= 7.0) severity = 'HIGH';
    else if (score >= 4.0) severity = 'MEDIUM';
    else severity = 'LOW';
  }

  const fullDescription =
    cve.descriptions?.find((d: any) => d.lang === 'en')?.value ||
    cve.descriptions?.[0]?.value ||
    'No description available';

  const vendorInfo = extractVendorInfo(fullDescription, config);
  const references = cve.references?.slice(0, 3).map((ref: any) => ref.url) || [];

  return {
    id: cve.id,
    description: vendorInfo.productDescription,
    affectedVersions: vendorInfo.affectedVersions,
    severity,
    score,
    publishedDate: cve.published,
    lastModifiedDate: cve.lastModified,
    references,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { version, vendor = 'fortinet' } = await req.json();

    if (!version) {
      return new Response(
        JSON.stringify({ success: false, error: 'Version is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = VENDOR_CONFIG[vendor];
    if (!config) {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported vendor: ${vendor}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching CVEs for ${config.keyword} version: ${version} (vendor: ${vendor})`);

    const versionParts = version.replace('v', '').split('.');
    const majorMinor = versionParts.slice(0, 2).join('.');

    // Build NVD CPE match dynamically
    const cpeMatch = `cpe:2.3:${config.cpeType}:${config.cpeVendor}:${config.cpeProduct}:${version.replace('v', '')}:*:*:*:*:*:*:*`;
    const nvdUrl = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
    nvdUrl.searchParams.set('cpeName', cpeMatch);

    console.log(`Querying NVD API: ${nvdUrl.toString()}`);

    let cves: CVEItem[] = [];

    try {
      const nvdResponse = await fetch(nvdUrl.toString(), {
        headers: { Accept: 'application/json' },
      });

      if (nvdResponse.ok) {
        const nvdData = await nvdResponse.json();
        console.log(`NVD returned ${nvdData.totalResults || 0} results`);

        if (nvdData.vulnerabilities && nvdData.vulnerabilities.length > 0) {
          cves = nvdData.vulnerabilities
            .map((vuln: any) => parseCVEFromNVD(vuln, config))
            .filter(Boolean) as CVEItem[];
        }
      } else {
        console.log(`NVD API returned status ${nvdResponse.status}, trying keyword search`);
      }
    } catch (nvdError) {
      console.log(`CPE search failed: ${nvdError}, trying keyword search`);
    }

    // Fallback: keyword search
    if (cves.length === 0) {
      const keywordUrl = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
      keywordUrl.searchParams.set('keywordSearch', `${config.keyword} ${majorMinor}`);
      keywordUrl.searchParams.set('resultsPerPage', '20');

      console.log(`Trying keyword search: ${keywordUrl.toString()}`);

      try {
        const keywordResponse = await fetch(keywordUrl.toString(), {
          headers: { Accept: 'application/json' },
        });

        if (keywordResponse.ok) {
          const keywordData = await keywordResponse.json();
          console.log(`Keyword search returned ${keywordData.totalResults || 0} results`);

          if (keywordData.vulnerabilities && keywordData.vulnerabilities.length > 0) {
            cves = keywordData.vulnerabilities
              .slice(0, 15)
              .map((vuln: any) => parseCVEFromNVD(vuln, config))
              .filter(Boolean) as CVEItem[];
          }
        }
      } catch (keywordError) {
        console.log(`Keyword search also failed: ${keywordError}`);
      }
    }

    cves.sort((a, b) => b.score - a.score);

    console.log(`Returning ${cves.length} CVEs for ${config.keyword}`);

    return new Response(
      JSON.stringify({
        success: true,
        version,
        vendor,
        totalCVEs: cves.length,
        cves,
        source: 'NIST National Vulnerability Database',
        disclaimer: `Esta é uma lista informativa de CVEs conhecidos. Verifique os advisories oficiais da ${config.vendorLabel} para informações precisas sobre versões afetadas.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching CVEs:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch CVEs';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
