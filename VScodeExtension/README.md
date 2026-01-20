# Graphics.h Compiler for VS Code

**Run graphics.h programs with one click - no setup hassle**

[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/AlbatrossC/graphics-h-compiler)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Demo](assets/demo.gif)

> **Try it online:** [graphics.h Online Compiler](https://graphics-h-compiler.vercel.app//) - No installation required!

---

## Features

- **One-Click Compilation** - Press `Ctrl+Alt+N` or click the Run button
- **Windows & Ubuntu Support** - Automatic toolchain installation with user permission
- **Wine Integration** - Seamless execution of Windows executables on Linux
- **Real-time Error Detection** - Compilation errors appear in VS Code Problems panel
- **Zero Manual Setup** - Everything is automated after your confirmation

---

## Quick Start

1. Install the extension from the VS Code Marketplace
2. Open any `.cpp` file that includes `#include <graphics.h>`
3. Press `Ctrl+Alt+N` or click the **"Run Graphics"** button in the status bar
4. Follow the automatic setup prompts (first time only)

---

## Available Commands

| Command | Keyboard Shortcut | Description |
|---------|-------------------|-------------|
| **Run Graphics Program** | `Ctrl+Alt+N` | Compile and run the current file |
| **Compile Only** | `Ctrl+Alt+B` | Compile without running |
| **Stop Program** | `Ctrl+Alt+K` | Stop the currently running program |
| **Setup Toolchain** | - | Install or reinstall the graphics.h toolchain |
| **Check Dependencies** | - | Verify installation status |

---

## Supported Platforms

| Platform | Status |
|----------|--------|
| Windows 10/11 | Supported |
| Ubuntu/Debian Linux | Supported |
| macOS | Not Supported |

---

## Installation Details

### What Gets Installed on Windows

- **MinGW32 toolchain** (~220MB download, ~770MB disk space)
- **graphics.h library files** (bundled with extension, copied automatically)

### What Gets Installed on Ubuntu

The extension will prompt you to run an installation script that installs:

- **MinGW cross-compiler** (`i686-w64-mingw32-g++`)
- **Wine** (for running Windows executables on Linux)
- **graphics.h library files** (installed to `/usr/local`)

**Note:** Ubuntu installation requires running a command in the terminal. The extension provides a "Copy & Open Terminal" button for convenience.

[View the Ubuntu installation script](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/Installers/ubuntu_install.sh)

---

## Configuration

Access settings via `Ctrl+,` and search for **"graphics-h-compiler"**:

| Setting | Default | Description |
|---------|---------|-------------|
| `graphics-h-compiler.autoRun` | `true` | Automatically run program after successful compilation |
| `graphics-h-compiler.showOutputPanel` | `true` | Show output panel during compilation |
| `graphics-h-compiler.clearOutputBeforeCompile` | `true` | Clear output panel before each compilation |

---

## Links

- **[Try Online Compiler](https://graphics-h-compiler.vercel.app//)** - No installation required
- **[GitHub Repository](https://github.com/AlbatrossC/graphics-h-compiler)** - Source code and documentation
- **[Report Issues](https://github.com/AlbatrossC/graphics-h-compiler/issues)** - Bug reports and feature requests
- **[Ubuntu Install Script](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/Installers/ubuntu_install.sh)** - View what gets installed

---

**Made for students learning computer graphics**

Star the project on [GitHub](https://github.com/AlbatrossC/graphics-h-compiler) if you find it useful!