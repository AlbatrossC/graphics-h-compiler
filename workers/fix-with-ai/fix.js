import { getConfig } from './config.js';
import {
  countDailyRequests,
  dateKeyFromIso,
  findReusableJob,
  getDailyLimit,
  getIdentifierParts,
  getJobById,
  insertPendingJob,
  markJobDone,
  markJobFailed,
} from './db.js';
import { callGeminiWithFallback } from './gemini.js';
import { parseFixResponse } from './parser.js';
import { readJsonBody, validateCreateBody, validateJobId } from './validate.js';

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function processFixJob(env, jobId) {
  const db = env.FIX_WITH_AI_DB;
  const config = getConfig(env);
  const job = await getJobById(db, jobId);

  if (!job || job.status !== 'pending') {
    return;
  }

  try {
    const aiResponse = await callGeminiWithFallback(env, config, job.code, job.error);
    const parsed = parseFixResponse(aiResponse.text, config);
    await markJobDone(
      db,
      jobId,
      parsed.explanation,
      parsed.fixedCode,
      aiResponse.provider,
      aiResponse.tryCount || 0,
      new Date().toISOString()
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown job failure';
    await markJobFailed(
      db,
      jobId,
      reason,
      error?.lastProvider || null,
      error?.tryCount || 0,
      new Date().toISOString()
    );
  }
}

export async function handleCreateFixJob(request, env, identity) {
  const config = getConfig(env);
  const body = await readJsonBody(request);
  const validated = validateCreateBody(body, config);
  const { identifierType, identifierValue } = getIdentifierParts(identity);
  const db = env.FIX_WITH_AI_DB;
  const nowIso = new Date().toISOString();
  const requestDate = dateKeyFromIso(nowIso);
  const hash = await sha256Hex(`${validated.code}\n---\n${validated.error}`);

  const reusableJob = await findReusableJob(db, identifierType, identifierValue, hash);
  if (reusableJob) {
    return {
      response: {
        job_id: reusableJob.job_id,
        status: reusableJob.status,
        deduplicated: true,
        api_key_used: reusableJob.api_key_used || null,
        gemini_try_count: Number(reusableJob.gemini_try_count || 0),
        poll_path: `/api/ai/fix/${reusableJob.job_id}`,
      },
      status: reusableJob.status === 'done' ? 200 : 202,
    };
  }

  const totalToday = await countDailyRequests(db, identifierType, identifierValue, requestDate);
  const dailyLimit = getDailyLimit(identity, config);
  if (totalToday >= dailyLimit) {
    throw {
      statusCode: 429,
      code: 'limit_reached',
      message: `Daily Fix with AI limit reached (${dailyLimit}/day). Try again tomorrow.`,
    };
  }

  const jobId = `job_${crypto.randomUUID()}`;
  await insertPendingJob(db, {
    jobId,
    identifierType,
    identifierValue,
    code: validated.code,
    error: validated.error,
    hash,
    requestDate,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  return {
    response: {
      job_id: jobId,
      status: 'pending',
      deduplicated: false,
      poll_path: `/api/ai/fix/${jobId}`,
    },
    status: 202,
  };
}

export async function handleGetFixJob(env, jobId, identity) {
  const validatedJobId = validateJobId(jobId);
  const db = env.FIX_WITH_AI_DB;
  const job = await getJobById(db, validatedJobId);

  if (!job) {
    throw {
      statusCode: 404,
      code: 'not_found',
      message: 'Job not found',
    };
  }

  const { identifierType, identifierValue } = getIdentifierParts(identity);
  if (job.identifier_type !== identifierType || job.identifier_value !== identifierValue) {
    throw {
      statusCode: 404,
      code: 'not_found',
      message: 'Job not found',
    };
  }

  return {
    job_id: job.job_id,
    status: job.status,
    explanation: job.status === 'done' ? job.explanation : null,
    fixed_code: job.status === 'done' ? job.fixed_code : null,
    api_key_used: job.api_key_used || null,
    gemini_try_count: Number(job.gemini_try_count || 0),
    error:
      job.status === 'failed'
        ? job.failure_reason || 'Fix with AI could not repair this error.'
        : null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}
