<div align="center">

# Graphics.h Compiler

**A modern web-based compiler for running graphics.h programs in the browser and VS Code, with no installation or configuration needed.**

[![Online Compiler](https://img.shields.io/badge/🌐_Try_Online-0066FF?style=for-the-badge)](https://graphics-h-compiler.vercel.app/)
[![VS Code Extension](https://img.shields.io/badge/📦_VS_Code_Extension-22C55E?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)
[![GitHub](https://img.shields.io/badge/⭐_GitHub-181717?style=for-the-badge&logo=github)](https://github.com/AlbatrossC/graphics-h-compiler)

</div>

---

## 📸 Screenshots

### Browser Interface
![Browser Interface](online-demo.png)

### VS Code Extension
![VS Code Extension](vscode-demo.png)

---

## 🎯 Overview

Graphics.h Compiler is a modern Turbo C wrapper that enables you to compile and run `graphics.h` programs directly in your browser or VS Code. It eliminates the complexity of traditional setup methods and provides a ready-to-use graphics programming environment for learning and experimentation.

**Key Benefits:**
- ✅ No Turbo C installation required
- ✅ No DOSBox configuration needed
- ✅ Cross-platform support (Windows, Linux)
- ✅ Works offline after initial load
- ✅ SPPU Computer Graphics syllabus compatible

---

## ✨ Features

**Browser-Based Compilation**  
Run graphics programs directly in your web browser with zero installation.

**VS Code Integration**  
Develop with full IDE support through our dedicated extension.

**Zero Configuration**  
No complex setup or legacy dependencies required - just start coding.

**Client-Side Execution**  
All compilation happens locally in your browser for privacy and speed.

**Offline Support**  
Continue working without internet connectivity after the initial load.

**Modern Workflow**  
Use contemporary development tools with legacy graphics.h code seamlessly.

---

## 💡 Why This Project Exists

The `graphics.h` library remains a core component of the **SPPU Computer Graphics syllabus (2024 revised)** and is widely taught in introductory programming courses. However, its reliance on legacy tooling creates significant barriers for students.

<div align="center">

| ❌ Problem | ✅ Solution |
|:-----------|:------------|
| Complex Turbo C installation | Browser-based, instant access |
| DOSBox configuration issues | Zero configuration required |
| OS compatibility problems | Cross-platform support |
| Time wasted on setup | Focus on learning concepts |

</div>

This project removes these obstacles, allowing students and educators to focus on graphics programming fundamentals rather than technical configuration.

---

## 🚀 Getting Started

### Option 1: Online Compiler (Recommended)

The fastest way to get started. Simply visit the online compiler and begin coding immediately:

👉 **[https://graphics-h-compiler.vercel.app/](https://graphics-h-compiler.vercel.app/)**

---

### Option 2: Local Installation

Clone the repository and run it locally on your machine:

```bash
# Clone the repository
git clone https://github.com/AlbatrossC/graphics-h-compiler.git

# Navigate to the project directory
cd graphics-h-compiler

# Start a local server
python -m http.server 8000
```

Then open your browser at **`http://localhost:8000`**

---

### Option 3: VS Code Extension

Install the extension directly from the Visual Studio Code Marketplace:

👉 **[Install Extension](https://marketplace.visualstudio.com/items?itemName=AlbatrossC.graphics-h-compiler)**

#### Installation Methods:

**Via VS Code:**
1. Open VS Code
2. Press `Ctrl+Shift+X` to open Extensions panel
3. Search for **"graphics.h compiler"**
4. Click **Install** on the extension by **AlbatrossC**

**Via Command Line:**
```bash
code --install-extension AlbatrossC.graphics-h-compiler
```

📖 For detailed configuration and usage, refer to [vscode-compiler.md](vscode-compiler.md)

---

## 📚 Documentation

- **[online-compiler.md](online-compiler.md)** - Comprehensive guide to the browser-based compiler
- **[vscode-compiler.md](vscode-compiler.md)** - VS Code extension setup and configuration

---

## 💻 Usage Example

The compiler provides an intuitive interface for writing and running graphics.h programs. Simply write your code and click compile to see results instantly.

```c
#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");
    
    // Draw a circle
    circle(250, 200, 50);
    
    // Draw a rectangle
    rectangle(150, 100, 350, 300);
    
    // Draw a line
    line(100, 50, 400, 350);
    
    getch();
    closegraph();
    return 0;
}
```

---

## 👥 Who Is This For?

**Students**  
SPPU Computer Graphics students who need to fulfill syllabus requirements without hassle.

**Beginners**  
Anyone learning graphics.h who wants to avoid complex configuration and focus on coding.

**Educators**  
Instructors who want to provide students with modern, accessible development tools.

---

## 🔧 Technical Details

This compiler leverages **WebAssembly** technology to emulate the Turbo C graphics library environment. It enables `graphics.h` programs to run seamlessly in modern browsers and development tools without requiring DOS emulation or virtualization.

**Core Technologies:**
- WebAssembly for C/C++ compilation
- Browser-based graphics rendering
- Modern JavaScript framework integration

---

## 🤝 Support

Need help or want to contribute?

- 🐛 **[Report a Bug](https://github.com/AlbatrossC/graphics-h-compiler/issues)**
- 💬 **[Ask a Question](https://github.com/AlbatrossC/graphics-h-compiler/discussions)**
- ⭐ **[Star this Repository](https://github.com/AlbatrossC/graphics-h-compiler)**

---

<div align="center">

### Built for students and educators

**Graphics.h Compiler** - Making graphics.h accessible for everyone

</div>