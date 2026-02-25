# Online Graphics.h Compiler — Technical Documentation

**Browser-based Turbo C++ 3.0 compiler with DOS emulation for `graphics.h` programming.**
Live: https://graphics-h-compiler.vercel.app/compiler.html

---

## What This Is

[JS-DOS](https://js-dos.com/) is a WebAssembly port of DOSBox that can run a full DOS environment in the browser. Turbo C++ 3.0 runs inside it natively, with `graphics.h` and `graphics.lib` intact. This project wraps that environment with a CodeMirror 6 code editor, multi-theme support, cloud file storage, and a split-pane UI — giving it a proper developer interface instead of a raw DOS terminal.

No local installation. No DOSBox setup. No Turbo C IDE.

---

## Running Locally

The app is a Flask application. Start it with:

```bash
python app.py
```

Open `http://localhost:5000/compiler.html`.

**Project structure:**

```
graphics.h-online-compiler/
├── app.py                    ← Flask entry point
├── requirements.txt
├── templates/
│   └── compiler.html         ← Main page template
├── static/
│   └── js/compiler/
│       ├── core.js
│       ├── editor.js
│       ├── runtime.js
│       ├── storage.js
│       └── theme-engine.js
├── compiler-assets/
│   └── libs/
│       ├── js-dos.js         ← Bundled JS-DOS (local fallback)
│       └── wdosbox.js
├── TURBOC3/                  ← Turbo C++ 3.0 compiler environment
└── workers/                  ← Cloudflare Workers (cloud file storage)
```

---

## Turbo C++ Source

The Turbo C++ 3.0 environment was sourced from [https://turbo-c.net/](https://turbo-c.net/) and modified — unnecessary files and folders were stripped out, keeping only what the compiler needs to build and link `graphics.h` programs. It is packaged as `tc.zip` (~50 MB) and served from Blob Storage.

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
│   core.js                    │   JS-DOS 6.22 + WebAssembly       │
│   editor.js                  │   DOSBox (Emscripten-compiled)    │
│   runtime.js                 │   WDOSBOX — VGA → Canvas          │
│   storage.js                 │                                   │
│   theme-engine.js            │   Isolated input/focus context    │
└──────────────────────────────┴───────────────────────────────────┘
              │        window.postMessage()         │
              └─────────────────────────────────────┘
```

---

## Why `dos-runner.html` Exists (The iframe Isolation Problem)

When JS-DOS renders to a `<canvas>` element, DOSBox registers global `keydown`, `keyup`, and `mousemove` event listeners on the `document`. These listeners capture **all** keyboard and mouse input at the document level — not just when the canvas is focused. This meant that as soon as JS-DOS loaded, typing in the CodeMirror editor became broken: keystrokes were intercepted by DOSBox before CodeMirror could see them.

The fix is to run the entire JS-DOS environment inside a sandboxed `<iframe>` (`dos-runner.html`). Because iframes have a completely separate `document` and `window` context, DOSBox's global event listeners are confined to the iframe's document and cannot reach the parent page at all. The editor and the DOS canvas now operate in entirely separate browsing contexts with no shared input state.

Communication between the two contexts is handled exclusively via `postMessage`:

**Parent → iframe (`runtime.js` → `dos-runner.html`):**

| Message type | Payload | Purpose |
|---|---|---|
| `INIT_DOS` | `{ code, batchScript, zipUrl, wdosboxUrl, cycles }` | Start a new DOS session |
| `STOP_DOS` | — | Terminate the current session |
| `FOCUS` | — | Give keyboard focus to the canvas |
| `BLUR` | — | Release keyboard capture, return focus to editor |
| `TAKE_SCREENSHOT` | — | Request a canvas PNG capture |

**iframe → parent (`dos-runner.html` → `runtime.js`):**

| Message type | Payload | Purpose |
|---|---|---|
| `IFRAME_READY` | — | iframe has loaded and is ready to receive messages |
| `STATUS` | `{ status: 'STARTING' \| 'EXTRACTING' \| 'WRITING_CODE' \| 'RUNNING' }` | Boot progress |
| `COMPILATION_ERROR` | `{ content: string }` | Compiler errors from ERR.TXT |
| `ERROR` | `{ message: string }` | Fatal runtime error (e.g. ZIP failed, startup timeout) |
| `SCREENSHOT_DATA` | `{ dataUrl: string }` | PNG data URL from canvas |

The iframe sends `IFRAME_READY` as its first action on load. The parent waits for this before sending `INIT_DOS` — this prevents race conditions where a message arrives before the iframe's listener is registered.

### Keyboard Blocker Overlay

Even with the iframe, there is a secondary problem: when the DOS program is running, clicking the canvas area focuses the iframe and correctly routes keys into DOS. But if the user accidentally clicks the canvas area before intentionally interacting with the program, the iframe quietly steals keyboard focus and the editor stops responding.

To solve this, a transparent overlay `div` (the keyboard blocker) sits on top of the iframe in the parent page. While the overlay is active, clicks land on the parent document, not inside the iframe. When the user intentionally wants to interact with the running program (e.g. clicks a "Focus" button or the overlay itself), the parent sends a `FOCUS` message and removes the overlay. Pressing `Esc` sends `BLUR`, restores the overlay, and gives focus back to the editor.

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
    ├─ Code autosaved to localStorage (and cloud if logged in)
    ├─ AUTOEXEC.BAT constructed with TCC compile command
    ├─ tc.zip fetched from IndexedDB cache or downloaded
    ├─ postMessage({ type: 'INIT_DOS', payload: { code, batchScript, zipUrl, ... } }) → iframe
    │
    └─ dos-runner.html
          │
          ├─ ensureJsdos() — loads js-dos.js if not already present
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
| `core.js` | Logger (color-coded `info` / `success` / `warn` / `error`), shared constants, metrics |
| `editor.js` | CodeMirror 6 setup, language extensions, keyboard shortcuts, CDN script loading with local fallback |
| `runtime.js` | `postMessage` bridge to iframe, keyboard blocker, fullscreen toggle, run button orchestration |
| `storage.js` | Supabase auth, Cloudflare Worker file API, IndexedDB ZIP cache, autosave, demo file loading |
| `theme-engine.js` | Theme definitions, CodeMirror extension compilation, per-view theme state |
| `dos-runner.html` | Self-contained iframe — boots JS-DOS, writes filesystem, runs compiler, streams errors back |

---

## Theme System (`theme-engine.js`)

Six themes are defined: `vscode-dark`, `vscode-light`, `monokai`, `github-dark`, `solarized-dark`, `one-dark`.

Each theme is a **frozen object** — immutable at runtime. Compiled CodeMirror `Extension` arrays are cached in a `Map` (keyed by theme name), so compilation only happens once per theme per session. The currently active theme per editor view is tracked in a `WeakMap`; `applyTheme()` short-circuits if the requested theme is already active.

```javascript
applyTheme(cmView, themeCompartment, 'github-dark');
resolveThemeName('invalid-name'); // → 'vscode-dark' (default fallback)
isValidThemeName('monokai');      // → true
```

**To add a new theme:** add an entry to `THEME_DATA` in `theme-engine.js` with the required fields (`dark`, `bg`, `fg`, `cursor`, `activeLine`, `gutterBg`, `gutterFg`, `gutterBorder`, `selection`, `matchBracketBg`, `matchBracketOutline`, `highlights`), then add its name to the `THEME_NAMES` array.

---

## Caching

### TC.ZIP — IndexedDB

| Detail | Value |
|---|---|
| Database | `GraphicsHCompilerCache` |
| Store | `files` |
| Key | `tc_zip_cache` |
| TTL | 7 days |

The download promise is shared globally — if the user clicks Run while a background warmup download is still in progress, the same promise is reused. No duplicate downloads, no race conditions.

### Demo Files — LocalStorage

Demo `.cpp` files are cached per key with a 7-day TTL. Selecting the same demo twice triggers a force-reload with a `?t=<timestamp>` cache-busting query parameter.

### User Code — LocalStorage + Cloud

Local save every 1 second (eager). Cloud save throttled to every 2 minutes. A forced synchronous save runs before every compilation via `forceSaveActiveFile('compileRun')`.

---

## Cloud Storage & Auth

**Stack:** Cloudflare Workers (gateway) + R2 (file storage) + Supabase (Google OAuth)

JWT tokens are verified **locally inside the Worker** using Web Crypto API (HMAC-SHA256 signature check + expiry validation). This avoids a Supabase round-trip on every request, dropping auth latency from 200–500ms to under 10ms.

Client-side session cache refresh interval is 45 minutes (vs Supabase's default 15 minutes), reducing unnecessary token refreshes by 3×.

**Worker endpoints:**

| Method | Route | Action |
|---|---|---|
| `POST` | `/files/save` | Save file to R2 |
| `GET` | `/files/list` | List user's files |
| `GET` | `/files/:path` | Load a file |
| `DELETE` | `/files/:path` | Delete a file |

R2 file path format: `user_{user_id}/main/{filename}`

**Worker environment variables** (set via `npx wrangler secret put`):

```
USER_FILES_BUCKET       R2 bucket name
SUPABASE_URL            Supabase project URL
SUPABASE_ANON_KEY       Public API key
SUPABASE_JWT_SECRET     JWT signing secret (used for local verification)
PROD_ORIGIN             https://graphics-h-compiler.vercel.app
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Flask (Python) |
| Code Editor | CodeMirror 6 |
| DOS Emulator | JS-DOS 6.22 + WebAssembly DOSBox |
| Graphics Renderer | WDOSBOX (VGA video memory → Canvas2D) |
| Compiler | Turbo C++ 3.0 (`TCC.EXE`) |
| Compiler Source | [turbo-c.net](https://turbo-c.net/) (modified) |
| File Hosting | Vercel Blob Storage |
| Cloud Files | Cloudflare Workers + R2 |
| Auth | Supabase (Google OAuth) |
| Caching | IndexedDB (tc.zip) · LocalStorage (code, demos) |
| Deployment | Vercel |

---

**Last Updated:** February 2026