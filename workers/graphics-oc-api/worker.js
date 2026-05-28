/**
 * graphics-oc-api — Cloudflare Worker
 *
 * Replaces the Flask proxy layer. Handles:
 *  - /api/auth/*       → proxy to graphics-oc-files worker
 *  - /api/files, /api/file/*, /api/folder/* → proxy to graphics-oc-files worker
 *  - /api/contact, /api/feedback, /api/maintenance/message → Discord webhook
 *  - /api/maintenance/status → KV-based maintenance toggle
 */

import { handleAuthRoutes } from './routes/auth.js';
import { handleFilesRoutes } from './routes/files.js';
import { handleContactRoutes } from './routes/contact.js';
import { handleMaintenanceRoutes } from './routes/maintenance.js';
import { corsHeaders, corsPreflightResponse } from './utils/cors.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const pathname = url.pathname;
    const headers = corsHeaders(request);

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return corsPreflightResponse(headers);
    }

    try {
      // Health check
      if (method === 'GET' && pathname === '/health') {
        return Response.json({ ok: true }, { headers });
      }

      // ── Auth routes ─────────────────────────────────────────────────
      if (pathname.startsWith('/api/auth/')) {
        return await handleAuthRoutes(request, env, method, pathname, headers);
      }

      // ── File/folder routes ──────────────────────────────────────────
      if (
        pathname === '/api/files' ||
        pathname.startsWith('/api/file/') ||
        pathname.startsWith('/api/folder/')
      ) {
        return await handleFilesRoutes(request, env, method, pathname, headers);
      }

      // ── Contact / feedback ──────────────────────────────────────────
      if (
        pathname === '/api/contact' ||
        pathname === '/api/feedback' ||
        pathname === '/api/maintenance/message'
      ) {
        return await handleContactRoutes(request, env, method, pathname, headers);
      }

      // ── Maintenance status ──────────────────────────────────────────
      if (pathname === '/api/maintenance/status') {
        return await handleMaintenanceRoutes(request, env, method, headers);
      }

      return Response.json(
        { error: 'not_found', message: 'Route not found' },
        { status: 404, headers },
      );
    } catch (error) {
      console.error('Worker error:', error);
      return Response.json(
        { error: 'internal_error', message: 'Internal server error' },
        { status: 500, headers },
      );
    }
  },
};
