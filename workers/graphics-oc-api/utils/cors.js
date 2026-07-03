/**
 * CORS utility — shared headers for all API responses.
 */

const ALLOWED_ORIGINS = new Set([
  'https://graphicsh.online',
  'https://www.graphicsh.online',
  'https://graphics-h-compiler.pages.dev',
  'https://cloudflare.graphics-h-compiler.pages.dev',
  'https://test.graphics-h-compiler.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const isAllowedOrigin = Boolean(origin && ALLOWED_ORIGINS.has(origin));
  const allowOrigin = !origin ? '*' : isAllowedOrigin ? origin : 'null';
  const allowCredentials = isAllowedOrigin ? 'true' : 'false';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, Upgrade',
    'Access-Control-Allow-Credentials': allowCredentials,
    Vary: 'Origin',
  };
}

export function corsPreflightResponse(headers) {
  return new Response(null, { status: 204, headers });
}
