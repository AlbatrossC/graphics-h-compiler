(function () {
    const originalLog = console.log;
    const originalInfo = console.info;

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
        if (msg.includes('Runtime is still alive')) return true;
        if (msg.trim() === '---') return true;

        return false;
    };

    console.log = function (...args) {
        if (args.length > 0 && shouldBlock(args[0])) {
            return;
        }
        originalLog.apply(console, args);
    };

    console.info = function (...args) {
        if (args.length > 0 && shouldBlock(args[0])) {
            return;
        }
        originalInfo.apply(console, args);
    };
})();

const downloadTerminalBtn = document.getElementById('download-terminal-btn');

if (downloadTerminalBtn) {
    downloadTerminalBtn.addEventListener('click', () => {
        const iframe = document.getElementById('dos-iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'TAKE_SCREENSHOT', purpose: 'download' }, '*');
        }
    });
}

var currentTerminalZoom = 1.0;

function updateTerminalZoom(change) {
    const iframe = document.getElementById('dos-iframe');

    if (!iframe) return;

    let newZoom = currentTerminalZoom + change;

    if (newZoom < 0.5) newZoom = 0.5;
    if (newZoom > 3.0) newZoom = 3.0;

    currentTerminalZoom = newZoom;

    iframe.style.transform = `scale(${currentTerminalZoom})`;
    iframe.style.transformOrigin = 'center center';
    iframe.style.transition = 'transform 0.2s ease';
}

function resetTerminalZoom() {
    currentTerminalZoom = 1.0;
    const iframe = document.getElementById('dos-iframe');
    if (iframe) {
        iframe.style.transform = 'scale(1)';
        iframe.style.transformOrigin = 'center center';
    }
}

window.updateTerminalZoom = updateTerminalZoom;
window.resetTerminalZoom = resetTerminalZoom;

document.getElementById('increase-terminal-btn')?.addEventListener('click', () => {
    updateTerminalZoom(0.1);
});

document.getElementById('decrease-terminal-btn')?.addEventListener('click', () => {
    updateTerminalZoom(-0.1);
});

let currentTcZipObjectUrl = null;

