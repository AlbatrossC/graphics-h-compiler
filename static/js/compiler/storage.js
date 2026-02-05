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

// Local draft management
function setLocalDraft(folder, filename, content) {
    try {
        localStorage.setItem(`draft_${folder}_${filename}`, content);
    } catch (e) {
        Logger.warn('Failed to save local draft');
    }
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

    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');

    // 1. Always save locally first
    localStorage.setItem('tc_code', code);
    setLocalDraft(folder, filename, code);

    // 2. If logged in, also save to cloud
    if (isUserLoggedIn && supabaseClient) {
        showProgress();
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session?.access_token) {
                const hash = await computeSha256(code);

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

                    // Show success status
                    showStatus('✓ Files saved!');
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

// Force save active file (for autosave)
async function forceSaveActiveFile() {
    if (!editor || !isUserLoggedIn || !supabaseClient) return;

    const code = editor.getValue();
    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    const [folder, filename] = activeKey.split('/');
    const hash = await computeSha256(code);

    // Skip if unchanged
    if (CLOUD_STATE.lastSavedHash === hash) {
        return;
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session?.access_token) return;

        const response = await fetch('/files/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ folder, filename, content: code, hash })
        });

        if (response.ok) {
            CLOUD_STATE.lastSavedAt = Date.now();
            CLOUD_STATE.lastSavedHash = hash;
            setLocalDraft(folder, filename, code);
            updateSaveIndicator();
            Logger.info('Autosave complete');
        }
    } catch (e) {
        Logger.warn('Autosave failed: ' + e.message);
    }
}

// Schedule autosave
function scheduleAutosave() {
    if (CLOUD_STATE.autosaveTimer) {
        clearTimeout(CLOUD_STATE.autosaveTimer);
    }

    CLOUD_STATE.autosaveTimer = setTimeout(async () => {
        await forceSaveActiveFile();
    }, AUTOSAVE_DELAY_MS);
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

// Render file explorer UI
function renderFileExplorer() {
    const mainFolderFiles = document.getElementById('main-folder-files');
    if (!mainFolderFiles) return;

    mainFolderFiles.innerHTML = '';

    // Group files by folder
    const folders = new Map();
    CLOUD_STATE.files.forEach((file, key) => {
        if (!folders.has(file.folder)) {
            folders.set(file.folder, []);
        }
        folders.get(file.folder).push(file);
    });

    // If no files, show default main.cpp
    if (CLOUD_STATE.files.size === 0) {
        const defaultItem = createFileItem('main', 'main.cpp');
        mainFolderFiles.appendChild(defaultItem);
        return;
    }

    // Render main folder files
    const mainFiles = folders.get('main') || [];
    mainFiles.forEach(file => {
        const fileItem = createFileItem(file.folder, file.filename);
        mainFolderFiles.appendChild(fileItem);
    });
}

// Create file item element
function createFileItem(folder, filename) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.folder = folder;
    item.dataset.file = filename;

    const activeKey = CLOUD_STATE.activeFileKey || 'main/main.cpp';
    if (`${folder}/${filename}` === activeKey) {
        item.classList.add('active');
    }

    item.innerHTML = `
        <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span class="file-name">${filename}</span>
        <button class="file-delete-btn" title="Delete file" onclick="event.stopPropagation(); deleteFile('${folder}', '${filename}')">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
        </button>
    `;

    item.addEventListener('click', () => openFile(folder, filename));
    return item;
}

// Open a file
async function openFile(folder, filename, options = {}) {
    if (!options.skipSave && isUserLoggedIn) {
        await forceSaveActiveFile();
    }

    const key = getFileKey(folder, filename);
    CLOUD_STATE.activeFileKey = key;

    // Try local draft first
    const draft = getLocalDraft(folder, filename);
    if (draft !== null) {
        if (editor) {
            editor.setValue(draft, -1);
            editor.clearSelection();
        }
        updateSaveIndicator();
        highlightActiveFile();
        Logger.info(`Opened ${filename} from local draft`);
        return;
    }

    // Try cloud
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
                    if (editor) {
                        editor.setValue(content, -1);
                        editor.clearSelection();
                    }
                    setLocalDraft(folder, filename, content);
                    CLOUD_STATE.lastSavedHash = await computeSha256(content);
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

async function createNewFile() {
    // Show a simple prompt for the file name
    const filename = prompt('Enter file name:\n(e.g., mycode.cpp, test.c, program.cpp)');

    if (!filename || !filename.trim()) {
        return; // User cancelled
    }

    // Clean and validate filename
    let cleanName = filename.trim();

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
