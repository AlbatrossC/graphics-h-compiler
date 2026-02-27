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

interface CompileConfig {
    command: string;
    args: string[];
    useShell: boolean;
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
        // Use path.resolve for safe path checking
        const resolvedPath = path.resolve(sourceFile);

        if (!fs.existsSync(resolvedPath)) {
            vscode.window.showErrorMessage('Source file does not exist');
            return false;
        }

        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
            vscode.window.showErrorMessage('Path is not a file');
            return false;
        }

        if (!resolvedPath.endsWith('.cpp') && !resolvedPath.endsWith('.c++')) {
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

        if (this.terminal) {
            this.terminal.dispose();
        }

        this.terminal = vscode.window.createTerminal('Graphics.h Run');
        return this.terminal;
    }

    private buildCompileConfig(sourceFile: string): CompileConfig {
        const outputPath = this.pathManager.getOutputPath(sourceFile);
        const graphicsPath = this.pathManager.getGraphicsPath();
        const libraryPath = this.pathManager.getLibraryPath();

        if (this.pathManager.isWindows()) {
            return {
                command: this.pathManager.getGppPath(),
                args: [
                    sourceFile,
                    '-I', graphicsPath,
                    '-L', libraryPath,
                    '-lbgi', '-lgdi32', '-lcomdlg32', '-luuid', '-loleaut32', '-lole32',
                    '-static-libgcc',
                    '-static-libstdc++',
                    '-static',
                    '-o', outputPath
                ],
                useShell: false
            };
        } else {
            // Linux: spawn directly, no bash -c, avoids shell injection
            return {
                command: 'i686-w64-mingw32-g++',
                args: [
                    sourceFile,
                    '-I', graphicsPath,
                    '-L', libraryPath,
                    '-lbgi', '-lgdi32', '-lcomdlg32', '-luuid', '-loleaut32', '-lole32',
                    '-static-libgcc',
                    '-static-libstdc++',
                    '-static',
                    '-o', outputPath
                ],
                useShell: false
            };
        }
    }

    // Unified compile implementation - no more Windows/Linux duplication
    private async runCompilation(
        sourceFile: string,
        token?: vscode.CancellationToken
    ): Promise<string | null> {
        const config = this.getConfig();
        const outputPath = this.pathManager.getOutputPath(sourceFile);
        const osLabel = this.pathManager.isWindows() ? 'Windows' : 'Ubuntu/Linux';

        this.clearDiagnostics(sourceFile);

        if (config.clearOutputBeforeCompile) {
            this.outputChannel.clear();
        }

        if (config.showOutput) {
            this.outputChannel.show(true);
        }

        this.outputChannel.appendLine(`[graphics-h] OS: ${osLabel}`);
        this.outputChannel.appendLine(`[graphics-h] Compiling: ${path.basename(sourceFile)}`);
        this.outputChannel.appendLine(`[graphics-h] Output: ${path.basename(outputPath)}`);
        this.outputChannel.appendLine('');

        const { command, args } = this.buildCompileConfig(sourceFile);

        return new Promise((resolve) => {
            const startTime = Date.now();

            const compilerProcess = spawn(command, args, {
                cwd: path.dirname(sourceFile)
            });

            this.activeProcesses.add(compilerProcess);

            let stderr = '';

            compilerProcess.stdout.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });

            compilerProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this.outputChannel.append(output);
            });

            const cancellationListener = token?.onCancellationRequested(() => {
                if (!compilerProcess.killed) {
                    compilerProcess.kill();
                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine('[graphics-h] Compilation cancelled by user');
                    this.activeProcesses.delete(compilerProcess);
                    cancellationListener?.dispose();
                    resolve(null);
                }
            });

            compilerProcess.on('close', (code) => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                this.activeProcesses.delete(compilerProcess);
                cancellationListener?.dispose();

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

                    vscode.window.showErrorMessage(message, 'Show Output', 'Show Problems')
                        .then(choice => {
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
                this.activeProcesses.delete(compilerProcess);
                cancellationListener?.dispose();

                this.outputChannel.appendLine('');
                this.outputChannel.appendLine(`[graphics-h] Compiler error: ${error.message}`);

                vscode.window.showErrorMessage(`Compiler error: ${error.message}`, 'Show Output')
                    .then(choice => {
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

        if (!this.pathManager.isWindows() && !this.pathManager.isLinux()) {
            vscode.window.showErrorMessage('Unsupported operating system');
            return null;
        }

        return this.runCompilation(sourceFile, token);
    }

    // Unified run implementation - no more Windows/Linux duplication
    private async runExecutable(exePath: string): Promise<void> {
        if (!fs.existsSync(exePath)) {
            vscode.window.showErrorMessage('Executable not found: ' + exePath);
            return;
        }

        const config = this.getConfig();

        // Build the run command based on OS
        const runCommand = this.pathManager.isWindows()
            ? { command: exePath, args: [] as string[] }
            : { command: 'wine', args: [exePath] };

        if (config.runInTerminal) {
            const terminal = this.getTerminal();
            terminal.show();
            this.outputChannel.appendLine(`[graphics-h] Running in terminal: ${path.basename(exePath)}`);
            this.outputChannel.appendLine('');

            if (this.pathManager.isWindows()) {
                // cmd /c handles quoting and works in both PowerShell and CMD
                terminal.sendText(`cmd /c "${exePath}"`);
            } else {
                terminal.sendText(`wine "${exePath}"`);
            }
            return;
        }

        this.outputChannel.appendLine(`[graphics-h] Running: ${path.basename(exePath)}`);
        this.outputChannel.appendLine('');

        const programProcess = spawn(runCommand.command, runCommand.args, {
            cwd: path.dirname(exePath),
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.runningProgram = programProcess;

        programProcess.stdout.on('data', (data) => {
            this.outputChannel.append(`[Program Output] ${data.toString()}`);
        });

        programProcess.stderr.on('data', (data) => {
            const output = data.toString();
            // Filter noisy Wine debug lines on Linux
            if (!output.includes('fixme:') && !output.includes('wine:')) {
                this.outputChannel.append(`[Program Error] ${output}`);
            }
        });

        programProcess.on('close', (code) => {
            this.runningProgram = null;
            this.outputChannel.appendLine('');
            if (code === 0) {
                this.outputChannel.appendLine('[graphics-h] Program finished successfully');
            } else if (code !== null) {
                this.outputChannel.appendLine(`[graphics-h] Program exited with code ${code}`);
            } else {
                this.outputChannel.appendLine('[graphics-h] Program stopped');
            }
        });

        programProcess.on('error', (error) => {
            this.runningProgram = null;
            this.outputChannel.appendLine('');
            this.outputChannel.appendLine('[graphics-h] Program execution failed:');
            this.outputChannel.appendLine(error.message);
            vscode.window.showErrorMessage('Failed to run program. Check Output panel.');
        });

        programProcess.on('exit', (_code, signal) => {
            if (signal) {
                this.outputChannel.appendLine(`[graphics-h] Program terminated by signal: ${signal}`);
            }
        });
    }

    async run(exePath: string): Promise<void> {
        if (!this.pathManager.isWindows() && !this.pathManager.isLinux()) {
            vscode.window.showErrorMessage('Unsupported operating system');
            return;
        }
        return this.runExecutable(exePath);
    }

    stopRunningProgram(): boolean {
        // If running as a managed process, kill it
        if (this.runningProgram && !this.runningProgram.killed) {
            this.outputChannel.appendLine('[graphics-h] Stopping program...');
            this.runningProgram.kill();
            this.runningProgram = null;
            return true;
        }

        // If running in terminal, send Ctrl+C first then dispose
        if (this.terminal && this.terminal.exitStatus === undefined) {
            this.outputChannel.appendLine('[graphics-h] Sending interrupt to terminal...');
            this.terminal.sendText('\x03'); // Ctrl+C
            // Give it a moment to handle the signal before disposing
            setTimeout(() => {
                if (this.terminal) {
                    this.terminal.dispose();
                    this.terminal = null;
                }
            }, 500);
            return true;
        }

        return false;
    }

    isProgramRunning(): boolean {
        return (
            (this.runningProgram !== null && !this.runningProgram.killed) ||
            (this.terminal !== null && this.terminal.exitStatus === undefined)
        );
    }

    async compileAndRun(
        sourceFile: string,
        token?: vscode.CancellationToken
    ): Promise<void> {
        const config = this.getConfig();

        if (this.isProgramRunning()) {
            this.stopRunningProgram();
        }

        const exePath = await this.compile(sourceFile, token);

        if (!exePath) {
            return;
        }

        if (config.autoRun) {
            await this.run(exePath);
        } else {
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