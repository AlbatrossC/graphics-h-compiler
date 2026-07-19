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
let statusBarItem: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Graphics.h Compiler extension activated');

    pathManager = new PathManager(context);
    const currentOS = pathManager.getOS();

    if (currentOS === OperatingSystem.Windows) {
        windowsDownloader = new WindowsDownloader();
    } else if (currentOS === OperatingSystem.Linux) {
        ubuntuDownloader = new UbuntuDownloader(pathManager);
    }

    compiler = new GraphicsCompiler(pathManager);
    turboCRunner = new TurboCRunner(context);

    const osName = pathManager.getOSDisplayName();
    console.log(`Detected OS: ${osName}`);

    if (currentOS === OperatingSystem.Unknown) {
        vscode.window.showErrorMessage(
            'Graphics.h Compiler could not identify this operating system.',
            'OK'
        );
        return;
    }

    const hasShownWelcome = context.globalState.get<boolean>('graphics-h.welcomeShown', false);
    if (!hasShownWelcome) {
        showWelcomeMessage();
        context.globalState.update('graphics-h.welcomeShown', true);
    }

    if (pathManager.supportsNativeWinBGI()) {
        statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        context.subscriptions.push(statusBarItem);
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => updateStatusBar(editor)),
            compiler.onDidChangeRunState(() => updateStatusBar(vscode.window.activeTextEditor))
        );
        updateStatusBar(vscode.window.activeTextEditor);
    }

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

    checkDependenciesQuietly();
}

function showWelcomeMessage(): void {
    const osName = pathManager.getOSDisplayName();
    const message = pathManager.isMacOS()
        ? 'Graphics.h Compiler activated on macOS. Turbo C mode is available, but macOS support is unverified. WinBGI native mode is unavailable.'
        : `Graphics.h Compiler activated on ${osName}! Ready to compile and run graphics programs.`;
    vscode.window.showInformationMessage(
        message,
        'Check Dependencies',
        'Dismiss'
    ).then(choice => {
        if (choice === 'Check Dependencies') {
            handleCheckDependencies();
        }
    });
}

function updateStatusBar(editor: vscode.TextEditor | undefined): void {
    if (!statusBarItem) {
        return;
    }

    const isCppFile = editor && isCppDocument(editor.document);
    if (isCppFile) {
        if (compiler && compiler.isProgramRunning()) {
            statusBarItem.text = '$(debug-stop) Stop Graphics';
            statusBarItem.tooltip = 'Stop Running Graphics Program';
            statusBarItem.command = 'graphics-h-compiler.stopProgram';
        } else {
            statusBarItem.text = '$(play) Run Graphics';
            statusBarItem.tooltip = 'Compile & Run Graphics Program (Ctrl+Alt+N)';
            statusBarItem.command = 'graphics-h-compiler.compileAndRunWinBGI';
        }
        statusBarItem.show();
    } else {
        statusBarItem.hide();
    }
}

function checkDependenciesQuietly(): void {
    if (!pathManager.supportsNativeWinBGI()) {
        return;
    }

    const missing = pathManager.getMissingDependencies();
    if (missing.length > 0) {
        console.log('Graphics.h dependencies not installed:', missing.join(', '));
    } else {
        console.log('Graphics.h toolchain is ready');
    }
}

async function handleCheckDependencies(): Promise<void> {
    if (!pathManager.supportsNativeWinBGI()) {
        vscode.window.showInformationMessage(
            'Turbo C mode is available on macOS. WinBGI native mode requires Windows or Ubuntu/Linux.'
        );
        return;
    }

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
        'Install Now'
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
    vscode.window.showErrorMessage('WinBGI native mode is available only on Windows and Ubuntu/Linux. Try Turbo C mode on macOS.');
    return false;
}

function isCppDocument(document: vscode.TextDocument): boolean {
    return document.languageId === 'cpp' || ['.cpp', '.c++', '.cc', '.cxx'].some(extension =>
        document.fileName.toLowerCase().endsWith(extension)
    );
}

async function getActiveCppFile(): Promise<string | null> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No file is currently open');
        return null;
    }

    if (!isCppDocument(editor.document)) {
        vscode.window.showErrorMessage('Current file is not a C++ file (.cpp, .c++, .cc, or .cxx)');
        return null;
    }

    if (editor.document.isDirty) {
        const saved = await editor.document.save();
        if (!saved) {
            vscode.window.showErrorMessage('Failed to save file. Please save manually and try again.');
            return null;
        }
    }

    return editor.document.uri.fsPath;
}

async function handleCompileAndRun(): Promise<void> {
    try {
        const ready = await waitForToolchain();
        if (!ready) {
            return;
        }

        const filePath = await getActiveCppFile();
        if (!filePath) {
            return;
        }

        // Wire up cancellation via progress notification
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Compiling ${filePath.split(/[\\/]/).pop()}...`,
                cancellable: true
            },
            async (_progress, token) => {
                await compiler.compileAndRun(filePath, token);
            }
        );

        updateStatusBar(vscode.window.activeTextEditor);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Compilation failed: ${errorMsg}`);
        console.error('Compilation error:', error);
    }
}

async function handleCompileAndRunTurboC(): Promise<void> {
    try {
        const filePath = await getActiveCppFile();
        if (!filePath) {
            return;
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

        const filePath = await getActiveCppFile();
        if (!filePath) {
            return;
        }

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Compiling ${filePath.split(/[\\/]/).pop()}...`,
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
                'Reinstall'
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
    vscode.window.showInformationMessage('Turbo C mode is available on macOS. WinBGI native mode requires Windows or Ubuntu/Linux.');
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
    if (compiler) {
        compiler.dispose();
    }

    console.log('Graphics.h Compiler extension deactivated');
}
