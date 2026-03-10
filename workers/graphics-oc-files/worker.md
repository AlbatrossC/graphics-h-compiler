# `graphics-oc-files` Worker Overview

## Purpose

`workers/graphics-oc-files` is a Cloudflare Worker that provides authenticated file and folder storage for the Graphics.h Online Compiler.

It currently uses:

- Cloudflare Workers for the HTTP API
- Cloudflare D1 (`graphicsh_oc_db`) for persistence
- Google Identity Services on the frontend for sign-in
- Google ID token verification inside the worker
- worker-issued signed session cookies for authenticated API access

This worker is not an R2 storage worker. File contents are stored directly in D1.

## Entry Points

- `workers/graphics-oc-files/worker.js`
  - main route dispatcher
  - handles health route, auth routes, storage routes, CORS, and error formatting
- `workers/graphics-oc-files/index.js`
  - re-exports `worker.js`
- `workers/graphics-oc-files/src/index.js`
  - re-exports `../worker.js`

## Final Route Surface

Public routes:

- `GET /health`
- `POST /auth/google`
- `GET /auth/session`
- `POST /auth/logout`

Authenticated storage routes:

- `GET /api/files`
- `POST /api/file/create`
- `POST /api/file/save`
- `DELETE /api/file/delete`
- `POST /api/folder/create`
- `DELETE /api/folder/delete`

## High-Level Request Flow

### Login flow

1. Browser signs in with Google using Google Identity Services
2. Browser gets a Google ID token
3. Browser sends token to `POST /auth/google`
4. Worker verifies token against Google `tokeninfo`
5. Worker validates:
   - token exists
   - token is not expired
   - `aud` matches `GOOGLE_CLIENT_ID`
   - email is present
   - email is verified
6. Worker creates or updates the user in D1
7. Worker signs a session JWT with `SESSION_SECRET`
8. Worker returns that token as:
   - `Set-Cookie: session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/`

### Authenticated API flow

1. Browser calls `/api/*`
2. Worker reads `session` cookie
3. Worker verifies JWT signature using `SESSION_SECRET`
4. Worker checks token expiration
5. Worker loads user from D1 by `user_id`
6. Worker confirms token email matches DB email
7. Storage route executes

If `user.write_blocked === 1`, write requests return `403`.

## Public Routes

### `GET /health`

Health probe.

Response:

```json
{ "ok": true }
```

### `POST /auth/google`

Logs a user in using a Google ID token.

Request body:

```json
{
  "id_token": "<google_id_token>"
}
```

Behavior:

- verifies Google token using:
  - `https://oauth2.googleapis.com/tokeninfo?id_token=<token>`
- validates Google token audience against `GOOGLE_CLIENT_ID`
- rejects invalid or expired tokens
- provisions user on first login
- updates `last_sign_in` on repeat login
- issues signed session cookie

Success response:

```json
{
  "authenticated": true,
  "email": "user@example.com",
  "display_name": "User Name"
}
```

Response headers include:

```text
Set-Cookie: session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

Possible errors:

- `400` if `id_token` missing
- `401` if token invalid
- `500` if worker secrets are missing

### `GET /auth/session`

Returns current authenticated session state based on the `session` cookie.

Authenticated response:

```json
{
  "authenticated": true,
  "email": "user@example.com",
  "display_name": "User Name"
}
```

Unauthenticated response:

```json
{
  "authenticated": false
}
```

### `POST /auth/logout`

Clears the worker-issued session cookie.

Success response:

```json
{
  "success": true
}
```

Response headers include:

```text
Set-Cookie: session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0
```

## Authenticated Storage Routes

These routes are unchanged in request and response shape. Only the authentication mechanism changed.

### `GET /api/files`

Returns all folders and files for the authenticated user.

Response shape:

```json
{
  "folders": [
    {
      "id": "uuid",
      "folder_name": "examples"
    }
  ],
  "files": [
    {
      "id": "uuid",
      "file_name": "main.cpp",
      "file_content": "source code",
      "folder_id": "uuid-or-null",
      "folder_name": "examples"
    }
  ]
}
```

Notes:

- includes `file_content`
- files ordered by `file_name COLLATE NOCASE`
- folders ordered by `folder_name COLLATE NOCASE`

### `POST /api/file/create`

Creates a new empty file.

Request body:

```json
{
  "file_name": "main.cpp",
  "folder_id": "optional-folder-uuid-or-null"
}
```

Success response: `201`

```json
{
  "id": "uuid",
  "folder_id": "uuid-or-null",
  "file_name": "main.cpp",
  "file_content": "",
  "file_size": 0,
  "content_hash": "sha256hex"
}
```

Conflict response: `409`

```json
{
  "error": "File with this name already exists in the folder",
  "code": "conflict"
}
```

### `POST /api/file/save`

Creates or updates a file by `(user_id, folder_id, file_name)`.

Request body:

```json
{
  "file_name": "main.cpp",
  "folder_id": "optional-folder-uuid-or-null",
  "content": "full file contents"
}
```

Unchanged response: `200`

```json
{
  "success": true,
  "changed": false,
  "file_id": "uuid",
  "content_hash": "sha256hex"
}
```

Updated response: `200`

```json
{
  "success": true,
  "changed": true,
  "file_id": "uuid",
  "content_hash": "sha256hex",
  "file_size": 123
}
```

Created response: `201`

```json
{
  "success": true,
  "changed": true,
  "file_id": "uuid",
  "content_hash": "sha256hex",
  "file_size": 123
}
```

Too-large response: `413`

```json
{
  "error": "File exceeds 1.2 MB limit",
  "code": "payload_too_large"
}
```

### `DELETE /api/file/delete`

Deletes a file by `file_id`.

Request body:

```json
{
  "file_id": "uuid"
}
```

Success response:

```json
{
  "success": true,
  "file_id": "uuid"
}
```

### `POST /api/folder/create`

Creates a folder.

Request body:

```json
{
  "folder_name": "examples"
}
```

Success response: `201`

```json
{
  "id": "uuid",
  "folder_name": "examples"
}
```

Conflict response: `409`

```json
{
  "error": "Folder with this name already exists",
  "code": "conflict"
}
```

### `DELETE /api/folder/delete`

Deletes a folder and all files inside it.

Request body:

```json
{
  "folder_id": "uuid"
}
```

Success response:

```json
{
  "success": true,
  "folder_id": "uuid"
}
```

## Authentication Design

Defined in `utils/auth.js`.

### Google login verification

Worker verifies the frontend-provided Google ID token by calling:

- `https://oauth2.googleapis.com/tokeninfo?id_token=<token>`

