// ==================== AUTHENTICATION CACHING (TIER 1: CLIENT-SIDE) ====================
// CRITICAL: This cache prevents redundant auth checks on EVERY operation
// Without this, we'd be calling Supabase 100+ times per minute!

const sessionCache = {
    accessToken: null,
    expiresAt: null,
    user: null,
    lastVerified: null // Track when we last verified with Supabase
};

const SESSION_REFRESH_INTERVAL = 45 * 60 * 1000; // Only refresh every 45 minutes
const SESSION_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minute safety buffer

// Get cached access token WITHOUT hitting Supabase
function getCachedToken() {
    if (!sessionCache.accessToken || !sessionCache.expiresAt) {
        return null;
    }

    // Check if token has expired
    if (Date.now() >= (sessionCache.expiresAt - SESSION_EXPIRY_BUFFER)) {
        sessionCache.accessToken = null;
        sessionCache.expiresAt = null;
        sessionCache.user = null;
        sessionCache.lastVerified = null;
        return null;
    }

    return sessionCache.accessToken;
}

// Store session in cache when user authenticates
function setCachedSession(session) {
    if (!session || !session.access_token) {
        sessionCache.accessToken = null;
        sessionCache.expiresAt = null;
        sessionCache.user = null;
        sessionCache.lastVerified = null;
        return;
    }

    // Supabase tokens expire in 1 hour by default
    const expiresIn = session.expires_in || 3600; // seconds

    sessionCache.accessToken = session.access_token;
    sessionCache.expiresAt = Date.now() + (expiresIn * 1000);
    sessionCache.user = session.user || null;
    sessionCache.lastVerified = Date.now();

    Logger.info('Session cached in memory');
}

// Clear all cached session data
function clearSessionCache() {
    sessionCache.accessToken = null;
    sessionCache.expiresAt = null;
    sessionCache.user = null;
    sessionCache.lastVerified = null;
    Logger.info('Session cache cleared');
}

// Get session token with intelligent caching
async function getCachedSessionToken() {
    // FAST PATH: Use cached token if valid
    const cachedToken = getCachedToken();
    if (cachedToken) {
        metrics.auth.clientCacheHits++;
        return { access_token: cachedToken };
    }

    // SLOW PATH: Token expired or not cached, need to refresh
    if (!supabaseClient) {
        return null;
    }

    metrics.auth.clientCacheMisses++;

    try {
        // Check if we need to verify with Supabase
        // Only verify if: (1) no cache OR (2) cache is old (>15 min)
        const needsVerification = !sessionCache.lastVerified ||
            (Date.now() - sessionCache.lastVerified > SESSION_REFRESH_INTERVAL);

        if (!needsVerification && sessionCache.accessToken) {
            // Cache is recent enough, reuse it
            return { access_token: sessionCache.accessToken };
        }

        metrics.auth.supabaseVerifications++;

        // Actually fetch from Supabase (expensive operation)
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (error) {
            Logger.warn('Session refresh error: ' + error.message);
            clearSessionCache();
            return null;
        }

        if (session) {
            setCachedSession(session);
            return session;
        }

        clearSessionCache();
        return null;
    } catch (e) {
        Logger.warn('Failed to get fresh session: ' + e.message);
        clearSessionCache();
        return null;
    }
}

// ==================== CLOUD STORAGE FUNCTIONS ====================

// Compute SHA-256 hash of content
async function computeSha256(content) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        // Fallback for older browsers
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }
}

// File key helper
function getFileKey(folder, filename) {
    return `${folder}/${filename}`;
}

// ==================== DEBOUNCED LOCAL DRAFT MANAGEMENT ====================
const draftSaveTimers = new Map();
const DRAFT_SAVE_DEBOUNCE_MS = 100;

// Immediate local draft save (for critical saves)
function setLocalDraftImmediate(folder, filename, content) {
    try {
        localStorage.setItem(`draft_${folder}_${filename}`, content);
        metrics.storage.localDraftWrites++;
    } catch (e) {
        Logger.warn('Failed to save local draft');
    }
}

