(function () {
    'use strict';

    const MAX_FIX_ATTEMPTS = 2;
    const GUEST_FINGERPRINT_KEY = 'graphicsh_ai_guest_id_v1';

    const aiMessages = document.getElementById('ai-messages');
    const aiEmptyState = document.getElementById('ai-empty-state');
    const aiStatusPill = document.getElementById('ai-status-pill');
    const aiActions = document.getElementById('ai-actions');
    const aiApplyBtn = document.getElementById('ai-apply-btn');
    const aiRejectBtn = document.getElementById('ai-reject-btn');
    const aiForm = document.getElementById('ai-form');
    const aiInput = document.getElementById('ai-input');
    const aiSendBtn = document.getElementById('ai-send-btn');
    const editorWrapperEl = document.getElementById('editor-wrapper');

    if (!aiMessages || !aiForm || !aiInput || !aiSendBtn || !aiStatusPill) {
        return;
    }

    const AI_STATE = {
        guestFingerprintId: '',
        sessionId: '',
        messages: [],
        isSending: false,
        hasConversation: false,
        currentVersion: '',
        currentFilename: '',
        lastDecision: null,
        preview: null,
    };

    window.__aiPreviewPending = false;
    window.__suppressCompileRunSave = false;

    function isLoggedInNow() {
        return typeof isUserLoggedIn !== 'undefined' && isUserLoggedIn === true;
    }

    function randomFragment() {
        return Math.random().toString(36).slice(2, 8);
    }

    function ensureGuestFingerprintId() {
        let current = localStorage.getItem(GUEST_FINGERPRINT_KEY);
        if (!current) {
            current = `fp_${Date.now()}_${randomFragment()}`;
            localStorage.setItem(GUEST_FINGERPRINT_KEY, current);
        }
        return current;
    }

    function createSessionId() {
        const prefix = isLoggedInNow() ? 'sess' : 'gs';
        return `${prefix}_${Date.now()}_${randomFragment()}`;
    }

    function formatRetrySeconds(value) {
        const totalSeconds = Number(value || 0);
        if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '';
        if (totalSeconds < 60) return `${totalSeconds}s`;
        const minutes = Math.ceil(totalSeconds / 60);
        return `${minutes}m`;
    }

    function buildAiErrorMessage(payload, response, rawText, fallbackMessage) {
        const retryAfter = response?.headers?.get?.('Retry-After');
        const retryWindow = payload?.debug?.retry_after_seconds || retryAfter || '';
        const retryText = formatRetrySeconds(retryWindow);

        if (payload?.code === 'API_DOWN' && retryText) {
            return `AI is temporarily busy. Retry in ${retryText}.`;
        }

        if (payload?.error) {
            return payload.error;
        }

        const trimmed = String(rawText || '').trim();
        if (trimmed) {
            return trimmed.slice(0, 180);
        }

        return fallbackMessage;
    }

    function logAiFailure(context, response, payload, rawText, extra = {}) {
        if (typeof Logger === 'undefined') return;

        const retryAfter = response?.headers?.get?.('Retry-After') || '';
        const contentType = response?.headers?.get?.('Content-Type') || '';
        const message = buildAiErrorMessage(payload, response, rawText, `${context} failed`);
        const summary = [
            `[AI] ${context} failed`,
            `status=${response?.status || '?'}`,
            `code=${payload?.code || 'unknown'}`,
            `retryAfter=${retryAfter || 'n/a'}`,
            `reason=${payload?.debug?.reason || 'n/a'}`,
            `message=${message}`
        ].join(' | ');

        Logger.error(summary, {
            payload,
            debug: payload?.debug || null,
            rawText: String(rawText || '').slice(0, 600),
            headers: {
                retryAfter,
                contentType,
                errorCode: response?.headers?.get?.('X-AI-Error-Code') || '',
            },
            ...extra,
        });
    }

    function setStatus(text, tone = 'idle') {
        aiStatusPill.textContent = text;
        aiStatusPill.dataset.tone = tone;
    }

    function setBusyState(isBusy) {
        AI_STATE.isSending = isBusy;
        aiSendBtn.disabled = isBusy;
        aiInput.disabled = isBusy;
        aiInput.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    }

    function syncPreviewChrome(active) {
        window.__aiPreviewPending = active;
        if (editorWrapperEl) {
            editorWrapperEl.classList.toggle('ai-preview-active', active);
        }
        if (aiActions) {
            aiActions.classList.toggle('hidden', !active);
        }
    }

    function scrollMessagesToBottom() {
        requestAnimationFrame(() => {
            aiMessages.scrollTop = aiMessages.scrollHeight;
        });
    }

    function createMetaChips(meta) {
        const fragment = document.createDocumentFragment();
        if (meta.version) {
            const chip = document.createElement('span');
            chip.className = 'ai-meta-chip';
            chip.textContent = meta.version;
            fragment.appendChild(chip);
        }
        if (meta.filename) {
            const chip = document.createElement('span');
            chip.className = 'ai-meta-chip';
            chip.textContent = meta.filename;
            fragment.appendChild(chip);
        }
        return fragment;
    }

    function renderMessages() {
        aiMessages.innerHTML = '';

        AI_STATE.messages.forEach((message) => {
            const wrapper = document.createElement('div');
            wrapper.className = `ai-message ${message.role}`;

            const row = document.createElement('div');
            row.className = 'ai-message-row';

            const avatar = document.createElement('div');
            avatar.className = 'ai-avatar';

            if (message.role === 'assistant') {
                const icon = document.createElement('img');
                icon.src = '/static/gemini.svg';
                icon.alt = '';
                icon.className = 'gemini-logo';
                avatar.appendChild(icon);
            } else if (message.role === 'user') {
                avatar.textContent = 'You';
            } else {
                avatar.textContent = '...';
            }

            const bubble = document.createElement('div');
            bubble.className = 'ai-bubble';
            bubble.textContent = message.text;

            row.appendChild(avatar);
            row.appendChild(bubble);
            wrapper.appendChild(row);

            if (message.meta && (message.meta.version || message.meta.filename)) {
                const meta = document.createElement('div');
                meta.className = 'ai-meta';
                meta.appendChild(createMetaChips(message.meta));
                wrapper.appendChild(meta);
            }

            aiMessages.appendChild(wrapper);
        });

        aiEmptyState.style.display = AI_STATE.messages.length ? 'none' : 'block';
        syncPreviewChrome(Boolean(AI_STATE.preview));
        scrollMessagesToBottom();
    }

    function pushMessage(role, text, meta = {}) {
        AI_STATE.messages.push({ role, text, meta });
        renderMessages();
    }

    function clearConversationState() {
        AI_STATE.messages = [];
        AI_STATE.hasConversation = false;
        AI_STATE.currentVersion = '';
        AI_STATE.currentFilename = '';
        AI_STATE.lastDecision = null;
        AI_STATE.preview = null;
        AI_STATE.sessionId = createSessionId();
        syncPreviewChrome(false);
        setStatus('Ready for a prompt', 'idle');
        setBusyState(false);
        renderMessages();
    }

    function getCurrentFileName() {
        return document.getElementById('current-file-name')?.textContent || 'main.cpp';
    }

    function snapshotActiveEditor() {
        const activeKey = (typeof CLOUD_STATE !== 'undefined' && CLOUD_STATE.activeFileKey) || 'root/main.cpp';
        const [folder, filename] = activeKey.split('/');
        const existingFile = (typeof CLOUD_STATE !== 'undefined' && CLOUD_STATE.files.get(activeKey))
            ? { ...CLOUD_STATE.files.get(activeKey) }
            : null;

        return {
            activeFileKey: activeKey,
            folder,
            filename,
            code: editor ? editor.getValue() : '',
            existingFile,
            displayName: getCurrentFileName(),
            lastSavedHash: typeof SAVE_STATE !== 'undefined' ? SAVE_STATE.lastSavedHash : null,
        };
    }

    async function ensureAiFolderId() {
        let aiFolderId = typeof findFolderIdByName === 'function' ? findFolderIdByName('AI') : null;
        if (aiFolderId) return aiFolderId;

        const { response, payload } = await fetchJson('/api/folder/create', {
            method: 'POST',
            body: JSON.stringify({ folder_name: 'AI' })
        });

        if (!response.ok) {
            if (response.status === 409) {
                await refreshCloudFiles(true);
                aiFolderId = typeof findFolderIdByName === 'function' ? findFolderIdByName('AI') : null;
                if (aiFolderId) return aiFolderId;
            }
            throw new Error(payload?.error || 'Failed to prepare AI folder');
        }

        if (typeof CLOUD_STATE !== 'undefined') {
            CLOUD_STATE.folderIdToName.set(payload.id, payload.folder_name);
            CLOUD_STATE.folderNameToId.set(payload.folder_name, payload.id);
            CLOUD_STATE.folders.add(payload.id);
        }
        if (typeof renderFileExplorer === 'function') renderFileExplorer();
        return payload.id;
    }

    function markPreviewClean() {
        if (typeof DIRTY_FLAG !== 'undefined') {
            DIRTY_FLAG.isDirty = false;
        }
        if (typeof updateEditorInfo === 'function') {
            updateEditorInfo();
        }
        if (typeof updateSaveIndicator === 'function') {
            updateSaveIndicator();
        }
    }

    async function showPreviewInEditor(payload, options = {}) {
        if (typeof Logger !== 'undefined') {
            Logger.info(`[AI] Rendering preview | version=${payload.version || '?'} | filename=${payload.filename || 'guest-preview'} | request=${payload.request_id || '?'}`);
        }
        const baseSnapshot = options.baseSnapshot || snapshotActiveEditor();
        const previousConversationFilename = options.previousConversationFilename || AI_STATE.currentFilename;
        let preview = {
            requestId: payload.request_id,
            version: payload.version,
            filename: payload.filename || previousConversationFilename || getCurrentFileName(),
            baseSnapshot,
            previousConversationFilename,
            autoFixAttempts: options.autoFixAttempts || 0,
            awaitingCompile: false,
            targetKey: baseSnapshot.activeFileKey,
            targetFolder: baseSnapshot.folder,
            targetFolderId: null,
            targetExistingFile: baseSnapshot.existingFile,
        };

        if (isLoggedInNow() && payload.filename) {
            const aiFolderId = await ensureAiFolderId();
            const aiFolderKey = folderKey(aiFolderId);
            const targetKey = fileKey(aiFolderKey, payload.filename);
            const existingTarget = CLOUD_STATE.files.get(targetKey) ? { ...CLOUD_STATE.files.get(targetKey) } : null;

            CLOUD_STATE.files.set(targetKey, {
                id: existingTarget?.id || null,
                filename: payload.filename,
                folder_id: aiFolderId,
                folder_key: aiFolderKey,
                folder_name: getFolderName(aiFolderId) || 'AI',
                content: payload.generated_code,
                file_size: computeBytes(payload.generated_code),
                content_hash: existingTarget?.content_hash || null,
            });
            await setLocalDraft(aiFolderKey, payload.filename, payload.generated_code);
            renderFileExplorer();
            await openFile(aiFolderKey, payload.filename, { skipSave: true });

            preview = {
                ...preview,
                filename: payload.filename,
                targetKey,
                targetFolder: aiFolderKey,
                targetFolderId: aiFolderId,
                targetExistingFile: existingTarget,
            };

            AI_STATE.currentFilename = payload.filename;
        } else {
            if (editor) {
                editor.setValue(payload.generated_code);
                editor.clearSelection();
            }
        }

        if (typeof SAVE_STATE !== 'undefined') {
            SAVE_STATE.lastSavedHash = null;
        }
        markPreviewClean();

        AI_STATE.preview = preview;
        AI_STATE.currentVersion = payload.version;
        AI_STATE.hasConversation = true;
        AI_STATE.lastDecision = null;
        syncPreviewChrome(true);
        pushMessage('assistant', payload.chat, {
            version: payload.version,
            filename: payload.filename || '',
        });
        setStatus('Compiling AI preview...', 'busy');
        await triggerPreviewRun();
    }

    async function triggerPreviewRun() {
        if (!AI_STATE.preview || typeof runProgram !== 'function') return;
        AI_STATE.preview.awaitingCompile = true;
        if (typeof Logger !== 'undefined') {
            Logger.info(`[AI] Auto-running preview | version=${AI_STATE.preview.version || '?'} | filename=${AI_STATE.preview.filename || 'main.cpp'}`);
        }
        try {
            window.__suppressCompileRunSave = true;
            await runProgram();
        } finally {
            window.__suppressCompileRunSave = false;
        }
    }

    async function recordAction(action) {
        if (!AI_STATE.preview?.requestId) return;
        if (typeof Logger !== 'undefined') {
            Logger.info(`[AI] Recording action | action=${action} | request=${AI_STATE.preview.requestId}`);
        }
        try {
            const { response, payload, rawText } = await fetchJson('/api/ai/action', {
                method: 'PATCH',
                headers: {
                    'X-AI-Debug': '1',
                },
                body: JSON.stringify({
                    request_id: AI_STATE.preview.requestId,
                    action,
                }),
            });

            if (!response.ok) {
                logAiFailure('Action tracking', response, payload, rawText, {
                    requestId: AI_STATE.preview.requestId,
                    action,
                });
            }
        } catch (error) {
            if (typeof Logger !== 'undefined') {
                Logger.warn(`[AI] Failed to record action: ${error.message}`);
            }
        }
    }

    async function restoreBaseSnapshot(snapshot) {
        if (!snapshot) return;

        if (isLoggedInNow() && snapshot.existingFile) {
            CLOUD_STATE.files.set(snapshot.activeFileKey, {
                ...snapshot.existingFile,
                content: snapshot.code,
            });
            await setLocalDraft(snapshot.folder, snapshot.filename, snapshot.code);
            renderFileExplorer();
            await openFile(snapshot.folder, snapshot.filename, { skipSave: true });
        } else if (editor) {
            editor.setValue(snapshot.code);
            editor.clearSelection();
        }

        if (typeof SAVE_STATE !== 'undefined') {
            SAVE_STATE.lastSavedHash = snapshot.lastSavedHash || null;
        }
        markPreviewClean();
    }

    async function applyPreview(action = 'apply', silent = false) {
        if (!AI_STATE.preview) return;
        if (typeof Logger !== 'undefined') {
            Logger.info(`[AI] Applying preview | action=${action} | filename=${AI_STATE.preview.filename || 'main.cpp'} | version=${AI_STATE.preview.version || '?'}`);
        }

        if (isLoggedInNow()) {
            if (typeof SAVE_STATE !== 'undefined') {
                SAVE_STATE.lastSavedHash = null;
            }
            if (typeof DIRTY_FLAG !== 'undefined') {
                DIRTY_FLAG.isDirty = true;
            }
            await forceSaveActiveFile('aiApply', { silent: true });
            renderFileExplorer();
        } else if (typeof persistLocalSave === 'function' && editor) {
            await persistLocalSave(editor.getValue());
        }

        await recordAction(action);
        AI_STATE.currentFilename = AI_STATE.preview.filename || AI_STATE.currentFilename;
        AI_STATE.preview = null;
        AI_STATE.lastDecision = action;
        syncPreviewChrome(false);
        setStatus(action === 'force_apply' ? 'Previous draft carried forward' : 'Draft applied', 'ready');
        if (!silent) {
            pushMessage('status', action === 'force_apply'
                ? 'Previous AI draft carried forward for the next edit.'
                : 'AI draft applied to the editor.');
        }
        renderMessages();
    }

    async function rejectPreview() {
        if (!AI_STATE.preview) return;
        if (typeof Logger !== 'undefined') {
            Logger.info(`[AI] Rejecting preview | filename=${AI_STATE.preview.filename || 'main.cpp'} | version=${AI_STATE.preview.version || '?'}`);
        }

        const preview = AI_STATE.preview;
        await recordAction('reject');

        if (isLoggedInNow()) {
            if (preview.targetExistingFile) {
                CLOUD_STATE.files.set(preview.targetKey, {
                    ...preview.targetExistingFile,
                });
                await setLocalDraft(preview.targetFolder, preview.filename, preview.targetExistingFile.content || '');
            } else if (preview.targetKey && preview.targetKey !== preview.baseSnapshot.activeFileKey) {
                CLOUD_STATE.files.delete(preview.targetKey);
                await clearLocalDraft(preview.targetFolder, preview.filename);
            }
        }

        AI_STATE.currentFilename = preview.previousConversationFilename || '';
        AI_STATE.preview = null;
        AI_STATE.lastDecision = 'reject';
        syncPreviewChrome(false);
        await restoreBaseSnapshot(preview.baseSnapshot);
        setStatus('Draft rejected', 'idle');
        pushMessage('status', 'AI draft rejected. The previous code was restored.');
        renderMessages();
    }

    async function sendManualPrompt(text) {
        const userText = text.trim();
        if (!userText || AI_STATE.isSending) return;

        if (AI_STATE.preview) {
            await applyPreview('force_apply', true);
        }

        const requestType = AI_STATE.hasConversation ? 'edit' : 'new';
        const baseSnapshot = snapshotActiveEditor();

        pushMessage('user', userText);
        aiInput.value = '';
        setBusyState(true);
        setStatus('Thinking...', 'busy');

        const body = {
            type: requestType,
            user_query: userText,
            session_id: AI_STATE.sessionId,
        };

        if (!isLoggedInNow()) {
            body.fingerprint_id = AI_STATE.guestFingerprintId;
        }

        if (requestType === 'edit') {
            if (AI_STATE.lastDecision !== 'reject' && editor?.getValue()) {
                body.current_code = editor.getValue();
            }
            if (isLoggedInNow() && AI_STATE.currentFilename) {
                body.filename = AI_STATE.currentFilename;
            }
        }

        AI_STATE.lastDecision = null;
        if (typeof Logger !== 'undefined') {
            Logger.info(`[AI] Sending prompt | type=${requestType} | loggedIn=${isLoggedInNow()} | session=${AI_STATE.sessionId} | filename=${body.filename || AI_STATE.currentFilename || 'n/a'} | chars=${userText.length}`);
        }

        try {
            const { response, payload, rawText } = await fetchJson('/api/ai', {
                method: 'POST',
                headers: {
                    'X-AI-Debug': '1',
                },
                body: JSON.stringify(body),
            });

            if (typeof Logger !== 'undefined') {
                Logger.info(`[AI] Response received | status=${response.status} | code=${payload?.code || 'ok'} | version=${payload?.version || '?'} | filename=${payload?.filename || 'guest-preview'} | request=${payload?.request_id || '?'}`);
            }

            if (!response.ok) {
                logAiFailure('Prompt request', response, payload, rawText, {
                    requestType,
                    sessionId: AI_STATE.sessionId,
                });
                throw new Error(buildAiErrorMessage(payload, response, rawText, 'AI request failed'));
            }

            await showPreviewInEditor(payload, {
                baseSnapshot,
                previousConversationFilename: AI_STATE.currentFilename,
                autoFixAttempts: 0,
            });
        } catch (error) {
            if (typeof Logger !== 'undefined') {
                Logger.error('[AI] Prompt request failed', error);
            }
            setStatus('Unable to generate code', 'error');
            pushMessage('status', error.message);
        } finally {
            setBusyState(false);
        }
    }

    async function sendAutoFix(errorText) {
        if (!AI_STATE.preview || AI_STATE.isSending) return;

        const preview = AI_STATE.preview;
        if (preview.autoFixAttempts >= MAX_FIX_ATTEMPTS) {
            preview.awaitingCompile = false;
            setStatus('Max auto-fix attempts reached', 'error');
            pushMessage('status', 'Max auto-fix attempts reached. Describe the issue manually.');
            return;
        }

        preview.autoFixAttempts += 1;
        preview.awaitingCompile = false;
        setBusyState(true);
        if (typeof Logger !== 'undefined') {
            Logger.warn(`[AI] Auto-fix requested | attempt=${preview.autoFixAttempts}/${MAX_FIX_ATTEMPTS} | filename=${AI_STATE.currentFilename || preview.filename || 'main.cpp'}`);
            Logger.warn(`[AI] Compiler error summary: ${(errorText || '').slice(0, 240)}`);
        }
        setStatus(`Auto-fixing attempt ${preview.autoFixAttempts}/${MAX_FIX_ATTEMPTS}...`, 'busy');
        pushMessage('status', `Auto-fixing attempt ${preview.autoFixAttempts}/${MAX_FIX_ATTEMPTS}...`);

        const body = {
            type: 'error',
            generated_code: editor ? editor.getValue() : '',
            error: errorText,
            fix_attempt: preview.autoFixAttempts,
            session_id: AI_STATE.sessionId,
        };

        if (!isLoggedInNow()) {
            body.fingerprint_id = AI_STATE.guestFingerprintId;
        }

        if (isLoggedInNow() && AI_STATE.currentFilename) {
            body.filename = AI_STATE.currentFilename;
        }

        try {
            const { response, payload, rawText } = await fetchJson('/api/ai', {
                method: 'POST',
                headers: {
                    'X-AI-Debug': '1',
                },
                body: JSON.stringify(body),
            });

            if (typeof Logger !== 'undefined') {
                Logger.info(`[AI] Auto-fix response | status=${response.status} | code=${payload?.code || 'ok'} | version=${payload?.version || '?'} | filename=${payload?.filename || 'guest-preview'}`);
            }

            if (!response.ok) {
                logAiFailure('Auto-fix request', response, payload, rawText, {
                    sessionId: AI_STATE.sessionId,
                    version: preview.version || '',
                });
                throw new Error(buildAiErrorMessage(payload, response, rawText, 'Auto-fix failed'));
            }

            await showPreviewInEditor(payload, {
                baseSnapshot: preview.baseSnapshot,
                previousConversationFilename: preview.previousConversationFilename,
                autoFixAttempts: preview.autoFixAttempts,
            });
        } catch (error) {
            if (typeof Logger !== 'undefined') {
                Logger.error('[AI] Auto-fix failed', error);
            }
            setStatus('Auto-fix failed', 'error');
            pushMessage('status', error.message);
        } finally {
            setBusyState(false);
        }
    }

    aiForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await sendManualPrompt(aiInput.value);
    });

    aiInput.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            await sendManualPrompt(aiInput.value);
        }
    });

    aiApplyBtn?.addEventListener('click', async () => {
        await applyPreview('apply');
    });

    aiRejectBtn?.addEventListener('click', async () => {
        await rejectPreview();
    });

    document.addEventListener('compiler-run-success', () => {
        if (!AI_STATE.preview || !AI_STATE.preview.awaitingCompile) return;
        AI_STATE.preview.awaitingCompile = false;
        if (typeof Logger !== 'undefined') {
            Logger.success(`[AI] Preview compiled successfully | version=${AI_STATE.preview.version || '?'}`);
        }
        setStatus('Preview ready to apply or reject', 'ready');
    });

    document.addEventListener('compiler-compilation-error', async (event) => {
        if (!AI_STATE.preview || !AI_STATE.preview.awaitingCompile) return;
        if (typeof Logger !== 'undefined') {
            Logger.warn(`[AI] Preview compilation failed | version=${AI_STATE.preview.version || '?'} | filename=${AI_STATE.preview.filename || 'main.cpp'}`);
        }
        await sendAutoFix(event.detail?.content || 'Compilation failed');
    });

    document.addEventListener('ai-panel-opened', () => {
        setTimeout(() => aiInput.focus(), 40);
    });

    document.addEventListener('auth-state-changed', () => {
        AI_STATE.guestFingerprintId = ensureGuestFingerprintId();
        if (typeof Logger !== 'undefined') {
            Logger.info('[AI] Auth state changed; resetting assistant session');
        }
        clearConversationState();
    });

    AI_STATE.guestFingerprintId = ensureGuestFingerprintId();
    if (typeof Logger !== 'undefined') {
        Logger.info('[AI] Assistant initialized');
    }
    clearConversationState();
})();
