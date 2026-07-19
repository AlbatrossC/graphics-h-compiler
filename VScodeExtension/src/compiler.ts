import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { PathManager } from './paths';
import * as fs from 'fs';
import { CompilationDiagnostic, parseCompilerOutput } from './diagnostics';

export class GraphicsCompiler {
    private pathManager: PathManager;
    private outputChannel: vscode.OutputChannel;
    private activeProcesses: Set<ChildProcess> = new Set();
    private diagnosticCollection: vscode.DiagnosticCollection;
    private runningProgram: ChildProcess | null = null;
    private terminal: vscode.Terminal | null = null;
    private terminalExecution: vscode.TerminalShellExecution | null = null;
    private terminalCloseListener: vscode.Disposable | null = null;
    private terminalExecutionEndListener: vscode.Disposable | null = null;
    private readonly runStateEmitter = new vscode.EventEmitter<void>();

    readonly onDidChangeRunState = this.runStateEmitter.event;

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

        if (!this.isCppFile(resolvedPath)) {
            vscode.window.showErrorMessage('File must be a C++ source file (.cpp, .c++, .cc, or .cxx)');
            return false;
        }

        return true;
    }

    private isCppFile(filePath: string): boolean {
        return ['.cpp', '.c++', '.cc', '.cxx'].includes(path.extname(filePath).toLowerCase());
    }

    private updateDiagnostics(errors: CompilationDiagnostic[], sourceFile: string): void {
        const diagnosticsByUri = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();

        this.diagnosticCollection.clear();

        for (const error of errors) {
            const uri = vscode.Uri.file(error.file ?? sourceFile);
            const key = uri.toString();
            const entry = diagnosticsByUri.get(key) ?? { uri, diagnostics: [] };
            const line = Math.max(0, (error.line ?? 1) - 1);
            const column = Math.max(0, (error.column ?? 1) - 1);
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(new vscode.Position(line, column), new vscode.Position(line, column + 1)),
                error.message,
                this.toDiagnosticSeverity(error.severity)
            );

            diagnostic.source = 'graphics-h-compiler';
            entry.diagnostics.push(diagnostic);
            diagnosticsByUri.set(key, entry);
        }

        for (const { uri, diagnostics } of diagnosticsByUri.values()) {
            this.diagnosticCollection.set(uri, diagnostics);
        }
    }

    private toDiagnosticSeverity(severity: CompilationDiagnostic['severity']): vscode.DiagnosticSeverity {
        if (severity === 'warning') {
            return vscode.DiagnosticSeverity.Warning;
        }

        if (severity === 'information') {
            return vscode.DiagnosticSeverity.Information;
        }

        return vscode.DiagnosticSeverity.Error;
    }

    private clearDiagnostics(): void {
        this.diagnosticCollection.clear();
    }

    private getTerminal(): vscode.Terminal {
        if (this.terminal && this.terminal.exitStatus === undefined) {
            return this.terminal;
        }

        if (this.terminal) {
            this.terminal.dispose();
        }

        this.terminal = vscode.window.createTerminal('Graphics.h Run');
        this.terminalCloseListener?.dispose();
        this.terminalCloseListener = vscode.window.onDidCloseTerminal(closedTerminal => {
            if (closedTerminal === this.terminal) {
                this.terminal = null;
                this.terminalExecution = null;
                this.runStateEmitter.fire();
            }
        });
        return this.terminal;
    }

    private buildCompileConfig(sourceFile: string): { command: string; args: string[] } {
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
                ]
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
                ]
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

        this.clearDiagnostics();

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
            let cancelled = false;
            let settled = false;
            const finish = (result: string | null) => {
                if (!settled) {
                    settled = true;
                    resolve(result);
                }
            };

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
                    cancelled = true;
                    compilerProcess.kill();
                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine('[graphics-h] Compilation cancelled by user');
                    this.activeProcesses.delete(compilerProcess);
                    cancellationListener?.dispose();
                    finish(null);
                }
            });

            compilerProcess.on('close', (code) => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                this.activeProcesses.delete(compilerProcess);
                cancellationListener?.dispose();

                if (cancelled) {
                    return;
                }

                if (code !== 0) {
                    if (stderr.trim().length === 0) {
                        this.outputChannel.appendLine('error: compilation failed with no error output');
                    }

                    this.outputChannel.appendLine('');
                    this.outputChannel.appendLine(`[graphics-h] Build failed (${duration}s)`);

                    const errors = parseCompilerOutput(stderr, path.dirname(sourceFile));
                    this.updateDiagnostics(errors, sourceFile);

                    const errorCount = errors.filter(e => e.severity === 'error').length;
                    const warningCount = errors.filter(e => e.severity === 'warning').length;

                    let message = errorCount > 0
                        ? `Compilation failed: ${errorCount} error${errorCount !== 1 ? 's' : ''}`
                        : 'Compilation failed. Check the Output panel for details.';
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

                    finish(null);
                } else {
                    this.outputChannel.appendLine(`[graphics-h] Build succeeded (${duration}s)`);
                    this.outputChannel.appendLine(`[graphics-h] Executable: ${path.basename(outputPath)}`);
                    finish(outputPath);
                }
            });

            compilerProcess.on('error', (error) => {
                this.activeProcesses.delete(compilerProcess);
                cancellationListener?.dispose();

                if (cancelled) {
                    return;
                }

                this.outputChannel.appendLine('');
                this.outputChannel.appendLine(`[graphics-h] Compiler error: ${error.message}`);

                vscode.window.showErrorMessage(`Compiler error: ${error.message}`, 'Show Output')
                    .then(choice => {
                        if (choice === 'Show Output') {
                            this.outputChannel.show();
                        }
                    });

                finish(null);
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

    private async getTerminalShellIntegration(terminal: vscode.Terminal): Promise<vscode.TerminalShellIntegration | undefined> {
        if (terminal.shellIntegration) {
            return terminal.shellIntegration;
        }

        return new Promise(resolve => {
            const listener = vscode.window.onDidChangeTerminalShellIntegration(event => {
                if (event.terminal === terminal) {
                    clearTimeout(timeout);
                    listener.dispose();
                    resolve(event.shellIntegration);
                }
            });
            const timeout = setTimeout(() => {
                listener.dispose();
                resolve(terminal.shellIntegration);
            }, 1500);
        });
    }

    private trackTerminalExecution(execution: vscode.TerminalShellExecution): void {
        this.terminalExecution = execution;
        this.terminalExecutionEndListener?.dispose();
        this.terminalExecutionEndListener = vscode.window.onDidEndTerminalShellExecution(event => {
            if (event.execution === execution) {
                this.terminalExecution = null;
                this.terminalExecutionEndListener?.dispose();
                this.terminalExecutionEndListener = null;
                this.runStateEmitter.fire();
            }
        });
        this.runStateEmitter.fire();
    }

    private quoteForPosixShell(value: string): string {
        return `'${value.replace(/'/g, "'\\''")}'`;
    }

    private async runInTerminal(exePath: string): Promise<void> {
        const terminal = this.getTerminal();
        terminal.show();

        const shellIntegration = await this.getTerminalShellIntegration(terminal);
        if (shellIntegration) {
            const execution = this.pathManager.isWindows()
                ? shellIntegration.executeCommand(exePath, [])
                : shellIntegration.executeCommand('env', [
                    `WINEPREFIX=${this.pathManager.getWinePrefix()}`,
                    'WINEDEBUG=-all',
                    'wine',
                    exePath
                ]);
            this.trackTerminalExecution(execution);
            return;
        }

        // Shell integration is unavailable in a small number of terminals. The command
        // still runs, but VS Code cannot reliably report its completion or stop it.
        if (this.pathManager.isWindows()) {
            terminal.sendText(`"${exePath.replace(/"/g, '""')}"`, true);
        } else {
            terminal.sendText(
                `WINEPREFIX=${this.quoteForPosixShell(this.pathManager.getWinePrefix())} WINEDEBUG=-all wine ${this.quoteForPosixShell(exePath)}`,
                true
            );
        }
        vscode.window.showWarningMessage(
            'Terminal shell integration is unavailable. The program started, but its running state cannot be tracked.'
        );
    }

    // Unified run implementation - no Windows/Linux duplication
    private async runExecutable(exePath: string): Promise<void> {
        if (!fs.existsSync(exePath)) {
            vscode.window.showErrorMessage('Executable not found: ' + exePath);
            return;
        }

        const config = this.getConfig();

        const runCommand = this.pathManager.isWindows()
            ? { command: exePath, args: [] as string[], env: process.env }
            : {
                command: 'wine',
                args: [exePath],
                env: {
                    ...process.env,
                    WINEPREFIX: this.pathManager.getWinePrefix(),
                    WINEDEBUG: '-all'
                }
            };

        if (config.runInTerminal) {
            this.outputChannel.appendLine(`[graphics-h] Running in terminal: ${path.basename(exePath)}`);
            this.outputChannel.appendLine('');
            await this.runInTerminal(exePath);
            return;
        }

        this.outputChannel.appendLine(`[graphics-h] Running: ${path.basename(exePath)}`);
        this.outputChannel.appendLine('');

        const programProcess = spawn(runCommand.command, runCommand.args, {
            cwd: path.dirname(exePath),
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: runCommand.env
        });

        this.runningProgram = programProcess;
        this.runStateEmitter.fire();

        programProcess.stdout.on('data', (data) => {
            this.outputChannel.append(`[Program Output] ${data.toString()}`);
        });

        programProcess.stderr.on('data', (data) => {
            this.outputChannel.append(`[Program Error] ${data.toString()}`);
        });

        programProcess.on('close', (code) => {
            this.runningProgram = null;
            this.runStateEmitter.fire();
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
            this.runStateEmitter.fire();
            this.outputChannel.appendLine('');
            this.outputChannel.appendLine('[graphics-h] Program execution failed:');
            this.outputChannel.appendLine(error.message);
            const wineHint = this.pathManager.isLinux()
                ? ' Check that Wine is installed and that the Graphics.h toolchain setup completed.'
                : '';
            vscode.window.showErrorMessage(`Failed to run program. Check Output panel.${wineHint}`);
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
            this.runStateEmitter.fire();
            return true;
        }

        if (this.terminal && this.terminalExecution) {
            this.outputChannel.appendLine('[graphics-h] Sending interrupt to terminal...');
            this.terminal.sendText('\x03');
            return true;
        }

        return false;
    }

    isProgramRunning(): boolean {
        return (
            (this.runningProgram !== null && !this.runningProgram.killed) ||
            this.terminalExecution !== null
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
        this.runStateEmitter.dispose();

        if (this.runningProgram && !this.runningProgram.killed) {
            this.runningProgram.kill();
        }

        if (this.terminal) {
            this.terminal.dispose();
        }

        this.terminalCloseListener?.dispose();
        this.terminalExecutionEndListener?.dispose();

        this.activeProcesses.forEach(proc => {
            if (!proc.killed) {
                proc.kill();
            }
        });
        this.activeProcesses.clear();
    }
}
