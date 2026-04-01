import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function decryptSecret(encryptedData: string): Promise<string> {
  const encryptionKeyHex = Deno.env.get("M365_ENCRYPTION_KEY");
  if (!encryptionKeyHex) throw new Error("M365_ENCRYPTION_KEY not configured");

  const [ivHex, ciphertextHex] = encryptedData.split(":");
  if (!ivHex || !ciphertextHex) return encryptedData;

  const iv = fromHex(ivHex);
  const ciphertext = fromHex(ciphertextHex);
  const keyBytes = fromHex(encryptionKeyHex);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv }, cryptoKey, ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

async function getApiKey(supabase: any): Promise<string | null> {
  const { data: settings } = await supabase
    .from("system_settings")
    .select("key, value")
    .eq("key", "api_key_HIBP_API_KEY");

  if (settings && settings.length > 0) {
    const s = settings[0];
    const cleanVal = typeof s.value === "string"
      ? s.value.replace(/^"|"$/g, "")
      : JSON.stringify(s.value).replace(/^"|"$/g, "");
    try {
      return await decryptSecret(cleanVal);
    } catch {
      return cleanVal;
    }
  }

  return Deno.env.get("HIBP_API_KEY") || null;
}

// ── Breach metadata & classification ──

interface BreachMeta {
  Name: string;
  DataClasses: string[];
  IsMalware: boolean;
  IsSpamList: boolean;
  IsFabricated: boolean;
}

type BreachType = "credential_leak" | "stealer_logs" | "scraping" | "combo_list";

function classifyBreach(meta: BreachMeta): BreachType {
  if (meta.IsSpamList || meta.IsFabricated) return "combo_list";
  const hasPasswords = meta.DataClasses?.some(
    (dc) => dc === "Passwords" || dc === "Password hints"
  );
  if (hasPasswords && meta.IsMalware) return "stealer_logs";
  if (hasPasswords) return "credential_leak";
  return "scraping";
}

async function fetchBreachesMetadata(): Promise<Map<string, BreachMeta>> {
  const map = new Map<string, BreachMeta>();
  try {
    const res = await fetch("https://haveibeenpwned.com/api/v3/breaches", {
      headers: { "User-Agent": "iScope-SecurityPlatform" },
    });
    if (res.ok) {
      const breaches: BreachMeta[] = await res.json();
      for (const b of breaches) map.set(b.Name, b);
    } else {
      console.warn(`[dehashed-search] Failed to fetch breaches metadata: ${res.status}`);
    }
  } catch (e) {
    console.warn("[dehashed-search] Error fetching breaches metadata:", e);
  }
  return map;
}

// ── Main handler ──

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["super_admin", "super_suporte"])
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem executar esta ação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { domain, client_id, force_refresh } = await req.json();

    if (!domain || !client_id) {
      return new Response(JSON.stringify({ error: "domain e client_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check cache first (unless force_refresh)
    if (!force_refresh) {
      const { data: cached } = await supabase
        .from("dehashed_cache")
        .select("*")
        .eq("client_id", client_id)
        .eq("domain", domain)
        .order("queried_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.queried_at).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (cacheAge < sevenDays) {
          return new Response(JSON.stringify({
            success: true,
            source: "cache",
            data: cached,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    const apiKey = await getApiKey(supabase);
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: "API key do HIBP não configurada",
        code: "NO_API_KEY",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Call HIBP API v3 - breached domain
    const searchUrl = `https://haveibeenpwned.com/api/v3/breacheddomain/${encodeURIComponent(domain)}`;
    console.log(`[dehashed-search] Querying HIBP for domain: ${domain}`);

    const response = await fetch(searchUrl, {
      method: "GET",
      headers: {
        "hibp-api-key": apiKey,
        "User-Agent": "iScope-SecurityPlatform",
      },
    });

    if (response.status === 404) {
      console.log(`[dehashed-search] No breaches found for ${domain}`);
      await saveToCache(supabase, client_id, domain, 0, [], []);
      await logActivity(supabase, user.id, client_id, domain, 0, 0);

      return new Response(JSON.stringify({
        success: true,
        source: "api",
        data: {
          client_id, domain, total_entries: 0, entries: [], databases: [],
          queried_at: new Date().toISOString(),
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[dehashed-search] HIBP API error ${response.status}: ${errorText}`);
      return new Response(JSON.stringify({
        error: `HIBP API retornou erro ${response.status}`,
        details: errorText,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiData: Record<string, string[]> = await response.json();

    // Fetch breach metadata to classify each breach
    const breachMetaMap = await fetchBreachesMetadata();

    const processedEntries: any[] = [];
    const breachSet = new Set<string>();

    for (const [alias, breaches] of Object.entries(apiData)) {
      for (const breach of breaches) {
        breachSet.add(breach);
        const meta = breachMetaMap.get(breach);
        const breachType = meta ? classifyBreach(meta) : "credential_leak";

        processedEntries.push({
          email: `${alias}@${domain}`,
          username: alias,
          password: "",
          password_raw: "",
          hashed_password: "",
          hashed_password_raw: "",
          database_name: breach,
          breach_type: breachType,
          ip_address: "",
          name: "",
          phone: "",
        });
      }
    }

    const uniqueDatabases = Array.from(breachSet);
    const totalEntries = processedEntries.length;

    await saveToCache(supabase, client_id, domain, totalEntries, processedEntries, uniqueDatabases);
    await logActivity(supabase, user.id, client_id, domain, totalEntries, uniqueDatabases.length);

    console.log(`[dehashed-search] HIBP found ${totalEntries} entries across ${uniqueDatabases.length} breaches for ${domain}`);

    return new Response(JSON.stringify({
      success: true,
      source: "api",
      data: {
        client_id, domain, total_entries: totalEntries,
        entries: processedEntries, databases: uniqueDatabases,
        queried_at: new Date().toISOString(),
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[dehashed-search] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function saveToCache(
  supabase: any, client_id: string, domain: string,
  totalEntries: number, entries: any[], databases: string[]
) {
  const { error: cacheError } = await supabase
    .from("dehashed_cache")
    .upsert({
      client_id, domain, total_entries: totalEntries,
      entries, databases, queried_at: new Date().toISOString(),
    }, { onConflict: "client_id,domain", ignoreDuplicates: false });

  if (cacheError) {
    console.log("[dehashed-search] Upsert failed, doing insert:", cacheError.message);
    await supabase.from("dehashed_cache").delete().eq("client_id", client_id).eq("domain", domain);
    await supabase.from("dehashed_cache").insert({
      client_id, domain, total_entries: totalEntries,
      entries, databases, queried_at: new Date().toISOString(),
    });
  }
}

async function logActivity(
  supabase: any, userId: string, clientId: string,
  domain: string, totalEntries: number, databasesCount: number
) {
  await supabase.from("admin_activity_logs").insert({
    admin_id: userId, action: "hibp_search", action_type: "scan",
    target_type: "domain", target_id: clientId, target_name: domain,
    details: { domain, total_entries: totalEntries, databases_count: databasesCount, source: "hibp" },
  });
}
