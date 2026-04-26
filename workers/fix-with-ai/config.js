export const DEFAULT_CONFIG = Object.freeze({
  model: 'gemini-2.5-flash',
  timeoutMs: 45_000,
  maxCodeBytes: 15_360,
  maxErrorBytes: 4_000,
  maxExplanationChars: 2_500,
  emailDailyLimit: 20,
  fingerprintDailyLimit: 10,
  maxPendingAgeMs: 10 * 60 * 1000,
});

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const ALLOWED_ORIGINS = new Set([
  'https://graphics-h-compiler.vercel.app',
  'https://graphics-h-online-compiler-git-test-albatrosscs-projects.vercel.app',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
]);

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(env) {
  return {
    model: String(env.GEMINI_MODEL || DEFAULT_CONFIG.model).trim() || DEFAULT_CONFIG.model,
    timeoutMs: readPositiveInt(env.FIX_AI_TIMEOUT_MS, DEFAULT_CONFIG.timeoutMs),
    maxCodeBytes: readPositiveInt(env.FIX_AI_MAX_CODE_BYTES, DEFAULT_CONFIG.maxCodeBytes),
    maxErrorBytes: readPositiveInt(env.FIX_AI_MAX_ERROR_BYTES, DEFAULT_CONFIG.maxErrorBytes),
    maxExplanationChars: readPositiveInt(
      env.FIX_AI_MAX_EXPLANATION_CHARS,
      DEFAULT_CONFIG.maxExplanationChars
    ),
    emailDailyLimit: readPositiveInt(env.FIX_AI_EMAIL_LIMIT_PER_DAY, DEFAULT_CONFIG.emailDailyLimit),
    fingerprintDailyLimit: readPositiveInt(
      env.FIX_AI_FINGERPRINT_LIMIT_PER_DAY,
      DEFAULT_CONFIG.fingerprintDailyLimit
    ),
    maxPendingAgeMs: readPositiveInt(env.FIX_AI_MAX_PENDING_AGE_MS, DEFAULT_CONFIG.maxPendingAgeMs),
  };
}
