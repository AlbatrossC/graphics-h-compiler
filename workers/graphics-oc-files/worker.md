# `graphics-oc-files` — Cloudflare Worker Documentation

> Full reference for the **Graphics.h Online Compiler** file-storage backend.  
> Deployed as a [Cloudflare Worker](https://developers.cloudflare.com/workers/) with a [D1 SQLite](https://developers.cloudflare.com/d1/) database.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Authentication Flow](#3-authentication-flow)
4. [Identification — What Identifies a User?](#4-identification--what-identifies-a-user)
5. [Session Management](#5-session-management)
6. [Database Schema](#6-database-schema)
7. [API Endpoints](#7-api-endpoints)
8. [SQL Queries Reference](#8-sql-queries-reference)
9. [Utility Modules](#9-utility-modules)
10. [Caching Strategy](#10-caching-strategy)
11. [CORS & Security](#11-cors--security)
12. [Configuration & Secrets](#12-configuration--secrets)
13. [File Structure](#13-file-structure)

---

## 1. Overview

`graphics-oc-files` is a Cloudflare Worker that serves as the **backend API** for the Graphics.h Online Compiler. It handles:

- **User authentication** via Google Sign-In (OAuth 2.0 ID tokens)
- **Session management** via HMAC-signed JWTs stored in `HttpOnly` cookies
- **File CRUD** — create, read, save, delete user code files
- **Folder CRUD** — create and delete folders to organize files
- **User statistics tracking** — total files count and total storage used

The worker is stateless at the compute layer; all persistent data lives in a **Cloudflare D1** SQLite database (`graphicsh_oc_db`). In-memory `Map` caches are used per-isolate for hot-path performance.

---

## 2. Architecture

```
┌──────────────────────┐
│   Frontend Client    │
│  (Vercel / localhost)│
└──────────┬───────────┘
           │  HTTPS
           ▼
┌──────────────────────┐
│  Cloudflare Worker   │
│  (worker.js)         │
│                      │
│  ┌────────────────┐  │
│  │  Router        │  │  Routes requests to auth handlers or CRUD routes
│  └───┬────────────┘  │
│      │               │
│  ┌───▼────────────┐  │
│  │  Auth Module   │  │  Google token verification, JWT session, cookie mgmt
│  │  (utils/auth)  │  │
│  └───┬────────────┘  │
│      │               │
│  ┌───▼────────────┐  │
│  │  Route Handlers│  │  files.js, folders.js
│  └───┬────────────┘  │
│      │               │
│  ┌───▼────────────┐  │
│  │  DB Helpers    │  │  utils/db.js — queries, stats
│  │  Validators    │  │  utils/validate.js — input sanitization
│  │  Hash / Resp   │  │  utils/hash.js, utils/response.js
│  └────────────────┘  │
│                      │
└──────────┬───────────┘
           │  D1 Binding
           ▼
┌──────────────────────┐
│  Cloudflare D1       │
│  (SQLite)            │
│  graphicsh_oc_db     │
└──────────────────────┘
```

### Request Lifecycle

1. **CORS preflight** — `OPTIONS` requests are answered with `204` + CORS headers immediately.
2. **Health check** — `GET /health` returns `{ ok: true }` (no auth needed).
3. **Auth endpoints** — `/auth/google`, `/auth/session`, `/auth/logout` are handled before authentication middleware.
4. **API endpoints** — All `/api/*` routes go through `authenticateRequest()` first. The authenticated `user` object is then passed to the route handler.
5. **Write-blocking** — If `user.write_blocked === 1`, any `POST`/`PUT`/`DELETE` request is rejected with `403`.

---

## 3. Authentication Flow

### 3.1 Google Sign-In (Login)

```
Frontend                        Worker                        Google
   │                              │                              │
   │  1. User clicks "Sign in     │                              │
   │     with Google"             │                              │
   │  ─────────────────────────►  │                              │
   │  POST /auth/google           │                              │
   │  Body: { id_token: "..." }   │                              │
   │                              │  2. Verify ID token           │
   │                              │  ──────────────────────────►  │
   │                              │  GET googleapis.com/tokeninfo │
   │                              │  ◄──────────────────────────  │
   │                              │  { email, sub, name, aud,     │
   │                              │    exp, email_verified }      │
   │                              │                              │
   │                              │  3. Validate:                │
   │                              │     - aud === GOOGLE_CLIENT_ID│
   │                              │     - email_verified === true │
   │                              │     - exp > now               │
   │                              │                              │
   │                              │  4. Upsert user in DB        │
   │                              │     (lookup by email)         │
   │                              │     - New → INSERT with       │
   │                              │       crypto.randomUUID()     │
   │                              │     - Existing → UPDATE       │
   │                              │       last_sign_in            │
   │                              │                              │
   │                              │  5. Sign a session JWT        │
   │                              │     (HMAC-SHA256)             │
   │                              │     Payload: { user_id,       │
   │                              │       email, exp }            │
   │                              │                              │
   │  6. Response:                │                              │
   │  ◄─────────────────────────  │                              │
   │  { authenticated: true,      │                              │
   │    email, display_name }     │                              │
   │  Set-Cookie: session=<JWT>;  │                              │
   │    HttpOnly; Secure;         │                              │
   │    SameSite=Lax; Max-Age=7d  │                              │
```

### 3.2 Session Check

```
Frontend                        Worker
   │                              │
   │  GET /auth/session           │
   │  Cookie: session=<JWT>       │
   │  ──────────────────────────► │
   │                              │  Verify JWT signature + exp
   │                              │  Lookup user from DB/cache
   │  ◄────────────────────────── │
   │  { authenticated: true/false,│
   │    email, display_name }     │
```

- If the JWT is valid and the user exists → `{ authenticated: true }`
- If JWT is invalid/expired/missing → `{ authenticated: false }` (200, not 401)

### 3.3 Logout

```
Frontend                        Worker
   │                              │
   │  POST /auth/logout           │
   │  ──────────────────────────► │
   │                              │  Clear cookie (Max-Age=0)
   │  ◄────────────────────────── │
   │  { success: true }           │
   │  Set-Cookie: session=;       │
   │    Max-Age=0                 │
```

### 3.4 Authenticated API Request

```
Frontend                        Worker
   │                              │
   │  GET /api/files              │
   │  Cookie: session=<JWT>       │
   │  ──────────────────────────► │
   │                              │  1. Parse "session" cookie
   │                              │  2. Verify JWT (HMAC-SHA256)
   │                              │  3. Check exp > now
   │                              │  4. Lookup user (cache → DB)
   │                              │  5. Check write_blocked
   │                              │  6. Call route handler
   │  ◄────────────────────────── │
   │  { folders: [...],           │
   │    files: [...] }            │
```

---

## 4. Identification — What Identifies a User?

| Layer | Identifier | Format | Purpose |
|-------|-----------|--------|---------|
| **Google** | `sub` (Google subject ID) | Opaque string | Google's unique ID for the user — used only during token verification, **not stored** |
| **Database** | `user_id` | UUID v4 (`crypto.randomUUID()`) | **Primary internal identifier** — used in all DB queries and relationships |
| **Database** | `email` | Lowercase email string | Used for **user lookup/upsert** during login; unique per user (matched case-insensitively) |
| **Session JWT** | `user_id` + `email` | JWT payload fields | Carried in the session cookie; used to authenticate subsequent requests |
| **HTTP** | `session` cookie | HMAC-SHA256 signed JWT | The **only credential** sent by the browser after login |

### Key Design Decisions

1. **Email is the identity anchor** — When a user logs in, the worker looks up the user by `email` (case-insensitive). If not found, a new user is created with a fresh `user_id` (UUID). The Google `sub` field is **not stored**.
2. **`user_id` (UUID) is the internal foreign key** — All `files` and `folders` rows reference `user_id`, never `email`.
3. **No password storage** — Authentication is entirely delegated to Google. The worker only verifies the Google-issued ID token.
4. **Session = signed JWT in a cookie** — After login, the browser receives an `HttpOnly`, `Secure`, `SameSite=Lax` cookie containing a JWT signed with `SESSION_SECRET` (HMAC-SHA256). This cookie is the **sole authentication credential** for all subsequent API calls.

---

## 5. Session Management

### JWT Structure

```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: { "user_id": "<uuid>", "email": "<email>", "exp": <unix_timestamp> }
Signature: HMAC-SHA256(header.payload, SESSION_SECRET)
```

### Cookie Properties

| Property | Value | Reason |
|----------|-------|--------|
| `HttpOnly` | `true` | Prevents JavaScript access (XSS protection) |
| `Secure` | `true` | Only sent over HTTPS |
| `SameSite` | `Lax` | CSRF protection; cookie sent on top-level navigations |
| `Path` | `/` | Available to all routes |
| `Max-Age` | `604800` (7 days) | Session duration |

### JWT Signing & Verification

- **Key import**: The `SESSION_SECRET` string is imported as an HMAC key via `crypto.subtle.importKey()`. The imported key is cached in a `Map` (max 4 entries) to avoid re-importing on every request.
- **Signing**: `crypto.subtle.sign('HMAC', key, signingInput)` where `signingInput` = `base64url(header).base64url(payload)`.
- **Verification**: `crypto.subtle.verify('HMAC', key, signature, signingInput)`. Additionally checks `exp > now`, and that `user_id` and `email` are present.

---

## 6. Database Schema

**Database**: `graphicsh_oc_db` (Cloudflare D1 / SQLite)

### 6.1 `users` Table

**What is stored:** Every person who signs in with Google gets a row here. The worker generates a `user_id` (UUID v4) on first login and uses the Google-provided email and display name. The table also tracks **when** the user first and last signed in (Unix ms timestamps), **how much** they've stored (cached counters for total files and total bytes), and whether a moderator has **blocked** them from writing.

| Column | Type | Constraints | Description | Example Value |
|--------|------|-------------|-------------|---------------|
| `sr_no` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Auto-increment row ID | `1` |
| `user_id` | `TEXT` | `NOT NULL UNIQUE` | UUID v4 — primary identifier used across all tables | `"d4f1a2b3-..."` |
| `display_name` | `TEXT` | — | User's display name (from Google profile or email) | `"John Doe"` |
| `email` | `TEXT` | — | User's email address (stored lowercase) | `"john@gmail.com"` |
| `first_sign_in` | `INTEGER` | — | Unix timestamp (ms) — when user first logged in | `1741627200000` |
| `last_sign_in` | `INTEGER` | — | Unix timestamp (ms) — last login | `1741713600000` |
| `total_files` | `INTEGER` | `DEFAULT 0` | Cached count of user's files (updated on create/delete) | `5` |
| `total_storage` | `INTEGER` | `DEFAULT 0` | Cached total storage in bytes (updated on save/delete) | `12480` |
| `write_blocked` | `INTEGER` | `DEFAULT 0` | Moderation flag: `0` = normal, `1` = cannot create/save/delete | `0` |
| `last_opened_file_id` | `TEXT` | — | Last opened file UUID (used by frontend to restore active file) | `"e5f6a7b8-..."` |

**Indexes:**

| Index Name | Column(s) | Type | Purpose |
|------------|-----------|------|---------|
| `idx_users_user_id` | `user_id` | `INDEX` | Fast user lookup by UUID |
| `idx_users_email` | `lower(email)` | `UNIQUE INDEX` | Enforce one account per email (case-insensitive) |

**CREATE statement:**
```sql
CREATE TABLE IF NOT EXISTS users (
  sr_no INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  first_sign_in INTEGER,
  last_sign_in INTEGER,
  total_files INTEGER DEFAULT 0,
  total_storage INTEGER DEFAULT 0,
  write_blocked INTEGER DEFAULT 0,
  last_opened_file_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email));
```

---

### 6.2 `folders` Table

**What is stored:** Each row represents one folder created by a user. Folders are flat (no nesting). The `id` is a UUID generated server-side. The unique constraint on `(user_id, folder_name)` prevents a user from creating two folders with the same name.

| Column | Type | Constraints | Description | Example Value |
|--------|------|-------------|-------------|---------------|
| `id` | `TEXT` | `PRIMARY KEY` | UUID v4 — unique folder identifier | `"a1b2c3d4-..."` |
| `user_id` | `TEXT` | `NOT NULL` | Owner's `user_id` (FK to `users.user_id`) | `"d4f1a2b3-..."` |
| `folder_name` | `TEXT` | `NOT NULL` | Display name of the folder (max 100 chars, no `/` or `\`) | `"Assignments"` |

**Indexes:**

| Index Name | Column(s) | Type | Purpose |
|------------|-----------|------|---------|
| `idx_folders_user_id` | `user_id` | `INDEX` | Fast lookup of all folders for a user |
| `idx_unique_user_folder` | `(user_id, folder_name)` | `UNIQUE` | Prevent duplicate folder names per user |

**CREATE statement:**
```sql
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  folder_name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_folder ON folders(user_id, folder_name);
```

---

### 6.3 `files` Table

**What is stored:** Every code file a user creates or saves. The `file_content` column stores the **full source code** as text. A `content_hash` (SHA-256 hex) enables deduplication — if the user saves the same content again, the worker skips the DB write. The `folder_id` is `NULL` for root-level files. The unique constraint on `(user_id, folder_id, file_name)` prevents duplicates within the same folder.

| Column | Type | Constraints | Description | Example Value |
|--------|------|-------------|-------------|---------------|
| `id` | `TEXT` | `PRIMARY KEY` | UUID v4 — unique file identifier | `"e5f6a7b8-..."` |
| `user_id` | `TEXT` | `NOT NULL` | Owner's `user_id` (FK to `users.user_id`) | `"d4f1a2b3-..."` |
| `folder_id` | `TEXT` | — | Parent folder's `id` (FK to `folders.id`). `NULL` = root level. | `"a1b2c3d4-..."` or `NULL` |
| `file_name` | `TEXT` | `NOT NULL` | Name of the file (alphanumeric + `_` `-` `.`) | `"main.cpp"` |
| `file_content` | `TEXT` | — | Full source code content | `"#include <graphics.h>\n..."` |
| `file_size` | `INTEGER` | — | Size in bytes (`new TextEncoder().encode(content).byteLength`) | `1250` |
| `content_hash` | `TEXT` | — | SHA-256 hex digest of `file_content` | `"e3b0c44298fc1c..."` |

**Indexes:**

| Index Name | Column(s) | Type | Purpose |
|------------|-----------|------|---------|
| `idx_files_user_id` | `user_id` | `INDEX` | Fast lookup of all files for a user |
| `idx_files_folder_id` | `folder_id` | `INDEX` | Fast lookup of files within a folder |
| `idx_unique_file_in_folder` | `(user_id, folder_id, file_name)` with `WHERE folder_id IS NOT NULL` | `UNIQUE INDEX` | Prevent duplicate file names in the same non-root folder |
| `idx_unique_root_file` | `(user_id, file_name)` with `WHERE folder_id IS NULL` | `UNIQUE INDEX` | Prevent duplicate root-level file names per user |

**CREATE statement:**
```sql
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  folder_id TEXT,
  file_name TEXT NOT NULL,
  file_content TEXT,
  file_size INTEGER,
  content_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_file_in_folder
ON files(user_id, folder_id, file_name)
WHERE folder_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_root_file
ON files(user_id, file_name)
WHERE folder_id IS NULL;
```

---

### ER Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│      users       │       │     folders      │       │      files       │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ sr_no (PK, AUTO) │       │ id (PK, UUID)    │       │ id (PK, UUID)    │
│ user_id (UQ,UUID)│◄──┐   │ user_id (FK)     │◄──┐   │ user_id (FK)     │
│ display_name     │   ├───│ folder_name      │   ├───│ folder_id (FK)   │──► folders.id
│ email            │   │   └──────────────────┘   │   │ file_name        │
│ first_sign_in    │   │                          │   │ file_content     │
│ last_sign_in     │   │                          │   │ file_size        │
│ total_files      │   └──────────────────────────┘   │ content_hash     │
│ total_storage    │                                  └──────────────────┘
│ write_blocked    │
└──────────────────┘

Relationships:
  users.user_id  1 ──── * folders.user_id    (one user → many folders)
  users.user_id  1 ──── * files.user_id      (one user → many files)
  folders.id     1 ──── * files.folder_id    (one folder → many files; NULL = root)
```

---

## 7. API Endpoints

### 7.1 Auth Endpoints (No session required)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/health` | Inline | Health check — returns `{ ok: true }` |
| `POST` | `/auth/google` | `handleGoogleLogin()` | Accepts Google ID token, verifies with Google, upserts user, issues session cookie |
| `GET` | `/auth/session` | `handleSession()` | Checks if current session cookie is valid; returns auth status |
| `POST` | `/auth/logout` | `handleLogout()` | Clears session cookie |

### 7.2 File Endpoints (Session required)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/api/files` | `handleFilesRoutes.getFiles()` | Fetch all folders and files for the authenticated user |
| `POST` | `/api/file/create` | `handleFilesRoutes.createFile()` | Create a new empty file |
| `POST` | `/api/file/save` | `handleFilesRoutes.saveFile()` | Save/update file content (upsert behavior) |
| `DELETE` | `/api/file/delete` | `handleFilesRoutes.deleteFile()` | Delete a file by `file_id` |

### 7.3 Folder Endpoints (Session required)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `POST` | `/api/folder/create` | `handleFolderRoutes.createFolder()` | Create a new folder |
| `DELETE` | `/api/folder/delete` | `handleFolderRoutes.deleteFolder()` | Delete a folder and all its files |

---

### Endpoint Details (with SQL Queries)

Every endpoint below includes the **exact SQL queries** that run during execution, with bind parameter positions (`?1`, `?2`, …) showing what values are substituted.

---

#### `POST /auth/google`

**Handler:** `handleGoogleLogin()` in `utils/auth.js`  
**Auth required:** No  
**Tables touched:** `users` (READ + WRITE)

**Request:**
```json
{
  "id_token": "<Google ID Token string>"
}
```

**Step-by-step execution:**

1. **Parse body** — Extract `id_token` from JSON body.
2. **Verify with Google** — `GET https://oauth2.googleapis.com/tokeninfo?id_token=<token>`. Validates `aud === GOOGLE_CLIENT_ID`, `email_verified !== 'false'`, `exp > now`.
3. **Lookup user by email:**

```sql
-- Query 1: Find existing user by email (case-insensitive)
SELECT user_id, display_name, email, write_blocked, total_files, total_storage
FROM users
WHERE lower(email) = lower(?1)
LIMIT 1
-- ?1 = identity.email (e.g. 'john@gmail.com')
```

4a. **If user NOT found — create new user:**

```sql
-- Query 2a: Insert new user
INSERT INTO users (user_id, display_name, email, first_sign_in, last_sign_in, total_files, total_storage, write_blocked)
VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, 0)
-- ?1 = crypto.randomUUID()      (e.g. 'd4f1a2b3-7c8e-4f9a-b123-456789abcdef')
-- ?2 = identity.name || email    (e.g. 'John Doe')
-- ?3 = identity.email            (e.g. 'john@gmail.com')
-- ?4 = Date.now()                (e.g. 1741627200000)
-- ?5 = Date.now()                (same as above)
```

4b. **If user FOUND — update last sign-in:**

```sql
-- Query 2b: Update existing user's last sign-in and name
UPDATE users
SET last_sign_in = ?1, display_name = COALESCE(?2, display_name)
WHERE user_id = ?3
-- ?1 = Date.now()                (e.g. 1741713600000)
-- ?2 = identity.name             (e.g. 'John Doe', or NULL if Google didn't provide)
-- ?3 = user.user_id              (the existing UUID)
```

5. **Sign JWT** — `{ user_id, email, exp: now + 7 days }` signed with HMAC-SHA256 using `SESSION_SECRET`.
6. **Return response + Set-Cookie.**

**Response (200):**
```json
{
  "authenticated": true,
  "email": "john@gmail.com",
  "display_name": "John Doe"
}
```
+ `Set-Cookie: session=<JWT>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`

**Errors:** `400` (missing token), `401` (invalid/expired token, audience mismatch, unverified email), `500` (missing `GOOGLE_CLIENT_ID` or `SESSION_SECRET`)

---

#### `GET /auth/session`

**Handler:** `handleSession()` in `utils/auth.js`  
**Auth required:** No (checks auth internally)  
**Tables touched:** `users` (READ)

**Request:** Cookie header with `session=<JWT>`

**Step-by-step execution:**

1. **Parse cookie** — Extract `session` from `Cookie` header.
2. **Verify JWT** — HMAC-SHA256 verification + check `exp > now`.
3. **Check user cache** — If `user_id` is in `USER_CACHE` (5 min TTL), use cached user.
4. **If not cached — look up user in DB:**

```sql
-- Query 1: Find user by user_id from JWT payload
SELECT user_id, display_name, email, write_blocked, total_files, total_storage
FROM users
WHERE user_id = ?1
LIMIT 1
-- ?1 = session.user_id  (UUID from JWT payload)
```

5. **Cross-check** — Verify `user.email` matches the `email` in the JWT payload (case-insensitive).

**Response (200 — valid session):**
```json
{ "authenticated": true, "email": "john@gmail.com", "display_name": "John Doe" }
```

**Response (200 — invalid/expired/missing session):**
```json
{ "authenticated": false }
```

> Note: Returns `200` even for invalid sessions (not `401`). This allows the frontend to check auth status without triggering error handling.

---

#### `POST /auth/logout`

**Handler:** `handleLogout()` in `utils/auth.js`  
**Auth required:** No  
**Tables touched:** None  
**SQL Queries:** None

**Step-by-step execution:**

1. Build a cookie with `Max-Age=0` to clear the session cookie.
2. Return success response.

**Response (200):**
```json
{ "success": true }
```
+ `Set-Cookie: session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`

---

#### `GET /api/files`

**Handler:** `handleFilesRoutes.getFiles()` in `routes/files.js`  
**Auth required:** Yes (session cookie → `authenticateRequest()`)  
**Tables touched:** `users` (READ via auth + last opened lookup), `folders` (READ), `files` (READ)

**Auth middleware query** (runs before the handler):
```sql
-- Auth: Find user by user_id from JWT
SELECT user_id, display_name, email, write_blocked, total_files, total_storage
FROM users
WHERE user_id = ?1
LIMIT 1
-- ?1 = session.user_id
```

**Handler queries** (batched for performance):
```sql
-- Query 1: Get last opened file id for this user
SELECT last_opened_file_id
FROM users
WHERE user_id = ?1
LIMIT 1
-- ?1 = user.user_id

-- Query 2: Get all folders for this user
SELECT id, folder_name
FROM folders
WHERE user_id = ?1
ORDER BY folder_name COLLATE NOCASE
-- ?1 = user.user_id

-- Query 3: Get all files for this user (with folder name via JOIN)
SELECT
  f.id,
  f.file_name,
  f.file_content,
  f.folder_id,
  fo.folder_name
FROM files f
LEFT JOIN folders fo ON f.folder_id = fo.id AND fo.user_id = ?1
WHERE f.user_id = ?2
ORDER BY f.file_name COLLATE NOCASE
-- ?1 = user.user_id
-- ?2 = user.user_id
```

> All three queries execute in a **single batch** (`db.batch([userStmt, foldersStmt, filesStmt])`) for reduced round-trip latency.

**Response (200):**
```json
{
  "last_opened_file_id": "e5f6a7b8-...",
  "folders": [
    { "id": "a1b2c3d4-...", "folder_name": "Assignments" }
  ],
  "files": [
    {
      "id": "e5f6a7b8-...",
      "file_name": "main.cpp",
      "file_content": "#include <graphics.h>\nint main() { ... }",
      "folder_id": null,
      "folder_name": null
    },
    {
      "id": "f9a0b1c2-...",
      "file_name": "assignment1.cpp",
      "file_content": "// Assignment 1\n...",
      "folder_id": "a1b2c3d4-...",
      "folder_name": "Assignments"
    }
  ]
}
```

---

#### `POST /api/file/create`

**Handler:** `handleFilesRoutes.createFile()` in `routes/files.js`  
**Auth required:** Yes  
**Tables touched:** `folders` (READ — ownership check), `files` (READ + WRITE), `users` (WRITE — stats update)

**Request:**
```json
{
  "file_name": "newfile.cpp",
  "folder_id": "a1b2c3d4-..."   // or null for root
}
```

**Step-by-step execution:**

1. **Validate input** — `file_name` must match `/^[a-zA-Z0-9_\-.]+$/`. `folder_id` is normalized to `null` if empty.
2. **If `folder_id` is provided — verify ownership:**

```sql
-- Query 1 (conditional): Verify folder belongs to this user
SELECT id
FROM folders
WHERE id = ?1 AND user_id = ?2
LIMIT 1
-- ?1 = body.folder_id  (e.g. 'a1b2c3d4-...')
-- ?2 = user.user_id
-- If no row → throw 404 "Folder not found"
```

3. **Check for duplicate file name:**

```sql
-- Query 2a (if folder_id is NULL): Check for existing file at root
SELECT id, content_hash, COALESCE(file_size, 0) AS file_size
FROM files
WHERE user_id = ?1
  AND folder_id IS NULL
  AND file_name = ?2
LIMIT 1
-- ?1 = user.user_id
-- ?2 = validated file_name

-- Query 2b (if folder_id is NOT NULL): Check for existing file in folder
SELECT id, content_hash, COALESCE(file_size, 0) AS file_size
FROM files
WHERE user_id = ?1
  AND folder_id = ?2
  AND file_name = ?3
LIMIT 1
-- ?1 = user.user_id
-- ?2 = folder_id
-- ?3 = validated file_name
-- If row exists → return 409 "File with this name already exists"
```

4. **Compute SHA-256** of empty string (`''`).
5. **Insert the new file:**

```sql
-- Query 3: Create the file with empty content
INSERT INTO files (id, user_id, folder_id, file_name, file_content, file_size, content_hash)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
-- ?1 = crypto.randomUUID()    (new file UUID)
-- ?2 = user.user_id
-- ?3 = folder_id              (UUID string or NULL)
-- ?4 = validated file_name    (e.g. 'newfile.cpp')
-- ?5 = ''                     (empty content)
-- ?6 = 0                      (file size in bytes)
-- ?7 = SHA-256 of ''          (e.g. 'e3b0c44298fc1c149...')
```

6. **Update user stats (+1 file, +0 bytes):**

```sql
-- Query 4: Increment user's file count
UPDATE users
SET total_files = MAX(COALESCE(total_files, 0) + ?1, 0),
    total_storage = MAX(COALESCE(total_storage, 0) + ?2, 0)
WHERE user_id = ?3
-- ?1 = 1     (fileDelta: +1 new file)
-- ?2 = 0     (storageDelta: 0 bytes for empty file)
-- ?3 = user.user_id
```

**Response (201):**
```json
{
  "id": "e5f6a7b8-...",
  "folder_id": "a1b2c3d4-...",
  "file_name": "newfile.cpp",
  "file_content": "",
  "file_size": 0,
  "content_hash": "e3b0c44298fc1c149..."
}
```

**Errors:** `400` (invalid name), `404` (folder not found), `409` (duplicate name)

---

#### `POST /api/file/save`

**Handler:** `handleFilesRoutes.saveFile()` in `routes/files.js`  
**Auth required:** Yes  
**Tables touched:** `folders` (READ — ownership), `files` (WRITE + optional READ fallback), `users` (WRITE — last opened + stats)  
**Behavior:** This is an **upsert**. Three possible outcomes:

| Scenario | DB Writes | Response |
|----------|-----------|----------|
| File exists + same content hash | **None** (skip) | `200`, `changed: false` |
| File exists + different content | **UPDATE** file | `200`, `changed: true` |
| File does NOT exist | **INSERT** file | `201`, `changed: true` |

**Request:**
```json
{
  "file_name": "main.cpp",
  "folder_id": null,
  "content": "#include <graphics.h>\nint main() {\n  initgraph(...);\n}"
}
```

**Step-by-step execution:**

1. **Validate input** — `file_name` pattern check, `folder_id` normalization, content defaults to `''`.
2. **If `folder_id` provided — verify ownership:**

```sql
-- Query 1 (conditional): Same as file/create
SELECT id FROM folders WHERE id = ?1 AND user_id = ?2 LIMIT 1
```

3. **Size check** — `new TextEncoder().encode(content).byteLength > 1,200,000` → `413`.
4. **Compute SHA-256** of the content.
5. **Upsert by unique key (single statement with conditional conflict updates):**

```sql
INSERT INTO files (id, user_id, folder_id, file_name, file_content, file_size, content_hash)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
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
-- ?1 = candidate file UUID (crypto.randomUUID())
-- ?2 = user.user_id
-- ?3 = folder_id (or NULL)
-- ?4 = file_name
-- ?5 = content
-- ?6 = content byte size
-- ?7 = SHA-256 content hash
```

6a. **If `RETURNING` is empty**: content hash was unchanged, so no file row changed. The worker:
- Reads the existing file id via `getFileByName(...)` (fallback lookup)
- Updates `users.last_opened_file_id` for this request context
- Returns `200` with `changed: false`

6b. **If `RETURNING` has an id**: insert or update happened. The worker:
- Updates `users.last_opened_file_id` to the returned id
- Recalculates user stats using `recalculateAndUpdateUserStats(...)`
- Returns `201` for new insert, `200` for update

7. **Unchanged response:**
```json
{ "success": true, "changed": false, "file_id": "...", "content_hash": "..." }
```

**Response (200 — updated):**
```json
{ "success": true, "changed": true, "file_id": "e5f6...", "content_hash": "abc123...", "file_size": 1250 }
```

**Response (200 — unchanged):**
```json
{ "success": true, "changed": false, "file_id": "e5f6...", "content_hash": "abc123..." }
```

**Response (201 — created):**
```json
{ "success": true, "changed": true, "file_id": "f9a0...", "content_hash": "abc123...", "file_size": 1250 }
```

**Errors:** `400` (invalid name), `404` (folder not found), `409` (duplicate — race condition), `413` (>1.2 MB)

---

#### `DELETE /api/file/delete`

**Handler:** `handleFilesRoutes.deleteFile()` in `routes/files.js`  
**Auth required:** Yes  
**Tables touched:** `files` (READ + DELETE), `users` (WRITE — stats update)

**Request:**
```json
{
  "file_id": "e5f6a7b8-..."
}
```

**Step-by-step execution:**

1. **Validate** — `file_id` must be a non-empty string.
2. **Find the file (and verify ownership):**

```sql
-- Query 1: Look up file by ID and verify it belongs to this user
SELECT id, COALESCE(file_size, 0) AS file_size
FROM files
WHERE id = ?1 AND user_id = ?2
LIMIT 1
-- ?1 = body.file_id   (e.g. 'e5f6a7b8-...')
-- ?2 = user.user_id
-- If no row → return 404 "File not found"
```

3. **Delete the file:**

```sql
-- Query 2: Delete the file
DELETE FROM files
WHERE id = ?1 AND user_id = ?2
-- ?1 = file_id
-- ?2 = user.user_id
```

4. **Update user stats (-1 file, -N bytes):**

```sql
-- Query 3: Decrement user's file count and storage
UPDATE users
SET total_files = MAX(COALESCE(total_files, 0) + ?1, 0),
    total_storage = MAX(COALESCE(total_storage, 0) + ?2, 0)
WHERE user_id = ?3
-- ?1 = -1                           (one fewer file)
-- ?2 = -(fileRow.file_size)         (e.g. -1250 bytes)
-- ?3 = user.user_id
```

**Response (200):**
```json
{ "success": true, "file_id": "e5f6a7b8-..." }
```

**Errors:** `400` (missing `file_id`), `404` (file not found or not owned by user)

---

#### `POST /api/folder/create`

**Handler:** `handleFolderRoutes.createFolder()` in `routes/folders.js`  
**Auth required:** Yes  
**Tables touched:** `folders` (WRITE), `users` (READ — via auth middleware)

**Request:**
```json
{
  "folder_name": "Assignments"
}
```

**Step-by-step execution:**

1. **Validate** — `folder_name` must be non-empty, max 100 chars, no `/` or `\`.
2. **Insert the folder:**

```sql
-- Query 1: Create the folder
INSERT INTO folders (id, user_id, folder_name)
VALUES (?1, ?2, ?3)
-- ?1 = crypto.randomUUID()    (new folder UUID)
-- ?2 = user.user_id
-- ?3 = validated folder_name  (e.g. 'Assignments')
-- If UNIQUE constraint (user_id, folder_name) fails → return 409
```

**Response (201):**
```json
{ "id": "a1b2c3d4-...", "folder_name": "Assignments" }
```

**Errors:** `400` (invalid name), `409` (folder with same name already exists for this user)

---

#### `DELETE /api/folder/delete`

**Handler:** `handleFolderRoutes.deleteFolder()` in `routes/folders.js`  
**Auth required:** Yes  
**Tables touched:** `folders` (READ + DELETE), `files` (READ + DELETE), `users` (WRITE — stats)

**Request:**
```json
{
  "folder_id": "a1b2c3d4-..."
}
```

**Step-by-step execution:**

1. **Validate** — `folder_id` must be a non-empty string.
2. **Verify folder ownership:**

```sql
-- Query 1: Confirm folder exists and belongs to this user
SELECT id
FROM folders
WHERE id = ?1 AND user_id = ?2
LIMIT 1
-- ?1 = body.folder_id
-- ?2 = user.user_id
-- If no row → throw 404 "Folder not found"
```

3. **Count files and storage in the folder:**

```sql
-- Query 2: Get stats for files inside this folder
SELECT COUNT(*) AS files_count, COALESCE(SUM(file_size), 0) AS total_size
FROM files
WHERE user_id = ?1 AND folder_id = ?2
-- ?1 = user.user_id
-- ?2 = folder_id
```

4. **Delete files and folder (batched):**

```sql
-- Query 3a: Delete all files inside the folder
DELETE FROM files
WHERE user_id = ?1 AND folder_id = ?2
-- ?1 = user.user_id
-- ?2 = folder_id

-- Query 3b: Delete the folder itself
DELETE FROM folders
WHERE user_id = ?1 AND id = ?2
-- ?1 = user.user_id
-- ?2 = folder_id
```

> Both DELETE queries run in a **single batch** (`db.batch([deleteFilesStmt, deleteFolderStmt])`).

5. **Update user stats (if files were present):**

```sql
-- Query 4 (conditional — only if files_count > 0 or total_size > 0):
UPDATE users
SET total_files = MAX(COALESCE(total_files, 0) + ?1, 0),
    total_storage = MAX(COALESCE(total_storage, 0) + ?2, 0)
WHERE user_id = ?3
-- ?1 = -files_count       (e.g. -3)
-- ?2 = -total_size        (e.g. -4500)
-- ?3 = user.user_id
```

**Response (200):**
```json
{ "success": true, "folder_id": "a1b2c3d4-..." }
```

**Behavior:** Deletes the folder **and cascade-deletes all files inside it**. User stats are decremented by the exact file count and storage total.

**Errors:** `400` (missing `folder_id`), `404` (folder not found or not owned)

---

## 8. SQL Queries Reference

### Authentication & User Management

| Operation | Query | File |
|-----------|-------|------|
| **Find user by email** | `SELECT user_id, display_name, email, write_blocked, total_files, total_storage FROM users WHERE lower(email) = lower(?) LIMIT 1` | `auth.js` |
| **Create new user** | `INSERT INTO users (user_id, display_name, email, first_sign_in, last_sign_in, total_files, total_storage, write_blocked) VALUES (?, ?, ?, ?, ?, 0, 0, 0)` | `auth.js` |
| **Update last sign-in** | `UPDATE users SET last_sign_in = ?, display_name = COALESCE(?, display_name) WHERE user_id = ?` | `auth.js` |
| **Find user by user_id** | `SELECT user_id, display_name, email, write_blocked, total_files, total_storage FROM users WHERE user_id = ? LIMIT 1` | `auth.js` |

### File Operations

| Operation | Query | File |
|-----------|-------|------|
| **Get user's last opened file** | `SELECT last_opened_file_id FROM users WHERE user_id = ? LIMIT 1` | `files.js` |
| **Get all user files** | `SELECT f.id, f.file_name, f.file_content, f.folder_id, fo.folder_name FROM files f LEFT JOIN folders fo ON f.folder_id = fo.id AND fo.user_id = ? WHERE f.user_id = ? ORDER BY f.file_name COLLATE NOCASE` | `files.js` |
| **Get file by name (root)** | `SELECT id, content_hash, COALESCE(file_size, 0) AS file_size FROM files WHERE user_id = ? AND folder_id IS NULL AND file_name = ? LIMIT 1` | `db.js` |
| **Get file by name (folder)** | `SELECT id, content_hash, COALESCE(file_size, 0) AS file_size FROM files WHERE user_id = ? AND folder_id = ? AND file_name = ? LIMIT 1` | `db.js` |
| **Create file** | `INSERT INTO files (id, user_id, folder_id, file_name, file_content, file_size, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)` | `files.js` |
| **Save file upsert** | `INSERT ... ON CONFLICT(user_id, folder_id, file_name) ... ON CONFLICT(user_id, file_name) ... RETURNING id` | `files.js` |
| **Update user's last opened file** | `UPDATE users SET last_opened_file_id = ? WHERE user_id = ?` | `files.js` |
| **Find file for delete** | `SELECT id, COALESCE(file_size, 0) AS file_size FROM files WHERE id = ? AND user_id = ? LIMIT 1` | `files.js` |
| **Delete file** | `DELETE FROM files WHERE id = ? AND user_id = ?` | `files.js` |
| **List user files (metadata)** | `SELECT id, folder_id, file_name, file_size, content_hash FROM files WHERE user_id = ? ORDER BY file_name COLLATE NOCASE` | `db.js` |

### Folder Operations

| Operation | Query | File |
|-----------|-------|------|
| **Get all user folders** | `SELECT id, folder_name FROM folders WHERE user_id = ? ORDER BY folder_name COLLATE NOCASE` | `files.js` |
| **Create folder** | `INSERT INTO folders (id, user_id, folder_name) VALUES (?, ?, ?)` | `folders.js` |
| **Verify folder ownership** | `SELECT id FROM folders WHERE id = ? AND user_id = ? LIMIT 1` | `db.js` |
| **Count files in folder** | `SELECT COUNT(*) AS files_count, COALESCE(SUM(file_size), 0) AS total_size FROM files WHERE user_id = ? AND folder_id = ?` | `folders.js` |
| **Delete files in folder** | `DELETE FROM files WHERE user_id = ? AND folder_id = ?` | `folders.js` |
| **Delete folder** | `DELETE FROM folders WHERE user_id = ? AND id = ?` | `folders.js` |

### User Stats

| Operation | Query | File |
|-----------|-------|------|
| **Adjust stats (delta)** | `UPDATE users SET total_files = MAX(COALESCE(total_files, 0) + ?, 0), total_storage = MAX(COALESCE(total_storage, 0) + ?, 0) WHERE user_id = ?` | `db.js` |
| **Recalculate stats** | `SELECT COUNT(*) AS total_files, COALESCE(SUM(file_size), 0) AS total_storage FROM files WHERE user_id = ?` followed by `UPDATE users SET total_files = ?, total_storage = ? WHERE user_id = ?` | `db.js` |

---

## 9. Utility Modules

### `utils/auth.js`
The largest module (~446 lines). Handles the complete authentication lifecycle:

- **`parseCookies(cookieHeader)`** — Parses the `Cookie` header string into a `Map<name, value>`.
- **`toBase64Url(input)` / `fromBase64Url(value)`** — Base64URL encoding/decoding for JWT parts.
- **`decodeJsonBase64Url(value)`** — Decodes a Base64URL string and parses it as JSON.
- **`importSessionKey(secret)` / `getSessionKey(secret)`** — Imports `SESSION_SECRET` as an HMAC CryptoKey. Key is cached.
- **`signSessionJwt(payload, secret)`** — Creates and signs a JWT with `{ alg: "HS256", typ: "JWT" }` header.
- **`verifySessionJwt(token, secret)`** — Verifies JWT signature, checks `alg`, `typ`, `exp`, `user_id`, `email`.
- **`verifyGoogleIdToken(idToken, env)`** — Calls Google's `tokeninfo` endpoint, validates `aud`, `email_verified`, `exp`.
- **`getCachedUser()` / `setCachedUser()` / `clearCachedUser()`** — In-memory user cache with 5 min TTL.
- **`upsertUserFromIdentity(env, identity)`** — Finds or creates a user by email, returns normalized user object.
- **`issueSessionLoginResponse(env, user, corsHeaders)`** — Creates the login response with `Set-Cookie`.
- **`authenticateRequest(request, env)`** — Middleware: parses cookie → verifies JWT → fetches user → returns `{ session, user }`.
- **`handleGoogleLogin(request, env, corsHeaders)`** — `/auth/google` handler.
- **`handleSession(request, env, corsHeaders)`** — `/auth/session` handler.
- **`handleLogout(_request, _env, corsHeaders)`** — `/auth/logout` handler.
- **`invalidateUserCache(userId)`** — Exported for external cache invalidation.

### `utils/db.js`
Database helper functions:

- **`ensureFolderOwnership(db, userId, folderId)`** — Throws `404` if the folder doesn't exist or isn't owned by the user.
- **`getFileByName(db, userId, folderId, fileName)`** — Fetches a file by its unique `(user, folder, name)` combo. Handles `NULL` folder_id for root files.
- **`getUserFiles(db, userId)`** — Returns all file metadata (without content) for a user.
- **`recalculateAndUpdateUserStats(db, userId)`** — Full recalculation of `total_files` and `total_storage` from the `files` table.
- **`adjustUserStats(db, userId, fileDelta, storageDelta)`** — Incremental adjustment (e.g., `+1` file, `+500` bytes).
- **`parseSqliteError(error)`** — Detects `UNIQUE constraint failed` errors.

### `utils/hash.js`
- **`computeSha256Hex(content)`** — Computes SHA-256 hash of a string, returns hex digest. Used for content deduplication (skip save if hash unchanged).

### `utils/validate.js`
Input validation with descriptive error throwing:

- **`FILE_NAME_PATTERN`** — `/^[a-zA-Z0-9_\-.]+$/` (alphanumeric, underscores, hyphens, dots).
- **`MAX_FILE_SIZE_BYTES`** — `1,200,000` bytes (1.2 MB).
- **`validateFileName(value)`** — Trims, checks non-empty, validates against pattern.
- **`validateFolderName(value)`** — Trims, checks non-empty, max 100 chars, no `/` or `\`.
- **`validateFolderId(value)`** — Returns `null` for empty/undefined (root level), validates string type.

### `utils/response.js`
HTTP response helpers:

- **`ALLOWED_ORIGINS`** — Whitelist of allowed CORS origins (Vercel prod, Vercel preview, localhost).
- **`withCors(request)`** — Builds CORS headers based on the request's `Origin`. Credentials allowed only for whitelisted origins.
- **`jsonResponse(body, status, headers)`** — Creates a JSON `Response`.
- **`errorResponse(code, message, status, headers)`** — Standardized error response `{ error, code }`.
- **`readJsonBody(request)`** — Parses and validates JSON request body; throws `400` if `Content-Type` isn't `application/json`.

---

## 10. Caching Strategy

Three in-memory `Map` caches operate **per worker isolate** (not shared across edge locations):

| Cache | Key | Value | TTL | Max Size | Purpose |
|-------|-----|-------|-----|----------|---------|
| `USER_CACHE` | `user_id` (UUID) | Normalized user object | 5 min | 2000 entries | Avoid DB read on every authenticated request |
| `GOOGLE_TOKEN_CACHE` | Google ID token (string) | `{ email, name }` | 5 min (or token exp) | 2000 entries | Avoid re-verifying the same Google token |
| `SESSION_KEY_CACHE` | `SESSION_SECRET` string | `CryptoKey` object | Indefinite | 4 entries | Avoid re-importing the HMAC key repeatedly |

**Eviction:** When a cache exceeds its max size, the oldest entry (first inserted) is removed (FIFO).

**Invalidation:**
- `USER_CACHE` is invalidated via `invalidateUserCache(userId)` (exported but currently unused in routes).
- `GOOGLE_TOKEN_CACHE` entries expire naturally based on TTL or token expiration.
- All caches are lost when the worker isolate is recycled.

---

## 11. CORS & Security

### Allowed Origins

```javascript
const ALLOWED_ORIGINS = new Set([
  'https://graphics-h-compiler.vercel.app',
  'https://graphics-h-online-compiler-git-test-albatrosscs-projects.vercel.app',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
]);
```

### CORS Behavior

| Scenario | `Access-Control-Allow-Origin` | `Allow-Credentials` |
|----------|-------------------------------|---------------------|
| Origin in whitelist | `<origin>` | `true` |
| Origin not in whitelist | `null` | `false` |
| No `Origin` header (non-browser) | `*` | `false` |

### Security Measures

1. **HttpOnly cookies** — Session JWT is not accessible via JavaScript.
2. **Secure flag** — Cookie only sent over HTTPS.
3. **SameSite=Lax** — Prevents CSRF on state-changing requests.
4. **Credential-gated CORS** — Only whitelisted origins can send cookies.
5. **Write-blocking** — Moderators can set `write_blocked = 1` to prevent a user from mutating data.
6. **Ownership checks** — Every file/folder operation verifies `user_id` ownership in the SQL query (`WHERE user_id = ?`).
7. **Input validation** — File names, folder names, and folder IDs are validated before any DB interaction.
8. **Content size limit** — Files are capped at 1.2 MB.
9. **Content hash deduplication** — Identical saves are no-ops (no DB write).

---

## 12. Configuration & Secrets

### Wrangler Configuration (`wrangler.jsonc`)

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
  ],
  "vars": {}
}
```

### Secrets (set via `wrangler secret put`)

| Secret | Purpose |
|--------|---------|
| `SESSION_SECRET` | HMAC key used to sign and verify session JWTs |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID — used to validate the `aud` claim in Google ID tokens |

### Environment Variable (`.env`)

| Variable | Value | Purpose |
|----------|-------|---------|
| `ALLOW_TEST_EMAIL_HEADER` | `1` | Local/dev testing toggle for header-based identity mapping. Should be `0` in production. |

---

## 13. File Structure

```
graphics-oc-files/
├── .env                    # Dev-only environment variables
├── index.js                # Re-exports default from worker.js
├── schema.sql              # Full D1 schema (CREATE TABLE + indexes)
├── worker.js               # Main entry point — request router
├── wrangler.jsonc           # Cloudflare Wrangler configuration
│
├── routes/
│   ├── files.js            # File CRUD handlers (get, create, save, delete)
│   └── folders.js          # Folder CRUD handlers (create, delete)
│
├── src/
│   └── index.js            # Alternate entry point (re-exports worker.js)
│
└── utils/
    ├── auth.js             # Google Sign-In verification, JWT sessions, user upsert
    ├── db.js               # Database query helpers and stats management
    ├── hash.js             # SHA-256 content hashing
    ├── response.js         # CORS headers, JSON/error response builders
    └── validate.js         # Input validation (file names, folder names, IDs)
```
