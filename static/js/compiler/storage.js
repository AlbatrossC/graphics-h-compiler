let isUserLoggedIn = false;
let currentUser = null;
let authConfig = null;
let isSaving = false;
let googleIdentityReady = false;
let googleIdentityInitPromise = null;

const SAVE_STATE = { lastSavedHash: null, pendingHash: null, lastSaveTime: 0 };
const DIRTY_FLAG = { isDirty: false };

const LOCAL_DRAFTS_KEY = 'compiler_cloud_drafts_v1';
const FOLDER_UI_STATE_KEY = 'compiler_folder_ui_state_v1';
const ROOT_FOLDER_KEY = 'root';
const DEFAULT_FILE_NAME = 'main.cpp';
const DEFAULT_FILE_KEY = `${ROOT_FOLDER_KEY}/${DEFAULT_FILE_NAME}`;
const DEFAULT_SOURCE = `#include <graphics.h>\n#include <conio.h>\n\nint main()\n{\n    int gd = DETECT, gm;\n    initgraph(&gd, &gm, "");\n\n    // Your code here\n\n    getch();\n    closegraph();\n    return 0;\n}\n`;

function folderKey(folderId) { return folderId || ROOT_FOLDER_KEY; }
function folderId(value) { return !value || value === ROOT_FOLDER_KEY ? null : value; }
function fileKey(folder, filename) { return `${folderKey(folder)}/${filename}`; }
function activeFileInfo() {
    const [folder, filename] = (CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY).split('/');
    return { folder, folderId: folderId(folder), filename, key: CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY };
}
function authStatusEl() { return document.getElementById('auth-status-text'); }
function setAuthStatus(text) { const el = authStatusEl(); if (el) el.textContent = text; }
function setDefaultFolderState() {
    CLOUD_STATE.folders = new Set([ROOT_FOLDER_KEY]);
    CLOUD_STATE.folderNameToId = new Map();
    CLOUD_STATE.folderIdToName = new Map();
    CLOUD_STATE.selectedFolderKey = CLOUD_STATE.selectedFolderKey || ROOT_FOLDER_KEY;
}
function getFolderName(idOrKey) { return !idOrKey || idOrKey === ROOT_FOLDER_KEY ? '' : (CLOUD_STATE.folderIdToName.get(idOrKey) || 'Folder'); }
function computeBytes(text) { return new TextEncoder().encode(text || '').byteLength; }
async function computeSha256(content) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// ==================== INDEXEDDB FILE STORAGE ====================
// Guest mode: primary storage. Logged-in: local cache mirror of cloud.
// Replaces localStorage for all file content persistence.

const FILE_DB_NAME = 'compiler_project_files_v1';
const FILE_DB_VERSION = 1;
const FILE_DB_STORE = 'files';

const FileDB = {
    _db: null,

    async open() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(FILE_DB_NAME, FILE_DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(FILE_DB_STORE)) {
                    db.createObjectStore(FILE_DB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async getAll() {
        try {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(FILE_DB_STORE, 'readonly');
                const r = tx.objectStore(FILE_DB_STORE).getAll();
                r.onsuccess = () => resolve(r.result || []);
                r.onerror = () => reject(r.error);
            });
        } catch (e) { Logger.warn('[FileDB] getAll: ' + e.message); return []; }
    },

    async get(id) {
        try {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(FILE_DB_STORE, 'readonly');
                const r = tx.objectStore(FILE_DB_STORE).get(id);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror = () => reject(r.error);
            });
        } catch (e) { Logger.warn('[FileDB] get: ' + e.message); return null; }
    },

    async put(record) {
        try {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(FILE_DB_STORE, 'readwrite');
                const r = tx.objectStore(FILE_DB_STORE).put(record);
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error);
            });
        } catch (e) { Logger.warn('[FileDB] put: ' + e.message); }
    },

    async delete(id) {
        try {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(FILE_DB_STORE, 'readwrite');
                const r = tx.objectStore(FILE_DB_STORE).delete(id);
                r.onsuccess = () => resolve();
                r.onerror = () => reject(r.error);
            });
        } catch (e) { Logger.warn('[FileDB] delete: ' + e.message); }
    },

    async clear() {
        try {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(FILE_DB_STORE, 'readwrite');
                const r = tx.objectStore(FILE_DB_STORE).clear();
                r.onsuccess = () => resolve();
                r.onerror = () => reject(r.error);
            });
        } catch (e) { Logger.warn('[FileDB] clear: ' + e.message); }
    }
};

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
function setExplorerLoading(isLoading, text = 'Loading files...') {
    const loading = document.getElementById('explorer-loading-state');
    const loadingText = document.getElementById('explorer-loading-text');
    const fileList = document.getElementById('main-folder-files');
    if (!loading || !fileList) return;
    if (loadingText) loadingText.textContent = text;
    loading.classList.toggle('hidden', !isLoading);
    fileList.classList.toggle('hidden', isLoading);
}
// ==================== DRAFT STORAGE (IndexedDB) ====================
// All file drafts go through FileDB (IndexedDB).
// Guest mode: this IS the primary storage.
// Logged-in: this is a local cache/draft mirror of cloud state.

async function setLocalDraft(folder, filename, content) {
    // File model: { id, name, content, lastSavedHash, lastModified, dirty, folderId, folderKey }
    await FileDB.put({
        id: fileKey(folder, filename),
        name: filename,
        content,
        lastSavedHash: SAVE_STATE.lastSavedHash || null,
        lastModified: Date.now(),
        dirty: true,
        folderId: folderId(folder),
        folderKey: folderKey(folder)
    });
}

