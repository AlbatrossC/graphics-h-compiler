import { CONFIG } from './config.js';

export function parseDateMs(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatRemainingWindow(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/**
 * Evaluates rate limit state for a subject row.
 *
 * Returns either:
 *  { allowed: false, code, message }
 *  { allowed: true, nextWindowRequests, nextTotalRequests, nextWindowStartIso, remaining, max }
 */
export function evaluateRateLimit(row, maxRequests, nowMs, nowIso) {
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

  const nextWindowRequests = windowRequests + 1;
  return {
    allowed: true,
    nextWindowRequests,
    nextTotalRequests: Number(row.total_requests || 0) + 1,
    nextWindowStartIso: effectiveWindowStartIso,
    remaining: maxRequests - nextWindowRequests,
    max: maxRequests,
  };
}
