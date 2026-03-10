export async function ensureFolderOwnership(db, userId, folderId) {
  const row = await db
    .prepare('SELECT id FROM folders WHERE id = ? AND user_id = ? LIMIT 1')
    .bind(folderId, userId)
    .first();

  if (!row) {
    throw {
      statusCode: 404,
      code: 'not_found',
      message: 'Folder not found',
    };
  }
}

export async function getFileByName(db, userId, folderId, fileName) {
  const isRoot = folderId === null || folderId === undefined || folderId === '';
  const result = isRoot
    ? await db
      .prepare(
        `SELECT id, content_hash
                , COALESCE(file_size, 0) AS file_size
         FROM files
         WHERE user_id = ?
           AND folder_id IS NULL
           AND file_name = ?
         LIMIT 1`
      )
      .bind(userId, fileName)
      .first()
    : await db
      .prepare(
        `SELECT id, content_hash
                , COALESCE(file_size, 0) AS file_size
         FROM files
         WHERE user_id = ?
           AND folder_id = ?
           AND file_name = ?
         LIMIT 1`
      )
      .bind(userId, folderId, fileName)
      .first();
  return result || null;
}

export async function getUserFiles(db, userId) {
  const result = await db
    .prepare(
      `SELECT id, folder_id, file_name, file_size, content_hash
       FROM files
       WHERE user_id = ?
       ORDER BY file_name COLLATE NOCASE`
    )
    .bind(userId)
    .all();
  return result.results ?? [];
}

export async function recalculateAndUpdateUserStats(db, userId) {
  const stats = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_files,
         COALESCE(SUM(file_size), 0) AS total_storage
       FROM files
       WHERE user_id = ?`
    )
    .bind(userId)
    .first();

  const totalFiles = Number(stats?.total_files ?? 0);
  const totalStorage = Number(stats?.total_storage ?? 0);

  await db
    .prepare(
      `UPDATE users
       SET total_files = ?, total_storage = ?
       WHERE user_id = ?`
    )
    .bind(totalFiles, totalStorage, userId)
    .run();
}

export async function adjustUserStats(db, userId, fileDelta, storageDelta) {
  await db
    .prepare(
      `UPDATE users
       SET total_files = MAX(COALESCE(total_files, 0) + ?, 0),
           total_storage = MAX(COALESCE(total_storage, 0) + ?, 0)
       WHERE user_id = ?`
    )
    .bind(fileDelta, storageDelta, userId)
    .run();
}

export function parseSqliteError(error) {
  const message = String(error?.message || '');
  return {
    isUniqueConstraint: message.includes('UNIQUE constraint failed'),
  };
}
