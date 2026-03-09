const USER_CACHE = new Map();
const USER_CACHE_TTL_MS = 60_000;

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadPart = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadPart + '='.repeat((4 - (payloadPart.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const out = new Map();
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out.set(key, value);
  }
  return out;
}

function maybeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractEmailFromTokenValue(value) {
  if (!value || typeof value !== 'string') return null;

  const decodedValue = maybeDecodeURIComponent(value);

  const payload = decodeJwtPayload(decodedValue);
  if (typeof payload?.email === 'string' && payload.email.trim()) {
    return payload.email.trim().toLowerCase();
  }

  try {
    const parsed = JSON.parse(decodedValue);
    const candidates = [
      parsed?.email,
      parsed?.user?.email,
      parsed?.session?.user?.email,
      parsed?.data?.user?.email,
    ];
    for (const email of candidates) {
      if (typeof email === 'string' && email.trim()) {
        return email.trim().toLowerCase();
      }
    }
  } catch {
    // Not JSON, ignore.
  }

  return null;
}

function extractEmailFromSessionCookie(request) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const sessionCookieKeys = [
    '__Secure-better-auth.session_token',
    'better-auth.session_token',
    '__Secure-better-auth.session',
    'better-auth.session',
    'session',
  ];
  for (const key of sessionCookieKeys) {
    const token = cookies.get(key);
    const email = extractEmailFromTokenValue(token);
    if (email) return email;
  }
  return null;
}

function extractEmailFromAuthorizationHeader(request) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return extractEmailFromTokenValue(token);
}

function extractEmailFromTrustedHeader(request, env) {
  // Disabled by default. Enable only for temporary testing.
  if (env.ALLOW_TEST_EMAIL_HEADER !== '1') {
    return null;
  }

  const emailHeader =
    request.headers.get('x-user-email') ||
    request.headers.get('x-auth-email') ||
    request.headers.get('cf-access-authenticated-user-email');

  if (typeof emailHeader === 'string' && emailHeader.trim()) {
    return emailHeader.trim().toLowerCase();
  }

  return null;
}

function getCachedUser(email) {
  const cached = USER_CACHE.get(email);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    USER_CACHE.delete(email);
    return null;
  }
  return cached.value;
}

function setCachedUser(email, user) {
  USER_CACHE.set(email, {
    value: user,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
  });

  // Keep cache bounded.
  if (USER_CACHE.size > 2000) {
    const oldestKey = USER_CACHE.keys().next().value;
    if (oldestKey) USER_CACHE.delete(oldestKey);
  }
}

function extractEmailFromRequest(request, env) {
  return (
    extractEmailFromSessionCookie(request) ||
    extractEmailFromAuthorizationHeader(request) ||
    extractEmailFromTrustedHeader(request, env)
  );
}

export async function authenticateRequest(request, env) {
  const email = extractEmailFromRequest(request, env);

  if (!email) {
    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'Unable to resolve user email from session',
    };
  }

  const cachedUser = getCachedUser(email);
  if (cachedUser) {
    return { email, user: cachedUser };
  }

  const user = await env.graphicsh_oc_db
    .prepare(
      `SELECT user_id, email, write_blocked, total_files, total_storage
       FROM users
       WHERE lower(email) = lower(?)
       LIMIT 1`
    )
    .bind(email)
    .first();

  if (!user) {
    throw {
      statusCode: 401,
      code: 'unauthorized',
      message: 'User record not found',
    };
  }

  const normalizedUser = {
    user_id: user.user_id,
    email: user.email,
    write_blocked: Number(user.write_blocked || 0),
    total_files: Number(user.total_files || 0),
    total_storage: Number(user.total_storage || 0),
  };

  setCachedUser(email, normalizedUser);

  return { email, user: normalizedUser };
}
