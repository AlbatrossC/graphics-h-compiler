var isEditorFullscreen = false;
var isTerminalFullscreen = false;

(function () {
    'use strict';

    const mobileTabEditor = document.getElementById('mobile-tab-editor');
    const mobileTabOutput = document.getElementById('mobile-tab-output');

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
        terminalWrapper.classList.remove('terminal-active');
        editorWrapper.classList.add('active');
        if (iframe) {
            keyboardBlocker.classList.add('active');
        }
    }

    function switchMobileTab(tab) {
        if (!mobileTabEditor || !mobileTabOutput) return;

        if (isMobileView() && sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            syncMobileSidebarState();
        }

        document.body.classList.remove('mobile-tab-output');
        mobileTabEditor.classList.remove('active');
        mobileTabOutput.classList.remove('active');
        mobileTabEditor.setAttribute('aria-selected', 'false');
        mobileTabOutput.setAttribute('aria-selected', 'false');

        if (tab === 'output') {
            document.body.classList.add('mobile-tab-output');
            mobileTabOutput.classList.add('active');
            mobileTabOutput.setAttribute('aria-selected', 'true');
        } else {
            mobileTabEditor.classList.add('active');
            mobileTabEditor.setAttribute('aria-selected', 'true');
            releaseTerminalFocus();
        }

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

        editorWrapper.classList.toggle('fullscreen', isEditorFullscreen);
        terminalWrapper.classList.toggle('hidden', isEditorFullscreen);

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

        const svgIcon = document.querySelector('#fullscreen-terminal-btn svg');
        const terminalZoomControls = document.getElementById('terminal-zoom-controls');

        terminalWrapper.classList.toggle('fullscreen', isTerminalFullscreen);
        editorWrapper.classList.toggle('hidden', isTerminalFullscreen);

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

        setTimeout(() => {
            if (document.getElementById('dos-iframe')) {
                window.dispatchEvent(new Event('resize'));
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

    function toggleDesktopSidebar() {
        if (!sidebar) return;
        sidebar.classList.toggle('collapsed');

        setTimeout(() => {
            if (editor && editor.requestMeasure) {
                editor.requestMeasure();
            }
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
            const avatarUrl = user.user_metadata?.avatar_url;

            if (userName) userName.textContent = displayName;
            if (userEmail) userEmail.textContent = email;
            if (userAvatar) {
                userAvatar.innerHTML = avatarUrl
                    ? `<img src="${avatarUrl}" alt="${displayName}">`
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
        } else {
            syncMobileSidebarState();
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

    keyboardBlocker.addEventListener('click', focusTerminal);

    terminalWrapper.addEventListener('click', (event) => {
        const iframe = document.getElementById('dos-iframe');
        if (event.target === terminalWrapper || event.target === iframe) {
            if (!terminalFocused) {
                focusTerminal();
            }
        }
    });

    editorWrapper.addEventListener('click', focusEditor);

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
                if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
                syncMobileSidebarState();
                return;
            }
            toggleDesktopSidebar();
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
            syncMobileSidebarState();
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

    updateLoginUI(false);
})();
