import { CONFIG } from './config.js';

export function normalizeOptionalString(value, maxLength = 10_000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export async function readJsonBody(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'Expected application/json body',
    };
  }

  try {
    return await request.json();
  } catch {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'Invalid JSON body',
    };
  }
}

export function validateSessionId(value) {
  const sessionId = normalizeOptionalString(value, CONFIG.MAX_SESSION_ID_LENGTH);
  if (!sessionId) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'session_id is required',
    };
  }
  return sessionId;
}

export function validateCodeSize(code, fieldName) {
  const text = typeof code === 'string' ? code : '';
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > CONFIG.MAX_CODE_BYTES) {
    throw {
      statusCode: 413,
      code: 'payload_too_large',
      message: `${fieldName} exceeds ${CONFIG.MAX_CODE_BYTES} bytes`,
    };
  }
  return text;
}

export function normalizeFilename(value) {
  if (!value) return '';
  const normalized = normalizeOptionalString(value, 64).toLowerCase();
  if (!normalized) return '';
  if (!/^ai_[a-z0-9_]{1,25}\.(cpp|c)$/.test(normalized)) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'filename must match ai_<name>.cpp or ai_<name>.c',
    };
  }
  return normalized;
}

export function validateRequestBody(body) {
  const type = normalizeOptionalString(body.type, 20).toLowerCase();
  if (!['new', 'edit', 'error'].includes(type)) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'type must be new, edit, or error',
    };
  }

  const sessionId = validateSessionId(body.session_id);
  const filename = normalizeFilename(body.filename);

  if (type === 'new') {
    const userQuery = normalizeOptionalString(body.user_query, CONFIG.MAX_QUERY_LENGTH);
    if (!userQuery) {
      throw {
        statusCode: 400,
        code: 'bad_request',
        message: 'user_query is required for new requests',
      };
    }

    return {
      type,
      sessionId,
      filename,
      userQuery,
      currentCode: '',
      generatedCode: '',
      errorMessage: '',
      fixAttempt: 0,
    };
  }

  if (type === 'edit') {
    const userQuery = normalizeOptionalString(body.user_query, CONFIG.MAX_QUERY_LENGTH);
    if (!userQuery) {
      throw {
        statusCode: 400,
        code: 'bad_request',
        message: 'user_query is required for edit requests',
      };
    }

    return {
      type,
      sessionId,
      filename,
      userQuery,
      currentCode: validateCodeSize(body.current_code || '', 'current_code'),
      generatedCode: '',
      errorMessage: '',
      fixAttempt: 0,
    };
  }

  // type === 'error'
  const generatedCode = validateCodeSize(body.generated_code || '', 'generated_code');
  const errorMessage = normalizeOptionalString(body.error, CONFIG.MAX_ERROR_LENGTH);
  const rawFixAttempt = Number.parseInt(body.fix_attempt, 10);
  const fixAttempt = Number.isFinite(rawFixAttempt) ? rawFixAttempt : 0;

  if (!generatedCode) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'generated_code is required for error requests',
    };
  }

  if (!errorMessage) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'error is required for error requests',
    };
  }

  if (fixAttempt < 1 || fixAttempt > CONFIG.MAX_FIX_ATTEMPTS) {
    throw {
      statusCode: 400,
      code: 'MAX_FIX_ATTEMPTS',
      message: `fix_attempt must be between 1 and ${CONFIG.MAX_FIX_ATTEMPTS}`,
    };
  }

  return {
    type,
    sessionId,
    filename,
    userQuery: '',
    currentCode: '',
    generatedCode,
    errorMessage,
    fixAttempt,
  };
}
