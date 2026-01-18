# Graphics.h Compiler for Windows and Ubuntu

**Run graphics.h programs easily with one-click extension**

![Demo](assets/demo.gif)

[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/AlbatrossC/graphics-h-compiler)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=your-publisher-name.graphics-h-compiler)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **💡 Want to try graphics.h online?** Check out our [Online Compiler](https://albatrossc.github.io/graphics.h-online-compiler/) (uses Turbo C) - no installation required!

## Features

✅ **Windows Support** - Automatic MinGW32 toolchain installation  
✅ **Ubuntu Support** - System-wide installation with Wine integration  
✅ **One-Click Compilation** - Press `Ctrl+Alt+N` or click the Run button  
✅ **Wine Integration** - Automatically runs Windows .exe files on Linux  
✅ **No Manual Setup** - Automatic toolchain installation with user permission  
✅ **Error Highlighting** - Real-time compilation errors in VS Code Problems panel  
✅ **Output Panel** - See compilation progress and program output  

## Supported Platforms

✅ **Windows 10/11**  
✅ **Linux** (Ubuntu, Debian, and derivatives)  
❌ **macOS** (not supported)

## Installation

1. Install the extension from VS Code Marketplace
2. Open a `.cpp` file with `#include <graphics.h>`
3. Click Run Graphics to run the code
4. Follow the automatic setup prompts

### What Gets Installed

#### On Windows:
- **MinGW32 toolchain** (~220MB download, ~770MB disk space)
- **graphics.h library files** (bundled with extension, copied automatically)

#### On Ubuntu:
The extension will prompt you to run an installation script that installs:
- MinGW cross-compiler (`i686-w64-mingw32-g++`)
- Wine (for running Windows executables)
- graphics.h library files (installed to `/usr/local`)

📋 **View the installation script:** [ubuntu_install.sh](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/Installers/ubuntu_install.sh)

> **⚠️ Note for Ubuntu Users:** Installation requires running a separate command in the terminal. The extension will show you the command and provide a "Copy & Open Terminal" button for convenience.

## Usage

### Compile and Run

**Method 1: Keyboard Shortcut**
```
Ctrl+Alt+N
```

**Method 2: Status Bar Button**
- Click the "▶ Run Graphics" button in the bottom-right status bar

**Method 3: Command Palette**
1. Press `Ctrl+Shift+P`
2. Type "Graphics.h: Run Graphics Program"
3. Press Enter

**Method 4: Right-Click Menu**
- Right-click in the editor → Select "Run Graphics Program"

### Compile Only (Without Running)

**Keyboard Shortcut:**
```
Ctrl+Alt+B
```

**Command Palette:**
- `Graphics.h: Compile Graphics Program`

### Stop Running Program

**Keyboard Shortcut:**
```
Ctrl+Alt+K
```

**Command Palette:**
- `Graphics.h: Stop Running Graphics Program`

### Check Installation Status

**Command Palette:**
- `Graphics.h: Check Dependencies`

## Example Program

```cpp
#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");
    
    // Draw a circle
    circle(300, 200, 50);
    
    // Draw a line
    line(100, 100, 500, 300);
    
    // Set color and draw text
    setcolor(RED);
    outtextxy(200, 350, "Hello Graphics!");
    
    getch();
    closegraph();
    return 0;
}
```

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for "graphics-h-compiler":

| Setting | Default | Description |
|---------|---------|-------------|
| `graphics-h-compiler.autoRun` | `true` | Automatically run program after successful compilation |
| `graphics-h-compiler.showOutputPanel` | `true` | Show output panel during compilation |
| `graphics-h-compiler.clearOutputBeforeCompile` | `true` | Clear output panel before each compilation |

## Troubleshooting

### Windows

**Problem:** Compilation fails with "g++ not found"  
**Solution:** Run "Graphics.h: Setup Graphics.h Toolchain" from Command Palette

**Problem:** Antivirus blocks the download  
**Solution:** Temporarily disable antivirus or add an exception for VS Code

### Ubuntu

**Problem:** "Graphics.h toolchain not found"  
**Solution:** 
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run "Graphics.h: Setup Graphics.h Toolchain"
3. Click "Copy & Open Terminal"
4. Paste the command in terminal and run it
5. After installation, click "I Already Installed"

**Problem:** Wine is not installed  
**Solution:** The installation script automatically installs Wine. If you see errors, run:
```bash
sudo apt update
sudo apt install wine wine32
```

**Problem:** Permission denied errors  
**Solution:** The installation script uses `sudo`. Make sure you have sudo privileges.

## Commands

All commands are available via Command Palette (`Ctrl+Shift+P`):

| Command | Shortcut | Description |
|---------|----------|-------------|
| `Graphics.h: Run Graphics Program` | `Ctrl+Alt+N` | Compile and run the current file |
| `Graphics.h: Compile Graphics Program` | `Ctrl+Alt+B` | Compile without running |
| `Graphics.h: Stop Running Graphics Program` | `Ctrl+Alt+K` | Stop the currently running program |
| `Graphics.h: Setup Graphics.h Toolchain` | - | Install/reinstall the toolchain |
| `Graphics.h: Check Dependencies` | - | Check installation status |

## Buttons

### Status Bar Button
- **▶ Run Graphics** - Appears when a C++ file is open
- **⏹ Stop Graphics** - Appears when a program is running

### Editor Title Button
- **▶** (Play button) - Compile and run the current file

## Technical Details

### Windows Compilation
```bash
g++ source.cpp -I <graphics_path> -L <library_path> 
    -lbgi -lgdi32 -lcomdlg32 -luuid -loleaut32 -lole32 
    -o output.exe
```

### Ubuntu Compilation
```bash
i686-w64-mingw32-g++ source.cpp 
    -I /usr/local/include/graphics_h 
    -L /usr/local/lib/graphics_h 
    -lbgi -lgdi32 -lcomdlg32 -luuid -loleaut32 -lole32 
    -static-libgcc -static-libstdc++ 
    -o output.exe
```

### Ubuntu Execution
```bash
wine output.exe
```

## Links

- 🌐 **[Try Online Compiler](https://albatrossc.github.io/graphics.h-online-compiler/)** - No installation required (uses Turbo C)
- 📦 **[GitHub Repository](https://github.com/AlbatrossC/graphics-h-compiler)** - Source code and issues
- 📜 **[Ubuntu Install Script](https://github.com/AlbatrossC/graphics-h-compiler/blob/main/Installers/ubuntu_install.sh)** - View what gets installed on Linux
- 🐛 **[Report Issues](https://github.com/AlbatrossC/graphics-h-compiler/issues)** - Bug reports and feature requests

## Credits

### Libraries and Tools
- **graphics.h (WinBGIm)** - BGI graphics library for Windows
- **MinGW** - Minimalist GNU for Windows
- **Wine** - Windows compatibility layer for Linux
- **VS Code** - Microsoft Visual Studio Code

### Maintainer
- **AlbatrossC** - [GitHub](https://github.com/AlbatrossC)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Support

If you encounter any issues or have questions:
- 📧 Open an issue on [GitHub](https://github.com/AlbatrossC/graphics-h-compiler/issues)
- 💬 Check existing issues for solutions
- ⭐ Star the repository if you find it useful!

---

**Made with ❤️ for students learning computer graphics**