window.addEventListener('message', (event) => {
    const iframe = document.getElementById('dos-iframe');
    if (!iframe || event.source !== iframe.contentWindow) return;

    const data = event.data || {};
    if (data.type === 'STATUS') {
        if (data.status === 'STARTING') {
            loadingText.textContent = 'Initializing DOS environment...';
            updateLoadingProgress(40);
        } else if (data.status === 'EXTRACTING') {
            loadingText.textContent = 'Extracting compiler files...';
            updateLoadingProgress(60);
            metrics.runtime.zipExtractionStarted++;
        } else if (data.status === 'WRITING_CODE') {
            loadingText.textContent = 'Writing source code...';
            updateLoadingProgress(80);
        } else if (data.status === 'RUNNING') {
            loadingText.textContent = 'Starting program...';
            updateLoadingProgress(100);
            loading.classList.remove('active');
            runBtn.disabled = false;
            runBtn.classList.remove('loading');
            metrics.runtime.zipExtractionCompleted++;

            if (downloadTerminalBtn) {
                downloadTerminalBtn.classList.remove('hidden');
            }

            if (currentTcZipObjectUrl) {
                URL.revokeObjectURL(currentTcZipObjectUrl);
                currentTcZipObjectUrl = null;
            }

            setTimeout(focusTerminal, 500);
            Logger.success('Program started successfully');
            document.dispatchEvent(new CustomEvent('compiler-run-success'));
            document.dispatchEvent(new CustomEvent('compiler-run-end'));
        }
    } else if (data.type === 'PROGRESS') {
        updateLoadingProgress(data.percent);
    } else if (data.type === 'COMPILATION_ERROR') {
        Logger.info('[Error Panel] Received COMPILATION_ERROR from iframe');

        if (downloadTerminalBtn) {
            downloadTerminalBtn.classList.add('hidden');
        }

        Logger.info('[Error Panel] Content: ' + (data.content || '').substring(0, 200));
        outputContent.textContent = data.content || '';
        outputContent.classList.remove('output-success');
        outputContent.classList.add('output-error');
        outputPanel.classList.remove('expanded');
        expandOutputBtn.classList.remove('expanded');
        expandOutputBtn.title = 'Expand panel';
        isOutputExpanded = false;

        if (!outputPanel.classList.contains('visible')) {
            outputPanel.classList.add('visible');
            terminalWrapper.classList.add('has-panel');
            setTimeout(() => window.dispatchEvent(new Event('resize')), 310);
            Logger.success('[Error Panel] Panel made visible');
        }

        // On mobile, if editor is fullscreen, exit it so errors are visible
        if (isMobileView() && isEditorFullscreen) {
            toggleEditorFullscreen(false);
        } else if (!isMobileView()) {
            focusEditor();
        }
        document.dispatchEvent(new CustomEvent('compiler-compilation-error', {
            detail: { content: data.content || '' }
        }));

        document.dispatchEvent(new CustomEvent('compiler-run-end'));
    } else if (data.type === 'COMPILE_SUCCESS') {
        document.dispatchEvent(new CustomEvent('compiler-compile-success'));
    } else if (data.type === 'ERROR') {
        const message = data.message || 'Unknown DOS error';
        Logger.error('DOS Error', message);
        alert('DOS Error: ' + message);
        loading.classList.remove('active');
        runBtn.disabled = false;
        runBtn.classList.remove('loading');
        updateLoadingProgress(0);
        document.dispatchEvent(new CustomEvent('compiler-run-end'));
        if (currentTcZipObjectUrl) {
            URL.revokeObjectURL(currentTcZipObjectUrl);
            currentTcZipObjectUrl = null;
        }
    } else if (data.type === 'SCREENSHOT_DATA') {
        if (data.error) return;

        let downloadUrl = null;
        if (data.blob instanceof Blob) {
            downloadUrl = URL.createObjectURL(data.blob);
        } else if (data.dataUrl) {
            downloadUrl = data.dataUrl;
        }
        if (!downloadUrl) return;

        const link = document.createElement('a');
        link.href = downloadUrl;

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        link.download = `graphics_h_${yyyy}_${mm}_${dd}_${hh}_${min}.png`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (data.blob instanceof Blob) {
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        }
    }
});

