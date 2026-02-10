const MAX_SEGMENT_LENGTH = 200;
const REQUIRED_ENV_VARS = ['USER_FILES_BUCKET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];

// ==================== LRU CACHE CLASS ====================
class LRUCache {
    constructor(maxSize = 10000) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) {
            return undefined;
        }
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        this.cache.set(key, value);
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    has(key) {
        return this.cache.has(key);
    }

    get size() {
        return this.cache.size;
    }
}

// ==================== CACHES ====================
const metadataCache = new LRUCache(10000);
const userVerificationCache = new LRUCache(10000);
const METADATA_CACHE_TTL_MS = 60 * 1000;
const USER_VERIFICATION_CACHE_TTL_MS = 30 * 60 * 1000;

function getMetadataCacheKey(userId, folder, filename) {
    return `${userId}/${folder}/${filename}`;
}

function getCachedMetadata(userId, folder, filename) {
    const key = getMetadataCacheKey(userId, folder, filename);
    const cached = metadataCache.get(key);
    if (cached && (Date.now() - cached.timestamp < METADATA_CACHE_TTL_MS)) {
        return cached.data;
    }
    if (cached) {
        metadataCache.delete(key);
    }
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

async function hashToken(token) {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getCachedUserId(token) {
    try {
        const tokenHash = await hashToken(token);
        const cached = userVerificationCache.get(tokenHash);
        if (!cached) return null;
        if (Date.now() >= cached.expiresAt) {
            userVerificationCache.delete(tokenHash);
            return null;
        }
        return { userId: cached.userId };
    } catch (e) {
        console.error('Cache lookup error:', e);
        return null;
    }
}

async function setCachedUserId(token, userId) {
    try {
        const tokenHash = await hashToken(token);
        userVerificationCache.set(tokenHash, {
            userId,
            expiresAt: Date.now() + USER_VERIFICATION_CACHE_TTL_MS
        });
    } catch (e) {
        console.error('Cache set error:', e);
    }
}

async function clearCachedUserIdForToken(token) {
    try {
        const tokenHash = await hashToken(token);
        userVerificationCache.delete(tokenHash);
    } catch (e) {
        console.error('Cache clear error:', e);
    }
}

// ==================== JWT VERIFICATION ====================
function base64UrlToUint8Array(base64Url) {
    const padding = '='.repeat((4 - base64Url.length % 4) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function verifyJwtLocal(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Invalid token structure');

        const [headerB64, payloadB64, signatureB64] = parts;

        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const data = encoder.encode(`${headerB64}.${payloadB64}`);
        const signature = base64UrlToUint8Array(signatureB64);

        const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
        if (!isValid) return null;

        const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);

        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && now > payload.exp) {
            console.log('[Auth] Token expired');
            return null;
        }

        return { id: payload.sub, email: payload.email };
    } catch (e) {
        console.error('[Auth] Local verification failed:', e);
        return null;
    }
}

async function computeContentHash(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function withTimeout(promise, ms, errorMessage) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage)), ms)
        )
    ]);
}

function getMissingConfig(env) {
    const missing = [];
    for (const key of REQUIRED_ENV_VARS) {
        if (!env[key]) missing.push(key);
    }
    return missing;
}

// ==================== SIMPLIFIED CORS ====================
function buildCorsHeaders(origin) {
    // Allow all origins - simplified for debugging
    // In production, you should restrict this to your domain
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
    };
}

