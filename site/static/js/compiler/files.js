// Route /api/* calls to the API worker (not the static Pages host)
function apiUrl(path) {
    if (path.startsWith('/api/') && window.API_URL) {
        return window.API_URL + path;
    }
    return path;
}

let isUserLoggedIn = false;
let currentUser = null;
let authConfig = null;
let isSaving = false;
let googleIdentityReady = false;
let googleIdentityInitPromise = null;

const SAVE_STATE = { lastSavedHash: null, pendingHash: null, lastSaveTime: 0 };
const DIRTY_FLAG = { isDirty: false };

const LEGACY_LOCAL_DRAFTS_KEY = 'compiler_cloud_drafts_v1';
const FOLDER_UI_STATE_KEY = 'compiler_folder_ui_state_v1';
const ROOT_FOLDER_KEY = 'root';
const DEFAULT_FILE_NAME = 'main.cpp';
const DEFAULT_FILE_KEY = `${ROOT_FOLDER_KEY}/${DEFAULT_FILE_NAME}`;
const DEFAULT_SOURCE = `#include <graphics.h>\n#include <conio.h>\n\nint main()\n{\n    int gd = DETECT, gm;\n    initgraph(&gd, &gm, "");\n\n    // Your code here\n\n    getch();\n    closegraph();\n    return 0;\n}\n`;
const DEMO_HASHES = new Set([
    '8392b1554b6b9643fdedfeb898f177333b7b04f8565de621b57abb383d51b964', // bouncing_ball.cpp
    'a7bf3145a7ef0b22a466143545d4622d9fc16fc94a923f3b140658b70135f3fc', // circle_pattern.cpp
    '617e8525ac300822d4410e0b53d40fa201afde96548fa73b0597d77395c46dab', // graphics_demo.cpp
    '20c59b432fd12667ff76b11202cb1ef97c6cd24690b0dc1d42ff35c6cdd519a4', // shooter_game.cpp
    '989948aff97363700ec404db511d7564a01a3caa94b48ad827d9d5f818ebe6ad', // DEFAULT_SOURCE unmodified template
]);

