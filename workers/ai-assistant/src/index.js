import { withCors, jsonResponse, errorResponse } from './cors.js';
import {
  processAiRequest,
  processActionRequest,
  processSessionsRequest,
  processSessionMessagesRequest,
  processDeleteSessionRequest,
} from './handlers.js';

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

      if (method === 'GET' && pathname === '/health') {
        return jsonResponse({ ok: true, worker: 'graphics-oc-ai' }, 200, corsHeaders);
      }

      if (method === 'POST' && pathname === '/api/ai') {
        return await processAiRequest(request, env, ctx, corsHeaders);
      }

      if (method === 'PATCH' && pathname === '/api/ai/action') {
        return await processActionRequest(request, env, corsHeaders);
      }

      if (method === 'GET' && pathname === '/api/ai/sessions') {
        return await processSessionsRequest(request, env, corsHeaders);
      }

      if (method === 'GET' && pathname.startsWith('/api/ai/sessions/')) {
        const sessionId = pathname.slice('/api/ai/sessions/'.length);
        return await processSessionMessagesRequest(request, env, corsHeaders, sessionId);
      }

      if (method === 'DELETE' && pathname.startsWith('/api/ai/sessions/')) {
        const sessionId = pathname.slice('/api/ai/sessions/'.length);
        return await processDeleteSessionRequest(request, env, corsHeaders, sessionId);
      }

      return errorResponse('not_found', 'Route not found', 404, corsHeaders);
    } catch (error) {
      if (error?.statusCode) {
        return errorResponse(
          error.code || 'error',
          error.message,
          error.statusCode,
          {
            ...corsHeaders,
            ...(error.headers || {}),
          },
          error.debug || null
        );
      }

      console.error('[AI] Unhandled internal error', error);
      return errorResponse('internal_error', 'Internal server error', 500, corsHeaders);
    }
  },
};
