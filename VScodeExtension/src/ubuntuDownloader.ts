import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PathManager, ToolchainStatus } from './paths';

export class UbuntuDownloader {
    private readonly extensionPath: string;

    constructor(private readonly pathManager: PathManager) {
        this.extensionPath = pathManager.getExtensionPath();
    }

    private getInstallerPath(): string {
        return path.join(this.extensionPath, 'resources', 'installers', 'ubuntu_install.sh');
    }

    private getBundledGraphicsPath(): string {
        return path.join(this.extensionPath, 'resources', 'graphics');
    }

    private shellQuote(value: string): string {
        return `'${value.replace(/'/g, "'\\''")}'`;
    }

    private getInstallCommand(): string {
        return `bash ${this.shellQuote(this.getInstallerPath())}`;
    }

    private getMissingBundledFiles(): string[] {
        const graphicsPath = this.getBundledGraphicsPath();
        const requiredFiles = [
            this.getInstallerPath(),
            path.join(graphicsPath, 'graphics.h'),
            path.join(graphicsPath, 'modified-graphics.h'),
            path.join(graphicsPath, 'winbgim.h'),
            path.join(graphicsPath, 'libbgi.a')
        ];

        return requiredFiles.filter(file => !fs.existsSync(file));
    }

    private async showMissingBundledFilesError(missingFiles: string[]): Promise<void> {
        const relativeFiles = missingFiles.map(file => path.relative(this.extensionPath, file));

        const choice = await vscode.window.showErrorMessage(
            'Graphics.h Compiler is missing bundled Ubuntu installer assets: ' +
            `${relativeFiles.join(', ')}. Please reinstall the extension or rebuild the VSIX package.`,
            'Report Issue'
        );

        if (choice === 'Report Issue') {
            await vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/AlbatrossC/graphics-h-compiler/issues')
            );
        }
    }

    private getInstallationStatus(): ToolchainStatus {
        return this.pathManager.getToolchainStatus();
    }

    private delay(milliseconds: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    private async monitorInstallation(): Promise<boolean> {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Graphics.h Ubuntu setup',
                cancellable: true
            },
            async (progress, token) => {
                const timeoutAt = Date.now() + 15 * 60 * 1000;

                while (!token.isCancellationRequested && Date.now() < timeoutAt) {
                    const status = this.getInstallationStatus();
                    if (status.installed) {
                        progress.report({ message: 'Toolchain verified. Ready to compile.' });
                        vscode.window.showInformationMessage('Graphics.h toolchain installed and verified successfully.');
                        return true;
                    }

                    progress.report({
                        message: `Installer is running. Waiting for: ${status.missing.join(', ')}`
                    });
                    await this.delay(2000);
                }

                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage(
                        'Setup monitoring stopped. The installer can continue in the terminal; use Check Dependencies when it finishes.'
                    );
                } else {
                    vscode.window.showWarningMessage(
                        'Setup is taking longer than expected. Check the Graphics.h Ubuntu Setup terminal for prompts or errors.'
                    );
                }

                return false;
            }
        );
    }

    async promptForInstallation(): Promise<boolean> {
        const missingBundledFiles = this.getMissingBundledFiles();
        if (missingBundledFiles.length > 0) {
            await this.showMissingBundledFilesError(missingBundledFiles);
            return false;
        }

        const installCommand = this.getInstallCommand();
        const result = await vscode.window.showInformationMessage(
            'Graphics.h Compiler setup required\n\n' +
            'The Ubuntu installer and graphics.h files are bundled with this extension.\n\n' +
            `Run this command in your terminal:\n\n${installCommand}`,
            { modal: true },
            'Open Terminal & Run',
            'Copy Command',
            'I Already Installed'
        );

        if (result === 'Open Terminal & Run') {
            const terminal = vscode.window.createTerminal('Graphics.h Ubuntu Setup');
            terminal.show();
            terminal.sendText(installCommand, true);
            return this.monitorInstallation();

        } else if (result === 'Copy Command') {
            await vscode.env.clipboard.writeText(installCommand);
            await vscode.commands.executeCommand('workbench.action.terminal.new');

            vscode.window.showInformationMessage(
                'Command copied to clipboard. Paste it in the terminal and press Enter.',
                'Got it'
            );

            return false;

        } else if (result === 'I Already Installed') {
            const status = this.getInstallationStatus();

            if (status.installed) {
                vscode.window.showInformationMessage('Graphics.h toolchain verified successfully.');
                return true;
            } else {
                const retry = await vscode.window.showErrorMessage(
                    `Graphics.h toolchain is incomplete. Missing: ${status.missing.join(', ')}.`,
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

    async showDetailedStatus(): Promise<void> {
        const status = this.getInstallationStatus();

        if (status.installed) {
            vscode.window.showInformationMessage(
                'Graphics.h toolchain is fully installed.\n\n' +
                'Platform: Ubuntu/Linux | Compiler: i686-w64-mingw32-g++ | Runtime: Wine | Status: Ready'
            );
        } else {
            const missingList = status.missing.join(', ');
            const choice = await vscode.window.showWarningMessage(
                `Graphics.h toolchain is not fully installed. Missing: ${missingList}. Would you like to run the installer?`,
                { modal: true },
                'Run Installer'
            );

            if (choice === 'Run Installer') {
                await this.promptForInstallation();
            }
        }
    }
}
