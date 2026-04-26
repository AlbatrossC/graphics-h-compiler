// ==================== SETTINGS PANEL ====================
// Manages the settings panel in the sidebar with editor configuration

(function () {
    'use strict';

    // Removed duplicate bundle import here, using global cmModules instead.
    const SETTINGS_DEFAULTS = (typeof APP_SETTINGS_DEFAULTS !== 'undefined')
        ? {
            uiTheme: APP_SETTINGS_DEFAULTS.uiTheme,
            editor: { ...APP_SETTINGS_DEFAULTS.editor }
        }
        : {
            uiTheme: (typeof UI_THEME_DARK !== 'undefined' ? UI_THEME_DARK : 'dark'),
            editor: {
                theme: (typeof THEME_VSCODE_DARK !== 'undefined' ? THEME_VSCODE_DARK : 'vscode-dark'),
                fontSize: 16,
                wordWrap: true,
                lineNumbers: true,
                autocomplete: true,
                bracketMatching: true,
                activeLine: true
            }
        };

    function cloneSettings(settings = SETTINGS_DEFAULTS) {
        return {
            uiTheme: settings.uiTheme,
            editor: { ...settings.editor }
        };
    }

    function loadSettingsState() {
        if (typeof loadAppSettings === 'function') {
            return loadAppSettings();
        }
        return cloneSettings();
    }

    function saveSettingsState(settings) {
        if (typeof saveAppSettings === 'function') {
            return saveAppSettings(settings);
        }
        return cloneSettings(settings);
    }

    function emitSettingsChanged() {
        document.dispatchEvent(new CustomEvent('editor-settings-changed', {
            detail: { settings: cloneSettings(currentSettings) }
        }));
    }

    function clampFontSize(size) {
        return Math.max(10, Math.min(32, Number.parseInt(size, 10) || SETTINGS_DEFAULTS.editor.fontSize));
    }

    let currentSettings = loadSettingsState();
    let currentSidebarView = 'explorer';

    // ==================== DOM ELEMENTS ====================
    const settingsHeaderBtn = document.getElementById('settings-header-btn');
    const settingsActivityBtn = document.getElementById('settings-activity-btn');
    const mobileMenuSettingsBtn = document.getElementById('mobile-menu-settings-btn');
    const mobileMenuFilesBtn = document.getElementById('mobile-menu-files-btn');
    const explorerActivityBtn = document.getElementById('explorer-activity-btn');
    const settingsPanel = document.getElementById('settings-panel-view');
    const cloudPromoView = document.getElementById('cloud-promo-view');
    const fileExplorerView = document.getElementById('file-explorer-view');
    const sidebar = document.getElementById('sidebar');
    const sidebarHeader = document.querySelector('.sidebar-header');

    // Settings controls
    const themeSelect = document.getElementById('settings-editor-theme');
    const fontRange = document.getElementById('settings-font-range');
    const fontSizeValue = document.getElementById('settings-font-size-value');
    const fontDecrease = document.getElementById('settings-font-decrease');
    const fontIncrease = document.getElementById('settings-font-increase');
    const wordWrapToggle = document.getElementById('settings-word-wrap');
    const lineNumbersToggle = document.getElementById('settings-line-numbers');
    const autocompleteToggle = document.getElementById('settings-autocomplete');
    const bracketMatchingToggle = document.getElementById('settings-bracket-matching');
    const activeLineToggle = document.getElementById('settings-active-line');
    const resetBtn = document.getElementById('settings-reset-btn');
    const headerFontDisplay = document.getElementById('font-size-display');

    // ==================== PANEL SWITCHING ====================
    function setSidebarHeading(label) {
        if (!sidebarHeader) return;
        const headerLeft = sidebarHeader.querySelector('.sidebar-header-left span');
        if (headerLeft) headerLeft.textContent = label;
    }

    function openSidebarIfNeeded(forceMobileOpen = false) {
        if (sidebar && sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
        }

        if (forceMobileOpen && window.innerWidth <= 768 && sidebar) {
            sidebar.classList.add('open');
            const overlay = document.getElementById('sidebar-overlay');
            if (overlay) overlay.classList.add('active');
            document.body.classList.add('sidebar-open-mobile');
        }
    }

    function setVisible(element, visible) {
        if (!element) return;
        element.classList.toggle('hidden', !visible);
    }

    function setSidebarView(view, options = {}) {
        currentSidebarView = view;

        setVisible(settingsPanel, view === 'settings');

        const shouldShowExplorerFiles = view === 'explorer' && typeof isUserLoggedIn !== 'undefined' && isUserLoggedIn;
        const shouldShowExplorerPromo = view === 'explorer' && !shouldShowExplorerFiles;

        setVisible(fileExplorerView, shouldShowExplorerFiles);
        setVisible(cloudPromoView, shouldShowExplorerPromo);

        if (explorerActivityBtn) explorerActivityBtn.classList.toggle('active', view === 'explorer');
        if (settingsActivityBtn) settingsActivityBtn.classList.toggle('active', view === 'settings');
        if (mobileMenuFilesBtn) mobileMenuFilesBtn.classList.toggle('active', view === 'explorer');
        if (mobileMenuSettingsBtn) mobileMenuSettingsBtn.classList.toggle('active', view === 'settings');

        // Hide new-file/new-folder buttons when not in explorer view or when logged out
        const explorerActionsEl = document.querySelector('.explorer-actions');
        setVisible(explorerActionsEl, shouldShowExplorerFiles);

        if (view === 'settings') {
            setSidebarHeading('Settings');
            syncUIFromSettings();
        } else {
            setSidebarHeading('Explorer');
        }

        openSidebarIfNeeded(options.forceMobileOpen === true);
        document.body.dataset.sidebarView = view;
    }

    function showSettingsPanel() {
        setSidebarView('settings', { forceMobileOpen: true });
    }

    function showExplorerPanel(options = {}) {
        setSidebarView('explorer', options);
    }



    function toggleSettingsPanel() {
        if (currentSidebarView === 'settings') {
            showExplorerPanel();
            return;
        }
        showSettingsPanel();
    }

    window.getSidebarView = () => currentSidebarView;
    window.setSidebarView = (view) => setSidebarView(view);

    function persistSettings() {
        currentSettings = saveSettingsState(currentSettings);
        emitSettingsChanged();
    }

    function updateUiThemeDom(uiTheme) {
        document.documentElement.setAttribute('data-theme', uiTheme);
        if (typeof updateThemeIcon === 'function') {
            updateThemeIcon(uiTheme);
        }
    }

    function updateEditorThemeDom(editorTheme) {
        document.documentElement.setAttribute('data-editor-theme', editorTheme || 'vscode-dark');
    }

    async function applyEditorTheme(themeName, save = true) {
        if (!cmView || !themeCompartment) return;

        try {
            if (typeof cmModules === 'undefined' || !cmModules.themeEngine) return;
            const themeEngine = cmModules.themeEngine;
            const resolvedTheme = themeName || themeEngine.THEME_VSCODE_DARK;
            themeEngine.applyTheme(cmView, themeCompartment, resolvedTheme);

            currentSettings = {
                ...currentSettings,
                editor: {
                    ...currentSettings.editor,
                    theme: resolvedTheme
                }
            };

            // Keep UI theme independent from editor theme selection.
            // This allows light UI with any editor theme (not only vscode-light).
            updateUiThemeDom(currentSettings.uiTheme);
            updateEditorThemeDom(resolvedTheme);

            if (save) persistSettings();
        } catch (error) {
            Logger.error('Failed to apply editor theme', error);
        }
    }

    function applyFontSize(size, save = true) {
        const normalized = clampFontSize(size);

        if (editor) {
            editor.setFontSize(`${normalized}px`);
        }

        if (fontSizeValue) fontSizeValue.textContent = String(normalized);
        if (fontRange) fontRange.value = String(normalized);
        if (headerFontDisplay) headerFontDisplay.textContent = String(normalized);

        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                fontSize: normalized
            }
        };

        if (save) persistSettings();
    }

    function applyWordWrap(enabled, save = true) {
        if (!cmView || !wordWrapCompartment || !cmModules) return;
        const { EditorView } = cmModules.view;

        cmView.dispatch({
            effects: wordWrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : [])
        });

        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                wordWrap: !!enabled
            }
        };

        if (save) persistSettings();
    }

    function applyLineNumbers(enabled, save = true) {
        if (!cmView || !lineNumbersCompartment || !cmModules) return;
        const { lineNumbers } = cmModules.view;

        cmView.dispatch({
            effects: lineNumbersCompartment.reconfigure(enabled ? lineNumbers() : [])
        });

        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                lineNumbers: !!enabled
            }
        };

        if (save) persistSettings();
    }

    function applyAutocomplete(enabled, save = true) {
        if (!cmView || !autocompleteCompartment || !cmModules) return;
        const { closeBrackets, autocompletion } = cmModules.autocomplete;

        const extensions = [];
        if (enabled) {
            extensions.push(closeBrackets());
            if (window.customCompletionSource) {
                extensions.push(autocompletion({
                    activateOnTyping: true,
                    override: [window.customCompletionSource]
                }));
            }
        }

        cmView.dispatch({
            effects: autocompleteCompartment.reconfigure(extensions)
        });

        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                autocomplete: !!enabled
            }
        };

        if (save) persistSettings();
    }

    function applyBracketMatching(enabled, save = true) {
        if (!cmView || !bracketMatchCompartment || !cmModules) return;
        const { bracketMatching } = cmModules.language;

        cmView.dispatch({
            effects: bracketMatchCompartment.reconfigure(enabled ? bracketMatching() : [])
        });

        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                bracketMatching: !!enabled
            }
        };

        if (save) persistSettings();
    }

    function applyActiveLine(enabled, save = true) {
        if (!cmView || !activeLineCompartment || !cmModules) return;
        const { highlightActiveLine, highlightActiveLineGutter } = cmModules.view;

        cmView.dispatch({
            effects: activeLineCompartment.reconfigure(
                enabled ? [highlightActiveLine(), highlightActiveLineGutter()] : []
            )
        });

        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                activeLine: !!enabled
            }
        };

        if (save) persistSettings();
    }

    function syncUIFromSettings() {
        if (themeSelect) themeSelect.value = currentSettings.editor.theme;
        if (fontRange) fontRange.value = String(currentSettings.editor.fontSize);
        if (fontSizeValue) fontSizeValue.textContent = String(currentSettings.editor.fontSize);
        if (wordWrapToggle) wordWrapToggle.checked = currentSettings.editor.wordWrap;
        if (lineNumbersToggle) lineNumbersToggle.checked = currentSettings.editor.lineNumbers;
        if (autocompleteToggle) autocompleteToggle.checked = currentSettings.editor.autocomplete;
        if (bracketMatchingToggle) bracketMatchingToggle.checked = currentSettings.editor.bracketMatching;
        if (activeLineToggle) activeLineToggle.checked = currentSettings.editor.activeLine;
        if (headerFontDisplay) headerFontDisplay.textContent = String(currentSettings.editor.fontSize);
    }

    async function applySavedSettings() {
        if (!cmView || !cmModules) return;

        currentSettings = loadSettingsState();
        syncUIFromSettings();

        updateUiThemeDom(currentSettings.uiTheme);
        await applyEditorTheme(currentSettings.editor.theme, false);
        applyFontSize(currentSettings.editor.fontSize, false);
        applyWordWrap(currentSettings.editor.wordWrap, false);
        applyLineNumbers(currentSettings.editor.lineNumbers, false);
        applyAutocomplete(currentSettings.editor.autocomplete, false);
        applyBracketMatching(currentSettings.editor.bracketMatching, false);
        applyActiveLine(currentSettings.editor.activeLine, false);

        currentSettings = saveSettingsState(currentSettings);
        emitSettingsChanged();
    }

    // ==================== PANEL EVENT LISTENERS ====================
    if (settingsActivityBtn) {
        settingsActivityBtn.addEventListener('click', () => {
            if (currentSidebarView === 'settings') {
                if (sidebar) sidebar.classList.toggle('collapsed');
                return;
            }
            showSettingsPanel();
        });
    }

    if (mobileMenuSettingsBtn) {
        mobileMenuSettingsBtn.addEventListener('click', showSettingsPanel);
    }

    if (mobileMenuFilesBtn) {
        mobileMenuFilesBtn.addEventListener('click', showExplorerPanel);
    }

    if (explorerActivityBtn) {
        explorerActivityBtn.addEventListener('click', () => {
            if (currentSidebarView !== 'explorer') showExplorerPanel();
        });
    }

    document.addEventListener('request-show-explorer', () => {
        if (currentSidebarView !== 'explorer') showExplorerPanel();
    });

    if (settingsHeaderBtn) {
        settingsHeaderBtn.addEventListener('click', toggleSettingsPanel);
    }

    document.addEventListener('request-show-settings', () => {
        if (currentSidebarView !== 'settings') showSettingsPanel();
    });

    document.addEventListener('auth-state-changed', () => {
        if (currentSidebarView === 'explorer') {
            showExplorerPanel();
        }
    });

    // ==================== SETTINGS CONTROL EVENTS ====================
    if (themeSelect) {
        themeSelect.addEventListener('change', (event) => {
            applyEditorTheme(event.target.value, true);
        });
    }

    if (fontRange) {
        fontRange.addEventListener('input', (event) => {
            applyFontSize(event.target.value, true);
        });
    }

    if (fontDecrease) {
        fontDecrease.addEventListener('click', () => {
            applyFontSize(currentSettings.editor.fontSize - 1, true);
        });
    }

    if (fontIncrease) {
        fontIncrease.addEventListener('click', () => {
            applyFontSize(currentSettings.editor.fontSize + 1, true);
        });
    }

    if (wordWrapToggle) {
        wordWrapToggle.addEventListener('change', (event) => {
            applyWordWrap(event.target.checked, true);
        });
    }

    if (lineNumbersToggle) {
        lineNumbersToggle.addEventListener('change', (event) => {
            applyLineNumbers(event.target.checked, true);
        });
    }

    if (autocompleteToggle) {
        autocompleteToggle.addEventListener('change', (event) => {
            applyAutocomplete(event.target.checked, true);
        });
    }

    if (bracketMatchingToggle) {
        bracketMatchingToggle.addEventListener('change', (event) => {
            applyBracketMatching(event.target.checked, true);
        });
    }

    if (activeLineToggle) {
        activeLineToggle.addEventListener('change', (event) => {
            applyActiveLine(event.target.checked, true);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            currentSettings = cloneSettings(SETTINGS_DEFAULTS);
            await applyEditorTheme(currentSettings.editor.theme, false);
            applyFontSize(currentSettings.editor.fontSize, false);
            applyWordWrap(currentSettings.editor.wordWrap, false);
            applyLineNumbers(currentSettings.editor.lineNumbers, false);
            applyAutocomplete(currentSettings.editor.autocomplete, false);
            applyBracketMatching(currentSettings.editor.bracketMatching, false);
            applyActiveLine(currentSettings.editor.activeLine, false);
            syncUIFromSettings();
            persistSettings();
            Logger.info('Settings reset to defaults');
        });
    }

    // ==================== CROSS-MODULE EVENTS ====================
    document.addEventListener('editor-ready', () => {
        applySavedSettings();
    });

    document.addEventListener('editor-font-size-change-requested', (event) => {
        const requestedSize = event.detail?.fontSize;
        applyFontSize(requestedSize, true);
    });

    document.addEventListener('ui-theme-toggled', (event) => {
        const eventSettings = event.detail?.settings;
        if (eventSettings) {
            currentSettings = cloneSettings(eventSettings);
        } else {
            currentSettings = loadSettingsState();
        }
        syncUIFromSettings();
        applyEditorTheme(currentSettings.editor.theme, false);
        persistSettings();
    });

    syncUIFromSettings();
    setSidebarView('explorer', { forceMobileOpen: false });
    if (typeof cmView !== 'undefined' && cmView && cmModules) {
        applySavedSettings();
    }
})();
