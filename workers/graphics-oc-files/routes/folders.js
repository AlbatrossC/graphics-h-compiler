import { adjustUserStats, ensureFolderOwnership, parseSqliteError } from '../utils/db.js';
import { errorResponse, jsonResponse, readJsonBody } from '../utils/response.js';
import { validateFolderName } from '../utils/validate.js';

export const handleFolderRoutes = {
  async createFolder(request, env, user, corsHeaders) {
    const db = env.graphicsh_oc_db;
    const body = await readJsonBody(request);
    const folderName = validateFolderName(body.folder_name);
    const folderId = crypto.randomUUID();

    try {
      await db
        .prepare('INSERT INTO folders (id, user_id, folder_name) VALUES (?, ?, ?)')
        .bind(folderId, user.user_id, folderName)
        .run();
    } catch (error) {
      const parsed = parseSqliteError(error);
      if (parsed?.isUniqueConstraint) {
        return errorResponse('conflict', 'Folder with this name already exists', 409, corsHeaders);
      }
      throw error;
    }

    return jsonResponse(
      {
        id: folderId,
        folder_name: folderName,
      },
      201,
      corsHeaders
    );
  },

  async deleteFolder(request, env, user, corsHeaders) {
    const db = env.graphicsh_oc_db;
    const body = await readJsonBody(request);
    const folderId = typeof body.folder_id === 'string' ? body.folder_id.trim() : '';

    if (!folderId) {
      return errorResponse('bad_request', 'folder_id is required', 400, corsHeaders);
    }

    await ensureFolderOwnership(db, user.user_id, folderId);

    const fileStats = await db
      .prepare(
        `SELECT COUNT(*) AS files_count, COALESCE(SUM(file_size), 0) AS total_size
         FROM files
         WHERE user_id = ? AND folder_id = ?`
      )
      .bind(user.user_id, folderId)
      .first();

    const filesCount = Number(fileStats?.files_count || 0);
    const totalSize = Number(fileStats?.total_size || 0);

    await db.batch([
      db.prepare('DELETE FROM files WHERE user_id = ? AND folder_id = ?').bind(user.user_id, folderId),
      db.prepare('DELETE FROM folders WHERE user_id = ? AND id = ?').bind(user.user_id, folderId),
    ]);

    if (filesCount > 0 || totalSize > 0) {
      await adjustUserStats(db, user.user_id, -filesCount, -totalSize);
    }

    return jsonResponse({ success: true, folder_id: folderId }, 200, corsHeaders);
  },

  async renameFolder(request, env, user, corsHeaders) {
    const db = env.graphicsh_oc_db;
    const body = await readJsonBody(request);
    const folderId = typeof body.folder_id === 'string' ? body.folder_id.trim() : '';
    const newFolderName = validateFolderName(body.new_folder_name);

    if (!folderId) {
      return errorResponse('bad_request', 'folder_id is required', 400, corsHeaders);
    }

    await ensureFolderOwnership(db, user.user_id, folderId);

    // Fetch the folder to see if the name actually changes
    const folderRow = await db
      .prepare('SELECT folder_name FROM folders WHERE id = ? AND user_id = ? LIMIT 1')
      .bind(folderId, user.user_id)
      .first();

    if (!folderRow) {
      return errorResponse('not_found', 'Folder not found', 404, corsHeaders);
    }

    if (folderRow.folder_name === newFolderName) {
      return jsonResponse(
        {
          success: true,
          folder_id: folderId,
          old_folder_name: folderRow.folder_name,
          new_folder_name: newFolderName,
        },
        200,
        corsHeaders
      );
    }

    try {
      await db
        .prepare('UPDATE folders SET folder_name = ? WHERE id = ? AND user_id = ?')
        .bind(newFolderName, folderId, user.user_id)
        .run();
    } catch (error) {
      const parsed = parseSqliteError(error);
      if (parsed?.isUniqueConstraint) {
        return errorResponse('conflict', 'Folder with this name already exists', 409, corsHeaders);
      }
      throw error;
    }

    return jsonResponse(
      {
        success: true,
        folder_id: folderId,
        old_folder_name: folderRow.folder_name,
        new_folder_name: newFolderName,
      },
      200,
      corsHeaders
    );
  },
};
