# Maintenance Mode Runbook

This file is for humans and coding agents working on the site maintenance workflow. The file name is intentionally misspelled as `maintaince.md` because that is the name already used in this repo and in past requests.

## Current Model

Maintenance mode is now a runtime switch, not only a build-time `.env` setting.

The normal flow is:

```text
Dashboard button
  -> Cloudflare KV key: maintenance_mode
  -> graphics-oc-api /api/maintenance/status
  -> Pages advanced _worker.js
  -> site/templates/maintenance.html
```

The public maintenance chat uses the separate KV key:

```text
maintenance_session_slug
```

Do not delete or recreate Supabase tables to start a new chat session.

## Important URLs

| Purpose | URL |
| --- | --- |
| Dashboard | `https://graphicsh-dashboard.graphicshcompiler.workers.dev` |
| Test site | `https://test.graphics-h-compiler.pages.dev/` |
| Production site | `https://graphicsh.online/` |
| API status | `https://graphics-oc-api.graphicshcompiler.workers.dev/api/maintenance/status` |
| Test maintenance preview | `https://test.graphics-h-compiler.pages.dev/maintenance` |

Use the test site first. Do not deploy maintenance routing to production until the user explicitly says to move it to main or production.

## Key Files

- `workers/dashboard/worker.js`
  - Serves the dashboard.
  - Exposes authenticated `GET /api/maintenance` and `POST /api/maintenance`.
  - Writes `maintenance_mode`, `maintenance_session_slug`, `maintenance_updated_at`, and `maintenance_updated_by` to KV.

- `workers/dashboard/dashboard.html`
  - Contains the Site Maintenance control panel.

- `workers/dashboard/dashboard-client.js`
  - Loads the current maintenance state.
  - Enables/disables maintenance.
  - Resets the public chat session.

- `workers/dashboard/wrangler.jsonc`
  - Must include the `MAINTENANCE_KV` binding.
  - Uses the same namespace id as `graphics-oc-api`.

- `workers/graphics-oc-api/routes/maintenance.js`
  - Public read-only status route.
  - Reads `maintenance_mode` from KV and returns `{ "enabled": true | false }`.

- `site/_worker.js`
  - Cloudflare Pages advanced-mode Worker.
  - Runs before static assets on the Pages deployment.
  - When maintenance is enabled, HTML navigations return `site/templates/maintenance.html` with HTTP `503`.
  - Static assets, `/maintenance`, `/maintenance.html`, `robots.txt`, `sitemap.xml`, and similar files bypass the gate.

- `site/templates/maintenance.html`
  - The actual maintenance page UI and public chat.
  - Rendered to `dist/maintenance.html`.
  - Also available as `/maintenance` on Pages.

- `site/_routes.json`
  - Included in `dist/` for Pages routing.
  - Kept for clarity even though `site/_worker.js` is the main runtime gate.

- `build-tools/render.py`
  - Copies `_worker.js` and `_routes.json` into `dist/`.

- `build-tools/build.py`
  - Still supports the emergency build-time fallback:
    - `MAINTENANCE_MODE=true`
    - `MAINTAINCE_MODE=true`
  - That path renders a maintenance-only `dist/`.

## KV Keys

| Key | Value | Notes |
| --- | --- | --- |
| `maintenance_mode` | `true` or `false` | Runtime switch used by the dashboard, API, and Pages Worker. |
| `maintenance_session_slug` | unique slug | Groups public chat messages into one maintenance window. |
| `maintenance_updated_at` | ISO timestamp | Written by the dashboard. |
| `maintenance_updated_by` | admin email or dashboard | Written by the dashboard. |
| `maintenance_session:SLUG` | cached JSON | Short-lived cache created by the API Worker. |

KV namespace id:

```text
9c060181c3184231949421f4ed905d9b
```

Always include `--remote` when changing KV from the CLI. Without `--remote`, Wrangler may update only local development KV.

## Dashboard Workflow

1. Open the dashboard:

   ```text
   https://graphicsh-dashboard.graphicshcompiler.workers.dev
   ```

2. Sign in with the dashboard admin credentials.

3. Use the `Site Maintenance` panel.

4. To start maintenance:
   - Click `Enable maintenance`.
   - Confirm the prompt.
   - The dashboard writes `maintenance_mode=true`.
   - The dashboard also starts a fresh chat session.

5. To end maintenance:
   - Click `Disable maintenance`.
   - Confirm the prompt.
   - The dashboard writes `maintenance_mode=false`.

6. To start a new chat room without changing site status:
   - Click `Reset chat session`.
   - Confirm the prompt.
   - The dashboard writes a new `maintenance_session_slug`.

## CLI Fallback

Use these commands if the dashboard is unavailable.

Check current status:

```powershell
Invoke-WebRequest -Uri https://graphics-oc-api.graphicshcompiler.workers.dev/api/maintenance/status -UseBasicParsing
```

Enable maintenance:

```powershell
wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_mode true
```

Disable maintenance:

```powershell
wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_mode false
```

Read the current flag:

```powershell
wrangler kv key get --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_mode
```

Reset chat session:

```powershell
wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session_slug maintenance-YYYY-MM-DD-01
```

Example:

```powershell
wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session_slug maintenance-2026-07-11-test-01
```

## Verifying Maintenance Mode

After enabling maintenance, allow a short delay for KV propagation.

Check the API:

```powershell
Invoke-WebRequest -Uri https://graphics-oc-api.graphicshcompiler.workers.dev/api/maintenance/status -UseBasicParsing
```

Expected content:

```json
{"enabled":true}
```

Check the test site with a browser-style HTML request:

