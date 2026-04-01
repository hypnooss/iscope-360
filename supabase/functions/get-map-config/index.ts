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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to fetch the secret
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the Stadia Maps API key from system_settings
    const { data: setting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "api_key_STADIA_MAPS_API_KEY")
      .maybeSingle();

    let stadiaApiKey: string | null = null;

    if (setting?.value) {
      try {
        const val = typeof setting.value === "string"
          ? setting.value
          : JSON.stringify(setting.value);
        const cleanVal = val.replace(/^"|"$/g, "");
        stadiaApiKey = await decryptSecret(cleanVal);
      } catch (e) {
        console.error("[get-map-config] Decrypt error:", e);
      }
    }

    return new Response(
      JSON.stringify({ stadia_api_key: stadiaApiKey }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[get-map-config] Error:", error);
    return new Response(
      JSON.stringify({ stadia_api_key: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
