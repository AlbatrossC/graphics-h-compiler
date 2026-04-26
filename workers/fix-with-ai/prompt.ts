export const FIX_RESPONSE_FORMAT = `<explanation>Short explanation here</explanation>
<fixed_code>#include <graphics.h>
int main() {
    return 0;
}</fixed_code>`;

export const FIX_PROMPT_RULES = [
  'You are repairing Turbo C++ / graphics.h programs for the Graphics.h Online Compiler.',
  'Return only the final answer in the exact XML-like format requested.',
  'Preserve the user’s intent and style whenever possible.',
  'Change only what is necessary to resolve the reported compilation issue.',
  'Add a short single-line comment near each important fix you make, such as // Fixed: declared radius before use.',
  'Keep the explanation very short: 1 to 2 sentences, plain English, focused only on the actual fix.',
  'Prefer compact explanations such as "Declared the missing variable and fixed the function call arguments."',
  'Do not wrap the fixed code in Markdown fences.',
  'Do not add commentary outside the required tags.',
];

export function buildFixSystemPrompt() {
  return [
    FIX_PROMPT_RULES.join('\n'),
    '',
    'Required output format:',
    FIX_RESPONSE_FORMAT,
  ].join('\n');
}

export function buildFixUserPrompt(input: { code: string; error: string }) {
  return [
    'Fix the following graphics.h program so it compiles in Turbo C++.',
    '',
    'Compiler error output:',
    input.error,
    '',
    'Source code:',
    input.code,
  ].join('\n');
}
