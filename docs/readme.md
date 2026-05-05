<div align="center">

<br>

# ✨ Graphics.h Compiler

### Write and run `graphics.h` programs — instantly, anywhere.

**No installation. No DOSBox. No Turbo C setup.**
**Just open your browser or VS Code and start coding.**

<br>

<a href="https://graphics-h-compiler.vercel.app/compiler">
<img src="https://img.shields.io/badge/🚀_Open_Online_Compiler-22C55E?style=for-the-badge&labelColor=1a1a2e" alt="Open Online Compiler">
</a>
&nbsp;&nbsp;
<a href="https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler">
<img src="https://img.shields.io/badge/Install_VS_Code_Extension-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="Install VS Code Extension">
</a>
&nbsp;&nbsp;
<a href="https://github.com/AlbatrossC/graphics-h-compiler">
<img src="https://img.shields.io/badge/⭐_Star_on_GitHub-FFD700?style=for-the-badge&logo=github&logoColor=black&labelColor=1a1a2e" alt="Star on GitHub">
</a>

<br><br>

</div>

---

<br>

## 🌐 Online Compiler

Compile and run **Turbo C++ 3.0 graphics programs** directly in your browser. A real `TCC.EXE` runs inside a DOSBox emulator powered by WebAssembly — all client-side, no server compilation.

<br>

<table align="center" width="95%">
<tr>
<td width="50%" align="center">
<img src="./images/online-demo-1.png" alt="Online compiler — writing and running graphics.h code in the browser" width="100%">
<br><br>
<b>💻 Write Code → Click Run → See Graphics Output</b>
<br>
<sub>Full CodeMirror 6 editor with C++ syntax highlighting, autocomplete, and instant Turbo C++ compilation.</sub>
</td>
<td width="50%" align="center">
<img src="./images/online-demo-2.png" alt="Online compiler — cloud file storage with Google Sign-In" width="100%">
<br><br>
<b>☁️ Save Your Files in the Cloud</b>
<br>
<sub>Sign in with Google to save your projects. Create folders, manage multiple files, and access your code from any device.</sub>
</td>
</tr>
</table>

<br>

<div align="center">

> 📦 **Standalone Single-File Compiler** — Check out [`compiler-assets/unified/graphic.h-compiler-unified.html`](../compiler-assets/unified/graphic.h-compiler-unified.html).
> A **single ~8 MB HTML file** that runs the entire Turbo C++ compiler in your browser. **No servers. No backend. No installation.** Just double-click and start compiling.
> See the [technical breakdown →](../compiler-assets/unified/graphic.h-compiler-unified.md)

</div>

<br>

<div align="center">

| | Feature | |
|:---:|:---|:---|
| 🖥️ | **Real Turbo C++ 3.0 compiler** — `TCC.EXE` running in DOSBox WebAssembly | Works exactly like the original |
| 🎨 | **Full graphics.h support** — `initgraph`, `circle`, `line`, `rectangle`, `setcolor` and all 99 functions | Includes BGI drivers |
| ✏️ | **Smart autocomplete** — function signatures, parameter descriptions, and hover tooltips | VS Code–like experience |
| ☁️ | **Cloud save** — sign in with Google to store files and access from any device | Unlimited projects |
| 📴 | **Works offline** — runtime cached in browser after first use | No internet needed to compile |
| 🎮 | **Demo programs** — bouncing ball, circle patterns, shooter game, and more | One-click to load |

</div>

<br>

<div align="center">

