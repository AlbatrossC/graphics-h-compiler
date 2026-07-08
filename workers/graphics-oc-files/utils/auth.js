import { errorResponse, jsonResponse, readJsonBody } from './response.js';

const USER_CACHE = new Map();
const USER_CACHE_TTL_MS = 300_000;

const GOOGLE_TOKEN_CACHE = new Map();
const GOOGLE_TOKEN_CACHE_TTL_MS = 300_000;

const SESSION_COOKIE_NAME = 'session';
const SESSION_DURATION_SEC = 7 * 24 * 60 * 60;
const SESSION_ISSUER = 'graphics-oc-files';
const SESSION_AUDIENCE = 'graphics-oc-api';
const SESSION_KEY_CACHE = new Map();

function parseCookies(cookieHeader) {
  const out = new Map();
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    out.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  return out;
}

function toBase64Url(input) {
  const bytes =
    typeof input === 'string'
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

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
    ['sign', 'verify']
  );
}

async function getSessionKey(secret) {
  const cached = SESSION_KEY_CACHE.get(secret);
  if (cached) return cached;
  const key = await importSessionKey(secret);
  SESSION_KEY_CACHE.set(secret, key);
  if (SESSION_KEY_CACHE.size > 4) {
    const oldest = SESSION_KEY_CACHE.keys().next().value;
    if (oldest) SESSION_KEY_CACHE.delete(oldest);
  }
  return key;
}

async function signSessionJwt(payload, secret) {
  const encodedHeader = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await getSessionKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  );
  return `${signingInput}.${toBase64Url(signature)}`;
}

async function verifySessionJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'Invalid session token',
    };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonBase64Url(encodedHeader);
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'Invalid session token',
    };
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
    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'Invalid session token',
    };
  }

  const payload = decodeJsonBase64Url(encodedPayload);
  const nowSec = Math.floor(Date.now() / 1000);
  if (
    payload?.iss !== SESSION_ISSUER ||
    payload?.aud !== SESSION_AUDIENCE ||
    !payload?.user_id ||
    !payload?.email ||
    !payload?.iat ||
    !payload?.exp ||
    payload.exp <= nowSec
  ) {
    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'Session expired',
    };
  }

  return payload;
}

function getCachedGoogleToken(token) {
  const cached = GOOGLE_TOKEN_CACHE.get(token);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    GOOGLE_TOKEN_CACHE.delete(token);
    return null;
  }
  return cached.value;
}

function setCachedGoogleToken(token, value, expiresAt) {
  GOOGLE_TOKEN_CACHE.set(token, { value, expiresAt });
  if (GOOGLE_TOKEN_CACHE.size > 2000) {
    const oldestKey = GOOGLE_TOKEN_CACHE.keys().next().value;
    if (oldestKey) GOOGLE_TOKEN_CACHE.delete(oldestKey);
  }
}

async function verifyGoogleIdToken(idToken, env) {
  const cached = getCachedGoogleToken(idToken);
  if (cached) return cached;

  if (!env.GOOGLE_CLIENT_ID) {
    throw {
      statusCode: 500,
      code: 'server_error',
      message: 'GOOGLE_CLIENT_ID is not configured',
    };
  }

  const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(verifyUrl);
  if (!response.ok) {
    throw {
      statusCode: 401,
      code: 'invalid_google_token',
      message: 'Invalid Google ID token',
    };
  }

  const data = await response.json();
  const expSec = Number(data?.exp || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!data?.email || !data?.sub || !expSec || expSec <= nowSec) {
    throw {
      statusCode: 401,
      code: 'invalid_google_token',
      message: 'Invalid Google ID token',
    };
  }

  if (data.aud !== env.GOOGLE_CLIENT_ID) {
    throw {
      statusCode: 401,
      code: 'invalid_google_token',
      message: 'Google token audience mismatch',
    };
  }

  if (String(data.email_verified) === 'false') {
    throw {
      statusCode: 401,
      code: 'invalid_google_token',
      message: 'Google email is not verified',
    };
  }

  const value = {
    email: String(data.email).trim().toLowerCase(),
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null,
    picture: typeof data.picture === 'string' && data.picture.trim() ? data.picture.trim() : null,
  };

  const expiresAt = Math.min(Date.now() + GOOGLE_TOKEN_CACHE_TTL_MS, expSec * 1000);
  setCachedGoogleToken(idToken, value, expiresAt);
  return value;
}

function getCachedUser(userId) {
  const cached = USER_CACHE.get(userId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    USER_CACHE.delete(userId);
    return null;
  }
  return cached.value;
}

function setCachedUser(userId, user) {
  USER_CACHE.set(userId, {
    value: user,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
  });
  if (USER_CACHE.size > 2000) {
    const oldestKey = USER_CACHE.keys().next().value;
    if (oldestKey) USER_CACHE.delete(oldestKey);
  }
}

function clearCachedUser(userId) {
  if (userId) USER_CACHE.delete(userId);
}

function buildSessionCookie(token, maxAgeSec = SESSION_DURATION_SEC) {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Secure',
    // SameSite=None is required while the static Pages app calls the workers.dev API host.
    'SameSite=None',
    'Path=/',
    `Max-Age=${maxAgeSec}`,
  ].join('; ');
}

function buildLogoutCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Secure',
    // SameSite=None is required while the static Pages app calls the workers.dev API host.
    'SameSite=None',
    'Path=/',
    'Max-Age=0',
  ].join('; ');
}

