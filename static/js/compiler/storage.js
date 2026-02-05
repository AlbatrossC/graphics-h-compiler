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
// Debounce timers for local draft saves to reduce write operations
const draftSaveTimers = new Map();
const DRAFT_SAVE_DEBOUNCE_MS = 100;

// Immediate local draft save (for critical saves)
function setLocalDraftImmediate(folder, filename, content) {
    try {
        localStorage.setItem(`draft_${folder}_${filename}`, content);
    } catch (e) {
        Logger.warn('Failed to save local draft');
    }
}

// Debounced local draft save (for typing - reduces write operations)
function setLocalDraft(folder, filename, content) {
    const key = getFileKey(folder, filename);

    // Clear existing timer
    if (draftSaveTimers.has(key)) {
        clearTimeout(draftSaveTimers.get(key));
    }

    // Schedule debounced save
    draftSaveTimers.set(key, setTimeout(() => {
        setLocalDraftImmediate(folder, filename, content);
        draftSaveTimers.delete(key);
    }, DRAFT_SAVE_DEBOUNCE_MS));
}

// Flush all pending draft saves immediately
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

// Show progress bar (indeterminate)
function showProgress() {
    if (progressBar && progressFill) {
        progressBar.classList.remove('hidden');
        progressFill.classList.add('indeterminate');
    }
}

// Hide progress bar
function hideProgress() {
    if (progressBar && progressFill) {
        progressFill.classList.remove('indeterminate');
        progressBar.classList.add('hidden');
    }
}

// Show status message (auto-hides after delay)
function showStatus(message, isError = false, duration = 3000) {
    if (statusMessage && statusText) {
        statusText.textContent = message;
        statusMessage.classList.remove('hidden', 'error');
        if (isError) {
            statusMessage.classList.add('error');
        }

        // Auto-hide after duration
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, duration);
    }
}

// ==================== SAVE FUNCTIONS ====================

// Unified save function - saves BOTH locally and to cloud
async function saveCode() {
    if (!editor) return;

    // Cancel any pending autosave since user explicitly clicked Save
    cancelPendingAutosave();

    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');

    // 1. Always save locally first (immediate)
    localStorage.setItem('tc_code', code);
    setLocalDraftImmediate(folder, filename, code);

    // 2. If logged in, also save to cloud
    if (isUserLoggedIn && supabaseClient) {
        showProgress();
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.access_token) {
                const hash = await computeSha256(code);

                // Skip if unchanged
                if (CLOUD_STATE.lastSavedHash === hash && lastCloudSaveHash === hash) {
                    showStatus('✓ Already saved');
                    hideProgress();
                    updateSaveIndicator();
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
                    CLOUD_STATE.lastSavedAt = Date.now();
                    CLOUD_STATE.lastSavedHash = hash;
                    lastCloudSaveHash = hash;
                    lastAutosaveTime = Date.now();

                    // Update file cache
                    setCachedFileContent(folder, filename, code, hash);

                    // Show success status
                    showStatus('✓ Saved to cloud!');
                    Logger.success('Code saved to cloud');
                } else {
                    const errData = await response.json().catch(() => ({}));
                    showStatus('Save failed', true);
                    Logger.warn(`Cloud save failed: ${errData.error || response.status}`);
                }
            }
        } catch (e) {
            showStatus('Save failed', true);
            Logger.warn('Cloud save error: ' + e.message);
        } finally {
            hideProgress();
        }
    } else {
        // Not logged in - just show local save status
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
        const { data: { session } } = await supabaseClient.auth.getSession();
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

            // Also save locally
            localStorage.setItem('tc_code', code);
            setLocalDraft(folder, filename, code);

            updateSaveIndicator();
        } else {
            const errData = await response.json().catch(() => ({}));
            Logger.error(`Cloud save failed: ${errData.error || response.status}`);
            alert('Failed to save to cloud. Please try again.');
        }
    } catch (e) {
        Logger.error('Cloud save error: ' + e.message);
        alert('Failed to save to cloud: ' + e.message);
    }
}

// ==================== OPTIMIZED AUTOSAVE SYSTEM ====================
// Pending save state to prevent redundant operations
let pendingSaveHash = null;
let isSaving = false;
let typingDebounceTimer = null;
let lastAutosaveTime = 0;
let lastCloudSaveHash = null;

