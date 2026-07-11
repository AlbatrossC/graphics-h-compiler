import { computeSha256Hex } from '../utils/hash.js';
import {
  adjustUserStats,
  ensureFolderOwnership,
  getFileByName,
  getUserFiles,
  parseSqliteError,
} from '../utils/db.js';
import { errorResponse, jsonResponse, readJsonBody } from '../utils/response.js';
import { MAX_FILE_SIZE_BYTES, validateFileName, validateFolderId } from '../utils/validate.js';

export const handleFilesRoutes = {
  async getFiles(env, user, corsHeaders) {
    const db = env.graphicsh_oc_db;

    const userStmt = db
      .prepare('SELECT last_opened_file_id FROM users WHERE user_id = ? LIMIT 1')
      .bind(user.user_id);
    const foldersStmt = db
      .prepare('SELECT id, folder_name FROM folders WHERE user_id = ? ORDER BY folder_name COLLATE NOCASE')
      .bind(user.user_id);
    const filesStmt = db
      .prepare(
        `SELECT
          f.id,
          f.file_name,
          f.file_content,
          f.folder_id,
          f.file_size,
          f.content_hash,
          fo.folder_name
        FROM files f
        LEFT JOIN folders fo ON f.folder_id = fo.id AND fo.user_id = ?
        WHERE f.user_id = ?
        ORDER BY f.file_name COLLATE NOCASE`
      )
      .bind(user.user_id, user.user_id);

    const [userRes, foldersRes, filesRes] = await db.batch([userStmt, foldersStmt, filesStmt]);

    return jsonResponse(
      {
        last_opened_file_id: userRes?.results?.[0]?.last_opened_file_id ?? null,
        folders: foldersRes.results ?? [],
        files: filesRes.results ?? [],
      },
      200,
      corsHeaders
    );
  },

  async createFile(request, env, user, corsHeaders) {
    const db = env.graphicsh_oc_db;
    const body = await readJsonBody(request);
    const folderId = validateFolderId(body.folder_id);
    const fileName = validateFileName(body.file_name);

    if (folderId) {
      await ensureFolderOwnership(db, user.user_id, folderId);
    }

    const emptyContent = '';
    const emptyHash = await computeSha256Hex(emptyContent);
    const fileId = crypto.randomUUID();

    const existingFile = await getFileByName(db, user.user_id, folderId, fileName);
    if (existingFile) {
      return errorResponse('conflict', 'File with this name already exists in the folder', 409, corsHeaders);
    }

    const now = Date.now();
    try {
      await db
        .prepare(
          `INSERT INTO files (id, user_id, folder_id, file_name, file_content, file_size, content_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(fileId, user.user_id, folderId, fileName, emptyContent, 0, emptyHash, now, now)
        .run();
    } catch (error) {
      const parsed = parseSqliteError(error);
      if (parsed?.isUniqueConstraint) {
        return errorResponse('conflict', 'File with this name already exists in the folder', 409, corsHeaders);
      }
      throw error;
    }

    await adjustUserStats(db, user.user_id, 1, 0);

    return jsonResponse(
      {
        id: fileId,
        folder_id: folderId,
        file_name: fileName,
        file_content: emptyContent,
        file_size: 0,
        content_hash: emptyHash,
      },
      201,
      corsHeaders
    );
  },

  async saveFile(request, env, user, corsHeaders) {
    const db = env.graphicsh_oc_db;
    const body = await readJsonBody(request);
    const folderId = validateFolderId(body.folder_id);
    const fileName = validateFileName(body.file_name);
    const content = typeof body.content === 'string' ? body.content : '';

    if (folderId) {
      await ensureFolderOwnership(db, user.user_id, folderId);
    }

    const contentBytes = new TextEncoder().encode(content).byteLength;
    if (contentBytes > MAX_FILE_SIZE_BYTES) {
      return errorResponse('payload_too_large', 'File exceeds 1.2 MB limit', 413, corsHeaders);
    }

    const contentHash = await computeSha256Hex(content);
    const existingFile = await getFileByName(db, user.user_id, folderId, fileName);

    const now = Date.now();
    let savedFileId = null;
    let isCreated = false;
    let changed = false;

    if (existingFile) {
      if (existingFile.content_hash !== contentHash) {
        await db
          .prepare(
            `UPDATE files
             SET file_content = ?, file_size = ?, content_hash = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`
          )
          .bind(content, contentBytes, contentHash, now, existingFile.id, user.user_id)
          .run();
        changed = true;
      }
      savedFileId = existingFile.id;
    } else {
      savedFileId = crypto.randomUUID();
      try {
        await db
          .prepare(
            `INSERT INTO files (id, user_id, folder_id, file_name, file_content, file_size, content_hash, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(savedFileId, user.user_id, folderId, fileName, content, contentBytes, contentHash, now, now)
          .run();
        changed = true;
        isCreated = true;
      } catch (error) {
        const parsed = parseSqliteError(error);
        if (parsed?.isUniqueConstraint) {
          return errorResponse('conflict', 'File with this name already exists in the folder', 409, corsHeaders);
        }
        throw error;
      }
    }

    if (!changed) {
      if (existingFile?.id) {
        await db
          .prepare(
            `UPDATE users
             SET last_opened_file_id = ?
             WHERE user_id = ?`
          )
          .bind(existingFile.id, user.user_id)
          .run();
      }
      return jsonResponse(
        {
          success: true,
          changed: false,
          file_id: existingFile?.id ?? null,
          content_hash: contentHash,
        },
        200,
        corsHeaders
      );
    }

    await db
      .prepare(
        `UPDATE users
         SET last_opened_file_id = ?
         WHERE user_id = ?`
      )
      .bind(savedFileId, user.user_id)
      .run();
    const previousSize = Number(existingFile?.file_size || 0);
    const storageDelta = isCreated ? contentBytes : contentBytes - previousSize;
    await adjustUserStats(db, user.user_id, isCreated ? 1 : 0, storageDelta);

    const statusCode = isCreated ? 201 : 200;

    return jsonResponse(
      {
        success: true,
        changed: true,
        file_id: savedFileId,
        content_hash: contentHash,
        file_size: contentBytes,
      },
      statusCode,
      corsHeaders
    );
  },

  async deleteFile(request, env, user, corsHeaders) {
    const db = env.graphicsh_oc_db;
    const body = await readJsonBody(request);
    const fileId = typeof body.file_id === 'string' ? body.file_id.trim() : '';

    if (!fileId) {
      return errorResponse('bad_request', 'file_id is required', 400, corsHeaders);
    }

    const fileRow = await db
      .prepare('SELECT id, COALESCE(file_size, 0) AS file_size FROM files WHERE id = ? AND user_id = ? LIMIT 1')
      .bind(fileId, user.user_id)
      .first();

    if (!fileRow) {
      return errorResponse('not_found', 'File not found', 404, corsHeaders);
    }

    await db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').bind(fileId, user.user_id).run();
    await adjustUserStats(db, user.user_id, -1, -Number(fileRow.file_size || 0));

    return jsonResponse({ success: true, file_id: fileId }, 200, corsHeaders);
  },

  async renameFile(request, env, user, corsHeaders) {
    const db = env.graphicsh_oc_db;
    const body = await readJsonBody(request);
    const fileId = typeof body.file_id === 'string' ? body.file_id.trim() : '';
    const newFileName = validateFileName(body.new_file_name);

    if (!fileId) {
      return errorResponse('bad_request', 'file_id is required', 400, corsHeaders);
    }

    const fileRow = await db
      .prepare('SELECT id, file_name, folder_id FROM files WHERE id = ? AND user_id = ? LIMIT 1')
      .bind(fileId, user.user_id)
      .first();

    if (!fileRow) {
      return errorResponse('not_found', 'File not found', 404, corsHeaders);
    }

    if (fileRow.file_name === 'main.cpp') {
      return errorResponse('forbidden', 'main.cpp cannot be renamed', 403, corsHeaders);
    }

    if (fileRow.file_name === newFileName) {
      return jsonResponse(
        {
          success: true,
          file_id: fileId,
          old_file_name: fileRow.file_name,
          new_file_name: newFileName,
        },
        200,
        corsHeaders
      );
    }

    const existingFile = await getFileByName(db, user.user_id, fileRow.folder_id, newFileName);
    if (existingFile) {
      return errorResponse('conflict', 'File with this name already exists in the folder', 409, corsHeaders);
    }

    try {
      await db
        .prepare('UPDATE files SET file_name = ? WHERE id = ? AND user_id = ?')
        .bind(newFileName, fileId, user.user_id)
        .run();
    } catch (error) {
      const parsed = parseSqliteError(error);
      if (parsed?.isUniqueConstraint) {
        return errorResponse('conflict', 'File with this name already exists in the folder', 409, corsHeaders);
      }
      throw error;
    }

    return jsonResponse(
      {
        success: true,
        file_id: fileId,
        old_file_name: fileRow.file_name,
        new_file_name: newFileName,
      },
      200,
      corsHeaders
    );
  },
};

export async function listUserFilesOnly(env, userId) {
  return getUserFiles(env.graphicsh_oc_db, userId);
}
