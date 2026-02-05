# Graphics.h Online Compiler - Cloud Storage Overview

This document summarizes how cloud storage works in the Graphics.h Online Compiler, based on the current implementation in `app.py`, `templates/compiler.html`, `static/js/compiler/*.js`, and `workers/graphics-compiler-users-worker/src/index.js`.

**Architecture Summary**
Cloud storage is split into three layers:
1. Frontend client (browser)
2. Flask config API (auth config only)
3. Cloudflare Worker + Supabase + R2 (storage backend)

**Key Components**
- Frontend
  - `static/js/compiler/runtime.js`: initializes Supabase auth, login UI, and triggers file refresh.
  - `static/js/compiler/storage.js`: file operations, autosave, batch saves, and local drafts.
  - `templates/compiler.html`: shows cloud promo vs file explorer UI.
- Backend
  - `app.py`: exposes `/api/auth/config` for Supabase URL/anon key and proxies storage requests to the Worker.
  - `workers/graphics-compiler-users-worker/src/index.js`: storage API endpoints and security checks.
- Storage
  - Cloudflare R2 bucket: file contents stored under `{userId}/{folder}/{filename}`.
  - Supabase table `user_files`: file metadata (folder, filename, hash, timestamps).

**Auth Flow**
1. Browser calls `/api/auth/config` for Supabase settings.
2. Supabase JS client loads from CDN and handles Google OAuth.
3. For storage operations, the browser includes the Supabase access token as `Authorization: Bearer <token>`.
4. The Flask server proxies `/files/*` requests to the Worker (Worker URL stays server-side).
5. The Worker verifies the token against Supabase `/auth/v1/user`.
6. On success, the Worker allows storage operations scoped to `userId`.

**File Model**
- Files are identified by `folder` + `filename`.
- Input is sanitized on both client and server.
  - Max length: 200 characters per segment.
  - No `/`, `\`, or `..` allowed.
- Batch save limit: 20 files per request.

**Saving Behavior**
- Guest users (not signed in)
  - Manual Save or Run writes code to `localStorage` key `tc_code`.
  - Save indicator shows “Saved Locally”.
- Signed-in users
  - Changes are queued immediately to local drafts (`cloud_draft:<folder>/<filename>`).
  - Autosave batches every 10 seconds (`/files/batch-save`).
  - Manual Save or Run triggers a forced save (`/files/save`).
  - Save uses content hash to skip unchanged writes.

**Loading Behavior**
- On sign-in, the UI calls `refreshCloudFiles()`:
  - `/files/list` provides metadata for the explorer and tabs.
  - If no files exist, a default `main/main.cpp` is created.
- `openFile()` attempts to read the file from cloud first.
  - If cloud read fails, it falls back to the local draft.

**Scenarios**
1. Guest quick edit
   - User edits code, clicks Run.
   - Code is saved to `localStorage` and compiled.
2. First-time sign-in
   - Supabase session is created.
   - File list is refreshed; default `main/main.cpp` is created if empty.
   - Editor loads the active file from cloud or drafts.
3. Long editing session
   - Every change updates local drafts immediately.
   - Autosave sends a batch request every 10 seconds.
   - Unchanged files are skipped via hash comparison.
4. Network failure during save
   - Autosave or manual save fails.
   - The latest code remains in local draft.
   - Save indicator shows “Saved Locally”.
5. Multiple files
   - User creates new files/folders.
   - Tabs and explorer are updated from `CLOUD_STATE`.
   - Batch save handles multiple files in one request (max 20).
6. Delete a file
   - UI calls `/files/delete`.
   - Worker removes the R2 object and metadata row.

**Safety Features**
- Auth required for any cloud operation.
- CORS allowlist restricts origins (`localhost:5000` + `PROD_ORIGIN`).
- Folder/filename validation prevents path traversal.
- Batch save hard limit (20 files).
- Hash-based save skips unchanged data.
- Local drafts prevent data loss if cloud save fails.
- Forced save on `visibilitychange` and `beforeunload`.
- All files are scoped to the authenticated `userId`.

**Known Gaps / TODOs**
- Storage quotas are no longer enforced, and the quota endpoint/UI has been removed.

**Suggested Next Improvements**
1. Add a file search bar in the explorer to quickly filter large projects.