// Force save active file (for autosave) - optimized with save locking
async function forceSaveActiveFile() {
    if (!editor || !isUserLoggedIn || !supabaseClient) return;

    // Prevent concurrent saves
    if (isSaving) {
        Logger.info('Save already in progress, skipping');
        return;
    }

    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');
    const hash = await computeSha256(code);

    // Skip if unchanged (check both cloud hash, pending hash, and last cloud save hash)
    if (CLOUD_STATE.lastSavedHash === hash || pendingSaveHash === hash || lastCloudSaveHash === hash) {
        Logger.info('Content unchanged, skipping cloud save');
        return;
    }

    // Mark this hash as pending to prevent duplicate saves
    pendingSaveHash = hash;
    isSaving = true;

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
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
            CLOUD_STATE.lastSavedAt = Date.now();
            CLOUD_STATE.lastSavedHash = hash;
            lastCloudSaveHash = hash;
            lastAutosaveTime = Date.now();

            // Use immediate save for autosave completion
            setLocalDraftImmediate(folder, filename, code);

            // Update file content cache
            setCachedFileContent(folder, filename, code, hash);

            updateSaveIndicator();

            if (result.skipped) {
                Logger.info('Autosave skipped (unchanged on server)');
            } else {
                Logger.info('Autosave complete');
            }
        }
    } catch (e) {
        Logger.warn('Autosave failed: ' + e.message);
    } finally {
        isSaving = false;
        pendingSaveHash = null;
    }
}

// Schedule autosave with typing debounce
// Waits TYPING_DEBOUNCE_MS after user stops typing, then schedules cloud save after AUTOSAVE_DELAY_MS
function scheduleAutosave() {
    // Clear any pending typing debounce timer
    if (typingDebounceTimer) {
        clearTimeout(typingDebounceTimer);
    }

    // Clear any pending autosave timer
    if (CLOUD_STATE.autosaveTimer) {
        clearTimeout(CLOUD_STATE.autosaveTimer);
    }

    // Wait for user to stop typing first
    typingDebounceTimer = setTimeout(() => {
        typingDebounceTimer = null;

        // Now schedule the actual autosave
        CLOUD_STATE.autosaveTimer = setTimeout(async () => {
            CLOUD_STATE.autosaveTimer = null;
            await forceSaveActiveFile();
        }, AUTOSAVE_DELAY_MS);

    }, TYPING_DEBOUNCE_MS);
}

// Cancel all pending autosave timers (called before Run, explicit Save, etc.)
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

// ==================== FILE EXPLORER FUNCTIONS ====================

// Refresh cloud files list
async function refreshCloudFiles() {
    if (!isUserLoggedIn || !supabaseClient) return;

    showProgress();
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
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
            CLOUD_STATE.files.clear();
            CLOUD_STATE.folders = new Set(['main']);

            if (data.files && Array.isArray(data.files)) {
                data.files.forEach(file => {
                    const key = getFileKey(file.folder, file.filename);
                    CLOUD_STATE.files.set(key, file);
                    CLOUD_STATE.folders.add(file.folder);
                });
            }

            renderFileExplorer();
            Logger.info(`Loaded ${CLOUD_STATE.files.size} files from cloud`);
        }
    } catch (e) {
        Logger.warn('Failed to refresh cloud files: ' + e.message);
    } finally {
        hideProgress();
    }
}

// Render file explorer UI - flat file list (folders hidden from UI)
function renderFileExplorer() {
    const mainFolderFiles = document.getElementById('main-folder-files');
    const filesCount = document.getElementById('files-count');
    if (!mainFolderFiles) return;

    mainFolderFiles.innerHTML = '';

    // If no files, show default main.cpp
    if (CLOUD_STATE.files.size === 0) {
        const defaultItem = createFileItem('main', 'main.cpp');
        mainFolderFiles.appendChild(defaultItem);
        if (filesCount) filesCount.textContent = '1 file';
        return;
    }

    // Flatten all files from all folders into a single list
    const allFiles = [];
    CLOUD_STATE.files.forEach((file, key) => {
        allFiles.push(file);
    });

    // Sort files alphabetically by filename
    allFiles.sort((a, b) => a.filename.localeCompare(b.filename));

    // Render all files in flat list
    allFiles.forEach(file => {
        const fileItem = createFileItem(file.folder, file.filename);
        mainFolderFiles.appendChild(fileItem);
    });

    // Update file count
    if (filesCount) {
        const count = allFiles.length;
        filesCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
    }
}

// Create file item element with download button
function createFileItem(folder, filename) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.folder = folder;
    item.dataset.file = filename;

    // Get file extension for styling
    const ext = filename.split('.').pop().toLowerCase();
    item.dataset.ext = ext;

    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    if (`${folder}/${filename}` === activeKey) {
        item.classList.add('active');
    }

    // Get file type icon color class
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

// Get appropriate icon class based on file extension
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

