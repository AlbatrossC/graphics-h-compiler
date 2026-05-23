<div align="center">

<br>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=700&size=38&pause=2000&color=4ade80&center=true&vCenter=true&width=700&lines=graphics.h+Compiler" alt="graphics.h Compiler" />

<br>

<p>Run Turbo C++ graphics programs modernly in your browser or VS Code — with zero setup, no DOSBox configuration, and no complicated installers.</p>

<br>

<a href="https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler"><img src="./images/btn_vscode.svg" width="220" height="52" alt="VS Code Extension" /></a>&nbsp;&nbsp;&nbsp;<a href="https://graphics-h-compiler.vercel.app/compiler"><img src="./images/btn_compiler.svg" width="200" height="52" alt="Online Compiler" /></a>

<br><br>

</div>

---

## 📖 Introduction

`graphics.h` is a DOS-era C/C++ graphics library from Borland Turbo C++ (circa 1992). While decades old, it remains a mandatory part of the computer science curriculum for hundreds of thousands of engineering students across various universities (including SPPU, Mumbai University, GTU, and others).

Historically, getting `graphics.h` to run on modern operating systems has been a frustrating experience:
1. Hunting down old, potentially unsafe Turbo C++ installers.
2. Installing DOSBox and manually editing configuration files to mount directories.
3. Troubleshooting compilation and link errors instead of learning programming.

**This project solves these issues entirely.** By compiling the original `TCC.EXE` (Turbo C++ 3.0) and running DOSBox client-side using WebAssembly, you can write, compile, and run `graphics.h` programs completely inside your browser or directly within VS Code. No local setup is required.

---

## 🌐 Online Compiler

A modern, interactive development environment in your browser.

<div align="center">

### Write Code → Click Run → See Output

<img src="./images/online-demo-1.png" width="80%" alt="Online compiler editor and graphics output" />

*CodeMirror 6 editor with C++ syntax highlighting, autocomplete, and inline documentation for all 99 `graphics.h` functions.*

</div>

<br>

<div align="center">

### Save Your Work to the Cloud

<img src="./images/online-demo-2.png" width="80%" alt="Cloud file storage with Google Sign-In" />

*Sign in with Google to organize your programs into folders and sync your files across devices.*

</div>

<br>

<details>
<summary><b>📋 Features at a glance — click to expand</b></summary>

<br>

| Feature | Details |
| :--- | :--- |
| **Genuine Turbo C++ 3.0** | Runs `TCC.EXE` within DOSBox WebAssembly for exact, lab-compatible output. |
| **Full API Support** | Supports all 99 functions (e.g., `initgraph`, `circle`, `arc`, `bar3d`, `floodfill`, and fonts). |
| **Smart Code Editor** | Includes autocomplete, parameter hints, syntax highlighting, and hover documentation. |
| **Cloud Sync** | Sync files and directories to the cloud using Google Sign-In. |
| **PWA & Offline Mode** | Assets are cached after the first visit, letting you compile and run code offline. |
| **Standalone Version** | Download a [single unified HTML file](../compiler-assets/unified/graphic.h-compiler-unified.html) (~8 MB) to run the compiler offline without a server. |

</details>

<br>

> 💡 **Need something portable?** The [standalone unified build](../compiler-assets/unified/graphic.h-compiler-unified.html) is a single self-contained HTML file. Download it once, run it forever — no internet required. [Technical breakdown →](../compiler-assets/unified/graphic.h-compiler-unified.md)

---

## 🔌 VS Code Extension

Run C++ graphics programs directly inside your editor with two powerful compilation modes.

<br>

<div align="center">

### Mode 1: Turbo C++ (DOSBox Webview)
**Best for university assignments requiring exact Turbo C++ outputs.**

<img src="./images/vscode_turboc_demo.png" width="80%" alt="VS Code Turbo C++ Mode" />

*Compiles using Turbo C++ 3.0 in an integrated webview panel. Output is pixel-perfect DOS graphics matching university lab systems.*

</div>

<br>

<div align="center">

### Mode 2: WinBGI (Native Windows App)
**Best for fast, modern development without the overhead of DOS emulation.**

<img src="./images/vscode_windows_demo.png" width="80%" alt="VS Code WinBGI Native Mode" />

*Compiles code via MinGW-w64 (GCC 11.5.0) to a native executable with a real Win32 graphics window. The toolchain downloads and configures itself automatically on first use.*

</div>

<br>

<details>
<summary><b>📋 Features at a glance — click to expand</b></summary>

<br>

| Feature | Details |
| :--- | :--- |
| **Dual Compilation** | Switch easily between Turbo C++ (DOSBox) and WinBGI (Native Windows). |
| **Automated Setup** | Automatically installs and configures MinGW-w64 toolchain on Windows. |
| **Keyboard Shortcut** | Compile and run instantly by pressing `Ctrl + Alt + N`. |
| **Error Diagnostics** | Displays GCC error highlights directly in your code and the Problems panel. |
| **Cross-Platform** | Native Windows support, macOS support in Turbo C mode, and Linux support via Wine. |
| **Status Bar Controls** | Run and stop programs with convenient controls in the VS Code status bar. |

</details>

<br>

**Install from terminal:**

```bash
code --install-extension AlbatrossC.graphics-h-compiler
```

Or: `Ctrl+Shift+X` → search **"graphics.h compiler"** → **Install**.

---

## 💻 Code Example

Copy this example, paste it into the [online compiler](https://graphics-h-compiler.vercel.app/compiler), and run it:

```c
#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");

    // Draw a yellow circle
    setcolor(YELLOW);
    circle(320, 240, 100);

    // Draw a cyan rectangle
    setcolor(LIGHTCYAN);
    rectangle(200, 120, 440, 360);

    // Draw a green diagonal line
    setcolor(LIGHTGREEN);
    line(100, 50, 540, 430);

    // Render text output
    setcolor(WHITE);
    outtextxy(250, 420, "It works!");

    getch();
    closegraph();
    return 0;
}
```

A graphics window appears in seconds. That's `TCC.EXE` from 1992, compiled to WebAssembly, running in your browser.

---

## 🚀 Getting Started

**Zero install — just open the link:**
→ **[graphics-h-compiler.vercel.app/compiler](https://graphics-h-compiler.vercel.app/compiler)**

**Run it locally:**

```bash
git clone https://github.com/AlbatrossC/graphics-h-compiler.git
cd graphics-h-compiler
pip install -r requirements.txt
npm install
python build.py
python app.py
# → http://localhost:5000/compiler
```

---

## 🛠️ Developer Documentation

If you wish to contribute or understand the inner workings of this project, check out the specific guides below:

| Section | Documentation Link | Details |
| :--- | :--- | :--- |
| **Online Compiler** | [Online Compiler Docs →](online-compiler/readme.md) | Flask backend, JS-DOS WASM integration, CodeMirror 6 configuration, and deployment details. |
| **VS Code Extension** | [VS Code Extension Docs →](vscode-extension/vscode-compiler.md) | Extension architecture, Turbo C / WinBGI compilation modes, and package builds. |

Contributions are welcome — [open an issue](https://github.com/AlbatrossC/graphics-h-compiler/issues) or send a PR.

---

<div align="center">

<br>

Made with frustration and love by [AlbatrossC](https://github.com/AlbatrossC)

*If this saved you from a DOSBox config spiral, a ⭐ on GitHub means a lot.*

<br>

</div>