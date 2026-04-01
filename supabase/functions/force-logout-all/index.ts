import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Validate auth - requires super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const { data: hasRole } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'super_admin',
    })
    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Forbidden - super_admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // List all users and sign them out
    let loggedOutCount = 0
    let page = 1
    const perPage = 100

    while (true) {
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      })

      if (listError) throw listError
      if (!users || users.length === 0) break

      for (const u of users) {
        try {
          await supabaseAdmin.auth.admin.signOut(u.id, 'global')
          loggedOutCount++
        } catch (e) {
          console.error(`Failed to logout user ${u.id}:`, e)
        }
      }

      if (users.length < perPage) break
      page++
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${loggedOutCount} sessões encerradas`,
        loggedOutCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Force logout error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
