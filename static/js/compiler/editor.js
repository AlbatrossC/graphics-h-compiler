// ==================== SCRIPT LOADING WITH FALLBACK ====================

function loadScript(url, fallbackUrl, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const tryLoad = (src, isFallback = false) => {
            return new Promise((res, rej) => {
                const script = document.createElement('script');
                script.src = src;

                const timer = setTimeout(() => {
                    script.onerror = null;
                    script.onload = null;
                    rej(new Error('Timeout'));
                }, timeout);

                script.onload = () => {
                    clearTimeout(timer);
                    if (isFallback) {
                        Logger.info(`Using fallback: ${src}`);
                    }
                    res(true);
                };

                script.onerror = () => {
                    clearTimeout(timer);
                    rej(new Error(`Failed to load: ${src}`));
                };

                document.head.appendChild(script);
            });
        };

        tryLoad(url)
            .then(resolve)
            .catch(() => {
                Logger.warn(`Primary source failed, trying fallback`);
                tryLoad(fallbackUrl, true)
                    .then(resolve)
                    .catch(reject);
            });
    });
}

async function loadAllScripts() {
    try {
        Logger.info('Loading dependencies via ResourceLoader...');
        updateLoadingProgress(10);

        // Initialize resources from manifest first
        await initializeResourcesFromManifest();

        // Load JS-DOS using ResourceLoader
        await ResourceLoader.loadScript('libs', 'jsdos');
        scriptsLoaded.jsdos = true;
        updateLoadingProgress(30);

        // Load Ace Editor using ResourceLoader
        await ResourceLoader.loadScript('libs', 'ace');
        scriptsLoaded.ace = true;
        updateLoadingProgress(50);

        await waitForAce();

        // Load Ace C++ Mode using ResourceLoader
        await ResourceLoader.loadScript('libs', 'ace-mode-cpp');
        scriptsLoaded.aceMode = true;
        updateLoadingProgress(70);

        // Load Ace Monokai Theme using ResourceLoader
        await ResourceLoader.loadScript('libs', 'ace-theme-monokai');

        // Load Ace Textmate Theme for light mode using ResourceLoader
        await ResourceLoader.loadScript('libs', 'ace-theme-textmate');

        scriptsLoaded.aceTheme = true;
        updateLoadingProgress(100);

        Logger.success('All dependencies loaded');
        return true;
    } catch (error) {
        Logger.error('Failed to load dependencies', error);
        alert('Failed to load required libraries. Please check your connection and try again.');
        return false;
    }
}


function updateLoadingProgress(percent) {
    if (loadingProgressBar) {
        loadingProgressBar.style.width = `${percent}%`;
    }
}

function waitForAce() {
    return new Promise((resolve) => {
        const checkAce = setInterval(() => {
            if (typeof ace !== 'undefined') {
                clearInterval(checkAce);
                resolve();
            }
        }, 50);
    });
}

// ==================== DEMO FILE MANAGEMENT - FIXED ====================

demoSelect.addEventListener('change', async (e) => {
    const selectedDemo = e.target.value;

    // Check if clicking the same demo that's already loaded
    if (selectedDemo === lastLoadedDemo) {
        Logger.info(`Reloading ${selectedDemo} demo (force refresh)`);
        await loadDemoFile(selectedDemo, true); // Force reload
    } else {
        currentDemo = selectedDemo;
        await loadDemoFile(selectedDemo, false);
    }
});