// Download file function - downloads current editor content
function downloadFile(folder, filename) {
    let content;

    // If this is the active file, use editor content (includes unsaved changes)
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    if (`${folder}/${filename}` === activeKey && editor) {
        content = editor.getValue();
    } else {
        // Try to get from cache or localStorage
        const cached = getCachedFileContent(folder, filename);
        if (cached) {
            content = cached.content;
        } else {
            content = getLocalDraft(folder, filename) || '';
        }
    }

    // Create blob and download
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

// Open a file with multi-tier caching: memory → localStorage → cloud
async function openFile(folder, filename, options = {}) {
    // Cancel pending autosave before switching files
    cancelPendingAutosave();

    if (!options.skipSave && isUserLoggedIn) {
        // Fire-and-forget save of current file (don't block file switch)
        forceSaveActiveFile().catch(e => {
            Logger.warn('Background save during file switch failed: ' + e.message);
        });
    }

    const key = getFileKey(folder, filename);
    CLOUD_STATE.activeFileKey = key;

    // TIER 1: Check memory cache first (fastest)
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
        // Cache in memory for next time
        setCachedFileContent(folder, filename, draft);
        updateSaveIndicator();
        highlightActiveFile();
        Logger.info(`Opened ${filename} from local draft`);
        return;
    }

    // TIER 3: Fetch from cloud (slowest, only if cache miss)
    if (isUserLoggedIn && supabaseClient) {
        showProgress();
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
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

                    // Update all cache layers
                    setLocalDraftImmediate(folder, filename, content);
                    setCachedFileContent(folder, filename, content, hash);

                    CLOUD_STATE.lastSavedHash = hash;
                    lastCloudSaveHash = hash;

                    updateSaveIndicator();
                    highlightActiveFile();
                    Logger.info(`Opened ${filename} from cloud`);
                    hideProgress();
                    return;
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

// ==================== CREATE FILE/FOLDER (SIMPLIFIED) ====================

async function createNewFile(filename) {
    const inputName = filename || '';
    if (!inputName || !inputName.trim()) {
        return;
    }

    // Clean and validate filename
    let cleanName = inputName.trim();

    // Add .cpp extension if no extension provided
    if (!cleanName.includes('.')) {
        cleanName += '.cpp';
    }

    // Remove any invalid characters
    cleanName = cleanName.replace(/[^a-zA-Z0-9._-]/g, '');

    if (!cleanName || cleanName === '.cpp') {
        alert('Invalid file name. Please use letters, numbers, and underscores.');
        return;
    }

    const folder = 'main';
    const key = getFileKey(folder, cleanName);

    // Check if file already exists
    if (CLOUD_STATE.files.has(key)) {
        alert(`File "${cleanName}" already exists.`);
        return;
    }

    // Default content for new file
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

    // Save locally first
    setLocalDraft(folder, cleanName, defaultContent);

    // If logged in, save to cloud
    if (isUserLoggedIn && supabaseClient) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
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

    // Update local state and open file
    CLOUD_STATE.files.set(key, { folder, filename: cleanName });
    renderFileExplorer();
    await openFile(folder, cleanName);
    Logger.success(`Created new file: ${cleanName}`);
}

async function createNewFolder() {
    // Show a simple prompt
    const folderName = prompt('Enter folder name:\n(e.g., projects, examples, homework)');

    if (!folderName || !folderName.trim()) {
        return; // User cancelled
    }

    // Clean and validate folder name
    let cleanName = folderName.trim().toLowerCase();
    cleanName = cleanName.replace(/[^a-z0-9_-]/g, '');

    if (!cleanName) {
        alert('Invalid folder name. Please use letters, numbers, and underscores.');
        return;
    }

    // Check if folder already exists
    if (CLOUD_STATE.folders.has(cleanName)) {
        alert(`Folder "${cleanName}" already exists.`);
        return;
    }

    // Add folder to state
    CLOUD_STATE.folders.add(cleanName);

    // Create a default file in the new folder
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

    // Save locally
    setLocalDraft(cleanName, defaultFilename, defaultContent);

    // If logged in, save to cloud
    if (isUserLoggedIn && supabaseClient) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
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

    // Update local state
    const key = getFileKey(cleanName, defaultFilename);
    CLOUD_STATE.files.set(key, { folder: cleanName, filename: defaultFilename });
    renderFileExplorer();
    await openFile(cleanName, defaultFilename);
    Logger.success(`Created new folder: ${cleanName}`);
}

// Delete a file
async function deleteFile(folder, filename) {
    if (!confirm(`Delete "${filename}"?\nThis cannot be undone.`)) {
        return;
    }

    const key = getFileKey(folder, filename);

    // Delete from cloud if logged in
    if (isUserLoggedIn && supabaseClient) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
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

    // Remove from local state
    CLOUD_STATE.files.delete(key);
    clearLocalDraft(folder, filename);

    // If we deleted the active file, switch to main.cpp
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
