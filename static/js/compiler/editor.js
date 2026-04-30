// ==================== CODEMIRROR 6 EDITOR ====================
// Lightweight code editor with basic C++ syntax highlighting. No heavy IDE features.

// ==================== CODEMIRROR LOCAL BUNDLE LOADING ====================

let cmModules = null;
const editorPromise = import('/static/js/compiler/codemirror.bundle.v1.js');

async function loadCodeMirror() {
    Logger.info('Loading CodeMirror via local bundle...');
    updateLoadingProgress(30);

    try {
        const bundle = await editorPromise;

        cmModules = {
            cm: bundle.cmCore,
            view: bundle.cmView,
            state: bundle.cmCore,
            language: bundle.cmLanguage,
            cpp: bundle.cmCpp,
            commands: bundle.cmCommands,
            search: bundle.cmSearch,
            highlight: bundle.lezerHighlight
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
        Logger.info('Loading dependencies with production preload flow...');
        updateEditorLoadingState('Loading editor shell...', 'Preparing compiler assets and workspace UI.');
        updateLoadingProgress(10);

        // Initialize resource sources first
        await initializeResourcesFromManifest();

        updateEditorLoadingState('Loading CodeMirror...', 'Fetching the local editor bundle and language support.');
        await loadCodeMirror();
        scriptsLoaded.codemirror = true;
        updateLoadingProgress(50);

        await initializeEditor();
        updateEditorLoadingState('Loading starter code...', 'Restoring your draft or fetching the default demo.');
        await loadDefaultCode();
        updateEditorLoadingState('Preparing DOS runner...', 'Mounting the terminal frame after the editor is ready.');
        await ensureDosRunnerFrame();
        updateEditorLoadingState('Warming compiler runtime...', 'Caching DOS runtime files in the background.');

        const queuePreload = () => {
            startPreload()
                .then(() => updateCacheStatus())
                .catch((error) => Logger.warn(`Compiler preload skipped: ${error.message}`));
        };

        if (window.requestIdleCallback) {
            window.requestIdleCallback(queuePreload);
        } else {
            Promise.resolve().then(queuePreload);
        }

        const editorLoadingOverlay = document.getElementById('editor-loading-overlay');
        if (editorLoadingOverlay) {
            editorLoadingOverlay.classList.add('hidden');
        }

        updateLoadingProgress(100);

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
    const normalized = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (loadingProgressBar) {
        loadingProgressBar.style.width = `${normalized}%`;
    }
}

// ==================== DEMO FILE MANAGEMENT ====================

demoSelect.addEventListener('change', async (e) => {
    const selectedDemo = e.target.value;

    if (selectedDemo === lastLoadedDemo) {
        Logger.info(`Reloading ${selectedDemo} demo (force refresh)`);
        await loadDemoFile(selectedDemo, true);
    } else {
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
                localStorage.removeItem("tc_code");

                updateEditorInfo();
                updateSaveIndicator();

                Logger.success(`Loaded ${demoKey} demo from cache`);
                return;
            }
        }

        Logger.info(`Loading ${demoKey} demo from bundled demo JSON...${forceReload ? ' (force reload)' : ''}`);

        await loadDemoBundle();
        const code = DEMO_FILE_CONTENTS[demoKey];
        if (typeof code !== 'string') {
            throw new Error(`Demo file not found: ${demoKey}`);
        }

        DemoCache.set(demoKey, code);

        editor.setValue(code);

        lastLoadedDemo = demoKey;

        {
            const activeKey = CLOUD_STATE.activeFileKey || 'root/main.cpp';
            const [folder, filename] = activeKey.split('/');
            setLocalDraftImmediate(folder, filename, code);
        }
        if (isUserLoggedIn) {
            CLOUD_STATE.lastSavedHash = null;
        }
        scheduleAutosave();

        updateEditorInfo();
        updateSaveIndicator();

        Logger.success(`Loaded ${demoKey} demo`);
    } catch (e) {
        Logger.error('Error loading demo file', e);
        alert('Error loading demo file. Please check your connection or try offline mode.');
    }
}


let editorStyleCompartment = null;
let fontSizeCompartment = null;
let wordWrapCompartment = null;
let lineNumbersCompartment = null;
let bracketMatchCompartment = null;
let activeLineCompartment = null;
let cmView = null; // Store the EditorView instance

// ==================== EDITOR WRAPPER API ====================
// Provides the editor API expected by files.js, execution.js, etc.

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

        // For compatibility with execution.js
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

    };
}