function folderKey(folderId) { return folderId || ROOT_FOLDER_KEY; }
function folderId(value) { return !value || value === ROOT_FOLDER_KEY ? null : value; }
function fileKey(folder, filename) { return `${folderKey(folder)}/${filename}`; }
function activeFileInfo() {
    const [folder, filename] = (CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY).split('/');
    return { folder, folderId: folderId(folder), filename, key: CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY };
}
function authStatusEl() { return document.getElementById('auth-status-text'); }
function setAuthStatus(text) {
    const el = authStatusEl();
    if (!el) return;
    if (text === 'Unlimited projects · Access anywhere' || text === 'Unlimited projects · Cloud synced' || text === '') {
        el.textContent = '';
        el.style.display = 'none';
    } else {
        el.textContent = text;
        el.style.display = 'block';
    }
}
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
            // Timeout guard: iOS Safari (private mode) and some Android browsers
            // silently hang on indexedDB.open() — neither onsuccess nor onerror fires.
            // After 3 seconds we reject so callers fall back gracefully (return null)
            // instead of freezing the loading screen forever.
            const timeoutId = setTimeout(() => {
                reject(new Error('IndexedDB open timed out — storage may be unavailable'));
            }, 3000);

            let req;
            try {
                req = indexedDB.open(FILE_DB_NAME, FILE_DB_VERSION);
            } catch (e) {
                clearTimeout(timeoutId);
                reject(e);
                return;
            }

            req.onupgradeneeded = (e) => {
                // Don't clear the timeout here — onsuccess fires right after
                const db = e.target.result;
                if (!db.objectStoreNames.contains(FILE_DB_STORE)) {
                    db.createObjectStore(FILE_DB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                clearTimeout(timeoutId);
                this._db = e.target.result;
                resolve(this._db);
            };
            req.onerror = (e) => {
                clearTimeout(timeoutId);
                reject(e.target.error);
            };
            req.onblocked = () => {
                clearTimeout(timeoutId);
                reject(new Error('IndexedDB open blocked by another connection'));
            };
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
    localStorage.removeItem(LEGACY_LOCAL_DRAFTS_KEY); // Also clear legacy localStorage drafts
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
        avatar_url: user.image || '',
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
async function readJsonSafe(response) {
    const contentType = response.headers.get('Content-Type') || '';
    let rawText = '';
    try {
        rawText = await response.text();
    } catch {
        return { payload: null, rawText: '', contentType };
    }

    if (!rawText) {
        return { payload: null, rawText: '', contentType };
    }

    const trimmed = rawText.trim();
    const looksJson = contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[');
    if (!looksJson) {
        return { payload: null, rawText, contentType };
    }

    try {
        return { payload: JSON.parse(rawText), rawText, contentType };
    } catch {
        return { payload: null, rawText, contentType };
    }
}
async function fetchJson(url, options = {}) {
    const resolvedUrl = apiUrl(url);
    const method = String(options.method || 'GET').toUpperCase();
    const fetchOptions = {
        credentials: resolvedUrl.startsWith('http') ? 'include' : 'same-origin',
        ...options,
        headers: { ...(options.headers || {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
    };
    if (method === 'GET' && !Object.prototype.hasOwnProperty.call(fetchOptions, 'cache')) {
        fetchOptions.cache = 'no-cache';
    }
    const response = await fetch(resolvedUrl, fetchOptions);
    const { payload, rawText, contentType } = await readJsonSafe(response.clone());
    return { response, payload, rawText, contentType };
}
function normalizeSessionUser(payload) {
    const directEmail = payload?.email || payload?.user_email || payload?.mail || '';
    const directName = payload?.display_name || payload?.displayName || payload?.name || '';
    const directAvatar = payload?.avatar_url || payload?.picture || '';
    if (payload?.authenticated) {
        const email = String(directEmail || '').trim();
        const name = String(directName || email || '').trim();
        const image = String(directAvatar || '').trim();
        if (email || name) {
            return { email, name: name || email, image };
        }
    }
    const user = payload?.user || payload?.session?.user || payload?.data?.user;
    if (!user) return null;
    const email = String(user.email || user.user_email || user.mail || '').trim();
    const name = String(user.name || user.display_name || user.displayName || email || '').trim();
    const image = user.image || user.avatar_url || user.picture || '';
    if (!email && !name) return null;
    return { email, name: name || email, image };
}
async function loadAuthConfig() {
    if (authConfig) return authConfig;
    const response = await fetch(apiUrl('/api/auth/config'), { credentials: 'include', cache: 'no-cache' });
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
function toCloudSnapshot(payload) {
    return {
        last_opened_file_id: payload?.last_opened_file_id || payload?.data?.last_opened_file_id || null,
        folders: Array.isArray(payload?.folders) ? payload.folders : (Array.isArray(payload?.data?.folders) ? payload.data.folders : []),
        files: Array.isArray(payload?.files) ? payload.files.slice() : (Array.isArray(payload?.data?.files) ? payload.data.files.slice() : []),
    };
}
async function fetchCloudSnapshot() {
    const { response, payload } = await fetchJson('/api/files', { method: 'GET' });
    if (!response.ok) throw new Error(payload?.error || 'Failed to load files');
    return toCloudSnapshot(payload);
}
async function guestCodeModified() {
    const code = editor ? editor.getValue() : '';
    const hash = await computeSha256(code);
    return !DEMO_HASHES.has(hash);
}
function findMainFolderIdInSnapshot(snapshot) {
    const folders = Array.isArray(snapshot?.folders) ? snapshot.folders : [];
    const mainFolder = folders.find((folder) => String(folder?.folder_name || '').trim().toLowerCase() === 'main');
    return mainFolder?.id || null;
}
async function ensureMainFolderIdForSnapshot(snapshot) {
    const existing = findMainFolderIdInSnapshot(snapshot);
    if (existing) return existing;
    const { response, payload } = await fetchJson('/api/folder/create', {
        method: 'POST',
        body: JSON.stringify({ folder_name: 'main' })
    });
    if (!response.ok) {
        if (response.status === 409) {
            const refreshedSnapshot = await fetchCloudSnapshot();
            snapshot.folders = refreshedSnapshot.folders;
            snapshot.files = refreshedSnapshot.files;
            snapshot.last_opened_file_id = refreshedSnapshot.last_opened_file_id || null;
            const refreshedMain = findMainFolderIdInSnapshot(snapshot);
            if (refreshedMain) return refreshedMain;
        }
        throw new Error(payload?.error || 'Failed to create main folder');
    }
    snapshot.folders.push({ id: payload.id, folder_name: payload.folder_name || 'main' });
    return payload.id;
}
function nextUntitledFilename(snapshot, targetFolderId) {
    const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
    let maxN = 0;
    for (const file of files) {
        if ((file?.folder_id || null) !== (targetFolderId || null)) continue;
        const name = file?.file_name || file?.filename || '';
        const match = /^untitled-(\d+)\.cpp$/i.exec(name);
        if (!match) continue;
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > maxN) maxN = value;
    }
    return `untitled-${maxN + 1}.cpp`;
}
function getSnapshotFileById(snapshot, fileId) {
    if (!fileId) return null;
    const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
    for (const file of files) {
        if (file?.id === fileId) return file;
    }
    return null;
}
// Saves guest code to cloud with an explicit filename (chosen by the user via modal).
// Also updates snapshot in-place so subsequent callers see the new file immediately.
async function saveGuestCodeWithName(snapshot, content, fileName) {
    const mainFolderId = await ensureMainFolderIdForSnapshot(snapshot);
    const { response, payload } = await fetchJson('/api/file/save', {
        method: 'POST',
        body: JSON.stringify({ folder_id: mainFolderId, file_name: fileName, content })
    });
    if (!response.ok) throw new Error(payload?.error || 'Failed to save guest code');
    const folderName = (snapshot.folders.find((folder) => folder?.id === mainFolderId)?.folder_name) || 'main';
    snapshot.last_opened_file_id = payload?.file_id || snapshot.last_opened_file_id || null;
    snapshot.files.push({
        id: payload?.file_id || null,
        file_name: fileName,
        file_content: content,
        folder_id: mainFolderId,
        folder_name: folderName,
        file_size: payload?.file_size ?? computeBytes(content),
        content_hash: payload?.content_hash || null
    });
    return { fileName, folderId: mainFolderId };
}

// ==================== SIGN-IN HELPER FUNCTIONS ====================

// Resolves which cloud file to open by default (last opened → main.cpp → first file).
function resolveDefaultOpenTarget(snapshot) {
    const files = Array.isArray(snapshot?.files) ? snapshot.files : [];
    const active =
        getSnapshotFileById(snapshot, snapshot.last_opened_file_id) ||
        files.find((f) => (f?.file_name || f?.filename) === 'main.cpp') ||
        files[0] || null;
    if (!active) return null;
    return {
        folder: folderKey(active.folder_id || null),
        filename: active.file_name || active.filename
    };
}

// Shows a brief toast notification (e.g. "Opened existing file: main.cpp").
function showToast(message, durationMs = 3500) {
    // Reuse existing .fix-toast element if present, or create one.
    let toast = document.getElementById('goc-signin-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'goc-signin-toast';
        toast.className = 'fix-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.innerHTML = `
        <svg class="fix-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary)">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span class="fix-toast-text">${message}</span>`;

    // Clear any existing hide timer
    if (toast._hideTimer) clearTimeout(toast._hideTimer);

    // Trigger enter animation
    toast.classList.remove('fix-toast-exit');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('fix-toast-enter'));
    });

    toast._hideTimer = setTimeout(() => {
        toast.classList.remove('fix-toast-enter');
        toast.classList.add('fix-toast-exit');
    }, durationMs);
}

// Validates a filename entered by the user. Returns sanitised name or null.
function validateGuestFilename(raw) {
    let name = String(raw || '').trim();
    // Strip path separators and special chars, allow dots/hyphens/underscores
    name = name.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!name) return null;
    if (!name.includes('.')) name += '.cpp';
    if (name === '.cpp') return null;
    return name;
}

// Shows a modal asking the user to name and save (or discard) their guest code.
// Returns a Promise<{ action: 'save', filename: string } | { action: 'discard' }>.
function showSaveGuestDraftModal(snapshot) {
    return new Promise((resolve) => {
        // --- Pre-compute suggested filename ---
        // We don't have mainFolderId yet here (that requires an API call), so we use root-level count.
        const existingFiles = Array.isArray(snapshot?.files) ? snapshot.files : [];
        let maxN = 0;
        for (const f of existingFiles) {
            const nm = f?.file_name || f?.filename || '';
            const m = /^untitled-(\d+)(\.c|\.cpp)?$/i.exec(nm);
            if (m) { const v = Number(m[1]); if (v > maxN) maxN = v; }
        }
        const suggestedBaseName = `untitled-${maxN + 1}`;

        // --- Build overlay ---
        const overlay = document.createElement('div');
        overlay.id = 'goc-draft-modal-overlay';
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:99999',
            'display:flex', 'align-items:center', 'justify-content:center',
            'background:rgba(0,0,0,0.65)', 'backdrop-filter:blur(4px)',
            'animation:gocFadeIn 0.18s ease'
        ].join(';');

        overlay.innerHTML = `
<style>
@keyframes gocFadeIn  { from { opacity:0 } to { opacity:1 } }
@keyframes gocSlideUp { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:translateY(0) } }
#goc-draft-modal {
    background: var(--vscode-sidebar);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    padding: 28px 28px 24px;
    max-width: 420px;
    width: calc(100vw - 40px);
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
    animation: gocSlideUp 0.22s ease;
    display: flex;
    flex-direction: column;
    gap: 20px;
}
#goc-draft-modal h2 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
}
#goc-draft-modal h2 svg { flex-shrink:0; color:var(--primary); }
#goc-draft-modal p {
    font-size: 0.8375rem;
    color: var(--text-secondary);
    line-height: 1.55;
    margin: 0;
}
#goc-draft-modal label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
    display: block;
    margin-bottom: 7px;
}
#goc-draft-filename {
    flex: 1;
    min-width: 0;
    background: var(--vscode-bg);
    border: 1px solid var(--border-color);
    border-radius: 7px;
    color: var(--text-primary);
    font-size: 0.875rem;
    padding: 9px 12px;
    outline: none;
    transition: border-color 0.15s ease;
    font-family: 'JetBrains Mono', monospace;
}
#goc-draft-filename:focus { border-color: var(--primary); }
#goc-draft-filename.invalid { border-color: var(--danger); }
#goc-filename-error {
    font-size: 0.775rem;
    color: var(--danger);
    min-height: 16px;
    display: block;
    margin-top: 4px;
}
#goc-draft-modal .goc-modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    flex-wrap: wrap;
}
#goc-discard-btn {
    padding: 8px 16px;
    border-radius: 7px;
    border: 1px solid var(--danger);
    background: transparent;
    color: var(--danger);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
}
#goc-discard-btn:hover { background: rgba(255,68,68,0.15); color: var(--danger); }
#goc-save-btn {
    padding: 8px 20px;
    border-radius: 7px;
    border: none;
    background: var(--primary);
    color: var(--primary-text);
    font-size: 0.8125rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.1s ease;
}
#goc-save-btn:hover:not(:disabled) { background: var(--primary-hover); }
#goc-save-btn:active:not(:disabled) { transform: scale(0.97); }
#goc-save-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
<div id="goc-draft-modal" role="dialog" aria-modal="true" aria-labelledby="goc-modal-title">
    <h2 id="goc-modal-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4z"/>
            <polyline points="17 3 17 8 7 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        Save this file before continuing?
    </h2>
    <p>Your current code is unsaved. Enter a file name to store it in your cloud workspace, or discard it and create a new file.</p>
    <div>
        <label for="goc-draft-filename">File name</label>
        <div class="goc-input-container" style="display:flex; align-items:center; gap:8px;">
            <input
                type="text"
                id="goc-draft-filename"
                autocomplete="off"
                spellcheck="false"
                value="${suggestedBaseName}"
                placeholder="my-project"
            />
            <select id="goc-draft-extension" style="
                background: var(--vscode-bg);
                border: 1px solid var(--border-color);
                border-radius: 7px;
                color: var(--text-primary);
                font-size: 0.875rem;
                padding: 9px 12px;
                outline: none;
                cursor: pointer;
                font-family: 'JetBrains Mono', monospace;
                height: 38px;
            ">
                <option value=".c" selected>.c</option>
                <option value=".cpp">.cpp</option>
            </select>
        </div>
        <span id="goc-filename-error" aria-live="polite"></span>
    </div>
    <div class="goc-modal-actions">
        <button id="goc-discard-btn" type="button">Discard</button>
        <button id="goc-save-btn" type="button">Save to Cloud</button>
    </div>
