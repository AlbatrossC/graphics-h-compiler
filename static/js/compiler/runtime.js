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

let isEditorFullscreen = false;
let isTerminalFullscreen = false;

// ==================== MOBILE TAB SWITCHING ====================
const _mobileTabBar = document.getElementById('mobile-tab-bar');
const _mobileTabEditor = document.getElementById('mobile-tab-editor');
const _mobileTabOutput = document.getElementById('mobile-tab-output');
const _mobileTabExplorer = document.getElementById('mobile-tab-explorer');

function isMobileView() {
    return window.innerWidth <= 768;
}

function switchMobileTab(tab) {
    if (!_mobileTabEditor || !_mobileTabOutput) return;

    // Close the sidebar if it is open when a tab is clicked
    if (isMobileView() && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }

    document.body.classList.remove('mobile-tab-output', 'mobile-tab-explorer');
    _mobileTabEditor.classList.remove('active');
    _mobileTabOutput.classList.remove('active');
    if (_mobileTabExplorer) _mobileTabExplorer.classList.remove('active');

    _mobileTabEditor.setAttribute('aria-selected', 'false');
    _mobileTabOutput.setAttribute('aria-selected', 'false');
    if (_mobileTabExplorer) _mobileTabExplorer.setAttribute('aria-selected', 'false');

    if (tab === 'output') {
        document.body.classList.add('mobile-tab-output');
        _mobileTabOutput.classList.add('active');
        _mobileTabOutput.setAttribute('aria-selected', 'true');
    } else if (tab === 'explorer') {
        document.body.classList.add('mobile-tab-explorer');
        if (_mobileTabExplorer) _mobileTabExplorer.classList.add('active');
        if (_mobileTabExplorer) _mobileTabExplorer.setAttribute('aria-selected', 'true');
    } else {
        _mobileTabEditor.classList.add('active');
        _mobileTabEditor.setAttribute('aria-selected', 'true');

        // ── Force-release keyboard from the DOS iframe ──
        // 1. Blur the iframe element itself
        const iframe = document.getElementById('dos-iframe');
        if (iframe) {
            iframe.blur();
            // Tell the iframe's DOSBox to release keyboard capture
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'BLUR' }, '*');
            }
        }
        // 2. Blur any other focused element (safety net)
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
        // 3. Reset terminal focus state
        terminalFocused = false;
        terminalWrapper.classList.remove('terminal-active');
        editorWrapper.classList.add('active');
        if (iframe) {
            keyboardBlocker.classList.add('active');
        }
    }

    // Re-layout after tab switch, then focus editor if on editor tab
    requestAnimationFrame(() => {
        if (editor && editor.requestMeasure) editor.requestMeasure();
        window.dispatchEvent(new Event('resize'));

        // Focus the CodeMirror editor after DOM settles
        if (tab === 'editor' && editor) {
            setTimeout(() => {
                editor.focus();
            }, 80);
        }
    });
}

if (_mobileTabEditor) {
    _mobileTabEditor.addEventListener('click', () => switchMobileTab('editor'));
}
if (_mobileTabOutput) {
    _mobileTabOutput.addEventListener('click', () => switchMobileTab('output'));
}
if (_mobileTabExplorer) {
    _mobileTabExplorer.addEventListener('click', () => switchMobileTab('explorer'));
}

// ==================== DESKTOP FULLSCREEN TOGGLE ====================
function toggleEditorFullscreen(forceState) {
    if (typeof forceState === 'boolean') {
        isEditorFullscreen = forceState;
    } else {
        isEditorFullscreen = !isEditorFullscreen;
    }

    const svgIcon = document.querySelector('#fullscreen-editor-btn svg');

    if (isEditorFullscreen) {
        editorWrapper.classList.add('fullscreen');
        terminalWrapper.classList.add('hidden');
        if (svgIcon) svgIcon.innerHTML = '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';
    } else {
        editorWrapper.classList.remove('fullscreen');
        terminalWrapper.classList.remove('hidden');
        if (svgIcon) svgIcon.innerHTML = '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
    }

    setTimeout(() => {
        if (editor && editor.requestMeasure) {
            editor.requestMeasure();
        }
    }, 100);
}

const fullscreenEditorBtn = document.getElementById('fullscreen-editor-btn');
if (fullscreenEditorBtn) {
    fullscreenEditorBtn.addEventListener('click', () => {
        toggleEditorFullscreen();
    });
}



const downloadTerminalBtn = document.getElementById('download-terminal-btn');
const terminalZoomControls = document.getElementById('terminal-zoom-controls');
let isDosSessionRunning = false;

