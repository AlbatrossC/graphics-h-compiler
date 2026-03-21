const CONFIG = Object.freeze({
  MAX_GUEST_REQUESTS: 10,
  MAX_USER_REQUESTS: 20,
  RESET_HOURS: 12,
  MIN_REQUEST_GAP_SECONDS: 3,
  MAX_FIX_ATTEMPTS: 2,
  MAX_CODE_LINES: 500,
  MAX_CODE_BYTES: 15_360,
  MAX_QUERY_LENGTH: 2_000,
  MAX_SESSION_ID_LENGTH: 120,
  MAX_ERROR_LENGTH: 4_000,
  RATE_LIMIT_COOLDOWN_MS: 60_000,
  MODEL_FALLBACK: 'gemini-2.5-flash',
});

const SESSION_COOKIE_NAME = 'session';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const SESSION_KEY_CACHE = new Map();

const ALLOWED_ORIGINS = new Set([
  'https://graphics-h-compiler.vercel.app',
  'https://graphics-h-online-compiler-git-test-albatrosscs-projects.vercel.app',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
]);

const SYSTEM_INSTRUCTION = `Turbo C (Borland TC++ 3.0) graphics.h assistant.

# Response Format (STRICT)
Always reply exactly as:

<filename>
Generate a filename based on the code content.
Default extension: .cpp — use .c only if user explicitly says "write in C"
Always starts with ai_ prefix
Descriptive, under 30 characters, lowercase + underscores
</filename>

<chat>
Max 2–3 short lines explanation.
</chat>

<code>
Complete Turbo C program.
</code>

Do not add anything before or after these tags.
<code> must contain ONLY valid C/Turbo C code.

# Core Behavior
- Always generate a Turbo C program using graphics.h
- Never answer in plain text
- Every response must follow the required format

# Request Handling
- For programming / graphics requests, generate a correct Turbo C graphics program that compiles.
- For non-programming requests, still generate a Turbo C graphics program and show a witty message with outtextxy().

# Graphics Initialization
- Always use initgraph(&gd,&gm,"")
- Never use file paths like C:\\TC\\BGI

# Drawing + Code Quality
- Prefer complete, visually clear drawings with meaningful details
- Use correct graphics.h function signatures and integer coordinates only
- Keep code clean, readable, and Turbo C++ 3.0 compatible
- Avoid unsupported modern C++ features`;

function withCors(request) {
  const origin = request.headers.get('Origin');
  const isAllowedOrigin = Boolean(origin && ALLOWED_ORIGINS.has(origin));
  const allowOrigin = !origin ? '*' : isAllowedOrigin ? origin : 'null';
  const allowCredentials = isAllowedOrigin ? 'true' : 'false';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': allowCredentials,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Cookie',
    Vary: 'Origin',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function errorResponse(code, message, status = 400, headers = {}, debug = null) {
  const body = { error: message, code };
  if (debug) {
    body.debug = debug;
  }

  return jsonResponse(body, status, {
    ...headers,
    'X-AI-Error-Code': code,
  });
}

function wantsDebugDetails(request) {
  const value = String(request.headers.get('X-AI-Debug') || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function parseIsoMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCandidateDiagnostics(candidates, nowMs) {
  return candidates.map((candidate) => {
    const rateLimitedUntilMs = parseIsoMs(candidate.status?.rateLimitedUntil);
    const cooldownSeconds =
      rateLimitedUntilMs > nowMs ? Math.max(1, Math.ceil((rateLimitedUntilMs - nowMs) / 1000)) : 0;

    return {
      key_name: candidate.keyName,
      configured: Boolean(candidate.secret),
      is_rate_limited: Boolean(candidate.status?.isRateLimited),
      rate_limited_until: candidate.status?.rateLimitedUntil || null,
      cooldown_seconds: cooldownSeconds,
      total_requests_today: Number(candidate.status?.totalRequestsToday || 0),
      total_errors_today: Number(candidate.status?.totalErrorsToday || 0),
      last_used_at: candidate.status?.lastUsedAt || null,
      last_error: candidate.status?.lastError || null,
    };
  });
}

function computeRetryAfterSeconds(candidates, nowMs) {
  const futureMoments = candidates
    .map((candidate) => parseIsoMs(candidate.status?.rateLimitedUntil))
    .filter((value) => value > nowMs);

  if (!futureMoments.length) {
    return 0;
  }

  return Math.max(1, Math.ceil((Math.min(...futureMoments) - nowMs) / 1000));
}

function buildGeminiDebugPayload(reason, modelName, nowIso, candidates, extra = {}) {
  return {
    worker: 'graphics-oc-ai',
    reason,
    model: modelName,
    timestamp: nowIso,
    keys: buildCandidateDiagnostics(candidates, parseIsoMs(nowIso)),
    ...extra,
  };
}

async function readJsonBody(request) {
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
    if (oldest) SESSION_KEY_CACHE.delete(oldest);
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

function normalizeOptionalString(value, maxLength = 10_000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function validateSessionId(value) {
  const sessionId = normalizeOptionalString(value, CONFIG.MAX_SESSION_ID_LENGTH);
  if (!sessionId) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'session_id is required',
    };
  }
  return sessionId;
}

function validateCodeSize(code, fieldName) {
  const text = typeof code === 'string' ? code : '';
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > CONFIG.MAX_CODE_BYTES) {
    throw {
      statusCode: 413,
      code: 'payload_too_large',
      message: `${fieldName} exceeds ${CONFIG.MAX_CODE_BYTES} bytes`,
    };
  }
  return text;
}

function normalizeFilename(value) {
  if (!value) return '';
  const normalized = normalizeOptionalString(value, 64).toLowerCase();
  if (!normalized) return '';
  if (!/^ai_[a-z0-9_]{1,25}\.(cpp|c)$/.test(normalized)) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'filename must match ai_<name>.cpp or ai_<name>.c',
    };
  }
  return normalized;
}

