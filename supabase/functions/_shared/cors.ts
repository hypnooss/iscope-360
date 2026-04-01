const ALLOWED_ORIGINS = [
  'https://iscope-teste.lovable.app',
  'https://id-preview--80ef3bd6-10e0-4873-8dfe-c2c72619d60b.lovable.app',
  'https://80ef3bd6-10e0-4873-8dfe-c2c72619d60b.lovableproject.com',
  'https://iscope360.precisio.io',
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Vary': 'Origin',
  };
}

export function corsResponse(req: Request): Response {
  return new Response(null, { headers: getCorsHeaders(req) });
}
