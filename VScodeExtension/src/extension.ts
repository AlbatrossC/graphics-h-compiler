import * as vscode from 'vscode';
import { PathManager, OperatingSystem } from './paths';
import { WindowsDownloader } from './windowsDownloader';
import { UbuntuDownloader } from './ubuntuDownloader';
import { GraphicsCompiler } from './compiler';
import { TurboCRunner } from './turbocrunner';

let pathManager: PathManager;
let windowsDownloader: WindowsDownloader | null = null;
let ubuntuDownloader: UbuntuDownloader | null = null;
let compiler: GraphicsCompiler;
let turboCRunner: TurboCRunner;
let statusBarItem: vscode.StatusBarItem;
let statusBarInterval: ReturnType<typeof setInterval> | null = null;

export function activate(context: vscode.ExtensionContext) {
    console.log('Graphics.h Compiler extension activated');

    pathManager = new PathManager(context);
    const currentOS = pathManager.getOS();

    if (currentOS === OperatingSystem.Windows) {
        windowsDownloader = new WindowsDownloader();
    } else if (currentOS === OperatingSystem.Linux) {
        ubuntuDownloader = new UbuntuDownloader();
    }

    compiler = new GraphicsCompiler(pathManager);
    turboCRunner = new TurboCRunner(context);

    const osName = pathManager.getOSDisplayName();
    console.log(`Detected OS: ${osName}`);

    if (currentOS !== OperatingSystem.Windows && currentOS !== OperatingSystem.Linux) {
        vscode.window.showErrorMessage(
            'Graphics.h Compiler: This extension only works on Windows and Ubuntu/Linux.',
            'OK'
        );
        return;
    }

    const hasShownWelcome = context.globalState.get<boolean>('graphics-h.welcomeShown', false);
    if (!hasShownWelcome) {
        showWelcomeMessage(context);
        context.globalState.update('graphics-h.welcomeShown', true);
    }

    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    context.subscriptions.push(statusBarItem);

    // Update status bar on editor change
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => updateStatusBar(editor))
    );

    // Poll only when a C++ file is active — still needed to reflect running state
    // But register the interval so it can be cleaned up on deactivate
    statusBarInterval = setInterval(() => {
        updateStatusBar(vscode.window.activeTextEditor);
    }, 1000);

    // Seed initial state
    updateStatusBar(vscode.window.activeTextEditor);

    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'graphics-h-compiler.compileAndRun',
            handleCompileAndRun
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'graphics-h-compiler.compileAndRunWinBGI',
            handleCompileAndRun
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'graphics-h-compiler.compileAndRunTurboC',
            handleCompileAndRunTurboC
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'graphics-h-compiler.compileOnly',
            handleCompileOnly
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'graphics-h-compiler.setupToolchain',
            handleSetupToolchain
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'graphics-h-compiler.stopProgram',
            handleStopProgram
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'graphics-h-compiler.checkDependencies',
            handleCheckDependencies
        )
    );

    context.subscriptions.push({
        dispose: () => {
            if (compiler) {
                compiler.dispose();
            }
        }
    });

    checkDependenciesQuietly();
}

function showWelcomeMessage(context: vscode.ExtensionContext): void {
    const osName = pathManager.getOSDisplayName();
    vscode.window.showInformationMessage(
        `Graphics.h Compiler activated on ${osName}! Ready to compile and run graphics programs.`,
        'Check Dependencies',
        'Dismiss'
    ).then(choice => {
        if (choice === 'Check Dependencies') {
            handleCheckDependencies();
        }
    });
}

function updateStatusBar(editor: vscode.TextEditor | undefined): void {
    const isCppFile = editor && (
        editor.document.languageId === 'cpp' ||
        editor.document.fileName.endsWith('.c++')
    );
    if (isCppFile) {
        if (compiler && compiler.isProgramRunning()) {
            statusBarItem.text = '$(debug-stop) Stop Graphics';
            statusBarItem.tooltip = 'Stop Running Graphics Program';
            statusBarItem.command = 'graphics-h-compiler.stopProgram';
        } else {
            statusBarItem.text = '$(play) Run Graphics';
            statusBarItem.tooltip = 'Compile & Run Graphics Program (Ctrl+Alt+N)';
            statusBarItem.command = 'graphics-h-compiler.compileAndRun';
        }
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

async function checkDependenciesQuietly(): Promise<void> {
    const missing = pathManager.getMissingDependencies();
    if (missing.length > 0) {
        console.log('Graphics.h dependencies not installed:', missing.join(', '));
    } else {
        console.log('Graphics.h toolchain is ready');
    }
}

async function handleCheckDependencies(): Promise<void> {
    const missing = pathManager.getMissingDependencies();
    const required = pathManager.getRequiredDependencies();
    const osName = pathManager.getOSDisplayName();

    if (missing.length === 0) {
        vscode.window.showInformationMessage(
            `✓ All dependencies are installed! Platform: ${osName} | Required: ${required.join(', ')}`
        );
        return;
    }

    const choice = await vscode.window.showWarningMessage(
        `⚠️ Missing dependencies on ${osName}: ${missing.join(', ')}. Would you like to install them now?`,
        { modal: true },
        'Install Now',
        'Cancel'
    );

    if (choice === 'Install Now') {
        await handleSetupToolchain();
    }
}

async function waitForToolchainWindows(): Promise<boolean> {
    const missing = pathManager.getMissingDependencies();

    if (missing.length === 0) {
        return true;
    }

    if (windowsDownloader?.isInProgress()) {
        vscode.window.showInformationMessage('⏳ Toolchain installation is already in progress. Please wait...');
        return false;
    }

    const hasPermission = await windowsDownloader!.promptForPermission();

    if (!hasPermission) {
        vscode.window.showInformationMessage(
            'ℹ️ Graphics.h toolchain is required to compile programs. ' +
            'Install anytime via Command Palette → "Graphics.h: Setup Graphics.h Toolchain"',
            'OK'
        );
        return false;
    }

    const targetPath = pathManager.getToolchainPath();
    return await windowsDownloader!.download(targetPath, pathManager.getExtensionPath());
}

async function waitForToolchainUbuntu(): Promise<boolean> {
    const missing = pathManager.getMissingDependencies();

    if (missing.length === 0) {
        return true;
    }

    return await ubuntuDownloader!.promptForInstallation();
}

async function waitForToolchain(): Promise<boolean> {
    if (pathManager.isWindows()) {
        return waitForToolchainWindows();
    } else if (pathManager.isLinux()) {
        return waitForToolchainUbuntu();
    }
    return false;
}

async function handleCompileAndRun(): Promise<void> {
    try {
        const ready = await waitForToolchain();
        if (!ready) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No file is currently open');
            return;
        }

        const filePath = editor.document.uri.fsPath;

        if (!filePath.endsWith('.cpp') && !filePath.endsWith('.c++')) {
            vscode.window.showErrorMessage('Current file is not a C++ file (.cpp or .c++)');
            return;
        }

        if (editor.document.isDirty) {
            const saved = await editor.document.save();
            if (!saved) {
                vscode.window.showErrorMessage('Failed to save file. Please save manually and try again.');
                return;
            }
        }

        // Wire up cancellation via progress notification
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Compiling ${editor.document.fileName.split(/[\\/]/).pop()}...`,
                cancellable: true
            },
            async (_progress, token) => {
                await compiler.compileAndRun(filePath, token);
            }
        );

        updateStatusBar(editor);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Compilation failed: ${errorMsg}`);
        console.error('Compilation error:', error);
    }
}

