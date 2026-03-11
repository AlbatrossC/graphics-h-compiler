# User Files — End-to-End Integration Guide

> How the Cloudflare Worker (`graphics-oc-files`) integrates with the Flask backend (`app.py`) and the frontend (`compiler.html` + `storage.js`) to provide file storage, authentication, and autosaving.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture — Three-Layer Proxy Chain](#2-architecture--three-layer-proxy-chain)
3. [Endpoint Map — Where Each Route Lives](#3-endpoint-map--where-each-route-lives)
4. [Authentication Integration](#4-authentication-integration)
5. [File Storage Integration](#5-file-storage-integration)
6. [Autosave System](#6-autosave-system)
7. [Save Triggers — Complete List](#7-save-triggers--complete-list)
8. [Local Storage Layer (IndexedDB)](#8-local-storage-layer-indexeddb)
9. [Login Sync — Guest → Cloud Migration](#9-login-sync--guest--cloud-migration)
10. [Frontend State Management](#10-frontend-state-management)
11. [File Explorer UI](#11-file-explorer-ui)
12. [Data Flow Diagrams](#12-data-flow-diagrams)

---

## 1. System Overview

The file system has **three layers**:

| Layer | Technology | Role |
|-------|-----------|------|
| **Frontend** | `storage.js` + `compiler.html` | UI, local cache (IndexedDB), API calls, autosave timer |
| **Backend Proxy** | `app.py` (Flask) | Reverse proxy — forwards `/api/*` requests to Cloudflare Worker, rewrites cookies, logs operations |
| **Worker** | `graphics-oc-files` (Cloudflare Worker + D1) | Actual logic — auth verification, CRUD, database, session management |

The frontend **never talks directly** to the Cloudflare Worker. All API calls go through the Flask backend, which proxies them transparently. This:
- Avoids CORS issues from the same-origin setup
- Allows the Flask backend to log operations
- Lets the cookie `Domain` be rewritten to match the frontend's domain

---

## 2. Architecture — Three-Layer Proxy Chain

```
┌─────────────────────────────────────────┐
│           Browser (Frontend)            │
│                                         │
│  compiler.html                          │
│  ├── storage.js   (API calls, auth,     │
│  │                 autosave, IndexedDB)  │
│  ├── editor.js    (CodeMirror, change   │
│  │                 listener → autosave)  │
│  ├── core.js      (CLOUD_STATE, config) │
│  └── runtime.js   (compile/run, Ctrl+S) │
│                                         │
│  IndexedDB: compiler_project_files_v1   │
│  localStorage: compiler_last_opened_v1, │
│    compiler_folder_ui_state_v1          │
└──────────────┬──────────────────────────┘
               │  fetch('/api/...')
               │  Cookie: session=<JWT>
               ▼
┌─────────────────────────────────────────┐
│        Flask Backend (app.py)           │
│                                         │
│  /api/auth/config     → local handler   │
│  /api/auth/google   ──┐                 │
│  /api/auth/session  ──┤  proxy_request()│
│  /api/auth/logout   ──┤  to WORKER_URL  │
│  /api/files         ──┤                 │
│  /api/file/create   ──┤                 │
│  /api/file/save     ──┤                 │
│  /api/file/delete   ──┤                 │
│  /api/folder/create ──┤                 │
│  /api/folder/delete ──┘                 │
│                                         │
│  Also: cookie rewriting, logging        │
└──────────────┬──────────────────────────┘
               │  HTTPS + forwarded headers
               │  + session cookie
               ▼
┌─────────────────────────────────────────┐
│   Cloudflare Worker (graphics-oc-files) │
│                                         │
│  /auth/google  → verify Google token,   │
│                   upsert user, issue JWT│
│  /auth/session → verify session cookie  │
│  /auth/logout  → clear cookie           │
│  /api/files    → list files + folders   │
│  /api/file/*   → CRUD on files table    │
│  /api/folder/* → CRUD on folders table  │
│                                         │
│  D1 Database: graphicsh_oc_db           │
└─────────────────────────────────────────┘
```

---

## 3. Endpoint Map — Where Each Route Lives

### Config Endpoint (Flask-only, no proxy)

| Frontend Call | Flask Route | Handler | Proxied? | Purpose |
|--------------|-------------|---------|----------|---------|
| `GET /api/auth/config` | `app.py:268` | `auth_config()` | **No** | Returns `{ authEnabled, storageEnabled, googleClientId }` based on env vars |

**What it checks:**
- `authEnabled` = `True` if **both** `USER_FILES_WORKERS` **and** `GOOGLE_CLIENT_ID` are set
- `storageEnabled` = `True` if `USER_FILES_WORKERS` is set
- `googleClientId` = value of `GOOGLE_CLIENT_ID` env var

### Auth Endpoints (Proxied to Worker)

| Frontend Call | Flask Route | Worker Path | Frontend Caller | Purpose |
|--------------|-------------|-------------|-----------------|---------|
| `POST /api/auth/google` | `app.py:277` | `/auth/google` | `handleGoogleCredentialResponse()` in `storage.js:562` | Send Google ID token, receive session cookie |
| `GET /api/auth/session` | `app.py:278` | `/auth/session` | `checkSession()` in `storage.js:454` | Check if current session cookie is valid |
| `POST /api/auth/logout` | `app.py:279` | `/auth/logout` | `signOut()` in `storage.js:716` | Clear session cookie |

### File Endpoints (Proxied to Worker)

| Frontend Call | Flask Route | Worker Path | Frontend Caller | Purpose |
|--------------|-------------|-------------|-----------------|---------|
| `GET /api/files` | `app.py:304` | `/api/files` | `refreshCloudFiles()` in `storage.js:772` | Fetch all folders + files (with content) |
| `POST /api/file/create` | `app.py:305` | `/api/file/create` | *(not directly used — `file/save` handles creation)* | Create empty file |
| `POST /api/file/save` | `app.py:306` | `/api/file/save` | `forceSaveActiveFile()` in `storage.js:835` | Save/upsert file content |
| `DELETE /api/file/delete` | `app.py:307` | `/api/file/delete` | `deleteFile()` in `storage.js:995` | Delete a file by ID |
| `POST /api/folder/create` | `app.py:308` | `/api/folder/create` | `createNewFolder()` in `storage.js:905` | Create a named folder |
| `DELETE /api/folder/delete` | `app.py:309` | `/api/folder/delete` | `deleteFolder()` in `storage.js:973` | Delete folder + all files inside |

### Proxy Mechanism (app.py)

The Flask backend uses a `proxy_request()` function (line 215) that:

1. Reads the request body, headers, cookies from the browser
2. Forwards them to `USER_FILES_WORKERS` URL (e.g., `https://graphics-oc-files.albatrossc.workers.dev`)
3. The path is adjusted: `/api/file/save` → `/api/file/save` (kept as-is for storage routes), `/api/auth/google` → `/auth/google` (strips `/api` prefix for auth routes)
4. Copies response headers back, **rewrites `Set-Cookie`** (removes `Domain=`, strips `Secure` on HTTP)
5. Logs the operation with color-coded terminal output

**Cookie rewriting** (line 202): The Worker sets cookies with `Domain` pointing to the worker's domain. The Flask proxy strips the `Domain` attribute so the cookie is scoped to the Flask app's domain instead. It also removes `Secure` flag when running on `http://` (local dev).

---

## 4. Authentication Integration

### Boot Sequence (Page Load)

```
Page Load
    │
    ▼
storage.js: startAuthInit()
    │
    ▼
loadAuthConfig()                              ← GET /api/auth/config
    │
    ├── authEnabled? → initGoogleIdentity()   ← loads Google GSI script
    │                    renders Google button
    │
    ▼
checkSession()                                ← GET /api/auth/session
    │
    ├── 200 + authenticated: true
    │   ├── updateLoginUI(true, user)
    │   ├── refreshCloudFiles(true)           ← GET /api/files
    │   ├── openFile(lastOpened || main.cpp)
    │   └── Show file explorer, hide sign-in promo
    │
    └── 200 + authenticated: false
        ├── updateLoginUI(false)
        ├── Show sign-in promo ("Sign in to save your projects to the cloud")
        └── Load guest file from IndexedDB (root/main.cpp)
```

### Google Sign-In Flow (User Clicks Button)

```
User clicks "Sign in with Google"
    │
    ▼
Google Identity Services → callback with credential (ID token)
    │
    ▼
handleGoogleCredentialResponse()
    ├── POST /api/auth/google { id_token }    ← via Flask proxy → Worker
    │   └── Worker: verify token → upsert user → sign JWT → Set-Cookie
    │
    ├── updateLoginUI(true, user)
    ├── setExplorerLoading(true, 'Syncing...')
    │
    ├── syncLocalToCloud()                    ← merge guest files to cloud
    │   ├── Read IndexedDB for root/main.cpp
    │   ├── GET /api/files                    ← check what cloud already has
    │   ├── Case A: cloud empty → POST /api/file/save (upload local main.cpp)
    │   ├── Case B: content identical → skip
    │   └── Case C: differs → POST /api/file/save (upload as local-main.cpp)
    │
    ├── refreshCloudFiles() or use sync snapshot
    ├── Rebuild IndexedDB cache from cloud files
    └── openFile(lastOpened || main.cpp)
```

### Sign-Out Flow

```
User clicks "Sign out"
    │
    ▼
signOut()
    ├── forceSaveActiveFile('signOut') if dirty  ← save to cloud first
    ├── updateLoginUI(false)
    ├── POST /api/auth/logout                    ← clear session cookie
    ├── clearAllLocalDrafts()                    ← clear IndexedDB
    ├── setLocalDraft('root', 'main.cpp', code)  ← preserve current code as guest file
    └── Show sign-in promo
```

### HTML Elements for Auth

In `compiler.html`:

| Element ID | Purpose |
|-----------|---------|
| `cloud-promo-view` (line 265) | Shown when logged out — contains sign-in button |
| `google-btn-render` (line 273) | Google renders its branded button here |
| `google-signin-btn` (line 274) | Fallback custom sign-in button |
| `auth-status-text` (line 292) | Status text: "Unlimited projects · Access anywhere" or "Signed in as user@email" |
| `file-explorer-view` (line 297) | Shown when logged in — contains the file tree |
| `user-profile-section` (line 411) | User avatar, name, email, sign-out button |
| `signout-btn` (line 413) | Sign-out button |

---

## 5. File Storage Integration

### Two Storage Modes

| Mode | Primary Storage | What Happens |
|------|----------------|--------------|
| **Guest** (not signed in) | **IndexedDB** (`compiler_project_files_v1`) | Files saved locally only. Single file: `root/main.cpp` |
| **Logged In** | **Cloudflare D1** (via Worker API) | Files saved to cloud. IndexedDB acts as local cache mirror |

### How `GET /api/files` Data Flows

```
Worker returns:
{
  folders: [{ id, folder_name }],
  files: [{ id, file_name, file_content, folder_id, folder_name }]
}
        │
        ▼
updateCloudStateFromPayload()     (storage.js:735)
        │
        ├── Populates CLOUD_STATE.folders (Set)
        ├── Populates CLOUD_STATE.folderIdToName (Map: id → name)
        ├── Populates CLOUD_STATE.folderNameToId (Map: name → id)
        └── Populates CLOUD_STATE.files (Map: "folderId/filename" → fileObject)
                │
                ▼
        renderFileExplorer()      (storage.js:371)
                │
                ├── Groups files by folder
                ├── Creates folder group DOM elements
                ├── Creates file item DOM elements
                └── Updates file count badge
```

### How `POST /api/file/save` Works (Frontend Side)

```
forceSaveActiveFile(trigger, options)
    │
    ├── Get code from editor: editor.getValue()
    │
    ├── If NOT logged in:
    │   └── persistLocalSave(code) → FileDB.put() to IndexedDB
    │
    ├── If logged in:
    │   ├── Compute SHA-256 hash
    │   ├── Check: hash === SAVE_STATE.lastSavedHash?
    │   │   └── Yes → skip save (return { skipped: true, unchanged: true })
    │   │
    │   ├── POST /api/file/save
    │   │   Body: { folder_id, file_name, content }
    │   │       ↓ Flask proxy ↓
    │   │   Worker: compute hash, check existing file
    │   │   ├── Same hash → return { changed: false } (no DB write)
    │   │   ├── Exists + different → UPDATE files table
    │   │   └── Not exists → INSERT into files table
    │   │
    │   ├── Update CLOUD_STATE.files in memory
    │   ├── Update IndexedDB cache (non-blocking)
    │   ├── Update SAVE_STATE.lastSavedHash
    │   ├── Set DIRTY_FLAG.isDirty = false
    │   └── Update save indicator UI
    │
    └── Return { success: true, changed: true/false }
```

### Save Indicator States

The header shows a save status indicator (`#save-indicator`):

| State | Text | CSS Class | Meaning |
|-------|------|-----------|---------|
| Unsaved | "Unsaved" | (no class) | `DIRTY_FLAG.isDirty = true` or no `lastSavedHash` |
| Saved (guest) | "Saved locally" | `.saved` | Saved to IndexedDB |
| Saved (cloud) | "Saved to cloud" | `.saved` | Saved to Worker/D1 |

---

## 6. Autosave System

### How It Works

The autosave is a **20-second idle timer** that resets on every keystroke.

```
User types in editor
    │
    ▼
editor.js: change listener (line 173)
    ├── Mark DIRTY_FLAG.isDirty = true
    ├── Update save indicator ("Unsaved")
    ├── setLocalDraftImmediate()        ← write to IndexedDB immediately (non-blocking)
    └── scheduleAutosave()             ← reset 20s timer

    ... user stops typing for 20 seconds ...

    ▼
scheduleAutosave() timer fires
    │
    ├── Check: DIRTY_FLAG.isDirty?
    │   └── No → return (nothing to save)
    │
    ├── If logged in:
    │   └── forceSaveActiveFile('idle', { force: false, silent: true })
    │       └── POST /api/file/save → Flask → Worker → D1
    │
    └── If guest:
        └── persistLocalSave(editor.getValue())
            └── FileDB.put() → IndexedDB
```

### Key Constants

| Constant | Value | Defined In | Purpose |
|----------|-------|-----------|---------|
| `AUTOSAVE_DELAY_MS` | `20000` (20 seconds) | `core.js:311` | Idle time before autosave triggers |
| `TYPING_DEBOUNCE_MS` | `0` | `core.js:312` | Timer resets immediately on every keystroke |

### Autosave Behavior Rules

1. **Timer resets on every edit** — User must be idle for 20 seconds before autosave fires
2. **Only saves if dirty** — If `DIRTY_FLAG.isDirty` is `false`, the timer callback exits immediately
3. **Hash dedup on both sides** — Client checks `SAVE_STATE.lastSavedHash` before making the API call; Worker also checks `content_hash` in DB
4. **No restart after save** — Timer stays null after firing. Only restarts when user types again
5. **Silent** — The `{ silent: true }` flag means no Logger messages and just internal indicator updates
6. **Works for both modes** — Guest users get IndexedDB saves; logged-in users get cloud saves
7. **Cancelled on compile/run** — `runtime.js:447-449` cancels pending autosave timer before compile

---

## 7. Save Triggers — Complete List

Every code path that can save a file:

| Trigger | Source | Route Called | Behavior |
|---------|--------|-------------|----------|
| **Manual save** (Save button) | `saveCode()` → `forceSaveActiveFile('manual', { force: true })` | `POST /api/file/save` | Always saves, even if hash unchanged. Shows button feedback. |
| **Ctrl+S / Cmd+S** | `runtime.js:592-595` → `saveCode()` | `POST /api/file/save` | Same as manual save |
| **Autosave (idle)** | `scheduleAutosave()` → `forceSaveActiveFile('idle', { force: false, silent: true })` | `POST /api/file/save` | Skips if hash unchanged. Silent. |
| **File switch** | `openFile()` → `forceSaveActiveFile('fileSwitch', { force: false, silent: true })` | `POST /api/file/save` | Saves current file before switching to another |
| **Sign-out** | `signOut()` → `forceSaveActiveFile('signOut', { force: false, silent: true })` | `POST /api/file/save` | Saves dirty changes before logging out |
| **Compile/Run** | `runtime.js:461` → `saveCode()` | `POST /api/file/save` | Saves code before compilation, but skips the progress bar |
| **New file creation** | `createNewFile()` → `fetchJson('/api/file/save', ...)` | `POST /api/file/save` | Creates file with starter template via upsert |
| **Login sync** | `syncLocalToCloud()` → `fetchJson('/api/file/save', ...)` | `POST /api/file/save` | Uploads guest `main.cpp` to cloud |
| **Guest save (local)** | `persistLocalSave()` → `FileDB.put()` | None (IndexedDB only) | Guest-mode save to browser storage |
| **Draft write (on every keystroke)** | `setLocalDraftImmediate()` → `FileDB.put()` | None (IndexedDB only) | Non-blocking draft write for crash recovery |

---

## 8. Local Storage Layer (IndexedDB)

### Database: `compiler_project_files_v1`

| Store | Key | Record Schema |
|-------|-----|--------------|
| `files` | `id` (string: `"folderId/filename"`) | `{ id, name, content, lastSavedHash, lastModified, dirty, folderId, folderKey }` |

### Usage by Mode

| Operation | Guest Mode | Logged-In Mode |
|-----------|-----------|----------------|
| **Every keystroke** | `setLocalDraftImmediate()` — write draft | Same — write draft to IndexedDB as crash recovery |
| **Autosave (20s idle)** | `persistLocalSave()` — write with `dirty=false` | `forceSaveActiveFile()` — POST to cloud + update IndexedDB cache |
| **Page load** | Read `root/main.cpp` from IndexedDB | Read files from cloud (`GET /api/files`) and mirror into IndexedDB |
| **Login** | Read all IndexedDB files → sync to cloud → clear IndexedDB → rebuild from cloud | N/A |
| **Logout** | N/A | Clear all IndexedDB → write back current code as `root/main.cpp` |

### Other localStorage Keys

| Key | Purpose |
|-----|---------|
| `compiler_last_opened_v1` | Remembers which file was last open (e.g., `"folderId/main.cpp"`) |
| `compiler_folder_ui_state_v1` | JSON object tracking collapsed/expanded state of each folder in explorer |
| `tc_code` | Emergency backup of current code for the compile flow (kept for legacy) |

---

## 9. Login Sync — Guest → Cloud Migration

When a guest user signs in, `syncLocalToCloud()` runs to merge any local files with cloud:

### Three Cases

| Case | Condition | Action |
|------|-----------|--------|
| **A** | Cloud has **no** `main.cpp` | Upload local `main.cpp` to cloud as `main.cpp` |
| **B** | Cloud has `main.cpp` with **identical** content (same SHA-256) | Use cloud version, discard local duplicate |
| **C** | Cloud has `main.cpp` with **different** content | Keep cloud `main.cpp` unchanged. Upload local version as `local-main.cpp` |

After sync:
1. IndexedDB is **cleared** entirely
2. Cloud files are downloaded and used as the new state
3. IndexedDB is rebuilt as a cache mirror of cloud files

---

## 10. Frontend State Management

### Global State (`CLOUD_STATE` in `core.js`)

```javascript
const CLOUD_STATE = {
    files: new Map(),              // Map<"folderId/filename", fileObject>
    folders: new Set(['root']),    // Set of folder IDs
    folderNameToId: new Map(),     // Map<folderName, folderId>
    openTabs: [],                  // (unused currently)
    activeFileKey: 'root/main.cpp', // Currently open file key
    autosaveTimer: null,           // setTimeout ID for autosave
    isSaving: false,               // Mutex to prevent concurrent saves
    lastSavedHash: null,           // SHA-256 of last saved content
    lastSavedAt: null              // Timestamp of last save
};
```

### File Object Shape (in `CLOUD_STATE.files`)

```javascript
{
    id: "e5f6a7b8-...",               // UUID from cloud (or fileKey for guest)
    filename: "main.cpp",              // File name
    folder_id: "a1b2c3d4-..." | null, // Folder UUID (null = root)
    folder_key: "a1b2c3d4-..." | "root",
    folder_name: "main" | "",          // Folder display name
    content: "#include <graphics.h>...", // Full source code
    file_size: 1250,                   // Bytes
    content_hash: "abc123..."          // SHA-256 hex
}
```

### Save State Tracking

```javascript
const SAVE_STATE = {
    lastSavedHash: null,    // SHA-256 of last successfully saved content
    pendingHash: null,      // SHA-256 of content currently being saved (during save request)
    lastSaveTime: 0         // Date.now() of last successful save
};

const DIRTY_FLAG = {
    isDirty: false          // true if editor content differs from lastSavedHash
};
```

---

## 11. File Explorer UI

### HTML Structure (in `compiler.html`)

```
sidebar
├── cloud-promo-view              ← Shown when logged OUT
│   ├── Sign-in promo text
│   ├── google-btn-render         ← Google renders button here
│   └── auth-status-text          ← "Unlimited projects · Access anywhere"
│
├── file-explorer-view            ← Shown when logged IN
│   ├── files-header              ← "WORKSPACE" + file count
│   ├── explorer-loading-state    ← Loading spinner
│   └── main-folder-files         ← File tree container
│       ├── folder-group          ← One per folder
│       │   ├── folder-group-header (click to toggle)
│       │   └── folder-group-files
│       │       ├── file-item     ← One per file
│       │       │   ├── file-icon
│       │       │   ├── file-name
│       │       │   └── file-actions (download, delete)
│       │       └── ...
│       └── ...
│
├── explorer-actions              ← "New Folder" + "New File" buttons (shown when logged in)
│
└── user-profile-section          ← Shown when logged IN
    ├── user-avatar
    ├── user-name / user-email
    └── signout-btn
```

### Explorer Actions

| Button | Shown When | Handler | API Call |
|--------|-----------|---------|----------|
| New Folder | Logged in | `createNewFolder()` | `POST /api/folder/create` |
| New File | Logged in | `createNewFile()` | `POST /api/file/save` (upsert) |
| Refresh | Logged in | `refreshCloudFiles()` | `GET /api/files` |
| Delete File | Logged in, per file | `deleteFile()` | `DELETE /api/file/delete` |
| Delete Folder | Logged in, per folder | `deleteFolder()` | `DELETE /api/folder/delete` |
| Download File | Always, per file | `downloadFile()` | None (reads from memory/IndexedDB) |

---

## 12. Data Flow Diagrams

### Page Load → File Display (Logged-In User)

```
1. Browser loads compiler.html
2. Scripts load: core.js → storage.js → editor.js → runtime.js
3. storage.js: startAuthInit()
4.   └── loadAuthConfig()              → GET /api/auth/config
5.       └── { authEnabled: true, googleClientId: "..." }
6.   └── initGoogleIdentity(clientId)  → renders Google button
7.   └── checkSession()                → GET /api/auth/session
8.       └── { authenticated: true, email: "john@gmail.com" }
9.   └── updateLoginUI(true, user)     → show explorer, hide promo
10.  └── refreshCloudFiles(true)       → GET /api/files
11.      └── { folders: [...], files: [...] }
12.      └── updateCloudStateFromPayload()
13.      └── renderFileExplorer()       → DOM updated
14.  └── openFile(lastOpened || main.cpp)
15.      └── editor.setValue(content)
16.      └── SAVE_STATE.lastSavedHash = SHA-256(content)
```

### Keystroke → Autosave → Cloud (Logged-In User)

```
1. User types in editor
2. editor.js: change listener fires
3.   └── DIRTY_FLAG.isDirty = true
4.   └── updateSaveIndicator() → "Unsaved"
5.   └── setLocalDraftImmediate(folder, filename, content) → IndexedDB
6.   └── scheduleAutosave() → clearTimeout + setTimeout(20000ms)
7.
8. ... 20 seconds of no typing ...
9.
10. Autosave timer fires
11.  └── DIRTY_FLAG.isDirty? → yes
12.  └── forceSaveActiveFile('idle', { silent: true })
13.      └── Compute SHA-256
14.      └── Hash !== lastSavedHash? → yes
15.      └── POST /api/file/save { folder_id, file_name, content }
16.          └── Flask proxy → Worker → D1 (UPDATE files)
17.          └── Response: { success: true, changed: true, content_hash }
18.      └── SAVE_STATE.lastSavedHash = content_hash
19.      └── DIRTY_FLAG.isDirty = false
20.      └── updateSaveIndicator() → "Saved to cloud"
21.      └── FileDB.put(record) → IndexedDB cache update
```

### Manual Save (Save Button / Ctrl+S)

```
1. User clicks Save button or presses Ctrl+S
2. saveCode()
3.   └── forceSaveActiveFile('manual', { force: true })
4.       └── Posts to /api/file/save even if hash unchanged
5.       └── Button text: "Save" → "Saving..." → "Saved" → "Save"
```

### Guest Mode — Local Save

```
1. User types (not logged in)
2. editor.js: change listener
3.   └── setLocalDraftImmediate() → IndexedDB (draft)
4.   └── scheduleAutosave() → 20s timer
5.
6. ... 20 seconds idle ...
7.
8. Autosave fires
9.   └── isUserLoggedIn? → false
10.  └── persistLocalSave(editor.getValue())
11.      └── FileDB.put({ id: "root/main.cpp", ..., dirty: false })
12.      └── SAVE_STATE.lastSavedHash = SHA-256(content)
13.      └── updateSaveIndicator() → "Saved locally"
```
