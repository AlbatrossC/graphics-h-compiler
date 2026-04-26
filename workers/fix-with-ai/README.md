# Fix with AI Worker

This worker powers the compiler’s asynchronous `Fix with AI` flow.

## Architecture

- `index.js`
  Routes HTTP requests and starts background jobs with `ctx.waitUntil(...)`.
- `fix.js`
  Thin orchestration layer for create/poll/process flows.
- `validate.js`
  Request parsing, input normalization, and payload validation.
- `db.js`
  D1 access helpers for deduplication, rate limiting, and job status updates.
- `gemini.js`
  Gemini transport and primary/secondary fallback behavior.
- `parser.js`
  Strict parsing of the `<explanation>` and `<fixed_code>` response format.
- `prompt.ts`
  Holds the editable Gemini system prompt and user prompt builder.
- `auth.js`
  Resolves identity from the shared session cookie or a guest fingerprint.
- `response.js`
  Shared CORS and JSON helpers.
- `config.js`
  Centralizes model, timeout, input limits, and daily rate limits.

## Flow

```text
Frontend
  POST /api/ai/fix
    -> worker validates input + identity
    -> checks D1 for duplicate hash
    -> enforces daily rate limit from D1
    -> inserts fix_jobs row with status=pending
    -> returns 202 immediately with job_id
    -> waitUntil(processFixJob(job_id))

Background job
  -> call Gemini with primary key
  -> on any failure, retry once with secondary key
  -> parse strict <explanation> + <fixed_code> response
  -> update D1 row to done or failed

Frontend
  GET /api/ai/fix/<job_id>
    -> polls until status becomes done or failed
    -> applies fixed code + renders explanation
```

## Setup

1. Use the D1 database:
   Name: `graphics_oc_fix`
   ID: `69c1c00a-153f-4543-b3de-c4c8b184cf9e`
2. Apply the schema:
   `cd workers/fix-with-ai`
   `npx wrangler d1 execute graphics_oc_fix --remote --file=schema.sql`
3. If you want a clean rebuild during development, reset the table first:
   `npx wrangler d1 execute graphics_oc_fix --remote --file=reset.sql`
4. Set Worker secrets:
   `npx wrangler secret put SESSION_SECRET`
   `npx wrangler secret put PRIMARY_KEY`
   `npx wrangler secret put SECONDARY_KEY`
5. Deploy the worker:
   `npx wrangler deploy`
6. Point Flask at the deployed worker URL:
   PowerShell:
   `$env:FIX_WITH_AI_WORKER="https://your-worker-name.your-subdomain.workers.dev"`
   CMD:
   `set FIX_WITH_AI_WORKER=https://your-worker-name.your-subdomain.workers.dev`
7. Start the Flask app after setting the env var:
   PowerShell:
   `$env:FIX_WITH_AI_WORKER="https://your-worker-name.your-subdomain.workers.dev"; python app.py`

## Required Environment Variables

- `SESSION_SECRET`
  Must match the auth/files worker so logged-in sessions can be verified.
- `PRIMARY_KEY`
  Primary Gemini API key.
- `SECONDARY_KEY`
  Secondary Gemini API key used for one fallback retry.
- `GEMINI_MODEL`
  Defaults to `gemini-2.5-flash`.
- `FIX_AI_TIMEOUT_MS`
  Per-request Gemini timeout.
- `FIX_AI_EMAIL_LIMIT_PER_DAY`
  Logged-in user daily limit. Default: `20`.
- `FIX_AI_FINGERPRINT_LIMIT_PER_DAY`
  Guest daily limit. Default: `10`.
- `FIX_AI_MAX_CODE_BYTES`
  Max source input size.
- `FIX_AI_MAX_ERROR_BYTES`
  Max compiler error input size.

## Wrangler Variables

These non-secret vars are already defined in `wrangler.jsonc`, but you can adjust them there before deploy:

- `GEMINI_MODEL`
- `FIX_AI_TIMEOUT_MS`
- `FIX_AI_EMAIL_LIMIT_PER_DAY`
- `FIX_AI_FINGERPRINT_LIMIT_PER_DAY`
- `FIX_AI_MAX_CODE_BYTES`
- `FIX_AI_MAX_ERROR_BYTES`

## Deployment Commands

From `workers/fix-with-ai`:

```powershell
npm install -g wrangler
npx wrangler login
npx wrangler d1 execute graphics_oc_fix --remote --file=schema.sql
npx wrangler d1 execute graphics_oc_fix --remote --file=reset.sql
npx wrangler secret put SESSION_SECRET
npx wrangler secret put PRIMARY_KEY
npx wrangler secret put SECONDARY_KEY
npx wrangler deploy
```

Use `schema.sql` for normal creation/migration and `reset.sql` only when you want to drop and recreate the table during development.

## Fallback Behavior

- The worker always tries `PRIMARY_KEY` first.
- Any primary failure triggers exactly one retry with `SECONDARY_KEY`.
- There are no further retries.
- If both fail, the job is marked `failed` in D1.
- Each job stores `api_key_used` and `gemini_try_count` so you can query how often primary vs secondary succeeds and how many Gemini attempts each fix needed.

## Prompt Customization

- Edit `prompt.ts`.
- `buildFixSystemPrompt()` controls the reusable system rules.
- `buildFixUserPrompt()` controls the job-specific request payload.
- The required response format is declared there too, so prompt changes stay out of runtime logic.

## Rate Limiting

- Logged-in users are identified by email and limited to `20/day` by default.
- Anonymous users are identified by fingerprint and limited to `10/day` by default.
- Limits are enforced from `fix_jobs` rows for the current `request_date`.
- Duplicate requests with the same hash for the same identity reuse the existing job instead of creating a new one.
