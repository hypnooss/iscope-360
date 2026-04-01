import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================
// Types
// ============================================

interface SubdomainEnumRequest {
  domain: string;
  timeout?: number;
  blueprint_steps?: BlueprintStep[];
}

interface BlueprintStep {
  id: string;
  executor: string;
  runtime: string;
  phase?: number;
  priority?: number;
  config: {
    name: string;
    url_template: string;
    method: string;
    headers?: Record<string, string>;
    response_parser: string;
    requires_api_key?: boolean;
    api_key_env?: string;
  };
}

interface SubdomainEntry {
  subdomain: string;
  sources: string[];
  ips: string[];
  is_alive: boolean;
}

interface SubdomainEnumResponse {
  success: boolean;
  domain: string;
  total_found: number;
  alive_count: number;
  inactive_count: number;
  sources: string[];
  subdomains: SubdomainEntry[];
  errors?: string[];
  execution_time_ms: number;
}

// ============================================
// DNS-over-HTTPS Resolution (Cloudflare + Google fallback)
// ============================================

interface DoHAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DoHResponse {
  Status: number;
  TC: boolean;
  RD: boolean;
  RA: boolean;
  AD: boolean;
  CD: boolean;
  Question: Array<{ name: string; type: number }>;
  Answer?: DoHAnswer[];
}

async function resolveDNS(hostname: string, timeout = 5000): Promise<string[]> {
  const providers = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
  ];

  for (const url of providers) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        headers: { 'Accept': 'application/dns-json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const data: DoHResponse = await response.json();
      const ips: string[] = [];

      if (data.Answer) {
        for (const answer of data.Answer) {
          if (answer.type === 1 || answer.type === 28) {
            ips.push(answer.data);
          }
        }
      }

      return ips;
    } catch {
      continue;
    }
  }

  return [];
}

