# Graphics.h Compiler for VS Code

**Run `graphics.h` programs with one click — no manual setup needed.**

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/AlbatrossC/graphics-h-compiler)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Try Online](https://img.shields.io/badge/Try%20Online-No%20Install-brightgreen)](https://graphics-h-compiler.vercel.app/)

---

## 📺 Video Walkthrough

[![Watch on YouTube](https://img.youtube.com/vi/8CBJ-FWF9SU/maxresdefault.jpg)](https://www.youtube.com/watch?v=8CBJ-FWF9SU)

*Click to watch the full demo on YouTube — covers both modes, setup, and usage.*

---

## 🚀 How to Run

1. Open any `.c` or `.cpp` file that uses `#include <graphics.h>`
2. Click the **dropdown arrow** (▾) next to the ▶ Run button in the top-right corner of the editor
3. Two options will appear — pick the one that suits you

![Run Options](https://raw.githubusercontent.com/AlbatrossC/graphics-h-compiler/main/docs/images/vscode_run_options.png)

---

## 🖥️ Compilation Modes

This extension gives you two ways to compile and run `graphics.h` programs, each with its own strengths.

---

### Mode 1 — Turbo C (DOSBox)

Runs your code inside an emulated **Turbo C 3.0** environment, rendered directly in a VS Code tab. No downloads, no configuration — just open and run.

- **Nothing to install** — the Turbo C compiler, DOSBox runtime, and WASM binary are all bundled inside the extension
- **Completely isolated** — a fresh copy of the DOS environment is created in memory on every run, so there's no stale state between executions
- **Errors shown inline** — if compilation fails, an error panel appears below the DOS canvas without leaving the tab
- **Works everywhere** — Windows, Linux, and macOS, since the entire environment runs inside VS Code's built-in browser engine

![Turbo C running inside VS Code](https://raw.githubusercontent.com/AlbatrossC/graphics-h-compiler/main/docs/images/vscode_turboc_demo.png)

---

### Mode 2 — WinBGI (Native Windows)

Compiles your code using **MinGW + WinBGI** and runs it as a real native Windows executable. On Linux, it runs through Wine automatically.

- **Proper error diagnostics** — compilation errors appear in VS Code's Problems panel (`Ctrl+Shift+M`) with exact file, line, and column info — just like any modern C++ project
- **One-time toolchain setup** — the extension downloads and installs everything automatically on first use:
  - Downloads **~220 MB** from the internet
  - Extracts to **~990 MB** on disk
  - A detailed progress bar shows download %, extraction progress, and each install step in real time
- **Linux ready** — on Ubuntu/Debian, Wine is used to run the compiled `.exe` without any extra configuration from you

![WinBGI running natively on Windows](https://raw.githubusercontent.com/AlbatrossC/graphics-h-compiler/main/docs/images/vscode_windows_demo.png)

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Run Graphics (WinBGI) | `Ctrl+Alt+N` |
| Compile Only — no run | `Ctrl+Alt+B` |
| Stop Running Program | `Ctrl+Alt+K` |

All commands are also reachable via the Command Palette (`Ctrl+Shift+P`) — search for `Graphics.h`.

---

## ⚙️ Extension Settings

Open settings with `Ctrl+,` and search for `graphics-h-compiler`:

| Setting | Default | Description |
|---------|---------|-------------|
| `autoRun` | `true` | Automatically run after a successful build |
| `showOutputPanel` | `true` | Show the Output panel during compilation |
| `clearOutputBeforeCompile` | `true` | Clear the Output panel before each new build |
| `runInTerminal` | `true` | Run in the integrated terminal — **required** for programs that use `scanf` or `cin` |

---

## 🔧 First-Time Setup

### Windows

WinBGI mode will ask for your permission before downloading anything. Once confirmed, the extension handles the full setup:

- Downloads the **MinGW32 toolchain** (~220 MB)
- Extracts it to ~990 MB on disk
- Copies the `graphics.h` library files automatically
- Shows a step-by-step progress indicator throughout

Turbo C mode requires no setup at all on Windows.

### Ubuntu / Debian Linux

When you first run WinBGI mode, the extension gives you a **Copy and Open Terminal** button. Click it, paste the command with `Ctrl+Shift+V`, and press Enter. The script installs:

- `i686-w64-mingw32-g++` — the MinGW cross-compiler
- `wine` — to execute the compiled Windows binary
- `graphics.h` library files — installed to `/usr/local`

[View the full Ubuntu install script →](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/compiler-assets/Installers/ubuntu_install.sh)

### macOS

Turbo C (DOSBox) mode works on macOS out of the box. WinBGI is not supported on macOS.

---

## 🌐 No VS Code? Try the Online Compiler

You can compile and run basic `graphics.h` programs directly in your browser — no installation of any kind required.

**[→ Open the Online Compiler](https://graphics-h-compiler.vercel.app/)**

---

## 🔗 Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)
- [GitHub Repository](https://github.com/AlbatrossC/graphics-h-compiler)
- [Report an Issue](https://github.com/AlbatrossC/graphics-h-compiler/issues)
- [Ubuntu Install Script](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/compiler-assets/Installers/ubuntu_install.sh)

---

*Built for students learning computer graphics. If it helped you, drop a ⭐ on [GitHub](https://github.com/AlbatrossC/graphics-h-compiler) — it means a lot.*