import * as vscode from 'vscode';
import { PathManager, OperatingSystem } from './paths';
import { WindowsDownloader } from './windowsDownloader';
import { UbuntuDownloader } from './ubuntuDownloader';
import { GraphicsCompiler } from './compiler';

let pathManager: PathManager;
let windowsDownloader: WindowsDownloader | null = null;
let ubuntuDownloader: UbuntuDownloader | null = null;
let compiler: GraphicsCompiler;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('Graphics.h Compiler extension activated');

    // Initialize core managers
    pathManager = new PathManager(context);
    const currentOS = pathManager.getOS();
    
    // Initialize OS-specific downloader
    if (currentOS === OperatingSystem.Windows) {
        windowsDownloader = new WindowsDownloader();
    } else if (currentOS === OperatingSystem.Linux) {
        ubuntuDownloader = new UbuntuDownloader();
    }
    
    compiler = new GraphicsCompiler(pathManager);

    // Show OS detection info
    const osName = pathManager.getOSDisplayName();
    console.log(`Detected OS: ${osName}`);

    // Check for unsupported OS
    if (currentOS !== OperatingSystem.Windows && currentOS !== OperatingSystem.Linux) {
        vscode.window.showErrorMessage(
            'Graphics.h Compiler: This extension only works on Windows and Ubuntu/Linux.',
            'OK'
        );
        return;
    }

    // Display welcome message on first activation
    const hasShownWelcome = context.globalState.get<boolean>('graphics-h.welcomeShown', false);
    if (!hasShownWelcome) {
        showWelcomeMessage(context);
        context.globalState.update('graphics-h.welcomeShown', true);
    }

    // Create status bar button
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'graphics-h-compiler.compileAndRun';
    context.subscriptions.push(statusBarItem);

    // Update status bar
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateStatusBar)
    );
    updateStatusBar(vscode.window.activeTextEditor);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'graphics-h-compiler.compileAndRun',
            handleCompileAndRun
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

    // Register cleanup
    context.subscriptions.push({
        dispose: () => {
            if (compiler) {
                compiler.dispose();
            }
        }
    });

    // Check dependencies quietly
    checkDependenciesQuietly();
}

// Show welcome message
function showWelcomeMessage(context: vscode.ExtensionContext): void {
    const osName = pathManager.getOSDisplayName();
    const message = `Graphics.h Compiler activated on ${osName}! Ready to compile and run graphics programs.`;

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

// Update status bar
function updateStatusBar(editor: vscode.TextEditor | undefined): void {
    if (editor && editor.document.languageId === 'cpp') {
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

// Periodically update status bar
setInterval(() => {
    updateStatusBar(vscode.window.activeTextEditor);
}, 1000);

// Quiet dependency check - just verifies, doesn't install
async function checkDependenciesQuietly(): Promise<void> {
    const missing = pathManager.getMissingDependencies();
    
    if (missing.length > 0) {
        console.log('Graphics.h dependencies not installed:', missing.join(', '));
        console.log('User will be prompted when they try to compile.');
    } else {
        console.log('Graphics.h toolchain is ready');
    }
}

// Check and display dependency status
async function handleCheckDependencies(): Promise<void> {
    const missing = pathManager.getMissingDependencies();
    const required = pathManager.getRequiredDependencies();
    const osName = pathManager.getOSDisplayName();

    if (missing.length === 0) {
        vscode.window.showInformationMessage(
            `✓ All dependencies are installed!\n\n` +
            `Platform: ${osName}\n` +
            `Required: ${required.join(', ')}`
        );
        return;
    }

    const message = 
        `⚠️ Missing dependencies on ${osName}:\n\n` +
        `Missing: ${missing.join(', ')}\n\n` +
        `Required: ${required.join(', ')}\n\n` +
        `Would you like to install the missing dependencies now?`;

    const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        'Install Now',
        'Cancel'
    );

    if (choice === 'Install Now') {
        await handleSetupToolchain();
    }
}

// Wait for toolchain and ask permission if needed (Windows)
async function waitForToolchainWindows(): Promise<boolean> {
    const missing = pathManager.getMissingDependencies();
    
    if (missing.length === 0) {
        return true;
    }

    // Check if installation is in progress
    const isInProgress = windowsDownloader?.isInProgress() ?? false;

    if (isInProgress) {
        vscode.window.showInformationMessage(
            '⏳ Toolchain installation is already in progress. Please wait...'
        );
        return false;
    }

    // Toolchain not installed - ask user for permission
    const hasPermission = await windowsDownloader!.promptForPermission();
    
    if (!hasPermission) {
        vscode.window.showInformationMessage(
            'ℹ️ Graphics.h toolchain is required to compile programs.\n\n' +
            'You can install it anytime using:\n' +
            'Command Palette (Ctrl+Shift+P) → "Graphics.h: Setup Graphics.h Toolchain"',
            'OK'
        );
        return false;
    }

    // User gave permission - start installation
    const targetPath = pathManager.getToolchainPath();
    return await windowsDownloader!.download(targetPath, pathManager.getExtensionPath());
}

// Wait for toolchain and ask permission if needed (Ubuntu)
async function waitForToolchainUbuntu(): Promise<boolean> {
    const missing = pathManager.getMissingDependencies();
    
    if (missing.length === 0) {
        return true;
    }

    // Toolchain not installed - show installation instructions
    return await ubuntuDownloader!.promptForInstallation();
}

// Wait for toolchain (OS-agnostic)
async function waitForToolchain(): Promise<boolean> {
    if (pathManager.isWindows()) {
        return await waitForToolchainWindows();
    } else if (pathManager.isLinux()) {
        return await waitForToolchainUbuntu();
    }
    return false;
}

// Handle compile and run
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

        await compiler.compileAndRun(filePath);
        updateStatusBar(editor);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Compilation failed: ${errorMsg}`);
        console.error('Compilation error:', error);
    }
}

// Handle compile only
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

        await compiler.compile(filePath);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Compilation failed: ${errorMsg}`);
        console.error('Compilation error:', error);
    }
}

// Handle manual setup (Windows)
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

        // Ask for permission
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

// Handle manual setup (Ubuntu)
async function handleSetupToolchainUbuntu(): Promise<boolean> {
    try {
        const missing = pathManager.getMissingDependencies();

        if (missing.length === 0) {
            await ubuntuDownloader!.showDetailedStatus();
            return true;
        }

        // Show installation instructions
        return await ubuntuDownloader!.promptForInstallation();

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Setup failed: ${errorMsg}`);
        console.error('Setup error:', error);
        return false;
    }
}

// Handle manual setup (OS-agnostic)
async function handleSetupToolchain(): Promise<boolean> {
    if (pathManager.isWindows()) {
        return await handleSetupToolchainWindows();
    } else if (pathManager.isLinux()) {
        return await handleSetupToolchainUbuntu();
    }
    return false;
}

// Handle stop program
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
    if (statusBarItem) {
        statusBarItem.dispose();
    }

    if (compiler) {
        compiler.dispose();
    }

    console.log('Graphics.h Compiler extension deactivated');
}