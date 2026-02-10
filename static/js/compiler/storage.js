// ==================== AUTHENTICATION CACHING ====================
const sessionCache = {
    accessToken: null,
    expiresAt: null,
    user: null,
    lastVerified: null
};

const SESSION_REFRESH_INTERVAL = 45 * 60 * 1000;
const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000;

function getCachedToken() {
    if (!sessionCache.accessToken || !sessionCache.expiresAt) {
        return null;
    }
    if (Date.now() >= (sessionCache.expiresAt - SESSION_EXPIRY_BUFFER)) {
        clearSessionCache();
        return null;
    }
    return sessionCache.accessToken;
}

function setCachedSession(session) {
    if (!session || !session.access_token) {
        clearSessionCache();
        return;
    }
    const expiresIn = session.expires_in || 3600;
    sessionCache.accessToken = session.access_token;
    sessionCache.expiresAt = Date.now() + (expiresIn * 1000);
    sessionCache.user = session.user || null;
    sessionCache.lastVerified = Date.now();
}

function clearSessionCache() {
    sessionCache.accessToken = null;
    sessionCache.expiresAt = null;
    sessionCache.user = null;
    sessionCache.lastVerified = null;
}

async function getCachedSessionToken() {
    const cachedToken = getCachedToken();
    if (cachedToken) {
        metrics.auth.clientCacheHits++;
        return { access_token: cachedToken };
    }

    if (!supabaseClient) return null;
    metrics.auth.clientCacheMisses++;

    try {
        const needsVerification = !sessionCache.lastVerified ||
            (Date.now() - sessionCache.lastVerified > SESSION_REFRESH_INTERVAL);

        if (!needsVerification && sessionCache.accessToken) {
            return { access_token: sessionCache.accessToken };
        }

        metrics.auth.supabaseVerifications++;
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (error || !session) {
            clearSessionCache();
            return null;
        }

        setCachedSession(session);
        return session;
    } catch (e) {
        clearSessionCache();
        return null;
    }
}

// ==================== HASH COMPUTATION ====================
async function computeSha256(content) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
}

function getFileKey(folder, filename) {
    return `${folder}/${filename}`;
}

// ==================== LOCAL DRAFT MANAGEMENT ====================
const draftSaveTimers = new Map();
const DRAFT_SAVE_DEBOUNCE_MS = 100;

function getDraftKey(folder, filename) {
    const userId = sessionCache.user?.id || 'guest';
    return `draft_${userId}_${folder}_${filename}`;
}

function setLocalDraftImmediate(folder, filename, content) {
    try {
        localStorage.setItem(getDraftKey(folder, filename), content);
        localStorage.setItem('tc_code', content); // Also save to tc_code
        metrics.storage.localDraftWrites++;
    } catch (e) {
        Logger.warn('Failed to save local draft');
    }
}

function setLocalDraft(folder, filename, content) {
    const key = getFileKey(folder, filename);
    if (draftSaveTimers.has(key)) {
        clearTimeout(draftSaveTimers.get(key));
    }
    draftSaveTimers.set(key, setTimeout(() => {
        setLocalDraftImmediate(folder, filename, content);
        draftSaveTimers.delete(key);
    }, DRAFT_SAVE_DEBOUNCE_MS));
}

function getLocalDraft(folder, filename) {
    try {
        return localStorage.getItem(getDraftKey(folder, filename));
    } catch (e) {
        return null;
    }
}

function clearLocalDraft(folder, filename) {
    try {
        localStorage.removeItem(getDraftKey(folder, filename));
    } catch (e) {
        // Ignore
    }
}

// ==================== PROGRESS & STATUS ====================
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const statusMessage = document.getElementById('status-message');
const statusText = document.getElementById('status-text');

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

function showStatus(message, isError = false, duration = 3000) {
    if (statusMessage && statusText) {
        statusText.textContent = message;
        statusMessage.classList.remove('hidden', 'error');
        if (isError) statusMessage.classList.add('error');
        setTimeout(() => statusMessage.classList.add('hidden'), duration);
    }
}