</div>`;

        document.body.appendChild(overlay);

        // --- Wire up interactions ---
        const input = overlay.querySelector('#goc-draft-filename');
        const extSelect = overlay.querySelector('#goc-draft-extension');
        const errorEl = overlay.querySelector('#goc-filename-error');
        const saveBtn = overlay.querySelector('#goc-save-btn');
        const discardBtn = overlay.querySelector('#goc-discard-btn');

        // Auto-select all text for immediate editing
        requestAnimationFrame(() => { input.focus(); input.select(); });

        function setError(msg) {
            errorEl.textContent = msg || '';
            input.classList.toggle('invalid', Boolean(msg));
            saveBtn.disabled = Boolean(msg);
        }

        function getCleanedName() {
            let name = input.value.trim();
            if (name.toLowerCase().endsWith('.cpp')) {
                name = name.slice(0, -4).trim();
                extSelect.value = '.cpp';
            } else if (name.toLowerCase().endsWith('.c')) {
                name = name.slice(0, -2).trim();
                extSelect.value = '.c';
            }
            name = name.replace(/[^a-zA-Z0-9._-]/g, '');
            return name;
        }

        function validateInput() {
            const name = getCleanedName();
            if (!name || name === '.' || name === '..' || name.startsWith('.')) {
                setError('Invalid filename. Use letters, numbers, hyphens and underscores.');
                return null;
            }
            setError('');
            return name + extSelect.value;
        }

        input.addEventListener('input', () => {
            let name = input.value;
            if (name.toLowerCase().endsWith('.cpp')) {
                input.value = name.slice(0, -4);
                extSelect.value = '.cpp';
            } else if (name.toLowerCase().endsWith('.c')) {
                input.value = name.slice(0, -2);
                extSelect.value = '.c';
            }
            validateInput();
        });

        extSelect.addEventListener('change', validateInput);

        function cleanup() { overlay.remove(); }

        function onSave() {
            const clean = validateInput();
            if (!clean) return;
            cleanup();
            resolve({ action: 'save', filename: clean });
        }

        function onDiscard() {
            cleanup();
            resolve({ action: 'discard' });
        }

        saveBtn.addEventListener('click', onSave);
        discardBtn.addEventListener('click', onDiscard);

        // Close on Escape key
        function onKey(e) {
            if (e.key === 'Escape') { onDiscard(); document.removeEventListener('keydown', onKey); }
            if (e.key === 'Enter')  { onSave();    document.removeEventListener('keydown', onKey); }
        }
        document.addEventListener('keydown', onKey);

        // Click outside the modal card to discard
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) onDiscard();
        });
    });
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
        const editorContent = editor ? editor.getValue() : '';

        // ── Step 1: Compute a single SHA-256 of the editor content (~0.5ms) ──
        const editorHash = await computeSha256(editorContent);

        // ── Step 2: Fetch cloud files — server already provides content_hash for every file ──
        let snapshot = await fetchCloudSnapshot();

        // ── Step 3: Build CLOUD_STATE (which also fills hashToFileKey reverse-lookup map) ──
        updateCloudStateFromPayload(snapshot);
        renderFileExplorer();

        let openTarget = null;

        if (DEMO_HASHES.has(editorHash)) {
            // ── Case 1: Editor contains an unmodified demo/template — nothing to save ──
            // Open the last used cloud file as normal.
            Logger.info('[SignIn] Editor contains demo/template code — skipping save');
            openTarget = resolveDefaultOpenTarget(snapshot);

        } else if (CLOUD_STATE.hashToFileKey.has(editorHash)) {
            // ── Case 2: Identical code already exists in cloud — open it directly ──
            // O(1) Map lookup — no extra API call, no duplicate file.
            const matchKey  = CLOUD_STATE.hashToFileKey.get(editorHash);
            const matchFile = CLOUD_STATE.files.get(matchKey);
            if (matchFile) {
                Logger.info(`[SignIn] Guest code matches cloud file "${matchFile.filename}" — opening directly`);
                openTarget = { folder: matchFile.folder_key, filename: matchFile.filename };
                // Show a subtle, non-intrusive toast so user knows what happened
                setTimeout(() => showToast(`Opened existing file: ${matchFile.filename}`), 600);
            } else {
                openTarget = resolveDefaultOpenTarget(snapshot);
            }

        } else {
            // ── Case 3: Genuinely new code — ask the user what to do ──
            // Hide the spinner while the modal is open so it doesn't feel stuck.
            setExplorerLoading(false);
            hideProgress();

            let modalResult;
            try {
                modalResult = await showSaveGuestDraftModal(snapshot);
            } catch {
                modalResult = { action: 'discard' };
            }

            // Restart spinner for whatever comes next
            setExplorerLoading(true, 'Syncing...');
            showProgress();

            if (modalResult.action === 'save') {
                Logger.info(`[SignIn] User chose to save guest code as "${modalResult.filename}"`);
                const saved = await saveGuestCodeWithName(snapshot, editorContent, modalResult.filename);
                openTarget = { folder: folderKey(saved.folderId), filename: saved.fileName };
                // Re-sync cloud state with the newly saved file included
                updateCloudStateFromPayload(snapshot);
                renderFileExplorer();
            } else {
                // Discarded — reset editor to the default template and open last cloud file
                Logger.info('[SignIn] User discarded guest code — restoring default template');
                if (editor) {
                    editor.setValue(DEFAULT_SOURCE);
                    editor.clearSelection();
                }
                openTarget = resolveDefaultOpenTarget(snapshot);
            }
        }

        // ── Rebuild IndexedDB cache in parallel (non-blocking, unchanged) ──
        await FileDB.clear().catch(() => { });
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

        if (openTarget) await openFile(openTarget.folder, openTarget.filename, { skipSave: true });
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
            // Read the sidebar's actual rendered width. The auth-section
            // has only 6px padding on each side (12px total), so the
            // button can use almost the entire sidebar width.
            const sidebar = document.getElementById('sidebar');
            const sidebarW = sidebar ? sidebar.clientWidth : 240;
            // 12px = auth-section left+right padding, 2px extra safety
            const btnWidth = Math.max(200, Math.min(sidebarW - 14, 400));
            window.google.accounts.id.renderButton(renderTarget, {
                theme: 'outline',
                size: 'large',
                shape: 'rectangular',
                text: 'signin_with',
                logo_alignment: 'left',
                width: btnWidth
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
        try { await forceSaveActiveFile('signOut', { silent: true }); } catch { }
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
    // Reset the hash→fileKey reverse-lookup map before rebuilding
    CLOUD_STATE.hashToFileKey = CLOUD_STATE.hashToFileKey || new Map();
    CLOUD_STATE.hashToFileKey.clear();

    files.forEach((file) => {
        const name = file.file_name || file.filename;
        if (!name) return;
        const id = file.folder_id || file.folderId || null;
        const key = folderKey(id);
        const content = file.file_content ?? file.content ?? '';
        const hash = file.content_hash || null;
        const fk = fileKey(key, name);
        CLOUD_STATE.files.set(fk, {
            id: file.id || file.file_id || fk,
            filename: name,
            folder_id: id,
            folder_key: key,
            folder_name: file.folder_name || file.folderName || getFolderName(id),
            content,
            file_size: file.file_size ?? computeBytes(content),
            content_hash: hash
        });
        // Reverse-lookup: hash → fileKey (used at sign-in to detect duplicate guest code)
        if (hash) CLOUD_STATE.hashToFileKey.set(hash, fk);
    });
    if (!CLOUD_STATE.folderIdToName.has(CLOUD_STATE.selectedFolderKey)) {
        const firstFolder = Array.from(CLOUD_STATE.folderIdToName.keys())[0] || ROOT_FOLDER_KEY;
        CLOUD_STATE.selectedFolderKey = firstFolder;
    }
}
async function refreshCloudFiles(force = false) {
    if (!isUserLoggedIn) return;
    const lastRefresh = CLOUD_STATE.lastRefresh || 0;
    if (!force && Date.now() - lastRefresh < 2000) { renderFileExplorer(); return; }
    CLOUD_STATE.lastRefresh = Date.now();
    showProgress();
    setExplorerLoading(true, 'Loading files...');
    try {
        const { response, payload } = await fetchJson('/api/files', { method: 'GET' });
        if (response.status === 401) { safeUpdateLoginUI(false); setAuthStatus('Session expired. Please sign in again.'); return; }
        if (!response.ok) throw new Error(payload?.error || 'Failed to load files');
        updateCloudStateFromPayload(payload);
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
    if (!options.skipSave) await forceSaveActiveFile('fileSwitch', { silent: true });
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
    const silent = options.silent === true;
    if (!editor || isSaving) return { skipped: true };
    const skipProgress = trigger === 'compileRun';
    if (!skipProgress) showProgress();
    try {
        const code = editor.getValue();
        if (!isUserLoggedIn) {
            await persistLocalSave(code);
            if (!silent) Logger.success(`[Save] Saved (${trigger})`);
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
        if (SAVE_STATE.lastSavedHash === hash) {
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
    try { await forceSaveActiveFile('manual', { silent: false }); if (btnText) btnText.textContent = 'Saved'; }
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
        renderFileExplorer();
        if (CLOUD_STATE.activeFileKey === key) {
            const nextFile = getFirstVisibleCloudFile();
            if (nextFile) await openFile(nextFile.folder_key, nextFile.filename, { skipSave: true });
            else if (editor) { editor.setValue(DEFAULT_SOURCE); DIRTY_FLAG.isDirty = false; updateSaveIndicator(); }
        }
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
        if (window.__aiPreviewPending === true) return;
        try {
            if (isUserLoggedIn) {
                // NORMAL SAVE: only saves dirty files, skips if hash unchanged
                await forceSaveActiveFile('idle', { silent: true });
            } else {
                // Guest: save to IndexedDB (primary storage)
                if (editor) await persistLocalSave(editor.getValue());
            }
        } catch (error) { Logger.warn(`[Autosave] ${error.message}`); }
        // Timer stays null — will only restart when user types again
    }, AUTOSAVE_DELAY_MS); // 20 seconds idle
}
async function initAuth() {
    try {
        const config = await loadAuthConfig();
        if (!config.storageEnabled) setAuthStatus('Cloud storage is not configured');
        if (config.authEnabled && config.googleClientId) {
            initGoogleIdentity(config.googleClientId).catch((error) => {
                Logger.warn(`[Auth] ${error.message}`);
                setAuthStatus('Google sign-in is unavailable');
            });
        } else {
            const authSection = document.getElementById('auth-section');
            if (authSection) {
                authSection.innerHTML = `
                    <div style="background: var(--bg-modifier-hover); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; text-align: center; margin-top: 10px;">
                        <div style="color: var(--text-muted); font-size: 13px; line-height: 1.4;">Auth client is not configured. Files will be saved locally in your browser.</div>
                    </div>
                `;
            }
            setAuthStatus('');
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
