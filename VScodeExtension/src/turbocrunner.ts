import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip = require('adm-zip');

export class TurboCRunner {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) { }

    public async compileAndRun(filePath: string) {
        if (!this.validateInputs(filePath)) {
            return;
        }

        const codeContent = fs.readFileSync(filePath, 'utf-8');
        const zipBase64 = this.buildRuntimeZip(codeContent);

        this.createOrRevealPanel();
        this.sendToWebview(zipBase64);
    }

    private validateInputs(filePath: string): boolean {
        if (!fs.existsSync(filePath)) {
            vscode.window.showErrorMessage('File does not exist: ' + filePath);
            return false;
        }

        const turbocDir = path.join(this.context.extensionPath, 'resources', 'turboc');
        const zipPath = path.join(turbocDir, 'tc-v1.zip');

        if (!fs.existsSync(zipPath)) {
            vscode.window.showErrorMessage('Turbo C bundle not found at: ' + zipPath);
            return false;
        }

        return true;
    }

    private buildRuntimeZip(codeContent: string): string {
        const turbocDir = path.join(this.context.extensionPath, 'resources', 'turboc');
        const zipPath = path.join(turbocDir, 'tc-v1.zip');

        const batchScript = `@ECHO OFF
CD TURBOC3\\BIN
IF EXIST USER.EXE DEL USER.EXE
IF EXIST ERR.TXT DEL ERR.TXT
IF EXIST FAIL.TXT DEL FAIL.TXT
TCC -I..\\INCLUDE -L..\\LIB -n. USER.CPP ..\\LIB\\GRAPHICS.LIB > ERR.TXT
IF EXIST USER.EXE GOTO SUCCESS
ECHO COMPILE_FAILED > FAIL.TXT
COPY ERR.TXT C:\\ERR.TXT >NUL
COPY FAIL.TXT C:\\FAIL.TXT >NUL
CLS
ECHO ========================================
ECHO COMPILATION ERRORS:
ECHO ========================================
TYPE ERR.TXT
ECHO.
PAUSE
EXIT
:SUCCESS
CLS
USER.EXE
PAUSE
`;

        // 1. Create fresh ZIP in memory
        const zip = new AdmZip(zipPath);
        zip.addFile('TURBOC3/BIN/USER.CPP', Buffer.from(codeContent, 'utf-8'));
        zip.addFile('AUTOEXEC.BAT', Buffer.from(batchScript, 'utf-8'));
        const zipBuffer = zip.toBuffer();

        return zipBuffer.toString('base64');
    }

    private createOrRevealPanel() {
        const turbocDir = path.join(this.context.extensionPath, 'resources', 'turboc');

        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel(
                'turboC',
                'Turbo C DOSBox',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [
                        vscode.Uri.file(turbocDir),
                        vscode.Uri.file(path.join(this.context.extensionPath, 'resources', 'webview'))
                    ]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            const jsDosUri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(turbocDir, 'js-dos.js')));
            const wdosboxJsUri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(turbocDir, 'wdosbox.js')));
            const cspSource = this.panel.webview.cspSource;

            this.panel.webview.html = this.getWebviewHtml(jsDosUri.toString(), wdosboxJsUri.toString(), cspSource);
        } else {
            this.panel.reveal();
        }
    }

    private sendToWebview(zipBase64: string) {
        if (!this.panel) {
            return;
        }

        // Base64 encoding for safe transfer to webview
        this.panel.webview.postMessage({
            type: 'RUN_NATIVE',
            zipData: zipBase64
        });
    }

    private getWebviewHtml(jsDosUrl: string, wdosboxUrl: string, cspSource: string) {
        const htmlPath = path.join(this.context.extensionPath, 'resources', 'webview', 'index.html');
        let htmlContext = '';
        try {
            htmlContext = fs.readFileSync(htmlPath, 'utf8');
        } catch (error) {
            vscode.window.showErrorMessage('Failed to load webview HTML.');
            return '<html><body>Error loading webview content.</body></html>';
        }

        const nonce = this.getNonce();

        // Inject URLs and CSP variables
        return htmlContext
            .replace(/{{jsDosUrl}}/g, jsDosUrl)
            .replace(/{{wdosboxUrl}}/g, wdosboxUrl)
            .replace(/{{nonce}}/g, nonce)
            .replace(/{{cspSource}}/g, cspSource);
    }

    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
