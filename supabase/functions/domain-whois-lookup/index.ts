import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

interface WhoisResult {
  registrar: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const UA = 'iScope/1.0 (https://iscope.com.br; contato@iscope.com.br)';

function extractFromRdap(data: any): WhoisResult {
  const result: WhoisResult = {
    registrar: null,
    expiresAt: null,
    createdAt: null,
    updatedAt: null,
  };

  const events = data.events || [];
  for (const event of events) {
    const action = event.eventAction;
    const date = event.eventDate;
    if (!date) continue;
    if (action === 'expiration') result.expiresAt = date;
    else if (action === 'registration') result.createdAt = date;
    else if (action === 'last changed') result.updatedAt = date;
  }

  const entities = data.entities || [];
  for (const entity of entities) {
    const roles = entity.roles || [];
    if (roles.includes('registrar')) {
      result.registrar = entity.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3]
        || entity.handle
        || entity.publicIds?.[0]?.identifier
        || null;
      break;
    }
  }

  return result;
}

function extractFromWhoisFreaks(data: any): WhoisResult {
  const result: WhoisResult = {
    registrar: null,
    expiresAt: null,
    createdAt: null,
    updatedAt: null,
  };

  if (data.status === 'error' || !data.domain_name) return result;

  result.registrar = data.registrar?.registrar_name || data.registrar?.name || null;
  result.expiresAt = data.expiry_date?.date_time || data.registry_expiry_date || null;
  result.createdAt = data.create_date?.date_time || data.creation_date || null;
  result.updatedAt = data.update_date?.date_time || data.updated_date || null;

  return result;
}

async function tryFetch(url: string, label: string, timeoutMs = 12000): Promise<Response | null> {
  try {
    console.log(`[domain-whois-lookup] Trying ${label}: ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/rdap+json, application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      console.log(`[domain-whois-lookup] ${label} succeeded (${res.status})`);
      return res;
    }
    const errText = await res.text();
    console.warn(`[domain-whois-lookup] ${label} failed (${res.status}): ${errText.slice(0, 200)}`);
    return null;
  } catch (err) {
    console.warn(`[domain-whois-lookup] ${label} error: ${err}`);
    return null;
  }
}

async function lookupWhois(domain: string): Promise<WhoisResult> {
  const isBr = domain.endsWith('.br');
  const encoded = encodeURIComponent(domain);

  // Attempt 1: primary RDAP
  const primaryUrl = isBr
    ? `https://rdap.registro.br/domain/${encoded}`
    : `https://rdap.org/domain/${encoded}`;

  let res = await tryFetch(primaryUrl, 'primary-rdap');
  if (res) {
    const data = await res.json();
    const result = extractFromRdap(data);
    if (result.expiresAt || result.registrar) return result;
  }

  // Attempt 2: rdap.org fallback (for .br — rdap.org does IANA bootstrap)
  if (isBr) {
    res = await tryFetch(`https://rdap.org/domain/${encoded}`, 'rdap-org-fallback');
    if (res) {
      const data = await res.json();
      const result = extractFromRdap(data);
      if (result.expiresAt || result.registrar) return result;
    }
  }

  // Attempt 3: WhoisFreaks free API
  res = await tryFetch(
    `https://api.whoisfreaks.com/v1.0/whois?apiKey=free&domainName=${encoded}&whois=live`,
    'whoisfreaks'
  );
  if (res) {
    const data = await res.json();
    const result = extractFromWhoisFreaks(data);
    if (result.expiresAt || result.registrar) return result;
  }

  console.error(`[domain-whois-lookup] All attempts failed for ${domain}`);
  return { registrar: null, expiresAt: null, createdAt: null, updatedAt: null };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { domain, domain_id } = await req.json();

    if (!domain) {
      return new Response(JSON.stringify({ error: 'domain is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;

    if (!isServiceRole) {
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await supabaseUser.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`[domain-whois-lookup] Looking up WHOIS for: ${domain}`);

    const whois = await lookupWhois(domain);

    console.log(`[domain-whois-lookup] Result for ${domain}: registrar=${whois.registrar}, expires=${whois.expiresAt}`);

    // If domain_id provided, update the record
    if (domain_id) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { error: updateError } = await supabase
        .from('external_domains')
        .update({
          whois_registrar: whois.registrar,
          whois_expires_at: whois.expiresAt,
          whois_created_at: whois.createdAt,
          whois_checked_at: new Date().toISOString(),
        })
        .eq('id', domain_id);

      if (updateError) {
        console.error(`[domain-whois-lookup] Failed to update domain ${domain_id}:`, updateError);
      } else {
        console.log(`[domain-whois-lookup] Updated domain ${domain_id} with WHOIS data`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      domain,
      ...whois,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[domain-whois-lookup] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
