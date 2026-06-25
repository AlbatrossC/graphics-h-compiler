# Maintenance Chat Runbook

This file is for Codex, Antigravity, and any other agent working on the maintenance chat. The project intentionally uses the misspelled file name `maintaince.md` because that is how this workflow has been requested and searched for in this repo.

## Short Answer

Do not delete and recreate the Supabase tables to start a new maintenance chat session.

To start a new session, change the active maintenance session slug in the remote Cloudflare KV namespace:

```powershell
wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session_slug maintenance-YYYY-MM-DD-01
```

Use a new slug for each maintenance window, for example:

```powershell
wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session_slug maintenance-2026-06-26-01
```

Always include `--remote`. Without it, Wrangler may update only local development KV and the deployed Worker will keep using the old session.

## Related Files

- `site/templates/maintenance.html`
  - The maintenance page UI.
  - Shows the two-panel maintenance message and the public chat.
  - Generates the visitor name in `localStorage` only when the visitor sends their first message.
  - Calls the Worker chat APIs and renders country flags, names, colors, and message alignment.

- `workers/graphics-oc-api/routes/maintenance-chat.js`
  - Main Worker API route for maintenance chat.
  - Handles bootstrap, message posting, active session lookup, session creation, country detection, rate limiting, Discord notification, and the admin session endpoint.

- `workers/graphics-oc-api/routes/maintenance-chat-room.js`
  - Durable Object used for WebSocket fanout.
  - Broadcasts new messages to connected maintenance-page browsers.

- `workers/graphics-oc-api/utils/supabase-rest.js`
  - Supabase REST helper used only inside the Worker.
  - Uses the Worker secret `SUPABASE_REST_CONFIG`.

- `workers/graphics-oc-api/supabase-maintenance-chat.sql`
  - Supabase schema for `maintenance_sessions` and `maintenance_messages`.
  - Run this in Supabase SQL Editor if the tables or newer columns are missing.

- `workers/graphics-oc-api/wrangler.jsonc`
  - Cloudflare Worker config.
  - Contains the `MAINTENANCE_KV` binding and the `MAINTENANCE_CHAT_ROOM` Durable Object binding.
  - Documents Worker secrets such as `SUPABASE_REST_CONFIG` and `MAINTENANCE_ADMIN_TOKEN`.

- `build-tools/build.py` and `build-tools/render.py`
  - Build scripts.
  - `MAINTENANCE_MODE=true` builds the maintenance-only site.
  - The maintenance template is also rendered in normal builds.

## How Sessions Work

The Worker groups chat messages by a maintenance session row in Supabase.

1. Browser loads `site/templates/maintenance.html`.
2. The page calls:

   ```text
   GET /api/maintenance/chat/bootstrap?limit=30
   ```

3. The Worker resolves the active session slug in this order:

   ```text
   MAINTENANCE_SESSION_SLUG env var
   maintenance_session_slug key in MAINTENANCE_KV
   maintenance-YYYY-MM-DD fallback
   ```

4. The Worker finds or creates a row in `maintenance_sessions` for that slug.
5. The Worker stores a short-lived cache for that slug in KV.
6. The page opens the WebSocket route:

   ```text
   /api/maintenance/chat/ws?session=SESSION_ID
   ```

7. When a visitor sends their first message, the browser generates a local display name such as `Foxy-red` or `Cow-blue` and stores it in `localStorage`.
8. The page posts the message:

   ```text
   POST /api/maintenance/chat/messages
   ```

9. The Worker stores the message in `maintenance_messages`, attaches the real country from Cloudflare request metadata when available, and broadcasts the message through the Durable Object.

## Starting A New Maintenance Session

Use this process when the site goes into maintenance again and old messages should not appear in the new chat.

1. Pick a new unique slug.

   Examples:

   ```text
   maintenance-2026-06-26-01
   maintenance-2026-06-29-evening
   maintenance-2026-07-03-db-upgrade
   ```

2. Put the slug into remote KV:

   ```powershell
   wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session_slug maintenance-2026-06-26-01
   ```

3. Refresh the maintenance page.

4. Send a test message.

5. Confirm the new message appears and old messages are not mixed into the current room.

No Supabase table deletion is required.

## Optional Admin API

There is also a protected API route:

```text
POST https://graphics-oc-api.graphicshcompiler.workers.dev/api/maintenance/chat/admin/session
```

Expected request:

```http
Authorization: Bearer YOUR_MAINTENANCE_ADMIN_TOKEN
Content-Type: application/json
```

```json
{
  "slug": "maintenance-2026-06-26-01"
}
```

This route updates the same active session slug in KV and creates or returns the Supabase session.

The Worker secret must exist first:

```powershell
wrangler secret put MAINTENANCE_ADMIN_TOKEN
```

If the secret is not configured, the endpoint returns `admin_token_not_configured`.

## Why Deleting Tables Breaks Things

Deleting and recreating the Supabase tables is the wrong way to start fresh.

The Worker may still have a cached session id for the previous slug. If the matching `maintenance_sessions` row was deleted, a later message post can reference a stale or missing session and return `500 Internal Server Error`.

If this already happened:

1. Make sure the Supabase schema exists by running:

   ```text
   workers/graphics-oc-api/supabase-maintenance-chat.sql
   ```

2. Set a new remote KV slug:

   ```powershell
   wrangler kv key put --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session_slug maintenance-2026-06-26-02
   ```

3. Refresh the maintenance page and send a test message.

If an old cached session key still causes trouble, delete that cache key from remote KV:

```powershell
wrangler kv key delete --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session:OLD_SLUG
```

Replace `OLD_SLUG` with the stale slug, for example:

```powershell
wrangler kv key delete --remote --namespace-id 9c060181c3184231949421f4ed905d9b maintenance_session:maintenance-2026-06-25-01
```

## Deploying Changes

Only deploy when the user asks for it.

Worker deploy:

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

Do not commit changes unless the user explicitly asks.

## Quick Troubleshooting

- `POST /api/maintenance/chat/messages` returns 500:
  - Check that the Supabase schema exists.
  - Set a new remote KV session slug.
  - Clear the stale `maintenance_session:OLD_SLUG` cache key if needed.

- Country flag does not show:
  - Check that the message has `country_code`.
  - The Worker reads country data from Cloudflare request metadata, so local development may not always have the same country data as production.
  - The page renders flag images from `https://flagcdn.com/w40/{country_code}.png`.

- New UI or Worker code is not visible on the test URL:
  - Build and deploy the Pages test branch only if the user asked for deployment.
  - Deploy the Worker only if Worker route code changed and deployment is requested.

- Old messages still appear:
  - The active session slug was probably not changed in remote KV.
  - Verify the slug was written with `--remote`.
  - Use a unique slug for every maintenance window.
