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

function isMobileView() {
    return window.innerWidth <= 768;
}

function switchMobileTab(tab) {
    if (!_mobileTabEditor || !_mobileTabOutput) return;

    if (tab === 'output') {
        document.body.classList.add('mobile-tab-output');
        _mobileTabEditor.classList.remove('active');
        _mobileTabOutput.classList.add('active');
    } else {
        document.body.classList.remove('mobile-tab-output');
        _mobileTabEditor.classList.add('active');
        _mobileTabOutput.classList.remove('active');

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

// ==================== DESKTOP FULLSCREEN TOGGLE ====================
function toggleEditorFullscreen(forceState) {
    // On mobile, use tab switching instead of fullscreen
    if (isMobileView()) {
        switchMobileTab('editor');
        return;
    }

    if (typeof forceState === 'boolean') {
        isEditorFullscreen = forceState;
    } else {
        isEditorFullscreen = !isEditorFullscreen;
    }

    if (isEditorFullscreen) {
        editorWrapper.classList.add('fullscreen');
        terminalWrapper.classList.add('hidden');
    } else {
        editorWrapper.classList.remove('fullscreen');
        terminalWrapper.classList.remove('hidden');
    }

    setTimeout(() => {
        if (editor && editor.requestMeasure) {
            editor.requestMeasure();
        }
    }, 100);
}

document.getElementById('fullscreen-editor-btn').addEventListener('click', () => {
    toggleEditorFullscreen();
});

const downloadTerminalBtn = document.getElementById('download-terminal-btn');
const terminalZoomControls = document.getElementById('terminal-zoom-controls');

document.getElementById('fullscreen-terminal-btn').addEventListener('click', () => {
    // On mobile, use tab switching instead of fullscreen
    if (isMobileView()) {
        switchMobileTab('output');
        return;
    }

    isTerminalFullscreen = !isTerminalFullscreen;

    if (isTerminalFullscreen) {
        terminalWrapper.classList.add('fullscreen');
        editorWrapper.classList.add('hidden');
        resetTerminalZoom();
        if (terminalZoomControls) {
            terminalZoomControls.classList.remove('hidden');
            terminalZoomControls.style.display = 'flex';
        }
    } else {
        terminalWrapper.classList.remove('fullscreen');
        editorWrapper.classList.remove('hidden');
        if (terminalZoomControls) {
            terminalZoomControls.classList.add('hidden');
            terminalZoomControls.style.display = 'none';
        }
        resetTerminalZoom();
    }

    setTimeout(() => {
        if (document.getElementById('dos-iframe')) {
            window.dispatchEvent(new Event('resize'));
        }
    }, 100);
});

document.getElementById('download-terminal-btn')?.classList.add('hidden');

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
            loadingText.textContent = 'Starting program...';
            updateLoadingProgress(100);
            loading.classList.remove('active');
            runBtn.disabled = false;
            runBtn.classList.remove('loading');
            metrics.runtime.zipExtractionCompleted++;

            if (currentTcZipObjectUrl) {
                URL.revokeObjectURL(currentTcZipObjectUrl);
                currentTcZipObjectUrl = null;
            }

            setTimeout(focusTerminal, 500);
            Logger.success('Program started successfully');
        }
    } else if (data.type === 'COMPILATION_ERROR') {
        Logger.info('[Error Panel] Received COMPILATION_ERROR from iframe');
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

        // On mobile, switch to output tab so errors are visible
        if (isMobileView()) {
            switchMobileTab('output');
        } else {
            focusEditor();
        }
    } else if (data.type === 'ERROR') {
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

    if (isUserLoggedIn) {
        if (CLOUD_STATE.autosaveTimer) {
            clearTimeout(CLOUD_STATE.autosaveTimer);
            CLOUD_STATE.autosaveTimer = null;
        }
        if (typingDebounceTimer) {
            clearTimeout(typingDebounceTimer);
            typingDebounceTimer = null;
        }

        const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
        const [folder, filename] = activeKey.split('/');
        setLocalDraftImmediate(folder, filename, code);
        localStorage.setItem('tc_code', code);

        forceSaveActiveFile('compileRun').catch(e => {
            Logger.warn('Background save during run failed: ' + e.message);
        });
    } else {
        saveCode();
    }

    Logger.info('Starting compilation...');
    loading.classList.add('active');
    loadingText.textContent = 'Initializing DOS environment...';
    updateLoadingProgress(0);
    runBtn.disabled = true;
    runBtn.classList.add('loading');

    // On mobile, switch to DOS output tab immediately
    if (isMobileView()) {
        switchMobileTab('output');
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
    if (document.hidden && isUserLoggedIn) {
        forceSaveActiveFile('exit').catch(() => { });
    }
});

