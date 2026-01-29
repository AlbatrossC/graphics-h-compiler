# Graphics.h VS Code Extension - Developer Documentation

**Technical reference for developers working on the Graphics.h Compiler extension**

---

## Table of Contents

- [Installation Methods](#installation-methods)
- [Extension Structure](#extension-structure)
- [Prerequisites & Dependencies](#prerequisites--dependencies)
- [Commands & Shortcuts](#commands--shortcuts)
- [Compilation Workflow](#compilation-workflow)
- [Architecture Details](#architecture-details)
- [Error Handling](#error-handling)
- [Development Setup](#development-setup)

---

## Installation Methods

### Method 1: VS Code Marketplace (End Users)

1. Open VS Code
2. Press `Ctrl+Shift+X` (Extensions panel)
3. Search for "graphics.h compiler"
4. Click Install on extension by AlbatrossC

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
│   ├── compiler.ts           # Compilation & execution engine
│   ├── paths.ts              # OS detection, path resolution
│   ├── windowsDownloader.ts  # Windows toolchain installer
│   └── ubuntuDownloader.ts   # Linux setup coordinator
├── resources/
│   └── graphics/             # Bundled graphics files
│       ├── graphics.h        # Modified BGI header
│       ├── winbgim.h         # Windows BGI implementation
│       └── libbgi.a          # Static BGI library (i686)
├── assets/                   # Extension icons
├── dist/                     # Compiled JavaScript output
├── node_modules/             # npm dependencies
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript configuration
├── esbuild.js                # Build script
├── eslint.config.mjs         # ESLint configuration
├── .vscodeignore             # Files excluded from packaging
├── LICENSE                   # License file
└── README.md                 # Extension README
```

---

## Prerequisites & Dependencies

### Windows

#### MinGW-w64 Toolchain (Auto-Downloaded)

**Package:** GCC 11.5.0 + MinGW-w64 12.0.0 (Win32, MSVCRT, POSIX)

**Source:**  
- Original: [WinLibs](https://winlibs.com/#:~:text=GCC%2011.5.0%20%2B%20MinGW%2Dw64%2012.0.0%20(MSVCRT)%20release)
- Redistributed: https://github.com/AlbatrossC/graphics-h-compiler/releases/tag/gcc-11.5.0-mingw32

**Download Details:**
- **URL:** `https://github.com/AlbatrossC/graphics-h-compiler/releases/download/gcc-11.5.0-mingw32/mingw32.zip`
- **Compressed Size:** ~221 MB
- **Extracted Size:** ~950 MB
- **SHA256:** `72a111d72772914b6db9fe506fe4f0bb8d21b721894e2690c89aee9521fb97cd`

**Toolchain Specifications:**
- **GCC Version:** 11.5.0
- **Architecture:** Win32 (i686)
- **Runtime:** MSVCRT (Microsoft Visual C Runtime)
- **Thread Model:** POSIX
- **Exception Model:** DWARF-2
- **Linking:** Static (standalone executables)

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

**All directories are required** - do not remove any folders.

#### Graphics Libraries

**Bundled in `resources/graphics/`:**
- **`graphics.h`** - Modified BGI API (ISO C++ compatible)
- **`winbgim.h`** - Windows BGI implementation header
- **`libbgi.a`** - Static BGI library (i686 target)

**Source:** WinBGIm project (http://winbgim.codecutter.org/)

**Modifications Applied:**
The bundled `graphics.h` has been patched for ISO C++ compliance to eliminate "string constant to `char*`" warnings:

```cpp
// Original (causes warnings)
void initgraph(int *gd, int *gm, char *path);
void outtextxy(int x, int y, char *text);

// Modified (ISO C++ compliant)
void initgraph(int *gd, int *gm, const char *path);
void outtextxy(int x, int y, const char *text);
```

**Full list of modified function signatures:**
- `initgraph()` - path parameter now `const char*`
- `outtext()`, `outtextxy()` - text parameters now `const char*`
- `textheight()`, `textwidth()` - text parameters now `const char*`
- `setfillpattern()` - pattern parameter now `const char*`
- `installuserdriver()`, `installuserfont()` - name parameters now `const char*`
- `getdrivername()`, `getmodename()`, `grapherrormsg()` - return `const char*`

**Impact:**
- Eliminates all ISO C++ forbids warnings
- 100% backward compatible
- No code changes required in user programs

---

### Linux (Ubuntu/Debian)

**Manual Installation Required**

The extension does **not** auto-download on Linux. Users must run the installation script:

```bash
curl -fsSL https://raw.githubusercontent.com/AlbatrossC/graphics.h-online-compiler/main/Installers/ubuntu_install.sh | bash
```

**Script Source:**  
https://github.com/AlbatrossC/graphics-h-compiler/blob/main/Installers/ubuntu_install.sh

**What the Script Installs:**

1. **System Packages:**
   ```bash
   sudo apt update
   sudo apt install -y gcc-mingw-w64-i686 g++-mingw-w64-i686
   sudo apt install -y wine32 wine
   sudo apt install -y wget ca-certificates
   ```

2. **Graphics.h Library Files:**
   ```bash
   # Download from GitHub
   wget https://raw.githubusercontent.com/.../graphics.h
   wget https://raw.githubusercontent.com/.../winbgim.h
   wget https://raw.githubusercontent.com/.../libbgi.a
   
   # Install to system directories
   sudo mkdir -p /usr/local/include/graphics_h
   sudo mkdir -p /usr/local/lib/graphics_h
   
   sudo cp graphics.h winbgim.h /usr/local/include/graphics_h/
   sudo cp libbgi.a /usr/local/lib/graphics_h/
   ```

3. **Apply ISO C++ Patches:**
   ```bash
   # Patch graphics.h for const-correctness
   sudo sed -i 's/char \*pathtodriver/const char *pathtodriver/g' \
       /usr/local/include/graphics_h/graphics.h
   
   sudo sed -i 's/void outtext(char \*textstring)/void outtext(const char *textstring)/g' \
       /usr/local/include/graphics_h/graphics.h
   
   # ... (additional patches applied in-place)
   ```

**Key Difference from Windows:**
- **Windows:** Extension packages pre-modified `graphics.h`
- **Linux:** Pure `graphics.h` downloaded, then patched by install script

**Installed Locations:**
```
/usr/local/include/graphics_h/
├── graphics.h    # Patched for ISO C++
└── winbgim.h

/usr/local/lib/graphics_h/
└── libbgi.a

System packages (via apt):
- /usr/bin/i686-w64-mingw32-g++
- /usr/bin/wine
```

---

## Commands & Shortcuts

### Registered Commands

| Command ID | Description | Default Shortcut |
|-----------|-------------|------------------|
| `graphics-h-compiler.compileAndRun` | Compile and run current file | `Ctrl+Alt+N` |
| `graphics-h-compiler.compileOnly` | Compile without running | *(none)* |
| `graphics-h-compiler.setupToolchain` | Install/reinstall toolchain | *(none)* |
| `graphics-h-compiler.stopProgram` | Stop running program | `Ctrl+Shift+F5` |
| `graphics-h-compiler.checkDependencies` | Verify installation | *(none)* |

### Context Menu

- Right-click in C++ editor → **"Compile and Run Graphics.h"**

### Status Bar Button

- **Icon:** `$(play)` / `$(debug-stop)`
- **Text:** "Run Graphics" / "Stop Graphics"
- **Visibility:** Only shown in C++ files
- **Click Action:** Compile & Run / Stop Program

### Command Palette Access

All commands available via `Ctrl+Shift+P`:
```
Graphics.h: Compile and Run
Graphics.h: Compile Only
Graphics.h: Setup Graphics.h Toolchain
Graphics.h: Stop Program
Graphics.h: Check Dependencies
```

---

## Compilation Workflow

### Windows Compilation

#### Command Template

```bash
g++.exe <source> \
  -I <include_path> \
  -L <lib_path> \
  -lbgi -lgdi32 -lcomdlg32 -luuid -loleaut32 -lole32 \
  -static-libgcc -static-libstdc++ -static \
  -o <output.exe>
```

#### Actual Implementation (compiler.ts)

```typescript
const args = [
  sourceFile,                          // e.g., test.cpp
  '-I', graphicsPath,                  // {globalStorage}/mingw32/include
  '-L', libraryPath,                   // {globalStorage}/mingw32/lib
  '-lbgi',                             // Graphics primitives
  '-lgdi32', '-lcomdlg32', '-luuid',   // Windows GDI/COM
  '-loleaut32', '-lole32',
  '-static-libgcc',                    // Link libgcc statically
  '-static-libstdc++',                 // Link libstdc++ statically
  '-static',                           // Create standalone executable
  '-o', outputPath                     // e.g., test.exe
];

const command = gppPath;  // {globalStorage}/mingw32/bin/g++.exe

const compilerProcess = spawn(command, args, {
  cwd: path.dirname(sourceFile)
});
```

#### Linked Libraries Explained

| Library | Purpose |
|---------|---------|
| `libbgi.a` | BGI graphics primitives (circle, line, rectangle, etc.) |
| `gdi32` | Windows GDI for rendering to screen |
| `comdlg32` | Common dialogs (file open, color picker) |
| `uuid` | UUID/GUID generation |
| `oleaut32` | OLE Automation support |
| `ole32` | Component Object Model (COM) infrastructure |

**Static Linking Flags:**
- `-static-libgcc` - Embed GCC runtime (no libgcc_s dependency)
- `-static-libstdc++` - Embed C++ standard library
- `-static` - Link all libraries statically (standalone .exe)

**Result:** Self-contained executable with no external DLL dependencies.

---

### Linux Compilation

#### Command Template

```bash
i686-w64-mingw32-g++ <source> \
  -I /usr/local/include/graphics_h \
  -L /usr/local/lib/graphics_h \
  -lbgi -lgdi32 -lcomdlg32 -luuid -loleaut32 -lole32 \
  -static-libgcc -static-libstdc++ -static \
  -o <output.exe>
```

#### Actual Implementation (compiler.ts)

```typescript
const compileCmd = `i686-w64-mingw32-g++ "${sourceFile}" ` +
  `-I /usr/local/include/graphics_h ` +
  `-L /usr/local/lib/graphics_h ` +
  `-lbgi -lgdi32 -lcomdlg32 -luuid -loleaut32 -lole32 ` +
  `-static-libgcc -static-libstdc++ -static ` +
  `-o "${outputPath}"`;

const compilerProcess = spawn('bash', ['-c', compileCmd], {
  cwd: path.dirname(sourceFile)
});
```

**Note:** Uses system-wide MinGW cross-compiler (`i686-w64-mingw32-g++`), not a bundled compiler.

#### Wine Execution

```bash
wine test.exe
```

**Implementation:**

```typescript
const runCmd = `wine "${exePath}"`;

const programProcess = spawn('bash', ['-c', runCmd], {
  cwd: path.dirname(exePath)
});
```

#### Wine Output Filtering

Wine generates debug messages that clutter the output. The extension filters these:

```typescript
programProcess.stderr.on('data', (data) => {
  const output = data.toString();
  
  // Ignore Wine debug/info messages
  if (!output.includes('fixme:') && !output.includes('wine:')) {
    this.outputChannel.append(`[Program Error] ${output}`);
  }
});
```

**Filtered patterns:**
- `fixme:` - Wine unimplemented features
- `wine:` - Wine diagnostic messages

**Result:** Clean output showing only actual program errors.

---

## Architecture Details

### Module Breakdown

#### 1. extension.ts - Entry Point

**Responsibilities:**
- Register commands and keyboard shortcuts
- Manage extension lifecycle (activate/deactivate)
- Initialize OS-specific downloaders
- Coordinate UI updates (status bar, notifications)
- Handle user interactions

**Key Functions:**

```typescript
export function activate(context: vscode.ExtensionContext)
- Initialize PathManager, downloaders, compiler
- Detect OS and show unsupported OS error if needed
- Register all commands
- Create status bar item
- Check dependencies quietly

showWelcomeMessage(context)
- Display on first activation
- Offer dependency check

updateStatusBar(editor)
- Show/hide based on file type
- Change icon/text based on program state

waitForToolchain()
- Check if toolchain installed
- Prompt for installation if missing
- Handle both Windows and Linux flows

handleCompileAndRun()
- Ensure toolchain ready
- Validate file type
- Auto-save dirty files
- Call compiler.compileAndRun()

handleStopProgram()
- Stop running graphics program
- Update UI state
```

---

#### 2. compiler.ts - Compilation Engine

**Responsibilities:**
- Source file validation
- Platform-specific compilation
- Error parsing and diagnostic creation
- Process management (spawn, monitor, kill)
- Output formatting and display

**Key Classes/Methods:**

```typescript
class GraphicsCompiler {
  private pathManager: PathManager
  private outputChannel: vscode.OutputChannel
  private activeProcesses: Set<ChildProcess>
  private diagnosticCollection: vscode.DiagnosticCollection
  private runningProgram: ChildProcess | null
  
  validateSourceFile(source: string): boolean
  - Path traversal check (reject paths with '..')
  - File existence verification
  - Extension validation (.cpp or .c++)
  
  parseCompilerErrors(stderr: string): CompilationError[]
  - Regex: /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.+)$/gm
  - Extract file, line, column, severity, message
  
  updateDiagnostics(errors: CompilationError[], source: string)
  - Convert to vscode.Diagnostic objects
  - Set in diagnostic collection (shows in Problems panel)
  
  compileWindows(source: string, token?: CancellationToken): Promise<string|null>
  - Spawn g++.exe with graphics.h includes/libs
  - Stream stderr/stdout to output panel
  - Parse errors on failure
  - Return executable path on success
  
  compileLinux(source: string, token?: CancellationToken): Promise<string|null>
  - Spawn i686-w64-mingw32-g++ via bash
  - Same error handling as Windows
  
  runWindows(exePath: string): Promise<void>
  - Spawn executable directly
  - Capture stdout/stderr
  - Report exit code
  
  runLinux(exePath: string): Promise<void>
  - Spawn via `wine <exe>`
  - Filter Wine debug messages
  - Report exit code
  
  stopRunningProgram(): boolean
  - Kill active program process
  - Clear runningProgram reference
  
  dispose()
  - Clean up diagnostics, output channel
  - Kill all active processes
}
```

**Compilation Flow:**

```
User triggers compile
        ↓
validateSourceFile()
   ├─ Path traversal check
   ├─ File existence check
   └─ Extension check (.cpp/.c++)
        ↓
clearDiagnostics()
        ↓
OS detection (Windows / Linux)
        ↓
   ┌────────────┴────────────┐
   ↓                         ↓
compileWindows()      compileLinux()
   ↓                         ↓
spawn(g++.exe)       spawn(i686-w64-mingw32-g++)
   ↓                         ↓
Stream stderr → output panel
   ↓                         ↓
Exit code check
   ↓                         ↓
   ├─ Code 0: Success       ├─ Code 0: Success
   │  └─ Return exe path    │  └─ Return exe path
   │                        │
   └─ Code ≠ 0: Failure     └─ Code ≠ 0: Failure
      ↓                        ↓
   parseCompilerErrors()    parseCompilerErrors()
      ↓                        ↓
   updateDiagnostics()      updateDiagnostics()
      ↓                        ↓
   Show error notification
      ↓
   Return null
```

---

#### 3. paths.ts - Path Management

**Responsibilities:**
- OS detection (Windows / Linux / Unknown)
- Toolchain path resolution
- Dependency checking
- Output path generation

**Key Methods:**

```typescript
class PathManager {
  constructor(context: vscode.ExtensionContext)
  
  detectOS(): OperatingSystem
  - Check process.platform
  - Return Windows | Linux | Unknown
  
  getToolchainPath(): string
  - Windows: {globalStorageUri}/mingw32
  - Linux: /usr/local
  
  getGppPath(): string
  - Windows: {toolchain}/bin/g++.exe
  - Linux: i686-w64-mingw32-g++ (system command)
  
  getGraphicsPath(): string
  - Windows: {toolchain}/include
  - Linux: /usr/local/include/graphics_h
  
  getLibraryPath(): string
  - Windows: {toolchain}/lib
  - Linux: /usr/local/lib/graphics_h
  
  isToolchainInstalled(): boolean
  - Windows: Check if g++.exe exists
  - Linux: Check if all graphics files exist
  
  getMissingDependencies(): string[]
  - Return list of missing components
}
```

**Example Paths (Windows):**

```
Extension path: C:\Users\{user}\AppData\Local\Programs\Microsoft VS Code\...
Global storage: C:\Users\{user}\AppData\Roaming\Code\User\globalStorage\albatrossc.graphics-h-compiler
Toolchain:      {globalStorage}\mingw32
G++ compiler:   {globalStorage}\mingw32\bin\g++.exe
Headers:        {globalStorage}\mingw32\include
Libraries:      {globalStorage}\mingw32\lib
```

---

#### 4. windowsDownloader.ts - Windows Installer

**Responsibilities:**
- Download MinGW32 toolchain from GitHub
- Verify SHA256 checksum
- Extract ZIP archive
- Copy bundled graphics files to MinGW directories
- Verify installation success

**Key Methods:**

```typescript
class WindowsDownloader {
  private isDownloading: boolean
  private downloadPromise: Promise<boolean> | null
  
  private readonly MINGW_CONFIG = {
    url: 'https://github.com/AlbatrossC/graphics-h-compiler/releases/download/gcc-11.5.0-mingw32/mingw32.zip',
    sha256: '72a111d72772914b6db9fe506fe4f0bb8d21b721894e2690c89aee9521fb97cd'
  }
  
  promptForPermission(): Promise<boolean>
  - Show modal dialog asking user permission
  - Display download size (221MB) and disk space (950MB)
  
  download(targetPath: string, extensionPath: string): Promise<boolean>
  - Main download workflow
  - Uses vscode.window.withProgress for UI feedback
  
  private downloadFromUrl(url, tempZip, progress)
  - HTTP download using node-fetch
  - Stream to disk with progress reporting
  - Verify SHA256 checksum
  
  private streamToDisk(response, filePath, progress, totalSize)
  - Memory-efficient streaming
  - Progress updates every 5%
  
  private verifyDownload(filePath, expectedHash)
  - Calculate SHA256 of downloaded file
  - Compare with expected hash
  
  private copyBundledGraphicsFiles(mingwPath, extensionPath, progress)
  - Copy resources/graphics/* to mingw32/include and lib
  - Files: graphics.h, winbgim.h, libbgi.a
}
```

**Download Pipeline:**

```
User triggers setup (or first compile)
        ↓
promptForPermission()
   └─ Show modal: "~221MB download, ~950MB space"
        ↓
User clicks "Download"
        ↓
download(targetPath, extensionPath)
        ↓
Create {globalStorage}/mingw32 directory
        ↓
downloadFromUrl()
   ├─ fetch(MINGW_CONFIG.url)
   ├─ streamToDisk() → mingw32_temp.zip
   └─ verifyDownload() → SHA256 check
        ↓
Extract ZIP (AdmZip)
   └─ Extract to {globalStorage}/
        ↓
Delete mingw32_temp.zip
        ↓
copyBundledGraphicsFiles()
   ├─ Copy graphics.h → mingw32/include/
   ├─ Copy winbgim.h → mingw32/include/
   └─ Copy libbgi.a → mingw32/lib/
        ↓
Verify g++.exe exists
        ↓
Show success notification
```

**Progress Reporting:**

```typescript
vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: "Graphics.h Toolchain Setup (Windows)",
  cancellable: false
}, async (progress) => {
  progress.report({ message: "Preparing...", increment: 5 });
  progress.report({ message: "Downloading: 45.2MB / 221MB (20%)", increment: 5 });
  progress.report({ message: "Verifying integrity...", increment: 5 });
  progress.report({ message: "Extracting...", increment: 30 });
  progress.report({ message: "Installing graphics.h files...", increment: 5 });
  progress.report({ message: "Complete!", increment: 5 });
});
```

---

#### 5. ubuntuDownloader.ts - Linux Coordinator

**Responsibilities:**
- Guide user through manual installation
- Verify installation status
- Provide installation script command
- Check for missing dependencies

**Key Methods:**

```typescript
class UbuntuDownloader {
  private readonly INSTALL_COMMAND = 
    'curl -fsSL https://raw.githubusercontent.com/AlbatrossC/graphics.h-online-compiler/main/Installers/ubuntu_install.sh | bash'
  
  promptForInstallation(): Promise<boolean>
  - Show modal with install command
  - "Copy & Open Terminal" button
  - Copy command to clipboard
  - Open integrated terminal
  
  checkInstallation(): Promise<boolean>
  - Check if graphics files exist
  - Check if i686-w64-mingw32-g++ exists
  - Check if wine exists
  
  private runCommand(command: string)
  - Spawn bash process
  - Return { success, output, error }
  
  getInstallationStatus(): Promise<{ installed, missing[] }>
  - Detailed check of all components
  - Return list of missing dependencies
  
  showDetailedStatus()
  - Display installation state
  - Show missing components if incomplete
}
```

**Installation Flow (Linux):**

```
User triggers setup (or first compile)
        ↓
checkInstallation()
   └─ Return false (not installed)
        ↓
promptForInstallation()
        ↓
Show modal with command
        ↓
User clicks "Copy & Open Terminal"
        ↓
await vscode.env.clipboard.writeText(INSTALL_COMMAND)
        ↓
await vscode.commands.executeCommand('workbench.action.terminal.new')
        ↓
Show notification: "Paste (Ctrl+Shift+V) and press Enter"
        ↓
User pastes and runs script in terminal
        ↓
Script installs packages and downloads files
        ↓
User clicks "I Already Installed"
        ↓
checkInstallation() → true
        ↓
Show success notification
```

---

## Error Handling

### Compiler Error Parsing

**GCC Error Format:**
```
test.cpp:15:5: error: 'initgraph' was not declared in this scope
   15 |     initgraph(&gd, &gm, "");
      |     ^~~~~~~~~
test.cpp:17:5: warning: unused variable 'x' [-Wunused-variable]
   17 |     int x = 10;
      |         ^
```

**Regex Pattern:**
```typescript
const errorRegex = /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.+)$/gm;
```

**Parsed Structure:**
```typescript
interface CompilationError {
  file: string;      // "test.cpp"
  line: number;      // 15
  column: number;    // 5
  severity: 'error' | 'warning';
  message: string;   // "'initgraph' was not declared in this scope"
}
```

**Conversion to VS Code Diagnostics:**

```typescript
const diagnostic = new vscode.Diagnostic(
  new vscode.Range(
    new vscode.Position(line - 1, column - 1),  // Convert to 0-indexed
    new vscode.Position(line - 1, column + 100)  // Highlight ~100 chars
  ),
  message,
  severity === 'error' 
    ? vscode.DiagnosticSeverity.Error 
    : vscode.DiagnosticSeverity.Warning
);

diagnostic.source = 'graphics-h-compiler';

diagnosticCollection.set(uri, diagnostics);
```

**Result:**
- Errors appear in Problems panel (Ctrl+Shift+M)
- Red squiggly underlines in editor
- Hover shows error message
- Click to jump to error location

---

### Process Management

**Tracking Active Processes:**

```typescript
private activeProcesses: Set<ChildProcess> = new Set();

// Add on spawn
const proc = spawn(command, args);
this.activeProcesses.add(proc);

// Remove on close
proc.on('close', (code) => {
  this.activeProcesses.delete(proc);
});

// Cleanup on dispose
dispose() {
  this.activeProcesses.forEach(proc => {
    if (!proc.killed) {
      proc.kill();
    }
  });
  this.activeProcesses.clear();
}
```

**Cancellation Token Support:**

```typescript
async compile(sourceFile: string, token?: vscode.CancellationToken) {
  const proc = spawn(compiler, args);
  
  token?.onCancellationRequested(() => {
    if (!proc.killed) {
      proc.kill();
      this.outputChannel.appendLine('[graphics-h] Compilation cancelled');
    }
  });
}
```

---

### Input Validation

**Security Checks (compiler.ts):**

```typescript
private validateSourceFile(sourceFile: string): boolean {
  const normalized = path.normalize(sourceFile);
  
  // 1. Path traversal attack prevention
  if (normalized.includes('..')) {
    vscode.window.showErrorMessage('Path traversal detected');
    return false;
  }
  
  // 2. File existence
  if (!fs.existsSync(normalized)) {
    vscode.window.showErrorMessage('Source file does not exist');
    return false;
  }
  
  // 3. Regular file check (not directory/symlink)
  const stats = fs.statSync(normalized);
  if (!stats.isFile()) {
    vscode.window.showErrorMessage('Path is not a file');
    return false;
  }
  
  // 4. Extension validation
  if (!normalized.endsWith('.cpp') && !normalized.endsWith('.c++')) {
    vscode.window.showErrorMessage('File must be C++ (.cpp or .c++)');
    return false;
  }
  
  return true;
}
```

---

## Development Setup

### Prerequisites

```bash
Node.js >= 16.x
npm >= 8.x
VS Code >= 1.75.0
```

### Clone and Build

```bash
# Clone repository
git clone https://github.com/AlbatrossC/graphics-h-compiler.git

# Navigate to extension directory
cd graphics-h-compiler/VScodeExtension

# Install dependencies
npm install

# Compile TypeScript → JavaScript
npm run compile

# Watch mode (auto-recompile on save)
npm run watch

# Package extension
npx vsce package

# Install locally for testing
code --install-extension graphics-h-compiler-*.vsix
```

### Build Configuration

**esbuild.js:**
```javascript
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  minify: false
});
```

### Dependencies

**package.json:**
```json
{
  "dependencies": {
    "node-fetch": "^2.6.7",    // HTTP downloads
    "adm-zip": "^0.5.10"       // ZIP extraction
  },
  "devDependencies": {
    "@types/node": "^18.x",
    "@types/vscode": "^1.75.0",
    "@types/node-fetch": "^2.6.2",
    "@types/adm-zip": "^0.5.0",
    "typescript": "^5.0.0",
    "@vscode/vsce": "^2.19.0",  // Extension packager
    "esbuild": "^0.17.0",
    "eslint": "^8.0.0"
  }
}
```

### Debug Extension

**Launch VS Code debugger:**

1. Open `VScodeExtension/` folder in VS Code
2. Press `F5` → launches Extension Development Host
3. Set breakpoints in TypeScript files
4. Test commands in debug instance
5. Check Debug Console for logs

**.vscode/launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

---

## Extension Manifest

**package.json (key sections):**

```json
{
  "name": "graphics-h-compiler",
  "displayName": "Graphics.h Compiler",
  "description": "Compile and run graphics.h programs on Windows and Linux",
  "version": "1.0.4",
  "publisher": "AlbatrossC",
  "engines": {
    "vscode": "^1.75.0"
  },
  "categories": ["Programming Languages", "Debuggers"],
  "activationEvents": [],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "graphics-h-compiler.compileAndRun",
        "title": "Graphics.h: Compile and Run",
        "icon": "$(play)"
      },
      {
        "command": "graphics-h-compiler.stopProgram",
        "title": "Graphics.h: Stop Program",
        "icon": "$(debug-stop)"
      }
    ],
    "keybindings": [
      {
        "command": "graphics-h-compiler.compileAndRun",
        "key": "ctrl+alt+n",
        "when": "editorTextFocus && editorLangId == cpp"
      },
      {
        "command": "graphics-h-compiler.stopProgram",
        "key": "ctrl+shift+f5",
        "when": "editorTextFocus"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "command": "graphics-h-compiler.compileAndRun",
          "when": "resourceExtname == .cpp || resourceExtname == .c++",
          "group": "navigation"
        }
      ],
      "editor/title": [
        {
          "command": "graphics-h-compiler.compileAndRun",
          "when": "resourceExtname == .cpp || resourceExtname == .c++",
          "group": "navigation"
        }
      ]
    },
    "configuration": {
      "title": "Graphics.h Compiler",
      "properties": {
        "graphics-h-compiler.autoRun": {
          "type": "boolean",
          "default": true,
          "description": "Automatically run program after successful compilation"
        },
        "graphics-h-compiler.showOutputPanel": {
          "type": "boolean",
          "default": true,
          "description": "Show output panel during compilation"
        },
        "graphics-h-compiler.clearOutputBeforeCompile": {
          "type": "boolean",
          "default": true,
          "description": "Clear output panel before each compilation"
        },
        "graphics-h-compiler.runInTerminal": {
          "type": "boolean",
          "default": true,
          "description": "Run program in Integrated Terminal (required for user input/scanf/cin)"
        }
      }
    }
  }
}
```

---

## Additional Notes

### Licensing

**Extension Code:** MIT License

**Bundled Components:**
- GCC 11.5.0: GPL v3 with runtime library exception
- MinGW-w64: ZPL 2.1
- graphics.h/winbgim.h: Public domain (WinBGIm project)
- libbgi.a: Modified BSD

**Compliance:**
- Source code available at upstream URLs
- No GPL code modifications
- Binary redistribution permitted
- License notices included

### Licensing

**Extension Code:** MIT License