async function loadDemoFile(demoKey, forceReload = false) {
    if (!editor) return;

    try {
        // Check cache first (unless force reload)
        if (!forceReload) {
            const cachedCode = DemoCache.get(demoKey);
            if (cachedCode) {
                Logger.info(`Loading ${demoKey} demo from cache`);
                editor.setValue('', -1);
                await new Promise(resolve => setTimeout(resolve, 50));
                editor.setValue(cachedCode, -1);
                editor.clearSelection();
                editor.moveCursorTo(0, 0);

                lastLoadedDemo = demoKey;
                currentDemo = demoKey;
                localStorage.removeItem("tc_code");

                updateEditorInfo();
                updateSaveIndicator();

                Logger.success(`Loaded ${demoKey} demo from cache`);
                return;
            }
        }

        Logger.info(`Loading ${demoKey} demo using ResourceLoader...${forceReload ? ' (force reload)' : ''}`);

        // Use ResourceLoader to fetch demo with automatic fallback to local files
        let response;
        try {
            // For force reload, add cache buster to the fetch
            const fetchOptions = forceReload ? { cache: 'no-cache' } : {};
            response = await ResourceLoader.fetchResource('demos', demoKey, fetchOptions);
        } catch (resourceError) {
            Logger.warn(`ResourceLoader failed for ${demoKey}, trying direct DEMO_FILES fallback`);
            // Fallback to DEMO_FILES if ResourceLoader fails
            const demoUrl = DEMO_FILES[demoKey];
            if (demoUrl) {
                const cacheBuster = forceReload ? `?t=${Date.now()}` : '';
                response = await fetch(demoUrl + cacheBuster);
            } else {
                throw new Error(`Demo file not found: ${demoKey}`);
            }
        }

        if (response.ok) {
            const code = await response.text();

            // Cache the demo file
            DemoCache.set(demoKey, code);

            editor.setValue('', -1);
            await new Promise(resolve => setTimeout(resolve, 50));
            editor.setValue(code, -1);
            editor.clearSelection();
            editor.moveCursorTo(0, 0);

            // Update last loaded demo
            lastLoadedDemo = demoKey;
            currentDemo = demoKey;

            // Mark as modified when loading a demo
            if (isUserLoggedIn) {
                const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
                const [folder, filename] = activeKey.split('/');
                setLocalDraft(folder, filename, code);
                CLOUD_STATE.lastSavedHash = null;
                scheduleAutosave();
            } else {
                localStorage.removeItem("tc_code");
            }

            updateEditorInfo();
            updateSaveIndicator();

            Logger.success(`Loaded ${demoKey} demo`);
        } else {
            Logger.error(`Failed to load demo: ${response.status}`);
            alert('Failed to load demo file. Please try again.');
        }
    } catch (e) {
        Logger.error('Error loading demo file', e);
        alert('Error loading demo file. Please check your connection or try offline mode.');
    }
}


// ==================== EDITOR INITIALIZATION ====================

