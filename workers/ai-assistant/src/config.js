export const CONFIG = Object.freeze({
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
  MODEL_FALLBACK: 'gemini-2.5-flash',
});

export const SESSION_COOKIE_NAME = 'session';
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const ALLOWED_ORIGINS = new Set([
  'https://graphics-h-compiler.vercel.app',
  'https://graphics-h-online-compiler-git-test-albatrosscs-projects.vercel.app',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
]);
