# Architecture — Graphics.h Online Compiler

Complete system architecture covering deployment, caching, asset pipeline, request flow, and runtime design.

**Last Updated:** April 2026

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Deployment Architecture](#deployment-architecture)
- [Request Flow](#request-flow)
- [Static Asset Pipeline](#static-asset-pipeline)
- [Caching Strategy](#caching-strategy)
- [Frontend Module System](#frontend-module-system)
- [Runtime Architecture (DOS Emulation)](#runtime-architecture-dos-emulation)
- [Authentication & Cloud Storage](#authentication--cloud-storage)
- [Build System](#build-system)
- [Environment & Configuration](#environment--configuration)

---

## High-Level Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                             User Browser                              │
│  ┌───────────────────────┐     postMessage     ┌───────────────────┐  │
│  │   CodeMirror 6 Editor │ ◄──────────────────► │  <iframe>         │  │
│  │   (Parent Page)       │                      │  dos-runner.html  │  │
│  │                       │                      │  JS-DOS 6.22     │  │
│  │   • app.js            │                      │  DOSBox/WASM     │  │
│  │   • editor.js         │                      │  TCC.EXE         │  │
│  │   • files.js          │                      │  VGA → Canvas    │  │
│  │   • shell.js          │                      └───────────────────┘  │
│  │   • execution.js      │                                            │
│  │   • preferences.js    │                                            │
│  │   • ai-fix.js         │                                            │
│  └──────────┬────────────┘                                            │
│             │ fetch()                                                 │
└─────────────┼─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel Edge Network                      │
│  ┌─────────────────────┐  ┌──────────────────────────────────┐  │
│  │  @vercel/static      │  │  @vercel/python (Flask)          │  │
│  │                      │  │                                  │  │
│  │  static/**/*         │  │  app.py                          │  │
│  │  compiler-assets/**  │  │  ├── Page routes                 │  │
│  │                      │  │  ├── API proxy (auth, files, AI) │  │
│  │  Cache-busted assets │  │  ├── Static file serving         │  │
│  │  with immutable hdrs │  │  └── Security headers            │  │
│  └─────────────────────┘  └──────────────┬───────────────────┘  │
└──────────────────────────────────────────┼──────────────────────┘
                                           │ Proxy
                        ┌──────────────────┼────────────────────┐
                        ▼                  ▼                    ▼
              ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
              │  CF Worker    │  │  CF Worker    │  │  Cloudflare R2   │
              │  User Files   │  │  AI Fix       │  │  Public Assets   │
              │  (D1 + JWT)   │  │  (Gemini)     │  │  (tc.zip, demos) │
              └──────────────┘  └──────────────┘  └──────────────────┘
```

---

## Deployment Architecture

### Vercel Configuration (`vercel.json`)

The app uses a **hybrid deployment** on Vercel with three build targets:

| Build Target | Source Pattern | Purpose |
|---|---|---|
| `@vercel/static` | `static/**/*` | CSS, JS bundles, fonts, images, HTML |
| `@vercel/static` | `compiler-assets/libs/**/*` | JS-DOS runtime (js-dos.js, wdosbox.js, wdosbox.wasm) |
| `@vercel/static` | `compiler-assets/fonts/**/*` | JetBrains Mono variable font |
| `@vercel/python` | `app.py` | Flask application (all dynamic routes) |

### Route Priority

Vercel routes are evaluated **top to bottom**, first match wins:

```
1.  /static/build/compiler.{hash}.{css|js}   → immutable (1 year)
2.  /static/fonts/*                           → immutable (1 year)
3.  /static/js/compiler/codemirror.bundle.v1  → immutable (1 year)
4.  /static/analytics.js                      → 1 year cache
5.  /libs/js-dos.js                           → compiler-assets/libs/js-dos.js (1 year)
6.  /libs/wdosbox.wasm                        → compiler-assets/libs/wdosbox.wasm.js (1 year)
7.  /libs/*                                   → compiler-assets/libs/* (catch-all)
8.  /compiler-assets/fonts/*                  → immutable (1 year)
9.  /static/*                                 → 7-day cache
10. /*                                        → Flask app.py (catch-all)
```

**Key Rewrite:** `/libs/js-dos.js` is a virtual path — the actual file lives at `compiler-assets/libs/js-dos.js`. This abstraction keeps the `dos-runner.html` referencing clean `/libs/` paths while the real files live in a separate directory.

---

## Request Flow

### Page Load (`/compiler` or `/compiler.html`)

```
Browser → Vercel Edge
  → Route #10 (catch-all) → Flask app.py
  → compiler() route → render_template('compiler.html')
  → get_compiler_assets() reads asset-manifest.json
  → Returns HTML with hashed CSS/JS URLs

Browser loads:
  1. compiler.{hash}.css    (bundled, immutable cache)
  2. compiler.{hash}.js     (bundled, deferred, immutable cache)
  3. analytics.js            (deferred)
  4. Google Identity Services (async, deferred)

After DOM ready:
  5. codemirror.bundle.v1.js (lazy-loaded by editor.js)
  6. /libs/js-dos.js         (lazy-loaded on first Run)
  7. /libs/wdosbox.js        (loaded by JS-DOS at runtime)
  8. tc.zip                  (fetched on first Run, cached in IndexedDB)
```

### Compilation Run Flow

```
User clicks Run → execution.js
  ├── Save current code (cloud or IndexedDB)
  ├── ensureDosRunnerFrame() — lazy-loads iframe if not present
  ├── startPreload() — preloads JS-DOS scripts
  ├── getTCZip() — fetches tc.zip (IndexedDB cache → R2/Blob → local)
  ├── Creates Object URL for tc.zip blob
  ├── postMessage(INIT_DOS) → dos-runner.html iframe
  │
  └── dos-runner.html
        ├── ensureJsdos() — injects /libs/js-dos.js if needed
        ├── Dos(canvas, { wdosboxUrl }) — boots DOSBox WebAssembly
        ├── fs.extract(zipUrl) — unpacks tc.zip into Emscripten VFS
        ├── fs.createFile('USER.CPP', code) — writes user source
        ├── fs.createFile('AUTOEXEC.BAT', batchScript)
        ├── main(['-conf', 'dosbox.conf', 'AUTOEXEC.BAT'])
        ├── startErrorPolling() — polls FS every 400ms
        │     ├── USER.EXE exists + no FAIL.TXT → COMPILE_SUCCESS
        │     └── FAIL.TXT exists → reads ERR.TXT → COMPILATION_ERROR
        └── postMessage(STATUS/ERROR) → parent
```

### API Proxy Flow

All `/api/*` requests hit Flask, which proxies to Cloudflare Workers:

```
Browser → /api/auth/google (POST)
  → Flask app.py → proxy_request(USER_FILES_WORKERS)
  → CF Worker: validates Google ID token, creates JWT session
  → Sets httpOnly cookie, returns user profile

Browser → /api/files (GET)
  → Flask → proxy_request(USER_FILES_WORKERS)
  → CF Worker: verifies JWT from cookie → queries D1
  → Returns { folders, files, last_opened_file_id }

Browser → /api/ai/fix (POST)
  → Flask → proxy_request(FIX_WITH_AI_WORKER)
  → CF Worker: sends code + errors to Gemini → returns fix
```

---

## Static Asset Pipeline

### Build Process (`build.py`)

The build system runs during `vercel build` via `buildCommand: "python build.py"`:

```
build.py
  ├── Rebuild codemirror.bundle.v1.js (esbuild, tree-shaken, minified)
  ├── Collect CSS: static/css/compiler/*.css (priority-ordered)
  ├── Collect JS:  static/js/compiler/*.js  (priority-ordered, excludes bundles)
  ├── Minify CSS (rcssmin) → compiler.{sha256-12}.css
  ├── Minify JS  (rjsmin) → compiler.{sha256-12}.js
  └── Write asset-manifest.json → { compiler: { css, js }, separate: { ... } }
```

### CSS Priority Order

```
1. base.css          ← Variables, resets, core layout
2. panels.css        ← Editor/terminal panel styles
3. sidebar.css       ← Sidebar, auth, file explorer
4. preferences.css   ← Settings panel
5. responsive.css    ← Breakpoints (1024px, 768px, 480px)
6. toasts.css        ← Toast notifications
```

### JS Priority Order

```
1. asset-sources.js  ← CDN/local URL registry, fallback resolution
2. app.js            ← DOM references, global state, initialization
3. files-ui.js       ← File explorer rendering
4. files.js          ← Auth, cloud storage, IndexedDB, autosave
5. editor.js         ← CodeMirror 6 setup, themes, keybindings
6. shell.js          ← Sidebar toggling, mobile tabs, fullscreen
7. execution.js      ← Run flow, postMessage bridge, keyboard shortcuts
8. preferences.js    ← Settings panel logic
9. ai-fix.js         ← Fix with AI error repair flow
```

### Excluded from Bundle (Loaded Separately)

| File | Load Strategy | Reason |
|---|---|---|
| `codemirror.bundle.v1.js` | Lazy (on editor init) | 530 KB, blocks interactivity |
| `js-dos.js` | Lazy (on first Run) | 108 KB, not needed until compile |
| `wdosbox.js` | Loaded by JS-DOS | 189 KB, runtime dependency |
| `wdosbox.wasm.js` | Loaded by JS-DOS | 1.8 MB, WebAssembly module |
| `analytics.js` | `defer` attribute | Non-critical tracking |

---

## Caching Strategy

### Browser Cache Tiers

| Asset | Cache Header | Duration | Strategy |
|---|---|---|---|
| `compiler.{hash}.css/js` | `immutable, max-age=31536000` | 1 year | Content-hash in filename → cache forever |
| `codemirror.bundle.v1.js` | `immutable, max-age=31536000` | 1 year | Version in filename → cache forever |
| `/libs/js-dos.js` | `max-age=31536000` | 1 year | Rarely changes |
| `/libs/wdosbox.*` | `max-age=31536000` | 1 year | Rarely changes |
| Static fonts (woff2) | `immutable, max-age=31536000` | 1 year | Binary assets, never change |
| Other static assets | `max-age=604800` | 7 days | General static files |
| `manifest.json` | `max-age=300, must-revalidate` | 5 min | PWA manifest, changes occasionally |

### Client-Side Caching

| Storage | Data | TTL |
|---|---|---|
| **IndexedDB** (`graphicsHCompilerFiles`) | User code drafts, file state | Persistent |
| **IndexedDB** (`tcZipCache`) | tc.zip blob (~50 MB) | Persistent until version change |
| **localStorage** | `tc_code` (emergency backup), settings, last opened file | Persistent |
| **In-Memory Map** | `compilerAssetHealthCache` — CDN reachability probes | 5 minutes |
| **In-Memory Map** | `DemoCache` — pre-fetched demo source files | Session |

### Asset Resolution (CDN Fallback)

`asset-sources.js` implements a multi-tier resolution for every remote asset:

```
1. If offline → use localPath immediately
2. Try primary CDN (r2-public-assets.albatrossc.workers.dev)
3. Try fallback CDN (Vercel Blob Storage)
4. Fall back to local path (/compiler-assets/*)

Health probes are cached for 5 minutes to avoid repeated HEAD requests.
```

---

## Frontend Module System

All JS modules are vanilla scripts (no ES module imports in the bundled output). They share state via intentional globals:

### Shared Globals

| Global | Owner | Purpose |
|---|---|---|
| `editor` | `editor.js` | CodeMirror EditorView instance |
| `isUserLoggedIn` | `files.js` | Auth state boolean |
| `currentUser` | `files.js` | User profile object |
| `CLOUD_STATE` | `files.js` | Files, folders, active file, dirty state |
| `terminalFocused` | `shell.js` | Whether DOS canvas has keyboard focus |
| `Logger` | `app.js` | Color-coded console logger |
| `metrics` | `app.js` | Runtime performance counters |

### Event-Based Communication

Modules communicate via `CustomEvent` dispatches on `document`:

| Event | Emitter | Listener | Purpose |
|---|---|---|---|
| `compiler-run-start` | `execution.js` | `ai-fix.js` | Reset AI fix state on new run |
| `compiler-run-success` | `execution.js` | `ai-fix.js` | Mark successful compile |
| `compiler-compilation-error` | `execution.js` | `ai-fix.js` | Feed errors to AI fix panel |
| `compiler-compile-success` | `execution.js` | `ai-fix.js` | Notify successful compile |
| `auth-state-changed` | `shell.js` | `preferences.js` | React to login/logout |
| `request-show-explorer` | `shell.js` | `preferences.js` | Switch sidebar view |

### iframe Communication (`postMessage`)

See [online-compiler.md](online-compiler.md#why-dos-runnerhtml-exists-the-iframe-isolation-problem) for the full message protocol.

---

## Runtime Architecture (DOS Emulation)

### Why an iframe?

JS-DOS registers **global** `keydown`/`keyup`/`mousemove` listeners on the `document`. Without iframe isolation, DOSBox captures all keyboard input even when the user is typing in the CodeMirror editor. The iframe provides a completely separate `document` and `window` context.

### iframe Lifecycle

```
1. First Run: ensureDosRunnerFrame() creates <iframe data-src="..."> 
   and swaps data-src → src (lazy load)
2. iframe loads dos-runner.html → sends IFRAME_READY to parent
3. Parent waits for IFRAME_READY before sending INIT_DOS
4. Each Run: STOP_DOS → INIT_DOS cycle (reuses same iframe)
5. Keyboard blocker overlay prevents accidental focus theft
```

### Emscripten FS Polling

The iframe cannot observe when DOSBox writes files to its virtual filesystem. Instead, it polls the Emscripten FS directly:

```
Start: 1.5s after DOS boots
Interval: every 400ms
Checks: /TURBOC3/BIN/USER.EXE, /TURBOC3/BIN/FAIL.TXT, /TURBOC3/BIN/ERR.TXT
Stops: on first success or error detection
Timeout: 60s absolute limit for entire startup
```

---

## Authentication & Cloud Storage

### Sign-In Flow

```
1. Google Identity Services renders button in #google-btn-render
2. User clicks → Google returns credential (ID token)
3. Browser POSTs to /api/auth/google → Flask proxies to CF Worker
4. CF Worker validates token with Google, creates JWT, sets httpOnly cookie
5. Browser receives user profile → updateLoginUI(true, user)
6. If user had modified guest code → saved as untitled-N.cpp
7. File explorer populated from /api/files
```

### File Storage Model

```
User → Folders → Files
  │
  ├── main/ (auto-created)
  │   ├── main.cpp (default)
  │   ├── untitled-1.cpp
  │   └── custom-name.cpp
  │
  └── other-folder/
      └── ...

Persistence: CF D1 (primary) → IndexedDB (cache) → localStorage (emergency)
```

### Autosave Strategy

```
1. User edits code → scheduleAutosave() resets 20-second idle timer
2. Timer fires → checks DIRTY_FLAG.isDirty
3. If logged in: forceSaveActiveFile() → POST /api/file/save
4. If guest: persistLocalSave() → IndexedDB
5. Timer does NOT restart after save — only on next edit
6. On visibility change (tab hidden): emergency localStorage write
```

---

## Build System

### Local Development

```bash
pip install -r requirements.txt   # flask, python-dotenv, requests
npm install                        # esbuild, codemirror packages
python app.py                      # Starts Flask on :5000
```

### Production Build (Vercel)

```bash
# vercel.json: "buildCommand": "python build.py"
python build.py
  ├── Rebuilds codemirror.bundle.v1.js via esbuild
  ├── Bundles + minifies CSS → static/build/compiler.{hash}.css
  ├── Bundles + minifies JS  → static/build/compiler.{hash}.js
  └── Writes static/build/asset-manifest.json
```

### Asset Manifest Format

```json
{
  "compiler": {
    "css": "/static/build/compiler.a1b2c3d4e5f6.css",
    "js": "/static/build/compiler.f6e5d4c3b2a1.js",
    "css_sources": ["static/css/compiler/base.css", ...],
    "js_sources": ["static/js/compiler/asset-sources.js", ...]
  },
  "separate": {
    "codemirror_bundle": "/static/js/compiler/codemirror.bundle.v1.js",
    "lazy_loaded": [
      "/static/js/compiler/codemirror.bundle.v1.js",
      "/libs/js-dos.js",
      "/libs/wdosbox.js",
      "/libs/wdosbox.wasm",
      "/static/analytics.js"
    ]
  }
}
```

---

## Environment & Configuration

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID for sign-in |
| `USER_FILES_WORKERS` | URL of the Cloudflare user-files worker |
| `FIX_WITH_AI_WORKER` | URL of the Cloudflare AI fix worker |
| `DISCORD_WEBHOOK_URL` | Discord webhook for contact form & monitoring |
| `MAINTENANCE_MODE` | `true` to enable maintenance page |
| `MAINTENANCE_DATE` | Display string for maintenance schedule |

### Security Headers (Applied by Flask)

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-XSS-Protection: 1; mode=block
```

### Font Strategy

JetBrains Mono Variable is self-hosted at `/compiler-assets/fonts/JetBrainsMono-Variable.woff2`:

```html
<link rel="preload" href="/compiler-assets/fonts/JetBrainsMono-Variable.woff2"
      as="font" type="font/woff2" crossorigin />
<style>
  @font-face {
    font-family: 'JetBrains Mono';
    src: url('/compiler-assets/fonts/JetBrainsMono-Variable.woff2') format('woff2');
    font-weight: 100 800;
    font-display: swap;  /* Ensures text is always visible; font swaps in when ready */
  }
</style>
```

---

## Directory Map

```
graphics.h-online-compiler/
├── app.py                         ← Flask entry (routes, proxies, caching)
├── build.py                       ← Asset bundler (CSS + JS minification)
├── vercel.json                    ← Vercel builds, routes, cache rules
├── requirements.txt               ← flask, python-dotenv, requests, rcssmin, rjsmin
├── package.json                   ← Node deps (esbuild, CodeMirror packages)
│
├── templates/
│   ├── compiler.html              ← Main compiler page (Jinja2)
│   ├── index.html                 ← Landing page
│   ├── docs.html                  ← Documentation hub
│   ├── base.html                  ← Shared doc layout
│   └── docs/                      ← Doc partials (getting-started, drawing, ...)
│
├── static/
│   ├── build/                     ← Generated: compiler.{hash}.css, .js, manifest
│   ├── css/compiler/              ← Source CSS (base, panels, sidebar, responsive, ...)
│   ├── js/compiler/               ← Source JS modules + codemirror bundle
│   ├── dos-runner.html            ← Sandboxed iframe for JS-DOS
│   ├── fonts/                     ← JetBrains Mono static weights (fallback)
│   └── ...                        ← favicon, videos, gemini.svg, etc.
│
├── compiler-assets/
│   ├── libs/                      ← JS-DOS runtime (js-dos.js, wdosbox.js, .wasm)
│   ├── fonts/                     ← JetBrains Mono Variable (primary)
│   ├── Demo_files/                ← Demo .cpp sources + demo bundle JSON
│   ├── zip-files/                 ← tc-v1.zip (Turbo C++ environment)
│   └── graphics/                  ← graphics.h, winbgim.h, libbgi.a
│
├── workers/
│   ├── graphics-oc-files/         ← Auth + file storage (D1 + JWT)
│   └── r2-public-assets/          ← Public asset CDN (R2)
│
├── TURBOC3/                       ← Turbo C++ 3.0 source (BIN, INCLUDE, LIB)
└── docs/                          ← Developer documentation
```