function formatServerError(errData, status) {
    try {
        const base = errData?.error ? String(errData.error) : `HTTP ${status}`;
        const details = [];
        if (errData?.code) details.push(`code: ${errData.code}`);
        if (Array.isArray(errData?.missing) && errData.missing.length) {
            details.push(`missing: ${errData.missing.join(', ')}`);
        }
        if (errData?.requestId) details.push(`requestId: ${errData.requestId}`);
        return details.length ? `${base} (${details.join(', ')})` : base;
    } catch (e) {
        return `HTTP ${status}`;
    }
}

async function readErrorBody(response) {
    try {
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
            return await response.json();
        }
        const text = await response.text();
        return text ? { error: text } : {};
    } catch (e) {
        return {};
    }
}

// ==================== UNIFIED SAVE STATE ====================
const SAVE_STATE = {
    cloudHash: null,      // Hash confirmed by cloud
    pendingHash: null,    // Hash being saved
    lastSaveTime: 0
};

const DIRTY_FLAG = {
    isDirty: false,
    lastDisplayedState: null
};

let isSaving = false;
let typingDebounceTimer = null;

const autosaveMetrics = {
    triggers: { manual: 0, idle: 0, compileRun: 0, exit: 0 },
    operations: { cloudWrites: 0, cloudSkips: 0, localWrites: 0 }
};

// ==================== SAVE FUNCTIONS ====================
async function saveCode() {
    if (!editor) return;

    cancelPendingAutosave();
    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');

    // Always save locally first
    setLocalDraftImmediate(folder, filename, code);

    if (isUserLoggedIn && supabaseClient) {
        showProgress();
        try {
            await forceSaveActiveFile('manual');
            showStatus('✓ Saved to cloud!');
        } catch (e) {
            showStatus('Save failed', true);
            Logger.warn('Cloud save error: ' + e.message);
        } finally {
            hideProgress();
        }
    } else {
        DIRTY_FLAG.isDirty = false;
        showStatus('✓ Saved locally');
    }

    updateSaveIndicator();
}

async function forceSaveActiveFile(trigger = 'idle') {
    if (!editor || !isUserLoggedIn || !supabaseClient || isSaving) return;

    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');
    const hash = await computeSha256(code);

    // Skip if unchanged
    if (SAVE_STATE.cloudHash === hash || SAVE_STATE.pendingHash === hash) {
        metrics.autosave.skippedClean++;
        return;
    }

    SAVE_STATE.pendingHash = hash;
    isSaving = true;
    autosaveMetrics.triggers[trigger]++;

    const startTime = Date.now();
    Logger.info(`[Autosave] Starting (trigger: ${trigger})`);

    try {
        const session = await getCachedSessionToken();
        if (!session?.access_token) {
            isSaving = false;
            SAVE_STATE.pendingHash = null;
            return;
        }

        const response = await fetch('/files/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ folder, filename, content: code, hash })
        });

        if (response.ok) {
            const result = await response.json();
            const duration = Date.now() - startTime;

            // Update state
            SAVE_STATE.cloudHash = hash;
            SAVE_STATE.lastSaveTime = Date.now();
            CLOUD_STATE.lastSavedAt = Date.now();
            DIRTY_FLAG.isDirty = false;

            setLocalDraftImmediate(folder, filename, code);
            setCachedFileContent(folder, filename, code, hash);
            updateSaveIndicator();

            metrics.autosave.executed++;

            if (result.skipped) {
                autosaveMetrics.operations.cloudSkips++;
                Logger.info(`[Autosave] ✓ Skipped (${duration}ms, trigger: ${trigger})`);
            } else {
                autosaveMetrics.operations.cloudWrites++;
                Logger.success(`[Autosave] ✓ Saved (${duration}ms, trigger: ${trigger})`);
            }
        } else {
            const errData = await readErrorBody(response);
            const message = formatServerError(errData, response.status);
            Logger.warn(`[Autosave] ✗ Failed: ${message}`);
        }
    } catch (e) {
        Logger.warn(`[Autosave] ✗ Failed: ${e.message}`);
    } finally {
        isSaving = false;
        SAVE_STATE.pendingHash = null;
    }
}

