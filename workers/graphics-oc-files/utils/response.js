const ALLOWED_ORIGINS = new Set([
  'https://graphics-h-compiler.vercel.app',
  'https://graphics-h-online-compiler-git-test-albatrosscs-projects.vercel.app',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
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
