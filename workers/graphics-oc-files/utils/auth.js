const USER_CACHE = new Map();
const USER_CACHE_TTL_MS = 60_000;

const TOKEN_EMAIL_CACHE = new Map();
const TOKEN_CACHE_TTL_MS = 300_000; // 5 minutes

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

// --- Token verification cache ---

function getCachedTokenEmail(token) {
  const cached = TOKEN_EMAIL_CACHE.get(token);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    TOKEN_EMAIL_CACHE.delete(token);
    return null;
  }
  return cached.value;
}

function setCachedTokenEmail(token, info) {
  TOKEN_EMAIL_CACHE.set(token, {
    value: info,
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
  });
  if (TOKEN_EMAIL_CACHE.size > 2000) {
    const oldestKey = TOKEN_EMAIL_CACHE.keys().next().value;
    if (oldestKey) TOKEN_EMAIL_CACHE.delete(oldestKey);
  }
}

// --- Better Auth session verification ---

async function verifyTokenWithBetterAuth(token, env) {
  const betterAuthUrl = env.BETTER_AUTH_URL;
  if (!betterAuthUrl) return null;

  // Check token cache first
  const cached = getCachedTokenEmail(token);
  if (cached) return cached;

  try {
    const response = await fetch(`${betterAuthUrl}/api/auth/session`, {
      headers: {
        'Cookie': `better-auth.session_token=${token}; __Secure-better-auth.session_token=${token}`,
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const user = data?.user || data?.session?.user;
    const email = user?.email?.trim().toLowerCase();

    if (!email) return null;

    const info = {
      email,
      name: user?.name || user?.display_name || null,
    };

    setCachedTokenEmail(token, info);
    return info;
  } catch {
    return null;
  }
}

// --- User cache ---

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
  let email = extractEmailFromRequest(request, env);
  let betterAuthUserInfo = null;

  // If no email from cookies/JWT, verify Bearer token with Better Auth
  if (!email) {
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7).trim();
      betterAuthUserInfo = await verifyTokenWithBetterAuth(token, env);
      if (betterAuthUserInfo) {
        email = betterAuthUserInfo.email;
      }
    }
  }

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

  let user = await env.graphicsh_oc_db
    .prepare(
      `SELECT user_id, email, write_blocked, total_files, total_storage
       FROM users
       WHERE lower(email) = lower(?)
       LIMIT 1`
    )
    .bind(email)
    .first();

  // Auto-provision user on first verified API call
  if (!user && betterAuthUserInfo) {
    const userId = crypto.randomUUID();
    const displayName = betterAuthUserInfo.name || email.split('@')[0];
    const now = Date.now();

    await env.graphicsh_oc_db
      .prepare(
        `INSERT INTO users (user_id, display_name, email, first_sign_in, last_sign_in)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(userId, displayName, email, now, now)
      .run();

    user = {
      user_id: userId,
      email,
      write_blocked: 0,
      total_files: 0,
      total_storage: 0,
    };
  }

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
