import { identifyCreateRequest, identifyReadRequest } from './auth.js';
import { handleCreateFixJob, handleGetFixJob, processFixJob } from './fix.js';
import { errorResponse, jsonResponse, wantsDebugDetails, withCors } from './response.js';

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = withCors(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const method = request.method.toUpperCase();
      const includeDebug = wantsDebugDetails(request);

      if (method === 'GET' && pathname === '/health') {
        return jsonResponse({ ok: true, worker: 'fix-with-ai' }, 200, corsHeaders);
      }

      if (method === 'POST' && pathname === '/api/ai/fix') {
        const bodyClone = request.clone();
        const rawBody = await bodyClone.json().catch(() => ({}));
        const identity = await identifyCreateRequest(request, env, rawBody, includeDebug);
        const result = await handleCreateFixJob(request, env, identity);
        if (result.response.status === 'pending') {
          ctx.waitUntil(
            processFixJob(env, result.response.job_id).catch((error) => {
              console.error('[FixWithAI] Background job failed', result.response.job_id, error);
            })
          );
        }
        return jsonResponse(result.response, result.status, corsHeaders);
      }

      if (method === 'GET' && pathname.startsWith('/api/ai/fix/')) {
        const identity = await identifyReadRequest(request, env, includeDebug);
        const jobId = pathname.slice('/api/ai/fix/'.length);
        const result = await handleGetFixJob(env, jobId, identity);
        return jsonResponse(result, 200, corsHeaders);
      }

      return errorResponse('not_found', 'Route not found', 404, corsHeaders);
    } catch (error) {
      if (error?.statusCode) {
        return errorResponse(
          error.code || 'error',
          error.message,
          error.statusCode,
          corsHeaders,
          error.debug || null
        );
      }

      console.error('[FixWithAI] Unhandled internal error', error);
      return errorResponse('internal_error', 'Internal server error', 500, corsHeaders);
    }
  },
};
