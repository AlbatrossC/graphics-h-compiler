# 🧬 `graphic.h-compiler-unified.html` — Technical Breakdown

> **A single ~8 MB HTML file that compiles and runs Turbo C++ `graphics.h` programs entirely in your browser — no servers, no backend, no installation.**

---

<br>

## What Is This File?

`graphic.h-compiler-unified.html` is a **completely self-contained, offline-capable** browser application. It packages a full Turbo C++ 3.0 compilation toolchain, a DOS emulator, a code editor, and all required runtime assets into **one HTML file** that you can double-click and run.

Everything — the WebAssembly binary, the DOS filesystem image, the fonts, the editor, the CSS — is **embedded inline** using base64-encoded data URIs. There are **zero external network requests**. The file works on an air-gapped machine with no internet.

<br>

---

<br>

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                   Single HTML File (~8 MB)                │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │             Embedded Assets (base64)                │  │
│  │                                                     │  │
│  │  • JetBrains Mono font (WOFF2)                     │  │
│  │  • wdosbox.wasm (DOSBox WebAssembly binary)        │  │
│  │  • DOS filesystem image (TCC.EXE, BGI drivers,     │  │
│  │    INCLUDE/, LIB/, EGAVGA.BGI, etc.)               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Ace Editor   │  │  WDOSBOX.JS  │  │  Application   │  │
│  │  (inline JS)  │  │  (Emscripten │  │  Logic         │  │
│  │              │  │   runtime)   │  │  (compile/run) │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                   │           │
│         └────────┬────────┘                   │           │
│                  │                            │           │
│         ┌────────▼──────────────────────────▼─┐          │
│         │        Browser Runtime               │          │
│         │   (Canvas, WebAssembly, Web APIs)    │          │
│         └──────────────────────────────────────┘          │
└───────────────────────────────────────────────────────────┘
```

<br>

---

<br>

## How It Works — Step by Step

### 1. Page Load & Asset Decoding

When the HTML file opens, the browser parses:

- **Inline CSS** — full application styling including the editor theme, toolbar, terminal panel, and output panel
- **Embedded fonts** — `JetBrains Mono` is included as a base64-encoded `@font-face` WOFF2 blob, so the monospace editor font works without any CDN
- **Inline JavaScript** — the Ace code editor library, the application logic, and the WDOSBOX runtime are all embedded directly in `<script>` tags

### 2. Code Editor (Ace)

The editor is powered by **Ace** (the same editor behind Cloud9 IDE). It provides:

- C/C++ syntax highlighting
- Line numbers, bracket matching, and auto-indentation
- Code is saved to `localStorage` so it persists between sessions

The user writes Turbo C code in this editor just like they would in any modern IDE.

### 3. The DOSBox WebAssembly Engine

The heavy lifting is done by **WDOSBOX** — a port of DOSBox to WebAssembly via Emscripten. The entire WDOSBOX runtime is embedded as a massive base64-encoded string (`__WDOSBOX_B64__`) inside the HTML file. On initialization:

1. The base64 string is **decoded** into a JavaScript module
2. The module instantiates a **WebAssembly instance** (`wdosbox.wasm`) that implements the full x86 DOS emulator
3. A virtual **in-memory filesystem** (MEMFS) is mounted inside the emulator

### 4. The DOS Filesystem Image

A complete Turbo C++ 3.0 environment is packed into the embedded filesystem:

| Component | Purpose |
|:---|:---|
| `TCC.EXE` | The Turbo C++ 3.0 compiler executable |
| `TLINK.EXE` | The Turbo C linker |
| `INCLUDE/` | Standard C headers (`stdio.h`, `conio.h`, `graphics.h`, etc.) |
| `LIB/` | Precompiled standard libraries |
| `EGAVGA.BGI` | The BGI graphics driver for 640×480 VGA output |
| Runtime files | `C0S.OBJ`, `CS.LIB`, `GRAPHICS.LIB`, and other linking prerequisites |

All of these files are extracted from the base64 payload and written into the virtual filesystem before compilation begins.

### 5. Compilation Flow

When the user clicks **Run**:

```
User Code (editor)
       │
       ▼
Write to virtual FS as  PROGRAM.CPP
       │
       ▼
TCC.EXE -IC:\INCLUDE -LC:\LIB PROGRAM.CPP GRAPHICS.LIB
       │
       ▼
TLINK produces  PROGRAM.EXE
       │
       ▼
DOSBox executes  PROGRAM.EXE
       │
       ▼
