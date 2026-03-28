import FIX_SYSTEM_INSTRUCTION from '../fix-system-instruction.md';
import { CONFIG, GEMINI_API_BASE } from './config.js';
import { jsonResponse, errorResponse, wantsDebugDetails } from './cors.js';
import { identifyRequest } from './auth.js';
import { readJsonBody, normalizeOptionalString } from './validate.js';
import { evaluateRateLimit } from './rateLimit.js';
import { getOrCreateGuest, getOrCreateLoggedUser } from './db.js';

// ─── Validation ───────────────────────────────────────────────────────────────

function validateFixBody(body) {
  const editorCode = normalizeOptionalString(body.editor_code, CONFIG.MAX_CODE_BYTES);
  const error = normalizeOptionalString(body.error, CONFIG.MAX_ERROR_LENGTH);
  const rawAttempt = Number.parseInt(body.fix_attempt, 10);
  const fixAttempt = Number.isFinite(rawAttempt) ? rawAttempt : 1;

  if (!editorCode) {
    throw { statusCode: 400, code: 'bad_request', message: 'editor_code is required' };
  }
  if (!error) {
    throw { statusCode: 400, code: 'bad_request', message: 'error is required' };
  }
  if (fixAttempt < 1 || fixAttempt > CONFIG.MAX_FIX_BUTTON_ATTEMPTS) {
    throw {
      statusCode: 400,
      code: 'FIX_ATTEMPTS_EXCEEDED',
      message: `fix_attempt must be between 1 and ${CONFIG.MAX_FIX_BUTTON_ATTEMPTS}`,
    };
  }

  return { editorCode, error, fixAttempt };
}

// ─── Gemini call (fix-specific, no filename) ──────────────────────────────────

async function callGeminiForFix(env, editorCode, error, fixAttempt) {
  const modelName = env.GEMINI_MODEL || CONFIG.MODEL_FALLBACK;
  const prompt = `Fix attempt: ${fixAttempt}/${CONFIG.MAX_FIX_BUTTON_ATTEMPTS}\n\nBroken code:\n${editorCode}\n\nCompiler error:\n${error}`;

  const candidates = [
    { keyName: 'primary', secret: env.PRIMARY_KEY },
    { keyName: 'secondary', secret: env.SECONDARY_KEY },
    { keyName: 'tertiary', secret: env.TERTIARY_KEY },
  ].filter((c) => c.secret);

  if (!candidates.length) {
    throw { statusCode: 500, code: 'server_error', message: 'No Gemini API keys configured' };
  }

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50_000);

    let response;
    try {
      response = await fetch(
        `${GEMINI_API_BASE}/${modelName}:generateContent?key=${encodeURIComponent(candidate.secret)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: FIX_SYSTEM_INSTRUCTION }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, topP: 0.85 },
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) continue;

    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }

    if (!response.ok) {
      throw {
        statusCode: 502,
        code: 'upstream_error',
        message: data?.error?.message || `Gemini returned HTTP ${response.status}`,
      };
    }

    const candidates2 = data?.candidates || [];
    const parts = candidates2[0]?.content?.parts || [];
    const outputText = parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('\n').trim();

    if (!outputText) {
      throw { statusCode: 502, code: 'invalid_ai_response', message: 'Gemini returned empty response' };
    }

    const usage = data?.usageMetadata || {};
    return {
      keyName: candidate.keyName,
      text: outputText,
      inputTokens: Number(usage.promptTokenCount || 0),
      outputTokens: Number(usage.candidatesTokenCount || 0),
    };
  }

  throw { statusCode: 503, code: 'API_DOWN', message: 'AI is temporarily busy. Try again in a minute.' };
}

// ─── Response parsing (no filename needed for fix) ────────────────────────────

function parseFixResponse(rawText) {
  const text = String(rawText || '').trim();

  const chatMatch = /<chat>([\s\S]*?)<\/chat>/i.exec(text);
  const codeMatch = /<code>([\s\S]*?)<\/code>/i.exec(text);

  let chat = chatMatch ? chatMatch[1].trim() : '';
  let code = codeMatch ? codeMatch[1].trim() : '';

  if (!code) {
    // Fallback: markdown fence
    const fenced = text.match(/```(?:cpp|c|c\+\+)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) code = fenced[1].trim();
  }

  if (!code) {
    const idx = text.search(/#include\s*[<"]/i);
    if (idx >= 0) code = text.slice(idx).trim();
  }

  if (!chat) {
    chat = 'Fixed the compilation errors.';
  }

  if (!code) {
    throw { statusCode: 502, code: 'invalid_ai_response', message: 'AI could not produce fixed code' };
  }

  return { chat, fixed_code: code };
}

