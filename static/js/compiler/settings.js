// ==================== SETTINGS PANEL ====================
// Manages the settings panel in the sidebar with editor configuration

(function () {
    'use strict';

    // ==================== SETTINGS DEFAULTS ====================
    const SETTINGS_DEFAULTS = {
        editorTheme: 'vscode-dark',
        fontSize: 14,
        wordWrap: true,
        lineNumbers: true,
        autocomplete: true,
        bracketMatching: true,
        activeLine: true
    };

    const SETTINGS_STORAGE_KEY = 'editor_settings';

    // ==================== LOAD / SAVE SETTINGS ====================
    function loadSettings() {
        try {
            const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (saved) {
                return { ...SETTINGS_DEFAULTS, ...JSON.parse(saved) };
            }
        } catch (e) { }
        return { ...SETTINGS_DEFAULTS };
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            Logger.warn('Failed to save settings');
        }
    }

    let currentSettings = loadSettings();

    // ==================== DOM ELEMENTS ====================
    const settingsHeaderBtn = document.getElementById('settings-header-btn');
    const settingsActivityBtn = document.getElementById('settings-activity-btn');
    const explorerActivityBtn = document.getElementById('explorer-activity-btn');
    const settingsPanel = document.getElementById('settings-panel-view');
    const cloudPromoView = document.getElementById('cloud-promo-view');
    const fileExplorerView = document.getElementById('file-explorer-view');
    const sidebar = document.getElementById('sidebar');
    const sidebarHeader = document.querySelector('.sidebar-header');

    // Settings Controls
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

    let isSettingsOpen = false;

    // ==================== PANEL SWITCHING ====================
    function showSettingsPanel() {
        isSettingsOpen = true;

        // Hide explorer views
        if (cloudPromoView) cloudPromoView.style.display = 'none';
        if (fileExplorerView) fileExplorerView.style.display = 'none';

        // Show settings panel
        if (settingsPanel) settingsPanel.style.display = 'flex';

        // Update activity bar buttons
        if (explorerActivityBtn) explorerActivityBtn.classList.remove('active');
        if (settingsActivityBtn) settingsActivityBtn.classList.add('active');

        // Update sidebar header
        if (sidebarHeader) {
            const headerLeft = sidebarHeader.querySelector('.sidebar-header-left span');
            if (headerLeft) headerLeft.textContent = 'Settings';
        }

        // Ensure sidebar is visible
        if (sidebar && sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
        }

        // On mobile, open the sidebar
        if (window.innerWidth <= 768 && sidebar) {
            sidebar.classList.add('open');
            const overlay = document.getElementById('sidebar-overlay');
            if (overlay) overlay.classList.add('active');
        }

        syncUIFromSettings();
    }

    function showExplorerPanel() {
        isSettingsOpen = false;

        // Hide settings panel
        if (settingsPanel) settingsPanel.style.display = 'none';

        // Show the appropriate explorer view
        if (typeof isUserLoggedIn !== 'undefined' && isUserLoggedIn) {
            if (fileExplorerView) fileExplorerView.style.display = 'flex';
            if (cloudPromoView) cloudPromoView.style.display = 'none';
        } else {
            if (cloudPromoView) cloudPromoView.style.display = 'flex';
            if (fileExplorerView) fileExplorerView.style.display = 'none';
        }

        // Update activity bar buttons
        if (explorerActivityBtn) explorerActivityBtn.classList.add('active');
        if (settingsActivityBtn) settingsActivityBtn.classList.remove('active');

        // Update sidebar header
        if (sidebarHeader) {
            const headerLeft = sidebarHeader.querySelector('.sidebar-header-left span');
            if (headerLeft) headerLeft.textContent = 'Explorer';
        }
    }

    function toggleSettingsPanel() {
        if (isSettingsOpen) {
            showExplorerPanel();
        } else {
            showSettingsPanel();
        }
    }

    // ==================== EVENT LISTENERS ====================
    if (settingsHeaderBtn) {
        settingsHeaderBtn.addEventListener('click', () => {
            toggleSettingsPanel();
        });
    }

    if (settingsActivityBtn) {
        settingsActivityBtn.addEventListener('click', () => {
            if (isSettingsOpen) {
                showExplorerPanel();
            } else {
                showSettingsPanel();
            }
        });
    }

    if (explorerActivityBtn) {
        explorerActivityBtn.addEventListener('click', () => {
            if (isSettingsOpen) {
                showExplorerPanel();
            }
        });
    }

    // ==================== THEME DEFINITIONS ====================
    function createEditorTheme(themeName) {
        if (!cmModules) return null;

        const { EditorView } = cmModules.view;
        const { HighlightStyle, syntaxHighlighting } = cmModules.language;
        const { tags } = cmModules.highlight;

        const themes = {
            'vscode-dark': {
                dark: true,
                bg: 'transparent',
                fg: '#f8f8f2',
                cursor: '#00ff88',
                activeLine: '#1a1a1a',
                gutterBg: '#151515',
                gutterFg: '#a0a0a0',
                gutterBorder: '#262626',
                selection: 'rgba(0, 255, 136, 0.15)',
                matchBracketBg: 'rgba(0, 255, 136, 0.25)',
                matchBracketOutline: 'rgba(0, 255, 136, 0.4)',
                highlights: [
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
                ]
            },
            'vscode-light': {
                dark: false,
                bg: 'transparent',
                fg: '#1a1a1a',
                cursor: '#00cc6a',
                activeLine: '#f0f0f0',
                gutterBg: '#f5f5f5',
                gutterFg: '#606060',
                gutterBorder: '#e0e0e0',
                selection: 'rgba(0, 204, 106, 0.2)',
                matchBracketBg: 'rgba(0, 204, 106, 0.2)',
                matchBracketOutline: 'rgba(0, 204, 106, 0.4)',
                highlights: [
                    { tag: tags.keyword, color: '#7928a1' },
                    { tag: tags.name, color: '#1a1a1a' },
                    { tag: tags.typeName, color: '#0550ae' },
                    { tag: tags.variableName, color: '#1a1a1a' },
                    { tag: tags.propertyName, color: '#116329' },
                    { tag: tags.function(tags.variableName), color: '#116329' },
                    { tag: tags.string, color: '#0a3069' },
                    { tag: tags.number, color: '#0550ae' },
                    { tag: tags.bool, color: '#0550ae' },
                    { tag: tags.comment, color: '#6e7781' },
                    { tag: tags.operator, color: '#cf222e' },
                    { tag: tags.bracket, color: '#1a1a1a' },
                    { tag: tags.meta, color: '#cf222e' },
                    { tag: tags.processingInstruction, color: '#cf222e' },
                    { tag: tags.definition(tags.variableName), color: '#116329' },
                    { tag: tags.macroName, color: '#116329' },
                ]
            },
            'monokai': {
                dark: true,
                bg: 'transparent',
                fg: '#f8f8f2',
                cursor: '#f8f8f2',
                activeLine: '#3e3d32',
                gutterBg: '#272822',
                gutterFg: '#90908a',
                gutterBorder: '#3e3d32',
                selection: 'rgba(73, 72, 62, 0.8)',
                matchBracketBg: 'rgba(253, 151, 31, 0.3)',
                matchBracketOutline: 'rgba(253, 151, 31, 0.6)',
                highlights: [
                    { tag: tags.keyword, color: '#f92672' },
                    { tag: tags.name, color: '#f8f8f2' },
                    { tag: tags.typeName, color: '#66d9ef', fontStyle: 'italic' },
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
                ]
            },
            'github-dark': {
                dark: true,
                bg: 'transparent',
                fg: '#e6edf3',
                cursor: '#58a6ff',
                activeLine: '#161b22',
                gutterBg: '#0d1117',
                gutterFg: '#8b949e',
                gutterBorder: '#21262d',
                selection: 'rgba(56, 139, 253, 0.25)',
                matchBracketBg: 'rgba(56, 139, 253, 0.2)',
                matchBracketOutline: 'rgba(56, 139, 253, 0.5)',
                highlights: [
                    { tag: tags.keyword, color: '#ff7b72' },
                    { tag: tags.name, color: '#e6edf3' },
                    { tag: tags.typeName, color: '#79c0ff' },
                    { tag: tags.variableName, color: '#e6edf3' },
                    { tag: tags.propertyName, color: '#7ee787' },
                    { tag: tags.function(tags.variableName), color: '#d2a8ff' },
                    { tag: tags.string, color: '#a5d6ff' },
                    { tag: tags.number, color: '#79c0ff' },
                    { tag: tags.bool, color: '#79c0ff' },
                    { tag: tags.comment, color: '#8b949e' },
                    { tag: tags.operator, color: '#ff7b72' },
                    { tag: tags.bracket, color: '#e6edf3' },
                    { tag: tags.meta, color: '#ff7b72' },
                    { tag: tags.processingInstruction, color: '#ff7b72' },
                    { tag: tags.definition(tags.variableName), color: '#d2a8ff' },
                    { tag: tags.macroName, color: '#7ee787' },
                ]
            },
            'solarized-dark': {
                dark: true,
                bg: 'transparent',
                fg: '#839496',
                cursor: '#859900',
                activeLine: '#073642',
                gutterBg: '#002b36',
                gutterFg: '#586e75',
                gutterBorder: '#073642',
                selection: 'rgba(7, 54, 66, 0.9)',
                matchBracketBg: 'rgba(133, 153, 0, 0.2)',
                matchBracketOutline: 'rgba(133, 153, 0, 0.5)',
                highlights: [
                    { tag: tags.keyword, color: '#859900' },
                    { tag: tags.name, color: '#839496' },
                    { tag: tags.typeName, color: '#b58900' },
                    { tag: tags.variableName, color: '#839496' },
                    { tag: tags.propertyName, color: '#268bd2' },
                    { tag: tags.function(tags.variableName), color: '#268bd2' },
                    { tag: tags.string, color: '#2aa198' },
                    { tag: tags.number, color: '#d33682' },
                    { tag: tags.bool, color: '#d33682' },
                    { tag: tags.comment, color: '#586e75' },
                    { tag: tags.operator, color: '#859900' },
                    { tag: tags.bracket, color: '#839496' },
                    { tag: tags.meta, color: '#cb4b16' },
                    { tag: tags.processingInstruction, color: '#cb4b16' },
                    { tag: tags.definition(tags.variableName), color: '#268bd2' },
                    { tag: tags.macroName, color: '#268bd2' },
                ]
            },
            'one-dark': {
                dark: true,
                bg: 'transparent',
                fg: '#abb2bf',
                cursor: '#528bff',
                activeLine: '#2c313c',
                gutterBg: '#282c34',
                gutterFg: '#636d83',
                gutterBorder: '#2c313c',
                selection: 'rgba(67, 76, 94, 0.6)',
                matchBracketBg: 'rgba(97, 175, 239, 0.2)',
                matchBracketOutline: 'rgba(97, 175, 239, 0.5)',
                highlights: [
                    { tag: tags.keyword, color: '#c678dd' },
                    { tag: tags.name, color: '#abb2bf' },
                    { tag: tags.typeName, color: '#e5c07b' },
                    { tag: tags.variableName, color: '#e06c75' },
                    { tag: tags.propertyName, color: '#e06c75' },
                    { tag: tags.function(tags.variableName), color: '#61afef' },
                    { tag: tags.string, color: '#98c379' },
                    { tag: tags.number, color: '#d19a66' },
                    { tag: tags.bool, color: '#d19a66' },
                    { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
                    { tag: tags.operator, color: '#56b6c2' },
                    { tag: tags.bracket, color: '#abb2bf' },
                    { tag: tags.meta, color: '#e06c75' },
                    { tag: tags.processingInstruction, color: '#e06c75' },
                    { tag: tags.definition(tags.variableName), color: '#61afef' },
                    { tag: tags.macroName, color: '#61afef' },
                ]
            }
        };

        const t = themes[themeName] || themes['vscode-dark'];

        const highlight = HighlightStyle.define(t.highlights);

        const editorTheme = EditorView.theme({
            '&': { backgroundColor: t.bg },
            '.cm-content': { color: t.fg },
            '.cm-cursor': { borderLeftColor: t.cursor },
            '.cm-activeLine': { backgroundColor: t.activeLine },
            '.cm-activeLineGutter': { backgroundColor: t.activeLine },
            '.cm-gutters': {
                backgroundColor: t.gutterBg,
                color: t.gutterFg,
                borderRight: `1px solid ${t.gutterBorder}`
            },
            '.cm-selectionBackground': { backgroundColor: `${t.selection} !important` },
            '&.cm-focused .cm-selectionBackground': { backgroundColor: `${t.selection} !important` },
            '.cm-matchingBracket': {
                backgroundColor: t.matchBracketBg,
                outline: `1px solid ${t.matchBracketOutline}`
            },
        }, { dark: t.dark });

        return [editorTheme, syntaxHighlighting(highlight)];
    }

    // ==================== APPLY SETTINGS ====================
    function applyEditorTheme(themeName) {
        if (!cmView || !themeCompartment) return;

        // Also switch the page theme for light themes
        if (themeName === 'vscode-light') {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            updateThemeIcon('light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            updateThemeIcon('dark');
        }

        const theme = createEditorTheme(themeName);
        if (theme) {
            cmView.dispatch({
                effects: themeCompartment.reconfigure(theme)
            });
        }

        currentSettings.editorTheme = themeName;
        saveSettings(currentSettings);
        Logger.info(`Editor theme changed to ${themeName}`);
    }

    function applyFontSize(size) {
        size = Math.max(10, Math.min(32, size));
        if (editor) {
            editor.setFontSize(`${size}px`);
        }
        currentSettings.fontSize = size;
        localStorage.setItem('editor_font_size', size);
        saveSettings(currentSettings);

        // Sync the panel header font size display
        const headerFontDisplay = document.getElementById('font-size-display');
        if (headerFontDisplay) headerFontDisplay.textContent = size;
    }

    function applyWordWrap(enabled) {
        if (!cmView || !cmModules) return;
        const { EditorView } = cmModules.view;

        // We need to reconfigure the line wrapping extension
        // Since lineWrapping is set at init, we'll use a compartment approach
        // For now, we reconfigure via dispatch
        try {
            // Remove or add lineWrapping by reconfiguring
            if (typeof wordWrapCompartment !== 'undefined' && wordWrapCompartment) {
                cmView.dispatch({
                    effects: wordWrapCompartment.reconfigure(enabled ? EditorView.lineWrapping : [])
                });
            }
        } catch (e) {
            Logger.warn('Could not toggle word wrap');
        }

        currentSettings.wordWrap = enabled;
        saveSettings(currentSettings);
    }

    function applyLineNumbers(enabled) {
        if (!cmView || !cmModules) return;
        try {
            if (typeof lineNumbersCompartment !== 'undefined' && lineNumbersCompartment) {
                const { lineNumbers } = cmModules.view;
                cmView.dispatch({
                    effects: lineNumbersCompartment.reconfigure(enabled ? lineNumbers() : [])
                });
            }
        } catch (e) {
            Logger.warn('Could not toggle line numbers');
        }

        currentSettings.lineNumbers = enabled;
        saveSettings(currentSettings);
    }

    function applyAutocomplete(enabled) {
        if (!cmView || !cmModules) return;
        try {
            if (typeof autocompleteCompartment !== 'undefined' && autocompleteCompartment) {
                const { closeBrackets } = cmModules.autocomplete;
                cmView.dispatch({
                    effects: autocompleteCompartment.reconfigure(enabled ? closeBrackets() : [])
                });
            }
        } catch (e) {
            Logger.warn('Could not toggle autocomplete');
        }

        currentSettings.autocomplete = enabled;
        saveSettings(currentSettings);
    }

    function applyBracketMatching(enabled) {
        if (!cmView || !cmModules) return;
        try {
            if (typeof bracketMatchCompartment !== 'undefined' && bracketMatchCompartment) {
                const { bracketMatching } = cmModules.language;
                cmView.dispatch({
                    effects: bracketMatchCompartment.reconfigure(enabled ? bracketMatching() : [])
                });
            }
        } catch (e) {
            Logger.warn('Could not toggle bracket matching');
        }

        currentSettings.bracketMatching = enabled;
        saveSettings(currentSettings);
    }

    function applyActiveLine(enabled) {
        if (!cmView || !cmModules) return;
        try {
            if (typeof activeLineCompartment !== 'undefined' && activeLineCompartment) {
                const { highlightActiveLine, highlightActiveLineGutter } = cmModules.view;
                cmView.dispatch({
                    effects: activeLineCompartment.reconfigure(
                        enabled ? [highlightActiveLine(), highlightActiveLineGutter()] : []
                    )
                });
            }
        } catch (e) {
            Logger.warn('Could not toggle active line highlight');
        }

        currentSettings.activeLine = enabled;
        saveSettings(currentSettings);
    }

    // ==================== SYNC UI FROM SETTINGS ====================
    function syncUIFromSettings() {
        if (themeSelect) themeSelect.value = currentSettings.editorTheme;
        if (fontRange) fontRange.value = currentSettings.fontSize;
        if (fontSizeValue) fontSizeValue.textContent = currentSettings.fontSize;
        if (wordWrapToggle) wordWrapToggle.checked = currentSettings.wordWrap;
        if (lineNumbersToggle) lineNumbersToggle.checked = currentSettings.lineNumbers;
        if (autocompleteToggle) autocompleteToggle.checked = currentSettings.autocomplete;
        if (bracketMatchingToggle) bracketMatchingToggle.checked = currentSettings.bracketMatching;
        if (activeLineToggle) activeLineToggle.checked = currentSettings.activeLine;
    }

    // ==================== CONTROL EVENT LISTENERS ====================
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            applyEditorTheme(e.target.value);
        });
    }

    if (fontRange) {
        fontRange.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            if (fontSizeValue) fontSizeValue.textContent = size;
            applyFontSize(size);
        });
    }

    if (fontDecrease) {
        fontDecrease.addEventListener('click', () => {
            let size = currentSettings.fontSize - 1;
            size = Math.max(10, size);
            if (fontRange) fontRange.value = size;
            if (fontSizeValue) fontSizeValue.textContent = size;
            applyFontSize(size);
        });
    }

    if (fontIncrease) {
        fontIncrease.addEventListener('click', () => {
            let size = currentSettings.fontSize + 1;
            size = Math.min(32, size);
            if (fontRange) fontRange.value = size;
            if (fontSizeValue) fontSizeValue.textContent = size;
            applyFontSize(size);
        });
    }

    if (wordWrapToggle) {
        wordWrapToggle.addEventListener('change', (e) => {
            applyWordWrap(e.target.checked);
        });
    }

    if (lineNumbersToggle) {
        lineNumbersToggle.addEventListener('change', (e) => {
            applyLineNumbers(e.target.checked);
        });
    }

    if (autocompleteToggle) {
        autocompleteToggle.addEventListener('change', (e) => {
            applyAutocomplete(e.target.checked);
        });
    }

    if (bracketMatchingToggle) {
        bracketMatchingToggle.addEventListener('change', (e) => {
            applyBracketMatching(e.target.checked);
        });
    }

    if (activeLineToggle) {
        activeLineToggle.addEventListener('change', (e) => {
            applyActiveLine(e.target.checked);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentSettings = { ...SETTINGS_DEFAULTS };
            saveSettings(currentSettings);
            syncUIFromSettings();
            applyEditorTheme(SETTINGS_DEFAULTS.editorTheme);
            applyFontSize(SETTINGS_DEFAULTS.fontSize);
            applyWordWrap(SETTINGS_DEFAULTS.wordWrap);
            applyLineNumbers(SETTINGS_DEFAULTS.lineNumbers);
            applyAutocomplete(SETTINGS_DEFAULTS.autocomplete);
            applyBracketMatching(SETTINGS_DEFAULTS.bracketMatching);
            applyActiveLine(SETTINGS_DEFAULTS.activeLine);
            Logger.info('Settings reset to defaults');
        });
    }

    // ==================== APPLY SAVED SETTINGS ON LOAD ====================
    // Wait for the editor to be ready before applying saved settings
    function applySettingsWhenReady() {
        if (!cmView || !cmModules) {
            setTimeout(applySettingsWhenReady, 500);
            return;
        }

        // Apply saved theme if different from default
        if (currentSettings.editorTheme !== 'vscode-dark') {
            applyEditorTheme(currentSettings.editorTheme);
        }

        // Apply saved font size
        if (currentSettings.fontSize !== 14) {
            applyFontSize(currentSettings.fontSize);
        }

        // Apply toggle settings (these need compartments to be ready)
        setTimeout(() => {
            if (!currentSettings.wordWrap) applyWordWrap(false);
            if (!currentSettings.lineNumbers) applyLineNumbers(false);
            if (!currentSettings.autocomplete) applyAutocomplete(false);
            if (!currentSettings.bracketMatching) applyBracketMatching(false);
            if (!currentSettings.activeLine) applyActiveLine(false);
        }, 1000);
    }

    applySettingsWhenReady();

    // Expose for use from header theme toggle
    window.settingsApplyTheme = applyEditorTheme;
    window.settingsShowExplorer = showExplorerPanel;
    window.createEditorTheme = createEditorTheme;

})();