// Non-blocking wrapper — safe to call from synchronous contexts (change listeners, etc.)
function setLocalDraftImmediate(folder, filename, content) {
    setLocalDraft(folder, filename, content).catch(() => { });
}

async function getLocalDraft(folder, filename) {
    const record = await FileDB.get(fileKey(folder, filename));
    return record ? record.content : null;
}

async function clearLocalDraft(folder, filename) {
    await FileDB.delete(fileKey(folder, filename));
}

async function clearAllLocalDrafts() {
    await FileDB.clear();
    localStorage.removeItem(LOCAL_DRAFTS_KEY); // Also clear legacy localStorage drafts
}
let folderUiStateCache = null;
function loadFolderUiState() {
    if (folderUiStateCache) return folderUiStateCache;
    try {
        const parsed = JSON.parse(localStorage.getItem(FOLDER_UI_STATE_KEY) || '{}');
        folderUiStateCache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        folderUiStateCache = {};
    }
    return folderUiStateCache;
}
function saveFolderUiState(state) {
    folderUiStateCache = state;
    localStorage.setItem(FOLDER_UI_STATE_KEY, JSON.stringify(state));
}
function isFolderCollapsed(folder) {
    const state = loadFolderUiState();
    return state[folder] === true;
}
function setFolderCollapsed(folder, collapsed) {
    const state = { ...loadFolderUiState(), [folder]: collapsed === true };
    saveFolderUiState(state);
}
function setSelectedFolder(key) { CLOUD_STATE.selectedFolderKey = key || ROOT_FOLDER_KEY; }
function isVisibleCloudFile(file) {
    const id = file?.folder_id;
    return id !== null && id !== undefined && id !== '';
}
function getVisibleCloudFiles() {
    return Array.from(CLOUD_STATE.files.values()).filter((file) => isVisibleCloudFile(file));
}
function getFirstVisibleCloudFile() {
    return getVisibleCloudFiles()[0] || null;
}
function remoteFileByName(targetFolderId, filename) {
    for (const file of CLOUD_STATE.files.values()) if ((file.folder_id || null) === (targetFolderId || null) && file.filename === filename) return file;
    return null;
}
function getMainCppFile() {
    for (const file of CLOUD_STATE.files.values()) {
        if (file.filename === 'main.cpp') return file;
    }
    return null;
}
function getFirstCloudFile() {
    return Array.from(CLOUD_STATE.files.values())[0] || null;
}
function getCloudFileById(fileId) {
    if (!fileId) return null;
    for (const file of CLOUD_STATE.files.values()) {
        if (file?.id === fileId) return file;
    }
    return null;
}
function buildStarterSource(filename) {
    const safeName = (filename || DEFAULT_FILE_NAME).trim() || DEFAULT_FILE_NAME;
    return `// ${safeName}\n#include <graphics.h>\n#include <conio.h>\n\nint main() {\n    int gd = DETECT, gm;\n    initgraph(&gd, &gm, "");\n    \n    // Your code here\n    \n    getch();\n    closegraph();\n    return 0;\n}\n`;
}
function findFolderIdByName(name) {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return null;
    for (const [id, folderName] of CLOUD_STATE.folderIdToName.entries()) {
        if (String(folderName || '').trim().toLowerCase() === target) return id;
    }
    return null;
}
async function ensureMainFolder() {
    const existing = findFolderIdByName('main');
    if (existing) return existing;
    const { response, payload } = await fetchJson('/api/folder/create', {
        method: 'POST',
        body: JSON.stringify({ folder_name: 'main' })
    });
    if (!response.ok) {
        if (response.status === 409) {
            await refreshCloudFiles(true);
            const refreshed = findFolderIdByName('main');
            if (refreshed) return refreshed;
        }
        throw new Error(payload?.error || 'Failed to create main folder');
    }
    CLOUD_STATE.folderIdToName.set(payload.id, payload.folder_name);
    CLOUD_STATE.folderNameToId.set(payload.folder_name, payload.id);
    CLOUD_STATE.folders.add(payload.id);
    return payload.id;
}
function userForUi(user) {
    return {
        email: user.email || '',
        display_name: user.name || user.email || 'Account',
        user_metadata: {
            full_name: user.name || user.email || 'Account',
            email: user.email || '',
            avatar_url: user.image || ''
        }
    };
}
function safeUpdateLoginUI(loggedIn, user = null) {
    if (typeof updateLoginUI === 'function') {
        updateLoginUI(loggedIn, user);
        return true;
    }
    isUserLoggedIn = loggedIn;
    currentUser = user;
    return false;
}
function updateSaveIndicator() {
    if (!saveIndicator || !saveText) return;
    if (!DIRTY_FLAG.isDirty && SAVE_STATE.lastSavedHash) {
        saveIndicator.classList.add('saved');
        saveText.textContent = isUserLoggedIn ? 'Saved to cloud' : 'Saved locally';
    } else {
        saveIndicator.classList.remove('saved');
        saveText.textContent = 'Unsaved';
    }
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
    if (fileKey(folder, filename) === (CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY)) item.classList.add('active');
    item.innerHTML = `
        <svg class="file-icon ${getFileIconClass(ext)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        <span class="file-name">${filename}</span>
        <div class="file-actions">
            <button class="file-action-btn file-download-btn" title="Download file" onclick="event.stopPropagation(); downloadFile('${folder}', '${filename}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
            <button class="file-action-btn file-delete-btn" title="Delete file" onclick="event.stopPropagation(); deleteFile('${folder}', '${filename}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path></svg></button>
        </div>`;
    item.addEventListener('click', () => {
        setSelectedFolder(folder);
        openFile(folder, filename);

        // Auto-close sidebar on mobile
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (sidebar && sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        }

        // Auto-switch back to the code editor tab on mobile
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
    if ((CLOUD_STATE.selectedFolderKey || ROOT_FOLDER_KEY) === folder) header.classList.add('selected');
    const fileCountLabel = `${files.length} file${files.length === 1 ? '' : 's'}`;
    header.innerHTML = `<span class="folder-group-title"><span class="folder-chevron" aria-hidden="true">▾</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg><span>${name}</span></span><span class="folder-file-count">${fileCountLabel}</span>`;
    header.addEventListener('click', () => {
        setSelectedFolder(folder);
        setFolderCollapsed(folder, !collapsed);
        renderFileExplorer();
    });
    if (folder !== ROOT_FOLDER_KEY) {
        const btn = document.createElement('button');
        btn.className = 'folder-action-btn';
        btn.title = `Delete folder ${name}`;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        btn.addEventListener('click', (event) => { event.stopPropagation(); deleteFolder(folder, name).catch((error) => alert(error.message)); });
        header.appendChild(btn);
    }
    group.appendChild(header);
    const wrap = document.createElement('div');
    wrap.className = 'folder-group-files';
    if (!files.length) {
        const empty = document.createElement('div');
        empty.className = 'folder-group-empty';
        empty.textContent = 'No files';
        wrap.appendChild(empty);
    } else files.forEach((file) => wrap.appendChild(createFileItem(folder, file.filename)));
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
    const ordered = Array.from(CLOUD_STATE.folderIdToName.keys()).sort((a, b) => getFolderName(a).localeCompare(getFolderName(b)));
    fileList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    ordered.forEach((key) => fragment.appendChild(createFolderGroup(key, getFolderName(key), filesByFolder.get(key) || [])));
    if (!fragment.childNodes.length) {
        const empty = document.createElement('div');
        empty.className = 'file-list-empty';
        empty.textContent = 'No files yet. Create a file to get started.';
        fragment.appendChild(empty);
    }
    fileList.appendChild(fragment);
    const visibleCount = getVisibleCloudFiles().length;
    if (filesCount) filesCount.textContent = `${visibleCount} file${visibleCount === 1 ? '' : 's'}`;
}
function highlightActiveFile() {
    const [folder, filename] = (CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY).split('/');
    document.querySelectorAll('.file-item').forEach((item) => item.classList.toggle('active', item.dataset.folder === folder && item.dataset.file === filename));
    document.querySelectorAll('.folder-group-header').forEach((header) => header.classList.toggle('selected', header.parentElement?.dataset.folder === (CLOUD_STATE.selectedFolderKey || ROOT_FOLDER_KEY)));
    const tab = document.getElementById('current-file-tab');
    const name = document.getElementById('current-file-name');
    if (tab) tab.dataset.file = filename;
    if (name) name.textContent = filename;
}
async function readJsonSafe(response) {
    if (!(response.headers.get('Content-Type') || '').includes('application/json')) return null;
    try { return await response.json(); } catch { return null; }
}
async function fetchJson(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    const fetchOptions = {
        credentials: 'same-origin',
        ...options,
        headers: { ...(options.headers || {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
    };
    if (method === 'GET' && !Object.prototype.hasOwnProperty.call(fetchOptions, 'cache')) {
        fetchOptions.cache = 'no-cache';
    }
    const response = await fetch(url, fetchOptions);
    return { response, payload: await readJsonSafe(response) };
}
function normalizeSessionUser(payload) {
    const directEmail = payload?.email || payload?.user_email || payload?.mail || '';
    const directName = payload?.display_name || payload?.displayName || payload?.name || '';
    if (payload?.authenticated) {
        const email = String(directEmail || '').trim();
        const name = String(directName || email || '').trim();
        if (email || name) {
            return { email, name: name || email, image: '' };
        }
    }
    const user = payload?.user || payload?.session?.user || payload?.data?.user;
    if (!user) return null;
    const email = String(user.email || user.user_email || user.mail || '').trim();
    const name = String(user.name || user.display_name || user.displayName || email || '').trim();
    const image = user.image || user.avatar_url || '';
    if (!email && !name) return null;
    return { email, name: name || email, image };
}
async function loadAuthConfig() {
    if (authConfig) return authConfig;
    const response = await fetch('/api/auth/config', { credentials: 'same-origin', cache: 'no-cache' });
    if (!response.ok) throw new Error('Failed to load auth config');
    authConfig = await response.json();
    return authConfig;
}
async function checkSession() {
    try {
        const { response, payload } = await fetchJson('/api/auth/session', { method: 'GET' });
        const user = response.ok ? normalizeSessionUser(payload) : null;
        if (!user) { safeUpdateLoginUI(false); setAuthStatus('Unlimited projects · Access anywhere'); return false; }
        safeUpdateLoginUI(true, userForUi(user));
        setAuthStatus(`Signed in as ${user.email}`);
        return true;
    } catch (error) {
        Logger.warn(`[Auth] ${error.message}`);
        safeUpdateLoginUI(false);
        setAuthStatus('Sign in is temporarily unavailable');
        return false;
    }
}
// ==================== LOGIN SYNC LOGIC ====================
// Runs when a guest user signs in. Merges local IndexedDB files into cloud.
// Never overwrites user data silently. Applies spec Cases A, B, C.
// Returns the freshest cloud payload when available so caller can avoid a second /api/files request.
async function syncLocalToCloud() {
    // Only look at the guest main.cpp (root/main.cpp)
    const localMainCpp = await FileDB.get('root/main.cpp');
    if (!localMainCpp || !localMainCpp.content || !localMainCpp.content.trim()) return null;
    const localContent = localMainCpp.content;

    // Fetch current cloud file list
    const { response, payload } = await fetchJson('/api/files', { method: 'GET' });
    if (!response.ok) return null; // Can't reach cloud, skip sync gracefully

    const snapshot = {
        folders: Array.isArray(payload?.folders) ? payload.folders : [],
        files: Array.isArray(payload?.files) ? payload.files.slice() : [],
    };
    const cloudMainCpp = snapshot.files.find(f => (f.file_name || f.filename) === 'main.cpp');
    const existingLocalMainCopy = snapshot.files.find(f => (f.file_name || f.filename) === 'local-main.cpp');

    if (!cloudMainCpp) {
        // CASE A: Cloud has no main.cpp — upload local copy
        Logger.info('[Sync] Case A: Cloud empty, uploading local main.cpp');
        const { response: saveResponse, payload: savePayload } = await fetchJson('/api/file/save', {
            method: 'POST',
            body: JSON.stringify({ file_name: 'main.cpp', folder_id: null, content: localContent })
        });
        if (!saveResponse.ok) {
            Logger.warn('[Sync] Case A upload failed');
        } else {
            snapshot.files.push({
                id: savePayload?.file_id || null,
                file_name: 'main.cpp',
                file_content: localContent,
                folder_id: null,
                folder_name: '',
                file_size: savePayload?.file_size ?? computeBytes(localContent),
                content_hash: savePayload?.content_hash || null
            });
        }
    } else {
        const cloudContent = cloudMainCpp.file_content || cloudMainCpp.content || '';
        const localHash = await computeSha256(localContent);
        const cloudHash = await computeSha256(cloudContent);

        if (localHash === cloudHash) {
            // CASE B: Identical — use cloud version only, discard local duplicate
            Logger.info('[Sync] Case B: Local and cloud identical, using cloud');
            // Nothing to upload — cloud already has it
        } else {
            const existingLocalMainHash = existingLocalMainCopy?.content_hash
                || (existingLocalMainCopy ? await computeSha256(existingLocalMainCopy.file_content || existingLocalMainCopy.content || '') : null);
            if (existingLocalMainHash && existingLocalMainHash === localHash) {
                Logger.info('[Sync] Case C: local-main.cpp already up to date, skipping upload');
                await FileDB.clear();
                return snapshot;
            }

            // CASE C: Content differs — rename local to "local-main.cpp" and upload
            // Cloud main.cpp is kept unchanged
            Logger.info('[Sync] Case C: Content differs, uploading local as local-main.cpp');
            const { response: saveResponse, payload: savePayload } = await fetchJson('/api/file/save', {
                method: 'POST',
                body: JSON.stringify({ file_name: 'local-main.cpp', folder_id: null, content: localContent })
            });
            if (!saveResponse.ok) {
                Logger.warn('[Sync] Case C upload failed');
            } else {
                const existingLocalMain = snapshot.files.find(f => (f.file_name || f.filename) === 'local-main.cpp');
                if (existingLocalMain) {
                    existingLocalMain.file_content = localContent;
                    existingLocalMain.file_size = savePayload?.file_size ?? computeBytes(localContent);
                    existingLocalMain.content_hash = savePayload?.content_hash || existingLocalMain.content_hash || null;
                } else {
                    snapshot.files.push({
                        id: savePayload?.file_id || null,
                        file_name: 'local-main.cpp',
                        file_content: localContent,
                        folder_id: null,
                        folder_name: '',
                        file_size: savePayload?.file_size ?? computeBytes(localContent),
                        content_hash: savePayload?.content_hash || null
                    });
                }
            }
        }
    }
    // After sync: clear local IndexedDB (cloud files will be downloaded as the new cache)
    await FileDB.clear();
    return snapshot;
}

async function handleGoogleCredentialResponse(credentialResponse) {
    const idToken = credentialResponse?.credential;
    if (!idToken) throw new Error('Google did not return an ID token');

    const { response, payload } = await fetchJson('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ id_token: idToken }),
    });

    if (!response.ok) throw new Error(payload?.error || 'Sign in failed');

    const user = normalizeSessionUser(payload) || {
        email: payload?.email || '',
        name: payload?.display_name || 'User',
        image: '',
    };

    safeUpdateLoginUI(true, userForUi(user));
    setAuthStatus(`Signed in as ${user.email}`);
    // Show loading spinner immediately — no blank gap before files appear
    setExplorerLoading(true, 'Syncing...');
    showProgress();

    try {
        // Sync local IndexedDB files to cloud (Cases A / B / C — no silent overwrites)
        let syncedPayload = null;
        try { syncedPayload = await syncLocalToCloud(); } catch (e) { Logger.warn('[Sync] Login sync error: ' + e.message); }

        // Download cloud project (or reuse already-fetched snapshot from sync to avoid duplicate /api/files call)
        if (syncedPayload) {
            updateCloudStateFromPayload(syncedPayload);
            renderFileExplorer();
        } else {
            await refreshCloudFiles(true);
        }

        // Rebuild IndexedDB cache in parallel (non-blocking — don't delay file open)
        Promise.all(
            Array.from(CLOUD_STATE.files.entries()).map(([key, file]) =>
                FileDB.put({
                    id: key,
                    name: file.filename,
                    content: file.content || '',
                    lastSavedHash: file.content_hash || null,
                    lastModified: Date.now(),
                    dirty: false,
                    folderId: file.folder_id,
                    folderKey: file.folder_key
                }).catch(() => { })
            )
        ).catch(() => { });

        // Open backend last-opened first, then main.cpp, then first cloud file.
        const active =
            getCloudFileById(CLOUD_STATE.lastOpenedFileId) ||
            getMainCppFile() ||
            getFirstCloudFile();
        if (active) await openFile(active.folder_key, active.filename, { skipSave: true });
    } finally {
        setExplorerLoading(false);
        hideProgress();
    }
}

function waitForGoogleIdentityScript() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const interval = setInterval(() => {
            if (window.google?.accounts?.id) {
                clearInterval(interval);
                resolve();
                return;
            }
            attempts += 1;
            if (attempts >= 100) {
                clearInterval(interval);
                reject(new Error('Google Identity Services failed to load'));
            }
        }, 100);
    });
}

async function initGoogleIdentity(clientId) {
    if (!clientId) return;
    if (googleIdentityInitPromise) return googleIdentityInitPromise;

    googleIdentityInitPromise = (async () => {
        await waitForGoogleIdentityScript();
        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => {
                handleGoogleCredentialResponse(response).catch((error) => {
                    Logger.error(`[Auth] ${error.message}`);
                    setAuthStatus('Sign in failed. Try again.');
                    alert(`Sign in failed: ${error.message}`);
                });
            },
            auto_select: false,
            cancel_on_tap_outside: true,
        });

        const renderTarget = document.getElementById('google-btn-render');
        if (renderTarget) {
            window.google.accounts.id.renderButton(renderTarget, {
                theme: 'outline',
                size: 'large',
                shape: 'pill',
                text: 'signin_with',
                width: 240,
            });
        }

        googleIdentityReady = true;
    })();

    return googleIdentityInitPromise;
}
async function signInWithGoogle() {
    try {
        const config = await loadAuthConfig();
        if (!config.authEnabled) { alert('Authentication is not configured on the server.'); return; }
        await initGoogleIdentity(config.googleClientId);
        if (!googleIdentityReady || !window.google?.accounts?.id) throw new Error('Google sign-in is unavailable');
        setAuthStatus('Waiting for Google sign-in...');
        window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                Logger.warn('[Auth] One Tap suppressed, using rendered button instead');
            }
        });
    } catch (error) {
        Logger.error(`[Auth] ${error.message}`);
        setAuthStatus('Sign in failed. Try again.');
        alert(`Sign in failed: ${error.message}`);
    }
}
async function signOut() {
    // Capture content before any state changes
    const currentCode = editor ? editor.getValue() : null;

    // Only save to cloud if there are unsaved changes (skip unnecessary API call)
    if (isUserLoggedIn && DIRTY_FLAG.isDirty) {
        try { await forceSaveActiveFile('signOut', { force: false, silent: true }); } catch { }
    }

    // Update UI immediately — user sees logged-out state right away
    safeUpdateLoginUI(false);
    setAuthStatus('Unlimited projects · Access anywhere');
    if (currentCode !== null) {
        SAVE_STATE.lastSavedHash = await computeSha256(currentCode);
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();
    }

    // Cleanup runs in background — doesn't block UI
    (async () => {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { }
        await clearAllLocalDrafts().catch(() => { });
        if (currentCode !== null) {
            await setLocalDraft('root', 'main.cpp', currentCode).catch(() => { });
        }
    })();
}
async function ensureDefaultRemoteFile() {
    if (remoteFileByName(null, DEFAULT_FILE_NAME)) return;
    const { response, payload } = await fetchJson('/api/file/save', {
        method: 'POST',
        body: JSON.stringify({
            file_name: DEFAULT_FILE_NAME,
            folder_id: null,
            content: DEFAULT_SOURCE,
        }),
    });
    if (!response.ok) throw new Error(payload?.error || 'Unable to initialize default file');
}
function updateCloudStateFromPayload(payload) {
    setDefaultFolderState();
    CLOUD_STATE.lastOpenedFileId = payload?.last_opened_file_id || payload?.data?.last_opened_file_id || null;
    CLOUD_STATE.files.clear();
    const folders = Array.isArray(payload?.folders)
        ? payload.folders
        : (Array.isArray(payload?.data?.folders) ? payload.data.folders : []);
    const files = Array.isArray(payload?.files)
        ? payload.files
        : (Array.isArray(payload?.data?.files) ? payload.data.files : []);
    folders.forEach((folder) => {
        if (!folder?.id || !folder?.folder_name) return;
        CLOUD_STATE.folders.add(folder.id);
        CLOUD_STATE.folderIdToName.set(folder.id, folder.folder_name);
        CLOUD_STATE.folderNameToId.set(folder.folder_name, folder.id);
    });
    files.forEach((file) => {
        const name = file.file_name || file.filename;
        if (!name) return;
        const id = file.folder_id || file.folderId || null;
        const key = folderKey(id);
        const content = file.file_content ?? file.content ?? '';
        CLOUD_STATE.files.set(fileKey(key, name), {
            id: file.id || file.file_id || fileKey(key, name),
            filename: name,
            folder_id: id,
            folder_key: key,
            folder_name: file.folder_name || file.folderName || getFolderName(id),
            content,
            file_size: file.file_size ?? computeBytes(content),
            content_hash: file.content_hash || null
        });
    });
    if (!CLOUD_STATE.folderIdToName.has(CLOUD_STATE.selectedFolderKey)) {
        const firstFolder = Array.from(CLOUD_STATE.folderIdToName.keys())[0] || ROOT_FOLDER_KEY;
        CLOUD_STATE.selectedFolderKey = firstFolder;
    }
}
async function refreshCloudFiles(force = false, isRetry = false) {
    if (!isUserLoggedIn) return;
    const lastRefresh = CLOUD_STATE.lastRefresh || 0;
    if (!force && Date.now() - lastRefresh < 2000) { renderFileExplorer(); return; }
    CLOUD_STATE.lastRefresh = Date.now();
    showProgress();
    setExplorerLoading(true, isRetry ? 'Syncing files...' : 'Loading files...');
    try {
        const { response, payload } = await fetchJson('/api/files', { method: 'GET' });
        if (response.status === 401) { safeUpdateLoginUI(false); setAuthStatus('Session expired. Please sign in again.'); return; }
        if (!response.ok) throw new Error(payload?.error || 'Failed to load files');
        updateCloudStateFromPayload(payload);
        if (!getVisibleCloudFiles().length && !isRetry) {
            await ensureDefaultRemoteFile();
            return refreshCloudFiles(true, true);
        }
        renderFileExplorer();
    } catch (error) {
        Logger.warn(`[Files] ${error.message}`);
        alert(`Unable to load cloud files: ${error.message}`);
    } finally {
        setExplorerLoading(false);
        hideProgress();
    }
}
async function openFile(folder, filename, options = {}) {
    // FILE SWITCH SAVE: save current file before switching
    if (!options.skipSave) await forceSaveActiveFile('fileSwitch', { force: false, silent: true });
    const key = fileKey(folder, filename);
    CLOUD_STATE.activeFileKey = key;
    setSelectedFolder(folder);
    // Try in-memory cloud state first, then IndexedDB cache (async)
    let content = CLOUD_STATE.files.get(key)?.content ?? null;
    if (content === null) content = await getLocalDraft(folder, filename);
    if (content === null) content = '';
    if (editor) { editor.setValue(content); editor.clearSelection(); }
    SAVE_STATE.lastSavedHash = await computeSha256(content);
    SAVE_STATE.lastSaveTime = Date.now();
    DIRTY_FLAG.isDirty = false;
    updateSaveIndicator();
    highlightActiveFile();
    if (!isUserLoggedIn) saveLastOpenedFile(key);
    if (isUserLoggedIn && !options.skipSave) {
        const opened = CLOUD_STATE.files.get(key);
        if (opened?.id && opened.id !== CLOUD_STATE.lastOpenedFileId) {
            fetchJson('/api/file/save', {
                method: 'POST',
                body: JSON.stringify({
                    folder_id: opened.folder_id ?? null,
                    file_name: opened.filename,
                    content
                })
            })
                .then(({ response, payload }) => {
                    if (response.ok) {
                        CLOUD_STATE.lastOpenedFileId = payload?.file_id || opened.id;
                    }
                })
                .catch(() => { });
        }
    }
}
async function persistLocalSave(code) {
    // Guest save: IndexedDB is primary storage (not localStorage)
    const info = activeFileInfo();
    const hash = await computeSha256(code);
    // Write file record with clean state (dirty=false, lastSavedHash set)
    await FileDB.put({
        id: info.key,
        name: info.filename,
        content: code,
        lastSavedHash: hash,
        lastModified: Date.now(),
        dirty: false,
        folderId: info.folderId,
        folderKey: info.folder
    });
    SAVE_STATE.lastSavedHash = hash;
    SAVE_STATE.lastSaveTime = Date.now();
    DIRTY_FLAG.isDirty = false;
    updateSaveIndicator();
}
async function forceSaveActiveFile(trigger = 'manual', options = {}) {
    const force = options.force === true;
    const silent = options.silent === true;
    if (!editor || isSaving) return { skipped: true };
    const skipProgress = trigger === 'compileRun';
    if (!skipProgress) showProgress();
    try {
        const code = editor.getValue();
        if (!isUserLoggedIn) {
            await persistLocalSave(code);
            if (!silent) Logger.success(`[Save] Saved locally (${trigger})`);
            return { success: true, local: true };
        }
        let info = activeFileInfo();
        if (!info.folderId && CLOUD_STATE.folderIdToName.size === 0) {
            const mainFolderId = await ensureMainFolder();
            const mainFolderKey = folderKey(mainFolderId);
            const key = fileKey(mainFolderKey, info.filename);
            info = { ...info, folder: mainFolderKey, folderId: mainFolderId, key };
            CLOUD_STATE.activeFileKey = key;
            setSelectedFolder(mainFolderKey);
        }
        const hash = await computeSha256(code);
        if (!force && SAVE_STATE.lastSavedHash === hash) {
            DIRTY_FLAG.isDirty = false;
            updateSaveIndicator();
            if (!silent) Logger.info(`[Save] Skipped (${trigger}) - unchanged`);
            return { skipped: true, unchanged: true };
        }
        isSaving = true;
        SAVE_STATE.pendingHash = hash;
        try {
            const { response, payload } = await fetchJson('/api/file/save', { method: 'POST', body: JSON.stringify({ folder_id: info.folderId, file_name: info.filename, content: code }) });
            if (response.status === 401) { safeUpdateLoginUI(false); setAuthStatus('Session expired. Please sign in again.'); throw new Error('Session expired'); }
            if (!response.ok) throw new Error(payload?.error || 'Failed to save file');
            CLOUD_STATE.files.set(info.key, { id: payload?.file_id || info.key, filename: info.filename, folder_id: info.folderId, folder_key: info.folder, folder_name: getFolderName(info.folderId), content: code, file_size: payload?.file_size ?? computeBytes(code), content_hash: payload?.content_hash || hash });
            const confirmedHash = payload?.content_hash || hash;
            // Update IndexedDB cache after successful cloud save (non-blocking, logged-in only)
            FileDB.put({
                id: info.key,
                name: info.filename,
                content: code,
                lastSavedHash: confirmedHash,
                lastModified: Date.now(),
                dirty: false,
                folderId: info.folderId,
                folderKey: info.folder
            }).catch(() => { });
            localStorage.setItem('tc_code', code); // Keep as emergency backup for compile flow
            SAVE_STATE.lastSavedHash = confirmedHash;
            SAVE_STATE.lastSaveTime = Date.now();
            DIRTY_FLAG.isDirty = false;
            updateSaveIndicator();
            renderFileExplorer();
            if (!silent) Logger.success(`[Save] Saved (${trigger})`);
            return { success: true, changed: payload?.changed !== false };
        } finally { isSaving = false; SAVE_STATE.pendingHash = null; }
    } finally {
        if (!skipProgress) hideProgress();
    }
}
async function saveCode() {
    const saveBtn = document.getElementById('save-btn');
    const btnText = saveBtn?.querySelector('.btn-text');
    const originalText = btnText?.textContent || 'Save';
    if (btnText) btnText.textContent = 'Saving...';
    try { await forceSaveActiveFile('manual', { force: true, silent: false }); if (btnText) btnText.textContent = 'Saved'; }
    catch (error) { if (btnText) btnText.textContent = 'Error'; Logger.error(`[Save] ${error.message}`); }
    finally { setTimeout(() => { if (btnText) btnText.textContent = originalText; }, 1200); }
}
async function createNewFolder(folderName) {
    if (!isUserLoggedIn) return alert('Sign in to create cloud folders.');
    const cleanName = (folderName || '').trim();
    if (!cleanName) return;
    showProgress();
    try {
        const { response, payload } = await fetchJson('/api/folder/create', { method: 'POST', body: JSON.stringify({ folder_name: cleanName }) });
        if (!response.ok) throw new Error(payload?.error || 'Failed to create folder');
        CLOUD_STATE.folderIdToName.set(payload.id, payload.folder_name);
        CLOUD_STATE.folderNameToId.set(payload.folder_name, payload.id);
        CLOUD_STATE.folders.add(payload.id);
        setSelectedFolder(payload.id);
        renderFileExplorer();
        return payload.id;
    } finally {
        hideProgress();
    }
}
async function createNewFile(filename) {
    if (!isUserLoggedIn) return alert('Sign in to create cloud files.');
    showProgress();
    try {
        let cleanName = (filename || '').trim();
        if (!cleanName) return;
        if (!cleanName.includes('.')) cleanName += '.cpp';
        cleanName = cleanName.replace(/[^a-zA-Z0-9._-]/g, '');
        if (!cleanName || cleanName === '.cpp') return alert('Invalid file name');
        let targetFolderId = folderId(CLOUD_STATE.selectedFolderKey) || activeFileInfo().folderId;
        if (!targetFolderId) targetFolderId = Array.from(CLOUD_STATE.folderIdToName.keys())[0] || null;
        if (!targetFolderId) {
            targetFolderId = await ensureMainFolder();
            setSelectedFolder(folderKey(targetFolderId));
        }
        if (remoteFileByName(targetFolderId, cleanName)) return alert(`File "${cleanName}" already exists`);
        const starter = buildStarterSource(cleanName);
        const { response: saveResponse, payload: savePayload } = await fetchJson('/api/file/save', {
            method: 'POST',
            body: JSON.stringify({ folder_id: targetFolderId, file_name: cleanName, content: starter })
        });
        if (!saveResponse.ok) {
            if (saveResponse.status === 409) {
                await refreshCloudFiles(true);
                const existing = remoteFileByName(targetFolderId, cleanName);
                if (existing) {
                    await openFile(existing.folder_key, existing.filename, { skipSave: true });
                    return;
                }
            }
            throw new Error(savePayload?.error || 'Failed to save starter code');
        }
        const key = folderKey(targetFolderId);
        CLOUD_STATE.files.set(fileKey(key, cleanName), {
            id: savePayload?.file_id || fileKey(key, cleanName),
            filename: cleanName,
            folder_id: targetFolderId || null,
            folder_key: key,
            folder_name: getFolderName(targetFolderId),
            content: starter,
            file_size: savePayload?.file_size ?? computeBytes(starter),
            content_hash: savePayload?.content_hash || null
        });
        await setLocalDraft(key, cleanName, starter);
        renderFileExplorer();
        await openFile(key, cleanName, { skipSave: true });
    } finally {
        hideProgress();
    }
}
async function deleteFolder(folder, name) {
    const id = folderId(folder);
    if (!id) return;
    if (!confirm(`Delete folder "${name}" and all files inside it?\nThis cannot be undone.`)) return;
    showProgress();
    try {
        const deletingActiveFolder = CLOUD_STATE.files.get(CLOUD_STATE.activeFileKey || '')?.folder_id === id;
        const { response, payload } = await fetchJson('/api/folder/delete', { method: 'DELETE', body: JSON.stringify({ folder_id: id }) });
        if (!response.ok) throw new Error(payload?.error || 'Failed to delete folder');
        for (const [key, file] of CLOUD_STATE.files.entries()) if (file.folder_id === id) { CLOUD_STATE.files.delete(key); await clearLocalDraft(file.folder_key, file.filename); }
        CLOUD_STATE.folderIdToName.delete(id);
        CLOUD_STATE.folders.delete(id);
        setSelectedFolder(Array.from(CLOUD_STATE.folderIdToName.keys())[0] || ROOT_FOLDER_KEY);
        renderFileExplorer();
        if (deletingActiveFolder) {
            const nextFile = getFirstVisibleCloudFile();
            if (nextFile) await openFile(nextFile.folder_key, nextFile.filename, { skipSave: true });
        }
    } finally {
        hideProgress();
    }
}
async function deleteFile(folder, filename) {
    if (filename === 'main.cpp') {
        alert("main.cpp is the primary file and cannot be deleted.");
        return;
    }
    if (!confirm(`Delete "${filename}"?\nThis cannot be undone.`)) return;
    showProgress();
    try {
        const key = fileKey(folder, filename);
        const file = CLOUD_STATE.files.get(key);
        if (!file) return;
        const { response, payload } = await fetchJson('/api/file/delete', { method: 'DELETE', body: JSON.stringify({ file_id: file.id }) });
        if (!response.ok) throw new Error(payload?.error || 'Failed to delete file');
        CLOUD_STATE.files.delete(key);
        await clearLocalDraft(folder, filename);
        if (CLOUD_STATE.activeFileKey === key) {
            const nextFile = getFirstVisibleCloudFile();
            if (nextFile) await openFile(nextFile.folder_key, nextFile.filename, { skipSave: true });
            else if (editor) { editor.setValue(DEFAULT_SOURCE); DIRTY_FLAG.isDirty = false; updateSaveIndicator(); }
        } else renderFileExplorer();
    } finally {
        hideProgress();
    }
}
const LAST_OPENED_FILE_KEY = 'compiler_last_opened_v1';
function saveLastOpenedFile(key) {
    if (key) localStorage.setItem(LAST_OPENED_FILE_KEY, key);
}
function getLastOpenedFile() {
    return localStorage.getItem(LAST_OPENED_FILE_KEY);
}

