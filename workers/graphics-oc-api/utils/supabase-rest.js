/**
 * Minimal Supabase REST helper for Worker-only database access.
 *
 * Configure with one Worker secret:
 *   SUPABASE_REST_CONFIG={"url":"https://PROJECT_REF.supabase.co","key":"..."}
 */

export class SupabaseRestError extends Error {
  constructor(message, status = 500, details = '') {
    super(message);
    this.name = 'SupabaseRestError';
    this.status = status;
    this.details = details;
  }
}

export function getSupabaseConfig(env) {
  const raw = env.SUPABASE_REST_CONFIG;
  if (!raw) {
    throw new SupabaseRestError('Supabase is not configured');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SupabaseRestError('Supabase config is invalid');
  }

  const url = String(parsed.url || '').trim().replace(/\/+$/, '');
  const key = String(parsed.key || '').trim();

  if (!url || !key || !url.startsWith('https://')) {
    throw new SupabaseRestError('Supabase config is incomplete');
  }

  return { url, key };
}

export async function supabaseRequest(env, tablePath, options = {}) {
  const { url, key } = getSupabaseConfig(env);
  const endpoint = `${url}/rest/v1/${tablePath.replace(/^\/+/, '')}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpoint, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body || {});
    throw new SupabaseRestError('Supabase request failed', response.status, detail);
  }

  return body;
}