function scheduleAutosave() {
    if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
    if (CLOUD_STATE.autosaveTimer) clearTimeout(CLOUD_STATE.autosaveTimer);

    typingDebounceTimer = setTimeout(() => {
        typingDebounceTimer = null;
        CLOUD_STATE.autosaveTimer = setTimeout(async () => {
            CLOUD_STATE.autosaveTimer = null;
            metrics.autosave.scheduled++;
            await forceSaveActiveFile('idle');
        }, AUTOSAVE_DELAY_MS);
    }, TYPING_DEBOUNCE_MS);
}

function cancelPendingAutosave() {
    if (typingDebounceTimer) {
        clearTimeout(typingDebounceTimer);
        typingDebounceTimer = null;
    }
    if (CLOUD_STATE.autosaveTimer) {
        clearTimeout(CLOUD_STATE.autosaveTimer);
        CLOUD_STATE.autosaveTimer = null;
    }
}

// ==================== FILE EXPLORER ====================
const FILE_EXPLORER_RENDER = {
    renderTimer: null,
    lastRenderTime: 0,
    MIN_RENDER_INTERVAL_MS: 500
};

function scheduleFileExplorerRender() {
    const now = Date.now();
    const timeSinceLastRender = now - FILE_EXPLORER_RENDER.lastRenderTime;

    if (FILE_EXPLORER_RENDER.renderTimer) {
        clearTimeout(FILE_EXPLORER_RENDER.renderTimer);
    }

    if (timeSinceLastRender >= FILE_EXPLORER_RENDER.MIN_RENDER_INTERVAL_MS) {
        renderFileExplorer();
        FILE_EXPLORER_RENDER.lastRenderTime = now;
    } else {
        const delayMs = FILE_EXPLORER_RENDER.MIN_RENDER_INTERVAL_MS - timeSinceLastRender;
        FILE_EXPLORER_RENDER.renderTimer = setTimeout(() => {
            renderFileExplorer();
            FILE_EXPLORER_RENDER.lastRenderTime = Date.now();
            FILE_EXPLORER_RENDER.renderTimer = null;
        }, delayMs);
    }
}

