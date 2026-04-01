import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// Known API keys that can be managed
const MANAGED_KEYS = [
  {
    name: "VIRUSTOTAL_API_KEY",
    label: "VirusTotal",
    description: "Usada para enumeração de subdomínios via VirusTotal API",
  },
  {
    name: "SECURITYTRAILS_API_KEY",
    label: "SecurityTrails",
    description: "Usada para enumeração de subdomínios via SecurityTrails API",
  },
  {
    name: "SHODAN_API_KEY",
    label: "Shodan",
    description: "Usada para enriquecimento de IPs no Attack Surface Analyzer (portas, serviços, CVEs)",
  },
  {
    name: "CENSYS_API_KEY",
    label: "Censys",
    description: "Usada para enriquecimento de IPs via Censys Search API (hosts, serviços, certificados TLS)",
  },
  {
    name: "HIBP_API_KEY",
    label: "Have I Been Pwned",
    description: "API Key do HIBP para consulta de credenciais vazadas por domínio (haveibeenpwned.com/API/Key)",
  },
  {
    name: "STADIA_MAPS_API_KEY",
    label: "Stadia Maps",
    description: "API Key do Stadia Maps para exibição do mapa de ataques (tiles do mapa escuro). Obtenha em client.stadiamaps.com",
  },
];

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function encryptSecret(plaintext: string): Promise<string> {
  const encryptionKeyHex = Deno.env.get("M365_ENCRYPTION_KEY");
  if (!encryptionKeyHex) {
    throw new Error("M365_ENCRYPTION_KEY not configured");
  }

  const keyBytes = fromHex(encryptionKeyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded
  );

  return `${toHex(iv)}:${toHex(new Uint8Array(ciphertext))}`;
}

async function decryptSecret(encryptedData: string): Promise<string> {
  const encryptionKeyHex = Deno.env.get("M365_ENCRYPTION_KEY");
  if (!encryptionKeyHex) {
    throw new Error("M365_ENCRYPTION_KEY not configured");
  }

  const [ivHex, ciphertextHex] = encryptedData.split(":");
  if (!ivHex || !ciphertextHex) {
    return encryptedData; // Not encrypted, return as-is
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["super_admin", "super_suporte"])
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem executar esta ação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "GET") {
      // Return status of each managed key (configured or not)
      const keys = [];

      for (const keyDef of MANAGED_KEYS) {
        const settingsKey = `api_key_${keyDef.name}`;

        // Check system_settings first
        const { data: setting } = await supabase
          .from("system_settings")
          .select("value, updated_at")
          .eq("key", settingsKey)
          .maybeSingle();

        let configured = false;
        let source = "not_configured";
        let updatedAt: string | null = null;
        let maskedValue = "";

        if (setting?.value) {
          configured = true;
          source = "database";
          updatedAt = setting.updated_at;
          // Decrypt to get masked value
          try {
            const val = typeof setting.value === "string" 
              ? setting.value 
              : JSON.stringify(setting.value);
            // Remove surrounding quotes if present
            const cleanVal = val.replace(/^"|"$/g, "");
            const decrypted = await decryptSecret(cleanVal);
            maskedValue = decrypted.substring(0, 4) + "••••••••" + decrypted.substring(decrypted.length - 4);
          } catch {
            maskedValue = "••••••••";
          }
        } else {
          // Fallback: check env var
          const envValue = Deno.env.get(keyDef.name);
          if (envValue) {
            configured = true;
            source = "environment";
            maskedValue = envValue.substring(0, 4) + "••••••••" + envValue.substring(envValue.length - 4);
          }
        }

        keys.push({
          name: keyDef.name,
          label: keyDef.label,
          description: keyDef.description,
          configured,
          source,
          maskedValue,
          updatedAt,
        });
      }

      return new Response(
        JSON.stringify({ success: true, keys }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const { key_name, value } = await req.json();

      if (!key_name || !value) {
        return new Response(
          JSON.stringify({ error: "key_name e value são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate key name
      const keyDef = MANAGED_KEYS.find((k) => k.name === key_name);
      if (!keyDef) {
        return new Response(
          JSON.stringify({ error: "Chave de API não reconhecida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Encrypt value
      const encrypted = await encryptSecret(value);
      const settingsKey = `api_key_${key_name}`;

      // Upsert in system_settings
      const { data: existing } = await supabase
        .from("system_settings")
        .select("id")
        .eq("key", settingsKey)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("system_settings")
          .update({
            value: encrypted,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("key", settingsKey);
      } else {
        await supabase.from("system_settings").insert({
          key: settingsKey,
          value: encrypted,
          description: `API Key: ${keyDef.label}`,
          updated_by: user.id,
        });
      }

      // Audit log
      await supabase.from("admin_activity_logs").insert({
        admin_id: user.id,
        action: "api_key_updated",
        action_type: "config",
        target_type: "api_key",
        target_id: key_name,
        details: { key_name, label: keyDef.label },
      });

      return new Response(
        JSON.stringify({ success: true, message: `Chave ${keyDef.label} salva com sucesso` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "DELETE") {
      const { key_name } = await req.json();

      if (!key_name) {
        return new Response(
          JSON.stringify({ error: "key_name é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const keyDef = MANAGED_KEYS.find((k) => k.name === key_name);
      if (!keyDef) {
        return new Response(
          JSON.stringify({ error: "Chave de API não reconhecida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const settingsKey = `api_key_${key_name}`;
      await supabase.from("system_settings").delete().eq("key", settingsKey);

      await supabase.from("admin_activity_logs").insert({
        admin_id: user.id,
        action: "api_key_deleted",
        action_type: "config",
        target_type: "api_key",
        target_id: key_name,
        details: { key_name, label: keyDef.label },
      });

      return new Response(
        JSON.stringify({ success: true, message: `Chave ${keyDef.label} removida` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[manage-api-keys] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
