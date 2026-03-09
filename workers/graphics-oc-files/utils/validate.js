export const FILE_NAME_PATTERN = /^[a-zA-Z0-9_\-.]+$/;
export const MAX_FILE_SIZE_BYTES = 1_200_000;

export function validateFileName(value) {
  const fileName = typeof value === 'string' ? value.trim() : '';
  if (!fileName) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'file_name is required',
    };
  }
  if (!FILE_NAME_PATTERN.test(fileName)) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'Invalid file_name format',
    };
  }
  return fileName;
}

export function validateFolderName(value) {
  const folderName = typeof value === 'string' ? value.trim() : '';
  if (!folderName) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'folder_name is required',
    };
  }
  if (folderName.length > 100 || folderName.includes('/') || folderName.includes('\\')) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'Invalid folder_name',
    };
  }
  return folderName;
}

export function validateFolderId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'folder_id must be a string',
    };
  }
  return value.trim() || null;
}