Graphics output renders to <canvas>
```

1. The C code from the editor is written to a file (`PROGRAM.CPP`) in the virtual DOS filesystem
2. `TCC.EXE` is invoked inside DOSBox to compile the source, linking against `GRAPHICS.LIB`
3. If compilation succeeds, the resulting `.EXE` is executed inside the same DOSBox session
4. `initgraph()` initializes the BGI graphics mode, and all drawing functions render to the emulated VGA framebuffer
5. The VGA framebuffer is mapped to an **HTML `<canvas>` element**, which displays the graphics output

### 6. Graphics Rendering

The DOSBox emulator uses SDL (Simple DirectMedia Layer) internally, which is compiled to target the browser's **Canvas 2D API** through Emscripten. When the Turbo C program calls functions like `circle()`, `line()`, or `setcolor()`:

- The BGI driver (`EGAVGA.BGI`) translates these into pixel operations on the virtual VGA framebuffer
- Emscripten's SDL layer reads the framebuffer and draws it onto the HTML `<canvas>` element
- The canvas uses `image-rendering: pixelated` for authentic retro pixel scaling

### 7. Error Handling & Output Panel

- **Compiler errors** from `TCC.EXE` are captured from the DOS `stdout`/`stderr` streams via Emscripten's `Module.ping("write_stdout", ...)` callback
- Errors are parsed and displayed in a collapsible **output panel** below the terminal
- The panel supports **copy-to-clipboard** for sharing error messages

### 8. Keyboard & Focus Management

- When the DOS program is running, keyboard input is forwarded to the DOSBox emulator (for `getch()`, `kbhit()`, etc.)
- Pressing **Escape** returns focus to the code editor
- **Ctrl+Enter** triggers compilation from the editor
- **Ctrl+S** saves the code to `localStorage`

<br>

---

<br>

## Why Is It ~8 MB?

| Component | Approximate Size | Notes |
|:---|:---|:---|
| WDOSBOX WebAssembly + JS runtime | ~4.5 MB | The full DOSBox emulator compiled to WASM |
| DOS filesystem image (TCC, libs, headers, BGI) | ~2.5 MB | Complete Turbo C++ 3.0 toolchain |
| Ace Editor (JS) | ~500 KB | Full editor with C/C++ mode |
| Fonts (JetBrains Mono WOFF2) | ~200 KB | Two weights embedded as base64 |
| Application CSS + JS | ~100 KB | UI logic, toolbar, panels |
| **Total** | **~8 MB** | Everything needed to compile C code |

<br>

---

<br>

## Key Technologies

| Technology | Role |
|:---|:---|
| **WebAssembly (WASM)** | Runs the DOSBox x86 emulator at near-native speed in the browser |
| **Emscripten** | Compiled the C/C++ DOSBox codebase to WebAssembly + JavaScript glue code |
| **Asyncify** | Emscripten transform that allows synchronous C code (like DOSBox's main loop) to yield to the browser's event loop |
| **MEMFS** | Emscripten's in-memory virtual filesystem — holds all DOS files without touching disk |
| **SDL → Canvas 2D** | Emscripten maps SDL video output to an HTML `<canvas>` for rendering |
| **Ace Editor** | Embeddable code editor with syntax highlighting and editing features |
| **Base64 Data URIs** | All binary assets (fonts, WASM) are encoded inline to achieve the single-file constraint |
| **localStorage** | Persists user code between sessions without any server |

<br>

---

<br>

## How to Use

1. **Double-click** `graphic.h-compiler-unified.html` — it opens in your default browser
2. **Write** your Turbo C `graphics.h` code in the editor
3. Click **Run** (or press `Ctrl+Enter`)
4. See the graphics output appear in the terminal canvas below

**That's it.** No server to start, no dependencies to install, no internet connection needed.

<br>

---

<br>

## Limitations

- **File size** — At ~8 MB, the file is large for an HTML document. However, once loaded, everything runs from memory.
- **Mobile** — The DOSBox canvas and keyboard input work best on desktop browsers. Mobile support is limited.
- **Performance** — WebAssembly DOSBox is fast but not as fast as native DOSBox. Complex programs with heavy loops may run slower.
- **No multi-file projects** — The unified compiler supports a single source file at a time.
- **Browser compatibility** — Requires a modern browser with WebAssembly support (Chrome 57+, Firefox 52+, Safari 11+, Edge 16+).

<br>

---

<div align="center">

<br>

**Graphics.h Compiler — Unified Build**

*One file. Zero dependencies. Full Turbo C++ in your browser.*

<br>

</div>