async function handleCompileAndRunTurboC(): Promise<void> {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No file is currently open');
            return;
        }

        const filePath = editor.document.uri.fsPath;

        if (!filePath.endsWith('.cpp') && !filePath.endsWith('.c++')) {
            vscode.window.showErrorMessage('Current file is not a C++ file (.cpp or .c++)');
            return;
        }

        if (editor.document.isDirty) {
            const saved = await editor.document.save();
            if (!saved) {
                vscode.window.showErrorMessage('Failed to save file. Please save manually and try again.');
                return;
            }
        }

        await turboCRunner.compileAndRun(filePath);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Turbo C Compilation failed: ${errorMsg}`);
        console.error('Turbo C Compilation error:', error);
    }
}

async function handleCompileOnly(): Promise<void> {
    try {
        const ready = await waitForToolchain();
        if (!ready) {
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No file is currently open');
            return;
        }

        const filePath = editor.document.uri.fsPath;

        if (!filePath.endsWith('.cpp') && !filePath.endsWith('.c++')) {
            vscode.window.showErrorMessage('Current file is not a C++ file (.cpp or .c++)');
            return;
        }

        if (editor.document.isDirty) {
            const saved = await editor.document.save();
            if (!saved) {
                vscode.window.showErrorMessage('Failed to save file. Please save manually and try again.');
                return;
            }
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Compiling ${editor.document.fileName.split(/[\\/]/).pop()}...`,
                cancellable: true
            },
            async (_progress, token) => {
                await compiler.compile(filePath, token);
            }
        );

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Compilation failed: ${errorMsg}`);
        console.error('Compilation error:', error);
    }
}

async function handleSetupToolchainWindows(): Promise<boolean> {
    try {
        const missing = pathManager.getMissingDependencies();
        const osName = pathManager.getOSDisplayName();

        if (missing.length === 0) {
            const choice = await vscode.window.showWarningMessage(
                `All dependencies are already installed on ${osName}. Do you want to reinstall?`,
                { modal: true },
                'Reinstall',
                'Cancel'
            );

            if (choice !== 'Reinstall') {
                return true;
            }
        }

        const hasPermission = await windowsDownloader!.promptForPermission();

        if (!hasPermission) {
            return false;
        }

        const targetPath = pathManager.getToolchainPath();
        return await windowsDownloader!.download(targetPath, pathManager.getExtensionPath());

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Setup failed: ${errorMsg}`);
        console.error('Setup error:', error);
        return false;
    }
}

async function handleSetupToolchainUbuntu(): Promise<boolean> {
    try {
        const missing = pathManager.getMissingDependencies();

        if (missing.length === 0) {
            await ubuntuDownloader!.showDetailedStatus();
            return true;
        }

        return await ubuntuDownloader!.promptForInstallation();

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Setup failed: ${errorMsg}`);
        console.error('Setup error:', error);
        return false;
    }
}

async function handleSetupToolchain(): Promise<boolean> {
    if (pathManager.isWindows()) {
        return handleSetupToolchainWindows();
    } else if (pathManager.isLinux()) {
        return handleSetupToolchainUbuntu();
    }
    return false;
}

async function handleStopProgram(): Promise<void> {
    if (compiler && compiler.isProgramRunning()) {
        const stopped = compiler.stopRunningProgram();
        if (stopped) {
            vscode.window.showInformationMessage('Graphics program stopped');
            updateStatusBar(vscode.window.activeTextEditor);
        }
    } else {
        vscode.window.showInformationMessage('No graphics program is currently running');
    }
}

export function deactivate() {
    // Clean up the polling interval
    if (statusBarInterval !== null) {
        clearInterval(statusBarInterval);
        statusBarInterval = null;
    }

    if (statusBarItem) {
        statusBarItem.dispose();
    }

    if (compiler) {
        compiler.dispose();
    }

    console.log('Graphics.h Compiler extension deactivated');
}