function validateRequestBody(body) {
  const type = normalizeOptionalString(body.type, 20).toLowerCase();
  if (!['new', 'edit', 'error'].includes(type)) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'type must be new, edit, or error',
    };
  }

  const sessionId = validateSessionId(body.session_id);
  const filename = normalizeFilename(body.filename);

  if (type === 'new') {
    const userQuery = normalizeOptionalString(body.user_query, CONFIG.MAX_QUERY_LENGTH);
    if (!userQuery) {
      throw {
        statusCode: 400,
        code: 'bad_request',
        message: 'user_query is required for new requests',
      };
    }

    return {
      type,
      sessionId,
      filename,
      userQuery,
      currentCode: '',
      generatedCode: '',
      errorMessage: '',
      fixAttempt: 0,
    };
  }

  if (type === 'edit') {
    const userQuery = normalizeOptionalString(body.user_query, CONFIG.MAX_QUERY_LENGTH);
    if (!userQuery) {
      throw {
        statusCode: 400,
        code: 'bad_request',
        message: 'user_query is required for edit requests',
      };
    }

    return {
      type,
      sessionId,
      filename,
      userQuery,
      currentCode: validateCodeSize(body.current_code || '', 'current_code'),
      generatedCode: '',
      errorMessage: '',
      fixAttempt: 0,
    };
  }

  const generatedCode = validateCodeSize(body.generated_code || '', 'generated_code');
  const errorMessage = normalizeOptionalString(body.error, CONFIG.MAX_ERROR_LENGTH);
  const rawFixAttempt = Number.parseInt(body.fix_attempt, 10);
  const fixAttempt = Number.isFinite(rawFixAttempt) ? rawFixAttempt : 0;

  if (!generatedCode) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'generated_code is required for error requests',
    };
  }

  if (!errorMessage) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'error is required for error requests',
    };
  }

  if (fixAttempt < 1 || fixAttempt > CONFIG.MAX_FIX_ATTEMPTS) {
    throw {
      statusCode: 400,
      code: 'MAX_FIX_ATTEMPTS',
      message: `fix_attempt must be between 1 and ${CONFIG.MAX_FIX_ATTEMPTS}`,
    };
  }

  return {
    type,
    sessionId,
    filename,
    userQuery: '',
    currentCode: '',
    generatedCode,
    errorMessage,
    fixAttempt,
  };
}

async function identifyRequest(request, env, body) {
  const sessionSecret = getSessionSecret(env);
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const sessionToken = cookies.get(SESSION_COOKIE_NAME);

  if (sessionSecret && sessionToken) {
    try {
      const session = await verifySessionJwt(sessionToken, sessionSecret);
      const email = String(session.email || '').trim().toLowerCase();
      if (email) {
        return {
          kind: 'user',
          email,
          userName: email,
        };
      }
    } catch {
      // Fall through to guest mode.
    }
  }

  const fingerprintId = normalizeOptionalString(body.fingerprint_id, 200);
  if (!fingerprintId) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'fingerprint_id is required for guest requests',
    };
  }

  return {
    kind: 'guest',
    fingerprintId,
  };
}

