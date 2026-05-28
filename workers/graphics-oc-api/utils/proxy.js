/**
 * Proxy utility for internal Worker service bindings.
 * The public API worker keeps CORS/cookie response policy, while the files
 * worker keeps ownership of auth, validation, and D1 persistence.
 */

/**
 * Forward a request to the files worker, preserving request headers and cookies.
 *
 * @param {Request} request - The incoming request
 * @param {string} path - The path to forward to the files worker
 * @param {object} corsHeaders - CORS headers to add to the response
 * @param {{ fetch: Function }} serviceBinding - Cloudflare Worker service binding
 * @returns {Promise<Response>}
 */
export async function proxyRequest(request, path, corsHeaders, serviceBinding) {
  if (!serviceBinding?.fetch) {
    return Response.json(
      { error: 'Upstream worker binding is not configured' },
      { status: 503, headers: corsHeaders },
    );
  }

  const url = new URL(request.url);
  const targetUrl = new URL(path, 'https://graphics-oc-files.internal');
  targetUrl.search = url.search;

  // Build upstream headers — forward everything except host
  const upstreamHeaders = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'content-length') continue;
    upstreamHeaders.set(key, value);
  }

  // Add forwarding headers
  upstreamHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
  upstreamHeaders.set('X-Forwarded-Proto', 'https');
  upstreamHeaders.set('X-Forwarded-Host', url.host);

  const upstreamRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
    redirect: 'manual',
  });
  const upstreamResponse = await serviceBinding.fetch(upstreamRequest);

  // Build response — forward all headers except hop-by-hop
  const responseHeaders = new Headers(corsHeaders);
  const excludedHeaders = new Set([
    'access-control-allow-credentials',
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-allow-origin',
    'access-control-expose-headers',
    'access-control-max-age',
    'content-encoding',
    'transfer-encoding',
    'connection',
    'vary',
  ]);

  for (const [key, value] of upstreamResponse.headers.entries()) {
    if (excludedHeaders.has(key.toLowerCase())) continue;
    responseHeaders.set(key, value);
  }

  // Preserve auth cookies from the files worker. Strip Domain defensively so the
  // browser stores the cookie for the public API worker host.
  const setCookies = upstreamResponse.headers.getAll?.('Set-Cookie')
    || [upstreamResponse.headers.get('Set-Cookie')].filter(Boolean);

  for (const cookie of setCookies) {
    const rewritten = cookie
      .split(';')
      .filter((part) => !part.trim().toLowerCase().startsWith('domain='))
      .join(';');
    responseHeaders.append('Set-Cookie', rewritten);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}