function createVsCodeEditorStyleExtension() {
    const { EditorView } = cmModules.view;
    const { HighlightStyle, syntaxHighlighting } = cmModules.language;
    const { tags } = cmModules.highlight;

    const highlight = HighlightStyle.define([
        { tag: tags.keyword, color: '#f92672' },
        { tag: tags.name, color: '#f8f8f2' },
        { tag: tags.typeName, color: '#66d9ef' },
        { tag: tags.variableName, color: '#f8f8f2' },
        { tag: tags.propertyName, color: '#a6e22e' },
        { tag: tags.function(tags.variableName), color: '#a6e22e' },
        { tag: tags.string, color: '#e6db74' },
        { tag: tags.number, color: '#ae81ff' },
        { tag: tags.bool, color: '#ae81ff' },
        { tag: tags.comment, color: '#75715e' },
        { tag: tags.operator, color: '#f92672' },
        { tag: tags.bracket, color: '#f8f8f2' },
        { tag: tags.meta, color: '#f92672' },
        { tag: tags.processingInstruction, color: '#f92672' },
        { tag: tags.definition(tags.variableName), color: '#a6e22e' },
        { tag: tags.macroName, color: '#a6e22e' },
    ]);

    return [
        EditorView.theme({
            '&': { backgroundColor: 'transparent' },
            '.cm-scroller': { backgroundColor: 'transparent' },
            '.cm-content': { color: '#f8f8f2' },
            '.cm-cursor': { borderLeftColor: '#00ff88' },
            '.cm-activeLine': { backgroundColor: '#1a1a1a' },
            '.cm-activeLineGutter': { backgroundColor: '#1a1a1a' },
            '.cm-gutters': {
                backgroundColor: '#151515',
                color: '#a0a0a0',
                borderRight: '1px solid #262626'
            },
            '.cm-selectionBackground': { backgroundColor: 'rgba(0, 255, 136, 0.15) !important' },
            '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(0, 255, 136, 0.15) !important' },
            '.cm-matchingBracket': {
                backgroundColor: 'rgba(0, 255, 136, 0.25)',
                outline: '1px solid rgba(0, 255, 136, 0.4)'
            },
        }, { dark: true }),
        syntaxHighlighting(highlight)
    ];
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
    const { highlightSelectionMatches } = cmModules.search;

    const defaultEditorSettings = (typeof APP_SETTINGS_DEFAULTS !== 'undefined' && APP_SETTINGS_DEFAULTS.editor)
        ? APP_SETTINGS_DEFAULTS.editor
        : {
            fontSize: 16,
            wordWrap: true,
            lineNumbers: true,
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

    // Create compartments for dynamic reconfiguration
    editorStyleCompartment = new Compartment();
    fontSizeCompartment = new Compartment();
    wordWrapCompartment = new Compartment();
    lineNumbersCompartment = new Compartment();
    bracketMatchCompartment = new Compartment();
    activeLineCompartment = new Compartment();
    const heavyFeaturesCompartment = new Compartment();

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
        editorStyleCompartment.of(createVsCodeEditorStyleExtension()),
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

    // Create the wrapper used by the rest of the compiler modules
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

    // Delay heavy features to keep editor instant
    const executeHeavyFeatures = () => {
        const { history, historyKeymap } = cmModules.commands;
        const { highlightSelectionMatches } = cmModules.search;
        const { bracketMatching } = cmModules.language;

        const heavyExtensions = [
            bracketMatchCompartment.of(initialEditorSettings.bracketMatching ? bracketMatching() : []),
            history(),
            highlightSelectionMatches(),
            createSelectedMatchHighlightExtension(),
            keymap.of([
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

        // FAST PATH: Write to IndexedDB immediately (non-blocking, for BOTH guest and logged-in)
        // This keeps the local cache fresh so data is never lost
        {
            const activeKey = CLOUD_STATE.activeFileKey || 'root/main.cpp';
            const [_f, _n] = activeKey.split('/');
            setLocalDraftImmediate(_f, _n, update.state.doc.toString());
        }

        // Schedule 20-second idle autosave (handles both guest and logged-in)
        scheduleAutosave();

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
        const activeKey = CLOUD_STATE.activeFileKey || 'root/main.cpp';
        const [folder, filename] = activeKey.split('/');
        await openFile(folder, filename, { skipSave: true });
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();
        return;
    }

    // Guest: try IndexedDB first (primary storage)
    const draft = await getLocalDraft('root', 'main.cpp');
    if (draft !== null) {
        editor.setValue(draft);
        SAVE_STATE.lastSavedHash = await computeSha256(draft);
        updateEditorInfo();
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();
        Logger.info('Restored guest draft from IndexedDB');
        return;
    }

    // Fallback: one-time migration from old localStorage tc_code key
    const savedCode = localStorage.getItem("tc_code");
    if (savedCode) {
        editor.setValue(savedCode);
        // Migrate to IndexedDB and remove from localStorage
        await setLocalDraft('root', 'main.cpp', savedCode).catch(() => {});
        localStorage.removeItem("tc_code");
        SAVE_STATE.lastSavedHash = await computeSha256(savedCode);
        updateEditorInfo();
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();
        Logger.info('Migrated saved code from localStorage to IndexedDB');
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
        // Write empty content to IndexedDB for both guest and logged-in
        {
            const activeKey = CLOUD_STATE.activeFileKey || 'root/main.cpp';
            const [folder, filename] = activeKey.split('/');
            setLocalDraftImmediate(folder, filename, '');
        }
        if (!isUserLoggedIn) {
            localStorage.removeItem("tc_code"); // Clear legacy localStorage backup
        }
        CLOUD_STATE.lastSavedHash = null;
        lastLoadedDemo = '';
        updateEditorInfo();
        updateSaveIndicator();
        Logger.info('Editor cleared');
    }
});
