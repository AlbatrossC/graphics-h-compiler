# Changes

## Summary
- Refactored the Cloudflare Worker auth + storage pipeline for clearer routing, faster validation, and consistent error responses.
- Simplified frontend storage/auth flow to avoid duplicate refreshes and surface actionable errors to users.
- Improved Flask proxy diagnostics with missing-env reporting and request IDs.
- Moved Worker Supabase config to secrets (no longer hardcoded in Wrangler config).

## Detailed Changes

### Worker (`workers/graphics-compiler-users-worker/src/index.js`)
- Added centralized config validation with a consistent error payload (`code`, `error`, optional `missing`, `requestId`).
- Introduced `ALLOWED_ORIGINS` support and normalized CORS checks for multi-origin deploys.
- Refactored request handling into explicit handlers:
  - `handleBeaconSave`, `handleSave`, `handleBatchSave`, `handleRead`, `handleList`, `handleDelete`.
- Unified auth timeouts through `withTimeout` and simplified content hashing with `computeContentHash`.
- Improved error reporting for auth failures, config issues, and not-found responses.

### Frontend (`static/js/compiler/storage.js` + `static/js/compiler/runtime.js`)
- Added robust error parsing for both JSON and non-JSON error bodies (`readErrorBody`).
- Expanded user-facing error messages with `code`, `missing`, and `requestId` when present.
- Improved auth config failure messaging so the UI explains server misconfiguration.
- Removed duplicate refresh call from `updateLoginUI` to avoid extra background requests.

### Proxy (`app.py`)
- Added missing-env reporting in `/api/auth/config` with `missing` list.
- Added request IDs for `/files/*` proxy responses and worker upstream errors.
- Improved proxy error payloads to include `target` and `requestId` on upstream failures.

### Worker Config (`workers/graphics-compiler-users-worker/wrangler.jsonc`)
- Removed hardcoded `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `vars` to enforce secrets-only configuration.
- Cleaned boilerplate comments for a smaller, clearer config file.

## Operational Notes
- Worker now requires secrets:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_JWT_SECRET`
- Optional env var for multiple origins:
  - `ALLOWED_ORIGINS` (comma-separated list)

## Deployment Checklist
1. Set Worker secrets:
   - `npx wrangler secret put SUPABASE_URL`
   - `npx wrangler secret put SUPABASE_ANON_KEY`
   - `npx wrangler secret put SUPABASE_JWT_SECRET`
2. Deploy Worker: `npx wrangler deploy`
3. Ensure Vercel envs for Preview + Production:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `STORAGE_WORKER_URL`
4. Confirm `/api/auth/config` returns 200 on both local and preview
5. Confirm `/files/list` returns 401 when unauthenticated and 200 after sign-in
