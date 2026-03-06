# Graphics Compiler — Users & Files Worker

Cloudflare Worker backend for the [graphics.h online compiler](https://graphics-h.com). Handles user authentication (Google OAuth via Better Auth), project/file metadata (D1), and file content storage (R2).

## Architecture

```
Browser (editor frontend)
        │
        ▼
┌─────────────────────────────┐
│   Cloudflare Worker (this)  │
│   - Auth (Better Auth)      │
│   - CORS                    │
│   - Route handling          │
│   - Ownership verification  │
├──────────┬──────────────────┤
│  D1 DB   │    R2 Bucket     │
│ metadata │  file contents   │
└──────────┴──────────────────┘
```

### Key principles

- **Client never touches R2 directly** — the Worker mediates all file reads/writes.
- **D1 stores metadata only** — file listings, project info, user mappings.
- **R2 stores file content** — actual source code bytes.
- **Email-based identity mapping** — Better Auth handles OAuth; the Worker maps `session.user.email` → the pre-migrated `users.user_id` (Supabase UUIDs). No new user IDs are ever generated.

---

## Storage Layout

### D1 Tables

| Table | Purpose |
|---|---|
| `users` | Migrated Supabase users. Maps `email → user_id` (UUID). |
| `projects` | Project folders per user. `project_id` is the folder name. |
| `files` | File metadata — filename, R2 key, hash, size, version. |
| `user` | Better Auth internal table (OAuth users). **Separate** from `users`. |
| `session` | Better Auth internal table (session tokens). |
| `account` | Better Auth internal table (OAuth provider accounts). |
| `verification` | Better Auth internal table (email verification). |

### R2 Bucket

**Bucket name:** `graphics-compiler-users`

**Key format:** `{user_id}/{project_id}/{filename}`

Example:
```
3c3311e3-322d-46ca-89f7-8428de404bfe/main/DDL.cpp
```

---

## Authentication Flow

```
1. User visits /login
2. Worker redirects to Google OAuth (via Better Auth)
3. Google authenticates → redirects to /auth/callback/google
4. Better Auth creates session cookie
5. Subsequent requests include session cookie
6. Worker reads session → extracts email
7. Worker queries: SELECT user_id FROM users WHERE email = ?
8. All downstream queries use this real user_id
```

> **Important:** Better Auth's internal `user.id` (e.g. `LOuFMfvAgSWW...`) is **not** the same as `users.user_id` (e.g. `3c3311e3-322d-...`). The Worker always maps via email to get the correct UUID.

---

## Environment Variables

| Variable | Source | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | Wrangler secret | Signing key for auth tokens |
| `GOOGLE_CLIENT_ID` | Wrangler secret | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Wrangler secret | Google OAuth client secret |
| `WORKER_URL` | `wrangler.jsonc` vars | This Worker's public URL |
| `FRONTEND_URL` | `wrangler.jsonc` vars | Allowed CORS origin |

### Bindings

| Binding | Type | Resource |
|---|---|---|
| `DB` | D1 Database | `graphics-compiler-db` |
| `FILES_BUCKET` | R2 Bucket | `graphics-compiler-users` |

---

## API Endpoints

### Public (no auth required)

#### `GET /`
Health check. Returns service status and available routes.

```json
{
  "status": "ok",
  "service": "graphics compiler backend",
  "login": "https://graphics-oc-users-files.albatrossc.workers.dev/login",
  "routes": [...]
}
```

#### `GET /login`
Redirects to Google OAuth consent screen. After login, Better Auth sets a session cookie and redirects to the frontend.

#### `OPTIONS *`
CORS preflight handler. Returns 204 with appropriate CORS headers.

---

### Auth

#### `GET /auth/me`
Returns the **real** migrated `user_id` for the authenticated user.

**Requires:** Session cookie

**Response:**
```json
{ "user_id": "3c3311e3-322d-46ca-89f7-8428de404bfe" }
```

**Error (401):**
```json
{ "error": "Unauthorized" }
```

#### `GET /auth/get-session`
Better Auth built-in route. Returns the raw session + user object.

#### `/auth/*`
All other `/auth` paths are delegated to Better Auth's handler (callback, sign-out, etc.).

---

### Protected (session cookie required)

All routes below return `401 Unauthorized` if the user is not authenticated.

#### `GET /projects`
List all projects (folders) for the authenticated user.

**Response:**
```json
{
  "folders": [
    {
      "project_id": "main",
      "user_id": "3c3311e3-...",
      "project_name": "main",
      "file_count": 272
    }
  ]
}
```

#### `GET /projects/:projectId/files`
List all files inside a specific project.

**Response:**
```json
{
  "files": [
    {
      "file_id": "abc123",
      "filename": "DDL.cpp",
      "file_size": 1024,
      "version": 3,
      "created_at": 1709000000000,
      "updated_at": 1709100000000
    }
  ]
}
```

#### `GET /files/list`
List **all** files for the user across all projects. Used by the frontend file explorer sidebar.

**Response:**
```json
{
  "files": [
    {
      "file_id": "abc123",
      "folder": "main",
      "filename": "DDL.cpp",
      "file_size": 1024,
      "version": 3
    }
  ]
}
```

#### `GET /files/read?folder=X&filename=Y`
Read a file's content from R2. Returns `text/plain`.

**Query params:** `folder` (project_id), `filename`

**Response:** Raw file content as `text/plain` with `ETag` header if hash is available.

**Errors:**
- `400` — Missing folder or filename
- `404` — File not found in D1 or missing from R2

#### `GET /files/:fileId`
Read a file by its `file_id`. Returns JSON with content.

**Response:**
```json
{
  "file_id": "abc123",
  "filename": "DDL.cpp",
  "project_id": "main",
  "content": "#include <graphics.h>\n..."
}
```

**Errors:**
- `404` — File not found
- `403` — File belongs to another user

#### `POST /files/save`
Save or update a file. If the file exists and content hash matches, the R2 write is skipped.

**Request body:**
```json
{
  "folder": "main",
  "filename": "DDL.cpp",
  "content": "#include <graphics.h>\n..."
}
```

**Response:**
```json
{
  "file_id": "abc123",
  "hash": "a1b2c3...",
  "skipped": false
}
```

If content is unchanged: `"skipped": true` (no R2 write, saves bandwidth).

#### `POST /files/create`
Create a new file with optional initial content.

**Request body:**
```json
{
  "projectId": "main",
  "filename": "newfile.cpp",
  "content": "// optional initial content"
}
```

**Response (201):**
```json
{ "file_id": "generated-uuid" }
```

**Error (409):** File already exists.

#### `DELETE /files/:fileId`
Delete a file from both D1 metadata and R2 storage.

**Response:**
```json
{ "deleted": true }
```

**Errors:**
- `404` — File not found
- `403` — File belongs to another user

---

## Development

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm i -g wrangler`)
- Cloudflare account with D1 and R2 enabled

### Setup

```bash
cd workers/graphics-oc-users-files
npm install
```

### Local Development

```bash
npm run dev
# or
npx wrangler dev
```

### Deploy

```bash
npm run deploy
# or
npx wrangler deploy
```

### Database Migrations

```bash
# Remote
npm run db:migrate

# Local
npm run db:migrate:local
```

### View Logs

```bash
npx wrangler tail
```

---

## File Structure

```
graphics-oc-users-files/
├── src/
│   └── index.js          # Main Worker — all route handlers
├── test/
│   └── index.spec.js     # Vitest test spec (boilerplate)
├── schema.sql            # D1 schema (users, projects, files, Better Auth tables)
├── wrangler.jsonc        # Wrangler config (bindings, vars)
├── package.json          # Dependencies
├── vitest.config.js      # Test config
├── .editorconfig         # Editor formatting
├── .prettierrc           # Prettier config
├── .gitignore            # Ignores .env*, .wrangler/, node_modules/
└── README.md             # This file
```

## Security Notes

- **Secrets** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`) are stored as Wrangler secrets and environment variables. They are **never** hardcoded in source code.
- **`.env`** is gitignored — only used for local development.
- **`.wrangler/`** is gitignored — contains local D1 state.
- **CORS** is restricted to `FRONTEND_URL` (not wildcard `*`).
- **File ownership** is verified on every read/delete — users can only access their own files.
- **No user ID generation** — the Worker never creates user IDs; it only looks up pre-migrated ones.