// Graceful tab close handler with sendBeacon for guaranteed delivery
window.addEventListener('beforeunload', (event) => {
    if (!isUserLoggedIn || !editor) return;

    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');

    // Always save to localStorage immediately (synchronous, reliable)
    try {
        localStorage.setItem('tc_code', code);
        localStorage.setItem(`draft_${folder}_${filename}`, code);
    } catch (e) {
        // localStorage might be full, ignore
    }

    // Try sendBeacon for guaranteed background save
    if (navigator.sendBeacon && supabaseClient && sessionCache.accessToken) {
        try {
            const payload = JSON.stringify({
                folder,
                filename,
                content: code
            });

            // Create blob with JSON content type
            const blob = new Blob([payload], { type: 'application/json' });

            // Get token for Authorization header simulation
            // Note: sendBeacon doesn't support custom headers, so we use fetch with keepalive
            const token = sessionCache.accessToken;

            if (token) {
                // Use fetch with keepalive instead of sendBeacon for Authorization header support
                fetch(`${CLOUD_STATE.storageBaseUrl}/files/beacon-save`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: payload,
                    keepalive: true // Ensures request completes even after tab closes
                }).catch(() => {
                    // Silently fail - localStorage save already happened
                });

                Logger.info('Tab close: Background save initiated');
            }
        } catch (e) {
            // Beacon failed, but localStorage save already happened
        }
    }
});

// ==================== RESPONSIVE HANDLING ====================

function handleResize() {
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
const newFileBtn = document.getElementById('new-file-btn');

// User state (will be updated by auth logic)
let isUserLoggedIn = false;
let currentUser = null;
let supabaseClient = null;

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
        // If settings panel is open, switch back to explorer (handled by settings.js)
        if (typeof window.settingsShowExplorer === 'function' && settingsActivityBtn && settingsActivityBtn.classList.contains('active')) {
            window.settingsShowExplorer();
            // If sidebar is collapsed, expand it
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
        refreshCloudFiles();
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

    if (loggedIn && user) {
        // Show file explorer, hide promo
        cloudPromoView.style.display = 'none';
        fileExplorerView.style.display = 'block';
        if (newFileBtn) {
            newFileBtn.style.display = 'flex';
        }

        // Hide auth section, show user profile
        authSection.style.display = 'none';
        userProfileSection.style.display = 'block';

        // Update user info
        const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
        const email = user.email || '';
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
        // Show promo, hide file explorer
        cloudPromoView.style.display = 'flex';
        fileExplorerView.style.display = 'none';
        if (newFileBtn) {
            newFileBtn.style.display = 'none';
        }

        // Show auth section, hide user profile
        authSection.style.display = 'block';
        userProfileSection.style.display = 'none';

        CLOUD_STATE.files.clear();
        CLOUD_STATE.folders = new Set(['main']);
        CLOUD_STATE.openTabs = [];
        CLOUD_STATE.activeFileKey = 'main/main.cpp';
        updateSaveIndicator();
    }
}



// ==================== JS-DOS BACKGROUND WARMUP ====================

async function warmupJSDOS() {
    if (warmupPromise) return warmupPromise;

    warmupPromise = new Promise(async (resolve) => {
        try {
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

            Logger.info('Starting JS-DOS background warmup...');

            // Pre-fetch and cache TC ZIP using shared function
            try {
                await getTCZip();
                Logger.success('TC ZIP ready for instant run');
            } catch (e) {
                Logger.warn('Failed to pre-cache TC ZIP: ' + e.message);
            }

            // Pre-cache all demo files in background
            prefetchDemoFiles();

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
        await initializeEditor();

        // Start warmup after editor is ready
        warmupJSDOS();
        updateCacheStatus();

        Logger.success('Compiler ready');
    }
})();
