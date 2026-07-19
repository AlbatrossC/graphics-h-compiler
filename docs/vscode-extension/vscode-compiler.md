<div align="center">

<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg" alt="VS Code Logo" width="80">

# Graphics.h — VS Code Extension

**Compile and run `graphics.h` programs directly inside VS Code.**
**No configuration. No DOSBox setup. Just write code and hit Run.**

[![Install from Marketplace](https://img.shields.io/badge/Install_Extension-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)
[![Open Source](https://img.shields.io/badge/Open_Source-MIT-22C55E?style=for-the-badge&logo=github&logoColor=white)](https://github.com/AlbatrossC/graphics-h-compiler)

</div>

---

## 📸 Screenshots

<table>
<tr>
<td align="center" width="50%">
<img src="../images/vscode_turboc_demo.png" alt="Turbo C++ 3.0 mode — DOSBox emulation inside VS Code" width="100%">
<br><b>🖥️ Turbo C++ 3.0 Mode</b><br>
<i>Real Turbo C++ compiler running inside DOSBox (WebAssembly) — right inside VS Code. Full graphics output with EGAVGA.BGI driver support.</i>
</td>
<td align="center" width="50%">
<img src="../images/vscode_windows_demo.png" alt="WinBGI native mode — compiled .exe output window" width="100%">
<br><b>⚡ Windows Native Mode (WinBGI)</b><br>
<i>Native Windows compilation via MinGW-w64 g++. Produces a standalone .exe with a real Win32 graphics window. Zero-dependency output.</i>
</td>
</tr>
</table>

---

## Table of Contents

- [Overview](#overview)
- [Two Compilation Modes](#two-compilation-modes)
- [Installation Methods](#installation-methods)
- [Extension Structure](#extension-structure)
- [Prerequisites and Dependencies](#prerequisites-and-dependencies)
- [Commands and Shortcuts](#commands-and-shortcuts)
- [Compilation Workflow](#compilation-workflow)
- [Architecture Details](#architecture-details)
- [Error Handling](#error-handling)
- [Development Setup](#development-setup)
- [Building and Publishing](#building-and-publishing)
- [Relationship to the Online Compiler](#relationship-to-the-online-compiler)
- [Licensing](#licensing)

---

## Overview

The VS Code extension brings `graphics.h` programming directly into your editor. It supports two distinct compilation modes — **Turbo C++ (DOSBox)** for authentic Turbo C++ 3.0 emulation, and **WinBGI (Native)** for modern MinGW-compiled Windows executables. The toolchain is auto-downloaded on first use.

---

## Two Compilation Modes

| | 🖥️ Turbo C++ 3.0 (DOSBox) | ⚡ WinBGI (Native Windows) |
|---|---|---|
| **Compiler** | `TCC.EXE` (Turbo C++ 3.0) | `g++` (MinGW-w64 GCC 11.5.0) |
| **Runtime** | DOSBox WebAssembly in VS Code Webview | Native Win32 `.exe` |
| **Graphics** | EGAVGA.BGI driver (16-colour, 640×480) | WinBGI (full-colour, resizable window) |
| **Platforms** | Windows, Linux, macOS (experimental and unverified) | Windows, Linux (via Wine) |
| **Output** | Canvas inside VS Code tab | Separate native window |
| **Use case** | SPPU syllabus, Turbo C compatibility | Modern development, higher resolution |

---

## Installation Methods

### Method 1: VS Code Marketplace (Recommended)

1. Open VS Code
2. Press `Ctrl+Shift+X` to open the Extensions panel
3. Search for **"graphics.h compiler"**
4. Click **Install** on the extension by **AlbatrossC**

### Method 2: Command Line

```bash
code --install-extension AlbatrossC.graphics-h-compiler
```

### Method 3: Build from Source (Contributors)

```bash
# Clone the repository
git clone https://github.com/AlbatrossC/graphics-h-compiler.git

# Navigate to extension directory
cd graphics-h-compiler/VScodeExtension

# Install dependencies
npm install

# Run the full package gate (asset sync, validation, type-check, lint, and tests)
npm run package

# Package extension
npx vsce package

# Install locally
code --install-extension graphics-h-compiler-*.vsix
```

---

## Extension Structure

```
VScodeExtension/
├── src/
│   ├── extension.ts          # Entry point, command registration
│   ├── compiler.ts           # WinBGI compilation and execution engine
│   ├── diagnostics.ts         # GCC/MinGW output parsing for the Problems panel
│   ├── turbocrunner.ts       # Turbo C DOSBox webview runner
│   ├── paths.ts              # OS detection, path resolution
│   ├── windowsDownloader.ts  # Windows toolchain installer
│   ├── ubuntuDownloader.ts   # Linux setup coordinator
│   └── test/
│       ├── diagnostics.test.ts # Node-based diagnostics unit test
│       └── extension.test.ts   # Extension-host smoke test source
├── resources/
│   ├── graphics/             # Bundled WinBGI graphics files
│   │   ├── graphics.h        # Raw upstream BGI header
│   │   ├── modified-graphics.h # Const-correct header installed as graphics.h
│   │   ├── winbgim.h         # Windows BGI implementation
│   │   └── libbgi.a          # Static BGI library (i686)
│   ├── installers/
│   │   └── ubuntu_install.sh # Bundled Ubuntu/Debian installer (LF line endings)
│   ├── turboc/               # Bundled Turbo C DOSBox runtime
│   │   ├── tc-v1.zip          # Turbo C 3.0 filesystem image
│   │   ├── js-dos.js          # js-dos emulator core
│   │   ├── wdosbox.js         # DOSBox WASM loader
│   │   └── wdosbox.wasm.js    # DOSBox compiled to WebAssembly
│   └── webview/
│       └── index.html         # Webview template for Turbo C mode
├── assets/                   # Extension icons
├── scripts/
│   ├── sync-assets.js         # Copies canonical site assets into resources/
│   └── validate-assets.js     # Checks packaged installer/header invariants
├── dist/                     # Compiled JavaScript output
├── .vscode-test.mjs          # Optional VS Code extension-host test configuration
├── package.json              # Extension manifest
├── package-lock.json          # Locked npm dependency graph
├── tsconfig.json             # TypeScript configuration
├── esbuild.js                # Build script
├── eslint.config.mjs         # ESLint configuration
├── .vscodeignore             # Files excluded from packaging
├── LICENSE
└── README.md
```

---

## Prerequisites and Dependencies

### Windows

#### MinGW-w64 Toolchain (Auto-Downloaded)

**Package:** GCC 11.5.0 + MinGW-w64 12.0.0 (Win32, MSVCRT, POSIX)

**Source:**
- Original: [WinLibs](https://winlibs.com/)
- Redistributed: https://github.com/AlbatrossC/graphics-h-compiler/releases/tag/gcc-11.5.0-mingw32

**Download Details:**
- **URL:** `https://github.com/AlbatrossC/graphics-h-compiler/releases/download/gcc-11.5.0-mingw32/mingw32.zip`
- **Compressed Size:** ~221 MB
- **Extracted Size:** up to ~1 GB
- **SHA256:** `72a111d72772914b6db9fe506fe4f0bb8d21b721894e2690c89aee9521fb97cd`

**Toolchain Specifications:**
- GCC Version: 11.5.0
- Architecture: Win32 (i686)
- Runtime: MSVCRT
- Thread Model: POSIX
- Exception Model: DWARF-2
- Linking: Static (produces standalone executables)

**Setup Progress:**

| Stage | Overall progress | Visible feedback |
|---|---:|---|
| Download | 0-60% | Downloaded and total MB, plus downloaded percent |
| Checksum | 60-70% | SHA-256 verification percent |
| Extract | 70-92% | Extracted `current/total` MinGW archive files |
| Graphics files | 92-98% | Copied `current/3` bundled graphics files |
| Verify | 98-100% | Verified `current/4` compiler and library files |

**Installation Location:**
```
{VS Code User Data}/Code/User/globalStorage/albatrossc.graphics-h-compiler/mingw32/
```

**Directory Structure After Installation:**
```
mingw32/
├── bin/                      # Executables (g++.exe, gcc.exe, etc.)
├── i686-w64-mingw32/         # Target-specific files
├── include/                  # Standard C/C++ headers + graphics.h
├── lib/                      # Static libraries + libbgi.a
└── libexec/                  # GCC internal executables
```

#### Graphics Libraries

**Bundled in `resources/graphics/`:**
- `graphics.h` - Raw upstream BGI API, retained for reuse outside the installer
- `modified-graphics.h` - Const-correct compatibility header installed as `graphics.h`
- `winbgim.h` - Windows BGI implementation header
- `libbgi.a` - Static BGI library (i686 target)

**Source:** WinBGIm project (http://winbgim.codecutter.org/)

**Modifications Applied:**

The bundled `modified-graphics.h` is patched for ISO C++ compliance to eliminate "string constant to char*" warnings. `graphics.h` remains the raw source header.

```cpp
// Original (causes warnings)
void initgraph(int *gd, int *gm, char *path);
void outtextxy(int x, int y, char *text);

// Modified (ISO C++ compliant)
void initgraph(int *gd, int *gm, const char *path);
void outtextxy(int x, int y, const char *text);
```

Modified function signatures include `initgraph()`, `outtext()`, `outtextxy()`, `textheight()`, `textwidth()`, `setfillpattern()`, `installuserdriver()`, `installuserfont()`, `getdrivername()`, `getmodename()`, and `grapherrormsg()`. These changes are 100% backward compatible.

---

### Linux (Ubuntu/Debian)

**Bundled Installer**

The extension does not download headers or libraries from GitHub on Linux. It opens the bundled `resources/installers/ubuntu_install.sh` in a terminal and shows a progress notification until the compiler, Wine, and graphics files are verified. The user only needs to enter a sudo password when prompted.

**What the Script Installs (6 steps):**

1. System packages: `gcc-mingw-w64-i686`, `g++-mingw-w64-i686`, `wine32`, `wine`, `ca-certificates`
2. Creates directories: `/usr/local/include/graphics_h/` and `/usr/local/lib/graphics_h/`
3. Copies `modified-graphics.h`, `winbgim.h`, and `libbgi.a` from the extension package
4. Verifies the const-correct compatibility header
5. Installs files system-wide to `/usr/local/`
6. Creates a CLI wrapper command: `graphics.h myprogram.cpp` (compiles and runs via Wine)

**After installation, you can compile from the terminal too:**
```bash
graphics.h program.cpp        # Compiles and runs program.exe via Wine
graphics.h program.cpp myapp  # Compiles as myapp.exe and runs
```

---

## Commands and Shortcuts

### Registered Commands

| Command ID | Description | Default Shortcut |
|-----------|-------------|------------------|
| `graphics-h-compiler.compileAndRun` | Compile and run (WinBGI) — legacy alias | — |
| `graphics-h-compiler.compileAndRunWinBGI` | Compile and run (WinBGI) | `Ctrl+Alt+N` |
| `graphics-h-compiler.compileAndRunTurboC` | Compile and run (Turbo C DOSBox) | — |
| `graphics-h-compiler.compileOnly` | Compile without running (WinBGI) | `Ctrl+Alt+B` |
| `graphics-h-compiler.setupToolchain` | Install/reinstall WinBGI toolchain | — |
| `graphics-h-compiler.stopProgram` | Stop running program (WinBGI) | `Ctrl+Alt+K` |
| `graphics-h-compiler.checkDependencies` | Verify installation | — |

### Status Bar Button

- Icon: `$(play)` when idle, `$(debug-stop)` when a program is running
- Text: **"Run Graphics"** / **"Stop Graphics"**
- Visibility: Only shown for supported C++ source files in WinBGI-capable platforms

---

## Compilation Workflow

### Turbo C++ (DOSBox) Mode

The `compileAndRunTurboC` command triggers `TurboCRunner.compileAndRun(filePath)`:

```
1. Read source file from disk
2. Create a fresh in-memory ZIP (adm-zip):
   ├── Load bundled tc-v1.zip
   ├── Inject TURBOC3/BIN/USER.CPP (user code)
   └── Inject AUTOEXEC.BAT (batch script)
3. Encode ZIP as Base64 → send to webview via postMessage
4. Webview decodes Base64 → creates Blob URL → passes to Dos()
5. JS-DOS extracts ZIP into DOSBox virtual filesystem
6. DOSBox boots → runs AUTOEXEC.BAT:
   ├── TCC.EXE compiles USER.CPP
   ├── Success → runs USER.EXE (graphics output on canvas)
   └── Failure → writes FAIL.TXT + ERR.TXT → error panel shown
7. Error polling: setInterval checks for FAIL.TXT/ERR.TXT
```

**Critical design: Fresh ZIP per run.** The original `tc-v1.zip` on disk is never modified. Every run creates a new in-memory copy. This ensures DOSBox always starts with a clean Turbo C filesystem.

**Batch script (AUTOEXEC.BAT):**
```batch
@ECHO OFF
CD TURBOC3\BIN
IF EXIST USER.EXE DEL USER.EXE
IF EXIST ERR.TXT DEL ERR.TXT
IF EXIST FAIL.TXT DEL FAIL.TXT
TCC -I..\INCLUDE -L..\LIB -n. USER.CPP ..\LIB\GRAPHICS.LIB > ERR.TXT
IF EXIST USER.EXE GOTO SUCCESS
ECHO COMPILE_FAILED > FAIL.TXT
CLS
ECHO ========================================
ECHO COMPILATION ERRORS:
ECHO ========================================
TYPE ERR.TXT
PAUSE
EXIT
:SUCCESS
CLS
USER.EXE
PAUSE
```

### WinBGI (Native) Mode

**Windows compile command:**
```typescript
spawn(gppPath, [
    sourceFile,
    '-I', graphicsPath,
    '-L', libraryPath,
    '-lbgi', '-lgdi32', '-lcomdlg32', '-luuid', '-loleaut32', '-lole32',
    '-static-libgcc', '-static-libstdc++', '-static',
    '-o', outputPath
], { cwd: path.dirname(sourceFile) });
```

**Linux compile command:**
```typescript
spawn('i686-w64-mingw32-g++', [
    sourceFile,
    '-I', '/usr/local/include/graphics_h',
    '-L', '/usr/local/lib/graphics_h',
    '-lbgi', '-lgdi32', '-lcomdlg32', '-luuid', '-loleaut32', '-lole32',
    '-static-libgcc', '-static-libstdc++', '-static',
    '-o', outputPath
], { cwd: path.dirname(sourceFile) });
```

### Linked Libraries

| Library | Purpose |
|---------|---------|
| `libbgi.a` | BGI graphics primitives |
| `gdi32` | Windows GDI rendering |
| `comdlg32` | Common dialogs |
| `uuid` | UUID/GUID generation |
| `oleaut32` | OLE Automation |
| `ole32` | COM infrastructure |

Static flags produce a self-contained `.exe` with no external DLL dependencies.

### Run Command

| Platform | Terminal mode | Background mode |
|---|---|---|
| **Windows** | Shell-integration execution of the `.exe` | `spawn(exePath)` |
| **Linux** | `env WINEPREFIX=~/.wine32_graphics WINEDEBUG=-all wine {exePath}` | `spawn('wine', [exePath], { env })` |

Linux uses the dedicated Wine prefix created by the installer. `WINEDEBUG=-all` suppresses debug noise while preserving useful Wine errors in the Output panel.

---

## Architecture Details

### Module Breakdown

#### extension.ts — Entry Point

- Registers commands and keyboard shortcuts
- Manages extension lifecycle (`activate` / `deactivate`)
- Initialises OS-specific downloaders
- Updates the native-run status bar from process and terminal-shell-execution events
- Uses `vscode.window.withProgress({ cancellable: true })` for compile operations

#### turbocrunner.ts — Turbo C DOSBox Runner

- Creates a VS Code Webview panel with DOSBox canvas
- Loads `resources/webview/index.html` with dynamic CSP nonces
- Creates a fresh in-memory ZIP per run using `adm-zip`
- Sends Base64 payload via VS Code's `postMessage`
- Webview handles decoding, DOSBox lifecycle, error detection via `TextDecoder`
- Panel is created once and reused (`retainContextWhenHidden: true`)

#### compiler.ts — WinBGI Compilation Engine

- Source file validation
- `buildCompileConfig()` returns platform-specific `{ command, args }`
- `runCompilation()` is shared across platforms — OS differences in config only
- Spawns and monitors compiler processes
- Cancels compilation without displaying a later false failure notification
- Uses VS Code terminal shell integration to track terminal-run completion
- Uses the dedicated Wine prefix and preserves meaningful Wine errors on Linux

#### paths.ts — Path Management

- OS detection and toolchain path resolution
- Centralized readiness checks for the compiler, Wine, headers, and static library
- Output path generation

#### diagnostics.ts — Compiler Diagnostics

- Parses GCC/MinGW errors, warnings, notes, fatal errors, and linker failures
- Removes ANSI colour codes before parsing
- Associates diagnostics with the reported source/header file when available

#### windowsDownloader.ts — Windows Installer

- Downloads MinGW32 from GitHub with streaming MB progress
- Verifies the SHA256 checksum while reporting verification progress
- Extracts archive entries incrementally so VS Code can repaint file-count progress
- Copies and verifies bundled graphics files with numbered stages

#### ubuntuDownloader.ts — Linux Coordinator

- Starts the bundled installer without downloading graphics assets from GitHub
- Verifies the compiler, Wine, headers, and library while the installer runs
- Shows continuous setup status until the toolchain is ready or the user stops monitoring

---

## Error Handling

### Compiler Error Parsing

**GCC-style diagnostic parsing:**
```typescript
/(.*?):(\d+)(?::(\d+))?:\s*(fatal error|error|warning|note):\s*(.+)/
```

Errors appear as red squiggles in the correct source or header file and as entries in the Problems panel (`Ctrl+Shift+M`). Linker errors are attached to the active source file so they remain actionable.

### Process Management

All spawned processes are tracked in `activeProcesses: Set<ChildProcess>`. Terminal runs use VS Code shell integration when available, so the extension knows when the command ends and does not mistake an idle terminal for a running graphics program. On `dispose()`, surviving processes are killed and the extension terminal is closed.

---

## Development Setup

### Prerequisites

```
Node.js >= 16.x
npm >= 8.x
VS Code >= 1.96.0
```

### Clone and Build

```bash
git clone https://github.com/AlbatrossC/graphics-h-compiler.git
cd graphics-h-compiler/VScodeExtension

npm install
npm run compile        # single build
npm run watch          # watch mode (auto-rebuild on save)

npx vsce package       # produces graphics-h-compiler-x.x.x.vsix
code --install-extension graphics-h-compiler-*.vsix
```

### Debug the Extension

1. Open `VScodeExtension/` in VS Code
2. Press `F5` to launch the Extension Development Host
3. Set breakpoints in TypeScript source files
4. Test commands in the debug instance
5. Check the Debug Console for logs

### Common Tasks

| Task | Command |
|------|---------|
| Single build | `npm run compile` |
| Watch mode | `npm run watch` |
| Lint code | `npm run lint` |
| Run diagnostics test | `npm test` |
| Run optional extension-host test | `npm run test:integration` |
| Validate bundled assets | `npm run validate-assets` |
| Package `.vsix` | `npx vsce package` |
| Install local `.vsix` | `code --install-extension graphics-h-compiler-*.vsix` |
| Publish | `npx vsce publish` |

---

## Building and Publishing

### Package the Extension

```bash
cd VScodeExtension
npm install
npm run package
npx vsce package
```

This produces a `graphics-h-compiler-x.x.x.vsix` file.

### Publish to VS Code Marketplace

Upload the `.vsix` file at the [VS Code Marketplace Management Page](https://marketplace.visualstudio.com/manage), or publish via CLI:

```bash
npx vsce publish
```

---

## Relationship to the Online Compiler

The VS Code extension and the online compiler share the same **Turbo C++ 3.0** environment and **DOSBox emulation** approach, but are independent codebases:

| Aspect | 🌐 Online Compiler | <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg" width="14"> VS Code Extension |
|--------|---|---|
| **Backend** | Flask (Python) on Vercel | None (runs locally) |
| **Editor** | CodeMirror 6 in browser | VS Code's built-in editor |
| **Turbo C mode** | JS-DOS in `<iframe>` | JS-DOS in VS Code Webview |
| **WinBGI mode** | Not available | MinGW-w64 `g++` (native `.exe`) |
| **Toolchain** | Not needed (browser-only) | Auto-downloaded MinGW-w64 |
| **File storage** | Cloudflare D1 + Workers | Local filesystem |
| **Source location** | Project root | `VScodeExtension/` directory |

📖 Online compiler docs: [`docs/online-compiler/readme.md`](../online-compiler/readme.md)

---

## Licensing

**Extension code:** MIT License

**Bundled components:**
| Component | License |
|---|---|
| GCC 11.5.0 | GPL v3 with runtime library exception |
| MinGW-w64 | ZPL 2.1 |
| graphics.h / winbgim.h | Public domain (WinBGIm project) |
| libbgi.a | Modified BSD |
| js-dos | GPL v3 (https://js-dos.com) |
| DOSBox | GPL v2 |

---

<div align="center">

**Open source and built for students** · [Report a Bug](https://github.com/AlbatrossC/graphics-h-compiler/issues) · [Contribute](https://github.com/AlbatrossC/graphics-h-compiler)

</div>