async function downloadFile(folder, filename) {
    const key = fileKey(folder, filename);
    let content;
    if (key === CLOUD_STATE.activeFileKey && editor) {
        content = editor.getValue();
    } else {
        content = CLOUD_STATE.files.get(key)?.content ?? await getLocalDraft(folder, filename) ?? '';
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
function scheduleAutosave() {
    // Resets the 20-second idle timer on every edit.
    // Fires for BOTH guest and logged-in users.
    // Does NOT restart after saving — only restarts when user edits again.
    if (CLOUD_STATE.autosaveTimer) clearTimeout(CLOUD_STATE.autosaveTimer);
    CLOUD_STATE.autosaveTimer = setTimeout(async () => {
        CLOUD_STATE.autosaveTimer = null;
        if (!DIRTY_FLAG.isDirty) return; // Nothing changed, skip write
        try {
            if (isUserLoggedIn) {
                // NORMAL SAVE: only saves dirty files, skips if hash unchanged
                await forceSaveActiveFile('idle', { force: false, silent: true });
            } else {
                // Guest: save to IndexedDB (primary storage)
                if (editor) await persistLocalSave(editor.getValue());
            }
        } catch (error) { Logger.warn(`[Autosave] ${error.message}`); }
        // Timer stays null — will only restart when user types again
    }, AUTOSAVE_DELAY_MS); // 20 seconds idle
}
function cancelPendingAutosave() { if (CLOUD_STATE.autosaveTimer) { clearTimeout(CLOUD_STATE.autosaveTimer); CLOUD_STATE.autosaveTimer = null; } }
async function initAuth() {
    try {
        const config = await loadAuthConfig();
        if (!config.storageEnabled) setAuthStatus('Cloud storage is not configured');
        if (config.authEnabled && config.googleClientId) {
            initGoogleIdentity(config.googleClientId).catch((error) => {
                Logger.warn(`[Auth] ${error.message}`);
                setAuthStatus('Google sign-in is unavailable');
            });
        }
        const loggedIn = await checkSession();
        if (loggedIn) {
            await refreshCloudFiles(true);
            // Priority: backend last_opened_file_id -> main.cpp -> first cloud file
            const active =
                getCloudFileById(CLOUD_STATE.lastOpenedFileId) ||
                getMainCppFile() ||
                getFirstCloudFile();
            if (active) await openFile(active.folder_key, active.filename, { skipSave: true });
        }
    } catch (error) {
        Logger.warn(`[Auth] ${error.message}`);
        safeUpdateLoginUI(false);
        setAuthStatus('Unlimited projects · Access anywhere');
    }
}

const googleSigninBtn = document.getElementById('google-signin-btn');
if (googleSigninBtn) googleSigninBtn.addEventListener('click', signInWithGoogle);
const storageNewFolderBtn = document.getElementById('new-folder-btn');
if (storageNewFolderBtn) storageNewFolderBtn.addEventListener('click', async () => {
    const name = prompt('Enter a folder name:');
    if (!name || !name.trim()) return;
    try { await createNewFolder(name.trim()); } catch (error) { Logger.warn(`[Folder] ${error.message}`); alert(error.message); }
});

function startAuthInit() {
    initAuth().catch((error) => {
        Logger.warn(`[Auth] ${error.message}`);
        safeUpdateLoginUI(false);
        setAuthStatus('Unlimited projects · Access anywhere');
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAuthInit, { once: true });
} else {
    startAuthInit();
}