async function initializeEditor() {
    if (!scriptsLoaded.ace || typeof ace === 'undefined') {
        setTimeout(initializeEditor, 100);
        return;
    }

    editor = ace.edit("editor");

    // Set theme based on current theme setting
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const aceTheme = currentTheme === 'dark' ? 'ace/theme/monokai' : 'ace/theme/textmate';
    editor.setTheme(aceTheme);

    editor.session.setMode("ace/mode/c_cpp");

    // Mobile detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;

    editor.setShowPrintMargin(false);

    // Default Font Size
    let currentFontSize = parseInt(localStorage.getItem('editor_font_size')) || (isMobile ? 14 : 16);

    // Apply basic settings
    editor.setOptions({
        fontSize: `${currentFontSize}px`,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        highlightActiveLine: !isMobile, // Disable on mobile for performance
        showGutter: true,
        tabSize: 4,
        useSoftTabs: true,
        wrap: true,
        behavioursEnabled: !isMobile, // Disable auto-pairing on mobile (can be annoying/slow)
        animatedScroll: !isMobile,    // Disable smooth scrolling on mobile
        displayIndentGuides: !isMobile, // Disable indent guides on mobile
        showFoldWidgets: !isMobile    // Disable code folding widgets on mobile
    });

    // Font Size Controls
    const increaseFontBtn = document.getElementById('increase-font-btn');
    const decreaseFontBtn = document.getElementById('decrease-font-btn');

    const fontSizeDisplay = document.getElementById('font-size-display');

    function updateFontSizeDisplay(size) {
        if (fontSizeDisplay) {
            fontSizeDisplay.textContent = size;
        }
    }

    // Set initial display
    updateFontSizeDisplay(currentFontSize);

    if (increaseFontBtn && decreaseFontBtn) {
        increaseFontBtn.addEventListener('click', () => {
            currentFontSize += 1;
            if (currentFontSize > 32) currentFontSize = 32;
            editor.setFontSize(`${currentFontSize}px`);
            localStorage.setItem('editor_font_size', currentFontSize);
            updateFontSizeDisplay(currentFontSize);
            Logger.info(`Font size increased to ${currentFontSize}px`);
        });

        decreaseFontBtn.addEventListener('click', () => {
            currentFontSize -= 1;
            if (currentFontSize < 10) currentFontSize = 10;
            editor.setFontSize(`${currentFontSize}px`);
            localStorage.setItem('editor_font_size', currentFontSize);
            updateFontSizeDisplay(currentFontSize);
            Logger.info(`Font size decreased to ${currentFontSize}px`);
        });
    }

    // Copy Code Button
    const copyCodeBtn = document.getElementById('copy-code-btn');
    if (copyCodeBtn) {
        copyCodeBtn.addEventListener('click', async () => {
            const code = editor.getValue();
            if (!code) return;

            try {
                await navigator.clipboard.writeText(code);

                // Visual feedback
                const originalTitle = copyCodeBtn.title;
                const originalHTML = copyCodeBtn.innerHTML;

                copyCodeBtn.classList.add('success');
                copyCodeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                copyCodeBtn.title = 'Copied!';

                setTimeout(() => {
                    copyCodeBtn.classList.remove('success');
                    copyCodeBtn.innerHTML = originalHTML;
                    copyCodeBtn.title = originalTitle;
                }, 2000);

                Logger.info('Code copied to clipboard');
            } catch (err) {
                Logger.error('Failed to copy code', err);
            }
        });
    }

    await loadDefaultCode();

    // CRITICAL FIX #1: Separate fast and slow operations, use dirty flag
    let uiUpdateTimer = null;
    const UI_UPDATE_DEBOUNCE_MS = 150;
    let lastEditorValue = '';

    editor.on('change', () => {
        const currentValue = editor.getValue();

        // Track editor changes (metrics only)
        metrics.editor.changeCount++;
        metrics.editor.lastChangeAt = Date.now();

        // Set dirty flag immediately (synchronous, no blocking)
        // BUGFIX #1: Fixed dirty flag logic - always mark as dirty on ANY keystroke
        DIRTY_FLAG.isDirty = true;

        // FAST PATH: Save locally immediately (non-blocking, small operation)
        if (isUserLoggedIn) {
            const activeKey = CLOUD_STATE.activeFileKey;
            if (activeKey) {
                const [folder, filename] = activeKey.split('/');
                // Use debounced local draft save (already 100ms debounced internally)
                setLocalDraft(folder, filename, currentValue);
            }
            // Schedule cloud autosave (debounced at 3000ms)
            scheduleAutosave();
        }

        // SLOW PATH: Debounce UI updates (updateEditorInfo + updateSaveIndicator)
        // These use dirty flag now, so they're much faster but still debounced for smoothness
        if (uiUpdateTimer) {
            clearTimeout(uiUpdateTimer);
        }
        uiUpdateTimer = setTimeout(() => {
            updateEditorInfo();  // Fast now (just counts lines/chars)
            updateSaveIndicator();  // Fast now (uses dirty flag, no hash)
            uiUpdateTimer = null;
        }, UI_UPDATE_DEBOUNCE_MS);

        lastEditorValue = currentValue;
    });

    setTimeout(() => {
        editor.focus();
        editorWrapper.classList.add('active');

        // Hide the initial loading overlay
        const editorLoadingOverlay = document.getElementById('editor-loading-overlay');
        if (editorLoadingOverlay) {
            editorLoadingOverlay.classList.add('hidden');
        }
    }, 100);

    Logger.success('Editor ready');
}

function updateEditorInfo() {
    if (!editor || !editorInfo) return;

    const code = editor.getValue();
    const lines = code.split('\n').length;
    const chars = code.length;

    editorInfo.textContent = `Lines: ${lines} | Chars: ${chars}`;
}



async function loadDefaultCode() {
    if (isUserLoggedIn) {
        await refreshCloudFiles();
        const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
        const [folder, filename] = activeKey.split('/');
        await openFile(folder, filename, { skipSave: true });
        // CRITICAL FIX #7: Set dirty flag after loading
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();
        return;
    }

    const savedCode = localStorage.getItem("tc_code");
    if (savedCode) {
        editor.setValue(savedCode, -1);
        updateEditorInfo();
        // CRITICAL FIX #7: Content loaded = not dirty
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();

        Logger.info('Restored saved code');
        return;
    }

    // Load default demo (graphics-demo)
    await loadDemoFile('graphics-demo', false);
    // CRITICAL FIX #7: Demo loaded = not dirty
    DIRTY_FLAG.isDirty = false;
    updateSaveIndicator();
}

// Clear button functionality
clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the editor?')) {
        editor.setValue('', -1);
        if (isUserLoggedIn) {
            const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
            const [folder, filename] = activeKey.split('/');
            setLocalDraft(folder, filename, '');
            CLOUD_STATE.lastSavedHash = null;
        } else {
            localStorage.removeItem("tc_code");
        }
        lastLoadedDemo = ''; // Reset last loaded demo
        updateEditorInfo();
        updateSaveIndicator();
        Logger.info('Editor cleared');
    }
});

