/**
 * File/folder routes for the public API worker.
 * The files worker owns authentication, D1 reads/writes, and validation.
 */

import { proxyRequest } from '../utils/proxy.js';

export async function handleFilesRoutes(request, env, method, pathname, headers) {
  const worker = env.USER_FILES_WORKER;
  if (!worker) {
    return Response.json(
      { error: 'Storage worker is not configured' },
      { status: 503, headers },
    );
  }

  // Forward directly — the files worker expects the same /api/* paths
  return proxyRequest(request, pathname, headers, worker);
}
