(function () {
    'use strict';

    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    let progressDepth = 0;

    function showProgress() {
        if (!progressBar || !progressFill) return;
        progressDepth += 1;
        progressBar.classList.remove('hidden');
        progressFill.classList.add('indeterminate');
    }

    function hideProgress() {
        if (!progressBar || !progressFill) return;
        progressDepth = Math.max(0, progressDepth - 1);
        if (progressDepth > 0) return;
        progressFill.classList.remove('indeterminate');
        progressBar.classList.add('hidden');
    }

    function setExplorerLoading(isLoading, text) {
        const loading = document.getElementById('explorer-loading-state');
        const loadingText = document.getElementById('explorer-loading-text');
        const fileList = document.getElementById('main-folder-files');

        if (!loading || !fileList) return;
        if (loadingText) loadingText.textContent = text || 'Loading files...';
        loading.classList.toggle('hidden', !isLoading);
        fileList.classList.toggle('hidden', isLoading);
    }

    function updateSaveIndicator() {
        if (!saveIndicator || !saveText) return;
        if (!DIRTY_FLAG.isDirty && SAVE_STATE.lastSavedHash) {
            saveIndicator.classList.add('saved');
            saveText.textContent = isUserLoggedIn ? 'Saved to cloud' : 'Saved';
            return;
        }

        saveIndicator.classList.remove('saved');
        saveText.textContent = 'Unsaved';
    }

    function getFileIconClass(ext) {
        if (ext === 'cpp' || ext === 'c') return 'icon-cpp';
        if (ext === 'h' || ext === 'hpp') return 'icon-header';
        if (ext === 'txt') return 'icon-text';
        return 'icon-default';
    }

    function createFileItem(folder, filename) {
        const item = document.createElement('div');
        const ext = filename.split('.').pop().toLowerCase();

        item.className = 'file-item';
        item.dataset.folder = folder;
        item.dataset.file = filename;

        if (fileKey(folder, filename) === (CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY)) {
            item.classList.add('active');
        }

        item.innerHTML = `
        <svg class="file-icon ${getFileIconClass(ext)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <div class="file-main">
            <span class="file-name" title="${filename}">${filename}</span>
        </div>
        <div class="file-actions">
            <button class="file-action-btn file-download-btn" title="Download file" onclick="event.stopPropagation(); downloadFile('${folder}', '${filename}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
            <button class="file-action-btn file-rename-btn" title="Rename file" onclick="event.stopPropagation(); renameFile('${folder}', '${filename}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></button>
            <button class="file-action-btn file-delete-btn" title="Delete file" onclick="event.stopPropagation(); deleteFile('${folder}', '${filename}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path></svg></button>
        </div>`;

        item.addEventListener('click', () => {
            setSelectedFolder(folder);
            openFile(folder, filename);

            const sidebar = document.getElementById('sidebar');
            const sidebarOverlay = document.getElementById('sidebar-overlay');
            if (sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                if (sidebarOverlay) sidebarOverlay.classList.remove('active');
                if (typeof window.syncMobileSidebarState === 'function') {
                    window.syncMobileSidebarState();
                }
            }

            if (typeof window.switchMobileTab === 'function') {
                window.switchMobileTab('editor');
            }
        });

        return item;
    }

    function createFolderGroup(folder, name, files) {
        const collapsed = isFolderCollapsed(folder);
        const group = document.createElement('div');
        group.className = 'folder-group';
        group.classList.toggle('collapsed', collapsed);
        group.dataset.folder = folder;

        const header = document.createElement('div');
        header.className = 'folder-group-header';
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', String(!collapsed));
        if ((CLOUD_STATE.selectedFolderKey || ROOT_FOLDER_KEY) === folder) {
            header.classList.add('selected');
        }

        const fileCountLabel = `${files.length} file${files.length === 1 ? '' : 's'}`;
        header.innerHTML = `<span class="folder-group-title"><span class="folder-chevron" aria-hidden="true">▾</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span>${name}</span></span><span class="folder-file-count">${fileCountLabel}</span>`;
        header.addEventListener('click', () => {
            setSelectedFolder(folder);
            setFolderCollapsed(folder, !collapsed);
            renderFileExplorer();
        });

        if (folder !== ROOT_FOLDER_KEY) {
            const renameBtn = document.createElement('button');
            renameBtn.className = 'folder-action-btn';
            renameBtn.title = `Rename folder ${name}`;
            renameBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
            renameBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                renameFolder(folder, name);
            });
            header.appendChild(renameBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'folder-action-btn';
            deleteBtn.title = `Delete folder ${name}`;
            deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
            deleteBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteFolder(folder, name).catch((error) => alert(error.message));
            });
            header.appendChild(deleteBtn);
        }

        group.appendChild(header);

        const wrap = document.createElement('div');
        wrap.className = 'folder-group-files';

        if (!files.length) {
            const empty = document.createElement('div');
            empty.className = 'folder-group-empty';
            empty.textContent = 'No files';
            wrap.appendChild(empty);
        } else {
            files.forEach((file) => wrap.appendChild(createFileItem(folder, file.filename)));
        }

        group.appendChild(wrap);
        return group;
    }

    function renderFileExplorer() {
        const fileList = document.getElementById('main-folder-files');
        const filesCount = document.getElementById('files-count');
        if (!fileList) return;
        if (!CLOUD_STATE.folderIdToName) setDefaultFolderState();

        const filesByFolder = new Map();
        for (const [id, name] of CLOUD_STATE.folderIdToName.entries()) {
            if (!filesByFolder.has(id)) filesByFolder.set(id, []);
            CLOUD_STATE.folders.add(id);
            CLOUD_STATE.folderNameToId.set(name, id);
        }

        CLOUD_STATE.files.forEach((file) => {
            if (!isVisibleCloudFile(file)) return;
            const key = file.folder_key || ROOT_FOLDER_KEY;
            if (!filesByFolder.has(key)) filesByFolder.set(key, []);
            filesByFolder.get(key).push(file);
        });

        filesByFolder.forEach((files) => files.sort((a, b) => a.filename.localeCompare(b.filename)));

        const orderedFolders = Array.from(CLOUD_STATE.folderIdToName.keys())
            .sort((a, b) => getFolderName(a).localeCompare(getFolderName(b)));

        fileList.innerHTML = '';

        const fragment = document.createDocumentFragment();
        orderedFolders.forEach((key) => {
            fragment.appendChild(createFolderGroup(key, getFolderName(key), filesByFolder.get(key) || []));
        });

        if (!fragment.childNodes.length) {
            const empty = document.createElement('div');
            empty.className = 'file-list-empty';
            empty.textContent = 'No files yet. Create a file to get started.';
            fragment.appendChild(empty);
        }

        fileList.appendChild(fragment);

        const visibleCount = getVisibleCloudFiles().length;
        if (filesCount) {
            filesCount.textContent = `${visibleCount} file${visibleCount === 1 ? '' : 's'}`;
        }
    }

    function highlightActiveFile() {
        const [folder, filename] = (CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY).split('/');
        document.querySelectorAll('.file-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.folder === folder && item.dataset.file === filename);
        });
        document.querySelectorAll('.folder-group-header').forEach((header) => {
            header.classList.toggle('selected', header.parentElement?.dataset.folder === (CLOUD_STATE.selectedFolderKey || ROOT_FOLDER_KEY));
        });

        const tab = document.getElementById('current-file-tab');
        const name = document.getElementById('current-file-name');
        if (tab) tab.dataset.file = filename;
        if (name) name.textContent = filename;
    }

    window.showProgress = showProgress;
    window.hideProgress = hideProgress;
    window.setExplorerLoading = setExplorerLoading;
    window.updateSaveIndicator = updateSaveIndicator;
    window.renderFileExplorer = renderFileExplorer;
    window.highlightActiveFile = highlightActiveFile;
})();
