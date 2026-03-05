// ==================== CODEMIRROR 6 EDITOR ====================
// Lightweight code editor with basic C++ syntax highlighting
// and auto-close brackets. No heavy IDE features.

// ==================== CODEMIRROR LOCAL BUNDLE LOADING ====================

let cmModules = null;

async function loadCodeMirror() {
    Logger.info('Loading CodeMirror via local bundle...');
    updateLoadingProgress(30);

    try {
        const bundle = await import('/static/js/codemirror.bundle.v1.js');

        cmModules = {
            cm: bundle.cmCore,
            view: bundle.cmView,
            state: bundle.cmCore,
            language: bundle.cmLanguage,
            cpp: bundle.cmCpp,
            commands: bundle.cmCommands,
            autocomplete: bundle.cmAutocomplete,
            search: bundle.cmSearch,
            highlight: bundle.lezerHighlight,
            themeEngine: bundle.themeEngine
        };

        Logger.success('CodeMirror bundle loaded');
        updateLoadingProgress(70);
        return true;
    } catch (error) {
        Logger.error('Failed to load CodeMirror bundle', error);
        throw error;
    }
}

async function loadAllScripts() {
    try {
        Logger.info('Loading dependencies with optimized flow...');
        updateLoadingProgress(10);

        // Initialize resources from manifest first
        await initializeResourcesFromManifest();

        // Load CodeMirror bundle immediately (Phase 2)
        await loadCodeMirror();
        scriptsLoaded.codemirror = true;
        updateLoadingProgress(50);

        // Initialize editor immediately, do not wait for JS-DOS
        initializeEditor();

        // Load JS-DOS and Prefetch TC in background in parallel (Phase 3)
        Promise.all([
            (async () => {
                try {
                    await ResourceLoader.loadScript('libs', 'jsdos');
                    scriptsLoaded.jsdos = true;
                    Logger.info('JS-DOS loaded in background');
                } catch (e) {
                    Logger.warn('Failed to load JS-DOS', e);
                }
            })(),
            (async () => {
                try {
                    Logger.info('Prefetching TC.zip in background...');
                    await getTCZip();
                    Logger.success('TC.zip prefetched');
                } catch (e) {
                    Logger.warn('TC.zip prefetch skipped', e);
                }
            })()
        ]).then(() => {
            updateLoadingProgress(100);
            Logger.success('All background dependencies loaded');
        });

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

        // Theme compatibility
        setTheme() { }
    };
}