// ─── DB: fixes table ──────────────────────────────────────────────────────────

async function insertFixLog(env, identity, editorCode, error, fixAttempt, fixResult, nowIso) {
  const db = env.graphicsh_ai_db;
  const id = `fix_${crypto.randomUUID()}`;
  const fingerprintId = identity.kind === 'guest' ? identity.fingerprintId : null;
  const userEmail = identity.kind === 'user' ? identity.email : null;

  await db
    .prepare(
      `INSERT INTO fixes (
         id, fingerprint_id, user_email,
         editor_code, error, fixed_code, fix_attempt,
         api_key_used, input_tokens, output_tokens,
         created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      fingerprintId,
      userEmail,
      editorCode,
      error,
      fixResult.fixed_code,
      fixAttempt,
      fixResult.keyName,
      fixResult.inputTokens,
      fixResult.outputTokens,
      nowIso
    )
    .run();

  return id;
}

async function updateFixRateUsage(env, identity, subjectRowId, rateState, nowIso) {
  const db = env.graphicsh_ai_db;
  if (identity.kind === 'user') {
    await db
      .prepare(
        `UPDATE logged_users
         SET fix_window_requests = ?,
             fix_window_start = ?,
             last_request_at = ?
         WHERE id = ?`
      )
      .bind(rateState.nextWindowRequests, rateState.nextWindowStartIso, nowIso, subjectRowId)
      .run();
    return;
  }
  await db
    .prepare(
      `UPDATE guest_info
       SET fix_window_requests = ?,
           fix_window_start = ?,
           last_request_at = ?
       WHERE id = ?`
    )
    .bind(rateState.nextWindowRequests, rateState.nextWindowStartIso, nowIso, subjectRowId)
    .run();
}

function evaluateFixRateLimit(row, maxRequests, nowMs, nowIso) {
  const { parseDateMs, formatRemainingWindow } = (() => {
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
    return { parseDateMs, formatRemainingWindow };
  })();

  const resetMs = CONFIG.RESET_HOURS * 60 * 60 * 1000;
  const windowStartMs = parseDateMs(row.fix_window_start);
  let windowRequests = Number(row.fix_window_requests || 0);
  let effectiveWindowStartIso = row.fix_window_start || nowIso;
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
      message: `Too many errors — you've hit the fix limit (${maxRequests}/${maxRequests}). Cool down and try again in ${formatRemainingWindow(remainingMs)}.`,
    };
  }

  return {
    allowed: true,
    nextWindowRequests: windowRequests + 1,
    nextWindowStartIso: effectiveWindowStartIso,
    remaining: maxRequests - windowRequests - 1,
    max: maxRequests,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function processFixRequest(request, env, ctx, corsHeaders) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);

  const rawBody = await readJsonBody(request);
  const { editorCode, error, fixAttempt } = validateFixBody(rawBody);
  const identity = await identifyRequest(request, env, rawBody, {
    includeDebug: wantsDebugDetails(request),
  });

  const subjectRow =
    identity.kind === 'user'
      ? await getOrCreateLoggedUser(env, identity.email, identity.userName, nowIso)
      : await getOrCreateGuest(env, identity.fingerprintId, nowIso);

  const maxRequests =
    identity.kind === 'user' ? CONFIG.MAX_FIX_USER_REQUESTS : CONFIG.MAX_FIX_GUEST_REQUESTS;
  const rateState = evaluateFixRateLimit(subjectRow, maxRequests, nowMs, nowIso);

  if (!rateState.allowed) {
    return errorResponse(rateState.code, rateState.message, 429, corsHeaders);
  }

  const gemini = await callGeminiForFix(env, editorCode, error, fixAttempt);
  const parsed = parseFixResponse(gemini.text);

  const fixResult = {
    ...parsed,
    keyName: gemini.keyName,
    inputTokens: gemini.inputTokens,
    outputTokens: gemini.outputTokens,
  };

  const fixId = await insertFixLog(env, identity, editorCode, error, fixAttempt, fixResult, nowIso);

  ctx.waitUntil(
    updateFixRateUsage(env, identity, subjectRow.id, rateState, nowIso)
      .catch((err) => console.error('[Fix] Rate usage update failed', err))
  );

  return jsonResponse(
    {
      fixed_code: fixResult.fixed_code,
      chat: fixResult.chat,
      fix_id: fixId,
      fix_attempt: fixAttempt,
      rate_limit: {
        remaining: rateState.remaining,
        max: rateState.max,
      },
    },
    200,
    corsHeaders
  );
}