async function refreshCloudFiles(force = false) {
    if (!isUserLoggedIn || !supabaseClient) return;

    const lastRefresh = CLOUD_STATE.lastRefresh || 0;
    const MIN_REFRESH_INTERVAL = 5000; // 5 seconds

    if (!force && (Date.now() - lastRefresh < MIN_REFRESH_INTERVAL)) {
        Logger.debug('Refresh skipped (too soon)');
        return;
    }

    CLOUD_STATE.lastRefresh = Date.now();
    if (CLOUD_STATE.files.size === 0) showProgress();

    try {
        const session = await getCachedSessionToken();
        if (!session?.access_token) {
            hideProgress();
            return;
        }

        const response = await fetch('/files/list', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (response.ok) {
            const data = await response.json();
            updateCloudStateFiles(data.files);
            Logger.info(`Loaded ${CLOUD_STATE.files.size} files from cloud`);
        } else {
            const errData = await readErrorBody(response);
            const message = formatServerError(errData, response.status);
            Logger.warn(`Failed to refresh: ${message}`);
        }
    } catch (e) {
        Logger.warn('Failed to refresh: ' + e.message);
    } finally {
        hideProgress();
    }
}

function updateCloudStateFiles(filesList) {
    if (!Array.isArray(filesList)) return;

    CLOUD_STATE.files.clear();
    CLOUD_STATE.folders = new Set(['main']);

    filesList.forEach(file => {
        const key = getFileKey(file.folder, file.filename);
        CLOUD_STATE.files.set(key, file);
        CLOUD_STATE.folders.add(file.folder);
    });

    scheduleFileExplorerRender();
}

function renderFileExplorer() {
    const mainFolderFiles = document.getElementById('main-folder-files');
    const filesCount = document.getElementById('files-count');
    if (!mainFolderFiles) return;

    requestAnimationFrame(() => {
        const allFiles = [];
        CLOUD_STATE.files.forEach(file => allFiles.push(file));
        allFiles.sort((a, b) => a.filename.localeCompare(b.filename));

        const fragment = document.createDocumentFragment();

        if (allFiles.length === 0) {
            const defaultItem = createFileItem('main', 'main.cpp');
            fragment.appendChild(defaultItem);
            if (filesCount) filesCount.textContent = '1 file';
        } else {
            allFiles.forEach(file => {
                const fileItem = createFileItem(file.folder, file.filename);
                fragment.appendChild(fileItem);
            });
            if (filesCount) {
                filesCount.textContent = `${allFiles.length} file${allFiles.length !== 1 ? 's' : ''}`;
            }
        }

        mainFolderFiles.innerHTML = '';
        mainFolderFiles.appendChild(fragment);
    });
}

function createFileItem(folder, filename) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.folder = folder;
    item.dataset.file = filename;

    const ext = filename.split('.').pop().toLowerCase();
    item.dataset.ext = ext;

    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
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
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        </div>
    `;

    item.addEventListener('click', () => openFile(folder, filename));
    return item;
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

function downloadFile(folder, filename) {
    let content;
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    
    if (`${folder}/${filename}` === activeKey && editor) {
        content = editor.getValue();
    } else {
        const cached = getCachedFileContent(folder, filename);
        if (cached) {
            content = cached.content;
        } else {
            content = getLocalDraft(folder, filename) || '';
        }
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
    Logger.info(`Downloaded ${filename}`);
}

// ==================== OPEN FILE - FIXED SYNC ====================
async function openFile(folder, filename, options = {}) {
    cancelPendingAutosave();

    // Save current file before switching
    if (!options.skipSave && isUserLoggedIn && editor) {
        const currentCode = editor.getValue();
        const currentKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
        const [currentFolder, currentFilename] = currentKey.split('/');
        setLocalDraftImmediate(currentFolder, currentFilename, currentCode);
        
        // Fire-and-forget background save
        forceSaveActiveFile('fileSwitch').catch(e => {
            Logger.warn('Background save failed: ' + e.message);
        });
    }

    const key = getFileKey(folder, filename);
    CLOUD_STATE.activeFileKey = key;

    // CRITICAL FIX: Clear all caches to force fresh fetch from cloud
    clearCachedFileContent(folder, filename);
    
    // Always fetch from cloud if logged in
    if (isUserLoggedIn && supabaseClient) {
        showProgress();
        try {
            const session = await getCachedSessionToken();
            if (session?.access_token) {
                const response = await fetch(
                    `/files/read?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`,
                    {
                        headers: { 'Authorization': `Bearer ${session.access_token}` },
                        cache: 'no-store' // CRITICAL: Force fresh fetch
                    }
                );

                if (response.ok) {
                    const content = await response.text();
                    const hash = await computeSha256(content);

                    if (editor) {
                        editor.setValue(content, -1);
                        editor.clearSelection();
                    }

                    setLocalDraftImmediate(folder, filename, content);
                    setCachedFileContent(folder, filename, content, hash);
                    SAVE_STATE.cloudHash = hash;
                    SAVE_STATE.lastSaveTime = Date.now();
                    DIRTY_FLAG.isDirty = false;

                    metrics.storage.cloudReads++;
                    updateSaveIndicator();
                    highlightActiveFile();
                    Logger.success(`Loaded ${filename} from cloud`);
                    hideProgress();
                    return;
                } else if (response.status === 404) {
                    // File doesn't exist in cloud yet - create it
                    if (editor) {
                        editor.setValue('', -1);
                    }
                    SAVE_STATE.cloudHash = null;
                    DIRTY_FLAG.isDirty = false;
                    highlightActiveFile();
                    hideProgress();
                    return;
                } else {
                    const errData = await readErrorBody(response);
                    Logger.warn(`Cloud read failed: ${formatServerError(errData, response.status)}`);
                }
            }
        } catch (e) {
            Logger.warn('Cloud read error: ' + e.message);
        } finally {
            hideProgress();
        }
    }

    // Fallback to local draft
    const draft = getLocalDraft(folder, filename);
    if (draft !== null) {
        if (editor) {
            editor.setValue(draft, -1);
            editor.clearSelection();
        }
        DIRTY_FLAG.isDirty = false;
        highlightActiveFile();
        Logger.info(`Opened ${filename} from local draft`);
        return;
    }

    // Default: empty file
    if (editor) {
        editor.setValue('', -1);
    }
    DIRTY_FLAG.isDirty = false;
    highlightActiveFile();
}

function highlightActiveFile() {
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');
    const items = document.querySelectorAll('.file-item');
    items.forEach(item => {
        const isActive = item.dataset.folder === folder && item.dataset.file === filename;
        if (isActive) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// ==================== CREATE/DELETE FILES ====================
async function createNewFile(filename) {
    const inputName = filename || '';
    if (!inputName || !inputName.trim()) return;

    let cleanName = inputName.trim();
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

    const defaultContent = `// ${cleanName}\n#include <graphics.h>\n#include <conio.h>\n\nint main() {\n    int gd = DETECT, gm;\n    initgraph(&gd, &gm, "");\n    \n    // Your code here\n    \n    getch();\n    closegraph();\n    return 0;\n}\n`;

    setLocalDraft(folder, cleanName, defaultContent);

    if (isUserLoggedIn && supabaseClient) {
        try {
            const session = await getCachedSessionToken();
            if (session?.access_token) {
                const hash = await computeSha256(defaultContent);
                const response = await fetch('/files/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ folder, filename: cleanName, content: defaultContent, hash })
                });

                if (response.ok) {
                    await refreshCloudFiles(true);
                    await openFile(folder, cleanName);
                    Logger.success(`Created ${cleanName}`);
                    return;
                }
            }
        } catch (e) {
            Logger.warn('Cloud create failed: ' + e.message);
        }
    }

    CLOUD_STATE.files.set(key, { folder, filename: cleanName });
    renderFileExplorer();
    await openFile(folder, cleanName);
}