Required checks:

- `email` exists
- `sub` exists
- `exp` exists and is in the future
- `aud === GOOGLE_CLIENT_ID`
- `email_verified !== false`

### User provisioning

On successful Google login:

- query `users` by email
- if user does not exist:
  - create `user_id = crypto.randomUUID()`
  - set `display_name`
  - set `email`
  - set `first_sign_in = Date.now()`
  - set `last_sign_in = Date.now()`
  - initialize storage stats
- if user exists:
  - update `last_sign_in`
  - keep or refresh `display_name`

### Session cookie

After login, the worker creates a signed JWT using `SESSION_SECRET`.

JWT payload:

```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "exp": 1735689600
}
```

JWT properties:

- algorithm: `HS256`
- expiration: 7 days

Cookie properties:

- `HttpOnly`
- `Secure`
- `SameSite=Lax`
- `Path=/`

### Session verification

All `/api/*` routes:

- read `session` cookie
- verify HS256 signature
- reject invalid signatures
- reject expired tokens
- load user by `user_id`
- confirm JWT email matches DB email

### Caching

Two in-memory caches exist per worker isolate:

- Google token verification cache: 5 minutes
- user cache: 60 seconds

These caches are per isolate and not durable.

## Validation Rules

Defined in `utils/validate.js`.

### File names

- required
- regex: `^[a-zA-Z0-9_\\-.]+$`
- no spaces
- no slashes

### Folder names

- required
- max length: 100
- cannot contain `/` or `\\`

### Folder ID

- `null`, `undefined`, or empty string become `null`
- otherwise must be a string

### File size

- max: `1_200_000` bytes
- measured as UTF-8 byte length of `content`

## Error Format

Structured errors use:

```json
{
  "error": "Human readable message",
  "code": "machine_readable_code"
}
```

Common statuses:

- `400` bad request
- `401` unauthorized
- `403` write blocked
- `404` not found
- `409` conflict
- `413` payload too large
- `500` internal error

## CORS

Defined in `utils/response.js`.

Allowed browser origins:

- `https://graphics-h-compiler.vercel.app`
- `https://graphics-h-online-compiler-git-test-albatrosscs-projects.vercel.app`
- `http://localhost:5000`
- `http://127.0.0.1:5000`

Behavior:

- allowed browser origins get `Access-Control-Allow-Credentials: true`
- requests without `Origin` get `Access-Control-Allow-Origin: *`
- unknown browser origins get `Access-Control-Allow-Origin: null`

Allowed headers:

- `Content-Type`
- `Cookie`

## Database Model

Defined in `schema.sql`.

### `users`

Tracks identity and aggregate usage:

- `user_id`
- `display_name`
- `email`
- `first_sign_in`
- `last_sign_in`
- `total_files`
- `total_storage`
- `write_blocked`

### `folders`

Per-user folder list:

- `id`
- `user_id`
- `folder_name`

Unique index:

- `(user_id, folder_name)`

### `files`

Stores file records and actual file content:

- `id`
- `user_id`
- `folder_id`
- `file_name`
- `file_content`
- `file_size`
- `content_hash`