```powershell
curl.exe -i -H "Accept: text/html" https://test.graphics-h-compiler.pages.dev/ --max-time 15
```

Expected:

```text
HTTP/1.1 503 Service Unavailable
Content-Type: text/html; charset=utf-8
Cache-Control: no-store, no-cache, must-revalidate
```

The response body should contain:

```html
<title>graphics.h Compiler — Maintenance</title>
```

After disabling maintenance, check:

```powershell
curl.exe -I -H "Accept: text/html" https://test.graphics-h-compiler.pages.dev/about
```

Expected:

```text
HTTP/1.1 200 OK
```

## Deploying Changes

Only deploy when the user asks for it.

Dashboard Worker deploy:

```powershell
cd workers/dashboard
wrangler deploy
```

API Worker deploy:

```powershell
cd workers/graphics-oc-api
wrangler deploy
```

Pages test branch deploy:

```powershell
npm run build
wrangler pages deploy dist --project-name graphics-h-compiler --branch test
```

Pages production branch deploy:

```powershell
npm run build
wrangler pages deploy dist --project-name graphics-h-compiler --branch main
```

Do not deploy the production branch unless the user explicitly says to move to main or production.

Do not commit changes unless the user explicitly asks.

## How The Pages Gate Works

`site/_worker.js` is copied to `dist/_worker.js`.

Cloudflare Pages advanced mode uses that file as the request handler. It must call:

```js
env.ASSETS.fetch(request)
```

for normal static assets.

When maintenance is enabled, the Worker:

1. Fetches `/maintenance` from Pages assets.
2. Returns the body with status `503`.
3. Sets clean headers:

   ```text
   Content-Type: text/html; charset=utf-8
   Cache-Control: no-store, no-cache, must-revalidate
   Retry-After: 600
   ```

Important: fetch `/maintenance`, not `/maintenance.html`.

On Pages, `/maintenance.html` may redirect to `/maintenance` with an empty body. If the Worker copies that redirect response and changes the status to `503`, browsers can show a generic `HTTP ERROR 503` page instead of the custom maintenance page.

## How Chat Sessions Work

The Worker groups chat messages by a maintenance session row in Supabase.

1. Browser loads `site/templates/maintenance.html`.
2. The page calls:

   ```text
   GET /api/maintenance/chat/bootstrap?limit=30
   ```

3. The API Worker resolves the active session slug in this order:

   ```text
   MAINTENANCE_SESSION_SLUG env var
   maintenance_session_slug key in MAINTENANCE_KV
   maintenance-YYYY-MM-DD fallback
   ```

4. The API Worker finds or creates a row in `maintenance_sessions`.
5. The API Worker stores a short-lived cache for that slug in KV.
6. The page opens:

   ```text
   /api/maintenance/chat/ws?session=SESSION_ID
   ```

7. When a visitor sends their first message, the browser creates a local display name and stores it in `localStorage`.
8. The page posts:

   ```text
   POST /api/maintenance/chat/messages
   ```

9. The API Worker stores the message, attaches country metadata when available, and broadcasts through the Durable Object.

## Why Not Delete Supabase Tables

Deleting and recreating the Supabase tables is the wrong way to start fresh.

The API Worker may still have a cached session id for the previous slug. If the matching `maintenance_sessions` row was deleted, a later message post can reference a stale or missing session and return `500 Internal Server Error`.

To start fresh, rotate `maintenance_session_slug`.

If an old cached session key still causes trouble, delete the stale cache key:

```powershell
wrangler kv key delete --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session:OLD_SLUG
```

Example:

```powershell
wrangler kv key delete --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session:maintenance-2026-06-25-01
```

## Troubleshooting

### Dashboard says KV missing

Check `workers/dashboard/wrangler.jsonc`.

It must contain:

```json
{
  "binding": "MAINTENANCE_KV",
  "id": "9c060181c3184231949421f4ed905d9b"
}
```

Deploy the dashboard Worker after changing the binding:

```powershell
cd workers/dashboard
wrangler deploy
```

### API says enabled but test site still shows normal pages

Check that `dist/_worker.js` exists after build:

```powershell
Get-ChildItem dist -Force
```

Then deploy the test branch:

```powershell
wrangler pages deploy dist --project-name graphics-h-compiler --branch test
```

### Browser shows generic HTTP ERROR 503

The maintenance Worker is probably returning a `503` with an empty body.

Check:

```powershell
curl.exe -i -H "Accept: text/html" https://test.graphics-h-compiler.pages.dev/ --max-time 15
```

If you see `Content-Length: 0` or `Location: /maintenance`, inspect `site/_worker.js`.

The Worker should fetch `/maintenance`, not `/maintenance.html`, and should create clean response headers instead of copying redirect headers.

### Old chat messages still appear

Rotate the active session slug:

```powershell
wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session_slug maintenance-YYYY-MM-DD-01
```

### Chat messages return 500

Check:

- Supabase tables exist.
- `SUPABASE_REST_CONFIG` Worker secret exists on `graphics-oc-api`.
- `maintenance_session_slug` points to a valid new slug.
- Stale `maintenance_session:OLD_SLUG` cache keys are cleared if needed.

### New dashboard UI is not visible

The dashboard files live under `workers/dashboard/`, which is ignored by Git in this repo.

Deploy the dashboard Worker:

```powershell
cd workers/dashboard
wrangler deploy
```

Also bump the query string in:

- `workers/dashboard/dashboard.html`
- `workers/dashboard/users.html`

Example:

```html
<link rel="stylesheet" href="/dashboard.css?v=4">
<script src="/dashboard-client.js?v=4"></script>
```
