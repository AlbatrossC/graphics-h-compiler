# Workers API

This document covers the two Cloudflare Workers that power the backend: `graphics-oc-api` (the public API gateway) and `graphics-oc-files` (the file storage and authentication service).

---

## Table of Contents

- [Architecture](#architecture)
- [Worker 1: graphics-oc-api (Public Gateway)](#worker-1-graphics-oc-api-public-gateway)
  - [Route Table](#api-worker-route-table)
  - [Bindings](#api-worker-bindings)
  - [Secrets](#api-worker-secrets)
  - [File Structure](#api-worker-file-structure)
- [Worker 2: graphics-oc-files (File Storage & Auth)](#worker-2-graphics-oc-files-file-storage--auth)
  - [Route Table](#files-worker-route-table)
  - [Bindings](#files-worker-bindings)
  - [Secrets](#files-worker-secrets)
  - [File Structure](#files-worker-file-structure)
- [Database Schema](#database-schema)
  - [users Table](#users-table)
  - [folders Table](#folders-table)
  - [files Table](#files-table)
  - [Indexes](#indexes)
- [Authentication Flow](#authentication-flow)
  - [Google Sign-In](#google-sign-in)
  - [JWT Session Tokens](#jwt-session-tokens)
  - [Session Cookie](#session-cookie)
  - [Session Check](#session-check)
  - [Logout](#logout)
  - [Request Authentication](#request-authentication)
  - [Write Blocking](#write-blocking)
- [File Operations](#file-operations)
  - [GET /api/files — List All Files](#get-apifiles--list-all-files)
  - [POST /api/file/create — Create New File](#post-apifilecreate--create-new-file)
  - [POST /api/file/save — Save File (Upsert)](#post-apifilesave--save-file-upsert)
  - [DELETE /api/file/delete — Delete File](#delete-apifiledelete--delete-file)
- [Folder Operations](#folder-operations)
  - [POST /api/folder/create — Create Folder](#post-apifoldercreate--create-folder)
  - [DELETE /api/folder/delete — Delete Folder](#delete-apifolderdelete--delete-folder)
- [Request Proxying (Service Bindings)](#request-proxying-service-bindings)
- [In-Memory Caching](#in-memory-caching)
- [CORS Handling](#cors-handling)
- [Error Response Format](#error-response-format)
- [Input Validation](#input-validation)
- [Deploying Workers](#deploying-workers)
- [File Reference](#file-reference)

---

## Architecture

```
                         ┌──────────────────────────────┐
                         │        Browser Client         │
                         └──────────────┬───────────────┘
                                        │
                    Static pages (HTML)  │  API calls (/api/*)
                    ┌───────────────┐    │    ┌──────────────────────────────────┐
                    │  Cloudflare   │    │    │  graphics-oc-api                 │
                    │  Pages        │    │    │  (Public API Worker)             │
                    │               │    │    │                                  │
                    │  dist/        │◄───┘───►│  • CORS handling                 │
                    └───────────────┘         │  • /api/contact → Discord        │
                                             │  • /api/feedback → Discord       │
                                             │  • /api/maintenance → KV store   │
                                             │  • /api/auth/* → proxy           │
                                             │  • /api/files → proxy            │
                                             │  • /api/file/* → proxy           │
                                             │  • /api/folder/* → proxy         │
                                             └──────────────┬───────────────────┘
                                                            │
                                              Service Binding (zero-latency,
                                              no network hop, internal only)
                                                            │
                                             ┌──────────────▼───────────────────┐
                                             │  graphics-oc-files               │
                                             │  (File Storage Worker)           │
                                             │                                  │
                                             │  • Google token verification     │
                                             │  • JWT session management        │
                                             │  • User CRUD (D1)               │
                                             │  • File CRUD (D1)               │
                                             │  • Folder CRUD (D1)             │
                                             │  • In-memory caching            │
                                             │                                  │
                                             │  ┌────────────────────────────┐  │
                                             │  │  Cloudflare D1 (SQLite)    │  │
                                             │  │  graphicsh_oc_db           │  │
                                             │  │                            │  │
                                             │  │  • users                   │  │
                                             │  │  • folders                 │  │
                                             │  │  • files                   │  │
                                             │  └────────────────────────────┘  │
                                             └──────────────────────────────────┘
```

**Why two workers?** Separation of concerns:
- The **API worker** owns the public-facing surface: CORS policy, contact forms, maintenance mode, and routing. It never touches the database directly.
- The **Files worker** owns auth, validation, and all database operations. It's not publicly accessible — only reachable via the API worker's service binding.

---

## Worker 1: graphics-oc-api (Public Gateway)

### API Worker Route Table

| Method | Path | Handler | Description |
|:---|:---|:---|:---|
| `GET` | `/health` | Inline | Returns `{ ok: true }` |
| `POST` | `/api/auth/google` | `routes/auth.js` | Proxied to files worker |
| `GET` | `/api/auth/session` | `routes/auth.js` | Proxied to files worker |
| `POST` | `/api/auth/logout` | `routes/auth.js` | Proxied to files worker |
| `GET` | `/api/auth/config` | `routes/auth.js` | Returns auth config (`authEnabled`, `googleClientId`) |
| `GET` | `/api/files` | `routes/files.js` | Proxied to files worker |
| `POST` | `/api/file/create` | `routes/files.js` | Proxied to files worker |
| `POST` | `/api/file/save` | `routes/files.js` | Proxied to files worker |
| `DELETE` | `/api/file/delete` | `routes/files.js` | Proxied to files worker |
| `POST` | `/api/folder/create` | `routes/files.js` | Proxied to files worker |
| `DELETE` | `/api/folder/delete` | `routes/files.js` | Proxied to files worker |
| `POST` | `/api/contact` | `routes/contact.js` | Sends to Discord webhook |
| `POST` | `/api/feedback` | `routes/contact.js` | Sends to Discord webhook |
| `GET` | `/api/maintenance` | `routes/maintenance.js` | Reads from MAINTENANCE_KV |
| `OPTIONS` | `*` | Inline | CORS preflight (returns 204) |

### API Worker Bindings

From `wrangler.jsonc`:

```jsonc
{
  "kv_namespaces": [
    { "binding": "MAINTENANCE_KV", "id": "9c060181c3184231949421f4ed905d9b" }
  ],
  "services": [
    { "binding": "USER_FILES_WORKER", "service": "graphics-oc-files" }
  ]
}
```

- **`MAINTENANCE_KV`** — Cloudflare KV namespace for maintenance mode state
- **`USER_FILES_WORKER`** — Service binding to the files worker (zero-latency internal routing)

### API Worker Secrets

Set via `npx wrangler secret put <NAME>`:

- **`DISCORD_WEBHOOK_URL`** — Discord webhook for contact and feedback submissions
- **`GOOGLE_CLIENT_ID`** — Google OAuth client ID (used for the `/api/auth/config` endpoint)

### API Worker File Structure

```
workers/graphics-oc-api/
├── worker.js              # Main router (fetch handler)
├── wrangler.jsonc          # Worker configuration
├── routes/
│   ├── auth.js            # Proxies auth routes to files worker
│   ├── files.js           # Proxies file/folder routes to files worker
│   ├── contact.js         # Contact form → Discord webhook
│   └── maintenance.js     # KV-backed maintenance mode
└── utils/
    ├── cors.js            # CORS header construction
    ├── discord.js         # Discord embed message formatting
    └── proxy.js           # Service binding proxy utility (87 lines)
```

---

## Worker 2: graphics-oc-files (File Storage & Auth)

### Files Worker Route Table

Defined as a static `ROUTES` object in `worker.js` (line 11):

```js
const ROUTES = {
    'GET /api/files':           handleFilesRoutes.getFiles,
    'POST /api/file/create':    handleFilesRoutes.createFile,
    'POST /api/file/save':      handleFilesRoutes.saveFile,
    'DELETE /api/file/delete':   handleFilesRoutes.deleteFile,
    'POST /api/folder/create':  handleFolderRoutes.createFolder,
    'DELETE /api/folder/delete': handleFolderRoutes.deleteFolder,
};
```

Additionally, these routes are handled directly in the `fetch` handler:

| Method | Path | Handler | Auth required |
|:---|:---|:---|:---|
| `GET` | `/health` | Inline | No |
| `POST` | `/auth/google` | `utils/auth.js` → `handleGoogleLogin` | No |
| `GET` | `/auth/session` | `utils/auth.js` → `handleSession` | No (returns `authenticated: false` if no session) |
| `POST` | `/auth/logout` | `utils/auth.js` → `handleLogout` | No |

All `/api/*` routes go through `authenticateRequest()` first.

### Files Worker Bindings

From `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "graphicsh_oc_db",
      "database_name": "graphicsh_oc_db",
      "database_id": "22ea0eb9-9254-4ad9-97b0-3601b7969aa3"
    }
  ]
}
```

### Files Worker Secrets

- **`SESSION_SECRET`** — HMAC key for signing/verifying JWT session tokens
- **`GOOGLE_CLIENT_ID`** — For verifying Google ID tokens against the expected audience

### Files Worker File Structure

```
workers/graphics-oc-files/
├── worker.js              # Main router with ROUTES table
├── wrangler.jsonc          # Worker configuration
├── schema.sql             # D1 database schema (3 tables, 6 indexes)
├── routes/
│   ├── files.js           # File CRUD operations (236 lines)
│   └── folders.js         # Folder create/delete (70 lines)
└── utils/
    ├── auth.js            # Google auth, JWT sessions, user cache (468 lines)
    ├── db.js              # Database helpers (adjustUserStats, ensureFolderOwnership)
    ├── hash.js            # SHA-256 hex hashing (computeSha256Hex)
    ├── response.js        # JSON response, error response, readJsonBody helpers
    └── validate.js        # Input validation (file name, folder name, folder ID, size limits)
```

---

## Database Schema

The D1 database `graphicsh_oc_db` uses three tables. Schema is defined in `schema.sql`.

### users Table

```sql
CREATE TABLE IF NOT EXISTS users (
    sr_no INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,          -- UUID, primary identifier
    display_name TEXT,                     -- Google display name
    email TEXT,                            -- Google email (unique, case-insensitive)
    avatar_url TEXT,                       -- Google profile picture URL
    first_sign_in INTEGER,                 -- Unix timestamp (ms) of first sign-in
    last_sign_in INTEGER,                  -- Unix timestamp (ms) of last sign-in
    total_files INTEGER DEFAULT 0,         -- Denormalized count of user's files
    total_storage INTEGER DEFAULT 0,       -- Denormalized total bytes of all files
    write_blocked INTEGER DEFAULT 0,       -- Moderation flag (1 = blocked from writes)
    last_opened_file_id TEXT              -- ID of the last file the user had open
);
```

**Denormalized counters:** `total_files` and `total_storage` are maintained by `adjustUserStats()` in `db.js`. Every file create, save, or delete updates these counters atomically. This avoids expensive `COUNT(*)` / `SUM()` queries on every page load.

### folders Table

```sql
CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,                   -- UUID
    user_id TEXT NOT NULL,                 -- Owner user ID
    folder_name TEXT NOT NULL              -- Display name
);
```

Folder names are unique per user, enforced by index.

### files Table

```sql
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,                   -- UUID
    user_id TEXT NOT NULL,                 -- Owner user ID
    folder_id TEXT,                        -- Parent folder ID (NULL = root level)
    file_name TEXT NOT NULL,               -- Display name
    file_content TEXT,                     -- Full file content (source code)
    file_size INTEGER,                     -- Byte size of file_content
    content_hash TEXT                      -- SHA-256 hex digest of file_content
);
```

**`content_hash` purpose:** This field serves two critical roles:
1. **Skip-if-unchanged saves:** The `POST /api/file/save` endpoint uses `ON CONFLICT ... DO UPDATE ... WHERE files.content_hash != excluded.content_hash`. If the hash matches, no write happens, saving D1 write units.
2. **Duplicate detection on sign-in:** The frontend builds a `hashToFileKey` Map from `content_hash` values returned by `GET /api/files`. When a guest signs in, the editor's current code hash is checked against this map in O(1) time to find if identical code already exists in the cloud.

### Indexes

```sql
-- User lookup
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE UNIQUE INDEX idx_users_email ON users(lower(email));  -- Case-insensitive

-- Folder lookup
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE UNIQUE INDEX idx_unique_user_folder ON folders(user_id, folder_name);

-- File lookup
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_folder_id ON files(folder_id);
CREATE INDEX idx_files_content_hash ON files(content_hash) WHERE content_hash IS NOT NULL;

-- File name uniqueness (two separate constraints)
CREATE UNIQUE INDEX idx_unique_file_in_folder
    ON files(user_id, folder_id, file_name) WHERE folder_id IS NOT NULL;
CREATE UNIQUE INDEX idx_unique_root_file
    ON files(user_id, file_name) WHERE folder_id IS NULL;
```

Two separate uniqueness constraints for files: one for files inside folders (`folder_id IS NOT NULL`), one for root-level files (`folder_id IS NULL`). This is necessary because SQLite treats NULL values as distinct in unique indexes.

---

## Authentication Flow

### Google Sign-In

1. User clicks "Sign in with Google" on the compiler page
2. The Google Identity Services library opens a popup and returns an `id_token` (a JWT from Google)
3. Browser sends `POST /api/auth/google` with body `{ "id_token": "..." }`
4. The API worker proxies this to the files worker
5. The files worker calls Google's token verification endpoint:
   ```
   GET https://oauth2.googleapis.com/tokeninfo?id_token=<token>
   ```
6. The response is validated:
   - `aud` must match `GOOGLE_CLIENT_ID`
   - `email_verified` must not be `false`
   - `exp` must be in the future
   - `email` and `sub` must be present
7. User is upserted via `upsertUserFromIdentity()`:
   - If no user with this email exists → `INSERT` new user with `crypto.randomUUID()`
   - If user exists → `UPDATE` last_sign_in, display_name, avatar_url
8. A session JWT is signed and returned as a cookie

### JWT Session Tokens

Sessions use hand-rolled JWT tokens (not a library) with HMAC-SHA256 signing. Implementation is in `utils/auth.js`.

**Token structure:**
```
header.payload.signature
```

**Header:** `{ "alg": "HS256", "typ": "JWT" }` (base64url encoded)

**Payload:**
```json
{
    "user_id": "uuid",
    "email": "user@example.com",
    "iss": "graphics-oc-files",
    "aud": "graphics-oc-api",
    "iat": 1716825600,
    "exp": 1717430400
}
```

**Signing:**
```js
const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
);

const signature = await crypto.subtle.sign(
    'HMAC', key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
);
```

**Verification** (in `verifySessionJwt()`):
1. Split token into 3 parts
2. Verify header has `alg: HS256` and `typ: JWT`
3. Verify HMAC signature using `crypto.subtle.verify`
4. Decode and validate payload:
   - `iss` must be `graphics-oc-files`
   - `aud` must be `graphics-oc-api`
   - `user_id` and `email` must be present
   - `exp` must be in the future

### Session Cookie

```js
function buildSessionCookie(token, maxAgeSec = SESSION_DURATION_SEC) {
    return [
        `session=${token}`,
        'HttpOnly',             // Not accessible via JavaScript
        'Secure',               // HTTPS only
        'SameSite=None',        // Required for cross-origin (Pages → Workers)
        'Path=/',               // Available on all paths
        `Max-Age=${maxAgeSec}`, // 7 days (604800 seconds)
    ].join('; ');
}
```

`SameSite=None` is required because the static site on Cloudflare Pages makes API calls to the workers on a different subdomain.

### Session Check

`GET /api/auth/session` verifies the session cookie and returns user info:

```json
// Authenticated
{ "authenticated": true, "email": "...", "display_name": "...", "avatar_url": "..." }

// Not authenticated (returns 200, not 401)
{ "authenticated": false }
```

Returning 200 for unauthenticated requests (instead of 401) is intentional — the frontend calls this on page load and doesn't treat "not logged in" as an error.

### Logout

`POST /api/auth/logout` sets the session cookie with `Max-Age=0`:

```js
function buildLogoutCookie() {
    return [
        'session=',    // Empty value
        'HttpOnly', 'Secure', 'SameSite=None', 'Path=/',
        'Max-Age=0',   // Expire immediately
    ].join('; ');
}
```

### Request Authentication

All `/api/*` routes in the files worker go through `authenticateRequest()` (line 365 of `auth.js`):

1. Read the `session` cookie from `Cookie` header
2. Verify the JWT with `verifySessionJwt()`
3. Check the in-memory user cache for the user ID
4. If cache miss, query D1 for the user row
5. Validate that the user's email matches the session's email (case-insensitive)
6. Cache the user for 5 minutes
7. Return `{ session, user }`

If any step fails, an error with `statusCode: 401` is thrown.

### Write Blocking

After authentication, the main `fetch` handler checks the `write_blocked` flag:

```js
if (auth.user.write_blocked === 1 && ['POST', 'PUT', 'DELETE'].includes(method)) {
    return errorResponse('write_blocked', 'Write operations are blocked for this user', 403, corsHeaders);
}
```

This is a moderation mechanism — an admin can set `write_blocked = 1` in D1 to prevent a user from creating or modifying files.

---

## File Operations

### GET /api/files — List All Files

Returns the user's folders, files, and last-opened file ID. Uses a **batched D1 query** to execute three statements in a single round-trip:

```js
const [userRes, foldersRes, filesRes] = await db.batch([
    db.prepare('SELECT last_opened_file_id FROM users WHERE user_id = ?').bind(user.user_id),
    db.prepare('SELECT id, folder_name FROM folders WHERE user_id = ? ORDER BY folder_name COLLATE NOCASE').bind(user.user_id),
    db.prepare(`SELECT f.id, f.file_name, f.file_content, f.folder_id, f.file_size, f.content_hash, fo.folder_name
                FROM files f LEFT JOIN folders fo ON f.folder_id = fo.id AND fo.user_id = ?
                WHERE f.user_id = ?
                ORDER BY f.file_name COLLATE NOCASE`).bind(user.user_id, user.user_id),
]);
```

Response shape:
```json
{
    "last_opened_file_id": "uuid-or-null",
    "folders": [
        { "id": "uuid", "folder_name": "my-folder" }
    ],
    "files": [
        {
            "id": "uuid",
            "file_name": "main.cpp",
            "file_content": "#include <graphics.h>\n...",
            "folder_id": "uuid-or-null",
            "file_size": 1234,
            "content_hash": "abc123...",
            "folder_name": "my-folder"
        }
    ]
}
```

Note: `file_content` is returned for all files in a single response. This is a deliberate design choice — user files are small (C++ source code) and the total is bounded by the 1.2 MB per-file limit.

### POST /api/file/create — Create New File

Body: `{ "folder_id": "uuid-or-null", "file_name": "example.cpp" }`

- Creates a file with empty content (`''`)
- Generates a UUID for the file ID
- Computes SHA-256 hash of empty string
- Checks for name conflicts before inserting
- Adjusts user stats: `total_files += 1`
- Returns 201 with the new file ID

Returns **409 Conflict** if a file with the same name already exists in the folder. The check is done both with a pre-query and with the unique index constraint as a safety net.

### POST /api/file/save — Save File (Upsert)

Body: `{ "folder_id": "uuid-or-null", "file_name": "example.cpp", "content": "..." }`

This is the most complex operation. It's an **upsert** with content-hash deduplication:

```sql
INSERT INTO files (id, user_id, folder_id, file_name, file_content, file_size, content_hash)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id, folder_id, file_name) WHERE folder_id IS NOT NULL
DO UPDATE SET
    file_content = excluded.file_content,
    file_size = excluded.file_size,
    content_hash = excluded.content_hash
WHERE files.content_hash != excluded.content_hash
ON CONFLICT(user_id, file_name) WHERE folder_id IS NULL
DO UPDATE SET
    file_content = excluded.file_content,
    file_size = excluded.file_size,
    content_hash = excluded.content_hash
WHERE files.content_hash != excluded.content_hash
RETURNING id
```

Key behaviors:
1. **New file:** Insert succeeds → returns 201. User stats: `total_files += 1`, `total_storage += content_bytes`.
2. **Existing file, content changed:** `ON CONFLICT DO UPDATE` fires because hash differs → returns 200 with `changed: true`. User stats: `total_storage += delta`.
3. **Existing file, identical content:** The `WHERE files.content_hash != excluded.content_hash` clause prevents the update → `RETURNING id` returns nothing → returns 200 with `changed: false`. No D1 write units consumed.

After saving, `last_opened_file_id` is updated to the saved file's ID.

**Size limit:** 1.2 MB per file. Checked as byte length of UTF-8 encoded content:

```js
const contentBytes = new TextEncoder().encode(content).byteLength;
if (contentBytes > MAX_FILE_SIZE_BYTES) {
    return errorResponse('payload_too_large', 'File exceeds 1.2 MB limit', 413, corsHeaders);
}
```

### DELETE /api/file/delete — Delete File

Body: `{ "file_id": "uuid" }`

1. Verify the file exists and belongs to the user
2. Delete the file row
3. Adjust user stats: `total_files -= 1`, `total_storage -= file_size`
4. Return 200

Returns **404** if the file doesn't exist or doesn't belong to the user.

---

## Folder Operations

### POST /api/folder/create — Create Folder

Body: `{ "folder_name": "my-project" }`

Creates a folder with a UUID. Returns **409 Conflict** if the name already exists for this user (enforced by the unique index on `(user_id, folder_name)`).

### DELETE /api/folder/delete — Delete Folder

Body: `{ "folder_id": "uuid" }`

This is a cascading delete:
1. Verify folder ownership via `ensureFolderOwnership()` (throws 403 if not owned)
2. Query the total file count and storage in the folder
3. Delete all files in the folder AND the folder itself in a **batched D1 operation**:
   ```js
   await db.batch([
       db.prepare('DELETE FROM files WHERE user_id = ? AND folder_id = ?').bind(user.user_id, folderId),
       db.prepare('DELETE FROM folders WHERE user_id = ? AND id = ?').bind(user.user_id, folderId),
   ]);
   ```
4. Adjust user stats for the total files and storage removed

---

## Request Proxying (Service Bindings)

The API worker proxies file/auth requests to the files worker using Cloudflare's **service bindings**. This is a zero-latency internal routing mechanism — no HTTP network hop, no DNS resolution.

The proxy logic lives in `utils/proxy.js` (87 lines):

```js
export async function proxyRequest(request, path, corsHeaders, serviceBinding) {
    const targetUrl = new URL(path, 'https://graphics-oc-files.internal');

    // Build upstream headers — forward everything except host/content-length
    const upstreamHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
        const lower = key.toLowerCase();
        if (lower === 'host' || lower === 'content-length') continue;
        upstreamHeaders.set(key, value);
    }

    // Add forwarding context
    upstreamHeaders.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');
    upstreamHeaders.set('X-Forwarded-Proto', 'https');
    upstreamHeaders.set('X-Forwarded-Host', url.host);

    const upstreamRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: upstreamHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
        redirect: 'manual',
    });

    const upstreamResponse = await serviceBinding.fetch(upstreamRequest);
    // ... build response with merged headers ...
}
```

**Cookie handling:** `Set-Cookie` headers from the files worker are preserved but the `Domain` attribute is stripped. This ensures the session cookie is stored for the API worker's domain (not the internal service name).

**CORS:** All CORS headers from the upstream response are stripped and replaced with the API worker's own CORS headers. This prevents the files worker's internal CORS policy from leaking to the browser.

---

## In-Memory Caching

The files worker uses three `Map`-based caches that live in the worker's V8 isolate memory:

| Cache | TTL | Max Size | Purpose |
|:---|:---|:---|:---|
| `USER_CACHE` | 5 min (300,000ms) | 2000 entries | Avoids re-querying D1 for user rows on every authenticated request |
| `GOOGLE_TOKEN_CACHE` | 5 min (300,000ms) | 2000 entries | Avoids re-verifying Google ID tokens with Google's API |
| `SESSION_KEY_CACHE` | No TTL | 4 entries | Imported `CryptoKey` objects for JWT signing/verification |

All caches use LRU-style eviction — when they exceed their max size, the oldest entry (first Map key) is deleted:

```js
if (USER_CACHE.size > 2000) {
    const oldestKey = USER_CACHE.keys().next().value;
    if (oldestKey) USER_CACHE.delete(oldestKey);
}
```

These caches reset on worker restarts, new deployments, or isolate recycling.

---

## CORS Handling

The API worker handles CORS in `utils/cors.js`. The `withCors()` function builds the CORS headers:

- `Access-Control-Allow-Origin` — Set to the request's `Origin` header (not `*`)
- `Access-Control-Allow-Methods` — `GET, POST, PUT, DELETE, OPTIONS`
- `Access-Control-Allow-Headers` — `Content-Type, Authorization`
- `Access-Control-Allow-Credentials` — `true` (required for cookies)

All `OPTIONS` requests (preflight) return `204 No Content` with the CORS headers.

---

## Error Response Format

All errors use a consistent JSON format via `errorResponse()` in `utils/response.js`:

```json
{
    "error": "error_code",
    "message": "Human-readable error description"
}
```

Common error codes:

| Code | HTTP Status | When |
|:---|:---|:---|
| `bad_request` | 400 | Missing or invalid input |
| `unauthorized` | 401 | No session cookie, expired JWT, invalid signature |
| `write_blocked` | 403 | User is moderation-blocked |
| `not_found` | 404 | Route or resource not found |
| `conflict` | 409 | File/folder name already exists |
| `payload_too_large` | 413 | File exceeds 1.2 MB |
| `internal_error` | 500 | Unhandled exception |
| `server_error` | 500 | Missing required secret (SESSION_SECRET, GOOGLE_CLIENT_ID) |

---

## Input Validation

Handled by `utils/validate.js`:

- **`validateFileName(name)`** — Trims, checks for empty/too-long names, validates characters
- **`validateFolderName(name)`** — Similar to file name validation
- **`validateFolderId(id)`** — Returns `null` for empty/root, otherwise validates UUID format
- **`MAX_FILE_SIZE_BYTES`** — 1.2 MB (`1_258_291` bytes)

---

## Deploying Workers

### Deploy to production

```bash
# API worker
cd workers/graphics-oc-api
npx wrangler deploy

# Files worker
cd workers/graphics-oc-files
npx wrangler deploy
```

### Set secrets

```bash
# Files worker secrets
cd workers/graphics-oc-files
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID

# API worker secrets
cd workers/graphics-oc-api
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put GOOGLE_CLIENT_ID
```

### Initialize database

```bash
cd workers/graphics-oc-files
npx wrangler d1 execute graphicsh_oc_db --file=schema.sql
```

### Local development

```bash
cd workers/graphics-oc-files
npx wrangler dev

cd workers/graphics-oc-api
npx wrangler dev
```

---

## File Reference

| File | Lines | Role |
|:---|:---|:---|
| `workers/graphics-oc-api/worker.js` | ~80 | Public API router with CORS and health check |
| `workers/graphics-oc-api/routes/auth.js` | — | Proxies auth routes (`/api/auth/*`) to files worker |
| `workers/graphics-oc-api/routes/files.js` | — | Proxies file/folder routes to files worker |
| `workers/graphics-oc-api/routes/contact.js` | — | Contact/feedback form → Discord webhook |
| `workers/graphics-oc-api/routes/maintenance.js` | — | KV-backed maintenance mode |
| `workers/graphics-oc-api/utils/proxy.js` | 87 | Service binding proxy: header forwarding, cookie handling, CORS isolation |
| `workers/graphics-oc-api/utils/cors.js` | ~20 | CORS header builder |
| `workers/graphics-oc-api/utils/discord.js` | ~40 | Discord webhook embed formatter |
| `workers/graphics-oc-api/wrangler.jsonc` | 25 | KV namespace + service binding config |
| `workers/graphics-oc-files/worker.js` | 79 | File storage router with route table + write blocking |
| `workers/graphics-oc-files/routes/files.js` | 236 | File CRUD: getFiles (batched query), createFile, saveFile (upsert with hash dedup), deleteFile |
| `workers/graphics-oc-files/routes/folders.js` | 70 | Folder CRUD: createFolder, deleteFolder (cascading with batched D1) |
| `workers/graphics-oc-files/utils/auth.js` | 468 | Google token verification, JWT sign/verify (HMAC-SHA256), user upsert, session cookie management, in-memory user/token caches |
| `workers/graphics-oc-files/utils/db.js` | ~80 | `adjustUserStats()`, `ensureFolderOwnership()`, `getFileByName()`, `getUserFiles()`, `parseSqliteError()` |
| `workers/graphics-oc-files/utils/hash.js` | ~10 | `computeSha256Hex()` using Web Crypto API |
| `workers/graphics-oc-files/utils/response.js` | ~50 | `jsonResponse()`, `errorResponse()`, `readJsonBody()`, `withCors()` |
| `workers/graphics-oc-files/utils/validate.js` | ~40 | `validateFileName()`, `validateFolderName()`, `validateFolderId()`, `MAX_FILE_SIZE_BYTES` |
| `workers/graphics-oc-files/schema.sql` | 110 | D1 schema: 3 tables, 6 indexes, inline comments |
| `workers/graphics-oc-files/wrangler.jsonc` | 17 | D1 database binding config |