async function upsertUserFromIdentity(env, identity, request) {
  const now = Date.now();
  const db = env.graphicsh_oc_db;

  let user = await db
    .prepare(
      `SELECT user_id, display_name, email, avatar_url, write_blocked, total_files, total_storage
       FROM users
       WHERE lower(email) = lower(?)
       LIMIT 1`
    )
    .bind(identity.email)
    .first();

  if (!user) {
    const userId = crypto.randomUUID();
    const displayName = identity.name || identity.email;

    await db
      .prepare(
        `INSERT INTO users (user_id, display_name, email, avatar_url, first_sign_in, last_sign_in, total_files, total_storage, write_blocked)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)`
      )
      .bind(userId, displayName, identity.email, identity.picture ?? null, now, now)
      .run();

    user = {
      user_id: userId,
      display_name: displayName,
      email: identity.email,
      avatar_url: identity.picture ?? null,
      write_blocked: 0,
      total_files: 0,
      total_storage: 0,
    };
  } else {
    await db
      .prepare(`UPDATE users SET last_sign_in = ?, display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url) WHERE user_id = ?`)
      .bind(now, identity.name, identity.picture ?? null, user.user_id)
      .run();

    user = {
      ...user,
      display_name: identity.name || user.display_name,
      avatar_url: identity.picture ?? user.avatar_url ?? null,
    };
  }

  const ip = request ? (request.headers.get('CF-Connecting-IP') || null) : null;
  await db.prepare('INSERT INTO login_history (user_id, login_at, ip_address) VALUES (?, ?, ?)')
    .bind(user.user_id, now, ip)
    .run();

  const threeMonthsAgo = now - (90 * 24 * 60 * 60 * 1000);
  await db.prepare('DELETE FROM login_history WHERE login_at < ?')
    .bind(threeMonthsAgo)
    .run();

  const normalizedUser = {
    user_id: user.user_id,
    display_name: user.display_name || identity.name || identity.email,
    email: user.email,
    avatar_url: user.avatar_url || identity.picture || null,
    write_blocked: Number(user.write_blocked || 0),
    total_files: Number(user.total_files || 0),
    total_storage: Number(user.total_storage || 0),
  };

  setCachedUser(normalizedUser.user_id, normalizedUser);
  return normalizedUser;
}

async function issueSessionLoginResponse(env, user, corsHeaders) {
  const nowSec = Math.floor(Date.now() / 1000);
  const sessionToken = await signSessionJwt(
    {
      user_id: user.user_id,
      email: user.email,
      iss: SESSION_ISSUER,
      aud: SESSION_AUDIENCE,
      iat: nowSec,
      exp: nowSec + SESSION_DURATION_SEC,
    },
    env.SESSION_SECRET
  );

  const response = jsonResponse(
    {
      authenticated: true,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url || null,
    },
    200,
    corsHeaders
  );
  response.headers.append('Set-Cookie', buildSessionCookie(sessionToken));
  return response;
}

export async function authenticateRequest(request, env) {
  if (!env.SESSION_SECRET) {
    throw {
      statusCode: 500,
      code: 'server_error',
      message: 'SESSION_SECRET is not configured',
    };
  }

  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const sessionToken = cookies.get(SESSION_COOKIE_NAME);
  if (!sessionToken) {
    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'Authentication required',
    };
  }

  const session = await verifySessionJwt(sessionToken, env.SESSION_SECRET);
  const cachedUser = getCachedUser(session.user_id);
  if (cachedUser) {
    return { session, user: cachedUser };
  }

  const user = await env.graphicsh_oc_db
    .prepare(
      `SELECT user_id, display_name, email, avatar_url, write_blocked, total_files, total_storage
       FROM users
       WHERE user_id = ?
       LIMIT 1`
    )
    .bind(session.user_id)
    .first();

  if (!user || String(user.email).toLowerCase() !== String(session.email).toLowerCase()) {
    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'User record not found',
    };
  }

  const normalizedUser = {
    user_id: user.user_id,
    display_name: user.display_name || user.email,
    email: user.email,
    avatar_url: user.avatar_url || null,
    write_blocked: Number(user.write_blocked || 0),
    total_files: Number(user.total_files || 0),
    total_storage: Number(user.total_storage || 0),
  };

  setCachedUser(normalizedUser.user_id, normalizedUser);
  return { session, user: normalizedUser };
}

export async function handleGoogleLogin(request, env, corsHeaders) {
  if (!env.SESSION_SECRET) {
    return errorResponse('server_error', 'SESSION_SECRET is not configured', 500, corsHeaders);
  }

  const body = await readJsonBody(request);
  const idToken = typeof body?.id_token === 'string' ? body.id_token.trim() : '';
  if (!idToken) {
    return errorResponse('bad_request', 'id_token is required', 400, corsHeaders);
  }

  const identity = await verifyGoogleIdToken(idToken, env);
  const user = await upsertUserFromIdentity(env, identity, request);
  return issueSessionLoginResponse(env, user, corsHeaders);
}

export async function handleSession(request, env, corsHeaders) {
  try {
    const auth = await authenticateRequest(request, env);
    return jsonResponse(
      {
        authenticated: true,
        email: auth.user.email,
        display_name: auth.user.display_name,
        avatar_url: auth.user.avatar_url || null,
      },
      200,
      corsHeaders
    );
  } catch (error) {
    if (error?.statusCode === 401) {
      return jsonResponse({ authenticated: false }, 200, corsHeaders);
    }
    throw error;
  }
}

export function handleLogout(_request, _env, corsHeaders) {
  const response = jsonResponse({ success: true }, 200, corsHeaders);
  response.headers.append('Set-Cookie', buildLogoutCookie());
  return response;
}

export function invalidateUserCache(userId) {
  clearCachedUser(userId);
}