function buildPrompt(payload, identity) {
  const audience = identity.kind === 'user' ? 'logged-in user' : 'guest user';
  const header = [
    `Request type: ${payload.type}`,
    `Audience: ${audience}`,
  ];

  if (payload.filename) {
    header.push(`Current filename: ${payload.filename}`);
  }

  if (payload.type === 'new') {
    return `${header.join('\n')}\n\nUser request:\n${payload.userQuery}`;
  }

  if (payload.type === 'edit') {
    const currentCodeBlock = payload.currentCode
      ? `Current code:\n${payload.currentCode}`
      : 'Current code: none. The previous AI draft was rejected or unavailable.';

    return `${header.join('\n')}\n\n${currentCodeBlock}\n\nEdit request:\n${payload.userQuery}\n\nKeep the same filename if this is the same program.`;
  }

  return `${header.join('\n')}\n\nBroken code:\n${payload.generatedCode}\n\nCompiler error:\n${payload.errorMessage}\n\nFix attempt: ${payload.fixAttempt}/${CONFIG.MAX_FIX_ATTEMPTS}\n\nReturn corrected Turbo C code that addresses the compile error while preserving the original idea and filename.`;
}

function stripOuterFences(text) {
  let cleaned = String(text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

function extractTagContent(text, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = regex.exec(text);
  return match ? match[1].trim() : '';
}

function parseGeminiResponse(rawText) {
  const text = stripOuterFences(rawText);
  const filename = normalizeFilename(extractTagContent(text, 'filename'));
  const chat = extractTagContent(text, 'chat');
  const code = extractTagContent(text, 'code');

  if (!filename || !chat || !code) {
    throw {
      statusCode: 502,
      code: 'invalid_ai_response',
      message: 'Gemini response was missing filename, chat, or code tags',
    };
  }

  const codeBytes = new TextEncoder().encode(code).byteLength;
  const codeLines = code.split(/\r?\n/).length;
  if (codeBytes > CONFIG.MAX_CODE_BYTES) {
    throw {
      statusCode: 502,
      code: 'invalid_ai_response',
      message: `Generated code exceeded ${CONFIG.MAX_CODE_BYTES} bytes`,
    };
  }

  if (codeLines > CONFIG.MAX_CODE_LINES) {
    throw {
      statusCode: 502,
      code: 'invalid_ai_response',
      message: `Generated code exceeded ${CONFIG.MAX_CODE_LINES} lines`,
    };
  }

  return {
    filename,
    chat,
    code,
  };
}

async function ensureApiKeyStatusRows(db) {
  // Upsert both rows so they always exist — prevents silent UPDATE failures
  await db
    .prepare(
      `INSERT OR IGNORE INTO api_key_status (key_name, is_rate_limited, total_requests_today, total_errors_today)
       VALUES ('primary', 0, 0, 0)`
    )
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO api_key_status (key_name, is_rate_limited, total_requests_today, total_errors_today)
       VALUES ('secondary', 0, 0, 0)`
    )
    .run();
}

async function clearExpiredRateLimits(db, nowIso) {
  // Clear keys where rate_limited_until has passed
  await db
    .prepare(
      `UPDATE api_key_status
       SET is_rate_limited = 0,
           rate_limited_until = NULL
       WHERE is_rate_limited = 1
         AND rate_limited_until IS NOT NULL
         AND rate_limited_until <= ?`
    )
    .bind(nowIso)
    .run();

  // Also clear keys that are stuck with is_rate_limited=1 but no rate_limited_until timestamp
  // This can happen if a previous deploy had a bug — without this they'd be stuck forever
  await db
    .prepare(
      `UPDATE api_key_status
       SET is_rate_limited = 0
       WHERE is_rate_limited = 1
         AND rate_limited_until IS NULL`
    )
    .run();
}

async function getKeyStatuses(db) {
  const result = await db
    .prepare(
      `SELECT key_name, is_rate_limited, rate_limited_until, total_requests_today,
              total_errors_today, last_used_at, last_error
       FROM api_key_status
       WHERE key_name IN ('primary', 'secondary')`
    )
    .all();

  const map = new Map();
  for (const row of result.results || []) {
    map.set(row.key_name, {
      keyName: row.key_name,
      isRateLimited: Number(row.is_rate_limited || 0) === 1,
      rateLimitedUntil: row.rate_limited_until || null,
      totalRequestsToday: Number(row.total_requests_today || 0),
      totalErrorsToday: Number(row.total_errors_today || 0),
      lastUsedAt: row.last_used_at || null,
      lastError: row.last_error || null,
    });
  }

  return map;
}

async function markKeyRateLimited(db, keyName, nowMs, message) {
  const untilIso = new Date(nowMs + CONFIG.RATE_LIMIT_COOLDOWN_MS).toISOString();
  await db
    .prepare(
      `UPDATE api_key_status
       SET is_rate_limited = 1,
           rate_limited_until = ?,
           total_errors_today = COALESCE(total_errors_today, 0) + 1,
           last_error = ?,
           last_used_at = ?
       WHERE key_name = ?`
    )
    .bind(untilIso, message || '429 rate limited', new Date(nowMs).toISOString(), keyName)
    .run();
}

async function markKeyError(db, keyName, nowIso, message) {
  await db
    .prepare(
      `UPDATE api_key_status
       SET total_errors_today = COALESCE(total_errors_today, 0) + 1,
           last_error = ?,
           last_used_at = ?
       WHERE key_name = ?`
    )
    .bind(message || 'Unknown Gemini error', nowIso, keyName)
    .run();
}

async function markKeySuccess(db, keyName, nowIso) {
  await db
    .prepare(
      `UPDATE api_key_status
       SET is_rate_limited = 0,
           rate_limited_until = NULL,
           total_requests_today = COALESCE(total_requests_today, 0) + 1,
           last_error = NULL,
           last_used_at = ?
       WHERE key_name = ?`
    )
    .bind(nowIso, keyName)
    .run();
}

function extractGeminiText(responseJson) {
  const candidates = Array.isArray(responseJson?.candidates) ? responseJson.candidates : [];
  const firstCandidate = candidates[0];
  const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
}

function extractUsage(responseJson) {
  const usage = responseJson?.usageMetadata || {};
  return {
    inputTokens: Number(usage.promptTokenCount || 0),
    outputTokens: Number(usage.candidatesTokenCount || 0),
  };
}

async function callGeminiOnce(apiKey, modelName, prompt) {
  const response = await fetch(`${GEMINI_API_BASE}/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.45,
        topP: 0.9,
      },
    }),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    text,
  };
}