async function runProgram() {
    if (!editor) {
        alert('Editor is still loading. Please wait...');
        return;
    }

    const code = editor.getValue();

    if (!code.trim()) {
        alert('Please write some code first!');
        return;
    }

    metrics.runtime.runCount++;
    Logger.info(`[Run] Triggered | count=${metrics.runtime.runCount}`);
    document.dispatchEvent(new CustomEvent('compiler-run-start'));
    const shouldPersistPreviewOnRun = window.__aiPreviewPending !== true && window.__suppressCompileRunSave !== true;

    if (isUserLoggedIn && shouldPersistPreviewOnRun) {
        if (CLOUD_STATE.autosaveTimer) {
            clearTimeout(CLOUD_STATE.autosaveTimer);
            CLOUD_STATE.autosaveTimer = null;
        }

        const activeKey = CLOUD_STATE.activeFileKey || 'root/main.cpp';
        const [folder, filename] = activeKey.split('/');
        setLocalDraftImmediate(folder, filename, code);
        localStorage.setItem('tc_code', code);

        forceSaveActiveFile('compileRun').catch(e => {
            Logger.warn('Background save during run failed: ' + e.message);
        });
    } else if (!isUserLoggedIn && shouldPersistPreviewOnRun) {
        saveCode();
    }

    Logger.info('Starting compilation...');
    loading.classList.add('active');
    loadingText.textContent = 'Initializing DOS environment...';
    updateLoadingProgress(0);
    runBtn.disabled = true;
    runBtn.classList.add('loading');

    // On mobile, jump directly to DOS output when compilation starts.
    if (isMobileView()) {
        switchMobileTab('output');
    }

    // On mobile, if editor is fullscreen, exit it
    if (isMobileView() && isEditorFullscreen) {
        toggleEditorFullscreen(false);
    }

    outputPanel.classList.remove('visible');
    outputPanel.classList.remove('expanded');

    expandOutputBtn.classList.remove('expanded');
    expandOutputBtn.title = 'Expand panel';
    isOutputExpanded = false;
    terminalWrapper.classList.remove('has-panel');
    if (downloadTerminalBtn) {
        downloadTerminalBtn.classList.add('hidden');
    }
    lastErrorContent = '';
    outputContent.textContent = '';
    try {
        const iframe = await ensureDosRunnerFrame();
        if (!iframe.contentWindow) {
            throw new Error('DOS terminal is not available.');
        }

        updateLoadingProgress(20);

        await startPreload();

        const wdosboxUrl = '/libs/wdosbox.js';
        Logger.info(`Using local WDOSBOX runtime: ${wdosboxUrl}`);
        updateLoadingProgress(40);



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

        loadingText.textContent = 'Loading compiler...';
        const tcBlob = await getTCZip();

        if (currentTcZipObjectUrl) {
            URL.revokeObjectURL(currentTcZipObjectUrl);
            currentTcZipObjectUrl = null;
        }
        currentTcZipObjectUrl = URL.createObjectURL(tcBlob);

        iframe.contentWindow.postMessage({ type: 'STOP_DOS' }, '*');
        iframe.contentWindow.postMessage({
            type: 'INIT_DOS',
            payload: {
                wdosboxUrl: wdosboxUrl,
                zipUrl: currentTcZipObjectUrl,
                code: code,
                batchScript: batchScript,
                cycles: isMobile ? 'auto' : 'max'
            }
        }, '*');

    } catch (error) {
        Logger.error('Failed to start DOS environment', error);

        if (error.message && (error.message.includes('Compiler URL') || error.message.includes('Failed to download compiler') || error.message.includes('fetch') || error.message.includes('Failed to fetch'))) {
            loading.innerHTML = `<div style="color: #ffb454; text-align: center; padding: 2rem; background: #2a2a2a; border-radius: 8px; border: 1px solid #ffb454; margin: auto;">
                <p style="margin-bottom: 1rem; font-size: 1.1rem;">⚠ Failed to load compiler files. Please refresh the page to try again.</p>
                <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; cursor: pointer; background: #ffb454; color: #000; border: none; border-radius: 4px; font-weight: bold;">Refresh</button>
            </div>`;
            return;
        }

        alert('Failed to start DOS environment. Error: ' + error.message);
        loading.classList.remove('active');
        runBtn.disabled = false;
        runBtn.classList.remove('loading');
        updateLoadingProgress(0);
        if (currentTcZipObjectUrl) {
            URL.revokeObjectURL(currentTcZipObjectUrl);
            currentTcZipObjectUrl = null;
        }
    }
}

// Global keyboard shortcuts (e.g. Ctrl+Enter to run, Ctrl+S to save).

window.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to run
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !terminalFocused) {
        e.preventDefault();
        runProgram();
    }

    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && !terminalFocused) {
        e.preventDefault();
        saveCode();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && !isUserLoggedIn && editor) {
        localStorage.setItem('tc_code', editor.getValue());
    }
});

window.addEventListener('beforeunload', () => {
    if (!editor) return;
    if (!isUserLoggedIn) {
        try {
            localStorage.setItem('tc_code', editor.getValue());
        } catch (e) {
            // Ignore storage failures.
        }
    }
});



async function prefetchDemoFiles() {
    try {
        const bundle = await loadDemoBundle();
        Object.entries(bundle).forEach(([key, code]) => {
            if (!DemoCache.get(key)) {
                DemoCache.set(key, code);
            }
        });
        Logger.info('Pre-cached demo bundle');
    } catch (e) {
        // Silently fail for background prefetch
    }
}

// Self-initializing entry point for dependencies and startup caching.

(async function init() {
    Logger.info('Initializing compiler...');
    updateSaveIndicator();

    const loaded = await loadAllScripts();
    if (loaded) {
        prefetchDemoFiles();

        Logger.success('Compiler ready');
    }
})();
