# Cloud Storage Architecture

## Overview

The Graphics.h Online Compiler uses a **three-tier architecture** for file storage:

1. **Frontend (Browser)** - User interface, editor, file management
2. **Flask API (Backend)** - Proxies requests to Cloudflare Worker
3. **Cloudflare Worker + R2** - Secure file storage with Supabase Auth

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────────┐
│    Frontend     │────▶│   Flask API     │────▶│   Cloudflare Worker     │
│  (Browser JS)   │     │  (Python)       │     │   + R2 Storage          │
└─────────────────┘     └─────────────────┘     └─────────────────────────┘
        │                       │                         │
        │                       │                         ├── Supabase Auth
        │                       │                         └── R2 Bucket
        │                       │
        └── localStorage        └── Proxy + CORS
```

---

## Save Flow

When user clicks **Save** button:

```
1. saveCode() triggered
   ├── Save to localStorage (tc_code)
   ├── Save to local draft (draft_folder_filename)
   │
   └── If logged in:
       ├── Get Supabase session token
       ├── Compute SHA-256 hash of content
       └── POST /files/save
           └── Flask proxies to Cloudflare Worker
               ├── Verify JWT token with Supabase
               ├── Check if hash unchanged (skip if same)
               ├── Save content to R2 bucket
               └── Upsert metadata to Supabase
```

---

## File Storage Structure

### Local Storage (Browser)
```
localStorage:
├── tc_code                    # Current editor content
├── draft_main_main.cpp        # Draft for main/main.cpp
├── draft_main_test.cpp        # Draft for main/test.cpp
└── draft_projects_app.cpp     # Draft for projects/app.cpp
```

### Cloud Storage (R2)
```
R2 Bucket (user-files):
└── {user_id}/
    └── {folder}/
        └── {filename}

Example:
└── abc123-def456/
    ├── main/
    │   └── main.cpp
    └── projects/
        └── app.cpp
```

---

## API Endpoints

All endpoints require `Authorization: Bearer {supabase_jwt_token}` header.

### `POST /files/save`
Save a single file.

**Request:**
```json
{
    "folder": "main",
    "filename": "main.cpp",
    "content": "#include <graphics.h>...",
    "hash": "a1b2c3d4..."
}
```

**Response:**
```json
{
    "success": true,
    "hash": "a1b2c3d4...",
    "skipped": false
}
```

- `skipped: true` means content unchanged (hash matched)

### `GET /files/list`
List all user files.

**Response:**
```json
{
    "files": [
        {
            "folder": "main",
            "filename": "main.cpp",
            "file_hash": "a1b2c3...",
            "updated_at": "2026-02-05T10:00:00Z"
        }
    ]
}
```

### `GET /files/read`
Read file content.

**Query params:** `?folder=main&filename=main.cpp`

**Response:** Raw file content (text/plain)

### `DELETE /files/delete`
Delete a file.

**Request:**
```json
{
    "folder": "main",
    "filename": "main.cpp"
}
```

---

## Authentication

Uses **Supabase Auth** with Google OAuth.

1. User clicks "Sign in with Google"
2. Supabase handles OAuth flow
3. User redirected back with session
4. Frontend stores JWT in Supabase client
5. All API requests include JWT in Authorization header
6. Cloudflare Worker verifies JWT with Supabase

### CORS

Allowed origins:
- `http://localhost:5000`
- `https://graphics-h-compiler.vercel.app`

---

## Autosave

The editor automatically saves every **7 seconds** after the last change:

```javascript
const AUTOSAVE_DELAY_MS = 7000;

function scheduleAutosave() {
    clearTimeout(CLOUD_STATE.autosaveTimer);
    CLOUD_STATE.autosaveTimer = setTimeout(async () => {
        await forceSaveActiveFile();
    }, AUTOSAVE_DELAY_MS);
}
```

Autosave also triggers on:
- Visibility change (tab hidden)
- Before unload (closing browser)
- Before running program

---

## Hash-Based Deduplication

Every save includes a SHA-256 hash of the content:

1. Frontend computes hash before sending
2. Worker checks if hash matches existing file
3. If unchanged, returns `skipped: true` (no write to R2)
4. Reduces storage writes and costs

---

## File Explorer

When user is logged in, the sidebar shows:

```
📁 main
  └── 📄 main.cpp (active)
  └── 📄 test.cpp
```

**Features:**
- Create new file (adds .cpp extension automatically)
- Create new folder (with default main.cpp)
- Delete files (with confirmation)
- Click to switch files
- Visual indicator for active file

---

## JavaScript Files

### `core.js`
- Logger, global state, cache management
- CLOUD_STATE object for file tracking
- Demo file caching

### `storage.js`
- `saveCode()` - Unified save (local + cloud)
- `createNewFile()` - Simple file creation
- `createNewFolder()` - Simple folder creation
- `deleteFile()` - File deletion
- `refreshCloudFiles()` - Load file list from cloud
- `openFile()` - Load file content
- `updateSaveIndicator()` - UI state

### `editor.js`
- Ace Editor initialization
- Demo file loading
- Editor change handlers

### `runtime.js`
- JS-DOS integration
- Program compilation and execution
- Keyboard shortcuts
- Supabase auth initialization

---

## Environment Variables

### Flask (.env)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
STORAGE_WORKER_URL=https://xxx.workers.dev
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Cloudflare Worker (wrangler.jsonc)
```json
{
    "vars": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_ANON_KEY": "eyJ...",
        "PROD_ORIGIN": "https://graphics-h-compiler.vercel.app"
    }
}
```

---

## Supabase Database

### Table: `user_files`
```sql
CREATE TABLE public.user_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folder TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_hash TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, folder, filename)
);
```

### Row Level Security
```sql
-- Users can only see/modify their own files
CREATE POLICY "Users manage own files" ON user_files
    FOR ALL USING (auth.uid() = user_id);
```

---

## Size Limits

- **No file size limits** enforced
- Files stored as-is in R2
- R2 has 5TB free storage per month
