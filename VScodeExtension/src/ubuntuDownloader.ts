import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as fs from 'fs';

export class UbuntuDownloader {
    private isChecking = false;
    private checkPromise: Promise<boolean> | null = null;

    private readonly INSTALL_COMMAND =
        'curl -fsSL https://raw.githubusercontent.com/AlbatrossC/graphics.h-online-compiler/refs/heads/main/compiler-assets/Installers/ubuntu_install.sh | bash';

    isInProgress(): boolean {
        return this.isChecking;
    }

    private async checkInstallation(): Promise<boolean> {
        try {
            const requiredFiles = [
                '/usr/local/include/graphics_h/graphics.h',
                '/usr/local/include/graphics_h/winbgim.h',
                '/usr/local/lib/graphics_h/libbgi.a'
            ];

            for (const file of requiredFiles) {
                if (!fs.existsSync(file)) {
                    return false;
                }
            }

            const compilerCheck = await this.runCommand('which i686-w64-mingw32-g++');
            if (!compilerCheck.success) {
                return false;
            }

            const wineCheck = await this.runCommand('which wine');
            if (!wineCheck.success) {
                return false;
            }

            return true;

        } catch (error) {
            console.error('Installation check failed:', error);
            return false;
        }
    }

    private runCommand(command: string): Promise<{ success: boolean; output: string; error: string }> {
        return new Promise((resolve) => {
            const proc = spawn('bash', ['-c', command]);
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            proc.on('close', (code) => {
                resolve({ success: code === 0, output: stdout.trim(), error: stderr.trim() });
            });

            proc.on('error', (error) => {
                resolve({ success: false, output: '', error: error.message });
            });
        });
    }

    async promptForInstallation(): Promise<boolean> {
        const result = await vscode.window.showInformationMessage(
            `⚙️ Graphics.h Compiler Setup Required\n\nRun this command in your terminal:\n\n${this.INSTALL_COMMAND}\n\nClick "Copy & Open Terminal" to copy the command and open a terminal.`,
            { modal: true },
            'Copy & Open Terminal',
            'I Already Installed'
        );

        if (result === 'Copy & Open Terminal') {
            await vscode.env.clipboard.writeText(this.INSTALL_COMMAND);
            await vscode.commands.executeCommand('workbench.action.terminal.new');

            vscode.window.showInformationMessage(
                '✓ Command copied to clipboard! Paste it in the terminal (Ctrl+Shift+V) and press Enter.',
                'Got it'
            );

            return false;

        } else if (result === 'I Already Installed') {
            const installed = await this.checkInstallation();

            if (installed) {
                vscode.window.showInformationMessage('✓ Graphics.h toolchain verified successfully!');
                return true;
            } else {
                const retry = await vscode.window.showErrorMessage(
                    'Graphics.h toolchain not found. Please run the installation command first.',
                    'Show Command Again'
                );

                if (retry === 'Show Command Again') {
                    return this.promptForInstallation();
                }
                return false;
            }
        }

        return false;
    }

    async isToolchainReady(): Promise<boolean> {
        if (this.checkPromise) {
            return this.checkPromise;
        }

        this.isChecking = true;

        this.checkPromise = this.checkInstallation().finally(() => {
            this.isChecking = false;
            this.checkPromise = null;
        });

        return this.checkPromise;
    }

    async getInstallationStatus(): Promise<{ installed: boolean; missing: string[] }> {
        const missing: string[] = [];

        const requiredFiles = [
            { path: '/usr/local/include/graphics_h/graphics.h', name: 'graphics.h' },
            { path: '/usr/local/include/graphics_h/winbgim.h', name: 'winbgim.h' },
            { path: '/usr/local/lib/graphics_h/libbgi.a', name: 'libbgi.a' }
        ];

        for (const file of requiredFiles) {
            if (!fs.existsSync(file.path)) {
                missing.push(file.name);
            }
        }

        const compilerCheck = await this.runCommand('which i686-w64-mingw32-g++');
        if (!compilerCheck.success) {
            missing.push('MinGW compiler (i686-w64-mingw32-g++)');
        }

        const wineCheck = await this.runCommand('which wine');
        if (!wineCheck.success) {
            missing.push('Wine');
        }

        return { installed: missing.length === 0, missing };
    }

    async showDetailedStatus(): Promise<void> {
        const status = await this.getInstallationStatus();

        if (status.installed) {
            vscode.window.showInformationMessage(
                '✓ Graphics.h toolchain is fully installed!\n\n' +
                'Platform: Ubuntu/Linux | Compiler: i686-w64-mingw32-g++ | Runtime: Wine | Status: Ready'
            );
        } else {
            const missingList = status.missing.join(', ');
            const choice = await vscode.window.showWarningMessage(
                `⚠️ Graphics.h toolchain is not fully installed. Missing: ${missingList}. Would you like to see the installation command?`,
                { modal: true },
                'Show Installation Command'
            );

            if (choice === 'Show Installation Command') {
                await this.promptForInstallation();
            }
        }
    }
}