async function callGeminiWithFailover(env, prompt, nowIso, options = {}) {
  const db = env.graphicsh_ai_db;
  const nowMs = Date.now();
  const includeDebug = options.includeDebug === true;
  await ensureApiKeyStatusRows(db);
  await clearExpiredRateLimits(db, nowIso);
  const statuses = await getKeyStatuses(db);
  const modelName = env.GEMINI_MODEL || CONFIG.MODEL_FALLBACK;

  const candidates = [
    { keyName: 'primary', secret: env.PRIMARY_KEY, status: statuses.get('primary') },
    { keyName: 'secondary', secret: env.SECONDARY_KEY, status: statuses.get('secondary') },
  ].filter((item) => item.secret);

  if (!candidates.length) {
    throw {
      statusCode: 500,
      code: 'server_error',
      message: 'PRIMARY_KEY or SECONDARY_KEY is not configured',
      debug: includeDebug
        ? buildGeminiDebugPayload('missing_api_keys', modelName, nowIso, [
            { keyName: 'primary', secret: env.PRIMARY_KEY, status: statuses.get('primary') },
            { keyName: 'secondary', secret: env.SECONDARY_KEY, status: statuses.get('secondary') },
          ])
        : null,
    };
  }

  let attempted = false;
  let lastNonRateError = null;

  for (const candidate of candidates) {
    if (candidate.status?.isRateLimited) {
      continue;
    }

    attempted = true;
    let gemini;
    try {
      gemini = await callGeminiOnce(candidate.secret, modelName, prompt);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Gemini request failed';
      await markKeyError(db, candidate.keyName, nowIso, errorMessage);
      lastNonRateError = {
        statusCode: 502,
        code: 'upstream_error',
        message: errorMessage,
        debug: includeDebug
          ? buildGeminiDebugPayload('gemini_fetch_failed', modelName, nowIso, candidates, {
              key_name: candidate.keyName,
            })
          : null,
      };
      break;
    }

    if (gemini.status === 429) {
      await markKeyRateLimited(db, candidate.keyName, nowMs, 'Gemini returned 429');
      continue;
    }

    if (!gemini.ok) {
      const errorMessage = gemini.data?.error?.message || gemini.text || `Gemini returned HTTP ${gemini.status}`;
      await markKeyError(db, candidate.keyName, nowIso, errorMessage);
      lastNonRateError = {
        statusCode: 502,
        code: 'upstream_error',
        message: errorMessage,
        debug: includeDebug
          ? buildGeminiDebugPayload('gemini_non_429_error', modelName, nowIso, candidates, {
              key_name: candidate.keyName,
              upstream_status: gemini.status,
            })
          : null,
      };
      break;
    }

    const outputText = extractGeminiText(gemini.data);
    if (!outputText) {
      await markKeyError(db, candidate.keyName, nowIso, 'Gemini returned an empty candidate');
      throw {
        statusCode: 502,
        code: 'invalid_ai_response',
        message: 'Gemini returned an empty response',
      };
    }

    await markKeySuccess(db, candidate.keyName, nowIso);
    return {
      keyName: candidate.keyName,
      text: outputText,
      usage: extractUsage(gemini.data),
    };
  }

  if (lastNonRateError) {
    throw lastNonRateError;
  }

  const retryAfterSeconds = computeRetryAfterSeconds(candidates, nowMs);
  const apiDownDebug = includeDebug
    ? buildGeminiDebugPayload('all_keys_rate_limited', modelName, nowIso, candidates, {
        retry_after_seconds: retryAfterSeconds || CONFIG.MIN_REQUEST_GAP_SECONDS,
      })
    : null;

  if (!attempted) {
    throw {
      statusCode: 503,
      code: 'API_DOWN',
      message: 'AI is temporarily busy. Try again in a minute.',
      headers: retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined,
      debug: apiDownDebug,
    };
  }

  throw {
    statusCode: 503,
    code: 'API_DOWN',
    message: 'AI is temporarily busy. Try again in a minute.',
    headers: retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined,
    debug: apiDownDebug,
  };
}

