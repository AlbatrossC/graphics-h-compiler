// Enhanced file storage worker for Cloudflare + Supabase + R2
const MAX_SEGMENT_LENGTH = 200;
const REQUIRED_ENV_VARS = ['USER_FILES_BUCKET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];

// Simple LRU Cache
class LRUCache {
  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  delete(key) {
    return this.cache.delete(key);
  }
}

// Authentication Cache - 5 minute TTL
class AuthCache {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  get(token) {
    const entry = this.cache.get(token);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(token);
      return null;
    }
    
    return entry.userId;
  }

  set(token, userId) {
    this.cache.set(token, { userId, timestamp: Date.now() });
    
    // Cleanup: keep cache size under 1000 entries
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  delete(token) {
    this.cache.delete(token);
  }
}

const authCache = new AuthCache(5 * 60 * 1000); // 5-minute TTL
const metadataCache = new LRUCache(10000);
const METADATA_CACHE_TTL_MS = 60 * 1000;

// Cache helpers
function getMetadataCacheKey(userId, folder, filename) {
  return `${userId}/${folder}/${filename}`;
}

function getCachedMetadata(userId, folder, filename) {
  const key = getMetadataCacheKey(userId, folder, filename);
  const cached = metadataCache.get(key);
  if (cached && Date.now() - cached.timestamp < METADATA_CACHE_TTL_MS) {
    return cached.data;
  }
  if (cached) metadataCache.delete(key);
  return null;
}

function setCachedMetadata(userId, folder, filename, data) {
  const key = getMetadataCacheKey(userId, folder, filename);
  metadataCache.set(key, { data, timestamp: Date.now() });
}

function clearCachedMetadata(userId, folder, filename) {
  const key = getMetadataCacheKey(userId, folder, filename);
  metadataCache.delete(key);
}

// Utility: timeout wrapper
function withTimeout(promise, ms, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    ),
  ]);
}

// Check required config
function getMissingConfig(env) {
  const missing = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!env[key]) missing.push(key);
  }
  return missing;
}

// CORS headers
function buildCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// Main worker
export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = buildCorsHeaders(origin);
    const responseHeaders = { ...corsHeaders, 'X-Request-Id': requestId };

    // Handle OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders });
    }

    // Check config
    const missingConfig = getMissingConfig(env);
    if (missingConfig.length > 0) {
      console.error('[Config] Missing:', missingConfig);
      return jsonError(
        'config_missing',
        `Missing: ${missingConfig.join(', ')}`,
        500,
        responseHeaders
      );
    }

    const url = new URL(request.url);

    try {
      // Public endpoints (no auth required)
      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse({ status: 'ok' }, 200, responseHeaders);
      }

      // Auth configuration endpoint
      if (request.method === 'GET' && url.pathname === '/api/auth/config') {
        return jsonResponse({
          supabaseUrl: env.SUPABASE_URL,
          supabaseAnonKey: env.SUPABASE_ANON_KEY,
          storageUrl: '' // Empty string means same-origin
        }, 200, responseHeaders);
      }

      // Auth required for all other endpoints
      const { userId, token, userMetadata } = await withTimeout(
        authenticateRequest(request, env),
        10000,
        'Authentication timeout'
      );

      // Track login (async, don't wait)
      trackUserLogin(env, token, userId, userMetadata).catch(() => {});

      // Route handlers
      if (request.method === 'POST' && url.pathname === '/files/save') {
        return await handleSave(request, env, responseHeaders, userId, token);
      }

      if (request.method === 'POST' && url.pathname === '/files/batch-save') {
        return await handleBatchSave(request, env, responseHeaders, userId, token, requestId);
      }

      if (request.method === 'GET' && url.pathname === '/files/read') {
        return await handleRead(request, env, responseHeaders, userId, token);
      }

      if (request.method === 'GET' && url.pathname === '/files/list') {
        return await handleList(request, env, responseHeaders, token);
      }

      if (request.method === 'DELETE' && url.pathname === '/files/delete') {
        return await handleDelete(request, env, responseHeaders, userId, token, url);
      }

      if (request.method === 'GET' && url.pathname === '/user/info') {
        return await handleUserInfo(request, env, responseHeaders, userId, token);
      }

      // Beacon save endpoint for tab close
      if (request.method === 'POST' && url.pathname === '/files/beacon-save') {
        return await handleBeaconSave(request, env, responseHeaders);
      }

      return jsonError('not_found', 'Not found', 404, responseHeaders);
    } catch (error) {
      console.error(`[${requestId}] Error:`, error.message);
      const status = error.statusCode || 500;
      return jsonError(
        'error',
        error.message || 'Internal error',
        status,
        responseHeaders
      );
    }
  },
};

