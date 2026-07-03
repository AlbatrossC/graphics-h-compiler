import { handleFilesRoutes } from './routes/files.js';
import { handleFolderRoutes } from './routes/folders.js';
import {
  authenticateRequest,
  handleGoogleLogin,
  handleLogout,
  handleSession,
} from './utils/auth.js';
import { errorResponse, jsonResponse, withCors } from './utils/response.js';

const ROUTES = {
  'GET /api/files': (request, env, user, headers) => handleFilesRoutes.getFiles(env, user, headers),
  'POST /api/file/create': (request, env, user, headers) =>
    handleFilesRoutes.createFile(request, env, user, headers),
  'POST /api/file/save': (request, env, user, headers) =>
    handleFilesRoutes.saveFile(request, env, user, headers),
  'PATCH /api/file/rename': (request, env, user, headers) =>
    handleFilesRoutes.renameFile(request, env, user, headers),
  'DELETE /api/file/delete': (request, env, user, headers) =>
    handleFilesRoutes.deleteFile(request, env, user, headers),
  'POST /api/folder/create': (request, env, user, headers) =>
    handleFolderRoutes.createFolder(request, env, user, headers),
  'PATCH /api/folder/rename': (request, env, user, headers) =>
    handleFolderRoutes.renameFolder(request, env, user, headers),
  'DELETE /api/folder/delete': (request, env, user, headers) =>
    handleFolderRoutes.deleteFolder(request, env, user, headers),
};

export default {
  async fetch(request, env) {
    const corsHeaders = withCors(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const pathname = url.pathname;

      if (method === 'GET' && pathname === '/health') {
        return jsonResponse({ ok: true }, 200, corsHeaders);
      }

      if (method === 'POST' && pathname === '/auth/google') {
        return await handleGoogleLogin(request, env, corsHeaders);
      }

      if (method === 'GET' && pathname === '/auth/session') {
        return await handleSession(request, env, corsHeaders);
      }

      if (method === 'POST' && pathname === '/auth/logout') {
        return handleLogout(request, env, corsHeaders);
      }

      if (!pathname.startsWith('/api/')) {
        return errorResponse('not_found', 'Route not found', 404, corsHeaders);
      }

      const auth = await authenticateRequest(request, env);

      if (auth.user.write_blocked === 1 && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        return errorResponse('write_blocked', 'Write operations are blocked for this user', 403, corsHeaders);
      }

      const routeKey = `${method} ${pathname}`;
      const handler = ROUTES[routeKey];
      if (handler) {
        return await handler(request, env, auth.user, corsHeaders);
      }

      return errorResponse('not_found', 'Route not found', 404, corsHeaders);
    } catch (error) {
      if (error?.statusCode) {
        return errorResponse(error.code || 'error', error.message, error.statusCode, corsHeaders);
      }
      return errorResponse('internal_error', 'Internal server error', 500, corsHeaders);
    }
  },
};
