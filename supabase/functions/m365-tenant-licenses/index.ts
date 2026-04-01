import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { getCorsHeaders } from '../_shared/cors.ts';

// SKU display name mapping for common Microsoft 365 licenses
const skuDisplayNames: Record<string, string> = {
  'ENTERPRISEPACK': 'Office 365 E3',
  'ENTERPRISEPREMIUM': 'Office 365 E5',
  'SPE_E3': 'Microsoft 365 E3',
  'SPE_E5': 'Microsoft 365 E5',
  'SPB': 'Microsoft 365 Business Premium',
  'O365_BUSINESS_PREMIUM': 'Microsoft 365 Business Standard',
  'O365_BUSINESS_ESSENTIALS': 'Microsoft 365 Business Basic',
  'AAD_PREMIUM': 'Azure AD Premium P1',
  'AAD_PREMIUM_P2': 'Azure AD Premium P2',
  'EMSPREMIUM': 'Enterprise Mobility + Security E5',
  'EMS': 'Enterprise Mobility + Security E3',
  'ATP_ENTERPRISE': 'Microsoft Defender for Office 365 P1',
  'THREAT_INTELLIGENCE': 'Microsoft Defender for Office 365 P2',
  'WIN_DEF_ATP': 'Microsoft Defender for Endpoint P2',
  'IDENTITY_THREAT_PROTECTION': 'Microsoft 365 E5 Security',
  'INFORMATION_PROTECTION_COMPLIANCE': 'Microsoft 365 E5 Compliance',
  'EXCHANGESTANDARD': 'Exchange Online (Plan 1)',
  'EXCHANGEENTERPRISE': 'Exchange Online (Plan 2)',
  'POWER_BI_PRO': 'Power BI Pro',
  'POWER_BI_PREMIUM_PER_USER': 'Power BI Premium Per User',
  'PROJECTPREMIUM': 'Project Plan 5',
  'VISIOCLIENT': 'Visio Plan 2',
  'STREAM': 'Microsoft Stream',
  'FLOW_FREE': 'Power Automate Free',
  'POWERAPPS_VIRAL': 'Power Apps Trial',
  'TEAMS_EXPLORATORY': 'Microsoft Teams Exploratory',
  'WINDOWS_STORE': 'Windows Store for Business',
  'RIGHTSMANAGEMENT': 'Azure Information Protection Plan 1',
  'MCOSTANDARD': 'Skype for Business Online (Plan 2)',
  'INTUNE_A': 'Microsoft Intune Plan 1',
  'DYN365_ENTERPRISE_PLAN1': 'Dynamics 365 Plan',
};

function getDisplayName(skuPartNumber: string): string {
  return skuDisplayNames[skuPartNumber] || skuPartNumber.replace(/_/g, ' ');
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

    console.log(`[m365-tenant-licenses] Fetching licenses for tenant: ${tenant_record_id}`);

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

    // 2. Load global config
    const { data: config } = await supabase
      .from('m365_global_config')
      .select('*')
      .limit(1)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ success: false, error: 'Config not found' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Decrypt client secret
    const enc = config.client_secret_encrypted;
    let secret = '';
    if (!enc.includes(':')) {
      secret = atob(enc);
    } else {
      const keyHex = Deno.env.get('M365_ENCRYPTION_KEY') ?? '';
      const [ivH, ctH] = enc.split(':');
      const hex = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map(b => parseInt(b, 16)));
      const key = await crypto.subtle.importKey('raw', hex(keyHex), { name: 'AES-GCM' }, false, ['decrypt']);
      const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hex(ivH) }, key, hex(ctH));
      secret = new TextDecoder().decode(dec);
    }

    // 4. Get access token
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant.tenant_id}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${config.app_id}&client_secret=${encodeURIComponent(secret)}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials`,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[m365-tenant-licenses] Token failed: ${errText}`);
      return new Response(JSON.stringify({ success: false, error: 'Token acquisition failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { access_token } = await tokenRes.json();

    // 5. Fetch subscribed SKUs
    const skuRes = await fetch('https://graph.microsoft.com/v1.0/subscribedSkus', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!skuRes.ok) {
      const errText = await skuRes.text();
      console.error(`[m365-tenant-licenses] subscribedSkus failed: ${errText}`);
      return new Response(JSON.stringify({ success: false, error: `Graph API error: ${skuRes.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const skuData = await skuRes.json();
    const skus = skuData.value || [];
    const collectedAt = new Date().toISOString();

    console.log(`[m365-tenant-licenses] Found ${skus.length} SKUs`);

    // 5b. Fetch directory subscriptions for expiry dates (graceful fallback)
    let expiryMap = new Map<string, string>();
    try {
      const subRes = await fetch('https://graph.microsoft.com/v1.0/directory/subscriptions', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (subRes.ok) {
        const subData = await subRes.json();
        const subs = subData.value || [];
        for (const sub of subs) {
          if (sub.skuId && sub.nextLifecycleDateTime) {
            expiryMap.set(sub.skuId, sub.nextLifecycleDateTime);
          }
        }
        console.log(`[m365-tenant-licenses] Found ${expiryMap.size} subscription expiry dates`);
      } else {
        console.warn(`[m365-tenant-licenses] /directory/subscriptions returned ${subRes.status}, skipping expiry dates`);
      }
    } catch (subErr) {
      console.warn(`[m365-tenant-licenses] Failed to fetch /directory/subscriptions:`, subErr);
    }

    // 6. Delete old licenses for this tenant and insert new ones
    await supabase
      .from('m365_tenant_licenses')
      .delete()
      .eq('tenant_record_id', tenant_record_id);

    const licensesToInsert = skus.map((sku: any) => ({
      tenant_record_id,
      client_id: tenant.client_id,
      sku_id: sku.skuId,
      sku_part_number: sku.skuPartNumber,
      display_name: getDisplayName(sku.skuPartNumber),
      capability_status: sku.capabilityStatus || 'Enabled',
      total_units: sku.prepaidUnits?.enabled || 0,
      consumed_units: sku.consumedUnits || 0,
      warning_units: sku.prepaidUnits?.warning || 0,
      suspended_units: sku.prepaidUnits?.suspended || 0,
      expires_at: expiryMap.get(sku.skuId) || null,
      collected_at: collectedAt,
    }));

    if (licensesToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('m365_tenant_licenses')
        .insert(licensesToInsert);

      if (insertError) {
        console.error(`[m365-tenant-licenses] Insert error:`, insertError);
        return new Response(JSON.stringify({ success: false, error: insertError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`[m365-tenant-licenses] Saved ${licensesToInsert.length} licenses`);

    return new Response(JSON.stringify({
      success: true,
      licenses_count: licensesToInsert.length,
      collected_at: collectedAt,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error(`[m365-tenant-licenses] Error:`, e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
