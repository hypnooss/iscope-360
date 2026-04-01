import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the calling user
    const { data: { user: callingUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !callingUser) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if calling user is super_admin or super_suporte
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callingUser.id)
      .single();

    if (!callerRole || !['super_admin', 'super_suporte'].includes(callerRole.role)) {
      console.log('User role check failed:', callerRole);
      return new Response(
        JSON.stringify({ error: 'Only super_admin and super_suporte can use preview mode' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { targetUserId, targetWorkspaceId, reason } = await req.json();

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: 'targetUserId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Preview request: admin ${callingUser.id} viewing as user ${targetUserId}`);

    // Check if target user exists and is not a super user
    const { data: targetRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', targetUserId)
      .single();

    if (targetRole && ['super_admin', 'super_suporte'].includes(targetRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Cannot preview as super_admin or super_suporte users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch target user's profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (profileError || !profile) {
      console.error('Profile error:', profileError);
      return new Response(
        JSON.stringify({ error: 'Target user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch target user's role
    const role = targetRole?.role || 'user';

    // Fetch target user's module permissions
    const { data: modulePermissions } = await supabaseAdmin
      .from('user_module_permissions')
      .select('module_name, permission')
      .eq('user_id', targetUserId);

    // Fetch target user's module access
    const { data: userModules } = await supabaseAdmin
      .from('user_modules')
      .select('module_id, permission, modules(*)')
      .eq('user_id', targetUserId);

    // Fetch target user's workspace/client access
    const { data: userClients } = await supabaseAdmin
      .from('user_clients')
      .select('client_id, clients(id, name)')
      .eq('user_id', targetUserId);

    // Create preview session record for auditing
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('preview_sessions')
      .insert({
        admin_id: callingUser.id,
        target_user_id: targetUserId,
        target_workspace_id: targetWorkspaceId || null,
        reason: reason || null,
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
        user_agent: req.headers.get('user-agent') || null,
        mode: 'preview',
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      // Don't fail the request, just log
    }

    // Build permissions object
    const permissions: Record<string, string> = {
      dashboard: 'view',
      firewall: 'view',
      reports: 'view',
      users: 'view',
      external_domain: 'view',
    };

    if (modulePermissions) {
      for (const mp of modulePermissions) {
        permissions[mp.module_name] = mp.permission;
      }
    }

    // Build modules array
    const modules = (userModules || [])
      .filter((um: any) => um.modules)
      .map((um: any) => ({
        module: um.modules,
        permission: um.permission || 'view',
      }));

    // Build workspaces array
    const workspaces = (userClients || [])
      .filter((uc: any) => uc.clients)
      .map((uc: any) => ({
        id: uc.clients.id,
        name: uc.clients.name,
      }));

    console.log(`Preview session created: ${session?.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: session?.id || null,
        profile: {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
        },
        role,
        permissions,
        modules,
        workspaces,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
