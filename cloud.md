# Cloud Architecture and Implementation Details

This document describes the end-to-end cloud storage system used by the Graphics.h Online Compiler, covering Cloudflare Workers, R2, Supabase Auth/Postgres (RLS), and the frontend autosave flow.

## High-Level Architecture

1. **Frontend (browser)**
   - Uses Supabase Auth (Google OAuth) to obtain an access token.
   - Sends storage requests to the **Flask server** at `/files/*` with `Authorization: Bearer <token>`.
   - Autosaves code to the cloud every ~10 seconds of inactivity (batch save).
   - Offers explicit Save actions:
     - **Save Locally** (always available)
     - **Save to Cloud** (requires sign-in)
   - Forces save on Run, file switch, tab close, and logout.

2. **Flask Server Proxy**
   - Proxies all `/files/*` requests to the Cloudflare Worker.
   - Keeps the Worker URL server-side (never exposed to the browser).
   - Forwards the user’s `Authorization` header.

3. **Cloudflare Worker**
   - The only gateway to the private R2 bucket.
   - Verifies the access token by calling Supabase Auth.
   - Enforces per-user storage isolation via object paths.
   - Reads and writes file metadata through Supabase PostgREST using RLS.

4. **Cloudflare R2 (private)**
   - Stores actual file contents.
   - Objects are stored at:
     `<user_id>/<folder>/<filename>`
   - Never exposed publicly.

5. **Supabase Postgres (RLS)**
   - Stores file metadata: folder, filename, hash, timestamps.
   - RLS ensures `auth.uid() = user_id`.
   - Accessed only via the user’s access token (no service role).

## Cloudflare Worker Implementation

### Authentication

- Every request must include:
  `Authorization: Bearer <Supabase access token>`
- The Worker verifies the token by calling:
  `GET <SUPABASE_URL>/auth/v1/user`
  with headers:
  - `Authorization: Bearer <token>`
  - `apikey: <SUPABASE_ANON_KEY>`
- If verification fails, the Worker rejects the request (fail-closed).
- The authenticated user ID is taken from the returned user object (`user.id`).

### Storage Isolation

- The Worker **never accepts object paths from the client**.
- It constructs object keys internally as:
  `<user_id>/<folder>/<filename>`
- Folder and filename are validated as single path segments
  (no slashes, backslashes, or `..`).

### Endpoints (Worker)

#### `POST /files/save`
Input: `{ folder, filename, content, hash }`

Flow:
1. Verify token.
2. Fetch existing metadata (Supabase).
3. If hash is unchanged, **skip R2 write**.
4. If changed:
   - PUT to R2
   - Upsert metadata in Supabase
5. Return `{ success: true, hash }`.

#### `GET /files/read`
Input: `folder`, `filename` (query params)

Flow:
1. Verify token.
2. Read object from R2.
3. Return raw file content.

#### `GET /files/list`

Flow:
1. Verify token.
2. Query Supabase PostgREST for metadata only.
3. Return array of files.

#### `DELETE /files/delete`
Input: `{ folder, filename }`

Flow:
1. Verify token.
2. Delete object from R2.
3. Delete metadata row from Supabase.

### CORS

Allowed origins:
- `http://localhost:5000`
- `https://graphics-h-compiler.vercel.app`

Preflight (`OPTIONS`) handled explicitly.

### Size Limits

- There are **no file-size limits** enforced by the client or Worker.

## Supabase Postgres + RLS

Table:

```
create table public.user_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder text not null,
  filename text not null,
  file_hash text,
  updated_at timestamptz not null default now()
);
```

RLS policy:

```
auth.uid() = user_id
```

This ensures each user can only see and mutate their own metadata.

## Frontend Autosave Behavior

Autosave is implemented with:

- **Debounced autosave**: after ~10 seconds of inactivity (batch save).
- **Forced saves**:
  - Run button
  - File switch
  - Tab close
  - Logout
  - Visibility change (tab background)

To reduce writes:
- The client hashes content (SHA-256).
- The Worker compares hashes before writing to R2.

If cloud save fails:
- The client stores a local draft in `localStorage`.
- UI shows “Saved Locally”.

## Configuration and Deployment

### Worker config (wrangler.jsonc)

- R2 binding:
  - `USER_FILES_BUCKET` → `graphics-compiler-users`
- Variables:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `PROD_ORIGIN`

### Local server config

`/api/auth/config` returns:

- `supabaseUrl`
- `supabaseAnonKey`

The Worker URL is **never exposed to the browser**. The Flask app proxies all `/files/*` requests to the Worker using `STORAGE_WORKER_URL`.

## Summary

This setup ensures:

- Strong auth (token validated by Supabase).
- Full isolation between users.
- No public access to R2.
- Minimal writes (hash comparison).
- Reliable autosave with local fallback.

The Worker is deployable via `wrangler deploy` and functions end-to-end once env vars and bindings are set.
