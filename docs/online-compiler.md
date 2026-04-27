# Online Graphics.h Compiler — Technical Documentation

**Browser-based Turbo C++ 3.0 compiler with DOS emulation for `graphics.h` programming.**
Live: https://graphics-h-compiler.vercel.app/compiler.html

---

## Table of Contents

- [What This Is](#what-this-is)
- [Project Structure](#project-structure)
- [Turbo C++ Source](#turbo-c-source)
- [The Compilation Command](#the-compilation-command)
- [Architecture](#architecture)
- [Why dos-runner.html Exists](#why-dos-runnerhtml-exists-the-iframe-isolation-problem)
- [Error Detection](#error-detection--polling-the-emscripten-fs)
- [Execution Flow](#execution-flow)
- [Module Breakdown](#module-breakdown)
- [Asset Pipeline & Caching](#asset-pipeline--caching)
- [Tech Stack](#tech-stack)

---

## What This Is

[JS-DOS](https://js-dos.com/) is a WebAssembly port of DOSBox that can run a full DOS environment in the browser. Turbo C++ 3.0 runs inside it natively, with `graphics.h` and `graphics.lib` intact. This project wraps that environment with a CodeMirror 6 code editor, multi-theme support, cloud file storage, and a split-pane UI — giving it a proper developer interface instead of a raw DOS terminal.

No local installation. No DOSBox setup. No Turbo C IDE.

---

## Project Structure

```
graphics.h-online-compiler/
├── app.py                        ← Flask entry point (all routes, API proxies, caching)
├── build.py                      ← Asset bundler (CSS + JS minification, CodeMirror build)
├── requirements.txt              ← flask, python-dotenv, requests, rcssmin, rjsmin
├── .env                          ← Environment variables (gitignored)
├── vercel.json                   ← Vercel deployment (builds, routes, cache headers)
├── package.json                  ← Node.js deps (CodeMirror packages, esbuild)
│
├── templates/                    ← Jinja2 HTML templates
│   ├── index.html                ← Landing page
│   ├── compiler.html             ← Main compiler page (editor + DOS canvas)
│   ├── embed.html                ← Embeddable compiler widget
│   ├── embed-docs.html           ← Embeddable documentation widget
│   ├── docs.html                 ← Documentation hub
│   ├── base.html                 ← Shared base template for doc pages
│   ├── maintenance.html          ← Maintenance mode page
│   └── docs/                     ← Individual doc page partials
│       ├── getting-started/
│       ├── drawing/
│       ├── initialization/
│       └── ...
│
├── static/                       ← Static files (served at /static/)
│   ├── build/                    ← Generated: compiler.{hash}.css, .js, asset-manifest.json
│   ├── css/compiler/             ← Source CSS (base, panels, sidebar, responsive, toasts)
│   ├── js/
│   │   └── compiler/             ← Source JavaScript modules
│   │       ├── asset-sources.js  ← CDN/local URL registry, fallback resolution
│   │       ├── app.js            ← DOM references, global state, initialization
│   │       ├── files-ui.js       ← File explorer rendering
│   │       ├── files.js          ← Auth, cloud storage, IndexedDB, autosave
│   │       ├── editor.js         ← CodeMirror 6 setup, themes, keybindings
│   │       ├── shell.js          ← Sidebar, mobile tabs, fullscreen, focus management
│   │       ├── execution.js      ← Run flow, postMessage bridge, keyboard shortcuts
│   │       ├── preferences.js    ← Settings panel logic (theme, font, editor options)
│   │       ├── ai-fix.js         ← Fix with AI error repair flow
│   │       └── codemirror.bundle.v1.js  ← Pre-built CodeMirror bundle (esbuild)
│   ├── dos-runner.html           ← Self-contained iframe — boots JS-DOS, runs compiler
│   ├── fonts/                    ← JetBrains Mono static weights (fallback)
│   └── ...
│
├── compiler-assets/
│   ├── libs/                     ← JS-DOS runtime (js-dos.js, wdosbox.js, wdosbox.wasm.js)
│   ├── fonts/                    ← JetBrains Mono Variable (primary, preloaded)
│   ├── Demo_files/               ← Sample .cpp programs for the demo selector
│   ├── graphics/                 ← graphics.h, winbgim.h, libbgi.a
│   ├── Installers/               ← Linux install script (ubuntu_install.sh)
│   └── zip-files/                ← tc-v1.zip (Turbo C++ environment)
│
├── TURBOC3/                      ← Turbo C++ 3.0 (BIN/, INCLUDE/, LIB/) — source files
│
├── workers/                      ← Cloudflare Workers
│   ├── graphics-oc-files/        ← File storage & auth worker (D1 + JWT)
│   └── r2-public-assets/         ← Public asset serving from R2
│
└── docs/                         ← Developer documentation
    ├── architecture.md           ← Full system architecture (deployment, caching, etc.)
    ├── online-compiler.md        ← This file (runtime & compilation design)
    └── ...
```

---

## Turbo C++ Source

The Turbo C++ 3.0 environment was sourced from [https://turbo-c.net/](https://turbo-c.net/) and modified — unnecessary files and folders were stripped out, keeping only what the compiler needs to build and link `graphics.h` programs. It is packaged as `tc.zip` (~50 MB) and served from R2/Blob Storage, with an IndexedDB client cache.

The ZIP extracts into the following DOS filesystem layout:

```
TURBOC3/
├── BIN/
│   ├── TCC.EXE          ← Turbo C++ 3.0 compiler executable
│   ├── USER.CPP         ← User source code, written here at runtime
│   └── USER.EXE         ← Compiled output (created on success)
├── INCLUDE/
│   └── GRAPHICS.H
└── LIB/
    └── GRAPHICS.LIB
```

---

## The Compilation Command

This is the single line that drives the entire compiler:

```bat
TCC -I..\INCLUDE -L..\LIB -n. USER.CPP ..\LIB\GRAPHICS.LIB > ERR.TXT
```

| Flag / Argument | Purpose |
|---|---|
| `TCC` | Turbo C Compiler executable running inside emulated DOS |
| `-I..\INCLUDE` | Header search path — where `GRAPHICS.H` lives |
| `-L..\LIB` | Library search path — where `GRAPHICS.LIB` lives |
| `-n.` | Write `USER.EXE` output to the current directory (`TURBOC3\BIN`) |
| `USER.CPP` | User's source code, injected into the DOS filesystem at runtime |
| `..\LIB\GRAPHICS.LIB` | Explicitly links the graphics library at link stage |
| `> ERR.TXT` | Redirects all compiler output to a file for error parsing |

This runs inside an `AUTOEXEC.BAT` that JS-DOS executes immediately on boot:

```bat
@ECHO OFF
CD TURBOC3\BIN
IF EXIST USER.EXE DEL USER.EXE
IF EXIST ERR.TXT DEL ERR.TXT
IF EXIST FAIL.TXT DEL FAIL.TXT
TCC -I..\INCLUDE -L..\LIB -n. USER.CPP ..\LIB\GRAPHICS.LIB > ERR.TXT
IF EXIST USER.EXE GOTO SUCCESS
ECHO COMPILE_FAILED > FAIL.TXT
COPY ERR.TXT C:\ERR.TXT >NUL
COPY FAIL.TXT C:\FAIL.TXT >NUL
CLS
ECHO ========================================
ECHO COMPILATION ERRORS:
ECHO ========================================
TYPE ERR.TXT
ECHO.
PAUSE
EXIT
:SUCCESS
CLS
USER.EXE
```

Each run deletes old `USER.EXE`, `ERR.TXT`, and `FAIL.TXT` first to guarantee a clean state. If `USER.EXE` is not created after the compiler runs, `FAIL.TXT` is written as an explicit failure marker — this is what the error polling system uses to detect compilation failure (rather than relying on heuristics alone).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser Window                           │
├──────────────────────────────┬───────────────────────────────────┤
│   CodeMirror 6 Editor        │   <iframe> — dos-runner.html      │
│                              │                                   │
│   asset-sources.js           │   JS-DOS 6.22 + WebAssembly       │
│   app.js                     │   DOSBox (Emscripten-compiled)    │
│   files.js / files-ui.js     │   WDOSBOX — VGA → Canvas          │
│   editor.js                  │                                   │
│   shell.js                   │   Isolated input/focus context    │
│   execution.js               │                                   │
│   preferences.js             │                                   │
│   ai-fix.js                  │                                   │
└──────────────────────────────┴───────────────────────────────────┘
              │        window.postMessage()         │
              └─────────────────────────────────────┘
```

For the full deployment and caching architecture, see [architecture.md](architecture.md).

---

## Why `dos-runner.html` Exists (The iframe Isolation Problem)

When JS-DOS renders to a `<canvas>` element, DOSBox registers global `keydown`, `keyup`, and `mousemove` event listeners on the `document`. These listeners capture **all** keyboard and mouse input at the document level — not just when the canvas is focused. This meant that as soon as JS-DOS loaded, typing in the CodeMirror editor became broken: keystrokes were intercepted by DOSBox before CodeMirror could see them.

The fix is to run the entire JS-DOS environment inside a sandboxed `<iframe>` (`dos-runner.html`). Because iframes have a completely separate `document` and `window` context, DOSBox's global event listeners are confined to the iframe's document and cannot reach the parent page at all. The editor and the DOS canvas now operate in entirely separate browsing contexts with no shared input state.

Communication between the two contexts is handled exclusively via `postMessage`:

**Parent → iframe (`execution.js` → `dos-runner.html`):**

| Message type | Payload | Purpose |
|---|---|---|
| `INIT_DOS` | `{ code, batchScript, zipUrl, wdosboxUrl, cycles }` | Start a new DOS session |
| `STOP_DOS` | — | Terminate the current session |
| `FOCUS` | — | Give keyboard focus to the canvas |
| `BLUR` | — | Release keyboard capture, return focus to editor |
| `TAKE_SCREENSHOT` | `{ purpose, requestId }` | Request a canvas PNG capture |

**iframe → parent (`dos-runner.html` → `execution.js`):**

| Message type | Payload | Purpose |
|---|---|---|
| `IFRAME_READY` | — | iframe has loaded and is ready to receive messages |
| `STATUS` | `{ status: 'STARTING' \| 'EXTRACTING' \| 'WRITING_CODE' \| 'RUNNING' }` | Boot progress |
| `PROGRESS` | `{ percent: number }` | Loading progress (0–100) |
| `COMPILATION_ERROR` | `{ content: string }` | Compiler errors from ERR.TXT |
| `COMPILE_SUCCESS` | — | USER.EXE found, no FAIL.TXT |
| `ERROR` | `{ message: string }` | Fatal runtime error (e.g. ZIP failed, startup timeout) |
| `SCREENSHOT_DATA` | `{ blob \| dataUrl, purpose, requestId }` | PNG data from canvas |

The iframe sends `IFRAME_READY` as its first action on load. The parent waits for this before sending `INIT_DOS` — this prevents race conditions where a message arrives before the iframe's listener is registered.

### Keyboard Blocker Overlay

Even with the iframe, there is a secondary problem: when the DOS program is running, clicking the canvas area focuses the iframe and correctly routes keys into DOS. But if the user accidentally clicks the canvas area before intentionally interacting with the program, the iframe quietly steals keyboard focus and the editor stops responding.

To solve this, a transparent overlay `div` (the keyboard blocker) sits on top of the iframe in the parent page. While the overlay is active, clicks land on the parent document, not inside the iframe. When the user intentionally wants to interact with the running program (e.g. clicks the overlay), the parent sends a `FOCUS` message and removes the overlay. Pressing `Esc` sends `BLUR`, restores the overlay, and gives focus back to the editor.

### Mobile Keyboard Forwarding

On mobile, `<canvas>` elements cannot trigger the virtual keyboard. `dos-runner.html` includes a hidden off-screen `<input id="mobile-keyboard-helper">` for this. When the canvas is tapped, the helper input receives focus (triggering the virtual keyboard), and its `keydown` / `keyup` / `input` events are cloned and re-dispatched directly onto the canvas element:

```javascript
const cloneKeyEvent = (type, e) => {
    const event = new KeyboardEvent(type, {
        key: e.key, code: e.code, keyCode: e.keyCode,
        shiftKey: e.shiftKey, ctrlKey: e.ctrlKey,
        bubbles: true, cancelable: true
    });
    canvas.dispatchEvent(event);
};
```

Mobile browsers also fire `keyCode: 229` (IME composition code) instead of the actual key for many input events. In that case, the `input` event is used as a fallback — `e.data` provides the actual character, which is then used to synthesize and dispatch synthetic `keydown` + `keypress` + `keyup` events on the canvas.

---

## Error Detection — Polling the Emscripten FS

When compilation fails, `ERR.TXT` contains the TCC error output and `FAIL.TXT` is written as an explicit sentinel. The iframe cannot directly observe when DOSBox writes these files, so it polls the Emscripten virtual filesystem directly via `dosInstance.em.FS`:

```javascript
// Polling starts 1.5s after DOS boots, runs every 400ms
const probe = () => {
    const FS = dosInstance.em.FS;
    const failPath = firstExistingPath(FS, ['/TURBOC3/BIN/FAIL.TXT', ...]);
    const errPath  = firstExistingPath(FS, ['/TURBOC3/BIN/ERR.TXT',  ...]);
    const exePath  = firstExistingPath(FS, ['/TURBOC3/BIN/USER.EXE', ...]);

    if (exePath && !failPath) { clearInterval(errorPollTimer); return; } // success

    const content = errPath ? readTextFile(FS, errPath) : '';
    const looksLikeError = !!failPath || /(error|fatal|undefined)/i.test(content);

    if (looksLikeError) {
        clearInterval(errorPollTimer);
        post({ type: 'COMPILATION_ERROR', content: content.trim() });
    }
};
```

Multiple path variants are checked (`/TURBOC3/BIN/ERR.TXT`, `TURBOC3/BIN/ERR.TXT`, `/ERR.TXT`, etc.) because the Emscripten FS mount point can vary between JS-DOS versions and browser environments.

---

## Execution Flow

```
User clicks Run
    │
    ├─ Editor validates code is non-empty
    ├─ Code saved (cloud or IndexedDB, non-blocking)
    ├─ ensureDosRunnerFrame() — lazy-creates iframe if needed
    ├─ startPreload() — preloads JS-DOS scripts
    ├─ getTCZip() — IndexedDB cache → R2 CDN → Blob Storage → local fallback
    ├─ Creates Object URL for tc.zip blob
    ├─ postMessage({ type: 'INIT_DOS', payload: { code, batchScript, zipUrl, ... } }) → iframe
    │
    └─ dos-runner.html
          │
          ├─ ensureJsdos() — loads /libs/js-dos.js if not already present
          ├─ Dos(canvas, { wdosboxUrl, cycles: 'max', autolock: false }) — creates DOSBox instance
          ├─ fs.extract(zipUrl) — extracts tc.zip into Emscripten VFS
          ├─ fs.createFile('TURBOC3/BIN/USER.CPP', code)
          ├─ fs.createFile('AUTOEXEC.BAT', batchScript)
          ├─ main(['-conf', 'dosbox.conf', 'AUTOEXEC.BAT']) — boots DOS, runs batch
          ├─ startErrorPolling() — polls EM FS every 400ms for FAIL.TXT / ERR.TXT
          │
          ├─ [Success] USER.EXE present, no FAIL.TXT → polling stops, VGA renders to canvas
          └─ [Failure] FAIL.TXT written → ERR.TXT read → postMessage(COMPILATION_ERROR) → error panel
```

A 60-second startup timeout is set immediately before `Dos()` is called. If `dosInstance` is still null after 60 seconds (corrupted ZIP, network stall, Emscripten hang), an `ERROR` message is sent to the parent and the UI is unblocked.

---

## Module Breakdown

| File | Responsibility |
|---|---|
| `asset-sources.js` | CDN/local URL registry, multi-tier fallback resolution, health probing |
| `app.js` | DOM element references, global state, logger, performance metrics, initialization |
| `files-ui.js` | File explorer rendering, folder/file item creation, drag state |
| `files.js` | Auth flow (Google Sign-In), cloud file CRUD, IndexedDB caching, autosave (20s idle) |
| `editor.js` | CodeMirror 6 setup, theme compilation, language extensions, lazy CM bundle loading |
| `shell.js` | Sidebar toggling, mobile tab switching, fullscreen, keyboard focus management |
| `execution.js` | Run button flow, `postMessage` bridge, keyboard shortcuts (Ctrl+Enter, Ctrl+S) |
| `preferences.js` | Settings panel (editor theme, font size, word wrap, line numbers, autocomplete) |
| `ai-fix.js` | "Fix with AI" button, Gemini-powered error repair via CF Worker |
| `dos-runner.html` | Self-contained iframe — boots JS-DOS, writes filesystem, runs compiler, streams errors back |

---

## Asset Pipeline & Caching

### Build System

`build.py` runs during Vercel deployment:

1. **Rebuilds** `codemirror.bundle.v1.js` via esbuild (tree-shaken, minified, ESM)
2. **Collects** CSS from `static/css/compiler/` in priority order
3. **Collects** JS from `static/js/compiler/` in priority order (excludes lazy-loaded files)
4. **Minifies** via `rcssmin` / `rjsmin`
5. **Writes** content-hashed bundles: `compiler.{sha256}.css`, `compiler.{sha256}.js`
6. **Generates** `asset-manifest.json` mapping bundle names to URLs

### Caching Tiers

| Asset | Strategy | Duration |
|---|---|---|
| `compiler.{hash}.css/js` | Immutable (content-hashed filename) | 1 year |
| `codemirror.bundle.v1.js` | Immutable (versioned filename) | 1 year |
| `/libs/js-dos.js`, `/libs/wdosbox.*` | Long-lived (rarely changes) | 1 year |
| Fonts (woff2) | Immutable | 1 year |
| Other static files | Standard | 7 days |
| tc.zip | IndexedDB blob cache | Persistent |
| User code | IndexedDB + cloud sync | Persistent |

### Font Strategy

JetBrains Mono Variable is preloaded and self-hosted at `/compiler-assets/fonts/`:

- **Preloaded** via `<link rel="preload">` to avoid FOUT
- **`font-display: swap`** ensures text is always visible; font swaps in when ready
- Static weight fallbacks in `/static/fonts/` for edge cases

For the complete deployment, routing, and architecture details, see [architecture.md](architecture.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Flask (Python) on Vercel Serverless |
| Code Editor | CodeMirror 6 (lazy-loaded ESM bundle) |
| DOS Emulator | JS-DOS 6.22 + WebAssembly DOSBox |
| Graphics Renderer | WDOSBOX (VGA video memory → Canvas2D) |
| Compiler | Turbo C++ 3.0 (`TCC.EXE`) |
| Compiler Source | [turbo-c.net](https://turbo-c.net/) (modified) |
| Asset Build | Python (rcssmin, rjsmin) + esbuild (CodeMirror) |
| File Hosting | Cloudflare R2 + Vercel Blob Storage (CDN fallback) |
| Cloud Files | Cloudflare Workers + D1 (SQLite edge) |
| Auth | Google Sign-In (OAuth 2.0 via Identity Services) |
| AI Fix | Cloudflare Worker → Google Gemini |
| Caching | IndexedDB (tc.zip, drafts) · LocalStorage (settings, backup) |
| Deployment | Vercel (app + static) · Cloudflare (workers + R2) |

---

**Last Updated:** April 2026
