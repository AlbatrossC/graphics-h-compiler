// ==================== CODEMIRROR 6 EDITOR ====================
// Lightweight code editor with basic C++ syntax highlighting
// and auto-close brackets. No heavy IDE features.

// ==================== CODEMIRROR CDN LOADING ====================

// We load CodeMirror modules from esm.sh CDN
// IMPORTANT: Do NOT use ?bundle — it causes each package to inline its own
// copy of @codemirror/state, breaking instanceof checks.
let cmModules = null;

async function loadCodeMirror() {
    Logger.info('Loading CodeMirror via ESM CDN...');
    updateLoadingProgress(30);

    try {
        // Import all needed CodeMirror modules from CDN
        // Without ?bundle, esm.sh deduplicates shared dependencies via consistent URLs
        const [
            cm,
            cmView,
            cmState,
            cmLanguage,
            cmCpp,
            cmCommands,
            cmAutocomplete,
            cmSearch,
            cmHighlight
        ] = await Promise.all([
            import('https://esm.sh/codemirror@6'),
            import('https://esm.sh/@codemirror/view@6'),
            import('https://esm.sh/@codemirror/state@6'),
            import('https://esm.sh/@codemirror/language@6'),
            import('https://esm.sh/@codemirror/lang-cpp@6'),
            import('https://esm.sh/@codemirror/commands@6'),
            import('https://esm.sh/@codemirror/autocomplete@6'),
            import('https://esm.sh/@codemirror/search@6'),
            import('https://esm.sh/@lezer/highlight@1')
        ]);

        cmModules = {
            cm: cm,
            view: cmView,
            state: cmState,
            language: cmLanguage,
            cpp: cmCpp,
            commands: cmCommands,
            autocomplete: cmAutocomplete,
            search: cmSearch,
            highlight: cmHighlight
        };

        Logger.success('CodeMirror modules loaded');
        updateLoadingProgress(70);
        return true;
    } catch (error) {
        Logger.error('Failed to load CodeMirror from ESM CDN', error);
        throw error;
    }
}

async function loadAllScripts() {
    try {
        Logger.info('Loading dependencies...');
        updateLoadingProgress(10);

        // Initialize resources from manifest first
        await initializeResourcesFromManifest();

        // Load JS-DOS using ResourceLoader
        await ResourceLoader.loadScript('libs', 'jsdos');
        scriptsLoaded.jsdos = true;
        updateLoadingProgress(20);

        // Load CodeMirror via ESM imports
        await loadCodeMirror();
        scriptsLoaded.codemirror = true;
        updateLoadingProgress(100);

        Logger.success('All dependencies loaded');
        return true;
    } catch (error) {
        Logger.error('Failed to load dependencies', error);
        const editorContainer = document.getElementById('editor');
        if (editorContainer) {
            editorContainer.innerHTML = `<div style="color: #ff6b6b; text-align: center; padding: 2rem; border: 1px solid #ff6b6b; border-radius: 8px; margin: 2rem;">
                <p style="margin-bottom: 1rem; font-size: 1.1rem;">⚠ Editor failed to load. This may be a network issue. Please refresh the page.</p>
                <button onclick="window.location.reload()" style="padding: 0.5rem 1rem; cursor: pointer; background: #ff6b6b; color: #fff; border: none; border-radius: 4px; font-weight: bold;">Refresh</button>
            </div>`;
        }
        return false;
    }
}

function updateLoadingProgress(percent) {
    if (loadingProgressBar) {
        loadingProgressBar.style.width = `${percent}%`;
    }
}

// ==================== DEMO FILE MANAGEMENT ====================