// ==================== MAIN HANDLER ====================
export default {
    async fetch(request, env) {
        const requestId = crypto.randomUUID();
        const origin = request.headers.get('Origin') || '';
        
        const corsHeaders = buildCorsHeaders(origin);
        const responseHeaders = { ...corsHeaders, 'X-Request-Id': requestId };

        // Handle OPTIONS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: responseHeaders });
        }

        // Check required configuration
        const missingConfig = getMissingConfig(env);
        if (missingConfig.length > 0) {
            console.error('[Config] Missing configuration:', missingConfig);
            return jsonError(
                'config_missing',
                `Server configuration error. Missing: ${missingConfig.join(', ')}`,
                500,
                responseHeaders,
                { missing: missingConfig }
            );
        }

        const url = new URL(request.url);

        try {
            // Beacon save (no auth required - token in body)
            if (request.method === 'POST' && url.pathname === '/files/beacon-save') {
                return await handleBeaconSave(request, env, responseHeaders, requestId);
            }

            // Authenticate for all other routes
            const authResult = await withTimeout(
                authenticateRequest(request, env),
                10000,
                'Authentication timeout'
            );

            const { userId, token } = authResult;

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

            return jsonError('not_found', 'Not found', 404, responseHeaders);
        } catch (error) {
            console.error(`[${requestId}] Worker error:`, error.message, error.stack);
            const status = error.statusCode || 500;
            return jsonError(
                status === 500 ? 'internal_error' : 'request_failed',
                status === 500 ? 'Internal server error' : error.message,
                status,
                responseHeaders,
                { requestId }
            );
        }
    },
};

// ==================== HANDLERS ====================
async function handleBeaconSave(request, env, responseHeaders, requestId) {
    const body = await readJsonBody(request);
    const token = body?.token;

    if (!token) {
        return jsonError('auth_missing', 'Missing token', 401, responseHeaders);
    }

    const user = await withTimeout(verifyUser(env, token), 10000, 'Auth timeout');
    if (!user?.id) {
        return jsonError('auth_invalid', 'Invalid token', 401, responseHeaders);
    }

    const userId = user.id;
    const folder = normalizeSegment(body.folder, 'folder');
    const filename = normalizeSegment(body.filename, 'filename');
    const content = typeof body.content === 'string' ? body.content : null;

    if (content === null) {
        return jsonError('bad_request', 'content is required', 400, responseHeaders);
    }

    const hash = await computeContentHash(content);

    const cachedMeta = getCachedMetadata(userId, folder, filename);
    if (cachedMeta && cachedMeta.file_hash === hash) {
        return jsonResponse({ success: true, hash, skipped: true, cached: true }, 200, responseHeaders);
    }

    const existing = cachedMeta || await getFileMetadata(env, token, folder, filename);
    if (existing && existing.file_hash === hash) {
        setCachedMetadata(userId, folder, filename, existing);
        return jsonResponse({ success: true, hash, skipped: true }, 200, responseHeaders);
    }

    const r2Key = `${userId}/${folder}/${filename}`;
    await env.USER_FILES_BUCKET.put(r2Key, content, {
        httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });

    await upsertFileMetadata(env, token, {
        id: existing?.id,
        user_id: userId,
        folder,
        filename,
        file_hash: hash,
    });

    setCachedMetadata(userId, folder, filename, { id: existing?.id, file_hash: hash });

    console.log(`[${requestId}] Beacon save: ${folder}/${filename}`);
    return jsonResponse({ success: true, hash }, 200, responseHeaders);
}

async function handleSave(request, env, responseHeaders, userId, token) {
    const body = await readJsonBody(request);
    const folder = normalizeSegment(body.folder, 'folder');
    const filename = normalizeSegment(body.filename, 'filename');
    const content = typeof body.content === 'string' ? body.content : null;
    const hash = typeof body.hash === 'string' ? body.hash : null;

    if (content === null || hash === null) {
        return jsonError('bad_request', 'content and hash are required', 400, responseHeaders);
    }

    const cachedMeta = getCachedMetadata(userId, folder, filename);
    if (cachedMeta && cachedMeta.file_hash === hash) {
        return jsonResponse({ success: true, hash, skipped: true, cached: true }, 200, responseHeaders);
    }

    const existing = cachedMeta || await getFileMetadata(env, token, folder, filename);
    if (existing && existing.file_hash === hash) {
        setCachedMetadata(userId, folder, filename, existing);
        return jsonResponse({ success: true, hash, skipped: true }, 200, responseHeaders);
    }

    const r2Key = `${userId}/${folder}/${filename}`;
    await env.USER_FILES_BUCKET.put(r2Key, content, {
        httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });

    await upsertFileMetadata(env, token, {
        id: existing?.id,
        user_id: userId,
        folder,
        filename,
        file_hash: hash,
    });

    setCachedMetadata(userId, folder, filename, { id: existing?.id, file_hash: hash });

    return jsonResponse({ success: true, hash }, 200, responseHeaders);
}

