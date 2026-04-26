const SESSION_COOKIE_NAME = 'session';
const SESSION_KEY_CACHE = new Map();

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJsonBase64Url(value) {
  const bytes = fromBase64Url(value);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function importSessionKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

async function getSessionKey(secret) {
  const cached = SESSION_KEY_CACHE.get(secret);
  if (cached) return cached;

  const key = await importSessionKey(secret);
  SESSION_KEY_CACHE.set(secret, key);
  if (SESSION_KEY_CACHE.size > 4) {
    const oldest = SESSION_KEY_CACHE.keys().next().value;
    if (oldest) {
      SESSION_KEY_CACHE.delete(oldest);
    }
  }
  return key;
}

async function verifySessionJwt(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid session token');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonBase64Url(encodedHeader);
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new Error('Invalid session token');
  }

  const key = await getSessionKey(secret);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(encodedSignature),
    new TextEncoder().encode(signingInput)
  );

  if (!isValid) {
    throw new Error('Invalid session token');
  }

  const payload = decodeJsonBase64Url(encodedPayload);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload?.email || !payload?.exp || payload.exp <= nowSec) {
    throw new Error('Session expired');
  }

  return payload;
}

function getSessionSecret(env) {
  return env.SESSION_SECRET || env.JWT_SECRET || '';
}

function getSessionToken(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = new Map();
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    cookies.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  return cookies.get(SESSION_COOKIE_NAME) || '';
}

function normalizeOptionalString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

async function resolveSessionIdentity(request, env) {
  const sessionSecret = getSessionSecret(env);
  const sessionToken = getSessionToken(request);

  if (!sessionToken) {
    return { status: 'missing_cookie' };
  }

  if (!sessionSecret) {
    return { status: 'missing_secret' };
  }

  try {
    const session = await verifySessionJwt(sessionToken, sessionSecret);
    const email = String(session.email || '').trim().toLowerCase();
    if (!email) {
      return { status: 'invalid_session', message: 'Session email was missing' };
    }
    return {
      status: 'ok',
      identity: {
        kind: 'email',
        value: email,
      },
    };
  } catch (error) {
    return {
      status: 'invalid_session',
      message: error instanceof Error ? error.message : 'Invalid session token',
    };
  }
}

export async function identifyCreateRequest(request, env, body, includeDebug = false) {
  const sessionState = await resolveSessionIdentity(request, env);
  if (sessionState.status === 'ok') {
    return sessionState.identity;
  }

  const fingerprint = normalizeOptionalString(body?.fingerprint_id, 200);
  if (fingerprint) {
    return {
      kind: 'fingerprint',
      value: fingerprint,
    };
  }

  if (sessionState.status === 'invalid_session' || sessionState.status === 'missing_secret') {
    throw {
      statusCode: 401,
      code: 'invalid_session',
      message:
        sessionState.status === 'missing_secret'
          ? 'Fix worker session verification is not configured. Set SESSION_SECRET to match the auth worker.'
          : 'Your login session could not be verified. Sign in again.',
      debug: includeDebug
        ? {
            worker: 'fix-with-ai',
            reason: sessionState.status,
            detail: sessionState.message || null,
          }
        : null,
    };
  }

  throw {
    statusCode: 400,
    code: 'bad_request',
    message: 'fingerprint_id is required for guest requests',
  };
}

export async function identifyReadRequest(request, env, includeDebug = false) {
  const sessionState = await resolveSessionIdentity(request, env);
  if (sessionState.status === 'ok') {
    return sessionState.identity;
  }

  const url = new URL(request.url);
  const fingerprint = normalizeOptionalString(url.searchParams.get('fingerprint_id'), 200);
  if (fingerprint) {
    return {
      kind: 'fingerprint',
      value: fingerprint,
    };
  }

  if (sessionState.status === 'invalid_session' || sessionState.status === 'missing_secret') {
    throw {
      statusCode: 401,
      code: 'invalid_session',
      message:
        sessionState.status === 'missing_secret'
          ? 'Fix worker session verification is not configured. Set SESSION_SECRET to match the auth worker.'
          : 'Your login session could not be verified. Sign in again.',
      debug: includeDebug
        ? {
            worker: 'fix-with-ai',
            reason: sessionState.status,
            detail: sessionState.message || null,
          }
        : null,
    };
  }

  throw {
    statusCode: 400,
    code: 'bad_request',
    message: 'fingerprint_id is required to fetch guest jobs',
  };
}