const fullscreenTerminalBtn = document.getElementById('fullscreen-terminal-btn');
if (fullscreenTerminalBtn) {
    fullscreenTerminalBtn.addEventListener('click', () => {
        isTerminalFullscreen = !isTerminalFullscreen;

        if (isTerminalFullscreen) {
            terminalWrapper.classList.add('fullscreen');
            editorWrapper.classList.add('hidden');
            const svgIcon = document.querySelector('#fullscreen-terminal-btn svg');
            if (svgIcon) svgIcon.innerHTML = '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>';
            currentTerminalZoom = 1.2;
            updateTerminalZoom(0);
            if (terminalZoomControls) {
                terminalZoomControls.classList.remove('hidden');
            }
        } else {
            terminalWrapper.classList.remove('fullscreen');
            editorWrapper.classList.remove('hidden');
            const svgIcon = document.querySelector('#fullscreen-terminal-btn svg');
            if (svgIcon) svgIcon.innerHTML = '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
            if (terminalZoomControls) {
                terminalZoomControls.classList.add('hidden');
            }
            resetTerminalZoom();
        }

        setTimeout(() => {
            if (document.getElementById('dos-iframe')) {
                window.dispatchEvent(new Event('resize'));
            }
        }, 100);
    });
}

// document.getElementById('download-terminal-btn')?.classList.add('hidden');

if (downloadTerminalBtn) {
    downloadTerminalBtn.addEventListener('click', () => {
        const iframe = document.getElementById('dos-iframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'TAKE_SCREENSHOT', purpose: 'download' }, '*');
        }
    });
}

let currentTerminalZoom = 1.0;

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

document.getElementById('increase-terminal-btn')?.addEventListener('click', () => {
    updateTerminalZoom(0.1);
});

document.getElementById('decrease-terminal-btn')?.addEventListener('click', () => {
    updateTerminalZoom(-0.1);
});


function focusTerminal() {
    const iframe = document.getElementById('dos-iframe');
    if (!iframe) return;

    terminalFocused = true;
    iframe.focus();
    if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'FOCUS' }, '*');
    }
    terminalWrapper.classList.add('terminal-active');
    editorWrapper.classList.remove('active');
    keyboardBlocker.classList.remove('active');
}

function focusEditor() {
    terminalFocused = false;
    if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
        document.activeElement.blur();
    }
    if (editor) {
        editor.focus();
    }
    terminalWrapper.classList.remove('terminal-active');
    editorWrapper.classList.add('active');
    if (document.getElementById('dos-iframe')) {
        keyboardBlocker.classList.add('active');
    }
}

keyboardBlocker.addEventListener('click', () => {
    focusTerminal();
});

terminalWrapper.addEventListener('click', (e) => {
    const iframe = document.getElementById('dos-iframe');
    if (e.target === terminalWrapper || e.target === iframe) {
        if (!terminalFocused) {
            focusTerminal();
        }
    }
});

editorWrapper.addEventListener('click', () => {
    focusEditor();
});