async function handleBatchSave(request, env, responseHeaders, userId, token, requestId) {
    const body = await readJsonBody(request);
    const files = body.files;

    if (!Array.isArray(files) || files.length === 0) {
        return jsonError('bad_request', 'files array is required', 400, responseHeaders);
    }

    if (files.length > 20) {
        return jsonError('bad_request', 'Maximum 20 files per batch', 400, responseHeaders);
    }

    const validatedFiles = [];
    const errors = [];

    for (const file of files) {
        try {
            const folder = normalizeSegment(file.folder, 'folder');
            const filename = normalizeSegment(file.filename, 'filename');
            const content = typeof file.content === 'string' ? file.content : null;
            const hash = typeof file.hash === 'string' ? file.hash : null;

            if (content === null || hash === null) {
                errors.push({ folder: file.folder, filename: file.filename, error: 'content and hash required' });
                continue;
            }

            validatedFiles.push({ folder, filename, content, hash });
        } catch (e) {
            errors.push({ folder: file.folder, filename: file.filename, error: e.message });
        }
    }

    const filesWithMetadata = await Promise.all(validatedFiles.map(async f => {
        const cachedMeta = getCachedMetadata(userId, f.folder, f.filename);
        if (cachedMeta) {
            return { ...f, existing: cachedMeta, fromCache: true };
        }
        try {
            const existing = await getFileMetadata(env, token, f.folder, f.filename);
            if (existing) {
                setCachedMetadata(userId, f.folder, f.filename, existing);
            }
            return { ...f, existing, fromCache: false };
        } catch (e) {
            return { ...f, existing: null, fromCache: false };
        }
    }));

    const toSave = [];
    const skipped = [];

    for (const file of filesWithMetadata) {
        if (file.existing && file.existing.file_hash === file.hash) {
            skipped.push({ folder: file.folder, filename: file.filename, success: true, skipped: true });
        } else {
            toSave.push(file);
        }
    }

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
                })
            ]);

            setCachedMetadata(userId, file.folder, file.filename, { id: file.existing?.id, file_hash: file.hash });

            return { folder: file.folder, filename: file.filename, success: true, hash: file.hash };
        } catch (e) {
            console.error(`[${requestId}] Batch save error for ${file.folder}/${file.filename}:`, e);
            return { folder: file.folder, filename: file.filename, error: e.message };
        }
    });

    const saveResults = await Promise.all(savePromises);

    const results = [...errors, ...skipped, ...saveResults];
    const savedCount = saveResults.filter(r => r.success).length;
    const failedCount = errors.length + saveResults.filter(r => r.error).length;

    return jsonResponse({
        success: true,
        results,
        summary: { saved: savedCount, skipped: skipped.length, failed: failedCount }
    }, 200, responseHeaders);
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

    // Track read in user_info (fire-and-forget, don't block response)
    trackFileRead(env, token, userId).catch(() => {});

    const text = await object.text();
    return new Response(text, {
        status: 200,
        headers: {
            ...responseHeaders,
            'Content-Type': 'text/plain; charset=utf-8',
            'ETag': object.etag || '',
        },
    });
}

async function handleList(request, env, responseHeaders, token) {
    const list = await listFiles(env, token);
    return jsonResponse({ files: list }, 200, responseHeaders);
}