function parseDateMs(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRemainingWindow(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function evaluateRateLimit(row, maxRequests, nowMs, nowIso) {
  const windowStartMs = parseDateMs(row.window_start);
  const lastRequestMs = parseDateMs(row.last_request_at);
  const resetMs = CONFIG.RESET_HOURS * 60 * 60 * 1000;

  let windowRequests = Number(row.window_requests || 0);
  let effectiveWindowStartIso = row.window_start || nowIso;
  let effectiveWindowStartMs = windowStartMs || nowMs;

  if (!effectiveWindowStartMs || nowMs - effectiveWindowStartMs >= resetMs) {
    windowRequests = 0;
    effectiveWindowStartIso = nowIso;
    effectiveWindowStartMs = nowMs;
  }

  if (windowRequests >= maxRequests) {
    const remainingMs = Math.max(0, resetMs - (nowMs - effectiveWindowStartMs));
    return {
      allowed: false,
      code: 'LIMIT_REACHED',
      message: `${maxRequests}/${maxRequests} limit reached. Resets in ${formatRemainingWindow(remainingMs)}.`,
    };
  }

  if (lastRequestMs && nowMs - lastRequestMs < CONFIG.MIN_REQUEST_GAP_SECONDS * 1000) {
    const remainingSeconds = Math.max(
      1,
      Math.ceil((CONFIG.MIN_REQUEST_GAP_SECONDS * 1000 - (nowMs - lastRequestMs)) / 1000)
    );
    return {
      allowed: false,
      code: 'COOLDOWN',
      message: `Please wait ${remainingSeconds}s before sending another request.`,
    };
  }

  return {
    allowed: true,
    nextWindowRequests: windowRequests + 1,
    nextTotalRequests: Number(row.total_requests || 0) + 1,
    nextWindowStartIso: effectiveWindowStartIso,
  };
}

async function getOrCreateGuest(env, fingerprintId, nowIso) {
  const db = env.graphicsh_ai_db;
  let row = await db
    .prepare(
      `SELECT id, fingerprint_id, total_requests, window_requests, window_start, last_request_at
       FROM guest_info
       WHERE fingerprint_id = ?
       LIMIT 1`
    )
    .bind(fingerprintId)
    .first();

  if (!row) {
    const id = `gi_${crypto.randomUUID()}`;
    await db
      .prepare(
        `INSERT INTO guest_info (id, fingerprint_id, total_requests, window_requests, window_start, last_request_at)
         VALUES (?, ?, 0, 0, ?, NULL)`
      )
      .bind(id, fingerprintId, nowIso)
      .run();
    row = {
      id,
      fingerprint_id: fingerprintId,
      total_requests: 0,
      window_requests: 0,
      window_start: nowIso,
      last_request_at: null,
    };
  }

  return row;
}

async function getOrCreateLoggedUser(env, email, userName, nowIso) {
  const db = env.graphicsh_ai_db;
  let row = await db
    .prepare(
      `SELECT id, user_email, user_name, total_requests, window_requests, window_start, last_request_at
       FROM logged_users
       WHERE lower(user_email) = lower(?)
       LIMIT 1`
    )
    .bind(email)
    .first();

  if (!row) {
    const id = `lu_${crypto.randomUUID()}`;
    await db
      .prepare(
        `INSERT INTO logged_users (id, user_email, user_name, total_requests, window_requests, window_start, last_request_at)
         VALUES (?, ?, ?, 0, 0, ?, NULL)`
      )
      .bind(id, email, userName || email, nowIso)
      .run();
    row = {
      id,
      user_email: email,
      user_name: userName || email,
      total_requests: 0,
      window_requests: 0,
      window_start: nowIso,
      last_request_at: null,
    };
  }

  return row;
}

async function getNextVersion(env, identity, sessionId) {
  const db = env.graphicsh_ai_db;
  const table = identity.kind === 'user' ? 'logged_sessions' : 'guest_logs';
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE session_id = ?`)
    .bind(sessionId)
    .first();

  return `v${Number(row?.count || 0) + 1}`;
}

function buildSessionTitle(query) {
  const source = String(query || '').trim();
  if (!source) return 'AI Session';
  return source.length > 60 ? `${source.slice(0, 57)}...` : source;
}

async function resolveLoggedSessionTitle(env, sessionId, requestType, userEmail, userQuery) {
  if (requestType === 'new') {
    return buildSessionTitle(userQuery);
  }

  const row = await env.graphicsh_ai_db
    .prepare(
      `SELECT session_title, user_query
       FROM logged_sessions
       WHERE user_email = ?
         AND session_id = ?
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .bind(userEmail, sessionId)
    .first();

  return row?.session_title || buildSessionTitle(row?.user_query || userQuery);
}

async function updateSubjectUsage(env, identity, rowId, rateState, nowIso) {
  const db = env.graphicsh_ai_db;
  if (identity.kind === 'user') {
    await db
      .prepare(
        `UPDATE logged_users
         SET total_requests = ?,
             window_requests = ?,
             window_start = ?,
             last_request_at = ?
         WHERE id = ?`
      )
      .bind(
        rateState.nextTotalRequests,
        rateState.nextWindowRequests,
        rateState.nextWindowStartIso,
        nowIso,
        rowId
      )
      .run();
    return;
  }

  await db
    .prepare(
      `UPDATE guest_info
       SET total_requests = ?,
           window_requests = ?,
           window_start = ?,
           last_request_at = ?
       WHERE id = ?`
    )
    .bind(
      rateState.nextTotalRequests,
      rateState.nextWindowRequests,
      rateState.nextWindowStartIso,
      nowIso,
      rowId
    )
    .run();
}

async function countRequestsToday(env, identity, nowDate) {
  const db = env.graphicsh_ai_db;
  if (identity.kind === 'user') {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM logged_sessions
         WHERE user_email = ?
           AND substr(created_at, 1, 10) = ?`
      )
      .bind(identity.email, nowDate)
      .first();
    return Number(row?.count || 0);
  }

  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM guest_logs
       WHERE fingerprint_id = ?
         AND substr(created_at, 1, 10) = ?`
    )
    .bind(identity.fingerprintId, nowDate)
    .first();
  return Number(row?.count || 0);
}

async function insertRequestLog(env, identity, payload, aiResult, version, nowIso) {
  const db = env.graphicsh_ai_db;
  const requestId = `${identity.kind === 'user' ? 'ls' : 'gl'}_${crypto.randomUUID()}`;

  if (identity.kind === 'user') {
    const sessionTitle = await resolveLoggedSessionTitle(
      env,
      payload.sessionId,
      payload.type,
      identity.email,
      payload.userQuery
    );

    await db
      .prepare(
        `INSERT INTO logged_sessions (
           id, user_email, session_id, session_title, version, request_type, user_query,
           generated_code, generated_filename, chat_response, error_message, fix_attempt,
           api_key_used, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        requestId,
        identity.email,
        payload.sessionId,
        sessionTitle,
        version,
        payload.type,
        payload.userQuery || '',
        aiResult.code,
        aiResult.filename,
        aiResult.chat,
        payload.errorMessage || null,
        payload.fixAttempt || 0,
        aiResult.apiKeyUsed,
        nowIso
      )
      .run();

    return requestId;
  }

  await db
    .prepare(
      `INSERT INTO guest_logs (
         id, session_id, fingerprint_id, version, request_type, user_query,
         generated_code, generated_filename, chat_response, error_message, fix_attempt,
         api_key_used, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      requestId,
      payload.sessionId,
      identity.fingerprintId,
      version,
      payload.type,
      payload.userQuery || '',
      aiResult.code,
      aiResult.filename,
      aiResult.chat,
      payload.errorMessage || null,
      payload.fixAttempt || 0,
      aiResult.apiKeyUsed,
      nowIso
    )
    .run();

  return requestId;
}

async function updateDailyUsage(env, identity, payload, aiResult, nowDate, nowIso, isFirstToday) {
  const db = env.graphicsh_ai_db;
  const guestInc = identity.kind === 'guest' ? 1 : 0;
  const userInc = identity.kind === 'user' ? 1 : 0;
  const errorInc = payload.type === 'error' ? 1 : 0;
  const primaryInc = aiResult.apiKeyUsed === 'primary' ? 1 : 0;
  const secondaryInc = aiResult.apiKeyUsed === 'secondary' ? 1 : 0;
  const uniqueGuestInc = identity.kind === 'guest' && isFirstToday ? 1 : 0;
  const uniqueUserInc = identity.kind === 'user' && isFirstToday ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO daily_usage (
         date, total_requests, guest_requests, user_requests, error_requests,
         primary_key_calls, secondary_key_calls, total_input_tokens, total_output_tokens,
         unique_guests, unique_users, last_request_at
       )
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         total_requests = COALESCE(daily_usage.total_requests, 0) + 1,
         guest_requests = COALESCE(daily_usage.guest_requests, 0) + excluded.guest_requests,
         user_requests = COALESCE(daily_usage.user_requests, 0) + excluded.user_requests,
         error_requests = COALESCE(daily_usage.error_requests, 0) + excluded.error_requests,
         primary_key_calls = COALESCE(daily_usage.primary_key_calls, 0) + excluded.primary_key_calls,
         secondary_key_calls = COALESCE(daily_usage.secondary_key_calls, 0) + excluded.secondary_key_calls,
         total_input_tokens = COALESCE(daily_usage.total_input_tokens, 0) + excluded.total_input_tokens,
         total_output_tokens = COALESCE(daily_usage.total_output_tokens, 0) + excluded.total_output_tokens,
         unique_guests = COALESCE(daily_usage.unique_guests, 0) + excluded.unique_guests,
         unique_users = COALESCE(daily_usage.unique_users, 0) + excluded.unique_users,
         last_request_at = excluded.last_request_at`
    )
    .bind(
      nowDate,
      guestInc,
      userInc,
      errorInc,
      primaryInc,
      secondaryInc,
      aiResult.inputTokens,
      aiResult.outputTokens,
      uniqueGuestInc,
      uniqueUserInc,
      nowIso
    )
    .run();
}

async function processAiRequest(request, env, corsHeaders) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const nowDate = nowIso.slice(0, 10);
  const includeDebug = wantsDebugDetails(request);

  const rawBody = await readJsonBody(request);
  const payload = validateRequestBody(rawBody);
  const identity = await identifyRequest(request, env, rawBody);

  const subjectRow =
    identity.kind === 'user'
      ? await getOrCreateLoggedUser(env, identity.email, identity.userName, nowIso)
      : await getOrCreateGuest(env, identity.fingerprintId, nowIso);

  const rateState = evaluateRateLimit(
    subjectRow,
    identity.kind === 'user' ? CONFIG.MAX_USER_REQUESTS : CONFIG.MAX_GUEST_REQUESTS,
    nowMs,
    nowIso
  );

  if (!rateState.allowed) {
    const limitMessage =
      identity.kind === 'user'
        ? `Signed-in ${rateState.message}`
        : `Free ${rateState.message}`;
    return errorResponse(rateState.code, limitMessage, 429, corsHeaders);
  }

  const prompt = buildPrompt(payload, identity);
  const gemini = await callGeminiWithFailover(env, prompt, nowIso, { includeDebug });
  const parsed = parseGeminiResponse(gemini.text);
  const version = await getNextVersion(env, identity, payload.sessionId);

  const aiResult = {
    ...parsed,
    apiKeyUsed: gemini.keyName,
    inputTokens: gemini.usage.inputTokens,
    outputTokens: gemini.usage.outputTokens,
  };

  const isFirstToday = (await countRequestsToday(env, identity, nowDate)) === 0;
  const requestId = await insertRequestLog(env, identity, payload, aiResult, version, nowIso);
  await updateSubjectUsage(env, identity, subjectRow.id, rateState, nowIso);
  await updateDailyUsage(env, identity, payload, aiResult, nowDate, nowIso, isFirstToday);

  const responseBody = {
    generated_code: aiResult.code,
    chat: aiResult.chat,
    session_id: payload.sessionId,
    version,
    request_id: requestId,
  };

  if (identity.kind === 'user') {
    responseBody.filename = aiResult.filename;
  }

  return jsonResponse(responseBody, 200, corsHeaders);
}

async function processActionRequest(request, env, corsHeaders) {
  const body = await readJsonBody(request);
  const requestId = normalizeOptionalString(body.request_id, 80);
  const action = normalizeOptionalString(body.action, 20).toLowerCase();

  if (!requestId) {
    return errorResponse('bad_request', 'request_id is required', 400, corsHeaders);
  }

  if (!['apply', 'reject', 'force_apply'].includes(action)) {
    return errorResponse('bad_request', 'action must be apply, reject, or force_apply', 400, corsHeaders);
  }

  const identity = await (async () => {
    try {
      return await identifyRequest(request, env, body);
    } catch {
      return { kind: 'guest', fingerprintId: '' };
    }
  })();

  const db = env.graphicsh_ai_db;
  let updated = false;

  if (identity.kind === 'user') {
    const result = await db
      .prepare(
        `UPDATE logged_sessions
         SET user_action = ?
         WHERE id = ?
           AND user_email = ?`
      )
      .bind(action, requestId, identity.email)
      .run();
    updated = Number(result.meta?.changes || 0) > 0;
  } else {
    const result = await db
      .prepare(
        `UPDATE guest_logs
         SET user_action = ?
         WHERE id = ?`
      )
      .bind(action, requestId)
      .run();
    updated = Number(result.meta?.changes || 0) > 0;
  }

  if (!updated) {
    return errorResponse('not_found', 'Request not found', 404, corsHeaders);
  }

  return jsonResponse({ success: true, request_id: requestId, action }, 200, corsHeaders);
}

export default {
  async fetch(request, env) {
    const corsHeaders = withCors(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const method = request.method.toUpperCase();

      if (method === 'GET' && pathname === '/health') {
        return jsonResponse({ ok: true, worker: 'graphics-oc-ai' }, 200, corsHeaders);
      }

      if (method === 'POST' && pathname === '/api/ai') {
        return await processAiRequest(request, env, corsHeaders);
      }

      if (method === 'PATCH' && pathname === '/api/ai/action') {
        return await processActionRequest(request, env, corsHeaders);
      }

      // Admin: reset both API key rate-limit flags in D1
      // GET /admin/reset-keys — clears is_rate_limited for both primary and secondary
      if (method === 'GET' && pathname === '/admin/reset-keys') {
        const db = env.graphicsh_ai_db;
        await db
          .prepare(
            `UPDATE api_key_status
             SET is_rate_limited = 0,
                 rate_limited_until = NULL,
                 last_error = NULL
             WHERE key_name IN ('primary', 'secondary')`
          )
          .run();
        const statuses = await getKeyStatuses(db);
        return jsonResponse({
          ok: true,
          message: 'API key rate limits cleared',
          keys: [
            statuses.get('primary') || { keyName: 'primary', isRateLimited: false },
            statuses.get('secondary') || { keyName: 'secondary', isRateLimited: false },
          ],
        }, 200, corsHeaders);
      }

      return errorResponse('not_found', 'Route not found', 404, corsHeaders);
    } catch (error) {
      if (error?.statusCode) {
        return errorResponse(
          error.code || 'error',
          error.message,
          error.statusCode,
          {
            ...corsHeaders,
            ...(error.headers || {}),
          },
          error.debug || null
        );
      }

      return errorResponse('internal_error', 'Internal server error', 500, corsHeaders);
    }
  },
};
