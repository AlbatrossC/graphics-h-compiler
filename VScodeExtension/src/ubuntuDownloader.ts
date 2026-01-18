import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs';

export class UbuntuDownloader {
    private isChecking = false;
    private checkPromise: Promise<boolean> | null = null;

    // Installation command that users need to run
    private readonly INSTALL_COMMAND = 'curl -fsSL https://raw.githubusercontent.com/AlbatrossC/graphics.h-online-compiler/refs/heads/main/Installers/ubuntu_install.sh | bash';

    isInProgress(): boolean {
        return this.isChecking;
    }

    // Check if graphics.h is installed system-wide
    private async checkInstallation(): Promise<boolean> {
        try {
            // Check for required files
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

            // Check if compiler exists
            const compilerCheck = await this.runCommand('which i686-w64-mingw32-g++');
            if (!compilerCheck.success) {
                return false;
            }

            // Check if wine exists
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

    // Run a command and return result
    private runCommand(command: string): Promise<{ success: boolean; output: string; error: string }> {
        return new Promise((resolve) => {
            const process = spawn('bash', ['-c', command]);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output: stdout.trim(),
                    error: stderr.trim()
                });
            });

            process.on('error', (error) => {
                resolve({
                    success: false,
                    output: '',
                    error: error.message
                });
            });
        });
    }

    // Show installation instructions with copy button
    async promptForInstallation(): Promise<boolean> {
        const message = `⚙️ Graphics.h Compiler Setup Required

To compile graphics.h programs on Ubuntu, run this command in your terminal:

${this.INSTALL_COMMAND}

Click "Copy & Open Terminal" to copy the command and open a terminal.`;

        const result = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'Copy & Open Terminal',
            'I Already Installed'
        );

        if (result === 'Copy & Open Terminal') {
            // Copy command to clipboard
            await vscode.env.clipboard.writeText(this.INSTALL_COMMAND);
            
            // Open terminal
            await vscode.commands.executeCommand('workbench.action.terminal.new');
            
            // Show success message
            vscode.window.showInformationMessage(
                '✓ Command copied to clipboard!\n\nPaste it in the terminal (Ctrl+Shift+V) and press Enter.',
                'Got it'
            );

            return false;

        } else if (result === 'I Already Installed') {
            // Verify installation
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

    // Compile C++ file using the system-wide installation
    async compile(
        sourceFile: string,
        outputChannel: vscode.OutputChannel
    ): Promise<{ success: boolean; exeFile: string | null }> {
        try {
            // Verify installation first
            const installed = await this.checkInstallation();
            if (!installed) {
                outputChannel.appendLine('[graphics-h] Graphics.h toolchain not installed');
                outputChannel.appendLine('[graphics-h] Please run the setup command first');
                return { success: false, exeFile: null };
            }

            const dir = path.dirname(sourceFile);
            const basename = path.basename(sourceFile, path.extname(sourceFile));
            const exeFile = path.join(dir, `${basename}.exe`);

            outputChannel.appendLine(`[graphics-h] OS: Ubuntu/Linux`);
            outputChannel.appendLine(`[graphics-h] Compiling: ${path.basename(sourceFile)}`);
            outputChannel.appendLine(`[graphics-h] Output: ${path.basename(exeFile)}`);
            outputChannel.appendLine('');

            // Compile command - exactly as in the bash script but without wrapper
            const compileCmd = `i686-w64-mingw32-g++ "${sourceFile}" -I /usr/local/include/graphics_h -L /usr/local/lib/graphics_h -lbgi -lgdi32 -lcomdlg32 -luuid -loleaut32 -lole32 -static-libgcc -static-libstdc++ -o "${exeFile}"`;

            const startTime = Date.now();

            return new Promise((resolve) => {
                const compileProcess = spawn('bash', ['-c', compileCmd], {
                    cwd: dir
                });

                let stderr = '';

                compileProcess.stdout.on('data', (data) => {
                    outputChannel.append(data.toString());
                });

                compileProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    stderr += output;
                    outputChannel.append(output);
                });

                compileProcess.on('close', (code) => {
                    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

                    if (code !== 0) {
                        outputChannel.appendLine('');
                        outputChannel.appendLine(`[graphics-h] ✗ Build failed (${duration}s)`);
                        resolve({ success: false, exeFile: null });
                    } else {
                        outputChannel.appendLine(`[graphics-h] ✓ Build succeeded (${duration}s)`);
                        outputChannel.appendLine(`[graphics-h] Executable: ${path.basename(exeFile)}`);
                        resolve({ success: true, exeFile });
                    }
                });

                compileProcess.on('error', (error) => {
                    outputChannel.appendLine('');
                    outputChannel.appendLine(`[graphics-h] Compiler error: ${error.message}`);
                    resolve({ success: false, exeFile: null });
                });
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            outputChannel.appendLine(`[graphics-h] Compilation error: ${errorMsg}`);
            return { success: false, exeFile: null };
        }
    }

    // Run the compiled executable using Wine
    async run(
        exeFile: string,
        outputChannel: vscode.OutputChannel
    ): Promise<void> {
        if (!fs.existsSync(exeFile)) {
            vscode.window.showErrorMessage('Executable not found: ' + exeFile);
            return;
        }

        // Verify Wine is installed
        const wineCheck = await this.runCommand('which wine');
        if (!wineCheck.success) {
            vscode.window.showErrorMessage(
                'Wine is not installed. Please run the setup command first.',
                'Show Setup Command'
            ).then(choice => {
                if (choice === 'Show Setup Command') {
                    this.promptForInstallation();
                }
            });
            return;
        }

        outputChannel.appendLine(`[graphics-h] Running: ${path.basename(exeFile)}`);
        outputChannel.appendLine('');

        const runCmd = `wine "${exeFile}"`;

        return new Promise((resolve) => {
            const runProcess = spawn('bash', ['-c', runCmd], {
                cwd: path.dirname(exeFile)
            });

            runProcess.stdout.on('data', (data) => {
                outputChannel.append(`[Program Output] ${data.toString()}`);
            });

            runProcess.stderr.on('data', (data) => {
                const output = data.toString();
                // Filter out Wine debug messages
                if (!output.includes('fixme:') && !output.includes('wine:')) {
                    outputChannel.append(`[Program Error] ${output}`);
                }
            });

            runProcess.on('close', (code) => {
                outputChannel.appendLine('');
                if (code === 0) {
                    outputChannel.appendLine(`[graphics-h] ✓ Program finished successfully`);
                } else if (code !== null) {
                    outputChannel.appendLine(`[graphics-h] ✗ Program exited with code ${code}`);
                } else {
                    outputChannel.appendLine(`[graphics-h] Program stopped`);
                }
                resolve();
            });

            runProcess.on('error', (error) => {
                outputChannel.appendLine('');
                outputChannel.appendLine('[graphics-h] Program execution failed:');
                outputChannel.appendLine(error.message);
                vscode.window.showErrorMessage('Failed to run program. Check Output panel.');
                resolve();
            });
        });
    }

    // Check if toolchain is ready
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

    // Get installation status details
    async getInstallationStatus(): Promise<{
        installed: boolean;
        missing: string[];
    }> {
        const missing: string[] = [];

        // Check files
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

        // Check compiler
        const compilerCheck = await this.runCommand('which i686-w64-mingw32-g++');
        if (!compilerCheck.success) {
            missing.push('MinGW compiler (i686-w64-mingw32-g++)');
        }

        // Check Wine
        const wineCheck = await this.runCommand('which wine');
        if (!wineCheck.success) {
            missing.push('Wine');
        }

        return {
            installed: missing.length === 0,
            missing
        };
    }

    // Show detailed status
    async showDetailedStatus(): Promise<void> {
        const status = await this.getInstallationStatus();

        if (status.installed) {
            vscode.window.showInformationMessage(
                '✓ Graphics.h toolchain is fully installed!\n\n' +
                'Platform: Ubuntu/Linux\n' +
                'Compiler: i686-w64-mingw32-g++\n' +
                'Runtime: Wine\n' +
                'Status: Ready'
            );
        } else {
            const message = 
                '⚠️ Graphics.h toolchain is not fully installed\n\n' +
                `Missing components:\n${status.missing.map(m => `  • ${m}`).join('\n')}\n\n` +
                'Would you like to see the installation command?';

            const choice = await vscode.window.showWarningMessage(
                message,
                { modal: true },
                'Show Installation Command'
            );
            
            if (choice === 'Show Installation Command') {
                await this.promptForInstallation();
            }
        }
    }
}