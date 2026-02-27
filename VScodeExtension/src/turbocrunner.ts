import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip = require('adm-zip');

export class TurboCRunner {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) { }

    public async compileAndRun(filePath: string) {
        if (!fs.existsSync(filePath)) {
            vscode.window.showErrorMessage('File does not exist: ' + filePath);
            return;
        }

        const turbocDir = path.join(this.context.extensionPath, 'resources', 'turboc');
        const zipPath = path.join(turbocDir, 'tc-v1.zip');

        if (!fs.existsSync(zipPath)) {
            vscode.window.showErrorMessage('Turbo C bundle not found at: ' + zipPath);
            return;
        }

        const codeContent = fs.readFileSync(filePath, 'utf-8');

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
        const base64Zip = zipBuffer.toString('base64');

        // 2. Setup Webview Panel
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel(
                'turboC',
                'Turbo C DOSBox',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [vscode.Uri.file(turbocDir)]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            const jsDosUri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(turbocDir, 'js-dos.js')));
            const wdosboxJsUri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(turbocDir, 'wdosbox.js')));

            this.panel.webview.html = this.getWebviewHtml(jsDosUri.toString(), wdosboxJsUri.toString());
        } else {
            this.panel.reveal();
        }

        // Send the fresh zip to the webview
        this.panel.webview.postMessage({
            type: 'RUN_NATIVE',
            zipData: base64Zip
        });
    }

    private getWebviewHtml(jsDosUrl: string, wdosboxUrl: string) {
        return `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; background: #000; color: #fff; display: flex; flex-direction: column; height: 100vh; overflow: hidden; font-family: sans-serif; }
        #dos-container { flex: 1; display: flex; align-items: center; justify-content: center; width: 100%; min-height: 0; }
        canvas { display: block; max-width: 100%; max-height: 100%; image-rendering: pixelated; }
        #error-panel { display: none; background: #220000; color: #ff5555; padding: 15px; font-family: monospace; white-space: pre-wrap; width: 100%; box-sizing: border-box; border-top: 2px solid #ff0000; overflow-y: auto; max-height: 35vh; flex-shrink: 0; }
        #error-panel-title { font-weight: bold; margin-bottom: 5px; font-family: sans-serif; color: #ff8888; }
    </style>
    <script src="${jsDosUrl}"></script>
</head>
<body>
    <div id="dos-container">
        <canvas id="canvas"></canvas>
    </div>
    <div id="error-panel">
        <div id="error-panel-title">Compilation Errors</div>
        <div id="error-content"></div>
    </div>
    <script>
        const canvas = document.getElementById('canvas');
        const errorPanel = document.getElementById('error-panel');
        const errorContent = document.getElementById('error-content');
        let dosInstance = null;
        let activeErrorPollTimer = null;

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'RUN_NATIVE') {
                runDos(message.zipData);
            }
        });

        // ==================== CONSOLE FILTER ====================
        const originalLog = console.log;
        const originalInfo = console.info;
        const originalWarn = console.warn;

        const shouldBlock = (msg) => {
            if (typeof msg !== 'string') return false;
            if (msg.includes('extracting:')) return true;
            if (msg.includes('js-dos version')) return true;
            if (msg.includes('Copyright') && msg.includes('DOSBox')) return true;
            if (msg.startsWith('CONFIG:')) return true;
            if (msg.startsWith('MIDI:')) return true;
            if (msg.startsWith('SHELL:')) return true;
            if (msg.includes('%') && msg.match(/[a-f0-9-]{36}/)) return true;
            if (msg.startsWith('[INFO]') && msg.match(/[a-f0-9-]{36}/)) return true;
            if (msg.includes('Resolving DosBox')) return true;
            if (msg.includes('DosBox resolved')) return true;
            if (msg.trim() === '---') return true;
            return false;
        };

        console.log = function (...args) {
            if (args.length > 0 && shouldBlock(args[0])) return;
            originalLog.apply(console, args);
        };
        console.info = function (...args) {
            if (args.length > 0 && shouldBlock(args[0])) return;
            originalInfo.apply(console, args);
        };
        console.warn = function (...args) {
            if (args.length > 0 && shouldBlock(args[0])) return;
            originalWarn.apply(console, args);
        };

        function base64ToUint8Array(base64) {
            const binary_string = window.atob(base64);
            const len = binary_string.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary_string.charCodeAt(i);
            }
            return bytes;
        }

        function readTextFile(fs, path) {
            try {
                return fs.readFile(path, { encoding: 'utf8' }) || '';
            } catch (e) {
                try {
                    const bytes = fs.readFile(path);
                    return new TextDecoder().decode(bytes) || '';
                } catch (e2) {
                    return '';
                }
            }
        }

        async function runDos(base64Zip) {
            if (dosInstance) {
                try { dosInstance.exit(); } catch(e){}
                dosInstance = null;
            }
            if (activeErrorPollTimer) {
                clearInterval(activeErrorPollTimer);
                activeErrorPollTimer = null;
            }

            errorPanel.style.display = 'none';
            errorContent.textContent = '';

            const zipArray = base64ToUint8Array(base64Zip);
            const blob = new Blob([zipArray], { type: 'application/zip' });
            const zipUrl = URL.createObjectURL(blob);

            try {
                const runner = Dos(canvas, {
                    wdosboxUrl: "${wdosboxUrl}",
                    cycles: 'max',
                    autolock: false
                });

                runner.ready((fs, main) => {
                    fs.extract(zipUrl).then(() => {
                        main(['-conf', 'dosbox.conf', 'AUTOEXEC.BAT']).then(dos => {
                            dosInstance = dos;
                            
                            // Start polling for errors
                            activeErrorPollTimer = setInterval(() => {
                                if (!dosInstance || !dosInstance.em || !dosInstance.em.FS) return;
                                const FS = dosInstance.em.FS;
                                
                                const errPath = 'TURBOC3/BIN/ERR.TXT';
                                const failPath = 'TURBOC3/BIN/FAIL.TXT';
                                const userExePath = 'TURBOC3/BIN/USER.EXE';
                                
                                let hasFailMarker = false;
                                let hasUserExe = false;
                                try { FS.stat(failPath); hasFailMarker = true; } catch(e){}
                                try { FS.stat(userExePath); hasUserExe = true; } catch(e){}

                                if (hasUserExe && !hasFailMarker) {
                                    clearInterval(activeErrorPollTimer);
                                    return;
                                }

                                let content = '';
                                try { if (FS.stat(errPath)) content = readTextFile(FS, errPath); } catch(e){}
                                const trimmed = content.trim();

                                if (!hasFailMarker && !trimmed) return;

                                const lower = trimmed.toLowerCase();
                                const looksLikeError =
                                    hasFailMarker ||
                                    /(^|\\b)(error|fatal|undefined|unable|unresolved|not found)(\\b|:)/i.test(trimmed) ||
                                    (!hasUserExe && lower.length > 0);

                                if (looksLikeError) {
                                    clearInterval(activeErrorPollTimer);
                                    errorPanel.style.display = 'block';
                                    errorContent.textContent = trimmed || 'Compilation failed. Check your code and try again.';
                                }
                            }, 400);
                        });
                    });
                });
            } catch(e) {
                console.error(e);
            }
        }
    </script>
</body>
</html>`;
    }
}
