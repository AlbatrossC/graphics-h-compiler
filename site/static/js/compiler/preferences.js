// ==================== SETTINGS PANEL ====================
// Manages the settings panel in the sidebar with editor configuration

(function () {
    'use strict';

    // Removed duplicate bundle import here, using global cmModules instead.
    const SETTINGS_DEFAULTS = (typeof APP_SETTINGS_DEFAULTS !== 'undefined')
        ? {
            editor: { ...APP_SETTINGS_DEFAULTS.editor }
        }
        : {
            editor: {
                fontSize: 16,
                wordWrap: true,
                lineNumbers: true,
                bracketMatching: true,
                activeLine: true,
                autocomplete: true,
                hoverTooltips: true,
                floatingRunBtn: true
            }
        };

    function cloneSettings(settings = SETTINGS_DEFAULTS) {
        return {
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
    
    // Theme controls
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIconSun = document.getElementById('theme-icon-sun');
    const themeIconMoon = document.getElementById('theme-icon-moon');

    // Settings controls
    const fontRange = document.getElementById('settings-font-range');
    const fontSizeValue = document.getElementById('settings-font-size-value');
    const fontDecrease = document.getElementById('settings-font-decrease');
    const fontIncrease = document.getElementById('settings-font-increase');
    const wordWrapToggle = document.getElementById('settings-word-wrap');
    const lineNumbersToggle = document.getElementById('settings-line-numbers');
    const bracketMatchingToggle = document.getElementById('settings-bracket-matching');
    const activeLineToggle = document.getElementById('settings-active-line');
    const autocompleteToggle = document.getElementById('settings-autocomplete');
    const hoverTooltipsToggle = document.getElementById('settings-hover-tooltips');
    const floatingRunBtnToggle = document.getElementById('settings-floating-run-btn');
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
            setSidebarHeading('Files Explorer');
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

    function applyAutocomplete(enabled, save = true) {
        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                autocomplete: !!enabled
            }
        };
        if (save) persistSettings();
    }

    function applyHoverTooltips(enabled, save = true) {
        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                hoverTooltips: !!enabled
            }
        };
        if (save) persistSettings();
    }

    function applyFloatingRunBtn(enabled, save = true) {
        // Only show on desktop (>768px), never on mobile
        const isDesktop = window.innerWidth > 768;
        const floatBtn = document.getElementById('floating-run-btn');
        const floatTooltip = document.getElementById('floating-run-btn-tooltip');
        if (floatBtn) {
            if (enabled && isDesktop) {
                floatBtn.style.removeProperty('display');
            } else {
                floatBtn.style.setProperty('display', 'none', 'important');
            }
        }
        // Always hide tooltip when button is disabled
        if (floatTooltip && !enabled) {
            floatTooltip.style.setProperty('display', 'none', 'important');
        } else if (floatTooltip && enabled) {
            floatTooltip.style.removeProperty('display');
        }
        currentSettings = {
            ...currentSettings,
            editor: {
                ...currentSettings.editor,
                floatingRunBtn: !!enabled
            }
        };
        if (save) persistSettings();
    }

    function syncUIFromSettings() {
        if (fontRange) fontRange.value = String(currentSettings.editor.fontSize);
        if (fontSizeValue) fontSizeValue.textContent = String(currentSettings.editor.fontSize);
        if (wordWrapToggle) wordWrapToggle.checked = currentSettings.editor.wordWrap;
        if (lineNumbersToggle) lineNumbersToggle.checked = currentSettings.editor.lineNumbers;
        if (bracketMatchingToggle) bracketMatchingToggle.checked = currentSettings.editor.bracketMatching;
        if (activeLineToggle) activeLineToggle.checked = currentSettings.editor.activeLine;
        if (autocompleteToggle) autocompleteToggle.checked = currentSettings.editor.autocomplete !== false;
        if (hoverTooltipsToggle) hoverTooltipsToggle.checked = currentSettings.editor.hoverTooltips !== false;
        if (floatingRunBtnToggle) floatingRunBtnToggle.checked = currentSettings.editor.floatingRunBtn !== false;
        if (headerFontDisplay) headerFontDisplay.textContent = String(currentSettings.editor.fontSize);
    }

    async function applySavedSettings() {
        if (!cmView || !cmModules) return;

        currentSettings = loadSettingsState();
        syncUIFromSettings();

        applyFontSize(currentSettings.editor.fontSize, false);
        applyWordWrap(currentSettings.editor.wordWrap, false);
        applyLineNumbers(currentSettings.editor.lineNumbers, false);
        applyBracketMatching(currentSettings.editor.bracketMatching, false);
        applyActiveLine(currentSettings.editor.activeLine, false);
        applyAutocomplete(currentSettings.editor.autocomplete !== false, false);
        applyHoverTooltips(currentSettings.editor.hoverTooltips !== false, false);
        applyFloatingRunBtn(currentSettings.editor.floatingRunBtn !== false, false);

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

    if (autocompleteToggle) {
        autocompleteToggle.addEventListener('change', (event) => {
            applyAutocomplete(event.target.checked, true);
        });
    }

    if (hoverTooltipsToggle) {
        hoverTooltipsToggle.addEventListener('change', (event) => {
            applyHoverTooltips(event.target.checked, true);
        });
    }

    if (floatingRunBtnToggle) {
        floatingRunBtnToggle.addEventListener('change', (event) => {
            applyFloatingRunBtn(event.target.checked, true);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentSettings = cloneSettings(SETTINGS_DEFAULTS);
            applyFontSize(currentSettings.editor.fontSize, false);
            applyWordWrap(currentSettings.editor.wordWrap, false);
            applyLineNumbers(currentSettings.editor.lineNumbers, false);
            applyBracketMatching(currentSettings.editor.bracketMatching, false);
            applyActiveLine(currentSettings.editor.activeLine, false);
            applyAutocomplete(currentSettings.editor.autocomplete !== false, false);
            applyHoverTooltips(currentSettings.editor.hoverTooltips !== false, false);
            applyFloatingRunBtn(currentSettings.editor.floatingRunBtn !== false, false);
            syncUIFromSettings();
            persistSettings();
            Logger.info('Settings reset to defaults');
        });
    }

    // ==================== THEME TOGGLE LOGIC ====================
    function applyTheme(theme, save = true) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (themeIconSun) themeIconSun.style.display = 'none';
            if (themeIconMoon) themeIconMoon.style.display = 'block';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (themeIconSun) themeIconSun.style.display = 'block';
            if (themeIconMoon) themeIconMoon.style.display = 'none';
        }
        if (save) {
            localStorage.setItem('app-theme', theme);
        }
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            applyTheme(isLight ? 'dark' : 'light');
        });
    }

    // Load saved theme on startup
    const savedTheme = localStorage.getItem('app-theme') || 'dark';
    applyTheme(savedTheme, false);

    // ==================== CROSS-MODULE EVENTS ====================
    document.addEventListener('editor-ready', () => {
        applySavedSettings();
    });

    document.addEventListener('editor-font-size-change-requested', (event) => {
        const requestedSize = event.detail?.fontSize;
        applyFontSize(requestedSize, true);
    });

    syncUIFromSettings();
    setSidebarView('explorer', { forceMobileOpen: false });
    // Apply floating run button preference immediately (doesn't need editor to be ready)
    applyFloatingRunBtn(currentSettings.editor.floatingRunBtn !== false, false);
    if (typeof cmView !== 'undefined' && cmView && cmModules) {
        applySavedSettings();
    }
})();
