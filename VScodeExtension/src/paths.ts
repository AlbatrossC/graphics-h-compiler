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

    private detectOS(): OperatingSystem {
        const platform = os.platform();

        if (platform === 'win32') {
            return OperatingSystem.Windows;
        } else if (platform === 'linux') {
            return OperatingSystem.Linux;
        }

        return OperatingSystem.Unknown;
    }

    getOS(): OperatingSystem {
        return this.currentOS;
    }

    getExtensionPath(): string {
        return this.context.extensionPath;
    }

    isWindows(): boolean {
        return this.currentOS === OperatingSystem.Windows;
    }

    isLinux(): boolean {
        return this.currentOS === OperatingSystem.Linux;
    }

    getToolchainPath(): string {
        if (this.isWindows()) {
            return path.join(this.context.globalStorageUri.fsPath, 'mingw32');
        }
        return '/usr/local';
    }

    getGraphicsPath(): string {
        if (this.isWindows()) {
            return path.join(this.getToolchainPath(), 'include');
        }
        return '/usr/local/include/graphics_h';
    }

    getLibraryPath(): string {
        if (this.isWindows()) {
            return path.join(this.getToolchainPath(), 'lib');
        }
        return '/usr/local/lib/graphics_h';
    }

    getGppPath(): string {
        if (this.isWindows()) {
            return path.join(this.getToolchainPath(), 'bin', 'g++.exe');
        }
        return 'i686-w64-mingw32-g++';
    }

    isToolchainInstalled(): boolean {
        if (this.isWindows()) {
            return fs.existsSync(this.getGppPath());
        } else if (this.isLinux()) {
            const requiredFiles = [
                '/usr/local/include/graphics_h/graphics.h',
                '/usr/local/include/graphics_h/winbgim.h',
                '/usr/local/lib/graphics_h/libbgi.a'
            ];
            return requiredFiles.every(file => fs.existsSync(file));
        }
        return false;
    }

    areAllDependenciesInstalled(): boolean {
        return this.isToolchainInstalled();
    }

    getOutputPath(sourceFile: string): string {
        const dir = path.dirname(sourceFile);
        const name = path.basename(sourceFile, path.extname(sourceFile));
        return path.join(dir, `${name}.exe`);
    }

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