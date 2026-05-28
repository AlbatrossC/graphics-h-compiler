const ALLOWED_ORIGINS = new Set([
  'https://graphicsh.online',
  'https://www.graphicsh.online',
  'https://graphics-h-compiler.pages.dev',
  'https://cloudflare.graphics-h-compiler.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function withCors(request) {
  const origin = request.headers.get('Origin');
  const isAllowedOrigin = Boolean(origin && ALLOWED_ORIGINS.has(origin));

  // No Origin header: likely non-browser tooling; keep permissive.
  const allowOrigin = !origin ? '*' : isAllowedOrigin ? origin : 'null';
  const allowCredentials = isAllowedOrigin ? 'true' : 'false';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': allowCredentials,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    Vary: 'Origin',
    'Content-Type': 'application/json',
  };
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

export function errorResponse(code, message, status = 400, headers = {}) {
  return jsonResponse({ error: message, code }, status, headers);
}

export async function readJsonBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'Expected application/json body',
    };
  }

  try {
    return await request.json();
  } catch {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'Invalid JSON body',
    };
  }
}
