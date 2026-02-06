// ==================== GLOBAL CONSOLE FILTER ====================
// Suppress verbose js-dos extraction logs and worker messages
(function () {
    const originalLog = console.log;
    const originalInfo = console.info;

    // Filter function to block unwanted messages
    const shouldBlock = (msg) => {
        if (typeof msg !== 'string') return false;

        // Block extraction messages
        if (msg.includes('extracting:')) return true;

        // Block js-dos version and copyright
        if (msg.includes('js-dos version')) return true;
        if (msg.includes('Copyright') && msg.includes('DOSBox')) return true;

        // Block CONFIG messages
        if (msg.startsWith('CONFIG:')) return true;

        // Block MIDI messages
        if (msg.startsWith('MIDI:')) return true;

        // Block SHELL messages
        if (msg.startsWith('SHELL:')) return true;

        // Block progress percentage messages (UUID with %)
        if (msg.includes('%') && msg.match(/[a-f0-9-]{36}/)) return true;

        // Block [INFO] messages with UUIDs (progress indicators)
        if (msg.startsWith('[INFO]') && msg.match(/[a-f0-9-]{36}/)) return true;

        // Block "Resolving DosBox" messages
        if (msg.includes('Resolving DosBox')) return true;
        if (msg.includes('DosBox resolved')) return true;

        // Block runtime error messages from js-dos
        if (msg.includes('Runtime is still alive')) return true;

        // Block separator lines
        if (msg.trim() === '---') return true;

        return false;
    };

    // Override console.log
    console.log = function (...args) {
        if (args.length > 0 && shouldBlock(args[0])) {
            return; // Silently drop the message
        }
        originalLog.apply(console, args);
    };

    // Override console.info
    console.info = function (...args) {
        if (args.length > 0 && shouldBlock(args[0])) {
            return; // Silently drop the message
        }
        originalInfo.apply(console, args);
    };
})();

// ==================== FULLSCREEN FUNCTIONALITY - FIXED ====================

let isEditorFullscreen = false;
let isTerminalFullscreen = false;

document.getElementById('fullscreen-editor-btn').addEventListener('click', () => {
    isEditorFullscreen = !isEditorFullscreen;

    if (isEditorFullscreen) {
        editorWrapper.classList.add('fullscreen');
        terminalWrapper.classList.add('hidden');
    } else {
        editorWrapper.classList.remove('fullscreen');
        terminalWrapper.classList.remove('hidden');
    }

    // Force editor resize after fullscreen toggle
    setTimeout(() => {
        if (editor) {
            editor.resize();
            editor.renderer.updateFull();
        }
    }, 100);
});

document.getElementById('fullscreen-terminal-btn').addEventListener('click', () => {
    isTerminalFullscreen = !isTerminalFullscreen;

    if (isTerminalFullscreen) {
        terminalWrapper.classList.add('fullscreen');
        editorWrapper.classList.add('hidden');
    } else {
        terminalWrapper.classList.remove('fullscreen');
        editorWrapper.classList.remove('hidden');
    }

    // Force canvas resize after fullscreen toggle
    setTimeout(() => {
        if (dosInstance) {
            // Trigger canvas resize
            window.dispatchEvent(new Event('resize'));
        }
    }, 100);
});

// ==================== KEYBOARD INPUT ISOLATION ====================

let keyboardEventBlocker = null;

function setupKeyboardBlocker() {
    keyboardEventBlocker = function (e) {
        if (!terminalFocused) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }
    };

    window.addEventListener('keydown', keyboardEventBlocker, true);
    window.addEventListener('keyup', keyboardEventBlocker, true);
    window.addEventListener('keypress', keyboardEventBlocker, true);
}

// ==================== FOCUS MANAGEMENT ====================

function focusTerminal() {
    if (!dosInstance) return;

    terminalFocused = true;
    canvas.focus();
    canvas.tabIndex = 1;
    terminalWrapper.classList.add('terminal-active');
    editorWrapper.classList.remove('active');
    keyboardBlocker.classList.remove('active');
}

