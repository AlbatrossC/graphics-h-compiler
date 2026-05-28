# Compilation Pipeline

<div align="center">
<img src="../images/online-demo-1.png" width="70%" alt="Graphics.h Online Compiler" />
</div>

<br>

This document explains how C++ code gets compiled and executed inside the browser. It covers the entire flow from the moment a user clicks **Compile & Run** to when the DOS graphics output appears on screen.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Runtime Dependencies](#runtime-dependencies)
- [Compiler Filesystem ZIP](#compiler-filesystem-zip)
- [Step-by-Step Compilation Flow](#step-by-step-compilation-flow)
- [The Batch Script](#the-batch-script)
- [The TCC Compilation Command](#the-tcc-compilation-command)
- [DOSBox Initialization Inside the Iframe](#dosbox-initialization-inside-the-iframe)
- [Error Detection via Filesystem Polling](#error-detection-via-filesystem-polling)
- [Error Panel UI](#error-panel-ui)
- [Communication Protocol (postMessage)](#communication-protocol-postmessage)
- [Client-Side Caching](#client-side-caching)
- [Preloading System](#preloading-system)
- [Mobile-Specific Behavior](#mobile-specific-behavior)
- [Console Noise Suppression](#console-noise-suppression)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Terminal Controls](#terminal-controls)
- [File Reference](#file-reference)

---

## Architecture Overview

The compiler runs entirely client-side. No code leaves the browser. The architecture has two layers:

```
┌──────────────────────────────────────────────────────────┐
│  Main Page (compiler.html)                               │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ CodeMirror 6 │  │ execution.js │  │   app.js       │  │
│  │ Editor       │  │ (run logic)  │  │   (caching,    │  │
│  │              │  │              │  │    preload)     │  │
│  └─────────────┘  └──────┬───────┘  └────────────────┘  │
│                          │ postMessage                   │
│  ┌───────────────────────▼───────────────────────────┐   │
│  │  <iframe> dos-runner.html                         │   │
│  │                                                   │   │
│  │  ┌───────────┐  ┌───────────┐  ┌──────────────┐  │   │
│  │  │ js-dos.js  │  │ Dos()     │  │ DOSBox WASM  │  │   │
│  │  │ (loader)   │→ │ (runner)  │→ │ (emulator)   │  │   │
│  │  └───────────┘  └───────────┘  └──────┬───────┘  │   │
│  │                                       │           │   │
│  │                              ┌────────▼────────┐  │   │
│  │                              │ Emulated DOS FS │  │   │
│  │                              │ TURBOC3/BIN/    │  │   │
│  │                              │   TCC.EXE       │  │   │
│  │                              │   USER.CPP      │  │   │
│  │                              │   USER.EXE      │  │   │
│  │                              │   ERR.TXT       │  │   │
│  │                              │   FAIL.TXT      │  │   │
│  │                              └─────────────────┘  │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

The main page handles the editor, UI, and caching. The iframe (`dos-runner.html`) handles DOSBox initialization, filesystem operations, and error polling. They communicate exclusively via `postMessage`.

---

## Runtime Dependencies

These are the files that make DOSBox run in the browser. They live under `site/compiler-assets/libs/` and are served at `/libs/*` via a Cloudflare Pages rewrite rule in `_redirects`:

```
/libs/*  /compiler-assets/libs/:splat  200
```

| File | Size | Purpose |
|:---|:---|:---|
| `js-dos.js` | ~108 KB | JS-DOS loader. Exposes the global `Dos()` constructor that initializes DOSBox. Handles ZIP extraction, filesystem setup, and the emulator lifecycle. |
| `wdosbox.js` | ~190 KB | DOSBox WASM glue code. Bridges JavaScript and the compiled C++ DOSBox emulator. Loaded by js-dos at runtime. |
| `wdosbox.wasm.js` | ~1.8 MB | The actual DOSBox emulator compiled to WebAssembly, encoded as a JavaScript module. This is the largest asset and is aggressively cached. |

These URLs are referenced in `app.js` under `CACHE_CONFIG`:

```js
const CACHE_CONFIG = {
    JSDOS_RUNTIME_URL: '/libs/js-dos.js',
    WDOSBOX_SCRIPT_URL: '/libs/wdosbox.js',
    PRELOAD_WASM_URL: '/libs/wdosbox.wasm.js',
    DOS_RUNNER_URL: '/static/html/dos-runner.html'
};
```

---

## Compiler Filesystem ZIP

The compiler's entire filesystem is packaged as a single ZIP file:

```
/compiler-assets/zip-files/tc-v1.zip
```

This ZIP contains the complete **Turbo C++ 3.0** installation directory (`TURBOC3/`):

```
TURBOC3/
├── BIN/
│   ├── TCC.EXE          ← The Turbo C++ compiler binary
│   └── (other TC tools)
├── INCLUDE/
│   ├── graphics.h       ← The graphics library header
│   ├── conio.h
│   ├── stdio.h
│   └── (all standard TC headers)
├── LIB/
│   ├── GRAPHICS.LIB     ← The graphics library binary
│   └── (all standard TC libraries)
└── dosbox.conf           ← DOSBox configuration
```

The ZIP is referenced in `app.js` as:

```js
const LOCAL_COMPILER_ASSETS = Object.freeze({
    assets: Object.freeze({
        'tc-zip': '/compiler-assets/zip-files/tc-v1.zip',
        'demo-files-v1': '/static/assets/demo-files-v1.json'
    }),
    // ...
});
```

The `tc-v1` version string in the filename means the ZIP is treated as an immutable asset. The `_headers` file sets a 1-year cache with the `immutable` directive:

```
/compiler-assets/zip-files/*.zip
  Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable, no-transform
```

---

## Step-by-Step Compilation Flow

### Step 1 — User clicks "Compile & Run"

The entry point is `runProgram()` in `execution.js` (line 210). It reads the editor content and validates it:

```js
const code = editor.getValue();

if (!code.trim()) {
    alert('Please write some code first!');
    return;
}
```

Before compiling, the function also:
- Increments `metrics.runtime.runCount`
- Dispatches the `compiler-run-start` custom event
- Saves the current code (autosave for logged-in users, localStorage for guests)
- Shows the loading overlay and disables the Run button
- On mobile, switches to the output tab via `switchMobileTab('output')`
- Hides any previously visible error panel

### Step 2 — DOS runner iframe is loaded

The DOS emulator runs inside a sandboxed iframe. The iframe element is defined in `compiler.html`:

```html
<iframe id="dos-iframe"
        data-src="/static/html/dos-runner.html"
        sandbox="allow-scripts allow-same-origin">
</iframe>
```

The iframe uses `data-src` instead of `src` so it's **lazy-loaded**. On first run, `ensureDosRunnerFrame()` in `app.js` (line 482) sets `iframe.src = iframe.dataset.src`, waits for the `load` event, and marks it as ready. The iframe is reused across multiple runs — it's never destroyed.

```js
async function ensureDosRunnerFrame() {
    if (dosRunnerFramePromise) return dosRunnerFramePromise;

    const iframe = document.getElementById('dos-iframe');
    // ...
    dosRunnerFramePromise = new Promise((resolve, reject) => {
        iframe.addEventListener('load', handleLoad, { once: true });
        iframe.addEventListener('error', handleError, { once: true });
        if (!iframe.src) {
            iframe.src = iframe.dataset.src || CACHE_CONFIG.DOS_RUNNER_URL;
        }
    });
    return dosRunnerFramePromise;
}
```

### Step 3 — Compiler ZIP is fetched and cached

The TURBOC3 filesystem ZIP is downloaded (or served from the Cache API) and converted to an Object URL:

```js
const tcBlob = await getTCZip();

if (currentTcZipObjectUrl) {
    URL.revokeObjectURL(currentTcZipObjectUrl);
    currentTcZipObjectUrl = null;
}
currentTcZipObjectUrl = URL.createObjectURL(tcBlob);
```

The `getTCZip()` function in `app.js` (line 397) uses a shared promise to prevent duplicate downloads. It calls `cachedFetchCompilerAsset('assets', 'tc-zip')` which checks the Cache API before hitting the network:

```js
async function getTCZip() {
    await initializeResourcesFromManifest();
    if (tcZipPromise) return tcZipPromise;

    tcZipPromise = (async () => {
        const response = await cachedFetchCompilerAsset('assets', 'tc-zip');
        const blob = await response.blob();
        return blob;
    })();

    return tcZipPromise;
}
```

### Step 4 — Batch script is generated

A DOS batch script (`AUTOEXEC.BAT`) is constructed inline in `execution.js` (line 290). This is the actual command sequence that DOSBox executes. See the [Batch Script section](#the-batch-script) below for the full script and explanation.

### Step 5 — Payload is sent to the iframe

The main page sends everything the iframe needs in a single `postMessage`:

```js
iframe.contentWindow.postMessage({ type: 'STOP_DOS' }, '*');
iframe.contentWindow.postMessage({
    type: 'INIT_DOS',
    payload: {
        wdosboxUrl: '/libs/wdosbox.js',
        zipUrl: currentTcZipObjectUrl,    // Object URL pointing to the TC ZIP blob
        code: code,                        // The user's C++ source code
        batchScript: batchScript,          // The AUTOEXEC.BAT content
        cycles: isMobile ? 'auto' : 'max' // DOSBox CPU speed
    }
}, '*');
```

A `STOP_DOS` is sent first to clean up any previous DOS instance.

The `cycles` parameter controls DOSBox's emulation speed:
- `'max'` on desktop — run as fast as possible
- `'auto'` on mobile — automatically throttle to prevent battery drain

### Step 6 — DOSBox boots inside the iframe

Inside `dos-runner.html`, the `startDos()` function (line 418) handles the entire boot sequence. It first loads the js-dos library if needed:

```js
async function startDos(payload) {
    await stopDos();       // Clean up any previous instance
    await ensureJsdos();   // Load /libs/js-dos.js if not already loaded

    // 60-second safety timeout for stuck boots
    startupTimeoutTimer = setTimeout(() => {
        if (!dosInstance) {
            post({ type: 'ERROR', message: 'Compiler took too long to start...' });
        }
    }, 60000);
```

Then it creates the DOSBox instance with the canvas element:

```js
    const runner = Dos(canvas, {
        wdosboxUrl: payload.wdosboxUrl,  // '/libs/wdosbox.js'
        cycles: payload.cycles || 'max',
        autolock: false                   // Don't lock mouse
    });
```

### Step 7 — Filesystem is extracted and code is written

Inside the `runner.ready()` callback, the ZIP is extracted into the emulated filesystem, then the user's code and batch script are written as new files:

```js
    await runner.ready(async (fs, main) => {
        await fs.extract(payload.zipUrl);

        fs.createFile('TURBOC3/BIN/USER.CPP', payload.code || '');
        fs.createFile('AUTOEXEC.BAT', payload.batchScript || '');

        dosInstance = await main(['-conf', 'dosbox.conf', 'AUTOEXEC.BAT']);

        startErrorPolling();
        post({ type: 'STATUS', status: 'RUNNING' });
    });
```

If `fs.createFile()` fails (e.g., the ZIP extraction was corrupted), an `ERROR` message is sent immediately to the parent rather than letting DOSBox silently compile an empty file.

### Step 8 — DOSBox executes the batch script

```js
dosInstance = await main(['-conf', 'dosbox.conf', 'AUTOEXEC.BAT']);
```

At this point, DOSBox reads `dosbox.conf` for configuration, then runs `AUTOEXEC.BAT`, which invokes `TCC.EXE` to compile `USER.CPP`. The graphics output renders to the `<canvas>` element in real-time.

---

## The Batch Script

The batch script is generated in `execution.js` (line 290). This is the exact content written to `AUTOEXEC.BAT`:

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
PAUSE
```

Line-by-line explanation:

| Line | What it does |
|:---|:---|
| `@ECHO OFF` | Suppress command echoing in the DOS terminal |
| `CD TURBOC3\BIN` | Navigate to the compiler binary directory |
| `IF EXIST USER.EXE DEL USER.EXE` | Delete any previous compiled output |
| `IF EXIST ERR.TXT DEL ERR.TXT` | Delete previous error log |
| `IF EXIST FAIL.TXT DEL FAIL.TXT` | Delete previous failure marker |
| `TCC -I.. -L.. ... > ERR.TXT` | **Compile the code** (see next section) |
| `IF EXIST USER.EXE GOTO SUCCESS` | If compilation produced an EXE, jump to success path |
| `ECHO COMPILE_FAILED > FAIL.TXT` | Create failure marker file (read by error polling) |
| `COPY ERR.TXT C:\ERR.TXT >NUL` | Copy error log to root (fallback location for polling) |
| `TYPE ERR.TXT` | Display errors in the DOS terminal |
| `PAUSE` | Wait for user keypress |
| `:SUCCESS` → `USER.EXE` | Run the compiled program |

---

## The TCC Compilation Command

The core compilation command inside the batch script:

```
TCC -I..\INCLUDE -L..\LIB -n. USER.CPP ..\LIB\GRAPHICS.LIB > ERR.TXT
```

| Flag | Meaning |
|:---|:---|
| `TCC` | Turbo C++ Compiler (command-line version of the Turbo C++ 3.0 IDE) |
| `-I..\INCLUDE` | Include path for header files (`graphics.h`, `conio.h`, `stdio.h`, etc.) |
| `-L..\LIB` | Library search path for linking |
| `-n.` | Output directory for the compiled `.EXE` — current directory (`TURBOC3\BIN\`) |
| `USER.CPP` | The user's source file (written by `fs.createFile` in Step 7) |
| `..\LIB\GRAPHICS.LIB` | Explicitly links the BGI graphics library for `graphics.h` support |
| `> ERR.TXT` | Redirect all compiler output (errors, warnings) to a text file |

The compiled output is `USER.EXE`. Its existence (or absence) after compilation is the primary signal used to determine success or failure.

---

## DOSBox Initialization Inside the Iframe

The iframe file `dos-runner.html` contains all the logic for running DOSBox. Here's the detailed initialization flow:

1. **Console filter is installed first** — Before anything else, a console filter intercepts `console.log`, `console.info`, and `console.warn` to suppress noisy DOSBox/js-dos output like `extracting:`, `CONFIG:`, `MIDI:`, etc.

2. **`IFRAME_READY` is posted** — At the bottom of the script, the iframe signals the parent that it's ready: `post({ type: 'IFRAME_READY' })`.

3. **`INIT_DOS` message is received** — The message handler calls `startDos(payload)`.

4. **`ensureJsdos()` loads the js-dos script** — The function dynamically creates a `<script>` tag for `/libs/js-dos.js` and waits for it to load. A deduplication promise prevents multiple loads.

5. **`Dos(canvas, config)` creates the DOSBox instance** — This sets up the WASM runtime and binds it to the canvas.

6. **`fs.extract(zipUrl)` unpacks the compiler** — The ZIP is extracted into the Emscripten virtual filesystem.

7. **Source files are written** — `USER.CPP` and `AUTOEXEC.BAT` are created in the virtual FS.

8. **`main(['-conf', 'dosbox.conf', 'AUTOEXEC.BAT'])` boots DOS** — This starts DOSBox execution.

9. **Error polling begins** — After a 1.5-second delay, the iframe starts polling the virtual filesystem every 400ms.

10. **A 60-second safety timeout** is active during steps 5-8. If DOS hasn't started by then, an error is reported.

---

## Error Detection via Filesystem Polling

Error detection happens inside `dos-runner.html` in the `startErrorPolling()` function (line 334). It works by reading files directly from the Emscripten virtual filesystem (`dosInstance.em.FS`).

### Polling mechanism

After a 1.5-second initial delay (to let TCC start), a `setInterval` runs every 400ms:

```js
errorPollDelayTimer = setTimeout(() => {
    const probe = () => {
        if (!dosInstance || !dosInstance.em || !dosInstance.em.FS) return;
        const FS = dosInstance.em.FS;
        // ... check files ...
    };

    probe();
    errorPollTimer = setInterval(probe, 400);
}, 1500);
```

### Files checked

Each probe checks for three files across multiple possible paths (because the Emscripten FS mount point can vary):

**ERR.TXT** — Compiler output. Checked at:
```
/TURBOC3/BIN/ERR.TXT, TURBOC3/BIN/ERR.TXT, /ERR.TXT, ERR.TXT,
/home/web_user/ERR.TXT, home/web_user/ERR.TXT,
/turboc3/bin/err.txt, turboc3/bin/err.txt
```

**FAIL.TXT** — Failure marker (created by the batch script on compile failure). Same path variants.

**USER.EXE** — Compiled binary. Same path variants.

### Decision logic

```
IF   USER.EXE exists  AND  FAIL.TXT does not exist
  → COMPILE_SUCCESS — stop polling

IF   FAIL.TXT exists
  → Read ERR.TXT content → send COMPILATION_ERROR to parent

IF   ERR.TXT has error-like patterns AND USER.EXE does not exist
  → Send COMPILATION_ERROR to parent
```

The error pattern check uses a regex:

```js
const looksLikeError =
    hasFailMarker ||
    /(^|\b)(error|fatal|undefined|unable|unresolved|not found)(\b|:)/i.test(trimmed) ||
    (!hasUserExe && lower.length > 0);
```

Once an error is detected and sent, `compileErrorSent` is set to `true` to prevent duplicate notifications, and polling stops.

---

## Error Panel UI

When the parent page receives a `COMPILATION_ERROR` message, the handler in `execution.js` (line 131) populates and shows the error panel:

```js
outputContent.textContent = data.content || '';
outputContent.classList.add('output-error');
outputPanel.classList.add('visible');
terminalWrapper.classList.add('has-panel');
```

The error panel is defined in `compiler.html` as `#output-panel`. It includes:

| Element | ID | Purpose |
|:---|:---|:---|
| Error text display | `#output-content` | Shows the raw TCC error output |
| Close button | `#close-output-btn` | Hides the panel and triggers a resize to fix canvas layout |
| Copy errors button | `#copy-error-btn` | Copies error text to clipboard with visual feedback ("Copied" for 2 seconds) |
| Expand/collapse button | `#expand-output-btn` | Toggles an expanded view of the error panel |

The copy function has a fallback for older browsers that uses `document.execCommand('copy')` when `navigator.clipboard.writeText()` is unavailable.

On mobile, if the editor is fullscreen when errors arrive, the editor is automatically exited from fullscreen so the error panel is visible. On desktop, the editor is focused so the user can fix the error immediately.

---

## Communication Protocol (postMessage)

The main page and the DOS iframe communicate exclusively via `window.postMessage`. Both sides validate `event.origin` — the iframe checks against `window.location.origin` (the `parentOrigin` variable at line 91 of `dos-runner.html`).

### Main page → Iframe

| Message Type | Payload | Purpose |
|:---|:---|:---|
| `INIT_DOS` | `{ wdosboxUrl, zipUrl, code, batchScript, cycles }` | Start a new DOSBox instance with the given code and compiler ZIP. `cycles` is `'auto'` on mobile, `'max'` on desktop. |
| `STOP_DOS` | (none) | Shut down the current DOS instance. Clears all timers, calls `dosInstance.exit()`. Always sent before `INIT_DOS`. |
| `FOCUS` | (none) | Focus the DOS canvas and the mobile keyboard helper input for keyboard capture. |
| `BLUR` | (none) | Release keyboard capture from the canvas and mobile helper. Used when user clicks back into the editor. |
| `TAKE_SCREENSHOT` | `{ purpose, requestId }` | Capture the canvas as a PNG. `purpose` is typically `'download'`. Uses `canvas.toBlob()` with a `canvas.toDataURL()` fallback. |

### Iframe → Main page

| Message Type | Payload | Purpose |
|:---|:---|:---|
| `IFRAME_READY` | (none) | Sent once on iframe load. Signals that the iframe can receive messages. |
| `STATUS` | `{ status }` | Status updates during boot. Values: `STARTING` → `EXTRACTING` → `WRITING_CODE` → `RUNNING`. Each triggers a loading text update and progress bar change. |
| `PROGRESS` | `{ percent }` | Loading progress (0–100). Uses a monotonic counter — progress never decreases. Incremented by `pulseProgress()` which uses a setInterval to smoothly animate between stages. |
| `COMPILATION_ERROR` | `{ content }` | Compiler errors. `content` is the raw text from `ERR.TXT`. If ERR.TXT is empty but FAIL.TXT exists, a generic message is sent. |
| `COMPILE_SUCCESS` | (none) | Code compiled without errors (`USER.EXE` exists, `FAIL.TXT` does not). |
| `ERROR` | `{ message }` | Fatal runtime error (e.g., failed to load js-dos, ZIP extraction failed, 60s startup timeout). |
| `SCREENSHOT_DATA` | `{ blob?, dataUrl?, error?, purpose, requestId }` | Canvas screenshot response. Includes either a Blob or a data URL. The main page creates a download link. |

---

## Client-Side Caching

The compiler uses a two-layer caching system to minimize downloads.

### Layer 1 — Cache API (runtime assets)

Managed by `cachedFetch()` in `app.js` (line 291). All runtime files are stored in a named cache:

```js
const COMPILER_CACHE_NAME = 'graphics-h-compiler-runtime-v1';
```

The caching flow for each asset:
1. Normalize the URL to an absolute URL
2. Check if a fetch for this URL is already in-flight (deduplication via `compilerFetchPromises` Map)
3. Check the Cache API for a stored response
4. If miss, fetch from network
5. Validate the response (reject empty responses)
6. Clone the response and store it in the cache
7. Return a clone to the caller

```js
async function cachedFetch(url, fetchOptions = {}) {
    const normalizedUrl = normalizeCacheUrl(url);
    const existingPromise = compilerFetchPromises.get(normalizedUrl);
    if (existingPromise) {
        return (await existingPromise).clone();
    }

    const requestPromise = (async () => {
        const cached = await getCachedResponse(normalizedUrl);
        if (cached) return cached;

        const response = await fetch(normalizedUrl, { cache: 'default', ...fetchOptions });
        // ... validate, cache, return ...
    })().finally(() => {
        compilerFetchPromises.delete(normalizedUrl);
    });

    compilerFetchPromises.set(normalizedUrl, requestPromise);
    return (await requestPromise).clone();
}
```

If the Cache API is unavailable (e.g., in some private browsing modes), the system falls back to normal `fetch()` without caching.

### Layer 2 — Demo file cache (localStorage)

Demo source files (graphics demo, circle pattern, bouncing ball, shooter game) are cached in localStorage with a 7-day TTL:

```js
const DemoCache = {
    get(demoKey) {
        const cached = localStorage.getItem(CACHE_CONFIG.DEMO_CACHE_PREFIX + demoKey);
        if (!cached) return null;
        const { code, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_CONFIG.CACHE_TTL) return code;
        localStorage.removeItem(cacheKey);  // Expired
        return null;
    },
    set(demoKey, code) {
        localStorage.setItem(cacheKey, JSON.stringify({ code, timestamp: Date.now() }));
    }
};
```

Demo files are also available in a JSON bundle (`/static/assets/demo-files-v1.json`) loaded by `loadDemoBundle()`.

---

## Preloading System

When the compiler page loads, runtime assets are eagerly preloaded in the background. This happens in `startPreload()` in `app.js` (line 417):

```js
async function startPreload() {
    if (preloadStarted && preloadPromise) return preloadPromise;
    preloadStarted = true;

    preloadPromise = (async () => {
        await initializeResourcesFromManifest();
        await cachedFetch(CACHE_CONFIG.JSDOS_RUNTIME_URL);    // js-dos.js
        await cachedFetch(CACHE_CONFIG.WDOSBOX_SCRIPT_URL);   // wdosbox.js
        await cachedFetch(CACHE_CONFIG.PRELOAD_WASM_URL);     // wdosbox.wasm.js
        await cachedFetchCompilerAsset('assets', 'tc-zip');   // tc-v1.zip
    })();

    return preloadPromise;
}
```

Preloading is triggered from `loadAllScripts()` in `editor.js` after the editor is initialized. It's scheduled via `requestIdleCallback` so it doesn't block editor rendering:

```js
if (window.requestIdleCallback) {
    window.requestIdleCallback(queuePreload);
} else {
    Promise.resolve().then(queuePreload);
}
```

This means the first "Compile & Run" click is fast even on the first visit, since assets are already downloading while the user writes code.

---

## Mobile-Specific Behavior

Mobile devices (detected via user agent regex or `window.innerWidth <= 768`) get different treatment:

| Behavior | Desktop | Mobile |
|:---|:---|:---|
| DOSBox CPU cycles | `'max'` (full speed) | `'auto'` (throttled) |
| Layout on run | Side-by-side panels | Switches to output tab |
| Error handling | Focus editor | Exit fullscreen if active |
| Keyboard input | Direct canvas events | Forwarded via hidden `<input>` helper |

### Mobile keyboard forwarding

DOSBox expects keyboard events on the canvas, but mobile browsers don't fire keyboard events for canvas elements. The iframe solves this with a hidden `<input>` element (`#mobile-keyboard-helper`):

1. When the canvas is tapped, the hidden input is focused (bringing up the mobile keyboard)
2. `keydown`, `keyup`, and `keypress` events on the input are cloned and dispatched to the canvas
3. For virtual keyboards that send `keyCode: 229` (composition events), the `input` event is intercepted and synthetic keyboard events are constructed from the input data
4. The helper always keeps at least one character (`' '`) so the Backspace key works

---

## Console Noise Suppression

Both `execution.js` and `dos-runner.html` install console filters to suppress noisy DOSBox/js-dos output. The filter runs before js-dos loads (in the iframe) to catch all messages:

```js
const shouldBlock = (msg) => {
    if (typeof msg !== 'string') return false;
    if (msg.includes('extracting:')) return true;
    if (msg.includes('js-dos version')) return true;
    if (msg.includes('Copyright') && msg.includes('DOSBox')) return true;
    if (msg.startsWith('CONFIG:')) return true;
    if (msg.startsWith('MIDI:')) return true;
    // ... more patterns
    return false;
};
```

---

## Keyboard Shortcuts

Defined in `execution.js` (line 360):

| Shortcut | Action |
|:---|:---|
| `Ctrl+Enter` (or `Cmd+Enter`) | Run program (calls `runProgram()`) |
| `Ctrl+S` (or `Cmd+S`) | Save code |

Both shortcuts are blocked when `terminalFocused` is `true` (i.e., when the DOS terminal has focus) to prevent conflicts with DOS programs.

---

## Terminal Controls

The terminal panel in `compiler.html` includes zoom controls managed by `execution.js`:

| Control | Function |
|:---|:---|
| Zoom in button (`#increase-terminal-btn`) | `updateTerminalZoom(0.1)` — applies CSS `scale()` transform |
| Zoom out button (`#decrease-terminal-btn`) | `updateTerminalZoom(-0.1)` |
| Download button (`#download-terminal-btn`) | Sends `TAKE_SCREENSHOT` to iframe, saves PNG |

Zoom range: 0.5x to 3.0x. The iframe canvas uses `image-rendering: pixelated` for crisp pixel scaling.

---

## File Reference

| File | Lines | Role |
|:---|:---|:---|
| `site/static/js/compiler/execution.js` | 420 | Run button handler, batch script generation, iframe message handling, keyboard shortcuts, terminal zoom, screenshot download |
| `site/static/js/compiler/app.js` | 797 | Global state, caching system (`cachedFetch`, Cache API, `DemoCache`), preloading, TC ZIP download, iframe lazy-loading, output panel handlers, panel splitters, settings/metrics |
| `site/static/html/dos-runner.html` | 560 | Sandboxed iframe that runs DOSBox: js-dos loading, filesystem operations, error polling (checks ERR.TXT/FAIL.TXT/USER.EXE every 400ms), mobile keyboard forwarding, console noise filter, screenshot capture, 60s safety timeout |
| `site/compiler-assets/libs/js-dos.js` | — | JS-DOS library. Exposes the `Dos()` constructor for DOSBox initialization. |
| `site/compiler-assets/libs/wdosbox.js` | — | DOSBox WASM glue code (loaded by js-dos) |
| `site/compiler-assets/libs/wdosbox.wasm.js` | — | DOSBox WASM binary (~1.8 MB) |
| `site/compiler-assets/zip-files/tc-v1.zip` | — | TURBOC3 filesystem: headers (`INCLUDE/`), libraries (`LIB/`), TCC.EXE (`BIN/`) |
| `site/templates/compiler.html` | ~1400 | Main compiler page Jinja2 template with the editor, terminal, error panel, and sidebar HTML |
