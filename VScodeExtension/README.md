# Graphics.h Compiler for VS Code

**Run graphics.h programs with one click - no setup hassle**

[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/AlbatrossC/graphics-h-compiler)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Demo](https://raw.githubusercontent.com/AlbatrossC/graphics-h-compiler/test/VScodeExtension/assets/demo.gif)

> **Try it online:** [graphics.h Online Compiler](https://graphics-h-compiler.vercel.app/) - No installation required!

---

## Features

- **One-Click Compilation** - Press `Ctrl+Alt+N` or click the Run button in the status bar
- **Windows and Ubuntu Support** - Automatic toolchain installation on Windows, guided setup on Linux
- **Wine Integration** - Seamless execution of Windows executables on Linux
- **Real-time Error Detection** - Compilation errors appear in the VS Code Problems panel with inline highlights
- **Cancellable Builds** - Cancel a running compilation at any time from the progress notification
- **Zero Manual Setup** - Everything is automated after your confirmation

---

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Open any `.cpp` or `.c++` file that uses `#include <graphics.h>`
3. Press `Ctrl+Alt+N` or click **Run Graphics** in the status bar
4. Follow the one-time setup prompts

---

## Available Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Run Graphics Program | `Ctrl+Alt+N` | Compile and run the current file |
| Compile Only | `Ctrl+Alt+B` | Compile without running |
| Stop Program | `Ctrl+Alt+K` | Stop the currently running program |
| Setup Toolchain | - | Install or reinstall the graphics.h toolchain |
| Check Dependencies | - | Verify installation status |

All commands are also accessible via the Command Palette (`Ctrl+Shift+P`) under the `Graphics.h` category.

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

- [Try Online Compiler](https://graphics-h-compiler.vercel.app/) - No installation required
- [GitHub Repository](https://github.com/AlbatrossC/graphics-h-compiler) - Source code and documentation
- [Report Issues](https://github.com/AlbatrossC/graphics-h-compiler/issues) - Bug reports and feature requests
- [Ubuntu Install Script](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/compiler-assets/Installers/ubuntu_install.sh) - View what gets installed on Linux

---

**Made for students learning computer graphics**

If you find it useful, star the project on [GitHub](https://github.com/AlbatrossC/graphics-h-compiler).