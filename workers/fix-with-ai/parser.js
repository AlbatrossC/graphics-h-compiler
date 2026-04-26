import { normalizeOptionalString } from './validate.js';

function stripOptionalCodeFence(value) {
  const trimmed = String(value || '').trim();
  const fencedMatch = trimmed.match(/^```[a-zA-Z0-9_+-]*\s*([\s\S]*?)```$/);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

export function parseFixResponse(rawText, config) {
  const text = String(rawText || '').trim();
  const explanationMatch = text.match(/<explanation>([\s\S]*?)<\/explanation>/i);
  const fixedCodeMatch = text.match(/<fixed_code>([\s\S]*?)<\/fixed_code>/i);

  const explanation = normalizeOptionalString(
    explanationMatch ? explanationMatch[1] : '',
    config.maxExplanationChars
  );
  const fixedCode = stripOptionalCodeFence(fixedCodeMatch ? fixedCodeMatch[1] : '');

  if (!explanation || !fixedCode) {
    throw new Error('Gemini response did not include valid <explanation> and <fixed_code> blocks');
  }

  return { explanation, fixedCode };
}
