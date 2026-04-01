import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// Map of permission names to their Microsoft Graph API GUIDs
// These are fixed identifiers from Microsoft and won't change
const PERMISSION_GUID_MAP: Record<string, { resourceAppId: string; permissionId: string }> = {
  // Microsoft Graph
  "User.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "df021288-bdef-4463-88db-98f22de89214" },
  "Directory.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "7ab1d382-f21e-4acd-a863-ba3e13f7da61" },
  "Group.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "5b567255-7703-4780-807c-7be8301ae99b" },
  "Application.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "9a5d68dd-52b0-4cc2-bd40-abcf44ac3a30" },
  "Organization.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "498476ce-e0fe-48b0-b801-37ba7e2685c6" },
  "Policy.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "246dd0d5-5bd0-4def-940b-0421030a5b68" },
  "IdentityRiskyUser.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "dc5007c0-2d7d-4c42-879c-2dab87571379" },
  "IdentityRiskEvent.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "6e472fd1-ad78-48da-a0f0-97ab2c6b769e" },
  "MailboxSettings.Read": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "40f97065-369a-49f4-947c-6a90f8a4153e" },
  "Mail.Read": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "810c84a8-4a9e-49e6-bf7d-12d183f40d01" },
  "Sites.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "332a536c-c7ef-4017-ab91-336970924f0d" },
  "Reports.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "230c1aed-a721-4c5d-9cb4-a90514e508ef" },
  "ServiceHealth.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "79c261e0-fe76-4144-aad5-bdc68fbe4037" },
  "Application.ReadWrite.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9" },
  "DeviceManagementManagedDevices.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "e4c9e354-4dc5-45b8-9e7c-e1393b0b1a20" },
  "DeviceManagementConfiguration.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "dc377aa6-52d8-4e23-b271-b3b7f5e4f6c4" },
  "SecurityAlert.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "472e4a4d-bb4a-4026-98d1-0b0d74cb74a5" },
  "SecurityEvents.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "bf394140-e372-4bf9-a898-299cfc7564e5" },
  "AuditLog.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "b0afded3-3588-46d8-8b3d-9842eff778da" },
  "SecurityIncident.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "45cc0394-e837-488b-a098-1918f48d186c" },
  "InformationProtectionPolicy.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "19da66cb-0fb0-49a4-b7a2-3607ae4e9acf" },
  "AttackSimulation.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "93283d0a-6322-4fa8-966b-813c78c0e1b4" },
  "TeamSettings.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "242607bd-1d2c-432c-82eb-bdb27baa23ab" },
  "Channel.ReadBasic.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "59a6b24b-4225-4393-a6be-42ed3eab75c4" },
  "TeamMember.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "660b7406-55f1-41ca-a0ed-0b035e182f3e" },
  "Domain.Read.All": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "dbb9058a-0e50-45d7-ae91-66909b5d4f1d" },
  "RoleManagement.ReadWrite.Directory": { resourceAppId: "00000003-0000-0000-c000-000000000000", permissionId: "9e3f62cf-ca93-4989-b6ce-bf83d28f9fe8" },
  // Exchange Online
  "Exchange.ManageAsApp": { resourceAppId: "00000002-0000-0ff1-ce00-000000000000", permissionId: "dc50a0fb-09a3-484d-be87-e023b12c6440" },
  // SharePoint Online
  "Sites.FullControl.All": { resourceAppId: "00000003-0000-0ff1-ce00-000000000000", permissionId: "678536fe-1083-478a-9c59-b99265e6b0d3" },
};

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

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[ensure-exchange-permission] Starting...");

    // 1. Read required permissions from database
    const { data: dbPermissions, error: dbError } = await supabase
      .from("m365_required_permissions")
      .select("permission_name")
      .order("permission_name");

    if (dbError) {
      console.error("[ensure-exchange-permission] DB error:", dbError);
      return jsonResponse({ success: false, error: "Failed to read permissions from database", skipped: true });
    }

    // Build REQUIRED_PERMISSIONS from DB + GUID map
    const REQUIRED_PERMISSIONS = (dbPermissions || [])
      .filter((p: any) => PERMISSION_GUID_MAP[p.permission_name])
      .map((p: any) => ({
        ...PERMISSION_GUID_MAP[p.permission_name],
        name: p.permission_name,
      }));

    const unmapped = (dbPermissions || [])
      .filter((p: any) => !PERMISSION_GUID_MAP[p.permission_name])
      .map((p: any) => p.permission_name);

    if (unmapped.length > 0) {
      console.log("[ensure-exchange-permission] Permissions without GUID mapping (skipped):", unmapped.join(", "));
    }

    console.log(`[ensure-exchange-permission] ${REQUIRED_PERMISSIONS.length} permissions to check from DB`);

    // 2. Read global config
    const { data: globalConfig, error: configError } = await supabase
      .from("m365_global_config")
      .select("id, app_id, client_secret_encrypted, home_tenant_id, validation_tenant_id")
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      console.log("[ensure-exchange-permission] No global config found");
      return jsonResponse({ success: false, error: "Global config not found", skipped: true });
    }

    const tenantForToken = globalConfig.home_tenant_id || globalConfig.validation_tenant_id;
    if (!tenantForToken) {
      return jsonResponse({ success: false, error: "Tenant ID not configured", skipped: true });
    }

    // 3. Get access token for HOME tenant
    const clientSecret = await decryptSecret(globalConfig.client_secret_encrypted);
    console.log("[ensure-exchange-permission] Getting token for home tenant:", tenantForToken);

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantForToken}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: globalConfig.app_id,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("[ensure-exchange-permission] Token error:", error);
      return jsonResponse({ success: false, error: "Failed to get access token", skipped: true });
    }

    const { access_token: accessToken } = await tokenResponse.json();

    // 4. Auto-discover Object ID via appId filter
    console.log("[ensure-exchange-permission] Auto-discovering Object ID for appId:", globalConfig.app_id);
    const discoveryUrl = `https://graph.microsoft.com/v1.0/applications(appId='${globalConfig.app_id}')?$select=id,requiredResourceAccess`;

    const discoveryResponse = await fetch(discoveryUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!discoveryResponse.ok) {
      const error = await discoveryResponse.text();
      console.error("[ensure-exchange-permission] Auto-discovery failed:", error);
      return jsonResponse({ success: false, error: "Failed to discover app registration", skipped: true });
    }

    const appData = await discoveryResponse.json();
    const objectId = appData.id;
    const currentPermissions = appData.requiredResourceAccess || [];

    console.log("[ensure-exchange-permission] Discovered Object ID:", objectId);

    // 5. Save discovered Object ID back to config
    await supabase
      .from("m365_global_config")
      .update({ app_object_id: objectId })
      .eq("id", globalConfig.id);

    // 6. Check and add missing permissions
    const addedPermissions: string[] = [];

    for (const perm of REQUIRED_PERMISSIONS) {
      let resource = currentPermissions.find((r: any) => r.resourceAppId === perm.resourceAppId);

      if (!resource) {
        resource = { resourceAppId: perm.resourceAppId, resourceAccess: [] };
        currentPermissions.push(resource);
      }

      const hasPermission = resource.resourceAccess?.some((p: any) => p.id === perm.permissionId);

      if (!hasPermission) {
        resource.resourceAccess.push({ id: perm.permissionId, type: "Role" });
        addedPermissions.push(perm.name);
        console.log(`[ensure-exchange-permission] Adding ${perm.name}`);
      } else {
        console.log(`[ensure-exchange-permission] ${perm.name} already configured`);
      }
    }

    if (addedPermissions.length === 0) {
      console.log("[ensure-exchange-permission] All permissions already configured");
      return jsonResponse({ success: true, added: false, message: "All permissions already configured", permissions: [], objectId });
    }

    // 7. PATCH manifest with discovered Object ID
    console.log(`[ensure-exchange-permission] Patching manifest for ${objectId}...`);
    const updateResponse = await fetch(`https://graph.microsoft.com/v1.0/applications/${objectId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requiredResourceAccess: currentPermissions }),
    });

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      console.error("[ensure-exchange-permission] PATCH failed:", error);
      return jsonResponse({ success: false, error: "Failed to update app registration", skipped: true });
    }

    console.log(`[ensure-exchange-permission] Success: ${addedPermissions.join(", ")}`);
    return jsonResponse({
      success: true,
      added: true,
      message: `Added permissions: ${addedPermissions.join(", ")}`,
      permissions: addedPermissions,
      objectId,
    });

  } catch (error: any) {
    console.error("[ensure-exchange-permission] Error:", error);
    return jsonResponse({ success: false, error: error.message || "Internal error", skipped: true });
  }
});