async function handleDelete(request, env, responseHeaders, userId, token, url) {
    const body = await readJsonBody(request, true);
    const folder = normalizeSegment(
        body?.folder ?? url.searchParams.get('folder'),
        'folder'
    );
    const filename = normalizeSegment(
        body?.filename ?? url.searchParams.get('filename'),
        'filename'
    );
    const r2Key = `${userId}/${folder}/${filename}`;

    await env.USER_FILES_BUCKET.delete(r2Key);
    await deleteFileMetadata(env, token, folder, filename);
    clearCachedMetadata(userId, folder, filename);

    return jsonResponse({ success: true }, 200, responseHeaders);
}

// ==================== AUTH ====================
async function authenticateRequest(request, env) {
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) {
        throw Object.assign(new Error('Missing bearer token'), { statusCode: 401 });
    }

    const token = auth.slice(7).trim();
    if (!token) {
        throw Object.assign(new Error('Missing bearer token'), { statusCode: 401 });
    }

    const cachedUserId = await getCachedUserId(token);
    if (cachedUserId) {
        return { userId: cachedUserId.userId, token };
    }

    const user = await verifyUser(env, token);
    if (!user?.id) {
        throw Object.assign(new Error('Invalid token'), { statusCode: 401 });
    }

    await setCachedUserId(token, user.id);

    return { userId: user.id, token };
}

async function verifyUser(env, token) {
    if (env.SUPABASE_JWT_SECRET) {
        const localUser = await verifyJwtLocal(token, env.SUPABASE_JWT_SECRET);
        if (localUser) {
            return localUser;
        }
        console.warn('[Auth] Local verification failed, falling back to remote');
    }

    return verifyUserViaSupabase(env, token);
}

async function verifyUserViaSupabase(env, token) {
    const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            apikey: env.SUPABASE_ANON_KEY,
        },
    });

    if (!response.ok) {
        await clearCachedUserIdForToken(token);
        throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }

    return response.json();
}

// ==================== USER METRICS TRACKING ====================
async function trackFileRead(env, token, userId) {
    try {
        const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/increment_user_reads`;
        
        await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: env.SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_user_id: userId })
        });
    } catch (e) {
        // Silently fail - metrics shouldn't break functionality
        console.log('[Metrics] Failed to track read:', e.message);
    }
}

// ==================== HELPERS ====================
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

async function supabaseRequest(env, token, path, options = {}) {
    const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...options.headers,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const text = await response.text();
        console.error(`[Supabase] Error: ${response.status} ${text}`);
        throw Object.assign(
            new Error(`Supabase error: ${response.status}`),
            { statusCode: 500 }
        );
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
    const data = await supabaseRequest(
        env,
        token,
        `user_files?${params.toString()}`,
        { method: 'GET', headers: { Prefer: 'count=exact' } }
    );
    return Array.isArray(data) && data.length ? data[0] : null;
}

async function upsertFileMetadata(env, token, record) {
    const now = new Date().toISOString();
    if (record.id) {
        await supabaseRequest(
            env,
            token,
            `user_files?id=eq.${record.id}`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    file_hash: record.file_hash,
                    updated_at: now,
                }),
            }
        );
        return;
    }

    await supabaseRequest(env, token, 'user_files', {
        method: 'POST',
        body: JSON.stringify({
            user_id: record.user_id,
            folder: record.folder,
            filename: record.filename,
            file_hash: record.file_hash,
            updated_at: now,
        }),
    });
}

async function listFiles(env, token) {
    const params = new URLSearchParams({
        select: 'id,folder,filename,file_hash,updated_at',
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

function jsonError(code, message, status, headers, extra = {}) {
    return jsonResponse(
        {
            error: message,
            code,
            ...extra,
        },
        status,
        headers
    );
}

function jsonResponse(body, status, headers) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...headers,
            'Content-Type': 'application/json',
        },
    });
}