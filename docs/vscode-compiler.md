# Graphics.h VS Code Extension - Developer Documentation

**Technical reference for developers working on the Graphics.h Compiler extension**

---

## Table of Contents

- [Installation Methods](#installation-methods)
- [Extension Structure](#extension-structure)
- [Prerequisites and Dependencies](#prerequisites-and-dependencies)
- [Commands and Shortcuts](#commands-and-shortcuts)
- [Compilation Workflow](#compilation-workflow)
- [Architecture Details](#architecture-details)
- [Error Handling](#error-handling)
- [Development Setup](#development-setup)

---

## Installation Methods

### Method 1: VS Code Marketplace (End Users)

1. Open VS Code
2. Press `Ctrl+Shift+X` to open the Extensions panel
3. Search for "graphics.h compiler"
4. Click Install on the extension by AlbatrossC

### Method 2: Command Line Installation

```bash
code --install-extension AlbatrossC.graphics-h-compiler
```

### Method 3: Building from Source (Developers)

```bash
# Clone repository
git clone https://github.com/AlbatrossC/graphics-h-compiler.git

# Navigate to extension directory
cd graphics-h-compiler/VScodeExtension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

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
│   ├── turbocrunner.ts       # Turbo C DOSBox webview runner
│   ├── paths.ts              # OS detection, path resolution
│   ├── windowsDownloader.ts  # Windows toolchain installer
│   └── ubuntuDownloader.ts   # Linux setup coordinator
├── resources/
│   ├── graphics/             # Bundled WinBGI graphics files
│   │   ├── graphics.h        # Modified BGI header (ISO C++ compliant)
│   │   ├── winbgim.h         # Windows BGI implementation
│   │   └── libbgi.a          # Static BGI library (i686)
│   └── turboc/               # Bundled Turbo C DOSBox runtime
│       ├── tc-v1.zip          # Turbo C 3.0 filesystem image
│       ├── js-dos.js          # js-dos emulator core
│       ├── wdosbox.js         # DOSBox WASM loader
│       └── wdosbox.wasm.js    # DOSBox compiled to WebAssembly
├── assets/                   # Extension icons
├── dist/                     # Compiled JavaScript output
├── node_modules/             # npm dependencies
├── package.json              # Extension manifest
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
- **Extracted Size:** ~950 MB
- **SHA256:** `72a111d72772914b6db9fe506fe4f0bb8d21b721894e2690c89aee9521fb97cd`

**Toolchain Specifications:**
- GCC Version: 11.5.0
- Architecture: Win32 (i686)
- Runtime: MSVCRT
- Thread Model: POSIX
- Exception Model: DWARF-2
- Linking: Static (produces standalone executables)

**Installation Location:**
```
{VS Code User Data}/Code/User/globalStorage/albatrossc.graphics-h-compiler/mingw32/
```

**Example Path:**
```
C:\Users\{username}\AppData\Roaming\Code\User\globalStorage\albatrossc.graphics-h-compiler\mingw32\
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
- `graphics.h` - Modified BGI API (ISO C++ compatible)
- `winbgim.h` - Windows BGI implementation header
- `libbgi.a` - Static BGI library (i686 target)

**Source:** WinBGIm project (http://winbgim.codecutter.org/)

**Modifications Applied:**

The bundled `graphics.h` has been patched for ISO C++ compliance to eliminate "string constant to char*" warnings:

```cpp
// Original (causes warnings)
void initgraph(int *gd, int *gm, char *path);
void outtextxy(int x, int y, char *text);

// Modified (ISO C++ compliant)
void initgraph(int *gd, int *gm, const char *path);
void outtextxy(int x, int y, const char *text);
```

Modified function signatures:
- `initgraph()` - path parameter now `const char*`
- `outtext()`, `outtextxy()` - text parameters now `const char*`
- `textheight()`, `textwidth()` - text parameters now `const char*`
- `setfillpattern()` - pattern parameter now `const char*`
- `installuserdriver()`, `installuserfont()` - name parameters now `const char*`
- `getdrivername()`, `getmodename()`, `grapherrormsg()` - return `const char*`

These changes are 100% backward compatible. No changes required in user programs.

---

### Linux (Ubuntu/Debian)

**Manual Installation Required**

The extension does not auto-download on Linux. Users must run the installation script:

```bash
curl -fsSL https://raw.githubusercontent.com/AlbatrossC/graphics.h-online-compiler/main/compiler-assets/Installers/ubuntu_install.sh | bash
```

**What the Script Installs:**

1. System packages:
   ```bash
   sudo apt update
   sudo apt install -y gcc-mingw-w64-i686 g++-mingw-w64-i686
   sudo apt install -y wine32 wine
   sudo apt install -y wget ca-certificates
   ```

2. Graphics.h library files:
   ```bash
   sudo mkdir -p /usr/local/include/graphics_h
   sudo mkdir -p /usr/local/lib/graphics_h
   sudo cp graphics.h winbgim.h /usr/local/include/graphics_h/
   sudo cp libbgi.a /usr/local/lib/graphics_h/
   ```

3. ISO C++ patches applied in-place via `sed`.

**Installed Locations:**
```
/usr/local/include/graphics_h/graphics.h
/usr/local/include/graphics_h/winbgim.h
/usr/local/lib/graphics_h/libbgi.a
/usr/bin/i686-w64-mingw32-g++   (via apt)
/usr/bin/wine                    (via apt)
```

---

## Commands and Shortcuts

### Registered Commands

| Command ID | Description | Default Shortcut |
|-----------|-------------|------------------|
| `graphics-h-compiler.compileAndRun` | Compile and run (WinBGI) — legacy alias, hidden from menus | `Ctrl+Alt+N` |
| `graphics-h-compiler.compileAndRunWinBGI` | Compile and run (WinBGI) | `Ctrl+Alt+N` |
| `graphics-h-compiler.compileAndRunTurboC` | Compile and run (Turbo C DOSBox) | — |
| `graphics-h-compiler.compileOnly` | Compile without running (WinBGI) | `Ctrl+Alt+B` |
| `graphics-h-compiler.setupToolchain` | Install/reinstall WinBGI toolchain | — |
| `graphics-h-compiler.stopProgram` | Stop running program (WinBGI) | `Ctrl+Alt+K` |
| `graphics-h-compiler.checkDependencies` | Verify installation | — |

### Status Bar Button

- Icon: `$(play)` when idle, `$(debug-stop)` when a program is running
- Text: "Run Graphics" / "Stop Graphics"
- Visibility: Only shown when a `.cpp` or `.c++` file is active
- The running state is detected for both terminal-mode and background-process-mode execution

### Command Palette

All commands available via `Ctrl+Shift+P` under the `Graphics.h` category.

---

## Compilation Workflow

### Turbo C (DOSBox) Mode

The `compileAndRunTurboC` command triggers `TurboCRunner.compileAndRun(filePath)`. The workflow is:

1. **Read source file** from disk
2. **Create a fresh ZIP in memory** using `adm-zip` — the bundled `tc-v1.zip` is loaded, and two files are injected:
   - `TURBOC3/BIN/USER.CPP` — the user's source code
   - `AUTOEXEC.BAT` — batch script that invokes TCC and handles error reporting
3. **Encode the ZIP as base64** and send it to the webview via `postMessage`
4. **Inside the webview**, the base64 is decoded, converted to a Blob URL, and passed to `Dos()` (js-dos) which extracts it into the DOSBox virtual filesystem and then the memory is freed with `URL.revokeObjectURL()`
5. **DOSBox boots**, runs `AUTOEXEC.BAT`, which:
   - Compiles with `TCC.EXE`
   - If compilation fails, writes `FAIL.TXT` and displays errors
   - If compilation succeeds, runs the resulting `USER.EXE`
6. **Error polling** — a `setInterval` in the webview polls the DOSBox filesystem for `ERR.TXT` and `FAIL.TXT` to detect compilation errors and display them in an error panel below the canvas

**Critical design: Fresh ZIP per run.** The original `tc-v1.zip` on disk is never modified. Every run creates a new in-memory copy. This ensures DOSBox always starts with a clean Turbo C filesystem — critical because Turbo C is unreliable when reusing a DOS environment.

**Batch script:**
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

#### Compile Command (Both Platforms)

The compiler is invoked via `spawn(command, args[])` directly on both Windows and Linux — no shell interpolation is used, which prevents shell injection from filenames containing special characters.

**Windows:**
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

**Linux:**
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

**Windows (terminal mode):**
```typescript
terminal.sendText(`cmd /c "${exePath}"`);
```

**Linux (terminal mode):**
```typescript
terminal.sendText(`wine "${exePath}"`);
```

**Non-terminal mode** (background process, output captured in Output panel):
```typescript
spawn(exePath, [], { cwd: path.dirname(exePath) });          // Windows
spawn('wine', [exePath], { cwd: path.dirname(exePath) });    // Linux
```

Wine stderr is filtered to suppress `fixme:` and `wine:` debug lines.

### Stopping a Running Program

```typescript
stopRunningProgram(): boolean {
    // Background process
    if (this.runningProgram && !this.runningProgram.killed) {
        this.runningProgram.kill();
        this.runningProgram = null;
        return true;
    }

    // Terminal process — send Ctrl+C first, then dispose after 500ms
    if (this.terminal && this.terminal.exitStatus === undefined) {
        this.terminal.sendText('\x03');
        setTimeout(() => {
            this.terminal?.dispose();
            this.terminal = null;
        }, 500);
        return true;
    }

    return false;
}
```

---

## Architecture Details

### Module Breakdown

#### extension.ts — Entry Point

Responsibilities:
- Register commands and keyboard shortcuts
- Manage extension lifecycle (`activate` / `deactivate`)
- Initialise OS-specific downloaders
- Status bar updates
- User interaction flow (toolchain checks, save prompts)

Key notes:
- The `setInterval` for status bar polling is stored and cleared in `deactivate()` to prevent leaks
- Both `handleCompileAndRun` and `handleCompileOnly` use `vscode.window.withProgress({ cancellable: true })` and pass the cancellation token to the compiler
- `handleCompileAndRunTurboC` validates the file, auto-saves if dirty, and delegates to `TurboCRunner.compileAndRun()`
- Status bar activates for both `languageId === 'cpp'` and filenames ending in `.c++`

#### turbocrunner.ts — Turbo C DOSBox Runner

Responsibilities:
- Create a VS Code Webview panel displaying only the DOSBox canvas
- Load the external webview template from `resources/webview/index.html` and conditionally inject dynamic CSP nonces and URLs
- Create a fresh in-memory ZIP per run using `adm-zip` and encode it as a Base64 string
- Send the Base64 payload directly utilizing VS Code's `postMessage`
- Webview handles Base64 decoding, DOSBox lifecycle (locks to avoid double runs), safe native `TextDecoder` for error detection, and URL garbage collection (`revokeObjectURL`)

Key design decisions:
- The webview is created once and reused (panel is revealed if already open)
- `retainContextWhenHidden: true` keeps the DOSBox state alive when the tab is in the background
- `localResourceRoots` is restricted to the `resources/turboc/` directory
- Error detection is done by polling the DOSBox virtual filesystem for `FAIL.TXT` and `ERR.TXT`

#### compiler.ts — WinBGI Compilation Engine

Responsibilities:
- Source file validation
- Building compile arguments
- Spawning and monitoring the compiler process
- Parsing GCC errors into VS Code diagnostics
- Process lifecycle management

Key design decisions:
- `buildCompileConfig()` returns the platform-specific `{ command, args }` pair
- `runCompilation()` is a single shared implementation used by both platforms — OS differences are handled entirely in `buildCompileConfig()` and `runExecutable()`
- Cancellation token listener is stored as a disposable and cleaned up in both `close` and `error` handlers to prevent leaks

#### paths.ts — Path Management

Responsibilities:
- OS detection
- Toolchain path resolution
- Dependency checking
- Output path generation

**Example paths (Windows):**
```
Global storage: C:\Users\{user}\AppData\Roaming\Code\User\globalStorage\albatrossc.graphics-h-compiler
Toolchain:      {globalStorage}\mingw32
Compiler:       {globalStorage}\mingw32\bin\g++.exe
Headers:        {globalStorage}\mingw32\include
Libraries:      {globalStorage}\mingw32\lib
```

#### windowsDownloader.ts — Windows Installer

Responsibilities:
- Download MinGW32 toolchain from GitHub with streaming progress
- Verify SHA256 checksum
- Extract ZIP archive with per-file progress reporting
- Copy bundled graphics files into the MinGW directory tree
- Verify installation success

**Extraction approach:**

The ZIP extraction iterates entries individually using `zip.extractEntryTo()` inside `setImmediate()` so the progress message renders before the blocking work begins. Progress is reported every ~5% of total file count:

```typescript
setImmediate(() => {
    const entries = zip.getEntries();
    const total = entries.length;
    let done = 0;

    for (const entry of entries) {
        zip.extractEntryTo(entry, path.dirname(targetPath), true, true);
        done++;
        if (done % Math.max(1, Math.floor(total / 20)) === 0) {
            const pct = Math.floor((done / total) * 100);
            progress.report({
                message: `Extracting files... ${pct}% (${done} / ${total})`
            });
        }
    }
});
```

**Progress phases:**
```
Preparing installation...
Downloading: 45.2MB / 221MB (20%)
Verifying integrity...
Extracting files... 42% (840 / 2000)
Installing graphics.h files...
Verifying installation...
Installation complete.
```

#### ubuntuDownloader.ts — Linux Coordinator

Responsibilities:
- Guide user through manual installation
- Verify installation status by checking file paths and running `which` commands
- Provide the installation script command

Note: This class does **not** compile or run programs. All compilation and execution is handled by `compiler.ts`. The compile/run methods that existed in earlier versions have been removed as dead code.

---

## Error Handling

### Compiler Error Parsing

**GCC error format:**
```
test.cpp:15:5: error: 'initgraph' was not declared in this scope
test.cpp:17:5: warning: unused variable 'x' [-Wunused-variable]
```

**Regex:**
```typescript
const errorRegex = /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.+)$/gm;
```

**Result:** Errors appear as red squiggles in the editor and entries in the Problems panel (`Ctrl+Shift+M`). Clicking a problem jumps to the exact line.

### Process Management

All spawned compiler processes are tracked in `activeProcesses: Set<ChildProcess>`. On `dispose()`, any surviving processes are killed and the set is cleared. This ensures no orphaned compiler processes remain when the extension is deactivated or VS Code is closed.

### Input Validation

`validateSourceFile()` uses `path.resolve()` to canonicalise the path before checking existence and extension, avoiding the unreliable `..` substring check that was fragile on Windows paths with dots in directory names.

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
npm run watch          # watch mode

npx vsce package       # produces graphics-h-compiler-x.x.x.vsix
code --install-extension graphics-h-compiler-*.vsix
```

### Debug Extension

1. Open `VScodeExtension/` in VS Code
2. Press `F5` to launch the Extension Development Host
3. Set breakpoints in TypeScript source files
4. Test commands in the debug instance
5. Check the Debug Console for logs

### Publishing

```bash
# Requires a Personal Access Token from marketplace.visualstudio.com
npx vsce publish
```

---

## Licensing

**Extension code:** MIT License

**Bundled components:**
- GCC 11.5.0: GPL v3 with runtime library exception
- MinGW-w64: ZPL 2.1
- graphics.h / winbgim.h: Public domain (WinBGIm project)
- libbgi.a: Modified BSD
- js-dos: GPL v3 (https://js-dos.com)
- DOSBox: GPL v2