Unique index:

- `(user_id, folder_id, file_name)`

Important caveat:

- duplicate root-level files may still be possible when `folder_id IS NULL` because SQL unique indexes treat `NULL` specially

## Internal Helpers

### `utils/auth.js`

Core responsibilities:

- parse cookies
- verify Google ID token
- cache verified Google tokens
- sign session JWT
- verify session JWT
- provision/update users in D1
- expose auth route handlers
- authenticate `/api/*` requests

Public exports:

- `authenticateRequest(request, env)`
- `handleGoogleLogin(request, env, corsHeaders)`
- `handleSession(request, env, corsHeaders)`
- `handleLogout(request, env, corsHeaders)`

### `utils/db.js`

- `ensureFolderOwnership(db, userId, folderId)`
- `getFileByName(db, userId, folderId, fileName)`
- `getUserFiles(db, userId)`
- `recalculateAndUpdateUserStats(db, userId)`
- `adjustUserStats(db, userId, fileDelta, storageDelta)`
- `parseSqliteError(error)`

### `utils/hash.js`

- `computeSha256Hex(content)`

### `utils/response.js`

- `withCors(request)`
- `jsonResponse(body, status, headers)`
- `errorResponse(code, message, status, headers)`
- `readJsonBody(request)`

## Configuration

Defined in `wrangler.jsonc`.

### D1 binding

- binding name: `graphicsh_oc_db`
- database name: `graphicsh_oc_db`

### Required secrets

- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`

Set them with:

```bash
wrangler secret put SESSION_SECRET
wrangler secret put GOOGLE_CLIENT_ID
```

## Deployment

From the worker directory:

```bash
cd workers/graphics-oc-files
wrangler deploy
```

If schema is not already applied to D1:

```bash
wrangler d1 execute graphicsh_oc_db --file=schema.sql --remote
```

Recommended deployment checklist:

1. ensure `schema.sql` has already been applied
2. set `SESSION_SECRET`
3. set `GOOGLE_CLIENT_ID`
4. deploy with `wrangler deploy`
5. confirm `/health` returns `200`
6. confirm `/auth/session` returns `{ "authenticated": false }` before login

## Manual Testing

### Health check

```bash
curl https://graphics-oc-files.albatrossc.workers.dev/health
```

Expected:

```json
{ "ok": true }
```

### Session before login

```bash
curl -i https://graphics-oc-files.albatrossc.workers.dev/auth/session
```

Expected body:

```json
{ "authenticated": false }
```

### Login test

You need a real Google ID token from the browser.

Then send:

```bash
curl -i \
  -X POST https://graphics-oc-files.albatrossc.workers.dev/auth/google \
  -H "Content-Type: application/json" \
  -d "{\"id_token\":\"YOUR_GOOGLE_ID_TOKEN\"}"
```

Expected:

- `200 OK`
- `Set-Cookie: session=...`
- response body with `authenticated: true`

### Session after login

Save the cookie from the previous response, then:

```bash
curl -i \
  https://graphics-oc-files.albatrossc.workers.dev/auth/session \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

Expected:

```json
{
  "authenticated": true,
  "email": "user@example.com",
  "display_name": "User Name"
}
```

### Authenticated storage test

List files:

```bash
curl -i \
  https://graphics-oc-files.albatrossc.workers.dev/api/files \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

Create file:

```bash
curl -i \
  -X POST https://graphics-oc-files.albatrossc.workers.dev/api/file/create \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -d "{\"file_name\":\"main.cpp\",\"folder_id\":null}"
```

Save file:

```bash
curl -i \
  -X POST https://graphics-oc-files.albatrossc.workers.dev/api/file/save \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_SESSION_COOKIE" \
  -d "{\"file_name\":\"main.cpp\",\"folder_id\":null,\"content\":\"#include <graphics.h>\"}"
```

### Logout test

```bash
curl -i \
  -X POST https://graphics-oc-files.albatrossc.workers.dev/auth/logout \
  -H "Cookie: session=YOUR_SESSION_COOKIE"
```

Expected:

- `200 OK`
- `Set-Cookie` clears the session

## Browser Testing

Recommended browser test sequence:

1. integrate Google Identity Services in the frontend
2. obtain Google ID token in browser
3. `POST /auth/google` with `credentials: 'include'`
4. call `GET /auth/session`
5. call `GET /api/files`
6. create folder
7. create file
8. save file
9. delete file
10. logout
11. confirm `/auth/session` returns `authenticated: false`

## Practical Summary

What this worker is now:

- a D1-backed authenticated storage API
- authenticated using Google login plus worker-issued session cookies
- able to auto-provision users
- able to enforce per-user write blocking

What it is not:

- not Better Auth based
- not R2 based
- not a full frontend login implementation by itself

The frontend still needs Google Identity Services to obtain the initial Google ID token.