👉 **[https://graphics-h-compiler.vercel.app/compiler](https://graphics-h-compiler.vercel.app/compiler)**

</div>

<br>

---

<br>

## <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg" width="28" align="top"> &nbsp;VS Code Extension

Compile and run `graphics.h` programs **without leaving your editor**. Two modes — **Turbo C++** (DOSBox emulation inside a webview) and **WinBGI** (native Windows `.exe` via MinGW).

<br>

<table align="center" width="95%">
<tr>
<td width="50%" align="center">
<img src="./images/vscode_turboc_demo.png" alt="VS Code — Turbo C++ mode with DOSBox graphics output" width="100%">
<br><br>
<b>🖥️ Turbo C++ 3.0 Mode — DOSBox Emulation</b>
<br>
<sub>The same Turbo C++ 3.0 compiler from the online version, now inside a VS Code webview panel. Full EGAVGA.BGI graphics driver support with authentic DOS output.</sub>
</td>
<td width="50%" align="center">
<img src="./images/vscode_windows_demo.png" alt="VS Code — WinBGI native Windows output" width="100%">
<br><br>
<b>⚡ Windows Native Mode — Real .exe Output</b>
<br>
<sub>MinGW-w64 (GCC 11.5.0) produces a standalone Win32 executable with a native graphics window. The toolchain is auto-downloaded on first use — zero manual setup.</sub>
</td>
</tr>
</table>

<br>

<div align="center">

| | Feature | |
|:---:|:---|:---|
| 🔀 | **Two compilation modes** — Turbo C++ (DOSBox) for syllabus work, WinBGI (native) for modern development | Choose per project |
| ⚙️ | **Auto-installs toolchain** — MinGW-w64 downloaded and configured on first use (Windows) | No manual setup |
| ⌨️ | **Keyboard shortcut** — `Ctrl+Alt+N` to compile and run instantly | One keypress |
| 🔴 | **GCC error diagnostics** — red squiggles in the editor, entries in the Problems panel | Click to jump to error |
| 🌍 | **Cross-platform** — Windows, Linux (via Wine), and macOS (Turbo C mode) | Works everywhere |
| ▶️ | **Status bar button** — one click to Run or Stop your program | Always visible |

</div>

<br>

**Install the extension:**

<div align="center">

| Method | How |
|:---|:---|
| **From VS Code** | Open Extensions (`Ctrl+Shift+X`) → Search **"graphics.h compiler"** → Click **Install** |
| **From terminal** | `code --install-extension AlbatrossC.graphics-h-compiler` |
| **From Marketplace** | **[marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)** |

</div>

<br>

---

<br>

## 🎯 Why This Project Exists

`graphics.h` is **an old, legacy library from the 1980s** — originally part of Borland's Turbo C++ for DOS. Despite its age, it remains a **mandatory part of the syllabus at many universities** across India and beyond (SPPU, Mumbai University, GTU, and others). These syllabi require students to learn `graphics.h` and will continue to do so **until at least 2030**.

The problem? Installing Turbo C++ on a modern PC is a nightmare — downloading shady installers from random websites, fighting with DOSBox configuration, dealing with Windows-only limitations, and wasting hours on setup instead of actually learning.

**My aim is simple: make `graphics.h` accessible.** If students are required to learn it, then running it should be as easy as opening a browser tab. That's why I built this — so that anyone, on any device, can write and compile `graphics.h` programs in seconds.

<br>

<div align="center">

| | ❌ The Old Way | ✅ With This Project |
|:---:|:---|:---|
| 💾 | Download Turbo C++ from a sketchy site | Open your browser — done |
| 🔧 | Configure DOSBox paths manually | Zero configuration needed |
| 🪟 | Windows-only, no macOS or Linux | Cross-platform — browser + VS Code |
| ⏳ | Hours wasted on setup before writing a single line | Start coding in under 5 seconds |
| 📝 | Outdated editors with no features | Modern editor with autocomplete and tooltips |

</div>

<br>

---

<br>

## 🚀 Getting Started

### Option 1: Online Compiler

The fastest way. No installation required — just visit the website:

<div align="center">

**Method A — Use it directly:**

👉 **[https://graphics-h-compiler.vercel.app/compiler](https://graphics-h-compiler.vercel.app/compiler)**

</div>

<br>

**Method B — Run it locally (for developers):**

```bash
# Clone the repository
git clone https://github.com/AlbatrossC/graphics-h-compiler.git
cd graphics-h-compiler

# Install dependencies
pip install -r requirements.txt
npm install

# Build the assets
python build.py

# Start the server
python app.py
```

Open **http://localhost:5000/compiler** in your browser.

<br>

### Option 2: VS Code Extension

Install the extension and compile directly inside your editor.

**Method A — From VS Code:**
1. Open VS Code → Press `Ctrl+Shift+X`
2. Search **"graphics.h compiler"**
3. Click **Install** on the extension by **AlbatrossC**

**Method B — From the terminal:**
```bash
code --install-extension AlbatrossC.graphics-h-compiler
```

**Method C — From the Marketplace:**

👉 **[marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)**

<br>

---

<br>

## 💻 Quick Example

```c
#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");

    // Draw shapes
    setcolor(YELLOW);
    circle(320, 240, 100);

    setcolor(LIGHTCYAN);
    rectangle(200, 120, 440, 360);

    setcolor(LIGHTGREEN);
    line(100, 50, 540, 430);

    outtextxy(250, 420, "Graphics.h!");

    getch();
    closegraph();
    return 0;
}
```

<p align="center">Paste this into the <a href="https://graphics-h-compiler.vercel.app/compiler"><b>online compiler</b></a> and click <b>Run</b> — you'll see the output instantly.</p>

<br>

---

<br>

## 👥 Who Is This For?

<div align="center">

| | Audience | Description |
|:---:|:---|:---|
| 🎓 | **Students** | SPPU Computer Graphics, introductory C/C++ courses, anyone learning `graphics.h` |
| 👨‍🏫 | **Educators** | Share a link to the compiler — students start coding immediately, no setup help needed |
| 💻 | **Hobbyists** | Nostalgia-friendly Turbo C++ environment for retro DOS graphics programming |

</div>

<br>

---

<br>

## 🤝 Support & Community

<div align="center">

<a href="https://github.com/AlbatrossC/graphics-h-compiler/issues">
<img src="https://img.shields.io/badge/🐛_Report_a_Bug-FF6B6B?style=for-the-badge&labelColor=1a1a2e" alt="Report a Bug">
</a>
&nbsp;&nbsp;
<a href="https://github.com/AlbatrossC/graphics-h-compiler/discussions">
<img src="https://img.shields.io/badge/💬_Discussions-A78BFA?style=for-the-badge&labelColor=1a1a2e" alt="Discussions">
</a>
&nbsp;&nbsp;
<a href="https://github.com/AlbatrossC/graphics-h-compiler">
<img src="https://img.shields.io/badge/⭐_Star_this_Repo-FFD700?style=for-the-badge&logo=github&logoColor=black&labelColor=1a1a2e" alt="Star this Repo">
</a>

</div>

<br>

---

<br>

## 🛠️ For Developers

This project is **open source** and welcomes contributions. To understand the codebase, set up locally, or contribute — check out the developer documentation:

<div align="center">

| | Documentation | What It Covers |
|:---:|:---|:---|
| 🌐 | **[Online Compiler Docs →](online-compiler/readme.md)** | Architecture, CodeMirror 6 editor, compilation workflow (JS-DOS + WASM + DOSBox), cloud storage (Cloudflare Workers + D1), build pipeline, Vercel deployment, and local dev setup |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vscode/vscode-original.svg" width="16"> | **[VS Code Extension Docs →](vscode-extension/vscode-compiler.md)** | Extension architecture, Turbo C & WinBGI modes, MinGW-w64 toolchain, commands & shortcuts, build & publish process, and contributor setup |

</div>

<br>

**Quick start for local development:**
```bash
git clone https://github.com/AlbatrossC/graphics-h-compiler.git
cd graphics-h-compiler
pip install -r requirements.txt
npm install
python build.py
python app.py
# → http://localhost:5000
```

<br>

---

<div align="center">

<br>

**Graphics.h Compiler** — Making `graphics.h` accessible for everyone.

*An open-source project by [AlbatrossC](https://github.com/AlbatrossC)*

<br>

</div>
