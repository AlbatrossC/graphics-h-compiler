export function normalizeOptionalString(value, maxLength) {
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

export function validateCreateBody(body, config) {
  const code = normalizeOptionalString(body?.code ?? body?.editor_code, config.maxCodeBytes);
  const error = normalizeOptionalString(body?.error, config.maxErrorBytes);

  if (!code) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'code is required',
    };
  }

  if (!error) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'error is required',
    };
  }

  const codeBytes = new TextEncoder().encode(code).byteLength;
  if (codeBytes > config.maxCodeBytes) {
    throw {
      statusCode: 413,
      code: 'payload_too_large',
      message: `code exceeds ${config.maxCodeBytes} bytes`,
    };
  }

  const errorBytes = new TextEncoder().encode(error).byteLength;
  if (errorBytes > config.maxErrorBytes) {
    throw {
      statusCode: 413,
      code: 'payload_too_large',
      message: `error exceeds ${config.maxErrorBytes} bytes`,
    };
  }

  return { code, error };
}

export function validateJobId(jobId) {
  const normalized = String(jobId || '').trim();
  if (!/^job_[a-f0-9-]{36}$/i.test(normalized)) {
    throw {
      statusCode: 400,
      code: 'bad_request',
      message: 'Invalid job id',
    };
  }
  return normalized;
}
