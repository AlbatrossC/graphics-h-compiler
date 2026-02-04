        // ==================== CLOUD STORAGE ====================

        function normalizeSegment(value) {
            if (typeof value !== 'string') return '';
            const trimmed = value.trim();
            if (!trimmed) return '';
            if (trimmed.length > 200 || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
                return '';
            }
            return trimmed;
        }

        function getFileKey(folder, filename) {
            return `${folder}/${filename}`;
        }

        function resolveStorageBaseUrl() {
            if (CLOUD_STATE.storageBaseUrl) return CLOUD_STATE.storageBaseUrl;

            const fromWindow = window.STORAGE_WORKER_URL || '';
            const fromLocal = localStorage.getItem('storage_worker_url') || '';
            const base = fromWindow || fromLocal || window.location.origin;
            CLOUD_STATE.storageBaseUrl = base.replace(/\/$/, '');
            return CLOUD_STATE.storageBaseUrl;
        }

        async function getAccessToken() {
            if (!supabaseClient) return null;
            const { data: { session } } = await supabaseClient.auth.getSession();
            return session?.access_token || null;
        }

        async function storageFetch(path, options = {}) {
            const token = await getAccessToken();
            if (!token) {
                throw new Error('Authentication required');
            }

            const url = `${resolveStorageBaseUrl()}${path}`;
            const headers = {
                Authorization: `Bearer ${token}`,
                ...options.headers
            };

            return fetch(url, {
                ...options,
                headers
            });
        }

        async function computeSha256(text) {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        function setSaveStatus(state, message) {
            const isSaved = state === 'saved' || state === 'local-saved';
            saveIndicator.classList.toggle('saved', isSaved);
            saveText.textContent = message;
        }

        function setLocalDraft(folder, filename, content) {
            const key = `cloud_draft:${getFileKey(folder, filename)}`;
            localStorage.setItem(key, content);
        }

        function getLocalDraft(folder, filename) {
            const key = `cloud_draft:${getFileKey(folder, filename)}`;
            return localStorage.getItem(key);
        }

        function clearLocalDraft(folder, filename) {
            const key = `cloud_draft:${getFileKey(folder, filename)}`;
            localStorage.removeItem(key);
        }

        async function listCloudFiles() {
            const response = await storageFetch('/files/list', { method: 'GET' });
            if (!response.ok) {
                throw new Error('Failed to list files');
            }
            const data = await response.json();
            return Array.isArray(data.files) ? data.files : [];
        }

        async function readCloudFile(folder, filename) {
            const params = new URLSearchParams({ folder, filename });
            const response = await storageFetch(`/files/read?${params.toString()}`, { method: 'GET' });
            if (!response.ok) {
                throw new Error('Failed to read file');
            }
            return response.text();
        }

        async function saveCloudFile(folder, filename, content, previousHash = null) {
            const hash = await computeSha256(content);
            if (CLOUD_STATE.lastSavedHash === hash || (previousHash && previousHash === hash)) {
                return { hash, skipped: true };
            }

            const response = await storageFetch('/files/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder, filename, content, hash })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Save failed: ${text}`);
            }

            const data = await response.json();
            return { hash: data.hash || hash, skipped: false };
        }

        async function deleteCloudFile(folder, filename) {
            const response = await storageFetch('/files/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder, filename })
            });

            if (!response.ok) {
                throw new Error('Failed to delete file');
            }
        }

        async function refreshCloudFiles() {
            if (!isUserLoggedIn) return;

            try {
                const files = await listCloudFiles();
                CLOUD_STATE.files.clear();
                CLOUD_STATE.folders = new Set(['main']);

                files.forEach((file) => {
                    const folder = normalizeSegment(file.folder) || 'main';
                    const filename = normalizeSegment(file.filename) || 'main.cpp';
                    const key = getFileKey(folder, filename);
                    CLOUD_STATE.files.set(key, {
                        id: file.id,
                        folder,
                        filename,
                        file_hash: file.file_hash || null,
                        updated_at: file.updated_at || null,
                        content: null
                    });
                    CLOUD_STATE.folders.add(folder);
                });

                renderFileExplorer();
                renderFileTabs();

                if (!CLOUD_STATE.files.size) {
                    await ensureDefaultCloudFile();
                }
            } catch (e) {
                Logger.warn('Failed to refresh cloud files: ' + e.message);
            }
        }

        async function ensureDefaultCloudFile() {
            const defaultFolder = 'main';
            const defaultFilename = 'main.cpp';
            const key = getFileKey(defaultFolder, defaultFilename);
            if (CLOUD_STATE.files.has(key)) {
                CLOUD_STATE.activeFileKey = key;
                return;
            }

            const code = editor ? editor.getValue() : '';
            if (code.trim()) {
                try {
                    await saveCloudFile(defaultFolder, defaultFilename, code);
                } catch (e) {
                    Logger.warn('Unable to seed default file: ' + e.message);
                }
            }

            CLOUD_STATE.files.set(key, {
                id: null,
                folder: defaultFolder,
                filename: defaultFilename,
                file_hash: CLOUD_STATE.lastSavedHash,
                updated_at: new Date().toISOString(),
                content: code
            });

            CLOUD_STATE.folders.add(defaultFolder);
            CLOUD_STATE.activeFileKey = key;
            renderFileExplorer();
            renderFileTabs();
        }

        async function openFile(folder, filename, options = {}) {
            const normalizedFolder = normalizeSegment(folder) || 'main';
            const normalizedFilename = normalizeSegment(filename) || 'main.cpp';
            const key = getFileKey(normalizedFolder, normalizedFilename);

            if (!options.skipSave) {
                await forceSaveActiveFile();
            }

            const fileMeta = CLOUD_STATE.files.get(key) || {
                id: null,
                folder: normalizedFolder,
                filename: normalizedFilename,
                file_hash: null,
                updated_at: null,
                content: null
            };

            if (!fileMeta.content) {
                try {
                    const content = await readCloudFile(normalizedFolder, normalizedFilename);
                    fileMeta.content = content;
                } catch (e) {
                    const draft = getLocalDraft(normalizedFolder, normalizedFilename);
                    if (draft !== null) {
                        fileMeta.content = draft;
                    } else {
                        fileMeta.content = '';
                    }
                }
            }

            CLOUD_STATE.files.set(key, fileMeta);
            CLOUD_STATE.activeFileKey = key;
            CLOUD_STATE.lastSavedHash = fileMeta.file_hash || null;

            if (editor) {
                editor.setValue(fileMeta.content || '', -1);
                editor.clearSelection();
                editor.moveCursorTo(0, 0);
            }

            renderFileExplorer();
            renderFileTabs();
            updateEditorInfo();
            updateSaveIndicator();
        }

        async function createNewFile() {
            if (!isUserLoggedIn) {
                alert('Please sign in to create new files in cloud storage.');
                return;
            }

            const filenameInput = prompt('Enter new file name (e.g., hello.cpp):', 'main.cpp');
            const filename = normalizeSegment(filenameInput);
            if (!filename) {
                alert('Invalid file name.');
                return;
            }

            const folderInput = prompt('Folder name:', 'main');
            const folder = normalizeSegment(folderInput) || 'main';

            const key = getFileKey(folder, filename);
            if (CLOUD_STATE.files.has(key)) {
                await openFile(folder, filename);
                return;
            }

            CLOUD_STATE.files.set(key, {
                id: null,
                folder,
                filename,
                file_hash: null,
                updated_at: new Date().toISOString(),
                content: ''
            });
            CLOUD_STATE.folders.add(folder);
            CLOUD_STATE.activeFileKey = key;

            if (editor) {
                editor.setValue('', -1);
                editor.clearSelection();
                editor.moveCursorTo(0, 0);
            }

            renderFileExplorer();
            renderFileTabs();
            setSaveStatus('not-saved', 'Not Saved');
        }

        async function createNewFolder() {
            if (!isUserLoggedIn) {
                alert('Please sign in to create folders in cloud storage.');
                return;
            }

            const folderInput = prompt('Enter new folder name:', 'project');
            const folder = normalizeSegment(folderInput);
            if (!folder) {
                alert('Invalid folder name.');
                return;
            }

            CLOUD_STATE.folders.add(folder);
            renderFileExplorer();
        }

        async function forceSaveActiveFile() {
            if (!editor || !isUserLoggedIn) return;

            const activeKey = CLOUD_STATE.activeFileKey;
            if (!activeKey) return;

            const [folder, filename] = activeKey.split('/');
            const code = editor.getValue();

            if (!code.trim()) {
                setLocalDraft(folder, filename, code);
                setSaveStatus('not-saved', 'Not Saved');
                return;
            }

            try {
                CLOUD_STATE.isSaving = true;
                setSaveStatus('saving', 'Saving...');

                const previousHash = CLOUD_STATE.files.get(activeKey)?.file_hash || null;
                const result = await saveCloudFile(folder, filename, code, previousHash);
                CLOUD_STATE.lastSavedHash = result.hash;
                CLOUD_STATE.lastSavedAt = new Date().toISOString();

                const meta = CLOUD_STATE.files.get(activeKey) || {
                    folder,
                    filename
                };
                meta.file_hash = result.hash;
                meta.updated_at = CLOUD_STATE.lastSavedAt;
                meta.content = code;
                CLOUD_STATE.files.set(activeKey, meta);

                clearLocalDraft(folder, filename);
                setSaveStatus('saved', 'Saved');
                renderFileExplorer();
            } catch (e) {
                Logger.warn('Cloud save failed: ' + e.message);
                setLocalDraft(folder, filename, code);
                setSaveStatus('local-saved', 'Saved Locally');
            } finally {
                CLOUD_STATE.isSaving = false;
            }
        }

        function scheduleAutosave() {
            if (!isUserLoggedIn) return;
            if (CLOUD_STATE.autosaveTimer) {
                clearTimeout(CLOUD_STATE.autosaveTimer);
            }
            CLOUD_STATE.autosaveTimer = setTimeout(() => {
                forceSaveActiveFile();
            }, AUTOSAVE_DELAY_MS);
        }

        function renderFileExplorer() {
            if (!fileExplorerView) return;

            const sections = fileExplorerView.querySelectorAll('.explorer-section');
            sections.forEach(section => section.remove());

            const folders = Array.from(CLOUD_STATE.folders).sort((a, b) => a.localeCompare(b));

            folders.forEach((folder) => {
                const section = document.createElement('div');
                section.className = 'explorer-section';

                const folderHeader = document.createElement('div');
                folderHeader.className = 'folder-item';
                folderHeader.innerHTML = `
                    <svg class="folder-arrow" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z" />
                    </svg>
                    <svg class="folder-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                    </svg>
                    <span>${folder}</span>
                `;

                const fileList = document.createElement('div');
                fileList.className = 'file-list';

                const files = Array.from(CLOUD_STATE.files.values())
                    .filter(file => file.folder === folder)
                    .sort((a, b) => a.filename.localeCompare(b.filename));

                files.forEach((file) => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    const key = getFileKey(file.folder, file.filename);
                    if (CLOUD_STATE.activeFileKey === key) {
                        fileItem.classList.add('active');
                    }
                    fileItem.dataset.file = file.filename;
                    fileItem.dataset.folder = file.folder;
                    fileItem.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #519aba;">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span>${file.filename}</span>
                    `;
                    fileItem.addEventListener('click', () => openFile(file.folder, file.filename));
                    fileList.appendChild(fileItem);
                });

                folderHeader.addEventListener('click', () => {
                    const collapsed = folderHeader.classList.toggle('collapsed');
                    fileList.style.display = collapsed ? 'none' : 'flex';
                });

                section.appendChild(folderHeader);
                section.appendChild(fileList);
                fileExplorerView.appendChild(section);
            });
        }

        function renderFileTabs() {
            const tabsContainer = document.querySelector('.file-tabs');
            if (!tabsContainer) return;

            const activeKey = CLOUD_STATE.activeFileKey;
            if (activeKey && !CLOUD_STATE.openTabs.includes(activeKey)) {
                CLOUD_STATE.openTabs.push(activeKey);
            }

            tabsContainer.innerHTML = '';

            CLOUD_STATE.openTabs.forEach((key) => {
                const [folder, filename] = key.split('/');
                const tab = document.createElement('button');
                tab.className = 'file-tab';
                if (key === activeKey) {
                    tab.classList.add('active');
                }
                tab.dataset.file = filename;
                tab.dataset.folder = folder;
                tab.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="currentColor" style="color: #519aba;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
                        <path d="M9 13h6v2H9zm0 4h4v2H9z" opacity="0.6" />
                    </svg>
                    <span class="file-tab-name">${filename}</span>
                    <span class="file-tab-close" title="Close">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </span>
                `;

                tab.addEventListener('click', (event) => {
                    const closeBtn = event.target.closest('.file-tab-close');
                    if (closeBtn) {
                        closeTab(key);
                        return;
                    }
                    openFile(folder, filename);
                });

                tabsContainer.appendChild(tab);
            });
        }

        function closeTab(key) {
            const index = CLOUD_STATE.openTabs.indexOf(key);
            if (index === -1) return;

            CLOUD_STATE.openTabs.splice(index, 1);
            if (CLOUD_STATE.activeFileKey === key) {
                const nextKey = CLOUD_STATE.openTabs[index] || CLOUD_STATE.openTabs[index - 1] || null;
                if (nextKey) {
                    const [folder, filename] = nextKey.split('/');
                    openFile(folder, filename);
                }
            }

            renderFileTabs();
        }

        // ==================== SAVE FUNCTIONALITY ====================

        async function saveCode() {
            if (!editor) return;

            if (!isUserLoggedIn) {
                const code = editor.getValue();
                localStorage.setItem("tc_code", code);
                setSaveStatus('local-saved', 'Saved Locally');
                Logger.success('Code saved to browser storage');
                return;
            }

            await forceSaveActiveFile();
        }

        function updateSaveIndicator() {
            if (!editor) return;

            if (!isUserLoggedIn) {
                const savedCode = localStorage.getItem("tc_code");
                const currentCode = editor.getValue();
                if (savedCode === currentCode && savedCode !== '') {
                    setSaveStatus('local-saved', 'Saved Locally');
                } else {
                    setSaveStatus('not-saved', 'Not Saved');
                }
                return;
            }

            if (CLOUD_STATE.isSaving) {
                setSaveStatus('saving', 'Saving...');
                return;
            }

            const currentCode = editor.getValue();
            if (!currentCode.trim()) {
                setSaveStatus('not-saved', 'Not Saved');
                return;
            }

            const activeMeta = CLOUD_STATE.files.get(CLOUD_STATE.activeFileKey || '');
            if (CLOUD_STATE.lastSavedHash || activeMeta?.file_hash) {
                setSaveStatus('saved', 'Saved');
            } else {
                setSaveStatus('not-saved', 'Not Saved');
            }
        }

