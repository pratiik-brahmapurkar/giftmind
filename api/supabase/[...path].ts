// Edge runtime for low latency and global distribution
export const config = {
  runtime: 'edge',
};

// Whitelist of Supabase paths we proxy. Everything else is rejected.
const ALLOWED_PATHS = [
  '/auth/v1/',
  '/rest/v1/',
  '/storage/v1/',
  '/realtime/v1/',
  '/functions/v1/',
];

// Headers that must be forwarded from client → Supabase
const FORWARD_HEADERS = [
  'apikey',
  'authorization',
  'content-type',
  'accept',
  'accept-profile',
  'content-profile',
  'prefer',
  'range',
  'x-client-info',
  'x-supabase-api-version',
];

export default async function handler(req: Request): Promise<Response> {
  // ─── CORS preflight ──────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': FORWARD_HEADERS.join(', '),
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    if (!SUPABASE_URL) {
      return jsonError('SUPABASE_URL not configured on server', 500);
    }

    // ─── Extract the target path ──────────────────────────
    // Request: /api/supabase/rest/v1/recipients?select=*
    // Target:  {SUPABASE_URL}/rest/v1/recipients?select=*
    const url = new URL(req.url);
    const pathAfterPrefix = url.pathname.replace(/^\/api\/supabase/, '');
    
    if (!pathAfterPrefix || pathAfterPrefix === '/') {
      return jsonError('Invalid proxy path', 400);
    }

    // Security: only allow whitelisted Supabase paths
    const isAllowed = ALLOWED_PATHS.some(allowed => pathAfterPrefix.startsWith(allowed));
    if (!isAllowed) {
      return jsonError(`Path not allowed: ${pathAfterPrefix}`, 403);
    }

    const targetUrl = `${SUPABASE_URL}${pathAfterPrefix}${url.search}`;

    // ─── Build forwarded headers ──────────────────────────
    const outboundHeaders = new Headers();
    for (const headerName of FORWARD_HEADERS) {
      const value = req.headers.get(headerName);
      if (value) outboundHeaders.set(headerName, value);
    }
    
    // Preserve original host for Supabase logging
    outboundHeaders.set('x-forwarded-for', req.headers.get('x-forwarded-for') || 'unknown');
    outboundHeaders.set('x-forwarded-host', req.headers.get('host') || 'unknown');

    // ─── Forward the request ──────────────────────────────
    const body = (req.method === 'GET' || req.method === 'HEAD') 
      ? undefined 
      : await req.arrayBuffer();

    const upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers: outboundHeaders,
      body,
      redirect: 'manual', // don't auto-follow redirects
    });

    // ─── Build response with CORS + streaming body ────────
    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', '*');
    
    // Strip problematic headers that break streaming
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('[supabase-proxy] Error:', error);
    return jsonError(
      `Proxy error: ${error?.message || 'unknown'}`, 
      502
    );
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