document.addEventListener('click', (e) => {
    if (!terminalFocused) return;
    const isInsideTerminal = terminalWrapper.contains(e.target);
    if (!isInsideTerminal) {
        focusEditor();
    }
}, true);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Don't steal focus away from sidebar inputs (AI chat, etc.)
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.contains(activeEl)) {
                return;
            }
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        focusEditor();
        return false;
    }
}, true);

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
            isDosSessionRunning = true;
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
        }
    } else if (data.type === 'PROGRESS') {
        updateLoadingProgress(data.percent);
    } else if (data.type === 'COMPILATION_ERROR') {
        isDosSessionRunning = false;
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
    } else if (data.type === 'COMPILE_SUCCESS') {
        document.dispatchEvent(new CustomEvent('compiler-compile-success'));
    } else if (data.type === 'ERROR') {
        isDosSessionRunning = false;
        const message = data.message || 'Unknown DOS error';
        Logger.error('DOS Error', message);
        alert('DOS Error: ' + message);
        loading.classList.remove('active');
        runBtn.disabled = false;
        runBtn.classList.remove('loading');
        updateLoadingProgress(0);
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

    const iframe = document.getElementById('dos-iframe');
    if (!iframe || !iframe.contentWindow) {
        alert('DOS terminal is not available.');
        loading.classList.remove('active');
        runBtn.disabled = false;
        runBtn.classList.remove('loading');
        return;
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
    isDosSessionRunning = false;

    try {
        updateLoadingProgress(20);

        // Determine wdosbox URL using ResourceLoader with automatic fallback
        let wdosboxUrl = await ResourceLoader.getResourceUrl('libs', 'wdosbox');
        const usingOnline = !ResourceLoader.isOffline() && wdosboxUrl && !wdosboxUrl.startsWith('/');

        Logger.info(`Using ${usingOnline ? 'CDN' : 'local'} WDOSBOX: ${wdosboxUrl}`);
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

// ==================== KEYBOARD SHORTCUTS ====================

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

// ==================== RESPONSIVE HANDLING ====================

function handleResize() {
    if (!isMobileView()) {
        document.body.classList.remove('mobile-tab-output', 'mobile-tab-explorer', 'mobile-tab-editor');
        if (isEditorFullscreen) {
            toggleEditorFullscreen(false);
        }
    }

    if (editor && editor.requestMeasure) {
        editor.requestMeasure();
    }
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 300);
});

// ==================== SIDEBAR FUNCTIONALITY - FIXED ====================
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebarToggle = document.getElementById('sidebar-toggle');
const refreshBtn = document.getElementById('refresh-btn');
const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
const explorerActivityBtn = document.getElementById('explorer-activity-btn');
const cloudPromoView = document.getElementById('cloud-promo-view');
const fileExplorerView = document.getElementById('file-explorer-view');
const authSection = document.getElementById('auth-section');
const userProfileSection = document.getElementById('user-profile-section');
const userProfileBtn = document.getElementById('user-profile-btn');
const userProfileDropdown = document.getElementById('user-profile-dropdown');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const signoutBtn = document.getElementById('signout-btn');
const mainFolderFiles = document.getElementById('main-folder-files');
const newFolderBtn = document.getElementById('new-folder-btn');
const newFileBtn = document.getElementById('new-file-btn');

// User state (will be updated by auth logic)

// Shared sidebar toggle for desktop
function toggleDesktopSidebar() {
    sidebar.classList.toggle('collapsed');

    // Resize editor after collapse animation
    setTimeout(() => {
        if (editor && editor.requestMeasure) {
            editor.requestMeasure();
        }
    }, 350);
}

// FIXED: Mobile AND desktop toggle
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        if (isMobileView()) {
            // Mobile: toggle open class and overlay
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('active');
        } else {
            toggleDesktopSidebar();
        }
    });
}

// Mobile overlay close
if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    });
}

// Desktop collapse toggle
if (sidebarCollapseBtn) {
    sidebarCollapseBtn.addEventListener('click', toggleDesktopSidebar);
}

// Activity bar: Explorer button opens/collapses sidebar
if (explorerActivityBtn) {
    explorerActivityBtn.addEventListener('click', () => {
        const currentSidebarView = typeof window.getSidebarView === 'function'
            ? window.getSidebarView()
            : 'explorer';

        if (currentSidebarView !== 'explorer') {
            document.dispatchEvent(new CustomEvent('request-show-explorer'));
            if (sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                setTimeout(() => {
                    if (editor && editor.requestMeasure) editor.requestMeasure();
                }, 350);
            }
            return;
        }
        // Otherwise toggle sidebar collapse
        toggleDesktopSidebar();
    });
}

const settingsActivityBtn = document.getElementById('settings-activity-btn');

if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        refreshCloudFiles(true);
    });
}

// New File button - Uses native prompt() to bypass js-dos keyboard capture
if (newFileBtn) {
    newFileBtn.addEventListener('click', () => {
        if (!isUserLoggedIn) {
            return;
        }
        // Use native browser prompt() - immune to js-dos keyboard capture
        const filename = prompt('Enter a file name (e.g., mycode.cpp):\nOnly letters, numbers, dots, underscores, and dashes are allowed.');
        if (filename && filename.trim()) {
            createNewFile(filename.trim());
        }
    });
}

// User profile dropdown toggle
if (userProfileBtn) {
    userProfileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userProfileDropdown.classList.toggle('open');
    });
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (userProfileDropdown && !userProfileDropdown.contains(e.target) && !userProfileBtn.contains(e.target)) {
        userProfileDropdown.classList.remove('open');
    }
});

// Sign out button in dropdown
if (signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
        userProfileDropdown.classList.remove('open');
        await signOut();
    });
}