// Debounced local draft save (for typing - reduces write operations)
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

function flushPendingDrafts() {
    draftSaveTimers.forEach((timer, key) => {
        clearTimeout(timer);
        draftSaveTimers.delete(key);
    });
}

function getLocalDraft(folder, filename) {
    try {
        return localStorage.getItem(`draft_${folder}_${filename}`);
    } catch (e) {
        return null;
    }
}

function clearLocalDraft(folder, filename) {
    try {
        localStorage.removeItem(`draft_${folder}_${filename}`);
    } catch (e) {
        // Ignore
    }
}

// ==================== PROGRESS BAR & STATUS ====================

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
        if (isError) {
            statusMessage.classList.add('error');
        }

        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, duration);
    }
}

function formatServerError(errData, status) {
    try {
        const base = errData?.error ? String(errData.error) : `HTTP ${status}`;
        const details = [];
        if (errData?.code) {
            details.push(`code: ${errData.code}`);
        }
        if (Array.isArray(errData?.missing) && errData.missing.length) {
            details.push(`missing: ${errData.missing.join(', ')}`);
        }
        if (errData?.requestId) {
            details.push(`requestId: ${errData.requestId}`);
        }
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

// ==================== SAVE FUNCTIONS ====================

// Unified save function - saves BOTH locally and to cloud
async function saveCode() {
    if (!editor) return;

    cancelPendingAutosave();

    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');

    localStorage.setItem('tc_code', code);
    setLocalDraftImmediate(folder, filename, code);
    autosaveMetrics.operations.localWrites++;

    if (isUserLoggedIn && supabaseClient) {
        showProgress();
        try {
            const session = await getCachedSessionToken();
            if (session?.access_token) {
                const hash = await computeSha256(code);

                if (CLOUD_STATE.lastSavedHash === hash && lastCloudSaveHash === hash) {
                    showStatus('✓ Already saved');
                    hideProgress();
                    updateSaveIndicator();
                    return;
                }

                await forceSaveActiveFile('manual');
                showStatus('✓ Saved to cloud!');
            }
        } catch (e) {
            showStatus('Save failed', true);
            Logger.warn('Cloud save error: ' + e.message);
        } finally {
            hideProgress();
        }
    } else {
        showStatus('✓ Saved locally');
    }

    updateSaveIndicator();
}

// Save code locally only (internal helper)
function saveLocalCode() {
    if (!editor) return;

    const code = editor.getValue();
    localStorage.setItem('tc_code', code);

    if (isUserLoggedIn) {
        const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
        const [folder, filename] = activeKey.split('/');
        setLocalDraft(folder, filename, code);
    }

    Logger.success('Code saved locally');
    updateSaveIndicator();
}

// Save code to cloud
async function saveCloudCode() {
    if (!editor) return;

    if (!isUserLoggedIn || !supabaseClient) {
        alert('Please sign in to save to cloud');
        return;
    }

    const code = editor.getValue();

    try {
        const session = await getCachedSessionToken();
        if (!session?.access_token) {
            alert('Session expired. Please sign in again.');
            return;
        }

        const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
        const [folder, filename] = activeKey.split('/');
        const hash = await computeSha256(code);

        Logger.info(`Saving to cloud: ${folder}/${filename}`);

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
            if (result.skipped) {
                Logger.info('Cloud save skipped (unchanged)');
            } else {
                Logger.success('Code saved to cloud');
            }
            CLOUD_STATE.lastSavedAt = Date.now();
            CLOUD_STATE.lastSavedHash = hash;

            localStorage.setItem('tc_code', code);
            setLocalDraft(folder, filename, code);

            updateSaveIndicator();
        } else {
            const errData = await readErrorBody(response);
            const message = formatServerError(errData, response.status);
            Logger.error(`Cloud save failed: ${message}`);
            alert(`Failed to save to cloud: ${message}`);
        }
    } catch (e) {
        Logger.error('Cloud save error: ' + e.message);
        alert('Failed to save to cloud: ' + e.message);
    }
}

// ==================== OPTIMIZED AUTOSAVE SYSTEM ====================
let pendingSaveHash = null;
let isSaving = false;
let typingDebounceTimer = null;
let lastAutosaveTime = 0;
let lastCloudSaveHash = null;

// Enhanced metrics for autosave tracking
const autosaveMetrics = {
    triggers: {
        manual: 0,      // User clicked Save
        idle: 0,        // Idle timer triggered
        compileRun: 0,  // Before compile & run
        exit: 0         // Tab close / visibility change
    },
    operations: {
        cloudWrites: 0,
        cloudSkips: 0,
        localWrites: 0
    }
};

async function forceSaveActiveFile(trigger = 'idle') {
    if (!editor || !isUserLoggedIn || !supabaseClient) return;

    if (isSaving) {
        Logger.debug(`[Autosave] Save in progress, skipping (trigger: ${trigger})`);
        return;
    }

    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');
    const hash = await computeSha256(code);

    if (CLOUD_STATE.lastSavedHash === hash || pendingSaveHash === hash || lastCloudSaveHash === hash) {
        metrics.autosave.skippedClean++;
        Logger.debug(`[Autosave] Content unchanged, skipped (trigger: ${trigger})`);
        return;
    }

    pendingSaveHash = hash;
    isSaving = true;
    autosaveMetrics.triggers[trigger]++;

    const startTime = Date.now();
    Logger.info(`[Autosave] Starting (trigger: ${trigger}, file: ${filename})`);

    try {
        const session = await getCachedSessionToken();
        if (!session?.access_token) {
            isSaving = false;
            pendingSaveHash = null;
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

            CLOUD_STATE.lastSavedAt = Date.now();
            CLOUD_STATE.lastSavedHash = hash;
            lastCloudSaveHash = hash;
            lastAutosaveTime = Date.now();

            setLocalDraftImmediate(folder, filename, code);
            setCachedFileContent(folder, filename, code, hash);
            updateSaveIndicator();

            metrics.autosave.executed++;

            if (result.skipped) {
                autosaveMetrics.operations.cloudSkips++;
                Logger.info(`[Autosave] ✓ Skipped by server (${duration}ms, trigger: ${trigger})`);
            } else {
                autosaveMetrics.operations.cloudWrites++;
                Logger.success(`[Autosave] ✓ Saved to cloud (${duration}ms, trigger: ${trigger})`);
            }

            printAutosaveStats();
        } else {
            const errData = await readErrorBody(response);
            const message = formatServerError(errData, response.status);
            Logger.warn(`[Autosave] ✗ Failed (trigger: ${trigger}): ${message}`);
        }
    } catch (e) {
        Logger.warn(`[Autosave] ✗ Failed (trigger: ${trigger}): ${e.message}`);
    } finally {
        isSaving = false;
        pendingSaveHash = null;
    }
}

function scheduleAutosave() {
    if (typingDebounceTimer) {
        clearTimeout(typingDebounceTimer);
    }

    if (CLOUD_STATE.autosaveTimer) {
        clearTimeout(CLOUD_STATE.autosaveTimer);
    }

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

function printAutosaveStats() {
    const total = autosaveMetrics.operations.cloudWrites + autosaveMetrics.operations.cloudSkips;
    console.log(
        `%c[Stats] Autosave: ${total} ops | ` +
        `Writes: ${autosaveMetrics.operations.cloudWrites} | ` +
        `Skips: ${autosaveMetrics.operations.cloudSkips} | ` +
        `Triggers: Manual=${autosaveMetrics.triggers.manual} Idle=${autosaveMetrics.triggers.idle} ` +
        `Run=${autosaveMetrics.triggers.compileRun} Exit=${autosaveMetrics.triggers.exit}`,
        'color: #6ac47b; font-weight: bold;'
    );
}

// ==================== FILE EXPLORER FUNCTIONS ====================

// CRITICAL FIX: Only refresh when absolutely necessary
async function refreshCloudFiles() {
    if (!isUserLoggedIn || !supabaseClient) return;

    // Prevent excessive refreshes
    const lastRefresh = CLOUD_STATE.lastRefresh || 0;
    const MIN_REFRESH_INTERVAL = 5000; // 5 seconds minimum

    if (Date.now() - lastRefresh < MIN_REFRESH_INTERVAL) {
        Logger.info('Refresh skipped (too soon)');
        return;
    }

    CLOUD_STATE.lastRefresh = Date.now();

    // Optimistic: Don't show progress bar for background refreshes unless empty
    if (CLOUD_STATE.files.size === 0) showProgress();

    try {
        const session = await getCachedSessionToken();
        if (!session?.access_token) {
            hideProgress();
            return;
        }

        const response = await fetch('/files/list', {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (response.ok) {
            const data = await response.json();

            // CACHE: Save list to local storage for instant load next time
            try {
                localStorage.setItem('cached_file_list', JSON.stringify(data.files));
                localStorage.setItem('cached_file_list_ts', Date.now().toString());
            } catch (e) {
                // Ignore quota errors
            }

            updateCloudStateFiles(data.files);
            Logger.info(`Loaded ${CLOUD_STATE.files.size} files from cloud`);
        } else {
            const errData = await readErrorBody(response);
            const message = formatServerError(errData, response.status);
            Logger.warn(`Failed to refresh cloud files: ${message}`);
            showStatus(`Cloud refresh failed: ${message}`, true, 5000);
        }
    } catch (e) {
        Logger.warn('Failed to refresh cloud files: ' + e.message);
    } finally {
        hideProgress();
    }
}

// Helper to update state from file list (used by cache and fetch)
function updateCloudStateFiles(filesList) {
    if (!Array.isArray(filesList)) return;

    CLOUD_STATE.files.clear();
    CLOUD_STATE.folders = new Set(['main']);

    filesList.forEach(file => {
        const key = getFileKey(file.folder, file.filename);
        CLOUD_STATE.files.set(key, file);
        CLOUD_STATE.folders.add(file.folder);
    });

    renderFileExplorer();
}

// Load file list from local cache (Instant Startup)
function loadCachedFileList() {
    try {
        const cached = localStorage.getItem('cached_file_list');
        if (cached) {
            const files = JSON.parse(cached);
            updateCloudStateFiles(files);
            Logger.info('Loaded file list from local cache');
            return true;
        }
    } catch (e) {
        // Ignore corrupted cache
    }
    return false;
}

// Render file explorer UI
function renderFileExplorer() {
    const mainFolderFiles = document.getElementById('main-folder-files');
    const filesCount = document.getElementById('files-count');
    if (!mainFolderFiles) return;

    mainFolderFiles.innerHTML = '';

    if (CLOUD_STATE.files.size === 0) {
        const defaultItem = createFileItem('main', 'main.cpp');
        mainFolderFiles.appendChild(defaultItem);
        if (filesCount) filesCount.textContent = '1 file';
        return;
    }

    const allFiles = [];
    CLOUD_STATE.files.forEach((file, key) => {
        allFiles.push(file);
    });

    allFiles.sort((a, b) => a.filename.localeCompare(b.filename));

    allFiles.forEach(file => {
        const fileItem = createFileItem(file.folder, file.filename);
        mainFolderFiles.appendChild(fileItem);
    });

    if (filesCount) {
        const count = allFiles.length;
        filesCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
    }
}

// Create file item element
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

// Download file function
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

// Open a file with multi-tier caching
async function openFile(folder, filename, options = {}) {
    cancelPendingAutosave();

    if (!options.skipSave && isUserLoggedIn) {
        forceSaveActiveFile().catch(e => {
            Logger.warn('Background save during file switch failed: ' + e.message);
        });
    }

    const key = getFileKey(folder, filename);
    CLOUD_STATE.activeFileKey = key;

    // TIER 1: Check memory cache first
    const cached = getCachedFileContent(folder, filename);
    if (cached) {
        if (editor) {
            editor.setValue(cached.content, -1);
            editor.clearSelection();
        }
        if (cached.hash) {
            CLOUD_STATE.lastSavedHash = cached.hash;
            lastCloudSaveHash = cached.hash;
        }
        updateSaveIndicator();
        highlightActiveFile();
        Logger.info(`Opened ${filename} from memory cache (instant)`);
        return;
    }

    // TIER 2: Try localStorage draft
    const draft = getLocalDraft(folder, filename);
    if (draft !== null) {
        if (editor) {
            editor.setValue(draft, -1);
            editor.clearSelection();
        }
        setCachedFileContent(folder, filename, draft);
        updateSaveIndicator();
        highlightActiveFile();
        Logger.info(`Opened ${filename} from local draft`);
        return;
    }

    // TIER 3: Fetch from cloud
    if (isUserLoggedIn && supabaseClient) {
        showProgress();
        try {
            const session = await getCachedSessionToken();
            if (session?.access_token) {
                const response = await fetch(`/files/read?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`, {
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`
                    }
                });

                if (response.ok) {
                    const content = await response.text();
                    const hash = await computeSha256(content);

                    if (editor) {
                        editor.setValue(content, -1);
                        editor.clearSelection();
                    }

                    setLocalDraftImmediate(folder, filename, content);
                    setCachedFileContent(folder, filename, content, hash);

                    CLOUD_STATE.lastSavedHash = hash;
                    lastCloudSaveHash = hash;

                    metrics.storage.cloudReads++;
                    updateSaveIndicator();
                    highlightActiveFile();
                    Logger.info(`[Cloud] READ ${filename} | reads=${metrics.storage.cloudReads}`);
                    hideProgress();
                    return;
                } else {
                    const errData = await readErrorBody(response);
                    const message = formatServerError(errData, response.status);
                    Logger.warn(`Failed to load from cloud: ${message}`);
                }
            }
        } catch (e) {
            Logger.warn('Failed to load from cloud: ' + e.message);
        } finally {
            hideProgress();
        }
    }

    // Default: empty file
    if (editor) {
        editor.setValue('', -1);
    }
    highlightActiveFile();
}

function highlightActiveFile() {
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('active');
    });

    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');

    document.querySelectorAll('.file-item').forEach(item => {
        if (item.dataset.folder === folder && item.dataset.file === filename) {
            item.classList.add('active');
        }
    });
}

// ==================== CREATE/DELETE FILES ====================

async function createNewFile(filename) {
    const inputName = filename || '';
    if (!inputName || !inputName.trim()) {
        return;
    }

    let cleanName = inputName.trim();

    if (!cleanName.includes('.')) {
        cleanName += '.cpp';
    }

    cleanName = cleanName.replace(/[^a-zA-Z0-9._-]/g, '');

    if (!cleanName || cleanName === '.cpp') {
        alert('Invalid file name. Please use letters, numbers, and underscores.');
        return;
    }

    const folder = 'main';
    const key = getFileKey(folder, cleanName);

    if (CLOUD_STATE.files.has(key)) {
        alert(`File "${cleanName}" already exists.`);
        return;
    }

    const defaultContent = `// ${cleanName}
// Created on ${new Date().toLocaleDateString()}

#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");
    
    // Your code here
    
    getch();
    closegraph();
    return 0;
}
`;

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
                    Logger.success(`Created new file: ${cleanName}`);
                    await refreshCloudFiles();
                    await openFile(folder, cleanName);
                    return;
                }
            }
        } catch (e) {
            Logger.warn('Failed to save new file to cloud: ' + e.message);
        }
    }

    CLOUD_STATE.files.set(key, { folder, filename: cleanName });
    renderFileExplorer();
    await openFile(folder, cleanName);
    Logger.success(`Created new file: ${cleanName}`);
}

async function createNewFolder() {
    const folderName = prompt('Enter folder name:\n(e.g., projects, examples, homework)');

    if (!folderName || !folderName.trim()) {
        return;
    }

    let cleanName = folderName.trim().toLowerCase();
    cleanName = cleanName.replace(/[^a-z0-9_-]/g, '');

    if (!cleanName) {
        alert('Invalid folder name. Please use letters, numbers, and underscores.');
        return;
    }

    if (CLOUD_STATE.folders.has(cleanName)) {
        alert(`Folder "${cleanName}" already exists.`);
        return;
    }

    CLOUD_STATE.folders.add(cleanName);

    const defaultFilename = 'main.cpp';
    const defaultContent = `// ${cleanName}/${defaultFilename}
// Created on ${new Date().toLocaleDateString()}

#include <graphics.h>
#include <conio.h>

int main() {
    int gd = DETECT, gm;
    initgraph(&gd, &gm, "");
    
    // Your code here
    
    getch();
    closegraph();
    return 0;
}
`;

    setLocalDraft(cleanName, defaultFilename, defaultContent);

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
                    body: JSON.stringify({ folder: cleanName, filename: defaultFilename, content: defaultContent, hash })
                });

                if (response.ok) {
                    Logger.success(`Created new folder: ${cleanName}`);
                    await refreshCloudFiles();
                    await openFile(cleanName, defaultFilename);
                    return;
                }
            }
        } catch (e) {
            Logger.warn('Failed to create folder in cloud: ' + e.message);
        }
    }

    const key = getFileKey(cleanName, defaultFilename);
    CLOUD_STATE.files.set(key, { folder: cleanName, filename: defaultFilename });
    renderFileExplorer();
    await openFile(cleanName, defaultFilename);
    Logger.success(`Created new folder: ${cleanName}`);
}

async function deleteFile(folder, filename) {
    if (!confirm(`Delete "${filename}"?\nThis cannot be undone.`)) {
        return;
    }

    const key = getFileKey(folder, filename);

    if (isUserLoggedIn && supabaseClient) {
        try {
            const session = await getCachedSessionToken();
            if (session?.access_token) {
                const response = await fetch('/files/delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ folder, filename })
                });

                if (response.ok) {
                    Logger.success(`Deleted ${filename}`);
                }
            }
        } catch (e) {
            Logger.warn('Failed to delete from cloud: ' + e.message);
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

    const code = editor?.getValue() || '';
    const savedCode = localStorage.getItem('tc_code') || '';

    if (code === savedCode) {
        saveIndicator.classList.add('saved');
        saveText.textContent = 'Saved';
    } else {
        saveIndicator.classList.remove('saved');
        saveText.textContent = 'Unsaved';
    }
}


// ==================== SUPABASE AUTH - OPTIMIZED ====================

// Track last auth event to prevent duplicate processing
let lastAuthEvent = {
    type: null,
    timestamp: 0,
    userId: null
};

const AUTH_EVENT_DEBOUNCE_MS = 1000; // Ignore duplicate events within 1 second

async function initSupabaseAuth() {
    try {
        const response = await fetch('/api/auth/config');
        if (!response.ok) {
            const errData = await readErrorBody(response);
            const message = formatServerError(errData, response.status);
            Logger.warn(`Auth not configured on server: ${message}`);
            showStatus(`Auth unavailable: ${message}`, true, 6000);
            return;
        }

        const config = await response.json();

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

        script.onload = () => {
            supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

            Logger.info('Checking for existing Supabase session...');
            checkSession();

            // Listen for auth state changes with intelligent filtering
            supabaseClient.auth.onAuthStateChange((event, session) => {
                // CRITICAL FIX: Debounce duplicate events
                const now = Date.now();
                const isDuplicate = (
                    lastAuthEvent.type === event &&
                    lastAuthEvent.userId === session?.user?.id &&
                    (now - lastAuthEvent.timestamp) < AUTH_EVENT_DEBOUNCE_MS
                );

                if (isDuplicate) {
                    return; // Ignore duplicate event spam
                }

                // Update last event tracker
                lastAuthEvent = {
                    type: event,
                    timestamp: now,
                    userId: session?.user?.id || null
                };

                Logger.info(`Auth state changed: ${event}`);

                // Handle different event types
                if (event === 'SIGNED_IN') {
                    if (session?.user) {
                        setCachedSession(session);
                        updateLoginUI(true, session.user);

                        // Load files ONCE on initial sign-in
                        refreshCloudFiles().then(() => {
                            const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
                            const [folder, filename] = activeKey.split('/');
                            return openFile(folder, filename, { skipSave: true });
                        }).catch(() => { });
                    }
                } else if (event === 'TOKEN_REFRESHED') {
                    // Silent token refresh - just update cache, DON'T reload files
                    if (session?.user) {
                        setCachedSession(session);
                    }
                } else if (event === 'USER_UPDATED') {
                    if (session?.user) {
                        setCachedSession(session);
                        updateLoginUI(true, session.user);
                    }
                } else if (event === 'INITIAL_SESSION') {
                    if (session?.user) {
                        setCachedSession(session);
                        updateLoginUI(true, session.user);

                        // Load files ONCE on page load
                        refreshCloudFiles().then(() => {
                            const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
                            const [folder, filename] = activeKey.split('/');
                            return openFile(folder, filename, { skipSave: true });
                        }).catch(() => { });
                    }
                } else if (event === 'SIGNED_OUT') {
                    clearSessionCache();
                    updateLoginUI(false);
                }
            });

            Logger.info('Supabase auth initialized');
        };

        script.onerror = () => {
            Logger.warn('Failed to load Supabase client from CDN');
        };

        document.head.appendChild(script);
    } catch (e) {
        Logger.warn('Auth initialization failed: ' + e.message);
    }
}

async function checkSession() {
    if (!supabaseClient) return;

    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) {
            Logger.warn('Session lookup error: ' + error.message);
        }
        if (session?.user) {
            Logger.info('Active session found');
            setCachedSession(session);
            updateLoginUI(true, session.user);
        } else {
            Logger.info('No active session');
            updateLoginUI(false);
        }
    } catch (e) {
        Logger.warn('Session check failed');
        updateLoginUI(false);
    }
}

async function signInWithGoogle() {
    if (!supabaseClient) {
        alert('Authentication is not configured. Please try again later.');
        return;
    }

    try {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        Logger.info(`Starting Google sign-in (redirect: ${redirectTo})`);

        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo
            }
        });

        if (error) {
            Logger.error('Sign in failed: ' + error.message);
            alert('Sign in failed: ' + error.message);
        }
    } catch (e) {
        Logger.error('Sign in error: ' + e.message);
        alert('Sign in failed. Please try again.');
    }
}

async function signOut() {
    if (!supabaseClient) return;

    try {
        Logger.info('Signing out...');
        await forceSaveActiveFile();

        clearAllFileCache();
        clearSessionCache();

        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            Logger.error('Sign out failed: ' + error.message);
        } else {
            updateLoginUI(false);
            Logger.info('Signed out successfully');
        }
    } catch (e) {
        Logger.error('Sign out error: ' + e.message);
    }
}

// Google Sign-In button click handler
const googleSigninBtn = document.getElementById('google-signin-btn');
if (googleSigninBtn) {
    googleSigninBtn.addEventListener('click', async () => {
        await signInWithGoogle();
    });
}


// Initialize Cache & Auth
loadCachedFileList();
initSupabaseAuth();
