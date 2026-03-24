import { ALLOWED_ORIGINS } from './config.js';

export function withCors(request) {
  const origin = request.headers.get('Origin');
  const isAllowedOrigin = Boolean(origin && ALLOWED_ORIGINS.has(origin));
  const allowOrigin = !origin ? '*' : isAllowedOrigin ? origin : 'null';
  const allowCredentials = isAllowedOrigin ? 'true' : 'false';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': allowCredentials,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie, X-AI-Debug',
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

export function errorResponse(code, message, status = 400, headers = {}, debug = null) {
  const body = { error: message, code };
  if (debug) {
    body.debug = debug;
  }

  return jsonResponse(body, status, {
    ...headers,
    'X-AI-Error-Code': code,
  });
}

export function wantsDebugDetails(request) {
  const value = String(request.headers.get('X-AI-Debug') || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function buildGeminiDebugPayload(reason, modelName, nowIso, candidates, extra = {}) {
  return {
    worker: 'graphics-oc-ai',
    reason,
    model: modelName,
    timestamp: nowIso,
    keys: candidates.map((candidate) => ({
      key_name: candidate.keyName,
      configured: Boolean(candidate.secret),
    })),
    ...extra,
  };
}