function createSelectedMatchHighlightExtension() {
    const { Decoration, ViewPlugin } = cmModules.view;
    const selectedMark = Decoration.mark({ class: 'cm-selectionMatch cm-selectionMatch-main' });

    return ViewPlugin.fromClass(class {
        constructor(view) {
            this.decorations = this.buildDecorations(view);
        }

        update(update) {
            if (update.selectionSet || update.docChanged) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        buildDecorations(view) {
            const main = view.state.selection.main;
            if (main.empty) {
                return Decoration.none;
            }
            return Decoration.set([selectedMark.range(main.from, main.to)], true);
        }
    }, {
        decorations: (plugin) => plugin.decorations
    });
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

    const defaultEditorSettings = (typeof APP_SETTINGS_DEFAULTS !== 'undefined' && APP_SETTINGS_DEFAULTS.editor)
        ? APP_SETTINGS_DEFAULTS.editor
        : {
            theme: THEME_VSCODE_DARK,
            fontSize: 16,
            wordWrap: true,
            lineNumbers: true,
            autocomplete: true,
            bracketMatching: true,
            activeLine: true
        };

    const appSettings = (typeof loadAppSettings === 'function')
        ? loadAppSettings()
        : { editor: { ...defaultEditorSettings } };

    const initialEditorSettings = {
        ...defaultEditorSettings,
        ...(appSettings.editor || {})
    };

    const initialFontSize = Math.max(10, Math.min(32, Number.parseInt(initialEditorSettings.fontSize, 10) || defaultEditorSettings.fontSize));
    const themeEngine = cmModules.themeEngine;
    const initialThemeName = initialEditorSettings.theme || THEME_VSCODE_DARK;

    // Create compartments for dynamic reconfiguration
    themeCompartment = new Compartment();
    fontSizeCompartment = new Compartment();
    wordWrapCompartment = new Compartment();
    lineNumbersCompartment = new Compartment();
    autocompleteCompartment = new Compartment();
    bracketMatchCompartment = new Compartment();
    activeLineCompartment = new Compartment();
    const heavyFeaturesCompartment = new Compartment();

    // Autocomplete Source configuration
    const BGI_FUNCTIONS = ["arc", "bar", "bar3d", "circle", "cleardevice", "clearviewport", "closegraph", "delay", "detectgraph", "drawpoly", "ellipse", "fillellipse", "fillpoly", "floodfill", "getarccoords", "getbkcolor", "getcolor", "getdefaultpalette", "getdrivername", "getimage", "getlinesettings", "getmaxcolor", "getmaxmode", "getmaxx", "getmaxy", "getmodename", "getmoderange", "getpalette", "getpalettesize", "getpixel", "gettextsettings", "getviewsettings", "getx", "gety", "graphdefaults", "grapherrormsg", "graphresult", "imagesize", "initgraph", "initwindow", "installuserdriver", "installuserfont", "line", "linerel", "lineto", "moverel", "moveto", "outtext", "outtextxy", "pieslice", "putimage", "putpixel", "rectangle", "registerbgidriver", "registerbgifont", "restorecrtmode", "sector", "setactivepage", "setallpalette", "setbkcolor", "setcolor", "setfillpattern", "setfillstyle", "setgraphbufsize", "setgraphmode", "setlinestyle", "setpalette", "settextjustify", "settextstyle", "setusercharsize", "setviewport", "setvisualpage", "swapbuffers", "textheight", "textwidth"];
    const BGI_CONSTANTS = ["BLACK", "BLUE", "GREEN", "CYAN", "RED", "MAGENTA", "BROWN", "LIGHTGRAY", "DARKGRAY", "LIGHTBLUE", "LIGHTGREEN", "LIGHTCYAN", "LIGHTRED", "LIGHTMAGENTA", "YELLOW", "WHITE"];
    const CPP_KEYWORDS = ["alignas", "alignof", "and", "and_eq", "asm", "auto", "bitand", "bitor", "bool", "break", "case", "catch", "char", "char8_t", "char16_t", "char32_t", "class", "compl", "concept", "const", "consteval", "constexpr", "constinit", "const_cast", "continue", "co_await", "co_return", "co_yield", "decltype", "default", "delete", "do", "double", "dynamic_cast", "else", "enum", "explicit", "export", "extern", "false", "float", "for", "friend", "goto", "if", "inline", "int", "long", "mutable", "namespace", "new", "noexcept", "not", "not_eq", "nullptr", "operator", "or", "or_eq", "private", "protected", "public", "register", "reinterpret_cast", "requires", "return", "short", "signed", "sizeof", "static", "static_assert", "static_cast", "struct", "switch", "template", "this", "thread_local", "throw", "true", "try", "typedef", "typeid", "typename", "union", "unsigned", "using", "virtual", "void", "volatile", "wchar_t", "while", "xor", "xor_eq"];

    function customCompletionSource(context) {
        const { snippetCompletion } = cmModules.autocomplete;
        let word = context.matchBefore(/\w*/);
        if (!word || (word.from === word.to && !context.explicit)) return null;

        let options = [];
        let lower = word.text.toLowerCase();

        for (let fn of BGI_FUNCTIONS) {
            if (fn.toLowerCase().startsWith(lower)) options.push({ label: fn, type: "function", apply: fn + "()" });
        }
        for (let c of BGI_CONSTANTS) {
            if (c.toLowerCase().startsWith(lower)) options.push({ label: c, type: "constant" });
        }
        for (let kw of CPP_KEYWORDS) {
            if (kw.toLowerCase().startsWith(lower)) options.push({ label: kw, type: "keyword" });
        }

        if ("main".startsWith(lower)) {
            options.push(snippetCompletion("#include <graphics.h>\n\nint main() {\n    int gd = DETECT, gm;\n    initgraph(&gd, &gm, (char*)\"\");\n\n    ${1}\n\n    getch();\n    closegraph();\n    return 0;\n}", {
                label: "main",
                detail: "graphics boilerplate",
                type: "snippet"
            }));
        }

        return {
            from: word.from,
            options: options,
            validFor: /^\w*$/
        };
    }

    // Export to global scope for settings panel to re-apply the exact same source
    window.customCompletionSource = customCompletionSource;

    // Build initial essential extensions only
    const extensions = [
        lineNumbersCompartment.of(initialEditorSettings.lineNumbers ? lineNumbers() : []),
        activeLineCompartment.of(initialEditorSettings.activeLine ? [highlightActiveLine(), highlightActiveLineGutter()] : []),
        drawSelection(),
        indentOnInput(),
        cpp(),
        keymap.of([
            ...defaultKeymap,
            indentWithTab,
        ]),
        themeCompartment.of([]),
        fontSizeCompartment.of(
            EditorView.theme({
                '.cm-content, .cm-gutters': { fontSize: `${initialFontSize}px` }
            })
        ),
        EditorView.theme({
            '.cm-content': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
            '.cm-gutters': { fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' }
        }),
        EditorState.tabSize.of(4),
        wordWrapCompartment.of(initialEditorSettings.wordWrap ? EditorView.lineWrapping : []),
        heavyFeaturesCompartment.of([]), // Placeholder for delayed extensions
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
    themeEngine.applyTheme(cmView, themeCompartment, initialThemeName);

    // Font Size Controls
    const increaseFontBtn = document.getElementById('increase-font-btn');
    const decreaseFontBtn = document.getElementById('decrease-font-btn');
    const fontSizeDisplay = document.getElementById('font-size-display');

    function updateFontSizeDisplay(size) {
        if (fontSizeDisplay) {
            fontSizeDisplay.textContent = size;
        }
    }

    function requestFontSizeChange(delta) {
        if (typeof loadAppSettings !== 'function') return;

        const currentSettings = loadAppSettings();
        const currentFontSize = Math.max(10, Math.min(32, Number.parseInt(currentSettings.editor.fontSize, 10) || defaultEditorSettings.fontSize));
        const nextFontSize = Math.max(10, Math.min(32, currentFontSize + delta));

        document.dispatchEvent(new CustomEvent('editor-font-size-change-requested', {
            detail: { fontSize: nextFontSize }
        }));
    }

    updateFontSizeDisplay(initialFontSize);

    if (increaseFontBtn && decreaseFontBtn) {
        increaseFontBtn.addEventListener('click', () => {
            requestFontSizeChange(1);
        });

        decreaseFontBtn.addEventListener('click', () => {
            requestFontSizeChange(-1);
        });
    }

    document.addEventListener('editor-settings-changed', (event) => {
        const latestFontSize = event.detail?.settings?.editor?.fontSize;
        if (Number.isFinite(latestFontSize)) {
            updateFontSizeDisplay(latestFontSize);
        }
    });

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

    loadDefaultCode(); // Fire and forget. Editor will not block.

    // Delay heavy features to keep editor instant
    const executeHeavyFeatures = () => {
        const { history, historyKeymap } = cmModules.commands;
        const { closeBrackets, closeBracketsKeymap, autocompletion } = cmModules.autocomplete;
        const { highlightSelectionMatches } = cmModules.search;
        const { bracketMatching } = cmModules.language;

        const heavyExtensions = [
            bracketMatchCompartment.of(initialEditorSettings.bracketMatching ? bracketMatching() : []),
            autocompleteCompartment.of(initialEditorSettings.autocomplete ? [
                closeBrackets(),
                autocompletion({
                    activateOnTyping: true,
                    override: [customCompletionSource]
                })
            ] : []),
            history(),
            highlightSelectionMatches(),
            createSelectedMatchHighlightExtension(),
            keymap.of([
                ...closeBracketsKeymap,
                ...historyKeymap
            ])
        ];

        cmView.dispatch({
            effects: heavyFeaturesCompartment.reconfigure(heavyExtensions)
        });
        Logger.info('Heavy editor extensions loaded via idle callback');
    };

    if (window.requestIdleCallback) {
        window.requestIdleCallback(executeHeavyFeatures);
    } else {
        setTimeout(executeHeavyFeatures, 300);
    }

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

    document.dispatchEvent(new CustomEvent('editor-ready', {
        detail: { cmView }
    }));

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
