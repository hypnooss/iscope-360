import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// Office 365 Exchange Online resource ID
const EXCHANGE_RESOURCE_ID = "00000002-0000-0ff1-ce00-000000000000";
// Exchange.ManageAsApp permission ID
const EXCHANGE_MANAGE_AS_APP_ID = "dc50a0fb-09a3-484d-be87-e023b12c6440";

async function getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
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

    // Verify user is admin
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

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'super_suporte'])
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem executar esta ação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[add-exchange-permission] Starting permission addition");

    // Get global M365 config
    const { data: globalConfig, error: configError } = await supabase
      .from('m365_global_config')
      .select('app_id, app_object_id, client_secret_encrypted, validation_tenant_id')
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      return new Response(
        JSON.stringify({ error: "Configuração M365 global não encontrada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!globalConfig.app_object_id) {
      return new Response(
        JSON.stringify({ error: "App Object ID não configurado. Configure em Administração > Configurações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!globalConfig.validation_tenant_id) {
      return new Response(
        JSON.stringify({ error: "Tenant ID não configurado. Configure em Administração > Configurações." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get access token for home tenant
    const accessToken = await getAccessToken(
      globalConfig.validation_tenant_id,
      globalConfig.app_id,
      globalConfig.client_secret_encrypted
    );

    console.log("[add-exchange-permission] Got access token, fetching app registration");

    // Get current app registration
    const appUrl = `https://graph.microsoft.com/v1.0/applications/${globalConfig.app_object_id}`;
    const appResponse = await fetch(appUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!appResponse.ok) {
      const error = await appResponse.text();
      console.error("Failed to get app registration:", error);
      return new Response(
        JSON.stringify({ error: `Falha ao obter App Registration: ${error}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const app = await appResponse.json();
    const currentPermissions = app.requiredResourceAccess || [];

    console.log("[add-exchange-permission] Current permissions:", JSON.stringify(currentPermissions));

    // Check if Exchange permission already exists
    const exchangeResource = currentPermissions.find(
      (r: any) => r.resourceAppId === EXCHANGE_RESOURCE_ID
    );

    if (exchangeResource) {
      const hasPermission = exchangeResource.resourceAccess?.some(
        (p: any) => p.id === EXCHANGE_MANAGE_AS_APP_ID
      );

      if (hasPermission) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "A permissão Exchange.ManageAsApp já está configurada.",
            already_configured: true 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Add permission to existing resource
      exchangeResource.resourceAccess.push({
        id: EXCHANGE_MANAGE_AS_APP_ID,
        type: "Role", // Application permission
      });
    } else {
      // Add new resource with permission
      currentPermissions.push({
        resourceAppId: EXCHANGE_RESOURCE_ID,
        resourceAccess: [
          {
            id: EXCHANGE_MANAGE_AS_APP_ID,
            type: "Role",
          },
        ],
      });
    }

    console.log("[add-exchange-permission] Updating app with new permissions");

    // Update app registration
    const updateResponse = await fetch(appUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requiredResourceAccess: currentPermissions,
      }),
    });

    if (!updateResponse.ok) {
      const error = await updateResponse.text();
      console.error("Failed to update app registration:", error);
      return new Response(
        JSON.stringify({ error: `Falha ao atualizar App Registration: ${error}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[add-exchange-permission] Permission added successfully");

    // Log audit
    await supabase.from('admin_activity_logs').insert({
      admin_id: user.id,
      action: 'exchange_permission_added',
      action_type: 'config',
      target_type: 'app_registration',
      target_id: globalConfig.app_object_id,
      details: {
        permission: 'Exchange.ManageAsApp',
        resource_id: EXCHANGE_RESOURCE_ID,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Permissão Exchange.ManageAsApp adicionada ao App Registration. Os tenants clientes precisam re-consentir para obter a nova permissão.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[add-exchange-permission] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