// === HANDLERS ===

async function handleSave(request, env, responseHeaders, userId, token) {
  const body = await readJsonBody(request);
  const folder = normalizeSegment(body.folder, 'folder');
  const filename = normalizeSegment(body.filename, 'filename');
  const content = typeof body.content === 'string' ? body.content : null;

  if (content === null) {
    return jsonError('bad_request', 'content required', 400, responseHeaders);
  }

  // Worker computes hash authoritatively
  const hash = await computeSha256(content);
  const fileSize = new TextEncoder().encode(content).length;

  // Check cache
  const cachedMeta = getCachedMetadata(userId, folder, filename);
  if (cachedMeta && cachedMeta.file_hash === hash) {
    return jsonResponse({ success: true, hash, skipped: true }, 200, responseHeaders);
  }

  // Check database
  const existing = cachedMeta || (await getFileMetadata(env, token, folder, filename));
  if (existing && existing.file_hash === hash) {
    setCachedMetadata(userId, folder, filename, existing);
    return jsonResponse({ success: true, hash, skipped: true }, 200, responseHeaders);
  }

  // Save to R2
  const r2Key = `${userId}/${folder}/${filename}`;
  await env.USER_FILES_BUCKET.put(r2Key, content, {
    httpMetadata: { contentType: 'text/plain; charset=utf-8' },
  });

  // Save to database with file_size
  await upsertFileMetadata(env, token, {
    id: existing?.id,
    user_id: userId,
    folder,
    filename,
    file_hash: hash,
    file_size: fileSize,
  });

  setCachedMetadata(userId, folder, filename, { id: existing?.id, file_hash: hash });
  return jsonResponse({ success: true, hash }, 200, responseHeaders);
}

// Beacon save handler for tab close
async function handleBeaconSave(request, env, responseHeaders) {
  try {
    // Use standard authentication
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) {
      return jsonResponse({ success: false }, 401, responseHeaders);
    }

    const token = auth.slice(7).trim();
    if (!token) {
      return jsonResponse({ success: false }, 401, responseHeaders);
    }

    // Check auth cache first
    let userId = authCache.get(token);
    if (!userId) {
      const user = await verifyUser(env, token);
      if (!user?.id) {
        return jsonResponse({ success: false }, 401, responseHeaders);
      }
      userId = user.id;
      authCache.set(token, userId);
    }

    const body = await readJsonBody(request);
    const folder = normalizeSegment(body.folder, 'folder');
    const filename = normalizeSegment(body.filename, 'filename');
    const content = typeof body.content === 'string' ? body.content : null;

    if (!content) {
      return jsonResponse({ success: false }, 400, responseHeaders);
    }

    const hash = await computeSha256(content);
    const fileSize = new TextEncoder().encode(content).length;

    // Check if already saved
    const existing = await getFileMetadata(env, token, folder, filename);
    if (existing && existing.file_hash === hash) {
      return jsonResponse({ success: true, skipped: true }, 200, responseHeaders);
    }

    // Save to R2
    const r2Key = `${userId}/${folder}/${filename}`;
    await env.USER_FILES_BUCKET.put(r2Key, content, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });

    // Save to database
    await upsertFileMetadata(env, token, {
      id: existing?.id,
      user_id: userId,
      folder,
      filename,
      file_hash: hash,
      file_size: fileSize,
    });

    return jsonResponse({ success: true }, 200, responseHeaders);
  } catch (e) {
    console.error('[BeaconSave] Error:', e);
    return jsonResponse({ success: false }, 500, responseHeaders);
  }
}

