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
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
function showProgress() { if (progressBar && progressFill) { progressBar.classList.remove('hidden'); progressFill.classList.add('indeterminate'); } }
function hideProgress() { if (progressBar && progressFill) { progressFill.classList.remove('indeterminate'); progressBar.classList.add('hidden'); } }
function setExplorerLoading(isLoading, text = 'Loading files...') {
    const loading = document.getElementById('explorer-loading-state');
    const loadingText = document.getElementById('explorer-loading-text');
    const fileList = document.getElementById('main-folder-files');
    if (!loading || !fileList) return;
    if (loadingText) loadingText.textContent = text;
    loading.classList.toggle('hidden', !isLoading);
    fileList.classList.toggle('hidden', isLoading);
}
function loadDrafts() { try { return JSON.parse(localStorage.getItem(LOCAL_DRAFTS_KEY) || '{}') || {}; } catch { return {}; } }
function saveDrafts(drafts) { localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(drafts)); }
function setLocalDraft(folder, filename, content) { const d = loadDrafts(); d[fileKey(folder, filename)] = content; saveDrafts(d); }
function setLocalDraftImmediate(folder, filename, content) { setLocalDraft(folder, filename, content); }
function getLocalDraft(folder, filename) { const d = loadDrafts(); const key = fileKey(folder, filename); return Object.prototype.hasOwnProperty.call(d, key) ? d[key] : null; }
function clearLocalDraft(folder, filename) { const d = loadDrafts(); delete d[fileKey(folder, filename)]; saveDrafts(d); }
function clearAllLocalDrafts() { localStorage.removeItem(LOCAL_DRAFTS_KEY); }
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
        saveText.textContent = 'Unsaved changes';
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
    item.addEventListener('click', () => { setSelectedFolder(folder); openFile(folder, filename); });
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
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.headers || {}), ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
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
    const response = await fetch('/api/auth/config', { credentials: 'same-origin', cache: 'no-store' });
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
    await refreshCloudFiles(true);
    const active = CLOUD_STATE.files.get(CLOUD_STATE.activeFileKey || '') || getFirstVisibleCloudFile();
    if (active) await openFile(active.folder_key, active.filename, { skipSave: true });
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
                shape: 'rectangular',
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
    try { if (isUserLoggedIn) await forceSaveActiveFile('signOut', { force: false, silent: true }); } catch { }
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { }
    clearAllLocalDrafts();
    safeUpdateLoginUI(false);
    setAuthStatus('Unlimited projects · Access anywhere');
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
            renderFileExplorer();
            return;
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
    if (!options.skipSave) await forceSaveActiveFile('fileSwitch', { force: false, silent: true });
    const key = fileKey(folder, filename);
    CLOUD_STATE.activeFileKey = key;
    setSelectedFolder(folder);
    const content = CLOUD_STATE.files.get(key)?.content ?? getLocalDraft(folder, filename) ?? '';
    if (editor) { editor.setValue(content); editor.clearSelection(); }
    SAVE_STATE.lastSavedHash = await computeSha256(content);
    SAVE_STATE.lastSaveTime = Date.now();
    DIRTY_FLAG.isDirty = false;
    updateSaveIndicator();
    highlightActiveFile();
}
async function persistLocalSave(code) {
    localStorage.setItem('tc_code', code);
    SAVE_STATE.lastSavedHash = await computeSha256(code);
    SAVE_STATE.lastSaveTime = Date.now();
    DIRTY_FLAG.isDirty = false;
    updateSaveIndicator();
}
async function forceSaveActiveFile(trigger = 'manual', options = {}) {
    const force = options.force === true;
    const silent = options.silent === true;
    if (!editor || isSaving) return { skipped: true };
    const code = editor.getValue();
    if (!isUserLoggedIn) {
        await persistLocalSave(code);
        if (!silent) Logger.success(`[Save] Saved locally (${trigger})`);
        return { success: true, local: true };
    }
    const info = activeFileInfo();
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
        setLocalDraft(info.folder, info.filename, code);
        localStorage.setItem('tc_code', code);
        SAVE_STATE.lastSavedHash = payload?.content_hash || hash;
        SAVE_STATE.lastSaveTime = Date.now();
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();
        renderFileExplorer();
        if (!silent) Logger.success(`[Save] Saved (${trigger})`);
        return { success: true, changed: payload?.changed !== false };
    } finally { isSaving = false; SAVE_STATE.pendingHash = null; }
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
    const { response, payload } = await fetchJson('/api/folder/create', { method: 'POST', body: JSON.stringify({ folder_name: cleanName }) });
    if (!response.ok) throw new Error(payload?.error || 'Failed to create folder');
    CLOUD_STATE.folderIdToName.set(payload.id, payload.folder_name);
    CLOUD_STATE.folderNameToId.set(payload.folder_name, payload.id);
    CLOUD_STATE.folders.add(payload.id);
    setSelectedFolder(payload.id);
    renderFileExplorer();
}
async function createNewFile(filename) {
    if (!isUserLoggedIn) return alert('Sign in to create cloud files.');
    let cleanName = (filename || '').trim();
    if (!cleanName) return;
    if (!cleanName.includes('.')) cleanName += '.cpp';
    cleanName = cleanName.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!cleanName || cleanName === '.cpp') return alert('Invalid file name');
    let targetFolderId = folderId(CLOUD_STATE.selectedFolderKey) || activeFileInfo().folderId;
    if (!targetFolderId) targetFolderId = Array.from(CLOUD_STATE.folderIdToName.keys())[0] || null;
    if (!targetFolderId) return alert('Create a folder first, then create files inside it.');
    if (remoteFileByName(targetFolderId, cleanName)) return alert(`File "${cleanName}" already exists`);
    const { response, payload } = await fetchJson('/api/file/create', { method: 'POST', body: JSON.stringify({ file_name: cleanName, folder_id: targetFolderId }) });
    if (!response.ok) {
        if (response.status === 409) {
            await refreshCloudFiles(true);
            const existing = remoteFileByName(targetFolderId, cleanName);
            if (existing) {
                await openFile(existing.folder_key, existing.filename, { skipSave: true });
                return;
            }
        }
        throw new Error(payload?.error || 'Failed to create file');
    }
    const key = folderKey(payload.folder_id);
    CLOUD_STATE.files.set(fileKey(key, payload.file_name), { id: payload.id, filename: payload.file_name, folder_id: payload.folder_id || null, folder_key: key, folder_name: getFolderName(payload.folder_id), content: payload.file_content || '', file_size: payload.file_size || 0, content_hash: payload.content_hash || null });
    setLocalDraft(key, payload.file_name, payload.file_content || '');
    renderFileExplorer();
    await openFile(key, payload.file_name, { skipSave: true });
}
async function deleteFolder(folder, name) {
    const id = folderId(folder);
    if (!id) return;
    if (!confirm(`Delete folder "${name}" and all files inside it?\nThis cannot be undone.`)) return;
    const deletingActiveFolder = CLOUD_STATE.files.get(CLOUD_STATE.activeFileKey || '')?.folder_id === id;
    const { response, payload } = await fetchJson('/api/folder/delete', { method: 'DELETE', body: JSON.stringify({ folder_id: id }) });
    if (!response.ok) throw new Error(payload?.error || 'Failed to delete folder');
    for (const [key, file] of CLOUD_STATE.files.entries()) if (file.folder_id === id) { CLOUD_STATE.files.delete(key); clearLocalDraft(file.folder_key, file.filename); }
    CLOUD_STATE.folderIdToName.delete(id);
    CLOUD_STATE.folders.delete(id);
    setSelectedFolder(Array.from(CLOUD_STATE.folderIdToName.keys())[0] || ROOT_FOLDER_KEY);
    renderFileExplorer();
    if (deletingActiveFolder) {
        const nextFile = getFirstVisibleCloudFile();
        if (nextFile) await openFile(nextFile.folder_key, nextFile.filename, { skipSave: true });
    }
}
async function deleteFile(folder, filename) {
    if (!confirm(`Delete "${filename}"?\nThis cannot be undone.`)) return;
    const key = fileKey(folder, filename);
    const file = CLOUD_STATE.files.get(key);
    if (!file) return;
    const { response, payload } = await fetchJson('/api/file/delete', { method: 'DELETE', body: JSON.stringify({ file_id: file.id }) });
    if (!response.ok) throw new Error(payload?.error || 'Failed to delete file');
    CLOUD_STATE.files.delete(key);
    clearLocalDraft(folder, filename);
    if (CLOUD_STATE.activeFileKey === key) {
        const nextFile = getFirstVisibleCloudFile();
        if (nextFile) await openFile(nextFile.folder_key, nextFile.filename, { skipSave: true });
        else if (editor) { editor.setValue(DEFAULT_SOURCE); DIRTY_FLAG.isDirty = false; updateSaveIndicator(); }
    } else renderFileExplorer();
}
function downloadFile(folder, filename) {
    const key = fileKey(folder, filename);
    const content = key === CLOUD_STATE.activeFileKey && editor ? editor.getValue() : (CLOUD_STATE.files.get(key)?.content || getLocalDraft(folder, filename) || '');
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
    if (!isUserLoggedIn) return;
    if (CLOUD_STATE.autosaveTimer) clearTimeout(CLOUD_STATE.autosaveTimer);
    CLOUD_STATE.autosaveTimer = setTimeout(async () => {
        CLOUD_STATE.autosaveTimer = null;
        try { await forceSaveActiveFile('idle', { force: false, silent: true }); } catch (error) { Logger.warn(`[Autosave] ${error.message}`); }
    }, TYPING_DEBOUNCE_MS + AUTOSAVE_DELAY_MS);
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
            const active = CLOUD_STATE.files.get(CLOUD_STATE.activeFileKey || '') || getFirstVisibleCloudFile();
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

window.addEventListener('load', () => {
    initAuth().catch((error) => {
        Logger.warn(`[Auth] ${error.message}`);
        safeUpdateLoginUI(false);
        setAuthStatus('Unlimited projects · Access anywhere');
    });
});
