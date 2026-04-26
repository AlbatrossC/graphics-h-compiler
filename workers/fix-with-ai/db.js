export function getIdentifierParts(identity) {
  return {
    identifierType: identity.kind,
    identifierValue: identity.value,
  };
}

export function getDailyLimit(identity, config) {
  return identity.kind === 'email' ? config.emailDailyLimit : config.fingerprintDailyLimit;
}

export function dateKeyFromIso(nowIso) {
  return nowIso.slice(0, 10);
}

export async function findReusableJob(db, identifierType, identifierValue, hash) {
  const result = await db
    .prepare(
      `SELECT job_id, status, explanation, fixed_code, api_key_used, gemini_try_count, created_at, updated_at
       FROM fix_jobs
       WHERE identifier_type = ?
         AND identifier_value = ?
         AND hash = ?
         AND status IN ('pending', 'done')
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(identifierType, identifierValue, hash)
    .first();

  return result || null;
}

export async function countDailyRequests(db, identifierType, identifierValue, requestDate) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM fix_jobs
       WHERE identifier_type = ?
         AND identifier_value = ?
         AND request_date = ?`
    )
    .bind(identifierType, identifierValue, requestDate)
    .first();

  return Number(row?.total || 0);
}

export async function insertPendingJob(db, job) {
  await db
    .prepare(
      `INSERT INTO fix_jobs (
         job_id,
         identifier_type,
         identifier_value,
         code,
         error,
         status,
         explanation,
         fixed_code,
         api_key_used,
         gemini_try_count,
         hash,
         request_date,
         created_at,
         updated_at
       )
       VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, 0, ?, ?, ?, ?)`
    )
    .bind(
      job.jobId,
      job.identifierType,
      job.identifierValue,
      job.code,
      job.error,
      job.hash,
      job.requestDate,
      job.createdAt,
      job.updatedAt
    )
    .run();
}

export async function getJobById(db, jobId) {
  return (
    (await db
      .prepare(
        `SELECT job_id, identifier_type, identifier_value, code, error, status,
                explanation, fixed_code, api_key_used, gemini_try_count, hash, failure_reason, request_date,
                created_at, updated_at
         FROM fix_jobs
         WHERE job_id = ?
         LIMIT 1`
      )
      .bind(jobId)
      .first()) || null
  );
}

export async function markJobDone(db, jobId, explanation, fixedCode, apiKeyUsed, geminiTryCount, updatedAt) {
  await db
    .prepare(
      `UPDATE fix_jobs
       SET status = 'done',
           explanation = ?,
           fixed_code = ?,
           api_key_used = ?,
           gemini_try_count = ?,
           failure_reason = NULL,
           updated_at = ?
       WHERE job_id = ?`
    )
    .bind(explanation, fixedCode, apiKeyUsed, geminiTryCount, updatedAt, jobId)
    .run();
}

export async function markJobFailed(db, jobId, reason, apiKeyUsed, geminiTryCount, updatedAt) {
  await db
    .prepare(
      `UPDATE fix_jobs
       SET status = 'failed',
           api_key_used = ?,
           gemini_try_count = ?,
           failure_reason = ?,
           updated_at = ?
       WHERE job_id = ?`
    )
    .bind(apiKeyUsed, geminiTryCount, reason, updatedAt, jobId)
    .run();
}
