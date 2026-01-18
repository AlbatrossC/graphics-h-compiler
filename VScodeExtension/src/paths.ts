import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export enum OperatingSystem {
    Windows = 'windows',
    Linux = 'linux',
    Unknown = 'unknown'
}

export class PathManager {
    private context: vscode.ExtensionContext;
    private currentOS: OperatingSystem;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.currentOS = this.detectOS();
    }

    // Detect the current operating system
    private detectOS(): OperatingSystem {
        const platform = os.platform();
        
        if (platform === 'win32') {
            return OperatingSystem.Windows;
        } else if (platform === 'linux') {
            return OperatingSystem.Linux;
        }
        
        return OperatingSystem.Unknown;
    }

    // Get current OS
    getOS(): OperatingSystem {
        return this.currentOS;
    }

    // Get extension installation path
    getExtensionPath(): string {
        return this.context.extensionPath;
    }

    // Check if running on Windows
    isWindows(): boolean {
        return this.currentOS === OperatingSystem.Windows;
    }

    // Check if running on Linux
    isLinux(): boolean {
        return this.currentOS === OperatingSystem.Linux;
    }

    // Get toolchain installation directory (Windows only - stored in VS Code global storage)
    getToolchainPath(): string {
        if (this.isWindows()) {
            return path.join(this.context.globalStorageUri.fsPath, 'mingw32');
        }
        // For Linux, toolchain is system-wide
        return '/usr/local';
    }

    // Get path to bundled graphics libraries (Windows only)
    getGraphicsPath(): string {
        if (this.isWindows()) {
            const mingwPath = this.getToolchainPath();
            return path.join(mingwPath, 'include');
        }
        // For Linux, graphics.h is installed system-wide
        return '/usr/local/include/graphics_h';
    }

    // Get path to libbgi.a (Windows only)
    getLibraryPath(): string {
        if (this.isWindows()) {
            const mingwPath = this.getToolchainPath();
            return path.join(mingwPath, 'lib');
        }
        // For Linux, library is installed system-wide
        return '/usr/local/lib/graphics_h';
    }

    // Get path to g++ compiler executable (Windows only)
    getGppPath(): string {
        if (this.isWindows()) {
            const mingwPath = this.getToolchainPath();
            return path.join(mingwPath, 'bin', 'g++.exe');
        }
        // For Linux, use system-wide MinGW compiler
        return 'i686-w64-mingw32-g++';
    }

    // Check if toolchain is installed
    isToolchainInstalled(): boolean {
        if (this.isWindows()) {
            // Check if MinGW g++.exe exists
            return fs.existsSync(this.getGppPath());
        } else if (this.isLinux()) {
            // Check if required files exist
            const requiredFiles = [
                '/usr/local/include/graphics_h/graphics.h',
                '/usr/local/include/graphics_h/winbgim.h',
                '/usr/local/lib/graphics_h/libbgi.a'
            ];
            return requiredFiles.every(file => fs.existsSync(file));
        }
        return false;
    }

    // Check if all required dependencies are installed
    areAllDependenciesInstalled(): boolean {
        return this.isToolchainInstalled();
    }

    // Get output executable path for a source file
    getOutputPath(sourceFile: string): string {
        const dir = path.dirname(sourceFile);
        const name = path.basename(sourceFile, path.extname(sourceFile));
        return path.join(dir, `${name}.exe`);
    }

    // Get human-readable OS name
    getOSDisplayName(): string {
        switch (this.currentOS) {
            case OperatingSystem.Windows:
                return 'Windows';
            case OperatingSystem.Linux:
                return 'Ubuntu/Linux';
            default:
                return 'Unknown';
        }
    }

    // Get required dependencies based on OS
    getRequiredDependencies(): string[] {
        if (this.isWindows()) {
            return ['MinGW32 Toolchain (C++ Compiler + Libraries)'];
        } else if (this.isLinux()) {
            return [
                'MinGW compiler (i686-w64-mingw32-g++)',
                'Wine (for running Windows executables)',
                'graphics.h library files'
            ];
        }
        return [];
    }

    // Check for missing dependencies
    getMissingDependencies(): string[] {
        const missing: string[] = [];
        
        if (this.isWindows()) {
            if (!this.isToolchainInstalled()) {
                missing.push('MinGW32 Toolchain');
            }
        } else if (this.isLinux()) {
            if (!this.isToolchainInstalled()) {
                missing.push('Graphics.h toolchain (run installation script)');
            }
        }
        
        return missing;
    }
}