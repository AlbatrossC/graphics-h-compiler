var isEditorFullscreen = false;
var isTerminalFullscreen = false;

(function () {
    'use strict';

    const mobileTabEditor = document.getElementById('mobile-tab-editor');
    const mobileTabOutput = document.getElementById('mobile-tab-output');
    const localEditorWrapper = document.getElementById('editor-wrapper');
    const localTerminalWrapper = document.getElementById('terminal-wrapper');
    const localKeyboardBlocker = document.getElementById('keyboard-blocker');
    const sidebarContainer = document.querySelector('.sidebar-container');

    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarToggle = document.getElementById('files-header-btn');
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
    const newFolderBtn = document.getElementById('new-folder-btn');
    const newFileBtn = document.getElementById('new-file-btn');

    function isMobileView() {
        return window.innerWidth <= 768;
    }

    function setVisible(element, visible) {
        if (!element) return;
        element.classList.toggle('hidden', !visible);
    }

    function syncMobileSidebarState() {
        const isOpen = isMobileView() && sidebar && sidebar.classList.contains('open');
        document.body.classList.toggle('sidebar-open-mobile', isOpen);
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle('active', isOpen);
        }
    }

    function getCurrentMobileTab() {
        return document.body.classList.contains('mobile-tab-output') ? 'output' : 'editor';
    }

    function setPanelDisplay(element, value) {
        if (!element) return;
        if (value) {
            element.style.setProperty('display', value, 'important');
        } else {
            element.style.removeProperty('display');
        }
    }

    function applyMobileTabLayout(tab) {
        if (!localEditorWrapper || !localTerminalWrapper) return;

        if (!isMobileView()) {
            document.body.classList.remove('mobile-tab-output');
            setPanelDisplay(localEditorWrapper, '');
            setPanelDisplay(localTerminalWrapper, '');
            if (sidebarContainer) {
                setPanelDisplay(sidebarContainer, '');
            }
            return;
        }

        const sidebarOpen = Boolean(sidebar && sidebar.classList.contains('open'));

        if (sidebarOpen) {
            setPanelDisplay(localEditorWrapper, 'none');
            setPanelDisplay(localTerminalWrapper, 'none');
            if (sidebarContainer) {
                setPanelDisplay(sidebarContainer, 'flex');
            }
            return;
        }

        if (sidebarContainer) {
            setPanelDisplay(sidebarContainer, 'none');
        }

        if (tab === 'output') {
            document.body.classList.add('mobile-tab-output');
            setPanelDisplay(localEditorWrapper, 'none');
            setPanelDisplay(localTerminalWrapper, 'flex');
            return;
        }

        document.body.classList.remove('mobile-tab-output');
        setPanelDisplay(localEditorWrapper, 'flex');
        setPanelDisplay(localTerminalWrapper, 'none');
    }

    function releaseTerminalFocus() {
        const iframe = document.getElementById('dos-iframe');
        if (iframe) {
            iframe.blur();
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'BLUR' }, '*');
            }
        }
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
        terminalFocused = false;
        localTerminalWrapper?.classList.remove('terminal-active');
        localEditorWrapper?.classList.add('active');
        if (iframe) {
            localKeyboardBlocker?.classList.add('active');
        }
    }

    function switchMobileTab(tab) {
        if (!mobileTabEditor || !mobileTabOutput) return;

        if (isMobileView() && sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            syncMobileSidebarState();
        }

        mobileTabEditor.classList.remove('active');
        mobileTabOutput.classList.remove('active');
        mobileTabEditor.setAttribute('aria-selected', 'false');
        mobileTabOutput.setAttribute('aria-selected', 'false');

        if (tab === 'output') {
            mobileTabOutput.classList.add('active');
            mobileTabOutput.setAttribute('aria-selected', 'true');
        } else {
            mobileTabEditor.classList.add('active');
            mobileTabEditor.setAttribute('aria-selected', 'true');
            releaseTerminalFocus();
        }

        applyMobileTabLayout(tab);

        requestAnimationFrame(() => {
            if (editor && editor.requestMeasure) editor.requestMeasure();
            window.dispatchEvent(new Event('resize'));

            if (tab === 'editor' && editor) {
                setTimeout(() => editor.focus(), 80);
            }
        });
    }

    function toggleEditorFullscreen(forceState) {
        isEditorFullscreen = typeof forceState === 'boolean' ? forceState : !isEditorFullscreen;

        const svgIcon = document.querySelector('#fullscreen-editor-btn svg');

        localEditorWrapper?.classList.toggle('fullscreen', isEditorFullscreen);
        localTerminalWrapper?.classList.toggle('hidden', isEditorFullscreen);

        if (svgIcon) {
            svgIcon.innerHTML = isEditorFullscreen
                ? '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
                : '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
        }

        setTimeout(() => {
            if (editor && editor.requestMeasure) {
                editor.requestMeasure();
            }
        }, 100);
    }

    function toggleTerminalFullscreen() {
        isTerminalFullscreen = !isTerminalFullscreen;

        const fsBtn = document.getElementById('fullscreen-terminal-btn');
        const svgIcon = fsBtn ? fsBtn.querySelector('svg') : null;
        const terminalZoomControls = document.getElementById('terminal-zoom-controls');

        localTerminalWrapper?.classList.toggle('fullscreen', isTerminalFullscreen);
        localEditorWrapper?.classList.toggle('hidden', isTerminalFullscreen);

        if (svgIcon) {
            svgIcon.innerHTML = isTerminalFullscreen
                ? '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>'
                : '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
        }

        if (isTerminalFullscreen) {
            if (typeof updateTerminalZoom === 'function') {
                currentTerminalZoom = 1.2;
                updateTerminalZoom(0);
            }
            if (terminalZoomControls) terminalZoomControls.classList.remove('hidden');
        } else {
            if (terminalZoomControls) terminalZoomControls.classList.add('hidden');
            if (typeof resetTerminalZoom === 'function') {
                resetTerminalZoom();
            }
        }

        // Blur the fullscreen button immediately so keyboard input is not captured by it
        if (fsBtn) fsBtn.blur();

        setTimeout(() => {
            if (document.getElementById('dos-iframe')) {
                window.dispatchEvent(new Event('resize'));
            }
            // Auto-focus the terminal after toggling so the user can type immediately
            if (isTerminalFullscreen && typeof focusTerminal === 'function') {
                focusTerminal();
            }
        }, 100);
    }

    function focusTerminal() {
        const iframe = document.getElementById('dos-iframe');
        if (!iframe) return;

        terminalFocused = true;
        iframe.focus();
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'FOCUS' }, '*');
        }
        localTerminalWrapper?.classList.add('terminal-active');
        localEditorWrapper?.classList.remove('active');
        localKeyboardBlocker?.classList.remove('active');
    }

    function focusEditor() {
        terminalFocused = false;
        if (document.activeElement && document.activeElement.tagName === 'IFRAME') {
            document.activeElement.blur();
        }
        if (editor) {
            editor.focus();
        }
        localTerminalWrapper?.classList.remove('terminal-active');
        localEditorWrapper?.classList.add('active');
        if (document.getElementById('dos-iframe')) {
            localKeyboardBlocker?.classList.add('active');
        }
    }

    function toggleDesktopSidebar() {
        if (!sidebar) return;
        sidebar.classList.toggle('collapsed');
        // Clear any inline width set by splitter dragging so CSS takes over
        sidebar.style.width = '';
        sidebar.style.minWidth = '';

        // Toggle active state on Files button
        if (sidebarToggle) {
            sidebarToggle.classList.toggle('sidebar-active', !sidebar.classList.contains('collapsed'));
        }

        setTimeout(() => {
            if (editor && editor.requestMeasure) {
                editor.requestMeasure();
            }
            window.dispatchEvent(new Event('resize'));
        }, 350);
    }

    function updateLoginUI(loggedIn, user) {
        isUserLoggedIn = loggedIn;
        currentUser = user;

        const sidebarView = typeof window.getSidebarView === 'function'
            ? window.getSidebarView()
            : 'explorer';
        const explorerActions = document.querySelector('.explorer-actions');
        const showExplorerFiles = sidebarView === 'explorer' && loggedIn;
        const showExplorerPromo = sidebarView === 'explorer' && !loggedIn;

        if (loggedIn && user) {
            setVisible(cloudPromoView, false);
            setVisible(fileExplorerView, showExplorerFiles);
            if (refreshBtn) {
                setVisible(refreshBtn, true);
                refreshBtn.disabled = false;
            }
            setVisible(newFolderBtn, true);
            setVisible(newFileBtn, true);
            setVisible(explorerActions, showExplorerFiles);
            setVisible(authSection, false);
            setVisible(userProfileSection, true);

            const displayName =
                user.user_metadata?.full_name ||
                user.display_name ||
                user.name ||
                user.email ||
                'Account';
            const email = user.email || user.user_metadata?.email || '';
            const avatarUrl = user.avatar_url || user.user_metadata?.avatar_url || '';

            if (userName) userName.textContent = displayName;
            if (userEmail) userEmail.textContent = email;
            if (userAvatar) {
                userAvatar.innerHTML = avatarUrl
                    ? `<img src="${avatarUrl}" alt="${displayName}" referrerpolicy="no-referrer" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`
                    : displayName.charAt(0).toUpperCase();
            }

            Logger.success(`Signed in as ${displayName}`);
        } else {
            setVisible(cloudPromoView, showExplorerPromo);
            setVisible(fileExplorerView, false);
            if (refreshBtn) {
                setVisible(refreshBtn, false);
                refreshBtn.disabled = true;
            }
            setVisible(newFolderBtn, false);
            setVisible(newFileBtn, false);
            setVisible(document.querySelector('.explorer-actions'), false);
            setVisible(authSection, true);
            setVisible(userProfileSection, false);

            CLOUD_STATE.files.clear();
            CLOUD_STATE.folders = new Set(['root']);
            CLOUD_STATE.folderNameToId = new Map();
            CLOUD_STATE.folderIdToName = new Map();
            CLOUD_STATE.openTabs = [];
            CLOUD_STATE.activeFileKey = 'root/main.cpp';
            CLOUD_STATE.selectedFolderKey = 'root';
            updateSaveIndicator();
        }

        document.dispatchEvent(new CustomEvent('auth-state-changed', {
            detail: { loggedIn, user }
        }));
    }

    function handleResize() {
        if (!isMobileView()) {
            document.body.classList.remove('mobile-tab-output', 'sidebar-open-mobile');
            if (isEditorFullscreen) {
                toggleEditorFullscreen(false);
            }
            applyMobileTabLayout('editor');
        } else {
            syncMobileSidebarState();
            applyMobileTabLayout(document.body.classList.contains('mobile-tab-output') ? 'output' : 'editor');
        }

        if (editor && editor.requestMeasure) {
            editor.requestMeasure();
        }
    }

    if (mobileTabEditor) {
        mobileTabEditor.addEventListener('click', () => switchMobileTab('editor'));
    }
    if (mobileTabOutput) {
        mobileTabOutput.addEventListener('click', () => switchMobileTab('output'));
    }

    document.getElementById('fullscreen-editor-btn')?.addEventListener('click', () => {
        toggleEditorFullscreen();
    });

    document.getElementById('fullscreen-terminal-btn')?.addEventListener('click', toggleTerminalFullscreen);

    localKeyboardBlocker?.addEventListener('click', focusTerminal);

    localTerminalWrapper?.addEventListener('click', (event) => {
        const iframe = document.getElementById('dos-iframe');
        if (event.target === localTerminalWrapper || event.target === iframe) {
            if (!terminalFocused) {
                focusTerminal();
            }
        }
    });

    localEditorWrapper?.addEventListener('click', focusEditor);

    document.addEventListener('click', (event) => {
        if (!terminalFocused) return;
        if (!terminalWrapper.contains(event.target)) {
            focusEditor();
        }
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
            if (sidebar && sidebar.contains(activeEl)) {
                return;
            }
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        focusEditor();
    }, true);

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            if (isMobileView()) {
                sidebar.classList.toggle('open');
                syncMobileSidebarState();
                applyMobileTabLayout(getCurrentMobileTab());
                return;
            }
            toggleDesktopSidebar();
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            syncMobileSidebarState();
            applyMobileTabLayout(getCurrentMobileTab());
        });
    }

    sidebarCollapseBtn?.addEventListener('click', toggleDesktopSidebar);

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

            toggleDesktopSidebar();
        });
    }

    refreshBtn?.addEventListener('click', () => refreshCloudFiles(true));

    if (newFileBtn) {
        newFileBtn.addEventListener('click', () => {
            if (!isUserLoggedIn) return;
            const filename = prompt('Enter a file name (e.g., mycode.cpp):\nOnly letters, numbers, dots, underscores, and dashes are allowed.');
            if (filename && filename.trim()) {
                createNewFile(filename.trim());
            }
        });
    }

    if (userProfileBtn) {
        userProfileBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            userProfileDropdown.classList.toggle('open');
        });
    }

    document.addEventListener('click', (event) => {
        if (!userProfileDropdown || !userProfileBtn) return;
        if (!userProfileDropdown.contains(event.target) && !userProfileBtn.contains(event.target)) {
            userProfileDropdown.classList.remove('open');
        }
    });

    signoutBtn?.addEventListener('click', async () => {
        userProfileDropdown.classList.remove('open');
        await signOut();
    });

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
        setTimeout(handleResize, 300);
    });

    window.isMobileView = isMobileView;
    window.syncMobileSidebarState = syncMobileSidebarState;
    window.switchMobileTab = switchMobileTab;
    window.toggleEditorFullscreen = toggleEditorFullscreen;
    window.focusTerminal = focusTerminal;
    window.focusEditor = focusEditor;
    window.updateLoginUI = updateLoginUI;

    applyMobileTabLayout('editor');
    updateLoginUI(false);

    // ============================================================
    // FLOATING RUN BUTTON (desktop only)
    // Draggable, shows run icon; becomes a stop icon while running.
    // Shows a one-time attached tooltip for 5 s on first page load.
    // ============================================================
    (function initFloatingRunBtn() {
        const floatBtn = document.getElementById('floating-run-btn');
        const floatTooltip = document.getElementById('floating-run-btn-tooltip');
        if (!floatBtn) return;

        // Desktop-only — bail out entirely on mobile
        if (isMobileView()) return;

        const STORAGE_KEY = 'floating-run-btn-pos';
        const TOOLTIP_SHOWN_KEY = 'floating-run-btn-tooltip-shown';
        const DRAG_THRESHOLD = 6; // px — below this movement is treated as a click

        const RUN_ICON = '<path d="M8 5v14l11-7z" />';
        const STOP_ICON = '<path d="M6 6h12v12H6z" />';

        function getSvg() { return floatBtn.querySelector('svg'); }

        function positionBtn(x, y) {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const bw = floatBtn.offsetWidth || 54;
            const bh = floatBtn.offsetHeight || 54;
            x = Math.max(8, Math.min(w - bw - 8, x));
            y = Math.max(8, Math.min(h - bh - 8, y));
            floatBtn.style.left = x + 'px';
            floatBtn.style.top = y + 'px';
            floatBtn.style.right = 'auto';
            floatBtn.style.bottom = 'auto';
            return { x, y };
        }

        // Position the tooltip attached to (above) the button
        function positionTooltip() {
            if (!floatTooltip) return;
            const bRect = floatBtn.getBoundingClientRect();
            const tW = floatTooltip.offsetWidth || 224;
            const tH = floatTooltip.offsetHeight || 72;
            const GAP = 12;
            // Prefer above; fall back to below if not enough room
            let tTop = bRect.top - tH - GAP;
            if (tTop < 8) tTop = bRect.bottom + GAP;
            // Centre-align with button, clamp to viewport
            let tLeft = bRect.left + bRect.width / 2 - tW / 2;
            tLeft = Math.max(8, Math.min(window.innerWidth - tW - 8, tLeft));
            floatTooltip.style.left = tLeft + 'px';
            floatTooltip.style.top = Math.max(8, tTop) + 'px';
        }

        function savePos(x, y) {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y })); } catch (e) {}
        }

        function loadPos() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
                if (saved && typeof saved.x === 'number') return saved;
            } catch (e) {}
            return null;
        }

        // Set initial position — default to bottom-right of the editor panel
        const saved = loadPos();
        if (saved) {
            positionBtn(saved.x, saved.y);
        } else {
            // Position over the editor: bottom-right corner of the editor wrapper
            const editorEl = document.getElementById('editor-wrapper');
            if (editorEl) {
                const r = editorEl.getBoundingClientRect();
                // Place near bottom-right of the editor panel
                positionBtn(r.right - 70, r.bottom - 80);
            } else {
                // Fallback: centre of viewport
                positionBtn(
                    Math.round(window.innerWidth / 2 - 25),
                    Math.round(window.innerHeight / 2 - 25)
                );
            }
        }

        // ── Drag logic ──────────────────────────────────────────
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragMoved = false; // true only when DRAG_THRESHOLD is exceeded

        floatBtn.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            dragMoved = false;
            const rect = floatBtn.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            floatBtn.style.transition = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (!dragMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            dragMoved = true;
            positionBtn(e.clientX - dragOffsetX, e.clientY - dragOffsetY);
            // Keep tooltip attached while dragging
            if (floatTooltip && floatTooltip.classList.contains('visible')) {
                positionTooltip();
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            floatBtn.style.transition = '';
            const rect = floatBtn.getBoundingClientRect();
            savePos(rect.left, rect.top);
            if (!dragMoved) {
                // Treat as a click: run or stop
                handleFloatBtnClick();
            }
        });

        // Keyboard accessibility
        floatBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleFloatBtnClick();
            }
        });

        function handleFloatBtnClick() {
            if (typeof runProgram === 'function') {
                runProgram();
            }
        }

        // Update icon based on running state
        // Hook into execution.js events if available via custom events, otherwise poll
        function setRunning(isRunning) {
            const svg = getSvg();
            if (!svg) return;
            floatBtn.classList.toggle('is-running', isRunning);
            svg.innerHTML = isRunning ? STOP_ICON : RUN_ICON;
            floatBtn.title = isRunning ? 'Stop' : 'Compile and Run';
            floatBtn.setAttribute('aria-label', isRunning ? 'Stop' : 'Compile and Run');
        }

        document.addEventListener('compiler-run-start', () => setRunning(true));
        document.addEventListener('compiler-run-end', () => setRunning(false));

        // ── One-time attached tooltip (5 s, first visit only) ────
        if (!localStorage.getItem(TOOLTIP_SHOWN_KEY) && floatTooltip) {
            setTimeout(() => {
                positionTooltip();
                floatTooltip.classList.add('visible');
                setTimeout(() => {
                    floatTooltip.classList.remove('visible');
                    try { localStorage.setItem(TOOLTIP_SHOWN_KEY, '1'); } catch (e) {}
                }, 5000);
            }, 1000);
        }

        // Reposition button (and tooltip) on window resize
        window.addEventListener('resize', () => {
            const rect = floatBtn.getBoundingClientRect();
            positionBtn(rect.left, rect.top);
            if (floatTooltip && floatTooltip.classList.contains('visible')) {
                positionTooltip();
            }
        });
    })();
})();
