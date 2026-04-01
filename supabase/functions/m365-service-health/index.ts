import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { getCorsHeaders } from '../_shared/cors.ts';

// ====== Helpers ======

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
    console.error('[m365-service-health] Hex decryption failed:', e);
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

async function requestGraphToken(tenantId: string, appId: string, clientSecret: string): Promise<string | null> {
  try {
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${appId}&client_secret=${encodeURIComponent(clientSecret)}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials`,
    });
    if (!res.ok) {
      console.error(`[m365-service-health] Token failed for tenant ${tenantId}: ${await res.text()}`);
      return null;
    }
    const { access_token } = await res.json();
    return access_token || null;
  } catch (err) {
    console.error(`[m365-service-health] Token error:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { tenant_record_id } = await req.json();
    if (!tenant_record_id) {
      return new Response(JSON.stringify({ success: false, error: 'tenant_record_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[m365-service-health] Fetching for tenant: ${tenant_record_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Load tenant
    const { data: tenant } = await supabase
      .from('m365_tenants')
      .select('*')
      .eq('id', tenant_record_id)
      .single();

    if (!tenant) {
      return new Response(JSON.stringify({ success: false, error: 'Tenant not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Try per-tenant credentials first
    let access_token: string | null = null;

    const { data: cred } = await supabase
      .from('m365_app_credentials')
      .select('*')
      .eq('tenant_record_id', tenant_record_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (cred?.client_secret_encrypted) {
      console.log(`[m365-service-health] Trying per-tenant credentials (app: ${cred.azure_app_id})`);
      const secret = await decryptSecret(cred.client_secret_encrypted);
      if (secret) {
        access_token = await requestGraphToken(tenant.tenant_id, cred.azure_app_id, secret);
      } else {
        console.error(`[m365-service-health] Per-tenant secret decryption failed`);
      }
    }

    // 3. Fallback to global config
    if (!access_token) {
      console.log(`[m365-service-health] Falling back to global config`);
      const { data: config } = await supabase
        .from('m365_global_config')
        .select('*')
        .limit(1)
        .single();

      if (!config) {
        return new Response(JSON.stringify({ success: false, error: 'No credentials available' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const secret = await decryptSecret(config.client_secret_encrypted);
      if (secret) {
        access_token = await requestGraphToken(tenant.tenant_id, config.app_id, secret);
      } else {
        console.error(`[m365-service-health] Global secret decryption failed`);
      }
    }

    if (!access_token) {
      return new Response(JSON.stringify({ success: false, error: 'Token acquisition failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Fetch service health data in parallel
    const graphHeaders = {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    };

    const [healthRes, issuesRes] = await Promise.all([
      fetch('https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/healthOverviews', { headers: graphHeaders }),
      fetch('https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$top=100&$orderby=lastModifiedDateTime desc', { headers: graphHeaders }),
    ]);

    let services: any[] = [];
    let issues: any[] = [];

    if (healthRes.ok) {
      const healthData = await healthRes.json();
      services = (healthData.value || []).map((s: any) => ({
        id: s.id,
        service: s.service,
        status: s.status,
      }));
    } else {
      const errText = await healthRes.text();
      console.error(`[m365-service-health] Health overviews failed: ${errText}`);
    }

    if (issuesRes.ok) {
      const issuesData = await issuesRes.json();
      issues = (issuesData.value || []).map((i: any) => ({
        id: i.id,
        title: i.title,
        service: i.service,
        status: i.status,
        classification: i.classification,
        origin: i.origin,
        startDateTime: i.startDateTime,
        endDateTime: i.endDateTime,
        lastModifiedDateTime: i.lastModifiedDateTime,
        isResolved: i.isResolved,
        impactDescription: i.impactDescription,
        featureGroup: i.featureGroup,
        feature: i.feature,
        posts: (i.posts || []).map((p: any) => ({
          createdDateTime: p.createdDateTime,
          content: p.content?.content || '',
          contentType: p.content?.contentType || 'text',
        })),
      }));
    } else {
      const errText = await issuesRes.text();
      console.error(`[m365-service-health] Issues failed: ${errText}`);
    }

    console.log(`[m365-service-health] Loaded ${services.length} services, ${issues.length} issues`);

    return new Response(JSON.stringify({ success: true, services, issues }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error(`[m365-service-health] Error:`, err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
