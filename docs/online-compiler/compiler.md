# Compiler — How Code Compiles and Runs on Turbo C++

> The full compilation workflow: from clicking "Run" to seeing output in a DOS window in the browser.

---

## Table of Contents

- [Overview](#overview)
- [High-Level Architecture](#high-level-architecture)
- [Key Technologies](#key-technologies)
  - [JS-DOS](#js-dos)
  - [WDOSBOX (WASM)](#wdosbox-wasm)
  - [Turbo C++ ZIP (tc-v1.zip)](#turbo-c-zip-tc-v1zip)
- [The tc.zip — What's Inside](#the-tczip--whats-inside)
- [The Compilation Workflow](#the-compilation-workflow)
  - [Step 1 — User Clicks "Compile and Run"](#step-1--user-clicks-compile-and-run)
  - [Step 2 — Preload and Caching](#step-2--preload-and-caching)
  - [Step 3 — INIT_DOS Message to Iframe](#step-3--init_dos-message-to-iframe)
  - [Step 4 — DOS Startup Inside the Iframe](#step-4--dos-startup-inside-the-iframe)
  - [Step 5 — ZIP Extraction into Emscripten FS](#step-5--zip-extraction-into-emscripten-fs)
  - [Step 6 — Source Code Write](#step-6--source-code-write)
  - [Step 7 — AUTOEXEC.BAT Execution](#step-7--autoexecbat-execution)
  - [Step 8 — Error Detection (Polling)](#step-8--error-detection-polling)
  - [Step 9 — Program Output](#step-9--program-output)
- [The Batch Script (AUTOEXEC.BAT)](#the-batch-script-autoexecbat)
- [The Compilation Command](#the-compilation-command)
- [Error Handling Flow](#error-handling-flow)
- [dos-runner.html — The Isolated Iframe](#dos-runnerhtml--the-isolated-iframe)
  - [Why an Iframe?](#why-an-iframe)
  - [PostMessage Protocol](#postmessage-protocol)
  - [Mobile Keyboard Forwarding](#mobile-keyboard-forwarding)
  - [Console Filtering](#console-filtering)
- [Asset Sources and Fallbacks](#asset-sources-and-fallbacks)
- [Original Plan (docs/plan.txt)](#original-plan-docsplantxt)

---

## Overview

This project runs **real Turbo C++ 3.0** inside the browser. There is no server-side compilation. The entire toolchain (TCC.EXE, linker, libraries, BGI drivers) is packaged into a ZIP file, extracted into an in-browser DOS emulator, and the user's code is compiled and executed entirely on the client side.

![Compiler workspace](../images/online-demo-1.png)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     compiler.html                           │
│                                                             │
│  ┌──────────────┐        ┌──────────────────────────────┐   │
│  │   CodeMirror  │        │      dos-runner.html         │   │
│  │   Editor      │        │      (iframe)                │   │
│  │              │        │                              │   │
│  │  C++ source   │─────>│  JS-DOS + WDOSBOX (WASM)    │   │
│  │  code         │ post  │                              │   │
│  │              │ Msg   │  ┌──────────────────────┐    │   │
│  │              │       │  │ Emscripten Virtual FS │    │   │
│  │              │       │  │                      │    │   │
│  └──────────────┘        │  │  TURBOC3/             │    │   │
│                          │  │  ├── BIN/TCC.EXE     │    │   │
│                          │  │  ├── INCLUDE/         │    │   │
│                          │  │  ├── LIB/             │    │   │
│                          │  │  ├── BGI/             │    │   │
│                          │  │  └── BIN/USER.CPP ◄──│────│───── user code
│                          │  │                      │    │   │
│                          │  └──────────────────────┘    │   │
│                          │                              │   │
│                          │  ┌──────────────────────┐    │   │
│                          │  │   DOS Canvas          │    │   │
│                          │  │   (graphics output)   │    │   │
│                          │  └──────────────────────┘    │   │
│                          └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Technologies

### JS-DOS

[JS-DOS](https://js-dos.com/) (v6.22) is a JavaScript wrapper around DOSBox that runs DOS programs in the browser. It provides:
- A `Dos()` constructor that accepts a canvas element.
- A `ready()` callback with access to the virtual filesystem and a `main()` function.
- ZIP extraction directly into the Emscripten filesystem.

The library is loaded from `/libs/js-dos.js` (served from `compiler-assets/libs/js-dos.js`).

### WDOSBOX (WASM)

WDOSBOX is the WebAssembly build of DOSBox used by JS-DOS. It consists of:
- `/libs/wdosbox.js` — the JavaScript glue code (~190 KB)
- `/libs/wdosbox.wasm` — the compiled DOSBox binary in WebAssembly (~1.8 MB, served as `wdosbox.wasm.js`)

These files are mapped via `vercel.json` routes:
```json
{ "src": "/libs/js-dos\\.js", "dest": "/compiler-assets/libs/js-dos.js" },
{ "src": "/libs/wdosbox\\.wasm", "dest": "/compiler-assets/libs/wdosbox.wasm.js" }
```

### Turbo C++ ZIP (tc-v1.zip)

A ~3.1 MB ZIP file containing the complete Turbo C++ 3.0 installation:
- Located at `compiler-assets/zip-files/tc-v1.zip`
- Also hosted on R2 and Vercel Blob Storage as fallbacks
- Contains `TURBOC3/` directory with `BIN/`, `INCLUDE/`, `LIB/`, `BGI/`, and `SOURCE/`

---

## The tc.zip — What's Inside

The ZIP file was prepared based on the plan in `docs/plan.txt`:

```
TURBOC3/
├── BIN/
│   ├── TCC.EXE          ← Turbo C Compiler
│   ├── TLINK.EXE        ← Turbo Linker
│   ├── EGAVGA.BGI        ← Graphics driver (copied from BGI/)
│   └── dosbox.conf       ← DOSBox configuration
├── INCLUDE/
│   ├── graphics.h        ← The graphics header
│   ├── conio.h
│   ├── stdio.h
│   └── ... (standard headers)
├── LIB/
│   ├── GRAPHICS.LIB      ← Graphics library (linked during compilation)
│   ├── CS.LIB
│   └── ... (standard libraries)
├── BGI/
│   ├── EGAVGA.BGI        ← EGA/VGA graphics driver
│   └── ... (other BGI drivers)
└── SOURCE/
    └── TEST.CPP          ← Sample file (replaced with user code at runtime)
```

### How the ZIP Was Prepared

From `docs/plan.txt`:

1. Turbo C++ 3.0 was installed and the `LIB` / `INCLUDE` paths were configured.
2. A `SOURCE` folder was created at `C:\TURBOC3\SOURCE`.
3. The `BGI` and `BIN` folders were included.
4. The `EGAVGA.BGI` driver was copied to the `BIN` directory (so it's in the working directory during compilation).
5. The entire `TURBOC3` folder was zipped as `tc.zip` (now `tc-v1.zip`).

---

## The Compilation Workflow

### Step 1 — User Clicks "Compile and Run"

`execution.js → runProgram()` is called. This function:
- Reads the current editor content via `editor.getValue()`.
- Saves the code (cloud or local depending on auth state).
- Shows the loading overlay.
- On mobile, switches to the DOS output tab.

### Step 2 — Preload and Caching

Before compilation begins, the runtime assets are fetched and cached using the **Cache API** (`caches.open('graphics-h-compiler-runtime-v1')`):

```
startPreload() caches:
  /libs/js-dos.js
  /libs/wdosbox.js
  /libs/wdosbox.wasm
  tc-v1.zip (via cachedFetchCompilerAsset)
```

The `getTCZip()` function returns the tc.zip as a `Blob`, using a shared promise to prevent duplicate downloads.

### Step 3 — INIT_DOS Message to Iframe

The parent page sends a `postMessage` to the DOS runner iframe:

```js
iframe.contentWindow.postMessage({
    type: 'INIT_DOS',
    payload: {
        wdosboxUrl: '/libs/wdosbox.js',
        zipUrl: currentTcZipObjectUrl,    // Object URL of the cached blob
        code: code,                        // user's C++ source code
        batchScript: batchScript,          // AUTOEXEC.BAT content
        cycles: isMobile ? 'auto' : 'max'
    }
}, '*');
```

### Step 4 — DOS Startup Inside the Iframe

Inside `dos-runner.html`, the `startDos()` function:

1. Stops any existing DOS instance.
2. Loads JS-DOS (`ensureJsdos()`).
3. Creates a `Dos(canvas, { wdosboxUrl, cycles, autolock: false })` instance.
4. Waits for the `ready` callback.

### Step 5 — ZIP Extraction into Emscripten FS

```js
await fs.extract(payload.zipUrl);
```

The tc.zip is extracted into the Emscripten virtual filesystem. This creates the full `TURBOC3/` directory tree in memory.

### Step 6 — Source Code Write

```js
fs.createFile('TURBOC3/BIN/USER.CPP', payload.code);
fs.createFile('AUTOEXEC.BAT', payload.batchScript);
```

The user's code is written as `USER.CPP` in the `BIN` directory. The batch script is written as `AUTOEXEC.BAT` at the root.

### Step 7 — AUTOEXEC.BAT Execution

DOSBox is started with the config file and the batch script:

```js
dosInstance = await main(['-conf', 'dosbox.conf', 'AUTOEXEC.BAT']);
```

### Step 8 — Error Detection (Polling)

After DOSBox starts, `startErrorPolling()` begins polling the Emscripten filesystem every 400ms:

1. Checks for `ERR.TXT` — compilation error output.
2. Checks for `FAIL.TXT` — a flag file created by the batch script on compile failure.
3. Checks for `USER.EXE` — the compiled executable (compile success).

The polling logic:
- If `USER.EXE` exists and `FAIL.TXT` does not → **COMPILE_SUCCESS** → stop polling.
- If `FAIL.TXT` exists or `ERR.TXT` contains error text → **COMPILATION_ERROR** → send error to parent, stop polling.

### Step 9 — Program Output

If compilation succeeds, the batch script runs `USER.EXE` and the output appears on the DOS canvas. The canvas uses `image-rendering: pixelated` for authentic CRT-style graphics.

---

## The Batch Script (AUTOEXEC.BAT)

This is the batch script generated by `execution.js` and written to the virtual filesystem:

```batch
@ECHO OFF
CD TURBOC3\\BIN
IF EXIST USER.EXE DEL USER.EXE
IF EXIST ERR.TXT DEL ERR.TXT
IF EXIST FAIL.TXT DEL FAIL.TXT
TCC -I..\\INCLUDE -L..\\LIB -n. USER.CPP ..\\LIB\\GRAPHICS.LIB > ERR.TXT
IF EXIST USER.EXE GOTO SUCCESS
ECHO COMPILE_FAILED > FAIL.TXT
COPY ERR.TXT C:\\ERR.TXT >NUL
COPY FAIL.TXT C:\\FAIL.TXT >NUL
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

---

## The Compilation Command

The actual Turbo C compilation command is:

```
TCC -I..\INCLUDE -L..\LIB -n. USER.CPP ..\LIB\GRAPHICS.LIB > ERR.TXT
```

| Flag | Meaning |
|---|---|
| `TCC` | Turbo C Compiler (command-line interface) |
| `-I..\INCLUDE` | Set include path to `TURBOC3\INCLUDE` |
| `-L..\LIB` | Set library path to `TURBOC3\LIB` |
| `-n.` | Output the `.OBJ` and `.EXE` to the current directory (BIN) |
| `USER.CPP` | Source file to compile |
| `..\LIB\GRAPHICS.LIB` | Explicitly link the graphics library |
| `> ERR.TXT` | Redirect stderr/stdout to error file for polling |

The output binary is `USER.EXE`.

---

## Error Handling Flow

```
AUTOEXEC.BAT runs TCC.EXE
  │
  ├── USER.EXE exists? ──YES──> :SUCCESS → run USER.EXE
  │
  └── USER.EXE missing? ──────> Create FAIL.TXT
                                 Copy ERR.TXT to C:\ERR.TXT
                                 Display errors, PAUSE

Meanwhile, dos-runner.html polls every 400ms:
  │
  ├── USER.EXE found, no FAIL.TXT → postMessage({ type: 'COMPILE_SUCCESS' })
  │
  └── FAIL.TXT found or ERR.TXT has error text
        → postMessage({ type: 'COMPILATION_ERROR', content: errorText })
              │
              └── Parent page shows error panel below DOS output
```

---

## dos-runner.html — The Isolated Iframe

### Why an Iframe?

> **The iframe was created because earlier the DOS emulator was embedded directly in the main page. This caused critical UX problems:**
>
> 1. **Mouse capture:** Once DOSBox captured the mouse, the user could not click on the code editor or any other UI element.
> 2. **Keyboard capture:** DOSBox consumed all keyboard events, making it impossible to type in the CodeMirror editor while DOS was running.
> 3. **Focus trapping:** Escaping from the DOS canvas back to the editor required workarounds that were fragile across browsers.
>
> **By isolating DOSBox in an iframe (`dos-runner.html`), these problems are solved:**
> - Mouse and keyboard events inside the iframe do not propagate to the parent page.
> - The parent page uses `postMessage` to control focus: `FOCUS` (activate DOS input) and `BLUR` (release DOS input).
> - A keyboard blocker overlay sits on top of the iframe and intercepts clicks to toggle focus.

### PostMessage Protocol

Communication between `compiler.html` (parent) and `dos-runner.html` (iframe):

**Parent → Iframe:**

| Message Type | Purpose |
|---|---|
| `INIT_DOS` | Start a new DOS session with zip, code, and batch script |
| `STOP_DOS` | Terminate the current DOS instance |
| `FOCUS` | Focus the canvas and mobile keyboard helper |
| `BLUR` | Release focus from canvas |
| `TAKE_SCREENSHOT` | Capture the canvas as PNG |

**Iframe → Parent:**

| Message Type | Purpose |
|---|---|
| `IFRAME_READY` | Iframe has loaded and is ready to receive messages |
| `STATUS` | Status updates: `STARTING`, `EXTRACTING`, `WRITING_CODE`, `RUNNING` |
| `PROGRESS` | Progress bar percentage (0–100) |
| `COMPILE_SUCCESS` | USER.EXE was created successfully |
| `COMPILATION_ERROR` | Compilation failed, includes error text |
| `ERROR` | Fatal error (timeout, filesystem failure) |
| `SCREENSHOT_DATA` | Screenshot blob or data URL |

### Mobile Keyboard Forwarding

For mobile browsers, a hidden `<input>` element (`#mobile-keyboard-helper`) captures virtual keyboard input and forwards it to the DOS canvas:

```
Mobile keyboard input → hidden <input>
  → keydown/keyup/keypress events cloned → dispatched to <canvas>
  → DOS receives key events
```

This handles the `keyCode 229` issue on mobile browsers (composition events) by synthesizing proper key events from `input` events.

### Console Filtering

Both `dos-runner.html` and `execution.js` install console filters that suppress noisy JS-DOS/DOSBox log messages (extraction progress, version info, CONFIG/MIDI/SHELL messages) to keep the developer console clean.

---

## Asset Sources and Fallbacks

`asset-sources.js` defines a multi-source fallback system for all critical assets:

```
tc-v1.zip sources (tried in order):
  1. https://r2-public-assets.albatrossc.workers.dev/system/tc-v1.zip  (R2)
  2. https://ltjlklxc9homgiye.public.blob.vercel-storage.com/zips/tc-v1.zip  (Vercel Blob)
  3. /compiler-assets/zip-files/tc-v1.zip  (local fallback)
```

If the user is offline, the local path is tried first. URL health is checked via `HEAD` requests with a 5-minute cache.

---

## Original Plan (docs/plan.txt)

The original plan that guided the tc.zip preparation:

```
1st step) Adjust LIB and Include path as per shown in Turbo.exe UI.
             which is C:\TURBOC3\LIB
                      C:\TURBOC3\INCLUDE
         and create a empty SOURCE folder in C:\TURBOC3
         and in the SOURCE folder will be a sample test.cpp

2nd Step) Include other files like BGI and BIN as well
3rd step) ZIP the TURBOC3 folder and name it tc.zip

In the browser:
1st) Extract tc.zip file
2nd) Run commands in DOS shell:
        cd TURBOC3\\BIN
        COPY ..\\BGI\\EGAVGA.BGI .
        TCC.EXE -I..\\INCLUDE -L..\\LIB ..\\SOURCE\\TEST.CPP ..\\LIB\\GRAPHICS.LIB
        CLS
        TEST.EXE
```

> **Note:** The production batch script evolved from this original plan — it now uses `USER.CPP` instead of `TEST.CPP`, adds error handling with `ERR.TXT`/`FAIL.TXT` flag files, and the `EGAVGA.BGI` driver is pre-copied into the ZIP's `BIN/` folder during ZIP preparation.

---

*Last updated: May 2026*
