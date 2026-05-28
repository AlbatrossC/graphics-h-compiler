# Online Compiler — Developer Docs

Technical documentation for the graphics.h online compiler. Written for developers and AI agents working on the codebase.

---

## How to Read These Docs

The documentation is split into three files by domain. Start with whichever is relevant to the part of the system you're working on.

### [Compiler](compiler.md) — How Code Gets Compiled

The full client-side compilation pipeline. Covers:

- Architecture diagram (main page → iframe → DOSBox WASM)
- The js-dos runtime stack (js-dos.js, wdosbox.js, wdosbox.wasm.js)
- Turbo C++ 3.0 filesystem ZIP (`tc-v1.zip`) structure
- Step-by-step flow from "Compile & Run" click to graphics output (8 steps)
- The `AUTOEXEC.BAT` batch script — line-by-line explanation
- `TCC.EXE` compilation flags (`-I`, `-L`, `-n`, `GRAPHICS.LIB`)
- DOSBox initialization inside the sandboxed iframe
- Error detection via Emscripten filesystem polling (ERR.TXT, FAIL.TXT, USER.EXE)
- Error panel UI (copy errors, expand, mobile fullscreen exit)
- `postMessage` communication protocol — all message types for both directions
- Cache API for runtime assets + localStorage demo cache (7-day TTL)
- Preloading system (`requestIdleCallback` for background downloads)
- Mobile-specific behavior (keyboard forwarding via hidden input, CPU throttling)
- Console noise suppression filters
- Terminal zoom controls (0.5x–3.0x) and screenshot download

### [Site](site.md) — How the Site is Built and Served

The build pipeline, template rendering, and frontend architecture. Covers:

- Tech stack overview (Jinja2, esbuild, rcssmin/rjsmin, CodeMirror 6, Cloudflare Pages)
- Full project directory structure (annotated tree)
- 5-step build pipeline: CodeMirror esbuild → CSS/JS concat → content-hash → Jinja2 render → asset copy
- CSS/JS load order (priority-based concatenation)
- Asset manifest format (`asset-manifest.json`)
- Template context variables and environment config
- All 10 pages served with URL routes
- URL rewrites (`_redirects`) — `/libs/*` proxy to `/compiler-assets/libs/`
- 3-tier caching headers strategy (immutable / revalidatable / always-fresh)
- Security headers (HSTS, X-Frame-Options, COOP for Google Sign-In)
- CodeMirror 6 editor: loading sequence, Compartment-based settings, VS Code theme, bracket closing, deferred heavy extensions
- Data persistence: IndexedDB for guests (with iOS timeout guard), cloud sync for logged-in users, localStorage migration
- Autosave (20s idle timer, immediate IndexedDB writes)
- Responsive layout: desktop 3-panel vs mobile tab-based, draggable splitters
- Theme system (dark/light via `data-theme` attribute)
- Preferences panel (live reconfiguration, 8 toggle settings)
- CSS architecture (6 files in load order)
- Local development setup

### [Workers](workers.md) — The Backend API

The two Cloudflare Workers and database. Covers:

- Architecture diagram (API gateway → service binding → files worker → D1)
- Why two workers (separation of concerns)
- API worker: full route table (12 endpoints), KV + service bindings, secrets, file structure
- Files worker: route table, D1 binding, secrets, file structure
- D1 database schema: 3 tables (`users`, `folders`, `files`) with column descriptions and 6 indexes
- `content_hash` dual purpose: skip-if-unchanged saves + O(1) sign-in duplicate detection
- Authentication flow: Google token verification → user upsert → HMAC-SHA256 JWT → HttpOnly cookie
- JWT internals: header/payload structure, signing with Web Crypto API, verification steps
- Session cookie attributes (`HttpOnly`, `Secure`, `SameSite=None`, 7-day expiry)
- Request authentication pipeline (cookie → JWT verify → cache/D1 lookup → email match)
- Write blocking for moderation
- File operations: list (batched D1 query), create, save (SQL upsert with hash dedup), delete
- Folder operations: create, cascading delete (batched D1)
- Service binding proxying: header forwarding, cookie domain stripping, CORS isolation
- In-memory LRU caches (user cache, Google token cache, session key cache)
- CORS policy (credential-aware, dynamic origin)
- Error response format and codes
- Input validation rules
- Deployment commands (wrangler deploy, secrets, D1 init)

---

## Quick Reference

| Topic | Doc | Key Section |
|:---|:---|:---|
| How TCC.EXE is invoked | [compiler.md](compiler.md) | [The TCC Compilation Command](compiler.md#the-tcc-compilation-command) |
| What `tc-v1.zip` contains | [compiler.md](compiler.md) | [Compiler Filesystem ZIP](compiler.md#compiler-filesystem-zip) |
| How errors are detected | [compiler.md](compiler.md) | [Error Detection via Filesystem Polling](compiler.md#error-detection-via-filesystem-polling) |
| Main page ↔ iframe messages | [compiler.md](compiler.md) | [Communication Protocol](compiler.md#communication-protocol-postmessage) |
| `npm run build` steps | [site.md](site.md) | [Build Pipeline](site.md#build-pipeline) |
| How CSS/JS are bundled | [site.md](site.md) | [Step 2: Compiler CSS/JS Bundle](site.md#step-2-compiler-cssjs-bundle) |
| Caching headers explained | [site.md](site.md) | [Caching Headers](site.md#caching-headers) |
| CodeMirror 6 setup | [site.md](site.md) | [Code Editor](site.md#code-editor-codemirror-6) |
| IndexedDB storage | [site.md](site.md) | [Data Persistence](site.md#data-persistence) |
| Google Sign-In flow | [workers.md](workers.md) | [Authentication Flow](workers.md#authentication-flow) |
| D1 database tables | [workers.md](workers.md) | [Database Schema](workers.md#database-schema) |
| File save (upsert) SQL | [workers.md](workers.md) | [POST /api/file/save](workers.md#post-apifilesave--save-file-upsert) |
| Worker deployment | [workers.md](workers.md) | [Deploying Workers](workers.md#deploying-workers) |
