<div align="center">

# 🎨 Graphics.h Compiler

**Run graphics.h programs in your browser or VS Code - no setup required**

[![Online Compiler](https://img.shields.io/badge/Try%20Online-graphics--h--compiler.vercel.app-blue?style=for-the-badge)](https://graphics-h-compiler.vercel.app/)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Install%20Extension-green?style=for-the-badge&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-black?style=for-the-badge&logo=github)](https://github.com/AlbatrossC/graphics-h-compiler)

*A modern Turbo C wrapper • No Turbo C • No DOSBox • No Legacy Tools*

</div>

---

## 📸 Screenshots

<table>
<tr>
<td width="50%">
<img src="online-demo.png" alt="Browser Interface" width="100%">
<p align="center"><b>🌐 Browser Interface</b></p>
</td>
<td width="50%">
<img src="vscode-demo.png" alt="VS Code Extension" width="100%">
<p align="center"><b>💻 VS Code Extension</b></p>
</td>
</tr>
</table>

---

## 🌟 Overview

**Graphics.h Compiler** is a modern Turbo C wrapper that brings the classic `graphics.h` library to contemporary development environments. Write, compile, and run graphics programs directly in your browser or VS Code—no complex setup, no legacy tools, no headaches.

> Perfect for students, educators, and anyone learning computer graphics programming

---

## ✨ Features

- 🌐 **Multi-Platform Support** - Works in browser and VS Code on Windows & Linux
- ⚡ **Zero Configuration** - No Turbo C, DOSBox, or complex dependencies required
- 📴 **Offline Ready** - Continue working after initial load with no internet dependency
- 🎓 **Student Friendly** - SPPU syllabus compatible with simple, modern interface
- 🚀 **Client-Side Execution** - All compilation happens directly in your browser
- 💡 **Modern Workflow** - Use contemporary development tools with legacy graphics.h

---

## 🎯 Why This Project Exists

`graphics.h` is still part of the **SPPU Computer Graphics syllabus (2024 revised)** and widely taught in programming courses. However, legacy tooling creates barriers:

| ❌ Problem | ✅ Solution |
|-----------|----------|
| Complex Turbo C installation | Browser-based, instant access |
| DOSBox configuration headaches | Zero configuration required |
| OS compatibility issues | Cross-platform support |
| Time wasted on setup | Focus on learning concepts |

This project removes these obstacles so students can focus on graphics programming fundamentals.

---

## 🚀 Getting Started

### Option 1: Online Compiler (Recommended)

Simply visit the online compiler and start coding immediately:

**🌐 [https://graphics-h-compiler.vercel.app/](https://graphics-h-compiler.vercel.app/)**

---

### Option 2: Run Locally

```bash
# Clone the repository
git clone https://github.com/AlbatrossC/graphics-h-compiler.git

# Navigate to the project directory
cd graphics-h-compiler

# Start a local server
python -m http.server 8000
```

Then open your browser at: **http://localhost:8000**

---

### Option 3: VS Code Extension

**Install from VS Code Marketplace:**

🔗 [https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)

**Installation Steps:**

1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions
3. Search for **"graphics.h compiler"**
4. Click **Install** on the extension by **AlbatrossC**

**Or install via command line:**
```bash
code --install-extension AlbatrossC.graphics-h-compiler
```

📖 For detailed configuration, see [`vscode-compiler.md`](vscode-compiler.md)

---

## 📖 Documentation

- **[online-compiler.md](online-compiler.md)** - Browser-based compiler architecture, features, and usage
- **[vscode-compiler.md](vscode-compiler.md)** - VS Code extension setup, configuration, and advanced features

---

## 👥 Who Is This For?

- 🎓 **SPPU Computer Graphics Students** - Fulfill syllabus requirements without legacy tools
- 👨‍💻 **Beginners** - Learn graphics.h without configuration hassles
- 👨‍🏫 **Educators** - Provide students with modern, accessible learning tools

---

## ⚙️ Technical Details

This compiler leverages **WebAssembly** technology to emulate the Turbo C graphics library environment, enabling `graphics.h` programs to run seamlessly in modern browsers and development tools without requiring DOS emulation or virtualization.

**Key Technologies:**
- WebAssembly for C/C++ compilation
- Browser-based graphics rendering
- Modern JavaScript framework integration

---

## 💬 Support

Need help or have questions?

- 🐛 [Report a Bug](https://github.com/AlbatrossC/graphics-h-compiler/issues)
- 💡 [Ask a Question](https://github.com/AlbatrossC/graphics-h-compiler/discussions)
- ⭐ [Star this Repository](https://github.com/AlbatrossC/graphics-h-compiler)

---

<div align="center">

**Graphics.h Compiler** - Simplifying graphics programming for modern developers

*Built for students • Made for learning • Designed for simplicity*

</div>