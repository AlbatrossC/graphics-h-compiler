import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export enum OperatingSystem {
    Windows = 'windows',
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

    // Get toolchain installation directory in VS Code global storage
    getToolchainPath(): string {
        // Store MinGW32
        return path.join(this.context.globalStorageUri.fsPath, 'mingw32');
    }

    // Get path to bundled graphics libraries
    getGraphicsPath(): string {
        const mingwPath = this.getToolchainPath();
        return path.join(mingwPath, 'include');
    }

    // Get path to libbgi.a
    getLibraryPath(): string {
        const mingwPath = this.getToolchainPath();
        return path.join(mingwPath, 'lib');
    }

    // Get path to g++ compiler executable
    getGppPath(): string {
        const mingwPath = this.getToolchainPath();
        return path.join(mingwPath, 'bin', 'g++.exe');
    }

    // Check if toolchain is installed
    isToolchainInstalled(): boolean {
        // Check if MinGW g++.exe exists
        return fs.existsSync(this.getGppPath());
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
            default:
                return 'Unknown';
        }
    }

    // Get required dependencies based on OS
    getRequiredDependencies(): string[] {
        return ['MinGW32 Toolchain (C++ Compiler + Libraries)'];
    }

    // Check for missing dependencies
    getMissingDependencies(): string[] {
        const missing: string[] = [];
        
        if (!this.isToolchainInstalled()) {
            missing.push('MinGW32 Toolchain');
        }
        
        return missing;
    }
}