async function deleteFile(folder, filename) {
    if (!confirm(`Delete "${filename}"?\nThis cannot be undone.`)) return;

    const key = getFileKey(folder, filename);

    if (isUserLoggedIn && supabaseClient) {
        try {
            const session = await getCachedSessionToken();
            if (session?.access_token) {
                await fetch('/files/delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ folder, filename })
                });
            }
        } catch (e) {
            Logger.warn('Cloud delete failed: ' + e.message);
        }
    }

    CLOUD_STATE.files.delete(key);
    clearLocalDraft(folder, filename);

    if (CLOUD_STATE.activeFileKey === key) {
        CLOUD_STATE.activeFileKey = 'main/main.cpp';
        await openFile('main', 'main.cpp');
    }

    renderFileExplorer();
}

// ==================== SAVE INDICATOR ====================
function updateSaveIndicator() {
    if (!saveIndicator || !saveText) return;

    const isDirty = DIRTY_FLAG.isDirty;

    if (isUserLoggedIn && SAVE_STATE.cloudHash) {
        if (!isDirty) {
            if (DIRTY_FLAG.lastDisplayedState !== 'saved') {
                saveIndicator.classList.add('saved');
                saveText.textContent = 'Saved to cloud';
                DIRTY_FLAG.lastDisplayedState = 'saved';
            }
        } else {
            if (DIRTY_FLAG.lastDisplayedState !== 'unsaved') {
                saveIndicator.classList.remove('saved');
                saveText.textContent = 'Unsaved changes';
                DIRTY_FLAG.lastDisplayedState = 'unsaved';
            }
        }
    } else {
        const code = editor?.getValue() || '';
        const savedCode = localStorage.getItem('tc_code') || '';
        const isSaved = code === savedCode;

        if (isSaved && DIRTY_FLAG.lastDisplayedState !== 'saved-local') {
            saveIndicator.classList.add('saved');
            saveText.textContent = 'Saved locally';
            DIRTY_FLAG.lastDisplayedState = 'saved-local';
        } else if (!isSaved && DIRTY_FLAG.lastDisplayedState !== 'unsaved') {
            saveIndicator.classList.remove('saved');
            saveText.textContent = 'Unsaved changes';
            DIRTY_FLAG.lastDisplayedState = 'unsaved';
        }
    }
}