async function handleBatchSave(request, env, responseHeaders, userId, token, requestId) {
  const body = await readJsonBody(request);
  const files = body.files;

  if (!Array.isArray(files) || files.length === 0) {
    return jsonError('bad_request', 'files array required', 400, responseHeaders);
  }

  if (files.length > 20) {
    return jsonError('bad_request', 'Max 20 files per batch', 400, responseHeaders);
  }

  const validatedFiles = [];
  const errors = [];

  for (const file of files) {
    try {
      const folder = normalizeSegment(file.folder, 'folder');
      const filename = normalizeSegment(file.filename, 'filename');
      const content = typeof file.content === 'string' ? file.content : null;

      if (content === null) {
        errors.push({ folder: file.folder, filename: file.filename, error: 'content required' });
        continue;
      }

      const hash = await computeSha256(content);
      const fileSize = new TextEncoder().encode(content).length;
      validatedFiles.push({ folder, filename, content, hash, fileSize });
    } catch (e) {
      errors.push({ folder: file.folder, filename: file.filename, error: e.message });
    }
  }

  // Fetch metadata for all files
  const filesWithMetadata = await Promise.all(
    validatedFiles.map(async (f) => {
      const cachedMeta = getCachedMetadata(userId, f.folder, f.filename);
      if (cachedMeta) return { ...f, existing: cachedMeta };

      try {
        const existing = await getFileMetadata(env, token, f.folder, f.filename);
        if (existing) setCachedMetadata(userId, f.folder, f.filename, existing);
        return { ...f, existing };
      } catch (e) {
        return { ...f, existing: null };
      }
    })
  );

  const toSave = [];
  const skipped = [];

  for (const file of filesWithMetadata) {
    if (file.existing && file.existing.file_hash === file.hash) {
      skipped.push({ folder: file.folder, filename: file.filename, success: true, skipped: true });
    } else {
      toSave.push(file);
    }
  }

  // Save all files in parallel
  const savePromises = toSave.map(async (file) => {
    try {
      const r2Key = `${userId}/${file.folder}/${file.filename}`;
      await Promise.all([
        env.USER_FILES_BUCKET.put(r2Key, file.content, {
          httpMetadata: { contentType: 'text/plain; charset=utf-8' },
        }),
        upsertFileMetadata(env, token, {
          id: file.existing?.id,
          user_id: userId,
          folder: file.folder,
          filename: file.filename,
          file_hash: file.hash,
          file_size: file.fileSize,
        }),
      ]);

      setCachedMetadata(userId, file.folder, file.filename, { id: file.existing?.id, file_hash: file.hash });
      return { folder: file.folder, filename: file.filename, success: true, hash: file.hash };
    } catch (e) {
      console.error(`[${requestId}] Batch save error:`, e);
      return { folder: file.folder, filename: file.filename, error: e.message };
    }
  });

  const saveResults = await Promise.all(savePromises);
  const results = [...errors, ...skipped, ...saveResults];

  const savedCount = saveResults.filter((r) => r.success).length;
  const failedCount = errors.length + saveResults.filter((r) => r.error).length;

  return jsonResponse(
    {
      success: true,
      results,
      summary: { saved: savedCount, skipped: skipped.length, failed: failedCount },
    },
    200,
    responseHeaders
  );
}

async function handleRead(request, env, responseHeaders, userId, token) {
  const url = new URL(request.url);
  const folder = normalizeSegment(url.searchParams.get('folder'), 'folder');
  const filename = normalizeSegment(url.searchParams.get('filename'), 'filename');

  const r2Key = `${userId}/${folder}/${filename}`;
  const object = await env.USER_FILES_BUCKET.get(r2Key);

  if (!object) {
    return jsonError('not_found', 'File not found', 404, responseHeaders);
  }

  // Increment read counter (async)
  incrementReadCounter(env, token, userId).catch(() => {});

  const text = await object.text();
  
  // Compute hash for ETag
  const hash = await computeSha256(text);
  
  return new Response(text, {
    status: 200,
    headers: {
      ...responseHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'ETag': hash,
    },
  });
}

async function handleList(request, env, responseHeaders, token) {
  const list = await listFiles(env, token);
  return jsonResponse({ files: list }, 200, responseHeaders);
}

async function handleDelete(request, env, responseHeaders, userId, token, url) {
  const body = await readJsonBody(request, true);
  const folder = normalizeSegment(body?.folder ?? url.searchParams.get('folder'), 'folder');
  const filename = normalizeSegment(body?.filename ?? url.searchParams.get('filename'), 'filename');

  const r2Key = `${userId}/${folder}/${filename}`;
  await env.USER_FILES_BUCKET.delete(r2Key);
  await deleteFileMetadata(env, token, folder, filename);
  clearCachedMetadata(userId, folder, filename);

  return jsonResponse({ success: true }, 200, responseHeaders);
}

async function handleUserInfo(request, env, responseHeaders, userId, token) {
  const info = await getUserInfo(env, token, userId);
  return jsonResponse({ user_info: info }, 200, responseHeaders);
}

// === AUTH ===

