const MAX_SEGMENT_LENGTH = 200;

// ==================== WORKER-SIDE METADATA CACHE ====================
const metadataCache = new Map();
const METADATA_CACHE_TTL_MS = 60 * 1000; // 60 seconds

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
	metadataCache.set(key, {
		data,
		timestamp: Date.now()
	});
}

function clearCachedMetadata(userId, folder, filename) {
	const key = getMetadataCacheKey(userId, folder, filename);
	metadataCache.delete(key);
}

// ==================== WORKER-SIDE USER VERIFICATION CACHE (TIER 2) ====================
const userVerificationCache = new Map();
const USER_VERIFICATION_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

		if (!cached) {
			return null;
		}

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

// ==================== FAST JWT VERIFICATION (LOCAL) ====================
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

// Verify JWT signature locally using Web Crypto API (no external calls)
// REQUIRES: env.SUPABASE_JWT_SECRET to be set
async function verifyJwtLocal(token, secret) {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) throw new Error('Invalid token structure');

		const [headerB64, payloadB64, signatureB64] = parts;

		// 1. Verify Signature
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

		// 2. Decode payload and check expiry
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

export default {
	async fetch(request, env) {
		const requestId = crypto.randomUUID();

		try {
			const corsHeaders = buildCorsHeaders(request, env);
			const responseHeaders = { ...corsHeaders, 'X-Request-Id': requestId };

			// Handle CORS preflight
			if (request.method === 'OPTIONS') {
				return new Response(null, { status: 204, headers: responseHeaders });
			}

			// Validate CORS origin
			if (!corsHeaders['Access-Control-Allow-Origin']) {
				return jsonResponse(
					{ error: 'CORS origin not allowed' },
					403,
					responseHeaders
				);
			}

			// Validate environment
			if (!env.USER_FILES_BUCKET) {
				console.error('[Config] Missing USER_FILES_BUCKET binding');
				return jsonResponse(
					{ error: 'Storage not configured' },
					500,
					responseHeaders
				);
			}

			if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
				console.error('[Config] Missing Supabase configuration');
				return jsonResponse(
					{ error: 'Auth not configured' },
					500,
					responseHeaders
				);
			}

			const url = new URL(request.url);
			// console.log(`[${requestId}] ${request.method} ${url.pathname}`);

			// Special handling for beacon-save (token in body, not header)
			if (request.method === 'POST' && url.pathname === '/files/beacon-save') {
				try {
					const body = await readJsonBody(request);
					const token = body.token;

					if (!token) {
						return jsonResponse({ error: 'Missing token' }, 401, responseHeaders);
					}

					// Verify user with timeout
					const user = await Promise.race([
						verifyUser(env, token),
						new Promise((_, reject) =>
							setTimeout(() => reject(new Error('Auth timeout')), 10000)
						)
					]);

					if (!user?.id) {
						return jsonResponse({ error: 'Invalid token' }, 401, responseHeaders);
					}

					const userId = user.id;
					const folder = normalizeSegment(body.folder, 'folder');
					const filename = normalizeSegment(body.filename, 'filename');
					const content = typeof body.content === 'string' ? body.content : null;

					if (content === null) {
						return jsonResponse({ error: 'content is required' }, 400, responseHeaders);
					}

					// Compute hash
					const encoder = new TextEncoder();
					const data = encoder.encode(content);
					const hashBuffer = await crypto.subtle.digest('SHA-256', data);
					const hashArray = Array.from(new Uint8Array(hashBuffer));
					const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

					// Check cache first
					const cachedMeta = getCachedMetadata(userId, folder, filename);
					if (cachedMeta && cachedMeta.file_hash === hash) {
						return jsonResponse({ success: true, hash, skipped: true, cached: true }, 200, responseHeaders);
					}

					// Get fresh metadata if not cached
					const existing = cachedMeta || await getFileMetadata(env, token, folder, filename);

					// Skip if hash unchanged
					if (existing && existing.file_hash === hash) {
						setCachedMetadata(userId, folder, filename, existing);
						return jsonResponse({ success: true, hash, skipped: true }, 200, responseHeaders);
					}

					// Save to R2
					const r2Key = `${userId}/${folder}/${filename}`;
					await env.USER_FILES_BUCKET.put(r2Key, content, {
						httpMetadata: { contentType: 'text/plain; charset=utf-8' },
					});

					// Update metadata
					await upsertFileMetadata(env, token, {
						id: existing?.id,
						user_id: userId,
						folder,
						filename,
						file_hash: hash,
					});

					// Update cache
					setCachedMetadata(userId, folder, filename, { id: existing?.id, file_hash: hash });

					console.log(`[${requestId}] Beacon save: ${folder}/${filename}`);
					return jsonResponse({ success: true, hash }, 200, responseHeaders);
				} catch (e) {
					console.error(`[${requestId}] Beacon save error:`, e);
					return jsonResponse({ error: e.message || 'Beacon save failed' }, 500, responseHeaders);
				}
			}

			// Authenticate request with timeout protection
			let userId, token;
			try {
				const authResult = await Promise.race([
					authenticateRequest(request, env),
					new Promise((_, reject) =>
						setTimeout(() => reject(new Error('Authentication timeout')), 10000)
					)
				]);
				userId = authResult.userId;
				token = authResult.token;
			} catch (authError) {
				console.error(`[${requestId}] Auth error:`, authError);
				return jsonResponse(
					{ error: authError.message || 'Authentication failed' },
					authError.statusCode || 401,
					responseHeaders
				);
			}

			// console.log(`[${requestId}] Authenticated user: ${userId}`);

			// Single file save
			if (request.method === 'POST' && url.pathname === '/files/save') {
				const body = await readJsonBody(request);
				const folder = normalizeSegment(body.folder, 'folder');
				const filename = normalizeSegment(body.filename, 'filename');
				const content = typeof body.content === 'string' ? body.content : null;
				const hash = typeof body.hash === 'string' ? body.hash : null;

				if (content === null || hash === null) {
					return jsonResponse(
						{ error: 'content and hash are required' },
						400,
						responseHeaders
					);
				}

				// Check cache first
				const cachedMeta = getCachedMetadata(userId, folder, filename);
				if (cachedMeta && cachedMeta.file_hash === hash) {
					return jsonResponse({ success: true, hash, skipped: true, cached: true }, 200, responseHeaders);
				}

				// Get metadata
				const existing = cachedMeta || await getFileMetadata(env, token, folder, filename);

				// Skip if hash unchanged
				if (existing && existing.file_hash === hash) {
					setCachedMetadata(userId, folder, filename, existing);
					return jsonResponse({ success: true, hash, skipped: true }, 200, responseHeaders);
				}

				// Save to R2
				const r2Key = `${userId}/${folder}/${filename}`;
				await env.USER_FILES_BUCKET.put(r2Key, content, {
					httpMetadata: { contentType: 'text/plain; charset=utf-8' },
				});

				// Update metadata
				await upsertFileMetadata(env, token, {
					id: existing?.id,
					user_id: userId,
					folder,
					filename,
					file_hash: hash,
				});

				// Update cache
				setCachedMetadata(userId, folder, filename, { id: existing?.id, file_hash: hash });

				// console.log(`[${requestId}] Saved: ${folder}/${filename}`);
				return jsonResponse({ success: true, hash }, 200, responseHeaders);
			}

			// Batch save endpoint
			if (request.method === 'POST' && url.pathname === '/files/batch-save') {
				const body = await readJsonBody(request);
				const files = body.files;

				if (!Array.isArray(files) || files.length === 0) {
					return jsonResponse(
						{ error: 'files array is required' },
						400,
						responseHeaders
					);
				}

				if (files.length > 20) {
					return jsonResponse(
						{ error: 'Maximum 20 files per batch' },
						400,
						responseHeaders
					);
				}

				// Validate all files
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

				// Check cache and fetch metadata
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

				// Separate files that need saving
				const toSave = [];
				const skipped = [];

				for (const file of filesWithMetadata) {
					if (file.existing && file.existing.file_hash === file.hash) {
						skipped.push({ folder: file.folder, filename: file.filename, success: true, skipped: true });
					} else {
						toSave.push(file);
					}
				}

				// Save files in parallel
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

			// Read file
			if (request.method === 'GET' && url.pathname === '/files/read') {
				const folder = normalizeSegment(url.searchParams.get('folder'), 'folder');
				const filename = normalizeSegment(url.searchParams.get('filename'), 'filename');
				const r2Key = `${userId}/${folder}/${filename}`;

				const object = await env.USER_FILES_BUCKET.get(r2Key);

				if (!object) {
					return jsonResponse({ error: 'File not found' }, 404, responseHeaders);
				}

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

			// List files
			if (request.method === 'GET' && url.pathname === '/files/list') {
				const list = await listFiles(env, token);
				return jsonResponse({ files: list }, 200, responseHeaders);
			}

			// Delete file
			if (request.method === 'DELETE' && url.pathname === '/files/delete') {
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

			return jsonResponse({ error: 'Not found' }, 404, responseHeaders);

		} catch (error) {
			console.error(`[${requestId}] Worker error:`, error.message, error.stack);
			const status = error.statusCode || 500;
			const corsHeaders = buildCorsHeaders(request, env);
			const responseHeaders = { ...corsHeaders, 'X-Request-Id': requestId };

			return jsonResponse(
				{
					error: status === 500 ? 'Internal server error' : error.message,
					requestId: requestId,
				},
				status,
				responseHeaders
			);
		}
	},
};

function buildCorsHeaders(request, env) {
	const origin = request.headers.get('Origin') || '';
	let allowOrigin = '';

	if (origin === 'http://localhost:5000') {
		allowOrigin = origin;
	} else if (env.PROD_ORIGIN && origin === env.PROD_ORIGIN) {
		allowOrigin = origin;
	} else if (origin.endsWith('.vercel.app') && origin.startsWith('https://')) {
		allowOrigin = origin;
	}

	return {
		'Access-Control-Allow-Origin': allowOrigin,
		'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		'Access-Control-Max-Age': '86400',
		'Vary': 'Origin',
	};
}

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
	const cachedUserId = await getCachedUserId(token);
	if (cachedUserId) {
		return { userId: cachedUserId.userId, token };
	}

	// Verify user
	const user = await verifyUser(env, token);
	if (!user?.id) {
		throw Object.assign(new Error('Invalid token'), { statusCode: 401 });
	}

	// Cache successful verification
	await setCachedUserId(token, user.id);

	return { userId: user.id, token };
}

// Unified user verification (Local -> Remote Fallback)
async function verifyUser(env, token) {
	// FAST Local Verification (if secret is available)
	if (env.SUPABASE_JWT_SECRET) {
		const localUser = await verifyJwtLocal(token, env.SUPABASE_JWT_SECRET);
		if (localUser) {
			return localUser;
		}
		// If local fails (e.g. key mismatch), fall back to remote
		console.warn('[Auth] Local verification failed, falling back to remote');
	}

	// SLOW Remote Verification
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

function jsonResponse(body, status, headers) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...headers,
			'Content-Type': 'application/json',
		},
	});
}