async function resolveSubdomains(
  subdomains: Map<string, { sources: string[] }>,
  maxConcurrent = 20,
  timeout = 3000
): Promise<SubdomainEntry[]> {
  const entries = Array.from(subdomains.entries());
  const results: SubdomainEntry[] = [];

  for (let i = 0; i < entries.length; i += maxConcurrent) {
    const batch = entries.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async ([subdomain, data]) => {
        const ips = await resolveDNS(subdomain, timeout);
        return {
          subdomain,
          sources: data.sources,
          ips,
          is_alive: ips.length > 0,
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ============================================
// Validation Helper
// ============================================

function isValidSubdomain(subdomain: string, domain: string): boolean {
  if (!subdomain || !domain) return false;
  
  const cleanSub = subdomain.toLowerCase().trim();
  const cleanDomain = domain.toLowerCase().trim();
  
  if (!cleanSub.endsWith(cleanDomain)) return false;
  if (cleanSub === cleanDomain) return false;
  if (!/^[a-z0-9.-]+$/.test(cleanSub)) return false;
  if (cleanSub.includes('..') || cleanSub.startsWith('.') || cleanSub.endsWith('.')) return false;
  
  return true;
}

// ============================================
// Response Parsers (Data-driven from blueprint)
// ============================================

type ResponseParser = (data: unknown, domain: string) => Set<string>;

const responseParsers: Record<string, ResponseParser> = {
  securitytrails: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as { subdomains?: string[] };
    for (const sub of typedData.subdomains || []) {
      const fullSubdomain = `${sub}.${domain}`.toLowerCase();
      if (isValidSubdomain(fullSubdomain, domain)) {
        subdomains.add(fullSubdomain);
      }
    }
    return subdomains;
  },

  virustotal: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as { data?: Array<{ id?: string }> };
    for (const item of typedData.data || []) {
      const subdomain = item.id?.toLowerCase();
      if (subdomain && isValidSubdomain(subdomain, domain)) {
        subdomains.add(subdomain);
      }
    }
    return subdomains;
  },

  crtsh: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as Array<{ name_value?: string }>;
    for (const cert of typedData) {
      const nameValue = cert.name_value || '';
      for (const name of nameValue.split('\n')) {
        const cleaned = name.trim().toLowerCase().replace(/^\*\./, '');
        if (isValidSubdomain(cleaned, domain)) {
          subdomains.add(cleaned);
        }
      }
    }
    return subdomains;
  },

  hackertarget: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const text = data as string;
    for (const line of text.trim().split('\n')) {
      if (line.includes(',')) {
        const subdomain = line.split(',')[0].trim().toLowerCase();
        if (isValidSubdomain(subdomain, domain)) {
          subdomains.add(subdomain);
        }
      }
    }
    return subdomains;
  },

  alienvault: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as { passive_dns?: Array<{ hostname?: string }> };
    for (const record of typedData.passive_dns || []) {
      const hostname = (record.hostname || '').trim().toLowerCase();
      if (isValidSubdomain(hostname, domain)) {
        subdomains.add(hostname);
      }
    }
    return subdomains;
  },

  rapiddns: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const text = data as string;
    const pattern = new RegExp(`<td>([a-zA-Z0-9.-]+\\.${domain.replace(/\./g, '\\.')})</td>`, 'gi');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim().toLowerCase();
      if (isValidSubdomain(name, domain)) {
        subdomains.add(name);
      }
    }
    return subdomains;
  },

  threatminer: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as { status_code?: string; results?: string[] };
    if (typedData.status_code === '200') {
      for (const subdomain of typedData.results || []) {
        const name = subdomain.trim().toLowerCase();
        if (isValidSubdomain(name, domain)) {
          subdomains.add(name);
        }
      }
    }
    return subdomains;
  },

  urlscan: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as { results?: Array<{ task?: { domain?: string } }> };
    for (const result of typedData.results || []) {
      const pageDomain = (result.task?.domain || '').trim().toLowerCase();
      if (isValidSubdomain(pageDomain, domain)) {
        subdomains.add(pageDomain);
      }
    }
    return subdomains;
  },

  wayback: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as string[][];
    for (let i = 1; i < typedData.length; i++) {
      const row = typedData[i];
      if (!row) continue;
      const urlStr = Array.isArray(row) ? row[0] : row;
      const match = /https?:\/\/([^/]+)/.exec(urlStr);
      if (match) {
        const hostname = match[1].split(':')[0].toLowerCase();
        if (isValidSubdomain(hostname, domain)) {
          subdomains.add(hostname);
        }
      }
    }
    return subdomains;
  },

  certspotter: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as Array<{ dns_names?: string[] }>;
    for (const cert of typedData) {
      for (const name of cert.dns_names || []) {
        const cleaned = name.trim().toLowerCase().replace(/^\*\./, '');
        if (isValidSubdomain(cleaned, domain)) {
          subdomains.add(cleaned);
        }
      }
    }
    return subdomains;
  },

  jldc: (data: unknown, domain: string) => {
    const subdomains = new Set<string>();
    const typedData = data as string[];
    for (const subdomain of typedData) {
      const name = subdomain.trim().toLowerCase();
      if (isValidSubdomain(name, domain)) {
        subdomains.add(name);
      }
    }
    return subdomains;
  },
};

