const MAX_SEGMENT_LENGTH = 200;

export default {
	async fetch(request, env) {
		try {
			const corsHeaders = buildCorsHeaders(request, env);

			if (request.method === 'OPTIONS') {
				return new Response(null, { status: 204, headers: corsHeaders });
			}

			if (!corsHeaders['Access-Control-Allow-Origin']) {
				return jsonResponse(
					{ error: 'CORS origin not allowed' },
					403,
					corsHeaders
				);
			}

			if (!env.USER_FILES_BUCKET) {
				return jsonResponse(
					{
						error: 'Configuration error',
						message:
							'Missing R2 binding. Bind USER_FILES_BUCKET to graphics-compiler-users.',
					},
					500,
					corsHeaders
				);
			}

			if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
				return jsonResponse(
					{
						error: 'Configuration error',
						message: 'SUPABASE_URL and SUPABASE_ANON_KEY are required.',
					},
					500,
					corsHeaders
				);
			}

			const { userId, token } = await authenticateRequest(request, env);
			const url = new URL(request.url);

			if (request.method === 'POST' && url.pathname === '/files/save') {
				const body = await readJsonBody(request);
				const folder = normalizeSegment(body.folder, 'folder');
				const filename = normalizeSegment(body.filename, 'filename');
				const content =
					typeof body.content === 'string' ? body.content : null;
				const hash = typeof body.hash === 'string' ? body.hash : null;

				if (content === null || hash === null) {
					return jsonResponse(
						{ error: 'content and hash are required' },
						400,
						corsHeaders
					);
				}

				const existing = await getFileMetadata(
					env,
					token,
					folder,
					filename
				);

				if (existing && existing.file_hash === hash) {
					return jsonResponse({ success: true, hash }, 200, corsHeaders);
				}

				const r2Key = `${userId}/${folder}/${filename}`;
				await env.USER_FILES_BUCKET.put(r2Key, content, {
					httpMetadata: {
						contentType: 'text/plain; charset=utf-8',
					},
				});

				await upsertFileMetadata(env, token, {
					id: existing?.id,
					user_id: userId,
					folder,
					filename,
					file_hash: hash,
				});

				return jsonResponse({ success: true, hash }, 200, corsHeaders);
			}

			if (request.method === 'GET' && url.pathname === '/files/read') {
				const folder = normalizeSegment(
					url.searchParams.get('folder'),
					'folder'
				);
				const filename = normalizeSegment(
					url.searchParams.get('filename'),
					'filename'
				);
				const r2Key = `${userId}/${folder}/${filename}`;
				const object = await env.USER_FILES_BUCKET.get(r2Key);

				if (!object) {
					return jsonResponse({ error: 'File not found' }, 404, corsHeaders);
				}

				const text = await object.text();
				return new Response(text, {
					status: 200,
					headers: {
						...corsHeaders,
						'Content-Type': 'text/plain; charset=utf-8',
					},
				});
			}

			if (request.method === 'GET' && url.pathname === '/files/list') {
				const list = await listFiles(env, token);
				return jsonResponse({ files: list }, 200, corsHeaders);
			}

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

				return jsonResponse({ success: true }, 200, corsHeaders);
			}

			return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
		} catch (error) {
			console.error('Worker error:', error);
			const status = error.statusCode || 500;
			return jsonResponse(
				{
					error: status === 500 ? 'Internal server error' : error.message,
				},
				status,
				buildCorsHeaders(request, env)
			);
		}
	},
};

function buildCorsHeaders(request, env) {
	const origin = request.headers.get('Origin') || '';
	const allowed = new Set([
		'http://localhost:5000',
		env.PROD_ORIGIN || '',
	]);
	const allowOrigin = allowed.has(origin) ? origin : '';

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
		throw Object.assign(new Error('Missing bearer token'), {
			statusCode: 401,
		});
	}

	const token = auth.slice(7).trim();
	if (!token) {
		throw Object.assign(new Error('Missing bearer token'), {
			statusCode: 401,
		});
	}

	const user = await verifyUserViaSupabase(env, token);
	if (!user?.id) {
		throw Object.assign(new Error('Invalid token'), {
			statusCode: 401,
		});
	}

	return { userId: user.id, token };
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
		throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
	}

	return response.json();
}

function normalizeSegment(value, label) {
	if (typeof value !== 'string') {
		throw Object.assign(new Error(`${label} is required`), {
			statusCode: 400,
		});
	}

	const trimmed = value.trim();
	if (!trimmed) {
		throw Object.assign(new Error(`${label} is required`), {
			statusCode: 400,
		});
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
		throw Object.assign(
			new Error(`Supabase error: ${response.status} ${text}`),
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
