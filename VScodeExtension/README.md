# Graphics.h Compiler for VS Code

**Run graphics.h programs with one click - no setup hassle**

[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/AlbatrossC/graphics-h-compiler)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Demo](https://raw.githubusercontent.com/AlbatrossC/graphics-h-compiler/test/VScodeExtension/assets/demo.gif)

> **Try it online:** [graphics.h Online Compiler](https://graphics-h-compiler.vercel.app/) - No installation required!

---

## Features

- **Two Compilation Modes** — Choose between **Turbo C (DOSBox)** for authentic DOS graphics or **WinBGI** for native Windows execution
- **Turbo C in a Webview** — Compile and run graphics.h programs inside a DOSBox emulator rendered directly in a VS Code tab — no external window needed
- **Fresh DOS Environment Every Run** — A clean, patched ZIP is created in memory for every execution, guaranteeing no stale state
- **One-Click Compilation** — Press `Ctrl+Alt+N` or click the Run button in the status bar
- **Windows and Ubuntu Support** — Automatic toolchain installation on Windows, guided setup on Linux
- **Wine Integration** — Seamless execution of Windows executables on Linux
- **Real-time Error Detection** — Compilation errors appear in the VS Code Problems panel (WinBGI) or in an inline error panel below the DOS canvas (Turbo C)
- **Cancellable Builds** — Cancel a running compilation at any time from the progress notification
- **Zero Manual Setup** — Everything is automated after your confirmation

---

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Open any `.cpp` or `.c++` file that uses `#include <graphics.h>`
3. Right-click the editor title bar or open the Command Palette (`Ctrl+Shift+P`)
4. Choose **Run Graphics (Turbo C)** to run inside DOSBox, or **Run Graphics (WinBGI)** for native execution
5. For WinBGI, follow the one-time toolchain setup prompts

---

## Available Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Run Graphics (Turbo C) | — | Compile and run inside DOSBox in a VS Code Webview |
| Run Graphics (WinBGI) | `Ctrl+Alt+N` | Compile and run natively using MinGW + WinBGI |
| Compile Only | `Ctrl+Alt+B` | Compile without running (WinBGI) |
| Stop Program | `Ctrl+Alt+K` | Stop the currently running program (WinBGI) |
| Setup Toolchain | — | Install or reinstall the WinBGI toolchain |
| Check Dependencies | — | Verify installation status |

All commands are also accessible via the Command Palette (`Ctrl+Shift+P`) under the `Graphics.h` category.

---

## Compilation Modes

### Turbo C (DOSBox) Mode

Runs your graphics.h code inside an emulated Turbo C 3.0 environment via DOSBox, rendered directly inside a VS Code Webview tab.

- **No external toolchain required** — the Turbo C compiler, js-dos runtime, and DOSBox WASM binary are bundled with the extension
- **Fresh ZIP per run** — every execution creates a new in-memory copy of the Turbo C bundle with your source code injected, ensuring a clean DOS environment
- **DOS canvas output** — only the DOSBox canvas is shown; if compilation fails, an error panel appears below the canvas
- Works on **all platforms** (Windows, Linux, macOS) since it runs entirely in the browser engine

### WinBGI (Native) Mode

Compiles your code with MinGW + WinBGI and runs the resulting `.exe` natively (or via Wine on Linux).

- Requires MinGW32 toolchain (auto-downloaded on first use on Windows)
- Produces a native Windows executable
- Errors are parsed and shown as VS Code diagnostics in the Problems panel

---

## Supported Platforms

| Platform | Status |
|----------|--------|
| Windows 10 / 11 | Supported |
| Ubuntu / Debian Linux | Supported |
| macOS | Not Supported |

---

## Installation Details

### Windows

On first use, the extension will ask permission to download the toolchain:

- **MinGW32 toolchain** (~220 MB download, ~950 MB disk space)
- **graphics.h library files** (bundled with the extension, copied automatically)

The download includes a progress indicator showing download percentage, extraction progress, and each installation step so you always know what is happening.

### Ubuntu / Linux

The extension will prompt you to run an installation script that installs:

- **MinGW cross-compiler** (`i686-w64-mingw32-g++`)
- **Wine** (for running the compiled Windows executable on Linux)
- **graphics.h library files** (installed to `/usr/local`)

The extension provides a **Copy and Open Terminal** button that copies the command to your clipboard and opens a terminal. Paste with `Ctrl+Shift+V` and press Enter.

[View the Ubuntu installation script](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/compiler-assets/Installers/ubuntu_install.sh)

---

## Configuration

Open settings with `Ctrl+,` and search for `graphics-h-compiler`:

| Setting | Default | Description |
|---------|---------|-------------|
| `autoRun` | `true` | Automatically run the program after a successful build |
| `showOutputPanel` | `true` | Show the Output panel during compilation |
| `clearOutputBeforeCompile` | `true` | Clear the Output panel before each new build |
| `runInTerminal` | `true` | Run the program in the integrated terminal (recommended — required for programs that use `scanf` or `cin`) |

---

## Links

- [Try Online Compiler](https://graphics-h-compiler.vercel.app/) — No installation required
- [GitHub Repository](https://github.com/AlbatrossC/graphics-h-compiler) — Source code and documentation
- [Report Issues](https://github.com/AlbatrossC/graphics-h-compiler/issues) — Bug reports and feature requests
- [Ubuntu Install Script](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/compiler-assets/Installers/ubuntu_install.sh) — View what gets installed on Linux

---

**Made for students learning computer graphics**

If you find it useful, star the project on [GitHub](https://github.com/AlbatrossC/graphics-h-compiler).