// ============================================
// Decrypt Helper for DB-stored API keys
// ============================================

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function decryptSecret(encryptedData: string): Promise<string> {
  const encryptionKeyHex = Deno.env.get("M365_ENCRYPTION_KEY");
  if (!encryptionKeyHex) {
    return encryptedData;
  }

  const [ivHex, ciphertextHex] = encryptedData.split(":");
  if (!ivHex || !ciphertextHex) {
    return encryptedData;
  }

  const iv = fromHex(ivHex);
  const ciphertext = fromHex(ciphertextHex);
  const keyBytes = fromHex(encryptionKeyHex);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

async function resolveApiKey(envVarName: string): Promise<string | undefined> {
  // Try system_settings (DB) first
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const settingsKey = `api_key_${envVarName}`;
    const { data: setting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', settingsKey)
      .maybeSingle();

    if (setting?.value) {
      const val = typeof setting.value === 'string' 
        ? setting.value.replace(/^"|"$/g, '') 
        : JSON.stringify(setting.value).replace(/^"|"$/g, '');
      const decrypted = await decryptSecret(val);
      if (decrypted) return decrypted;
    }
  } catch (e) {
    console.log(`[resolveApiKey] DB lookup failed for ${envVarName}:`, e);
  }

  // Fallback to env var
  return Deno.env.get(envVarName);
}

// ============================================
// Dynamic API Executor (Blueprint-driven)
// ============================================

async function executeApiStep(
  step: BlueprintStep,
  domain: string,
  timeout: number
): Promise<{ name: string; subdomains: Set<string>; error?: string }> {
  const { config } = step;
  const subdomains = new Set<string>();

  // Check if API key is required
  if (config.requires_api_key && config.api_key_env) {
    const apiKey = await resolveApiKey(config.api_key_env);
    if (!apiKey) {
      console.log(`[${config.name}] API key not configured (${config.api_key_env}), skipping`);
      return { name: config.name, subdomains, error: 'API key not configured' };
    }
  }

  // Build URL from template
  const url = config.url_template.replace(/{domain}/g, encodeURIComponent(domain));

  // Build headers (replace API key placeholders - resolve from DB or env)
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.headers || {})) {
    if (value.startsWith('{{') && value.endsWith('}}')) {
      const envVar = value.slice(2, -2);
      const envValue = await resolveApiKey(envVar);
      if (envValue) {
        headers[key] = envValue;
      }
    } else {
      headers[key] = value;
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: config.method || 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[${config.name}] API returned ${response.status}`);
      return { name: config.name, subdomains, error: `HTTP ${response.status}` };
    }

    // Parse response based on content type
    const contentType = response.headers.get('content-type') || '';
    let data: unknown;

    if (config.response_parser === 'hackertarget' || config.response_parser === 'rapiddns') {
      data = await response.text();
    } else if (config.response_parser === 'wayback') {
      const text = await response.text();
      if (!text.trim()) {
        return { name: config.name, subdomains };
      }
      data = JSON.parse(text);
    } else {
      data = await response.json();
    }

    // Use the appropriate parser
    const parser = responseParsers[config.response_parser];
    if (parser) {
      const parsed = parser(data, domain);
      for (const sub of parsed) {
        subdomains.add(sub);
      }
    } else {
      console.log(`[${config.name}] Unknown parser: ${config.response_parser}`);
    }

    console.log(`[${config.name}] Found ${subdomains.size} subdomains`);
    return { name: config.name, subdomains };
  } catch (e) {
    console.log(`[${config.name}] Error: ${e}`);
    return { name: config.name, subdomains, error: String(e) };
  }
}

// ============================================
// Blueprint Loader
// ============================================

async function loadBlueprintSteps(): Promise<BlueprintStep[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: blueprint, error } = await supabase
    .from('device_blueprints')
    .select('collection_steps')
    .eq('is_active', true)
    .eq('device_type_id', (
      await supabase
        .from('device_types')
        .select('id')
        .eq('code', 'external_domain')
        .eq('is_active', true)
        .single()
    ).data?.id)
    .single();

  if (error || !blueprint) {
    console.log('[subdomain-enum] Failed to load blueprint:', error);
    return [];
  }

  const steps = (blueprint.collection_steps as { steps?: BlueprintStep[] })?.steps || [];
  
  // Filter only edge_function steps with subdomain_api runtime
  return steps.filter(
    (step: BlueprintStep) => step.executor === 'edge_function' && step.runtime === 'subdomain_api'
  );
}

// ============================================
// Main Enumeration Function (Blueprint-driven)
// ============================================

async function enumerateSubdomains(
  domain: string, 
  apiTimeout = 15000,
  blueprintSteps?: BlueprintStep[]
): Promise<SubdomainEnumResponse> {
  const startTime = Date.now();
  const allSubdomains = new Map<string, { sources: string[] }>();
  const sourcesUsed: string[] = [];
  const errors: string[] = [];

  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
  console.log(`[subdomain-enum] Starting enumeration for ${cleanDomain}`);

  // Load steps from blueprint if not provided
  const steps = blueprintSteps || await loadBlueprintSteps();
  
  if (steps.length === 0) {
    console.log('[subdomain-enum] No subdomain API steps found in blueprint');
    errors.push('No subdomain enumeration steps configured in blueprint');
  }

  // Separate steps by phase
  const phase1Steps = steps.filter(s => s.phase === 1).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  const phase2Steps = steps.filter(s => s.phase === 2 || !s.phase);

  console.log(`[subdomain-enum] Phase 1: ${phase1Steps.length} premium APIs, Phase 2: ${phase2Steps.length} free APIs`);

  // ======================================
  // PHASE 1: Premium APIs (Sequential)
  // ======================================
  for (const step of phase1Steps) {
    try {
      const result = await executeApiStep(step, cleanDomain, apiTimeout);
      
      if (result.error && !result.error.includes('API key not configured')) {
        errors.push(`${result.name}: ${result.error}`);
      }

      if (result.subdomains.size > 0) {
        sourcesUsed.push(`${result.name} (${result.subdomains.size})`);
        for (const sub of result.subdomains) {
          if (allSubdomains.has(sub)) {
            const existing = allSubdomains.get(sub)!;
            if (!existing.sources.includes(result.name)) {
              existing.sources.push(result.name);
            }
          } else {
            allSubdomains.set(sub, { sources: [result.name] });
          }
        }
      }
    } catch (e) {
      errors.push(`${step.config.name}: ${e}`);
    }
  }

  // ======================================
  // PHASE 2: Free APIs (Parallel)
  // ======================================
  const phase2Results = await Promise.allSettled(
    phase2Steps.map(step => executeApiStep(step, cleanDomain, apiTimeout))
  );

  for (const result of phase2Results) {
    if (result.status === 'fulfilled') {
      const { name, subdomains, error } = result.value;
      
      if (error) {
        errors.push(`${name}: ${error}`);
      }

      if (subdomains.size > 0) {
        sourcesUsed.push(`${name} (${subdomains.size})`);
        
        for (const sub of subdomains) {
          if (allSubdomains.has(sub)) {
            const existing = allSubdomains.get(sub)!;
            if (!existing.sources.includes(name)) {
              existing.sources.push(name);
            }
          } else {
            allSubdomains.set(sub, { sources: [name] });
          }
        }
      }
    } else {
      errors.push(`API query failed: ${result.reason}`);
    }
  }

  console.log(`[subdomain-enum] Found ${allSubdomains.size} unique subdomains from ${sourcesUsed.length} sources`);

  // Limit DNS resolution
  const maxResolutions = 200;
  let subdomainsToResolve = allSubdomains;
  
  if (allSubdomains.size > maxResolutions) {
    console.log(`[subdomain-enum] Limiting DNS resolution to ${maxResolutions} subdomains`);
    const entries = Array.from(allSubdomains.entries()).slice(0, maxResolutions);
    subdomainsToResolve = new Map(entries);
  }

  // Resolve subdomains via DNS-over-HTTPS
  console.log(`[subdomain-enum] Resolving ${subdomainsToResolve.size} subdomains via DoH...`);
  const resolvedSubdomains = await resolveSubdomains(subdomainsToResolve, 25, 3000);

  // Add remaining unresolved subdomains
  if (allSubdomains.size > maxResolutions) {
    const resolvedSet = new Set(resolvedSubdomains.map(s => s.subdomain));
    for (const [sub, data] of allSubdomains.entries()) {
      if (!resolvedSet.has(sub)) {
        resolvedSubdomains.push({
          subdomain: sub,
          sources: data.sources,
          ips: [],
          is_alive: false,
        });
      }
    }
  }

  resolvedSubdomains.sort((a, b) => a.subdomain.localeCompare(b.subdomain));

  const aliveCount = resolvedSubdomains.filter(s => s.is_alive).length;
  const inactiveCount = resolvedSubdomains.length - aliveCount;
  const executionTime = Date.now() - startTime;

  console.log(`[subdomain-enum] Completed in ${executionTime}ms: ${aliveCount} alive, ${inactiveCount} inactive`);

  return {
    success: true,
    domain: cleanDomain,
    total_found: resolvedSubdomains.length,
    alive_count: aliveCount,
    inactive_count: inactiveCount,
    sources: sourcesUsed,
    subdomains: resolvedSubdomains,
    errors: errors.length > 0 ? errors : undefined,
    execution_time_ms: executionTime,
  };
}

// ============================================
// HTTP Handler
// ============================================

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body: SubdomainEnumRequest = await req.json();
    
    if (!body.domain) {
      return new Response(
        JSON.stringify({ error: 'Missing domain parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const timeout = (body.timeout || 15) * 1000;
    
    console.log(`[subdomain-enum] Request for domain: ${body.domain}`);
    
    // Accept optional blueprint_steps for direct invocation
    const result = await enumerateSubdomains(body.domain, timeout, body.blueprint_steps);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[subdomain-enum] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        domain: '',
        total_found: 0,
        alive_count: 0,
        inactive_count: 0,
        sources: [],
        subdomains: [],
        execution_time_ms: 0,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
