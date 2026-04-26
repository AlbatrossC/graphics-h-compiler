import { GEMINI_API_BASE } from './config.js';
import { buildFixSystemPrompt, buildFixUserPrompt } from './prompt.ts';

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
}

function buildGeminiError(message, tryCount, lastProvider) {
  const error = new Error(message);
  error.tryCount = tryCount;
  error.lastProvider = lastProvider || null;
  return error;
}

async function callGemini(apiKey, config, code, error) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: buildFixSystemPrompt() }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: buildFixUserPrompt({ code, error }) }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
            responseMimeType: 'text/plain',
          },
        }),
        signal: controller.signal,
      }
    );

    const responseText = await response.text();
    let payload = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(payload?.error?.message || `Gemini returned HTTP ${response.status}`);
    }

    const text = extractGeminiText(payload);
    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    return text;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Gemini timed out after ${config.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callGeminiWithFallback(env, config, code, error) {
  const primaryKey = String(env.PRIMARY_KEY || '').trim();
  const secondaryKey = String(env.SECONDARY_KEY || '').trim();

  if (!primaryKey && !secondaryKey) {
    throw buildGeminiError('No Gemini API keys configured', 0, null);
  }

  let primaryFailure = null;
  if (primaryKey) {
    try {
      const text = await callGemini(primaryKey, config, code, error);
      return { text, provider: 'primary', tryCount: 1 };
    } catch (error) {
      primaryFailure = error instanceof Error ? error : new Error('Primary Gemini call failed');
    }
  } else {
    primaryFailure = new Error('Primary Gemini key is missing');
  }

  if (!secondaryKey) {
    throw buildGeminiError(primaryFailure.message, primaryKey ? 1 : 0, primaryKey ? 'primary' : null);
  }

  try {
    const text = await callGemini(secondaryKey, config, code, error);
    return { text, provider: 'secondary', primaryFailure, tryCount: primaryKey ? 2 : 1 };
  } catch (error) {
    const secondaryFailure = error instanceof Error ? error : new Error('Secondary Gemini call failed');
    throw buildGeminiError(
      `Primary Gemini call failed: ${primaryFailure?.message || 'unknown error'} | Secondary Gemini call failed: ${secondaryFailure.message}`,
      primaryKey ? 2 : 1,
      'secondary'
    );
  }
}
