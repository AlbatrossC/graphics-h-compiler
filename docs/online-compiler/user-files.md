# Workers & User Files — Cloud File Storage

> How user files are stored, synced, and managed via Cloudflare Workers + D1.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Cloudflare Worker (graphics-oc-files)](#cloudflare-worker-graphics-oc-files)
  - [Worker Configuration](#worker-configuration)
  - [Route Map](#route-map)
  - [Authentication Flow](#authentication-flow)
  - [Session Management (JWT)](#session-management-jwt)
  - [Write Blocking](#write-blocking)
- [Database Schema (D1)](#database-schema-d1)
  - [Users Table](#users-table)
  - [Folders Table](#folders-table)
  - [Files Table](#files-table)
  - [Indexes](#indexes)
- [API Endpoints](#api-endpoints)
  - [Auth Endpoints](#auth-endpoints)
  - [File Endpoints](#file-endpoints)
  - [Folder Endpoints](#folder-endpoints)
- [Flask Proxy Layer](#flask-proxy-layer)
- [Client-Side Storage (files.js)](#client-side-storage-filesjs)
  - [IndexedDB as Primary Local Storage](#indexeddb-as-primary-local-storage)
  - [Cloud State (CLOUD_STATE)](#cloud-state-cloud_state)
  - [Autosave Logic](#autosave-logic)
  - [Guest vs Logged-In Flow](#guest-vs-logged-in-flow)
  - [File Save Flow (forceSaveActiveFile)](#file-save-flow-forcesaveactivefile)
  - [Content Hashing (SHA-256)](#content-hashing-sha-256)
- [File Explorer UI](#file-explorer-ui)

---

## Overview

Users can save their C++ source files to the cloud by signing in with Google. The storage backend is a **Cloudflare Worker** (`graphics-oc-files`) backed by a **Cloudflare D1** SQLite database. The Flask app (`app.py`) acts as a **reverse proxy**, forwarding all `/api/*` requests to the Worker.

On the client side, **IndexedDB** is the primary local storage for both guest and logged-in users. For guests, IndexedDB is the only storage. For logged-in users, IndexedDB mirrors the cloud state and serves as a local cache / draft buffer.

---

## Architecture

```
Browser (files.js)
  │
  ├── IndexedDB (compiler_project_files_v1)
  │     └── Local file drafts (primary storage for guests)
  │
  ├── /api/auth/google       ─┐
  ├── /api/auth/session       │
  ├── /api/auth/logout        │
  ├── /api/files              ├──→ Flask (storage_bp) ──→ Cloudflare Worker
  ├── /api/file/create        │                            (graphics-oc-files)
  ├── /api/file/save          │                                │
  ├── /api/file/delete        │                                ▼
  ├── /api/folder/create      │                          Cloudflare D1
  └── /api/folder/delete     ─┘                          (graphicsh_oc_db)
```

---

## Cloudflare Worker (graphics-oc-files)

### Worker Configuration

File: `workers/graphics-oc-files/wrangler.jsonc`

```jsonc
{
  "name": "graphics-oc-files",
  "main": "worker.js",
  "compatibility_date": "2026-03-09",
  "d1_databases": [
    {
      "binding": "graphicsh_oc_db",
      "database_name": "graphicsh_oc_db",
      "database_id": "ccf2896f-4161-4c6e-b56d-f3f5227c99b2"
    }
  ]
}
```

**Secrets** (set via `wrangler secret put`):
- `SESSION_SECRET` — HMAC key for signing session JWTs
- `GOOGLE_CLIENT_ID` — Google OAuth 2.0 client ID

### Route Map

| Method | Path | Handler | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Health check | No |
| `POST` | `/auth/google` | Google sign-in | No |
| `GET` | `/auth/session` | Check session | No |
| `POST` | `/auth/logout` | Sign out | No |
| `GET` | `/api/files` | List all user files + folders | Yes |
| `POST` | `/api/file/create` | Create empty file | Yes |
| `POST` | `/api/file/save` | Save/upsert file content | Yes |
| `DELETE` | `/api/file/delete` | Delete a file | Yes |
| `POST` | `/api/folder/create` | Create a folder | Yes |
| `DELETE` | `/api/folder/delete` | Delete folder + its files | Yes |

### Authentication Flow

1. User clicks **"Sign in with Google"** in the sidebar.
2. Google Identity Services returns an `id_token` (JWT from Google).
3. Client sends `POST /api/auth/google` with `{ id_token }`.
4. Worker verifies the token with Google's `tokeninfo` endpoint.
5. Worker upserts the user in D1 (`users` table).
6. Worker signs a **session JWT** (HMAC-SHA256) with `SESSION_SECRET`.
7. Session JWT is returned in a `Set-Cookie: session=...` header (HttpOnly, Secure, SameSite=Lax, 7-day expiry).
8. All subsequent `/api/*` requests include the cookie automatically.

### Session Management (JWT)

The Worker implements its own JWT signing/verification using the Web Crypto API:

```
JWT Header:  { "alg": "HS256", "typ": "JWT" }
JWT Payload: { "user_id": "...", "email": "...", "exp": <unix_timestamp> }
```

- Signed with `crypto.subtle.sign('HMAC', key, data)`
- Verified with `crypto.subtle.verify('HMAC', key, signature, data)`
- Session duration: **7 days**
- Caching: imported HMAC keys are cached in-memory (`SESSION_KEY_CACHE`)
- User records are cached for 5 minutes (`USER_CACHE`) to avoid repeated D1 queries

### Write Blocking

Users can be blocked from write operations by setting `write_blocked = 1` in the `users` table. The Worker checks this flag before allowing `POST`, `PUT`, or `DELETE` requests on `/api/*` routes.

---

## Database Schema (D1)

File: `workers/graphics-oc-files/schema.sql`

### Users Table

```sql
CREATE TABLE IF NOT EXISTS users (
  sr_no INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  first_sign_in INTEGER,     -- timestamp (ms since epoch)
  last_sign_in INTEGER,      -- timestamp (ms since epoch)
  total_files INTEGER DEFAULT 0,
  total_storage INTEGER DEFAULT 0,  -- bytes
  write_blocked INTEGER DEFAULT 0,  -- 0 or 1
  last_opened_file_id TEXT   -- tracks which file the user had open
);
```

### Folders Table

```sql
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,          -- UUID
  user_id TEXT NOT NULL,
  folder_name TEXT NOT NULL
);
```

### Files Table

```sql
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,          -- UUID
  user_id TEXT NOT NULL,
  folder_id TEXT,               -- NULL = root level
  file_name TEXT NOT NULL,
  file_content TEXT,            -- the source code
  file_size INTEGER,            -- bytes
  content_hash TEXT             -- SHA-256 hex for de-duplication
);
```

### Indexes

| Index | Purpose |
|---|---|
| `idx_users_user_id` | Fast user lookup by UUID |
| `idx_users_email` | Unique email constraint (case-insensitive) |
| `idx_folders_user_id` | List folders for a user |
| `idx_unique_user_folder` | Prevent duplicate folder names per user |
| `idx_files_user_id` | List files for a user |
| `idx_files_folder_id` | List files in a folder |
| `idx_unique_file_in_folder` | Prevent duplicate filenames in a folder |
| `idx_unique_root_file` | Prevent duplicate root-level filenames per user |

---

## API Endpoints

### Auth Endpoints

**`POST /api/auth/google`**
```json
// Request
{ "id_token": "<google_jwt>" }

// Response (200)
{ "authenticated": true, "email": "user@example.com", "display_name": "User" }
// + Set-Cookie: session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800
```

**`GET /api/auth/session`**
```json
// Response (200, session valid)
{ "authenticated": true, "email": "user@example.com", "display_name": "User" }

// Response (200, no session)
{ "authenticated": false }
```

**`POST /api/auth/logout`**
```json
// Response (200)
{ "success": true }
// + Set-Cookie: session=; Max-Age=0 (clears cookie)
```

### File Endpoints

**`GET /api/files`** — returns all folders and files for the authenticated user:
```json
{
  "last_opened_file_id": "uuid-of-last-file",
  "folders": [
    { "id": "folder-uuid", "folder_name": "main" }
  ],
  "files": [
    {
      "id": "file-uuid",
      "file_name": "main.cpp",
      "file_content": "#include <graphics.h>...",
      "folder_id": "folder-uuid",
      "folder_name": "main"
    }
  ]
}
```

**`POST /api/file/save`** — upsert (create or update) a file:
```json
// Request
{ "folder_id": "folder-uuid", "file_name": "main.cpp", "content": "..." }

// Response (200 — updated, 201 — created)
{ "success": true, "changed": true, "file_id": "file-uuid", "content_hash": "sha256hex", "file_size": 1234 }
```

The save endpoint uses `ON CONFLICT DO UPDATE` for atomic upserts. It skips the update if `content_hash` matches (content unchanged), saving D1 write operations.

**`POST /api/file/create`** — creates an empty file:
```json
{ "folder_id": "folder-uuid", "file_name": "new-file.cpp" }
```

**`DELETE /api/file/delete`** — deletes a file by ID:
```json
{ "file_id": "file-uuid" }
```

### Folder Endpoints

**`POST /api/folder/create`**
```json
{ "folder_name": "my-project" }
```

**`DELETE /api/folder/delete`** — deletes folder AND all files inside it:
```json
{ "folder_id": "folder-uuid" }
```

---

## Flask Proxy Layer

File: `src/blueprints/storage.py`

The Flask app proxies all `/api/*` requests to the Cloudflare Worker URL (set via `USER_FILES_WORKERS` env variable). It:

1. Forwards the request method, headers, cookies, and body to the Worker.
2. Rewrites `Set-Cookie` headers (strips `domain=` to work with the Flask origin).
3. Logs file operations (saves, deletes, folder creates) to the server console.
4. Returns `503` if the Worker URL is not configured.

**Auth config endpoint** (`/api/auth/config`) is handled directly by Flask (not proxied):
```json
{
  "authEnabled": true,
  "storageEnabled": true,
  "googleClientId": "your-client-id.apps.googleusercontent.com"
}
```

---

## Client-Side Storage (files.js)

### IndexedDB as Primary Local Storage

File: `static/js/compiler/files.js`

The `FileDB` module wraps IndexedDB operations:

```
Database: compiler_project_files_v1
Store:    files (keyPath: id)

Record schema:
{
  id:            "root/main.cpp"       // folderKey/filename
  name:          "main.cpp"
  content:       "// source code..."
  lastSavedHash: "sha256hex"
  lastModified:  1714900000000
  dirty:         true/false
  folderId:      "folder-uuid" | null
  folderKey:     "root" | "folder-uuid"
}
```

**Why IndexedDB instead of localStorage?**
- `localStorage` has a ~5MB limit and is synchronous (blocks the main thread).
- IndexedDB is asynchronous and can store much larger files.
- Old `localStorage` data (under key `tc_code`) is migrated to IndexedDB automatically.

### Cloud State (CLOUD_STATE)

The global `CLOUD_STATE` object tracks the in-memory representation of the user's cloud files:

```js
const CLOUD_STATE = {
    files: new Map(),           // Map<fileKey, FileObject>
    folders: new Set(['root']), // Set of folder IDs
    folderNameToId: new Map(),  // Map<folderName, folderId>
    folderIdToName: new Map(),  // Map<folderId, folderName>
    openTabs: [],
    activeFileKey: 'root/main.cpp',
    autosaveTimer: null,
    isSaving: false,
    lastSavedHash: null,
    lastSavedAt: null
};
```

### Autosave Logic

```
User types → setLocalDraftImmediate() writes to IndexedDB immediately
           → scheduleAutosave() starts 20-second idle timer
           
20 seconds of no edits:
  ├── Guest:  persistLocalSave() → IndexedDB (clean state, dirty=false)
  └── Cloud:  forceSaveActiveFile('autosave') → POST /api/file/save
```

- Timer resets on every keystroke.
- Compile-and-Run also triggers an immediate save (skips the 20s wait).
- File switch triggers an immediate save of the previous file.

### Guest vs Logged-In Flow

| Action | Guest | Logged-In |
|---|---|---|
| **Save** | IndexedDB only | API → Worker → D1 + IndexedDB cache |
| **Load** | IndexedDB → localStorage fallback → demo | API → Worker → D1 |
| **Autosave** | IndexedDB (20s idle) | Cloud save (20s idle) |
| **First sign-in** | Guest code migrated to cloud as `untitled-N.cpp` | — |
| **Sign out** | Current code preserved in IndexedDB | Cloud logout, code stays locally |

### File Save Flow (forceSaveActiveFile)

```
forceSaveActiveFile(trigger)
  │
  ├── Guest path:
  │     └── persistLocalSave(code)
  │           ├── FileDB.put({...dirty: false})
  │           └── Update SAVE_STATE.lastSavedHash
  │
  └── Cloud path:
        ├── Ensure main folder exists (ensureMainFolder)
        ├── Compute SHA-256 hash
        ├── Skip if hash matches lastSavedHash (no change)
        ├── POST /api/file/save
        ├── Update CLOUD_STATE.files
        ├── Update IndexedDB cache (non-blocking)
        └── Update save indicator UI
```

### Content Hashing (SHA-256)

Every file save computes a SHA-256 hash of the content:

```js
async function computeSha256(content) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

This hash is used to:
1. **Skip unnecessary saves** — if the hash matches the last saved hash, the save is skipped.
2. **Server-side de-duplication** — the Worker's `ON CONFLICT DO UPDATE` clause only writes if `content_hash` differs.
3. **Detect demo files** — known demo hashes are checked to determine if the guest modified their code.

---

## File Explorer UI

File: `static/js/compiler/files-ui.js`

The sidebar File Explorer renders the user's cloud files as a flat list grouped by folder:

```
Files Explorer
  ├── WORKSPACE
  │   ├── 📁 main
  │   │   ├── 📄 main.cpp          [Download] [Delete]
  │   │   └── 📄 untitled-1.cpp    [Download] [Delete]
  │   └── 📁 experiments
  │       └── 📄 test.cpp          [Download] [Delete]
  └── [+ New File] [+ New Folder]
```

Features:
- Click a file to open it in the editor (triggers file switch save).
- Download button exports the file content as a `.cpp` file.
- Delete button removes the file from the cloud (with confirmation).
- Folder collapse/expand state is persisted to `localStorage`.

---

*Last updated: May 2026*
