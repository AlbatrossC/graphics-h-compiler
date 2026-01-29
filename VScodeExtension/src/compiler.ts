import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { PathManager } from './paths';
import * as fs from 'fs';

interface CompilationError {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning';
    message: string;
}

export class GraphicsCompiler {
    private pathManager: PathManager;
    private outputChannel: vscode.OutputChannel;
    private activeProcesses: Set<ChildProcess> = new Set();
    private diagnosticCollection: vscode.DiagnosticCollection;
    private runningProgram: ChildProcess | null = null;
    private terminal: vscode.Terminal | null = null;

    constructor(pathManager: PathManager) {
        this.pathManager = pathManager;
        this.outputChannel = vscode.window.createOutputChannel('Graphics.h Compiler');
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('graphics-h');
    }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('graphics-h-compiler');
        return {
            autoRun: config.get<boolean>('autoRun', true),
            showOutput: config.get<boolean>('showOutputPanel', true),
            clearOutputBeforeCompile: config.get<boolean>('clearOutputBeforeCompile', true),
            runInTerminal: config.get<boolean>('runInTerminal', true)
        };
    }

    private validateSourceFile(sourceFile: string): boolean {
        const normalizedPath = path.normalize(sourceFile);

        if (normalizedPath.includes('..')) {
            vscode.window.showErrorMessage('Invalid file path: Path traversal detected');
            return false;
        }

        if (!fs.existsSync(normalizedPath)) {
            vscode.window.showErrorMessage('Source file does not exist');
            return false;
        }

        const stats = fs.statSync(normalizedPath);
        if (!stats.isFile()) {
            vscode.window.showErrorMessage('Path is not a file');
            return false;
        }

        if (!normalizedPath.endsWith('.cpp') && !normalizedPath.endsWith('.c++')) {
            vscode.window.showErrorMessage('File must be a C++ source file (.cpp or .c++)');
            return false;
        }

        return true;
    }

    private parseCompilerErrors(stderr: string, sourceFile: string): CompilationError[] {
        const errors: CompilationError[] = [];
        const errorRegex = /^(.+?):(\d+):(\d+):\s+(error|warning):\s+(.+)$/gm;

        let match;
        while ((match = errorRegex.exec(stderr)) !== null) {
            const [_, file, line, column, severity, message] = match;

            errors.push({
                file: file.trim(),
                line: parseInt(line, 10),
                column: parseInt(column, 10),
                severity: severity as 'error' | 'warning',
                message: message.trim()
            });
        }

        return errors;
    }

    private updateDiagnostics(errors: CompilationError[], sourceFile: string): void {
        const diagnostics: vscode.Diagnostic[] = [];
        const uri = vscode.Uri.file(sourceFile);

        for (const error of errors) {
            const line = Math.max(0, error.line - 1);
            const column = Math.max(0, error.column - 1);

            const range = new vscode.Range(
                new vscode.Position(line, column),
                new vscode.Position(line, column + 100)
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                error.message,
                error.severity === 'error'
                    ? vscode.DiagnosticSeverity.Error
                    : vscode.DiagnosticSeverity.Warning
            );

            diagnostic.source = 'graphics-h-compiler';
            diagnostics.push(diagnostic);
        }

        this.diagnosticCollection.set(uri, diagnostics);
    }

    private clearDiagnostics(sourceFile: string): void {
        const uri = vscode.Uri.file(sourceFile);
        this.diagnosticCollection.delete(uri);
    }

    private getTerminal(): vscode.Terminal {
        if (this.terminal && this.terminal.exitStatus === undefined) {
            return this.terminal;
        }

        // Dispose old terminal if it exists but has exit status (meaning it was closed)
        if (this.terminal) {
            this.terminal.dispose();
        }

        this.terminal = vscode.window.createTerminal('Graphics.h Run');
        return this.terminal;
    }

    private async compileWindows(sourceFile: string, token?: vscode.CancellationToken): Promise<string | null> {
        const config = this.getConfig();
        const gppPath = this.pathManager.getGppPath();
        const graphicsPath = this.pathManager.getGraphicsPath();
        const libraryPath = this.pathManager.getLibraryPath();
        const outputPath = this.pathManager.getOutputPath(sourceFile);

        this.clearDiagnostics(sourceFile);

        if (config.clearOutputBeforeCompile) {
            this.outputChannel.clear();
        }

        if (config.showOutput) {
            this.outputChannel.show(true);
        }

        this.outputChannel.appendLine(`[graphics-h] OS: Windows`);
        this.outputChannel.appendLine(`[graphics-h] Compiling: ${path.basename(sourceFile)}`);
        this.outputChannel.appendLine(`[graphics-h] Output: ${path.basename(outputPath)}`);
        this.outputChannel.appendLine('');

        return new Promise((resolve) => {
            const startTime = Date.now();

            const command = gppPath;
            const args = [
                sourceFile,
                '-I', graphicsPath,
                '-L', libraryPath,
                '-lbgi', '-lgdi32', '-lcomdlg32', '-luuid', '-loleaut32', '-lole32',
                '-static-libgcc',
                '-static-libstdc++',
                '-static',
                '-o', outputPath
            ];

            const compilerProcess = spawn(command, args, {
                cwd: path.dirname(sourceFile)
            });

            this.activeProcesses.add(compilerProcess);

            let stderr = '';
            let stdout = '';

            compilerProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            compilerProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this.outputChannel.append(output);
            });

            token?.onCancellationRequested(() => {
                if (!compilerProcess.killed) {
                    compilerProcess.kill();
                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine('[graphics-h] Compilation cancelled by user');
                    this.activeProcesses.delete(compilerProcess);
                    resolve(null);
                }
            });

            compilerProcess.on('close', (code) => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                this.activeProcesses.delete(compilerProcess);

                if (code !== 0) {
                    if (stderr.trim().length === 0) {
                        this.outputChannel.appendLine('error: compilation failed with no error output');
                    }

                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine(`[graphics-h] Build failed (${duration}s)`);

                    const errors = this.parseCompilerErrors(stderr, sourceFile);
                    this.updateDiagnostics(errors, sourceFile);

                    const errorCount = errors.filter(e => e.severity === 'error').length;
                    const warningCount = errors.filter(e => e.severity === 'warning').length;

                    let message = `Compilation failed: ${errorCount} error${errorCount !== 1 ? 's' : ''}`;
                    if (warningCount > 0) {
                        message += `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
                    }

                    vscode.window.showErrorMessage(
                        message,
                        'Show Output',
                        'Show Problems'
                    ).then(choice => {
                        if (choice === 'Show Output') {
                            this.outputChannel.show();
                        } else if (choice === 'Show Problems') {
                            vscode.commands.executeCommand('workbench.actions.view.problems');
                        }
                    });

                    resolve(null);
                } else {
                    this.outputChannel.appendLine(`[graphics-h] Build succeeded (${duration}s)`);
                    this.outputChannel.appendLine(`[graphics-h] Executable: ${path.basename(outputPath)}`);

                    resolve(outputPath);
                }
            });

            compilerProcess.on('error', (error) => {
                this.outputChannel.appendLine('');
                this.outputChannel.appendLine(`[graphics-h] Compiler error: ${error.message}`);

                this.activeProcesses.delete(compilerProcess);

                vscode.window.showErrorMessage(
                    `Compiler error: ${error.message}`,
                    'Show Output'
                ).then(choice => {
                    if (choice === 'Show Output') {
                        this.outputChannel.show();
                    }
                });

                resolve(null);
            });
        });
    }

    private async compileLinux(sourceFile: string, token?: vscode.CancellationToken): Promise<string | null> {
        const config = this.getConfig();
        const outputPath = this.pathManager.getOutputPath(sourceFile);

        this.clearDiagnostics(sourceFile);

        if (config.clearOutputBeforeCompile) {
            this.outputChannel.clear();
        }

        if (config.showOutput) {
            this.outputChannel.show(true);
        }

        this.outputChannel.appendLine(`[graphics-h] OS: Ubuntu/Linux`);
        this.outputChannel.appendLine(`[graphics-h] Compiling: ${path.basename(sourceFile)}`);
        this.outputChannel.appendLine(`[graphics-h] Output: ${path.basename(outputPath)}`);
        this.outputChannel.appendLine('');

        return new Promise((resolve) => {
            const startTime = Date.now();

            const compileCmd = `i686-w64-mingw32-g++ "${sourceFile}" -I /usr/local/include/graphics_h -L /usr/local/lib/graphics_h -lbgi -lgdi32 -lcomdlg32 -luuid -loleaut32 -lole32 -static-libgcc -static-libstdc++ -static -o "${outputPath}"`;

            const compilerProcess = spawn('bash', ['-c', compileCmd], {
                cwd: path.dirname(sourceFile)
            });

            this.activeProcesses.add(compilerProcess);

            let stderr = '';
            let stdout = '';

            compilerProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                this.outputChannel.append(output);
            });

            compilerProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this.outputChannel.append(output);
            });

            token?.onCancellationRequested(() => {
                if (!compilerProcess.killed) {
                    compilerProcess.kill();
                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine('[graphics-h] Compilation cancelled by user');
                    this.activeProcesses.delete(compilerProcess);
                    resolve(null);
                }
            });

            compilerProcess.on('close', (code) => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                this.activeProcesses.delete(compilerProcess);

                if (code !== 0) {
                    if (stderr.trim().length === 0) {
                        this.outputChannel.appendLine('error: compilation failed with no error output');
                    }

                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine(`[graphics-h] Build failed (${duration}s)`);

                    const errors = this.parseCompilerErrors(stderr, sourceFile);
                    this.updateDiagnostics(errors, sourceFile);

                    const errorCount = errors.filter(e => e.severity === 'error').length;
                    const warningCount = errors.filter(e => e.severity === 'warning').length;

                    let message = `Compilation failed: ${errorCount} error${errorCount !== 1 ? 's' : ''}`;
                    if (warningCount > 0) {
                        message += `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`;
                    }

                    vscode.window.showErrorMessage(
                        message,
                        'Show Output',
                        'Show Problems'
                    ).then(choice => {
                        if (choice === 'Show Output') {
                            this.outputChannel.show();
                        } else if (choice === 'Show Problems') {
                            vscode.commands.executeCommand('workbench.actions.view.problems');
                        }
                    });

                    resolve(null);
                } else {
                    this.outputChannel.appendLine(`[graphics-h] Build succeeded (${duration}s)`);
                    this.outputChannel.appendLine(`[graphics-h] Executable: ${path.basename(outputPath)}`);

                    resolve(outputPath);
                }
            });

            compilerProcess.on('error', (error) => {
                this.outputChannel.appendLine('');
                this.outputChannel.appendLine(`[graphics-h] Compiler error: ${error.message}`);

                this.activeProcesses.delete(compilerProcess);

                vscode.window.showErrorMessage(
                    `Compiler error: ${error.message}`,
                    'Show Output'
                ).then(choice => {
                    if (choice === 'Show Output') {
                        this.outputChannel.show();
                    }
                });

                resolve(null);
            });
        });
    }

    async compile(sourceFile: string, token?: vscode.CancellationToken): Promise<string | null> {
        if (!this.validateSourceFile(sourceFile)) {
            return null;
        }

        if (this.pathManager.isWindows()) {
            return this.compileWindows(sourceFile, token);
        } else if (this.pathManager.isLinux()) {
            return this.compileLinux(sourceFile, token);
        } else {
            vscode.window.showErrorMessage('Unsupported operating system');
            return null;
        }
    }

    private async runWindows(exePath: string): Promise<void> {
        if (!fs.existsSync(exePath)) {
            vscode.window.showErrorMessage('Executable not found: ' + exePath);
            return;
        }

        const config = this.getConfig();

        if (config.runInTerminal) {
            const terminal = this.getTerminal();
            terminal.show();
            this.outputChannel.appendLine(`[graphics-h] Running in terminal: ${path.basename(exePath)}`);
            this.outputChannel.appendLine('');

            // Use cmd /c to ensure execution works in both PowerShell and CMD, and handles quoting
            terminal.sendText(`cmd /c "${exePath}"`);
            return;
        }

        this.outputChannel.appendLine(`[graphics-h] Running: ${path.basename(exePath)}`);
        this.outputChannel.appendLine('');

        const programProcess = spawn(exePath, [], {
            cwd: path.dirname(exePath),
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.runningProgram = programProcess;

        programProcess.stdout.on('data', (data) => {
            this.outputChannel.append(`[Program Output] ${data.toString()}`);
        });

        programProcess.stderr.on('data', (data) => {
            this.outputChannel.append(`[Program Error] ${data.toString()}`);
        });

        programProcess.on('close', (code) => {
            this.runningProgram = null;
            this.outputChannel.appendLine('');
            if (code === 0) {
                this.outputChannel.appendLine(`[graphics-h] Program finished successfully`);
            } else if (code !== null) {
                this.outputChannel.appendLine(`[graphics-h] Program exited with code ${code}`);
            } else {
                this.outputChannel.appendLine(`[graphics-h] Program stopped`);
            }
        });

        programProcess.on('error', (error) => {
            this.runningProgram = null;
            this.outputChannel.appendLine('');
            this.outputChannel.appendLine('[graphics-h] Program execution failed:');
            this.outputChannel.appendLine(error.message);

            vscode.window.showErrorMessage('Failed to run program. Check Output panel.');
        });

        programProcess.on('exit', (code, signal) => {
            if (signal) {
                this.outputChannel.appendLine(`[graphics-h] Program terminated by signal: ${signal}`);
            }
        });
    }

    private async runLinux(exePath: string): Promise<void> {
        if (!fs.existsSync(exePath)) {
            vscode.window.showErrorMessage('Executable not found: ' + exePath);
            return;
        }

        const config = this.getConfig();

        if (config.runInTerminal) {
            const terminal = this.getTerminal();
            terminal.show();
            this.outputChannel.appendLine(`[graphics-h] Running in terminal: ${path.basename(exePath)}`);
            this.outputChannel.appendLine('');

            terminal.sendText(`wine "${exePath}"`);
            return;
        }

        this.outputChannel.appendLine(`[graphics-h] Running: ${path.basename(exePath)}`);
        this.outputChannel.appendLine('');

        const runCmd = `wine "${exePath}"`;

        const programProcess = spawn('bash', ['-c', runCmd], {
            cwd: path.dirname(exePath)
        });

        this.runningProgram = programProcess;

        programProcess.stdout.on('data', (data) => {
            this.outputChannel.append(`[Program Output] ${data.toString()}`);
        });

        programProcess.stderr.on('data', (data) => {
            const output = data.toString();
            if (!output.includes('fixme:') && !output.includes('wine:')) {
                this.outputChannel.append(`[Program Error] ${output}`);
            }
        });

        programProcess.on('close', (code) => {
            this.runningProgram = null;
            this.outputChannel.appendLine('');
            if (code === 0) {
                this.outputChannel.appendLine(`[graphics-h] Program finished successfully`);
            } else if (code !== null) {
                this.outputChannel.appendLine(`[graphics-h] Program exited with code ${code}`);
            } else {
                this.outputChannel.appendLine(`[graphics-h] Program stopped`);
            }
        });

        programProcess.on('error', (error) => {
            this.runningProgram = null;
            this.outputChannel.appendLine('');
            this.outputChannel.appendLine('[graphics-h] Program execution failed:');
            this.outputChannel.appendLine(error.message);

            vscode.window.showErrorMessage('Failed to run program. Check Output panel.');
        });

        programProcess.on('exit', (code, signal) => {
            if (signal) {
                this.outputChannel.appendLine(`[graphics-h] Program terminated by signal: ${signal}`);
            }
        });
    }

    async run(exePath: string): Promise<void> {
        if (this.pathManager.isWindows()) {
            return this.runWindows(exePath);
        } else if (this.pathManager.isLinux()) {
            return this.runLinux(exePath);
        } else {
            vscode.window.showErrorMessage('Unsupported operating system');
        }
    }

    stopRunningProgram(): boolean {
        if (this.runningProgram && !this.runningProgram.killed) {
            this.outputChannel.appendLine('[graphics-h] Stopping program...');
            this.runningProgram.kill();
            this.runningProgram = null;
            return true;
        }

        if (this.terminal) {
            this.outputChannel.appendLine('[graphics-h] Closing terminal...');
            this.terminal.dispose();
            this.terminal = null;
            return true;
        }

        return false;
    }

    isProgramRunning(): boolean {
        return this.runningProgram !== null && !this.runningProgram.killed;
    }

    async compileAndRun(sourceFile: string): Promise<void> {
        const config = this.getConfig();

        if (this.isProgramRunning()) {
            this.stopRunningProgram();
        }

        const exePath = await this.compile(sourceFile);

        if (exePath && config.autoRun) {
            await this.run(exePath);
        } else if (exePath && !config.autoRun) {
            const choice = await vscode.window.showInformationMessage(
                'Compilation successful',
                'Run Program'
            );
            if (choice === 'Run Program') {
                await this.run(exePath);
            }
        }
    }

    dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
        this.outputChannel.dispose();

        if (this.runningProgram && !this.runningProgram.killed) {
            this.runningProgram.kill();
        }

        if (this.terminal) {
            this.terminal.dispose();
        }

        this.activeProcesses.forEach(proc => {
            if (!proc.killed) {
                proc.kill();
            }
        });
        this.activeProcesses.clear();
    }
}