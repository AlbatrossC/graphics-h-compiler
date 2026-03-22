// api-test.js — run with: node api-test.js
// Tests the Gemini API directly using system_instructions.md + a custom query.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const API_KEY = env.PRIMARY_KEY;
const MODEL   = 'gemini-2.5-flash';

// ── Load system instructions ──────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = fs.readFileSync(
  path.join(__dirname, 'system_instructions.md'),
  'utf8'
);

// ── Your test query ───────────────────────────────────────────────────────────
const USER_QUERY = `Request type: new
Audience: guest user

User request:
draw a bouncing ball animation using page flipping to avoid flickering`;

// ── Call Gemini ───────────────────────────────────────────────────────────────
console.log(`Model  : ${MODEL}`);
console.log(`Query  : ${USER_QUERY.split('\n').pop()}`);
console.log('─'.repeat(60));

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: USER_QUERY }] }],
      generationConfig: {
        temperature: 0.45,
        topP: 0.9,
        thinkingConfig: { thinkingBudget: 100 },
      },
    }),
  }
);

const data = await res.json();

if (!res.ok) {
  console.error('Gemini error:', JSON.stringify(data, null, 2));
  process.exit(1);
}

// ── Parse response ────────────────────────────────────────────────────────────
const rawText = data.candidates?.[0]?.content?.parts
  ?.map(p => p.text ?? '')
  .join('\n')
  .trim() ?? '';

const usage = data.usageMetadata ?? {};
console.log(`Tokens : input=${usage.promptTokenCount ?? '?'}  output=${usage.candidatesTokenCount ?? '?'}  thinking=${usage.thoughtsTokenCount ?? '?'}`);
console.log('─'.repeat(60));

function extract(tag) {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(rawText);
  return m ? m[1].trim() : null;
}

const filename = extract('filename');
const chat     = extract('chat');
const code     = extract('code');

if (!filename || !chat || !code) {
  console.error('MISSING TAGS — raw response:');
  console.error(rawText);
  process.exit(1);
}

const lines = code.split('\n').length;
const bytes = Buffer.byteLength(code, 'utf8');

console.log(`Filename : ${filename}`);
console.log(`Chat     : ${chat}`);
console.log(`Code     : ${lines} lines  /  ${bytes} bytes`);
console.log('─'.repeat(60));
console.log('CODE PREVIEW (first 30 lines):');
console.log(code.split('\n').slice(0, 30).join('\n'));
if (lines > 30) console.log(`... (${lines - 30} more lines)`);