// Update UI based on login state
function updateLoginUI(loggedIn, user = null) {
    isUserLoggedIn = loggedIn;
    currentUser = user;
    const sidebarView = typeof window.getSidebarView === 'function'
        ? window.getSidebarView()
        : 'explorer';

    if (loggedIn && user) {
        if (sidebarView === 'explorer') {
            cloudPromoView.style.display = 'none';
            fileExplorerView.style.display = 'block';
        } else {
            cloudPromoView.style.display = 'none';
            fileExplorerView.style.display = 'none';
        }
        if (refreshBtn) {
            refreshBtn.style.display = 'inline-flex';
            refreshBtn.disabled = false;
        }
        if (newFolderBtn) {
            newFolderBtn.style.display = 'flex';
        }
        if (newFileBtn) {
            newFileBtn.style.display = 'flex';
        }

        // Hide auth section, show user profile
        authSection.style.display = 'none';
        userProfileSection.style.display = 'block';

        // Update user info
        const displayName =
            user.user_metadata?.full_name ||
            user.display_name ||
            user.name ||
            user.email ||
            'Account';
        const email =
            user.email ||
            user.user_metadata?.email ||
            '';
        const avatarUrl = user.user_metadata?.avatar_url;

        userName.textContent = displayName;
        userEmail.textContent = email;

        // Set avatar (first letter or image)
        if (avatarUrl) {
            userAvatar.innerHTML = `<img src="${avatarUrl}" alt="${displayName}">`;
        } else {
            userAvatar.innerHTML = displayName.charAt(0).toUpperCase();
        }

        Logger.success(`Signed in as ${displayName}`);
    } else {
        if (sidebarView === 'explorer') {
            cloudPromoView.style.display = 'flex';
            fileExplorerView.style.display = 'none';
        } else {
            cloudPromoView.style.display = 'none';
            fileExplorerView.style.display = 'none';
        }
        if (refreshBtn) {
            refreshBtn.style.display = 'none';
            refreshBtn.disabled = true;
        }
        if (newFolderBtn) {
            newFolderBtn.style.display = 'none';
        }
        if (newFileBtn) {
            newFileBtn.style.display = 'none';
        }

        // Show auth section, hide user profile
        authSection.style.display = 'block';
        userProfileSection.style.display = 'none';

        CLOUD_STATE.files.clear();
        CLOUD_STATE.folders = new Set(['root']);
        CLOUD_STATE.folderNameToId = new Map();
        CLOUD_STATE.folderIdToName = new Map();
        CLOUD_STATE.files.clear();
        CLOUD_STATE.openTabs = [];
        CLOUD_STATE.activeFileKey = 'root/main.cpp';
        CLOUD_STATE.selectedFolderKey = 'root';
        updateSaveIndicator();
    }

    document.dispatchEvent(new CustomEvent('auth-state-changed', {
        detail: { loggedIn, user }
    }));
}
// Render logged-out promo immediately; auth bootstrap will switch to logged-in view if session exists.
updateLoginUI(false);



// ==================== JS-DOS BACKGROUND WARMUP ====================

async function warmupJSDOS() {
    if (warmupPromise) return warmupPromise;

    warmupPromise = new Promise(async (resolve) => {
        try {
            Logger.info('Starting JS-DOS background warmup...');

            // Pre-fetch and cache TC ZIP using shared function immediately
            try {
                await getTCZip();
                Logger.success('TC ZIP ready for instant run');
            } catch (e) {
                Logger.warn('Failed to pre-cache TC ZIP: ' + e.message);
            }

            // Pre-cache all demo files in background
            prefetchDemoFiles();

            // Wait for JS-DOS to be available
            if (typeof Dos === 'undefined') {
                let attempts = 0;
                while (typeof Dos === 'undefined' && attempts < 50) {
                    await new Promise(r => setTimeout(r, 100));
                    attempts++;
                }
                if (typeof Dos === 'undefined') {
                    Logger.warn('JS-DOS not available for warmup');
                    resolve(false);
                    return;
                }
            }

            Logger.success('JS-DOS warmup complete - Run will be instant!');
            resolve(true);
        } catch (e) {
            Logger.warn('Warmup failed: ' + e.message);
            resolve(false);
        }
    });

    return warmupPromise;
}

async function prefetchDemoFiles() {
    const entries = Object.entries(DEMO_FILES).filter(([key]) => !DemoCache.get(key));
    if (entries.length === 0) return;

    await Promise.allSettled(entries.map(async ([key, url]) => {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const code = await response.text();
                DemoCache.set(key, code);
                Logger.info(`Pre-cached demo: ${key}`);
            }
        } catch (e) {
            // Silently fail for background prefetch
        }
    }));
}

// ==================== INITIALIZATION ====================

(async function init() {
    Logger.info('Initializing compiler...');
    updateSaveIndicator();

    const loaded = await loadAllScripts();
    if (loaded) {
        // Start warmup after editor is ready
        warmupJSDOS();
        updateCacheStatus();

        Logger.success('Compiler ready');
    }
})();
