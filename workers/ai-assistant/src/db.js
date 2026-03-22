export async function getOrCreateGuest(env, fingerprintId, nowIso) {
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

export async function getOrCreateLoggedUser(env, email, userName, nowIso) {
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

export async function getNextVersion(env, identity, sessionId) {
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

export async function insertRequestLog(env, identity, payload, aiResult, version, nowIso) {
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

export async function updateSubjectUsage(env, identity, rowId, rateState, nowIso) {
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

export async function updateDailyUsage(env, identity, payload, aiResult, nowDate, nowIso, isFirstToday) {
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

/**
 * Runs updateSubjectUsage + updateDailyUsage after the response is already sent.
 * countRequestsToday is resolved inside this function to keep it off the critical path.
 */
export async function runPostResponseWrites(env, identity, subjectRowId, rateState, payload, aiResult, nowDate, nowIso) {
  const isFirstToday = (await countRequestsToday(env, identity, nowDate)) === 0;
  await Promise.all([
    updateSubjectUsage(env, identity, subjectRowId, rateState, nowIso),
    updateDailyUsage(env, identity, payload, aiResult, nowDate, nowIso, isFirstToday),
  ]);
}
