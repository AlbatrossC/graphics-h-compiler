import { CONFIG } from './config.js';
import { jsonResponse, errorResponse, wantsDebugDetails } from './cors.js';
import { identifyRequest, identifyFromCookieOnly } from './auth.js';
import { readJsonBody, validateRequestBody, normalizeOptionalString } from './validate.js';
import { buildPrompt, callGeminiWithFailover, parseGeminiResponse } from './gemini.js';
import { evaluateRateLimit } from './rateLimit.js';
import {
  getOrCreateGuest,
  getOrCreateLoggedUser,
  getNextVersion,
  insertRequestLog,
  runPostResponseWrites,
} from './db.js';

export async function processAiRequest(request, env, ctx, corsHeaders) {
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const nowDate = nowIso.slice(0, 10);
  const includeDebug = wantsDebugDetails(request);

  const rawBody = await readJsonBody(request);
  const payload = validateRequestBody(rawBody);
  const identity = await identifyRequest(request, env, rawBody, { includeDebug });

  const subjectRow =
    identity.kind === 'user'
      ? await getOrCreateLoggedUser(env, identity.email, identity.userName, nowIso)
      : await getOrCreateGuest(env, identity.fingerprintId, nowIso);

  const maxRequests = identity.kind === 'user' ? CONFIG.MAX_USER_REQUESTS : CONFIG.MAX_GUEST_REQUESTS;
  const rateState = evaluateRateLimit(subjectRow, maxRequests, nowMs, nowIso);

  if (!rateState.allowed) {
    const limitMessage =
      identity.kind === 'user'
        ? `Signed-in ${rateState.message}`
        : `Free ${rateState.message}`;
    return errorResponse(rateState.code, limitMessage, 429, corsHeaders);
  }

  const prompt = buildPrompt(payload, identity);
  const gemini = await callGeminiWithFailover(env, prompt, nowIso, { includeDebug });
  const parsed = parseGeminiResponse(gemini.text, {
    requestedFilename: payload.filename,
    currentFilename: payload.filename,
  });
  const version = await getNextVersion(env, identity, payload.sessionId);

  const aiResult = {
    ...parsed,
    apiKeyUsed: gemini.keyName,
    inputTokens: gemini.usage.inputTokens,
    outputTokens: gemini.usage.outputTokens,
  };

  // Critical write — must complete before we return the request_id
  const requestId = await insertRequestLog(env, identity, payload, aiResult, version, nowIso);

  // Non-critical writes — fire after response is sent
  ctx.waitUntil(
    runPostResponseWrites(env, identity, subjectRow.id, rateState, payload, aiResult, nowDate, nowIso)
      .catch((err) => console.error('[AI] Post-response DB writes failed', err))
  );

  const responseBody = {
    generated_code: aiResult.code,
    chat: aiResult.chat,
    session_id: payload.sessionId,
    version,
    request_id: requestId,
    rate_limit: {
      remaining: rateState.remaining,
      max: rateState.max,
    },
  };

  if (identity.kind === 'user') {
    responseBody.filename = aiResult.filename;
  }

  return jsonResponse(responseBody, 200, corsHeaders);
}

export async function processActionRequest(request, env, corsHeaders) {
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
      return await identifyRequest(request, env, body, {
        includeDebug: wantsDebugDetails(request),
      });
    } catch {
      return { kind: 'guest', fingerprintId: normalizeOptionalString(body.fingerprint_id, 200) };
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
    // Require fingerprint_id to prevent one guest updating another's action
    if (!identity.fingerprintId) {
      return errorResponse('bad_request', 'fingerprint_id is required', 400, corsHeaders);
    }
    const result = await db
      .prepare(
        `UPDATE guest_logs
         SET user_action = ?
         WHERE id = ?
           AND fingerprint_id = ?`
      )
      .bind(action, requestId, identity.fingerprintId)
      .run();
    updated = Number(result.meta?.changes || 0) > 0;
  }

  if (!updated) {
    return errorResponse('not_found', 'Request not found', 404, corsHeaders);
  }

  return jsonResponse({ success: true, request_id: requestId, action }, 200, corsHeaders);
}

export async function processSessionsRequest(request, env, corsHeaders) {
  const identity = await identifyFromCookieOnly(request, env, {
    includeDebug: wantsDebugDetails(request),
  });
  if (identity.kind !== 'user') {
    return errorResponse('unauthorized', 'Session history requires a valid login', 401, corsHeaders);
  }

  const db = env.graphicsh_ai_db;
  const result = await db
    .prepare(
      `SELECT session_id, session_title,
              MIN(created_at) as started,
              MAX(created_at) as last_active,
              COUNT(*) as messages
       FROM logged_sessions
       WHERE user_email = ?
       GROUP BY session_id
       ORDER BY last_active DESC
       LIMIT 20`
    )
    .bind(identity.email)
    .all();

  return jsonResponse({ sessions: result.results || [] }, 200, corsHeaders);
}

export async function processSessionMessagesRequest(request, env, corsHeaders, sessionId) {
  if (!sessionId || sessionId.length > CONFIG.MAX_SESSION_ID_LENGTH) {
    return errorResponse('bad_request', 'Invalid session ID', 400, corsHeaders);
  }

  const identity = await identifyFromCookieOnly(request, env, {
    includeDebug: wantsDebugDetails(request),
  });
  if (identity.kind !== 'user') {
    return errorResponse('unauthorized', 'Session history requires a valid login', 401, corsHeaders);
  }

  const db = env.graphicsh_ai_db;
  const result = await db
    .prepare(
      `SELECT version, request_type, user_query, chat_response, generated_code, generated_filename, fix_attempt, created_at
       FROM logged_sessions
       WHERE user_email = ? AND session_id = ?
       ORDER BY created_at ASC`
    )
    .bind(identity.email, sessionId)
    .all();

  return jsonResponse({ messages: result.results || [] }, 200, corsHeaders);
}

export async function processDeleteSessionRequest(request, env, corsHeaders, sessionId) {
  if (!sessionId || sessionId.length > CONFIG.MAX_SESSION_ID_LENGTH) {
    return errorResponse('bad_request', 'Invalid session ID', 400, corsHeaders);
  }

  const identity = await identifyFromCookieOnly(request, env, {
    includeDebug: wantsDebugDetails(request),
  });
  if (identity.kind !== 'user') {
    return errorResponse('unauthorized', 'Deleting sessions requires a valid login', 401, corsHeaders);
  }

  const db = env.graphicsh_ai_db;
  const result = await db
    .prepare(`DELETE FROM logged_sessions WHERE user_email = ? AND session_id = ?`)
    .bind(identity.email, sessionId)
    .run();

  const deleted = Number(result.meta?.changes || 0);
  if (deleted === 0) {
    return errorResponse('not_found', 'Session not found', 404, corsHeaders);
  }

  return jsonResponse({ success: true, deleted }, 200, corsHeaders);
}