demoSelect.addEventListener('change', async (e) => {
    const selectedDemo = e.target.value;

    if (selectedDemo === lastLoadedDemo) {
        Logger.info(`Reloading ${selectedDemo} demo (force refresh)`);
        await loadDemoFile(selectedDemo, true);
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
                editor.setValue('');
                await new Promise(resolve => setTimeout(resolve, 50));
                editor.setValue(cachedCode);

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

        let response;
        try {
            const fetchOptions = forceReload ? { cache: 'no-cache' } : {};
            response = await ResourceLoader.fetchResource('demos', demoKey, fetchOptions);
        } catch (resourceError) {
            Logger.warn(`ResourceLoader failed for ${demoKey}, trying direct DEMO_FILES fallback`);
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

            DemoCache.set(demoKey, code);

            editor.setValue('');
            await new Promise(resolve => setTimeout(resolve, 50));
            editor.setValue(code);

            lastLoadedDemo = demoKey;
            currentDemo = demoKey;

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


// ==================== CODEMIRROR THEME CONFIGURATION ====================

// Theme compartment for live theme switching
let themeCompartment = null;
let fontSizeCompartment = null;
let wordWrapCompartment = null;
let lineNumbersCompartment = null;
let autocompleteCompartment = null;
let bracketMatchCompartment = null;
let activeLineCompartment = null;
let cmView = null; // Store the EditorView instance

// Global function for theme switching (called from core.js)
function updateEditorTheme(newTheme) {
    if (!cmView || !themeCompartment) return;
    if (typeof window.createEditorTheme === 'function') {
        const themeName = newTheme === 'dark' ? 'vscode-dark' : 'vscode-light';
        const theme = window.createEditorTheme(themeName);
        if (theme) {
            cmView.dispatch({
                effects: themeCompartment.reconfigure(theme)
            });
        }
    }
}

// ==================== EDITOR WRAPPER API ====================
// Provides the same API as the old Ace editor so storage.js, runtime.js, etc. work unchanged

function createEditorWrapper(view) {
    return {
        // Get full document text
        getValue() {
            return view.state.doc.toString();
        },

        // Set full document text
        setValue(text) {
            view.dispatch({
                changes: {
                    from: 0,
                    to: view.state.doc.length,
                    insert: text || ''
                }
            });
        },

        // No-op for compatibility
        clearSelection() {
            view.dispatch({ selection: { anchor: 0 } });
        },

        // Move cursor to line/col (0-based)
        moveCursorTo(line, col) {
            const targetLine = Math.min(line + 1, view.state.doc.lines);
            const lineInfo = view.state.doc.line(targetLine);
            const pos = lineInfo.from + Math.min(col, lineInfo.length);
            view.dispatch({ selection: { anchor: pos } });
        },

        // Focus the editor
        focus() {
            view.focus();
        },

        // Set font size
        setFontSize(sizeStr) {
            if (!fontSizeCompartment) return;
            const { EditorView } = cmModules.view;
            view.dispatch({
                effects: fontSizeCompartment.reconfigure(
                    EditorView.theme({ '.cm-content, .cm-gutters': { fontSize: sizeStr } })
                )
            });
        },

        // Resize — CodeMirror auto-resizes, but requestMeasure forces relayout
        resize() {
            view.requestMeasure();
        },

        // For compatibility with runtime.js
        requestMeasure() {
            view.requestMeasure();
        },

        // Change listener — no-op, actual listener set up in initializeEditor
        on(event, callback) {
            Logger.warn('editor.on("' + event + '") is a no-op in the CodeMirror 6 wrapper. Use EditorView.updateListener instead.');
        },

        // Renderer compatibility
        renderer: {
            updateFull() {
                view.requestMeasure();
            }
        },

        // Theme compatibility — handled by updateEditorTheme
        setTheme() { }
    };
}


// ==================== EDITOR INITIALIZATION ====================

async function initializeEditor() {
    if (!scriptsLoaded.codemirror || !cmModules) {
        setTimeout(initializeEditor, 100);
        return;
    }

    const { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } = cmModules.view;
    const { EditorState, Compartment } = cmModules.state;
    const { indentOnInput, bracketMatching } = cmModules.language;
    const { cpp } = cmModules.cpp;
    const { defaultKeymap, indentWithTab, history, historyKeymap } = cmModules.commands;
    const { closeBrackets, closeBracketsKeymap } = cmModules.autocomplete;
    const { highlightSelectionMatches } = cmModules.search;

    // Mobile detection
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;

    // Create compartments for dynamic reconfiguration
    themeCompartment = new Compartment();
    fontSizeCompartment = new Compartment();
    wordWrapCompartment = new Compartment();
    lineNumbersCompartment = new Compartment();
    autocompleteCompartment = new Compartment();
    bracketMatchCompartment = new Compartment();
    activeLineCompartment = new Compartment();

    // Default Font Size
    let currentFontSize = parseInt(localStorage.getItem('editor_font_size')) || (isMobileDevice ? 14 : 16);

    // Determine initial theme
    const currentTheme = document.documentElement.getAttribute('data-theme');
    let initialTheme;
    if (typeof window.createEditorTheme === 'function') {
        initialTheme = window.createEditorTheme(currentTheme === 'dark' ? 'vscode-dark' : 'vscode-light');
    } else {
        const isDark = currentTheme === 'dark';
        initialTheme = [EditorView.theme({
            '&': { backgroundColor: 'transparent' },
            '.cm-content': { color: isDark ? '#f8f8f2' : '#1a1a1a' }
        }, { dark: isDark })];
    }

    // Build extensions
    const extensions = [
        lineNumbersCompartment.of(lineNumbers()),
        activeLineCompartment.of([highlightActiveLine(), highlightActiveLineGutter()]),
        drawSelection(),
        indentOnInput(),
        bracketMatchCompartment.of(bracketMatching()),
        autocompleteCompartment.of(closeBrackets()),
        history(),
        highlightSelectionMatches(),
        cpp(),
        keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
        ]),
        themeCompartment.of(initialTheme),
        fontSizeCompartment.of(
            EditorView.theme({
                '.cm-content, .cm-gutters': { fontSize: `${currentFontSize}px` }
            })
        ),
        EditorView.theme({
            '.cm-content': {
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            },
            '.cm-gutters': {
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            },
            '&': {
                height: '100%',
            },
            '.cm-scroller': {
                overflow: 'auto',
            }
        }),
        EditorState.tabSize.of(4),
        wordWrapCompartment.of(EditorView.lineWrapping),
    ];

    // Create the editor view
    const editorContainer = document.getElementById('editor');
    editorContainer.innerHTML = ''; // Clear any loading content

    cmView = new EditorView({
        state: EditorState.create({
            doc: '',
            extensions: extensions
        }),
        parent: editorContainer
    });

    // Create the wrapper that provides Ace-compatible API
    editor = createEditorWrapper(cmView);

    // Font Size Controls
    const increaseFontBtn = document.getElementById('increase-font-btn');
    const decreaseFontBtn = document.getElementById('decrease-font-btn');
    const fontSizeDisplay = document.getElementById('font-size-display');

    function updateFontSizeDisplay(size) {
        if (fontSizeDisplay) {
            fontSizeDisplay.textContent = size;
        }
    }

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

    // Change listener — using CodeMirror's updateListener
    let uiUpdateTimer = null;
    const UI_UPDATE_DEBOUNCE_MS = 150;

    // Add change listener extension
    const changeListener = EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;

        // Track editor changes (metrics only)
        metrics.editor.changeCount++;
        metrics.editor.lastChangeAt = Date.now();

        // Set dirty flag immediately
        DIRTY_FLAG.isDirty = true;

        // FAST PATH: Save locally immediately
        if (isUserLoggedIn) {
            const activeKey = CLOUD_STATE.activeFileKey;
            if (activeKey) {
                const [folder, filename] = activeKey.split('/');
                setLocalDraft(folder, filename, update.state.doc.toString());
            }
            scheduleAutosave();
        }

        // SLOW PATH: Debounce UI updates
        if (uiUpdateTimer) {
            clearTimeout(uiUpdateTimer);
        }
        uiUpdateTimer = setTimeout(() => {
            updateEditorInfo();
            updateSaveIndicator();
            uiUpdateTimer = null;
        }, UI_UPDATE_DEBOUNCE_MS);
    });

    // Dispatch the change listener into the view
    cmView.dispatch({
        effects: cmModules.state.StateEffect.appendConfig.of(changeListener)
    });

    setTimeout(() => {
        editor.focus();
        editorWrapper.classList.add('active');

        const editorLoadingOverlay = document.getElementById('editor-loading-overlay');
        if (editorLoadingOverlay) {
            editorLoadingOverlay.classList.add('hidden');
        }
    }, 100);

    // Auto-fullscreen editor on mobile when clicked/focused
    const editorDom = cmView.contentDOM;
    if (editorDom) {
        const checkMobileFullscreen = () => {
            if (window.innerWidth <= 768 && typeof toggleEditorFullscreen === 'function' && typeof isEditorFullscreen !== 'undefined' && !isEditorFullscreen) {
                toggleEditorFullscreen(true);
            }
        };
        editorDom.addEventListener('focus', checkMobileFullscreen);
        editorDom.addEventListener('click', checkMobileFullscreen);
    }

    Logger.success('Editor ready (CodeMirror 6)');
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
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();
        return;
    }

    const savedCode = localStorage.getItem("tc_code");
    if (savedCode) {
        editor.setValue(savedCode);
        updateEditorInfo();
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();

        Logger.info('Restored saved code');
        return;
    }

    // Load default demo (graphics-demo)
    await loadDemoFile('graphics-demo', false);
    DIRTY_FLAG.isDirty = false;
    updateSaveIndicator();
}

// Clear button functionality
clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the editor?')) {
        editor.setValue('');
        if (isUserLoggedIn) {
            const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
            const [folder, filename] = activeKey.split('/');
            setLocalDraft(folder, filename, '');
            CLOUD_STATE.lastSavedHash = null;
        } else {
            localStorage.removeItem("tc_code");
        }
        lastLoadedDemo = '';
        updateEditorInfo();
        updateSaveIndicator();
        Logger.info('Editor cleared');
    }
});
