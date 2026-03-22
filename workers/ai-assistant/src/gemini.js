import SYSTEM_INSTRUCTION from '../system_instructions.md';
import { CONFIG, GEMINI_API_BASE } from './config.js';
import { buildGeminiDebugPayload } from './cors.js';
import { normalizeFilename } from './validate.js';

export function buildPrompt(payload, identity) {
  const audience = identity.kind === 'user' ? 'logged-in user' : 'guest user';
  const header = [
    `Request type: ${payload.type}`,
    `Audience: ${audience}`,
  ];

  if (payload.filename) {
    header.push(`Current filename: ${payload.filename}`);
  }

  if (payload.type === 'new') {
    return `${header.join('\n')}\n\nUser request:\n${payload.userQuery}`;
  }

  if (payload.type === 'edit') {
    const currentCodeBlock = payload.currentCode
      ? `Current code:\n${payload.currentCode}`
      : 'Current code: none. The previous AI draft was rejected or unavailable.';

    return `${header.join('\n')}\n\n${currentCodeBlock}\n\nEdit request:\n${payload.userQuery}\n\nKeep the same filename if this is the same program.`;
  }

  return `${header.join('\n')}\n\nBroken code:\n${payload.generatedCode}\n\nCompiler error:\n${payload.errorMessage}\n\nFix attempt: ${payload.fixAttempt}/${CONFIG.MAX_FIX_ATTEMPTS}\n\nReturn corrected Turbo C code that addresses the compile error while preserving the original idea and filename.`;
}

function stripOuterFences(text) {
  let cleaned = String(text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

function extractTagContent(text, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = regex.exec(text);
  return match ? match[1].trim() : '';
}

export function parseGeminiResponse(rawText) {
  const text = stripOuterFences(rawText);
  const rawFilename = extractTagContent(text, 'filename');
  let filename = '';
  try {
    filename = normalizeFilename(rawFilename);
  } catch {
    filename = '';
  }
  const chat = extractTagContent(text, 'chat');
  const code = extractTagContent(text, 'code');

  if (!filename || !chat || !code) {
    console.error('[AI] parseGeminiResponse: missing or invalid tags', {
      hasRawFilename: Boolean(rawFilename),
      rawFilenameValue: rawFilename || '(empty)',
      validFilename: Boolean(filename),
      hasChat: Boolean(chat),
      hasCode: Boolean(code),
      rawTextPreview: text.slice(0, 600),
    });
    throw {
      statusCode: 502,
      code: 'invalid_ai_response',
      message: 'Gemini response was missing filename, chat, or code tags',
    };
  }

  return { filename, chat, code };
}

function extractGeminiText(responseJson) {
  const candidates = Array.isArray(responseJson?.candidates) ? responseJson.candidates : [];
  const firstCandidate = candidates[0];
  const parts = Array.isArray(firstCandidate?.content?.parts) ? firstCandidate.content.parts : [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
}

function extractUsage(responseJson) {
  const usage = responseJson?.usageMetadata || {};
  return {
    inputTokens: Number(usage.promptTokenCount || 0),
    outputTokens: Number(usage.candidatesTokenCount || 0),
  };
}

async function callGeminiOnce(apiKey, modelName, prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50_000);

  let response;
  try {
    response = await fetch(`${GEMINI_API_BASE}/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.45,
          topP: 0.9,
          thinkingConfig: {
            thinkingBudget: 100,
          },
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data, text };
}

export async function callGeminiWithFailover(env, prompt, nowIso, options = {}) {
  const includeDebug = options.includeDebug === true;
  const modelName = env.GEMINI_MODEL || CONFIG.MODEL_FALLBACK;

  const candidates = [
    { keyName: 'primary', secret: env.PRIMARY_KEY },
    { keyName: 'secondary', secret: env.SECONDARY_KEY },
    { keyName: 'tertiary', secret: env.TERTIARY_KEY },
  ].filter((item) => item.secret);

  if (!candidates.length) {
    throw {
      statusCode: 500,
      code: 'server_error',
      message: 'No Gemini API keys configured (PRIMARY_KEY, SECONDARY_KEY, TERTIARY_KEY)',
      debug: includeDebug
        ? buildGeminiDebugPayload('missing_api_keys', modelName, nowIso, [
            { keyName: 'primary', secret: env.PRIMARY_KEY },
            { keyName: 'secondary', secret: env.SECONDARY_KEY },
            { keyName: 'tertiary', secret: env.TERTIARY_KEY },
          ])
        : null,
    };
  }

  let lastNonRateError = null;
  let sawRateLimit = false;

  for (const candidate of candidates) {
    let gemini;
    try {
      gemini = await callGeminiOnce(candidate.secret, modelName, prompt);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Gemini request failed';
      console.error('[AI] Gemini fetch threw an exception', {
        keyName: candidate.keyName,
        model: modelName,
        errorMessage,
      });
      lastNonRateError = {
        statusCode: 502,
        code: 'upstream_error',
        message: errorMessage,
        debug: includeDebug
          ? buildGeminiDebugPayload('gemini_fetch_failed', modelName, nowIso, candidates, {
              key_name: candidate.keyName,
            })
          : null,
      };
      break;
    }

    if (gemini.status === 429) {
      console.error('[AI] Gemini rate limited (429)', { keyName: candidate.keyName, model: modelName });
      sawRateLimit = true;
      continue;
    }

    if (!gemini.ok) {
      const errorMessage = gemini.data?.error?.message || gemini.text || `Gemini returned HTTP ${gemini.status}`;
      console.error('[AI] Gemini non-200 response', {
        keyName: candidate.keyName,
        status: gemini.status,
        model: modelName,
        errorMessage,
        rawTextPreview: gemini.text?.slice(0, 500),
      });
      lastNonRateError = {
        statusCode: 502,
        code: 'upstream_error',
        message: errorMessage,
        debug: includeDebug
          ? buildGeminiDebugPayload('gemini_non_429_error', modelName, nowIso, candidates, {
              key_name: candidate.keyName,
              upstream_status: gemini.status,
            })
          : null,
      };
      break;
    }

    const outputText = extractGeminiText(gemini.data);
    if (!outputText) {
      console.error('[AI] Gemini returned empty response body', {
        keyName: candidate.keyName,
        model: modelName,
        rawDataPreview: JSON.stringify(gemini.data)?.slice(0, 300),
      });
      throw {
        statusCode: 502,
        code: 'invalid_ai_response',
        message: 'Gemini returned an empty response',
      };
    }

    return {
      keyName: candidate.keyName,
      text: outputText,
      usage: extractUsage(gemini.data),
    };
  }

  if (lastNonRateError) {
    throw lastNonRateError;
  }

  // All candidates returned 429
  throw {
    statusCode: 503,
    code: 'API_DOWN',
    message: 'AI is temporarily busy. Try again in a minute.',
    headers: { 'Retry-After': String(CONFIG.MIN_REQUEST_GAP_SECONDS) },
    debug: includeDebug
      ? buildGeminiDebugPayload('all_keys_rate_limited', modelName, nowIso, candidates)
      : null,
  };
}
