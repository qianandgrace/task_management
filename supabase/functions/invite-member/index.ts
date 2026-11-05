import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const reqOrigin = req.headers.get('origin');
    if (reqOrigin === ALLOWED_ORIGIN) {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    // Reject non-matching origins: no ACAO header
    return new Response(null, { status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: { code: 'CONFIG_ERROR', message: 'Missing environment variables' } }),
        { status: 500, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    // Service-role client for database writes/reads (bypasses RLS)
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Auth client using the caller's JWT
    const authorization = req.headers.get('Authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } }),
        { status: 401, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    const jwt = authorization.slice(7);
    const caller = createClient(supabaseUrl, anonKey, { global: { fetch: async (url, opts) => {
      return fetch(url, { ...opts, headers: { ...opts?.headers, authorization: `Bearer ${jwt}` } });
    }}});

    // Verify JWT server-side via Supabase and obtain user ID
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) {
      console.error('JWT verification failed:', authError);
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }),
        { status: 401, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    const callerSub = user.id;

    // Parse body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: { code: 'INVALID_BODY', message: 'Request body must be valid JSON' } }),
        { status: 400, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    const { organizationId, email, role } = body;

    // Validate required fields
    if (!organizationId || typeof organizationId !== 'string') {
      return new Response(
        JSON.stringify({ error: { code: 'MISSING_FIELD', message: 'organizationId is required' } }),
        { status: 400, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }
    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: { code: 'MISSING_FIELD', message: 'email is required' } }),
        { status: 400, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }
    if (!role || typeof role !== 'string') {
      return new Response(
        JSON.stringify({ error: { code: 'MISSING_FIELD', message: 'role is required' } }),
        { status: 400, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return new Response(
        JSON.stringify({ error: { code: 'INVALID_ROLE', message: 'role must be one of: owner, admin, member, viewer' } }),
        { status: 400, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    // Validate email format (basic check)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: { code: 'INVALID_EMAIL', message: 'Invalid email format' } }),
        { status: 400, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    // Check caller's role in the target organization
    const { data: callerMember, error: callerError } = await admin
      .from('members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('profile_id', callerSub)
      .maybeSingle();

    if (callerError) {
      console.error('Error checking caller membership:', callerError);
      return new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failed to verify caller permissions' } }),
        { status: 500, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    if (!callerMember) {
      return new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', message: '无权邀请成员' } }),
        { status: 403, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    if (!['owner', 'admin'].includes(callerMember.role)) {
      return new Response(
        JSON.stringify({ error: { code: 'FORBIDDEN', message: '无权邀请成员' } }),
        { status: 403, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    // Find target user by email in profiles
    const { data: targetProfile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileError) {
      console.error('Error finding target profile:', profileError);
      return new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failed to find target user' } }),
        { status: 500, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    if (!targetProfile) {
      return new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: '用户未注册' } }),
        { status: 404, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    // Check if target is already a member
    const { data: existingMember } = await admin
      .from('members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('profile_id', targetProfile.id)
      .maybeSingle();

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: { code: 'CONFLICT', message: '已是成员' } }),
        { status: 409, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    // Insert the new membership
    const { data: newMember, error: insertError } = await admin
      .from('members')
      .insert({
        organization_id: organizationId,
        profile_id: targetProfile.id,
        role: role,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting member:', insertError);
      return new Response(
        JSON.stringify({ error: { code: 'INSERT_ERROR', message: 'Failed to add member' } }),
        { status: 500, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
      );
    }

    // Return success response with camelCase keys
    return new Response(
      JSON.stringify({
        member: {
          id: newMember.id,
          organizationId: newMember.organization_id,
          profileId: newMember.profile_id,
          role: newMember.role,
          createdAt: newMember.created_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders(), 'content-type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }),
      { status: 500, headers: { ...corsHeaders(), 'content-type': 'application/json' } },
    );
  }
});
