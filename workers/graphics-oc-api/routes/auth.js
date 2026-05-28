/**
 * Auth routes for the public API worker.
 * Login/session/logout are handled by the files worker through a service binding,
 * which is faster and more reliable than public worker-to-worker fetches.
 */

import { proxyRequest } from '../utils/proxy.js';

export async function handleAuthRoutes(request, env, method, pathname, headers) {
  // GET /api/auth/config — return client-side auth config (no proxy needed)
  if (method === 'GET' && pathname === '/api/auth/config') {
    return Response.json(
      {
        authEnabled: !!(env.USER_FILES_WORKER && env.GOOGLE_CLIENT_ID),
        storageEnabled: !!env.USER_FILES_WORKER,
        googleClientId: env.GOOGLE_CLIENT_ID || '',
      },
      { headers },
    );
  }

  const worker = env.USER_FILES_WORKER;
  if (!worker) {
    return Response.json(
      { error: 'Authentication is not configured' },
      { status: 503, headers },
    );
  }

  // Map /api/auth/* → /auth/* on the files worker
  const workerPath = pathname.replace('/api', '');
  return proxyRequest(request, workerPath, headers, worker);
}