async function authenticateRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing bearer token'), { statusCode: 401 });
  }

  const token = auth.slice(7).trim();
  if (!token) {
    throw Object.assign(new Error('Missing bearer token'), { statusCode: 401 });
  }

  // Check cache first
  const cachedUserId = authCache.get(token);
  if (cachedUserId) {
    return { userId: cachedUserId, token, userMetadata: null };
  }

  // Cache miss - verify with Supabase
  const user = await verifyUser(env, token);
  if (!user?.id) {
    throw Object.assign(new Error('Invalid token'), { statusCode: 401 });
  }

  // Cache the result
  authCache.set(token, user.id);

  return { userId: user.id, token, userMetadata: user.user_metadata };
}

async function verifyUser(env, token) {
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }

  return response.json();
}

// === TRACKING FUNCTIONS ===

async function trackUserLogin(env, token, userId, userMetadata) {
  try {
    const displayName = userMetadata?.full_name || userMetadata?.name || null;
    const email = userMetadata?.email || null;
    
    const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/track_user_login`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ 
        p_user_id: userId,
        p_display_name: displayName,
        p_email: email
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log('[Tracking] Login tracking failed:', response.status, text);
    }
  } catch (e) {
    console.log('[Tracking] Failed to track login:', e.message);
  }
}

async function incrementReadCounter(env, token, userId) {
  try {
    const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/increment_reads`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ p_user_id: userId }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log('[Tracking] Read increment failed:', response.status, text);
    }
  } catch (e) {
    console.log('[Tracking] Failed to increment reads:', e.message);
  }
}

// === SUPABASE HELPERS ===

async function supabaseRequest(env, token, path, options = {}) {
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    apikey: env.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[Supabase] Error ${response.status}:`, text);
    throw Object.assign(new Error(`Supabase error: ${response.status}`), { statusCode: 500 });
  }

  if (response.status === 204) return null;
  return response.json();
}

async function getFileMetadata(env, token, folder, filename) {
  const params = new URLSearchParams({
    folder: `eq.${folder}`,
    filename: `eq.${filename}`,
    select: 'id,file_hash',
    limit: '1',
  });

  const data = await supabaseRequest(env, token, `user_files?${params.toString()}`, {
    method: 'GET',
  });

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function upsertFileMetadata(env, token, record) {
  const now = new Date().toISOString();

  if (record.id) {
    await supabaseRequest(env, token, `user_files?id=eq.${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        file_hash: record.file_hash,
        file_size: record.file_size,
        updated_at: now,
      }),
    });
    return;
  }

  await supabaseRequest(env, token, 'user_files', {
    method: 'POST',
    headers: {
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      user_id: record.user_id,
      folder: record.folder,
      filename: record.filename,
      file_hash: record.file_hash,
      file_size: record.file_size,
      updated_at: now,
    }),
  });
}

async function listFiles(env, token) {
  const params = new URLSearchParams({
    select: 'id,folder,filename,file_hash,file_size,updated_at',
    order: 'updated_at.desc',
  });

  return supabaseRequest(env, token, `user_files?${params.toString()}`, {
    method: 'GET',
  });
}

async function deleteFileMetadata(env, token, folder, filename) {
  const params = new URLSearchParams({
    folder: `eq.${folder}`,
    filename: `eq.${filename}`,
  });

  await supabaseRequest(env, token, `user_files?${params.toString()}`, {
    method: 'DELETE',
  });
}

async function getUserInfo(env, token, userId) {
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: '*',
    limit: '1',
  });

  const data = await supabaseRequest(env, token, `user_info?${params.toString()}`, {
    method: 'GET',
  });

  return Array.isArray(data) && data.length ? data[0] : null;
}

// === SHA-256 HASH COMPUTATION ===
async function computeSha256(content) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback to simple hash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

// === UTILITIES ===

function normalizeSegment(value, label) {
  if (typeof value !== 'string') {
    throw Object.assign(new Error(`${label} is required`), { statusCode: 400 });
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw Object.assign(new Error(`${label} is required`), { statusCode: 400 });
  }

  if (
    trimmed.length > MAX_SEGMENT_LENGTH ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..')
  ) {
    throw Object.assign(new Error(`Invalid ${label}`), { statusCode: 400 });
  }

  return trimmed;
}

async function readJsonBody(request, allowEmpty = false) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    if (allowEmpty) return null;
    throw Object.assign(new Error('Expected JSON body'), { statusCode: 400 });
  }

  try {
    return await request.json();
  } catch (error) {
    throw Object.assign(new Error('Invalid JSON body'), { statusCode: 400 });
  }
}

function jsonError(code, message, status, headers) {
  return jsonResponse({ error: message, code }, status, headers);
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}