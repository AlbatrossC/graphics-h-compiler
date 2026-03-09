let isUserLoggedIn = false;
let currentUser = null;

const SAVE_STATE = {
    lastSavedHash: null,
    pendingHash: null,
    lastSaveTime: 0,
};

const DIRTY_FLAG = {
    isDirty: false,
};

let isSaving = false;

const LOCAL_FILES_KEY = 'compiler_local_files_v1';
const DEFAULT_FILE_KEY = 'main/main.cpp';

function getFileKey(folder, filename) {
    return `${folder}/${filename}`;
}

function getActiveFile() {
    const activeKey = CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY;
    const [folder, filename] = activeKey.split('/');
    return { folder, filename, key: activeKey };
}

async function computeSha256(content) {
    const bytes = new TextEncoder().encode(content);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function showProgress() {
    if (progressBar && progressFill) {
        progressBar.classList.remove('hidden');
        progressFill.classList.add('indeterminate');
    }
}

function hideProgress() {
    if (progressBar && progressFill) {
        progressFill.classList.remove('indeterminate');
        progressBar.classList.add('hidden');
    }
}

function loadLocalFiles() {
    try {
        const raw = localStorage.getItem(LOCAL_FILES_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function saveLocalFiles(filesObj) {
    localStorage.setItem(LOCAL_FILES_KEY, JSON.stringify(filesObj));
}

function persistCloudStateToLocal() {
    const obj = {};
    CLOUD_STATE.files.forEach((file, key) => {
        obj[key] = {
            folder: file.folder,
            filename: file.filename,
            content: file.content || '',
        };
    });
    saveLocalFiles(obj);
}

function ensureDefaultFilePresent() {
    if (!CLOUD_STATE.files.has(DEFAULT_FILE_KEY)) {
        const fallbackCode = localStorage.getItem('tc_code') || `#include <graphics.h>\n#include <conio.h>\n\nint main()\n{\n    int gd = DETECT, gm;\n    initgraph(&gd, &gm, "");\n\n    // Your code here\n\n    getch();\n    closegraph();\n    return 0;\n}\n`;
        CLOUD_STATE.files.set(DEFAULT_FILE_KEY, {
            id: DEFAULT_FILE_KEY,
            folder: 'main',
            filename: 'main.cpp',
            content: fallbackCode,
        });
    }
    CLOUD_STATE.folders = new Set(['main']);
    CLOUD_STATE.folderNameToId = new Map([['main', 'main']]);
}

function hydrateCloudStateFromLocal() {
    CLOUD_STATE.files.clear();
    const obj = loadLocalFiles();

    Object.keys(obj).forEach((key) => {
        const item = obj[key];
        if (!item?.folder || !item?.filename) return;
        CLOUD_STATE.files.set(key, {
            id: key,
            folder: item.folder,
            filename: item.filename,
            content: item.content || '',
        });
    });

    ensureDefaultFilePresent();
}

function updateSaveIndicator() {
    if (!saveIndicator || !saveText) return;

    if (!DIRTY_FLAG.isDirty && SAVE_STATE.lastSavedHash) {
        saveIndicator.classList.add('saved');
        saveText.textContent = 'Saved locally';
    } else {
        saveIndicator.classList.remove('saved');
        saveText.textContent = 'Unsaved changes';
    }
}

function getFileIconClass(ext) {
    switch (ext) {
        case 'cpp':
        case 'c':
            return 'icon-cpp';
        case 'h':
        case 'hpp':
            return 'icon-header';
        case 'txt':
            return 'icon-text';
        default:
            return 'icon-default';
    }
}

function createFileItem(folder, filename) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.folder = folder;
    item.dataset.file = filename;

    const ext = filename.split('.').pop().toLowerCase();
    item.dataset.ext = ext;

    const activeKey = CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY;
    if (`${folder}/${filename}` === activeKey) {
        item.classList.add('active');
    }

    const iconClass = getFileIconClass(ext);

    item.innerHTML = `
        <svg class="file-icon ${iconClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span class="file-name">${filename}</span>
        <div class="file-actions">
            <button class="file-action-btn file-download-btn" title="Download file" onclick="event.stopPropagation(); downloadFile('${folder}', '${filename}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            </button>
            <button class="file-action-btn file-delete-btn" title="Delete file" onclick="event.stopPropagation(); deleteFile('${folder}', '${filename}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"></path>
                </svg>
            </button>
        </div>
    `;

    item.addEventListener('click', () => openFile(folder, filename));
    return item;
}

function renderFileExplorer() {
    const mainFolderFiles = document.getElementById('main-folder-files');
    const filesCount = document.getElementById('files-count');
    if (!mainFolderFiles) return;

    const allFiles = [];
    CLOUD_STATE.files.forEach((file) => allFiles.push(file));
    allFiles.sort((a, b) => a.filename.localeCompare(b.filename));

    mainFolderFiles.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (const file of allFiles) {
        fragment.appendChild(createFileItem(file.folder, file.filename));
    }

    mainFolderFiles.appendChild(fragment);
    if (filesCount) filesCount.textContent = `${allFiles.length} file${allFiles.length === 1 ? '' : 's'}`;
}

function highlightActiveFile() {
    const activeKey = CLOUD_STATE.activeFileKey || DEFAULT_FILE_KEY;
    const [folder, filename] = activeKey.split('/');

    document.querySelectorAll('.file-item').forEach((item) => {
        const isActive = item.dataset.folder === folder && item.dataset.file === filename;
        item.classList.toggle('active', isActive);
    });

    const fileTab = document.getElementById('current-file-tab');
    const fileTabName = document.getElementById('current-file-name');
    if (fileTab) fileTab.dataset.file = filename;
    if (fileTabName) fileTabName.textContent = filename;
}

async function refreshCloudFiles() {
    hydrateCloudStateFromLocal();
    renderFileExplorer();
}

async function openFile(folder, filename, options = {}) {
    if (!options.skipSave) {
        await forceSaveActiveFile('fileSwitch', { force: false, silent: true });
    }

    const key = getFileKey(folder, filename);
    CLOUD_STATE.activeFileKey = key;

    const file = CLOUD_STATE.files.get(key);
    const content = file?.content || '';

    if (editor) {
        editor.setValue(content);
        editor.clearSelection();
    }

    SAVE_STATE.lastSavedHash = await computeSha256(content);
    SAVE_STATE.lastSaveTime = Date.now();
    DIRTY_FLAG.isDirty = false;
    updateSaveIndicator();
    highlightActiveFile();
}

async function forceSaveActiveFile(trigger = 'manual', options = {}) {
    const force = options.force === true;
    const silent = options.silent === true;

    if (!editor || isSaving) return { skipped: true };

    const code = editor.getValue();
    const { folder, filename, key } = getActiveFile();

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
        const existing = CLOUD_STATE.files.get(key) || { id: key, folder, filename, content: '' };
        existing.content = code;
        CLOUD_STATE.files.set(key, existing);

        persistCloudStateToLocal();
        localStorage.setItem('tc_code', code);

        SAVE_STATE.lastSavedHash = hash;
        SAVE_STATE.lastSaveTime = Date.now();
        DIRTY_FLAG.isDirty = false;
        updateSaveIndicator();

        if (!silent) Logger.success(`[Save] Saved (${trigger})`);
        return { success: true, changed: true, file_id: key, content_hash: hash };
    } finally {
        isSaving = false;
        SAVE_STATE.pendingHash = null;
    }
}

async function saveCode() {
    const saveBtn = document.getElementById('save-btn');
    const btnText = saveBtn?.querySelector('.btn-text');
    const originalText = btnText?.textContent || 'Save';

    if (btnText) btnText.textContent = 'Saving...';

    try {
        await forceSaveActiveFile('manual', { force: true, silent: false });
        if (btnText) btnText.textContent = 'Saved';
    } catch (e) {
        if (btnText) btnText.textContent = 'Error';
    } finally {
        setTimeout(() => {
            if (btnText) btnText.textContent = originalText;
        }, 1200);
    }
}

async function createNewFile(filename) {
    const inputName = (filename || '').trim();
    if (!inputName) return;

    let cleanName = inputName;
    if (!cleanName.includes('.')) cleanName += '.cpp';
    cleanName = cleanName.replace(/[^a-zA-Z0-9._-]/g, '');

    if (!cleanName || cleanName === '.cpp') {
        alert('Invalid file name');
        return;
    }

    const folder = 'main';
    const key = getFileKey(folder, cleanName);
    if (CLOUD_STATE.files.has(key)) {
        alert(`File "${cleanName}" already exists`);
        return;
    }

    CLOUD_STATE.files.set(key, {
        id: key,
        folder,
        filename: cleanName,
        content: '',
    });

    persistCloudStateToLocal();
    renderFileExplorer();
    await openFile(folder, cleanName, { skipSave: true });
}

async function deleteFile(folder, filename) {
    if (!confirm(`Delete "${filename}"?\nThis cannot be undone.`)) return;

    const key = getFileKey(folder, filename);
    CLOUD_STATE.files.delete(key);

    if (CLOUD_STATE.activeFileKey === key) {
        CLOUD_STATE.activeFileKey = DEFAULT_FILE_KEY;
        await openFile('main', 'main.cpp', { skipSave: true });
    }

    persistCloudStateToLocal();
    renderFileExplorer();
    updateSaveIndicator();
}

function downloadFile(folder, filename) {
    const key = getFileKey(folder, filename);
    let content = '';

    if (key === CLOUD_STATE.activeFileKey && editor) {
        content = editor.getValue();
    } else {
        content = CLOUD_STATE.files.get(key)?.content || '';
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

function scheduleAutosave() {}
function cancelPendingAutosave() {}

async function signInWithGoogle() {
    alert('Cloud sign-in is disabled in local-only mode.');
}

async function signOut() {
    // Local-only mode: keep working as guest user.
    isUserLoggedIn = true;
    currentUser = {
        email: 'local@offline',
        name: 'Local User',
    };
    if (typeof updateLoginUI === 'function') {
        updateLoginUI(true, {
            email: currentUser.email,
            user_metadata: { full_name: currentUser.name },
        });
    }
}

async function initLocalStorageMode() {
    isUserLoggedIn = true;
    currentUser = {
        email: 'local@offline',
        name: 'Local User',
    };

    if (typeof updateLoginUI === 'function') {
        updateLoginUI(true, {
            email: currentUser.email,
            user_metadata: { full_name: currentUser.name },
        });
    }

    await refreshCloudFiles();
    const { folder, filename } = getActiveFile();
    await openFile(folder, filename, { skipSave: true });
}

const googleSigninBtn = document.getElementById('google-signin-btn');
if (googleSigninBtn) {
    googleSigninBtn.addEventListener('click', signInWithGoogle);
}

initLocalStorageMode();
