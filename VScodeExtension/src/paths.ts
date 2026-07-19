import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawnSync } from 'child_process';

export enum OperatingSystem {
    Windows = 'windows',
    Linux = 'linux',
    MacOS = 'macos',
    Unknown = 'unknown'
}

export interface ToolchainStatus {
    installed: boolean;
    missing: string[];
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
        } else if (platform === 'darwin') {
            return OperatingSystem.MacOS;
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

    isMacOS(): boolean {
        return this.currentOS === OperatingSystem.MacOS;
    }

    supportsNativeWinBGI(): boolean {
        return this.isWindows() || this.isLinux();
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

    getWinePrefix(): string {
        return path.join(os.homedir(), '.wine32_graphics');
    }

    getToolchainStatus(): ToolchainStatus {
        const missing: string[] = [];

        if (this.isWindows()) {
            const requiredFiles = [
                { path: this.getGppPath(), name: 'MinGW C++ compiler' },
                { path: path.join(this.getGraphicsPath(), 'graphics.h'), name: 'graphics.h' },
                { path: path.join(this.getGraphicsPath(), 'winbgim.h'), name: 'winbgim.h' },
                { path: path.join(this.getLibraryPath(), 'libbgi.a'), name: 'libbgi.a' }
            ];

            for (const file of requiredFiles) {
                if (!fs.existsSync(file.path)) {
                    missing.push(file.name);
                }
            }
        } else if (this.isLinux()) {
            const requiredFiles = [
                { path: path.join(this.getGraphicsPath(), 'graphics.h'), name: 'graphics.h' },
                { path: path.join(this.getGraphicsPath(), 'winbgim.h'), name: 'winbgim.h' },
                { path: path.join(this.getLibraryPath(), 'libbgi.a'), name: 'libbgi.a' }
            ];

            for (const file of requiredFiles) {
                if (!fs.existsSync(file.path)) {
                    missing.push(file.name);
                }
            }

            if (!this.isCommandAvailable('i686-w64-mingw32-g++')) {
                missing.push('MinGW compiler (i686-w64-mingw32-g++)');
            }

            if (!this.isCommandAvailable('wine')) {
                missing.push('Wine');
            }
        } else {
            missing.push('WinBGI native mode is not supported on this platform');
        }

        return { installed: missing.length === 0, missing };
    }

    private isCommandAvailable(command: string): boolean {
        const result = spawnSync(command, ['--version'], {
            stdio: 'ignore',
            windowsHide: true
        });
        return result.status === 0;
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
            case OperatingSystem.MacOS:
                return 'macOS';
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
        return this.getToolchainStatus().missing;
    }
}