function focusEditor() {
    if (!editor) return;

    terminalFocused = false;
    canvas.tabIndex = -1;
    canvas.blur();
    editor.focus();
    terminalWrapper.classList.remove('terminal-active');
    editorWrapper.classList.add('active');
    keyboardBlocker.classList.add('active');
}

keyboardBlocker.addEventListener('click', () => {
    focusTerminal();
});

terminalWrapper.addEventListener('click', (e) => {
    if (e.target === terminalWrapper || e.target === canvas) {
        if (dosInstance && !terminalFocused) {
            focusTerminal();
        }
    }
});

editorWrapper.addEventListener('click', () => {
    focusEditor();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        focusEditor();
        return false;
    }
}, true);

// ==================== RUN PROGRAM ====================

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

    // Track run execution
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

    if (dosInstance) {
        try {
            metrics.runtime.runtimeReuseErrors++;
            Logger.warn('[Run] Runtime already alive – reuse prevented');
            dosInstance.exit();
        } catch (e) {
            Logger.warn('Error closing previous DOS instance');
        }
        dosInstance = null;
    }

    // Clear existing error interval
    if (errorUpdateInterval) {
        clearInterval(errorUpdateInterval);
        errorUpdateInterval = null;
    }

    // Hide panel initially
    outputPanel.classList.remove('visible');
    terminalWrapper.classList.remove('has-panel');
    lastErrorContent = '';
    outputContent.textContent = '';

    try {
        // Wait for Dos to be available
        if (!scriptsLoaded.jsdos || typeof Dos === 'undefined') {
            loadingText.textContent = 'Waiting for JS-DOS...';
            updateLoadingProgress(20);
            await new Promise((resolve) => {
                const checkDos = setInterval(() => {
                    if (typeof Dos !== 'undefined') {
                        clearInterval(checkDos);
                        resolve();
                    }
                }, 100);
            });
        }

        updateLoadingProgress(40);

        // Determine wdosbox URL using ResourceLoader with automatic fallback
        let wdosboxUrl = await ResourceLoader.getResourceUrl('libs', 'wdosbox');
        const usingOnline = !ResourceLoader.isOffline() && wdosboxUrl && !wdosboxUrl.startsWith('/');

        Logger.info(`Using ${usingOnline ? 'CDN' : 'local'} WDOSBOX: ${wdosboxUrl}`);
        updateLoadingProgress(60);


        Dos(canvas, {
            wdosboxUrl: wdosboxUrl,
            cycles: "max",
            autolock: false,
        }).ready(async (fs, main) => {

            loadingText.textContent = 'Loading Turbo C++...';
            updateLoadingProgress(70);

            try {
                // Use shared getTCZip to prevent race condition with warmup
                loadingText.textContent = 'Loading compiler...';
                const tcBlob = await getTCZip();

                // Create a temporary URL for the blob
                const blobUrl = URL.createObjectURL(tcBlob);

                loadingText.textContent = 'Extracting compiler files...';

                // Track ZIP extraction (metrics only, no logging)
                metrics.runtime.zipExtractionStarted++;

                // Log clean extraction message
                Logger.info('[Runtime] Extracting Turbo C environment...');
                const extractStartTime = performance.now();

                // Suppress ALL console output during extraction (js-dos is very verbose)
                const originalLog = console.log;
                const originalInfo = console.info;
                const originalWarn = console.warn;
                const originalError = console.error;
                const originalDebug = console.debug;

                // Create a filter function to block extraction messages
                const blockExtraction = (msg) => {
                    if (typeof msg === 'string' && msg.includes('extracting:')) {
                        return true; // Block this message
                    }
                    return false;
                };

                // Suppress all console methods
                console.log = (...args) => { if (!blockExtraction(args[0])) originalLog.apply(console, args); };
                console.info = (...args) => { if (!blockExtraction(args[0])) originalInfo.apply(console, args); };
                console.warn = (...args) => { if (!blockExtraction(args[0])) originalWarn.apply(console, args); };
                console.error = (...args) => { if (!blockExtraction(args[0])) originalError.apply(console, args); };
                console.debug = () => { }; // Completely silent

                try {
                    // Now extract from the blob URL - js-dos can handle blob: URLs
                    await fs.extract(blobUrl);
                } finally {
                    // Restore ALL console methods
                    console.log = originalLog;
                    console.info = originalInfo;
                    console.warn = originalWarn;
                    console.error = originalError;
                    console.debug = originalDebug;
                }

                // Track completion (metrics only, no logging)
                metrics.runtime.zipExtractionCompleted++;

                // Calculate extraction time
                const extractTime = ((performance.now() - extractStartTime) / 1000).toFixed(1);
                Logger.success(`[Runtime] Extraction complete (312 files, ${extractTime}s)`);

                // Clean up the blob URL
                URL.revokeObjectURL(blobUrl);

                Logger.success('Turbo C compiler loaded');
            } catch (e) {
                Logger.error('Compiler extraction failed', e);
                throw new Error('Failed to load compiler: ' + e.message);
            }

            loadingText.textContent = 'Writing source code...';
            updateLoadingProgress(80);
            fs.createFile("TURBOC3/BIN/USER.CPP", code);

            const batchScript = `@ECHO OFF
CD TURBOC3\\BIN
IF EXIST USER.EXE DEL USER.EXE
IF EXIST ERR.TXT DEL ERR.TXT
TCC -I..\\INCLUDE -L..\\LIB -n. USER.CPP ..\\LIB\\GRAPHICS.LIB > ERR.TXT
IF EXIST USER.EXE GOTO SUCCESS
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

            fs.createFile("AUTOEXEC.BAT", batchScript);

            loadingText.textContent = 'Starting program...';
            updateLoadingProgress(90);

            dosInstance = await main(["-conf", "dosbox.conf", "AUTOEXEC.BAT"]);

            setupKeyboardBlocker();

            updateLoadingProgress(100);
            loading.classList.remove('active');
            runBtn.disabled = false;
            runBtn.classList.remove('loading');

            Logger.success('Program started successfully');

            setTimeout(() => {
                focusTerminal();
            }, 500);

            // Start checking for compilation errors
            errorUpdateInterval = setInterval(() => checkCompilationErrors(), 1000);
        });

    } catch (error) {
        Logger.error('Failed to start DOS environment', error);
        alert('Failed to start DOS environment. Error: ' + error.message);
        loading.classList.remove('active');
        runBtn.disabled = false;
        runBtn.classList.remove('loading');
        updateLoadingProgress(0);
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

    // Check if content has changed since last cloud save
    const currentContent = code;
    const lastSavedContent = localStorage.getItem(`lastCloudSave_${folder}_${filename}`);

    // If content is the same, no need to save
    if (currentContent === lastSavedContent) {
        return;
    }

    // Try sendBeacon for guaranteed background save
    if (navigator.sendBeacon && supabaseClient) {
        try {
            // Get session synchronously from localStorage cache if available
            const sessionData = localStorage.getItem('sb-session');
            let token = null;

            if (sessionData) {
                try {
                    const parsed = JSON.parse(sessionData);
                    token = parsed?.access_token;
                } catch (e) { }
            }

            if (token) {
                const payload = JSON.stringify({
                    folder,
                    filename,
                    content: code,
                    token: token // Include token in body since sendBeacon can't set headers
                });

                // sendBeacon is fire-and-forget, will complete even after tab closes
                const sent = navigator.sendBeacon('/files/beacon-save', payload);
                if (sent) {
                    Logger.info('Tab close: sendBeacon fired for background save');
                }
            }
        } catch (e) {
            // sendBeacon failed, but localStorage save already happened
        }
    }

    // Only show warning if there are significant unsaved changes AND last save was long ago
    const lastSaveTime = CLOUD_STATE.lastSavedAt || 0;
    const timeSinceLastSave = Date.now() - lastSaveTime;
    const significantDelay = 5 * 60 * 1000; // 5 minutes

    // Don't show warning - rely on localStorage + sendBeacon protection
    // This provides smooth UX while still protecting user's work
});

// ==================== RESPONSIVE HANDLING ====================

function handleResize() {
    if (editor) {
        editor.resize();
        editor.renderer.updateFull();
    }
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 300);
});

// ==================== SIDEBAR FUNCTIONALITY ====================
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
const newFileModal = document.getElementById('new-file-modal');
const newFileInput = document.getElementById('new-file-input');
const newFileCreate = document.getElementById('new-file-create');
const newFileCancel = document.getElementById('new-file-cancel');
const newFileClose = document.getElementById('new-file-close');

// User state (will be updated by auth logic)
let isUserLoggedIn = false;
let currentUser = null;
let supabaseClient = null;

// Mobile toggle
if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
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
    sidebarCollapseBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        // Resize editor after collapse animation
        setTimeout(() => {
            if (editor) {
                editor.resize();
                editor.renderer.updateFull();
            }
        }, 350);
    });
}

// Activity bar button to toggle sidebar
if (explorerActivityBtn) {
    explorerActivityBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        setTimeout(() => {
            if (editor) {
                editor.resize();
                editor.renderer.updateFull();
            }
        }, 350);
    });
}

if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        refreshCloudFiles();
    });
}

// New File button
if (newFileBtn) {
    newFileBtn.addEventListener('click', () => {
        if (!isUserLoggedIn) {
            return;
        }
        openNewFileModal();
    });
}

function openNewFileModal() {
    if (!newFileModal || !newFileInput) return;
    newFileModal.classList.remove('hidden');
    newFileInput.value = '';
    newFileInput.focus();
}

function closeNewFileModal() {
    if (!newFileModal) return;
    newFileModal.classList.add('hidden');
}

if (newFileCreate) {
    newFileCreate.addEventListener('click', () => {
        const filename = newFileInput ? newFileInput.value : '';
        closeNewFileModal();
        createNewFile(filename);
    });
}

if (newFileCancel) {
    newFileCancel.addEventListener('click', () => {
        closeNewFileModal();
    });
}

if (newFileClose) {
    newFileClose.addEventListener('click', () => {
        closeNewFileModal();
    });
}

if (newFileModal) {
    newFileModal.addEventListener('click', (e) => {
        if (e.target === newFileModal) {
            closeNewFileModal();
        }
    });
}

if (newFileInput) {
    newFileInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            newFileCreate?.click();
        } else if (e.key === 'Escape') {
            closeNewFileModal();
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

        refreshCloudFiles()
            .then(() => {
                const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
                const [folder, filename] = activeKey.split('/');
                return openFile(folder, filename, { skipSave: true });
            })
            .catch(() => { });
    } else {
        // Show promo, hide file explorer
        cloudPromoView.style.display = 'flex';
        fileExplorerView.style.display = 'none';
        if (newFileBtn) {
            newFileBtn.style.display = 'none';
        }
        closeNewFileModal();

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
    // Pre-fetch all demo files in background
    for (const [key, url] of Object.entries(DEMO_FILES)) {
        if (!DemoCache.get(key)) {
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
        }
    }
}

// ==================== INITIALIZATION ====================

(async function init() {
    Logger.info('Initializing compiler...');
    updateSaveIndicator();

    // Start background warmup immediately (don't wait for editor)
    // This runs in parallel with script loading for faster first run
    const warmupEarly = setTimeout(() => {
        warmupJSDOS();
    }, 100);

    const loaded = await loadAllScripts();
    if (loaded) {
        await initializeEditor();

        // Clear early warmup if it hasn't started yet
        clearTimeout(warmupEarly);

        // Ensure warmup is running and update cache status
        warmupJSDOS();
        updateCacheStatus();

        Logger.success('Compiler ready');
    }
})();
