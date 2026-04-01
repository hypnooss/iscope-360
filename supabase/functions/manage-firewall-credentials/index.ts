import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// ============================================
// Crypto helpers (AES-256-GCM, same as M365)
// ============================================

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex) throw new Error('M365_ENCRYPTION_KEY not configured');
  const keyData = hexToBytes(keyHex);
  return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return bytesToHex(iv) + ':' + bytesToHex(new Uint8Array(ciphertext));
}

async function decrypt(encrypted: string, key: CryptoKey): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(':');
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{24}:[0-9a-f]+$/i.test(value);
}

// ============================================
// Main Handler
// ============================================

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate user with anon client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(
      authHeader.replace('Bearer ', '')
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Service role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { operation, firewall_id } = body;

    if (!operation) {
      return new Response(JSON.stringify({ error: 'Missing operation' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encryptionKey = await getEncryptionKey();

    // ==========================================
    // SAVE: Encrypt and store credentials
    // ==========================================
    if (operation === 'save') {
      if (!firewall_id) {
        return new Response(JSON.stringify({ error: 'Missing firewall_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { api_key, auth_username, auth_password } = body;

      const updateData: Record<string, string | null> = {};

      if (api_key !== undefined) {
        updateData.api_key = api_key?.trim()
          ? await encrypt(api_key.trim(), encryptionKey)
          : '';
      }
      if (auth_username !== undefined) {
        updateData.auth_username = auth_username?.trim()
          ? await encrypt(auth_username.trim(), encryptionKey)
          : null;
      }
      if (auth_password !== undefined) {
        updateData.auth_password = auth_password?.trim()
          ? await encrypt(auth_password.trim(), encryptionKey)
          : null;
      }

      const { error } = await supabase
        .from('firewalls')
        .update(updateData)
        .eq('id', firewall_id);

      if (error) {
        console.error('Error saving credentials:', error);
        return new Response(JSON.stringify({ error: 'Failed to save credentials' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Credentials encrypted and saved for firewall ${firewall_id} by user ${userId}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // READ: Decrypt and return credentials
    // ==========================================
    if (operation === 'read') {
      if (!firewall_id) {
        return new Response(JSON.stringify({ error: 'Missing firewall_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: fw, error } = await supabase
        .from('firewalls')
        .select('api_key, auth_username, auth_password')
        .eq('id', firewall_id)
        .single();

      if (error || !fw) {
        return new Response(JSON.stringify({ error: 'Firewall not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result: Record<string, string> = {
        api_key: '',
        auth_username: '',
        auth_password: '',
      };

      try {
        if (fw.api_key && isEncrypted(fw.api_key)) {
          result.api_key = await decrypt(fw.api_key, encryptionKey);
        } else {
          result.api_key = fw.api_key || '';
        }

        if (fw.auth_username && isEncrypted(fw.auth_username)) {
          result.auth_username = await decrypt(fw.auth_username, encryptionKey);
        } else {
          result.auth_username = fw.auth_username || '';
        }

        if (fw.auth_password && isEncrypted(fw.auth_password)) {
          result.auth_password = await decrypt(fw.auth_password, encryptionKey);
        } else {
          result.auth_password = fw.auth_password || '';
        }
      } catch (decryptError) {
        console.error('Decryption error:', decryptError);
        // Return raw values if decryption fails (backward compat)
        result.api_key = fw.api_key || '';
        result.auth_username = fw.auth_username || '';
        result.auth_password = fw.auth_password || '';
      }

      return new Response(JSON.stringify({ success: true, credentials: result }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // MIGRATE-ALL: Encrypt all existing plaintext credentials
    // ==========================================
    if (operation === 'migrate-all') {
      // Only super admins can migrate
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'super_admin')
        .single();

      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Forbidden: super_admin required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: firewalls, error: fetchError } = await supabase
        .from('firewalls')
        .select('id, api_key, auth_username, auth_password');

      if (fetchError) {
        return new Response(JSON.stringify({ error: 'Failed to fetch firewalls' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let migrated = 0;
      for (const fw of firewalls || []) {
        const updates: Record<string, string | null> = {};
        let needsUpdate = false;

        if (fw.api_key && !isEncrypted(fw.api_key)) {
          updates.api_key = await encrypt(fw.api_key, encryptionKey);
          needsUpdate = true;
        }
        if (fw.auth_username && !isEncrypted(fw.auth_username)) {
          updates.auth_username = await encrypt(fw.auth_username, encryptionKey);
          needsUpdate = true;
        }
        if (fw.auth_password && !isEncrypted(fw.auth_password)) {
          updates.auth_password = await encrypt(fw.auth_password, encryptionKey);
          needsUpdate = true;
        }

        if (needsUpdate) {
          await supabase.from('firewalls').update(updates).eq('id', fw.id);
          migrated++;
        }
      }

      console.log(`Migration complete: ${migrated} firewalls encrypted by user ${userId}`);
      return new Response(JSON.stringify({ success: true, migrated }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown operation' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