// ==================== SUPABASE AUTH ====================
let lastAuthEvent = { type: null, timestamp: 0, userId: null };
const AUTH_EVENT_DEBOUNCE_MS = 1000;

async function initSupabaseAuth() {
    try {
        const response = await fetch('/api/auth/config');
        if (!response.ok) {
            Logger.warn('Auth not configured');
            return;
        }

        const config = await response.json();
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

        script.onload = () => {
            supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
            checkSession();

            supabaseClient.auth.onAuthStateChange((event, session) => {
                const now = Date.now();
                const isDuplicate = (
                    lastAuthEvent.type === event &&
                    lastAuthEvent.userId === session?.user?.id &&
                    (now - lastAuthEvent.timestamp) < AUTH_EVENT_DEBOUNCE_MS
                );

                if (isDuplicate) return;

                lastAuthEvent = { type: event, timestamp: now, userId: session?.user?.id || null };

                if (event === 'SIGNED_IN') {
                    if (session?.user) {
                        setCachedSession(session);
                        updateLoginUI(true, session.user);
                        
                        // CRITICAL FIX: Pass display name to server
                        updateLastLogin(session.user).catch(() => {});
                        
                        refreshCloudFiles(true).then(() => {
                            const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
                            const [folder, filename] = activeKey.split('/');
                            return openFile(folder, filename, { skipSave: true });
                        });
                    }
                } else if (event === 'TOKEN_REFRESHED') {
                    if (session?.user) {
                        setCachedSession(session);
                    }
                    return;
                } else if (event === 'INITIAL_SESSION') {
                    if (session?.user) {
                        setCachedSession(session);
                        updateLoginUI(true, session.user);
                        
                        // CRITICAL FIX: Pass display name to server
                        updateLastLogin(session.user).catch(() => {});
                        
                        refreshCloudFiles(true).then(() => {
                            const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
                            const [folder, filename] = activeKey.split('/');
                            return openFile(folder, filename, { skipSave: true });
                        });
                    }
                } else if (event === 'SIGNED_OUT') {
                    clearSessionCache();
                    updateLoginUI(false);
                }
            });
        };

        document.head.appendChild(script);
    } catch (e) {
        Logger.warn('Auth init failed: ' + e.message);
    }
}

// CRITICAL FIX: Update last login with display name
async function updateLastLogin(user) {
    if (!user || !isUserLoggedIn || !supabaseClient) return;
    
    try {
        const session = await getCachedSessionToken();
        if (!session?.access_token) return;

        // Extract display name from user metadata
        const displayName = user.user_metadata?.full_name || 
                           user.user_metadata?.name || 
                           user.email?.split('@')[0] || 
                           null;

        const response = await fetch('/rest/v1/rpc/update_last_login', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                p_user_id: user.id,
                p_display_name: displayName 
            })
        });

        if (response.ok) {
            Logger.info('Last login updated with display name');
        }
    } catch (e) {
        Logger.warn('Update last login failed: ' + e.message);
    }
}

async function checkSession() {
    if (!supabaseClient) return;

    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (session?.user) {
            setCachedSession(session);
            updateLoginUI(true, session.user);
            
            // CRITICAL FIX: Update display name on session check
            updateLastLogin(session.user).catch(() => {});
        } else {
            updateLoginUI(false);
        }
    } catch (e) {
        updateLoginUI(false);
    }
}

async function signInWithGoogle() {
    if (!supabaseClient) {
        alert('Authentication not configured');
        return;
    }

    try {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo }
        });

        if (error) {
            alert('Sign in failed: ' + error.message);
        }
    } catch (e) {
        alert('Sign in failed');
    }
}

async function signOut() {
    if (!supabaseClient) return;

    try {
        await forceSaveActiveFile('exit');
        clearAllFileCache();
        clearSessionCache();

        const { error } = await supabaseClient.auth.signOut();
        if (!error) {
            updateLoginUI(false);
        }
    } catch (e) {
        Logger.error('Sign out error: ' + e.message);
    }
}

const googleSigninBtn = document.getElementById('google-signin-btn');
if (googleSigninBtn) {
    googleSigninBtn.addEventListener('click', signInWithGoogle);
}

initSupabaseAuth();