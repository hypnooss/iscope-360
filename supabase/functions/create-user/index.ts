import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

interface ModulePermission {
  moduleId: string;
  permission: 'view' | 'edit';
}

serve(async (req) => {
  // Handle CORS preflight requests
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get the authorization header to verify the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Authorization header is required");
    }

    // Create a client with the user's token to verify their permissions
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get the requesting user
    const { data: { user: requestingUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !requestingUser) {
      throw new Error("Unauthorized: Invalid token");
    }

    // Check if the requesting user is an admin or super_admin
    const { data: requesterRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .single();

    if (!requesterRole || !["workspace_admin", "super_admin"].includes(requesterRole.role)) {
      throw new Error("Unauthorized: Only admins can create users");
    }

    const isSuperAdmin = requesterRole.role === "super_admin";

    // Parse request body
    const { email, password, fullName, role, clientIds, modulePermissions } = await req.json();

    // Validate input
    if (!email || !password || !fullName) {
      throw new Error("Email, password, and fullName are required");
    }

    // Validate role assignment permissions
    if (role === "super_admin" && !isSuperAdmin) {
      throw new Error("Only super admins can create super admin users");
    }

    if (role === "workspace_admin" && !isSuperAdmin) {
      throw new Error("Only super admins can create workspace admin users");
    }

    // Non-super_admin users must have at least one module with access
    const modulesWithAccess = (modulePermissions || []) as ModulePermission[];
    if (role !== "super_admin" && modulesWithAccess.length === 0) {
      throw new Error("Users must have access to at least one module");
    }

    // Validate module IDs exist
    if (modulesWithAccess.length > 0) {
      const moduleIds = modulesWithAccess.map((m: ModulePermission) => m.moduleId);
      const { data: validModules, error: moduleError } = await supabaseAdmin
        .from("modules")
        .select("id")
        .in("id", moduleIds)
        .eq("is_active", true);

      if (moduleError) {
        throw new Error("Error validating modules: " + moduleError.message);
      }

      if (!validModules || validModules.length !== moduleIds.length) {
        throw new Error("One or more invalid module IDs provided");
      }
    }

    // If admin (not super_admin), verify they have access to the assigned clients
    if (!isSuperAdmin && clientIds && clientIds.length > 0) {
      const { data: adminClients } = await supabaseAdmin
        .from("user_clients")
        .select("client_id")
        .eq("user_id", requestingUser.id);

      const adminClientIds = (adminClients || []).map((c: any) => c.client_id);
      
      for (const clientId of clientIds) {
        if (!adminClientIds.includes(clientId)) {
          throw new Error("You can only assign clients you have access to");
        }
      }
    }

    console.log("Creating user:", { email, fullName, role });

    // 1. Create the user in Supabase Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      throw new Error(createError.message);
    }

    if (!newUser.user) {
      throw new Error("Failed to create user");
    }

    const userId = newUser.user.id;
    console.log("User created with ID:", userId);

    // 2. Create profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      email,
      full_name: fullName,
    });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      // Don't throw, profile might be created by trigger
    }

    // 3. Use upsert in case trigger didn't create the role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: role || "user" },
        { onConflict: "user_id" }
      );

    if (roleError) {
      console.error("Error setting role:", roleError);
      throw new Error("Failed to set user role: " + roleError.message);
    }

    // 4. Create client associations (only if not super_admin)
    if (role !== "super_admin" && clientIds && clientIds.length > 0) {
      const clientInserts = clientIds.map((clientId: string) => ({
        user_id: userId,
        client_id: clientId,
      }));

      const { error: clientError } = await supabaseAdmin.from("user_clients").insert(clientInserts);

      if (clientError) {
        console.error("Error creating client associations:", clientError);
      }
    }

    // 5. Create module associations with permissions (only if not super_admin)
    if (role !== "super_admin" && modulesWithAccess.length > 0) {
      const moduleInserts = modulesWithAccess.map((mp: ModulePermission) => ({
        user_id: userId,
        module_id: mp.moduleId,
        permission: mp.permission,
        created_by: requestingUser.id,
      }));

      const { error: moduleError } = await supabaseAdmin.from("user_modules").insert(moduleInserts);

      if (moduleError) {
        console.error("Error creating module associations:", moduleError);
      }
    }

    console.log("User setup completed successfully");

    return new Response(
      JSON.stringify({ success: true, userId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in create-user function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
