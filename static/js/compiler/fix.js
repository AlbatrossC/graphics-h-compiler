(function () {
    'use strict';

    const GUEST_FINGERPRINT_KEY = 'graphicsh_ai_guest_id_v1';
    const MAX_FIX_BUTTON_ATTEMPTS = 3;
    const FIX_TOAST_DURATION_MS = 10000;

    // ── State ──────────────────────────────────────────────────────────────────
    const FIX_STATE = {
        isBusy: false,
        fixAttempt: 0,
        currentError: '',
        pendingChat: '',       // chat message waiting for compile success
        awaitingCompile: false, // true while waiting for post-fix compile result
    };

    // ── DOM refs ───────────────────────────────────────────────────────────────
    const fixBtn = document.getElementById('fix-with-ai-btn');
    const fixBtnText = document.getElementById('fix-ai-btn-text');
    const fixGeminiLogo = document.getElementById('fix-ai-gemini-logo');

    if (!fixBtn) return;

    // ── Toast ──────────────────────────────────────────────────────────────────

    let activeToast = null;
    let toastTimer = null;

    function dismissToast() {
        if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
        if (activeToast) {
            activeToast.classList.add('fix-toast-exit');
            const el = activeToast;
            activeToast = null;
            setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
        }
    }

    function showFixToast(message) {
        dismissToast();

        const toast = document.createElement('div');
        toast.className = 'fix-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        const icon = document.createElement('img');
        icon.src = '/static/gemini.svg';
        icon.alt = '';
        icon.className = 'fix-toast-icon';

        const text = document.createElement('span');
        text.className = 'fix-toast-text';
        text.textContent = message;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fix-toast-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        closeBtn.addEventListener('click', dismissToast);

        toast.appendChild(icon);
        toast.appendChild(text);
        toast.appendChild(closeBtn);
        document.body.appendChild(toast);

        // Force reflow then animate in
        toast.offsetHeight; // eslint-disable-line no-unused-expressions
        toast.classList.add('fix-toast-enter');

        activeToast = toast;

        toastTimer = setTimeout(dismissToast, FIX_TOAST_DURATION_MS);
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    function getGuestFingerprintId() {
        try {
            let id = localStorage.getItem(GUEST_FINGERPRINT_KEY);
            if (!id) {
                id = `fp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                localStorage.setItem(GUEST_FINGERPRINT_KEY, id);
            }
            return id;
        } catch {
            return `fp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        }
    }

    function isLoggedIn() {
        return typeof isUserLoggedIn !== 'undefined' && isUserLoggedIn === true;
    }

    function setButtonBusy(busy) {
        FIX_STATE.isBusy = busy;
        fixBtn.disabled = busy;
        if (busy) {
            fixBtnText.textContent = 'Fixing...';
            if (fixGeminiLogo) fixGeminiLogo.style.opacity = '0.5';
        } else {
            fixBtnText.textContent = 'Fix with AI';
            if (fixGeminiLogo) fixGeminiLogo.style.opacity = '';
        }
    }

    function setButtonFailed(message) {
        FIX_STATE.isBusy = false;
        fixBtn.disabled = false;
        fixBtnText.textContent = message || 'Fix failed — retry';
        if (fixGeminiLogo) fixGeminiLogo.style.opacity = '';
    }

    function setButtonExhausted(message) {
        FIX_STATE.isBusy = false;
        fixBtn.disabled = true;
        fixBtnText.textContent = message || "Can't fix — ask another";
        if (fixGeminiLogo) fixGeminiLogo.style.opacity = '0.4';
    }

    function resetFixState() {
        FIX_STATE.fixAttempt = 0;
        FIX_STATE.currentError = '';
        FIX_STATE.isBusy = false;
        fixBtn.disabled = false;
        fixBtnText.textContent = 'Fix with AI';
        if (fixGeminiLogo) fixGeminiLogo.style.opacity = '';
        fixBtn.style.display = '';
    }

    function hideButton() {
        fixBtn.style.display = 'none';
    }

    // ── Core fix flow ──────────────────────────────────────────────────────────

    async function triggerFix() {
        if (FIX_STATE.isBusy) return;

        const errorText = FIX_STATE.currentError;
        if (!errorText) return;

        const code = typeof editor !== 'undefined' && editor ? editor.getValue() : '';
        if (!code.trim()) return;

        FIX_STATE.fixAttempt += 1;

        if (FIX_STATE.fixAttempt > MAX_FIX_BUTTON_ATTEMPTS) {
            setButtonExhausted("My bad, I can't fix this — ask another");
            return;
        }

        setButtonBusy(true);

        const body = {
            editor_code: code,
            error: errorText,
            fix_attempt: FIX_STATE.fixAttempt,
        };

        if (!isLoggedIn()) {
            body.fingerprint_id = getGuestFingerprintId();
        }

        try {
            const { response, payload } = await fetchJson('/api/ai/fix', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errCode = payload?.code || '';
                const errMsg = payload?.error || 'AI fix failed. Please try again.';

                if (errCode === 'LIMIT_REACHED' || response.status === 429) {
                    setButtonExhausted('Too many errors — cool down');
                    if (typeof Logger !== 'undefined') Logger.warn('[Fix] Rate limit: ' + errMsg);
                    return;
                }

                if (errCode === 'FIX_ATTEMPTS_EXCEEDED') {
                    setButtonExhausted("My bad, I can't fix this — ask another");
                    return;
                }

                throw new Error(errMsg);
            }

            const fixedCode = payload?.fixed_code;
            const chatMessage = payload?.chat || '';

            if (!fixedCode) {
                throw new Error('AI returned empty fix');
            }

            // Apply fixed code into editor
            if (typeof editor !== 'undefined' && editor) {
                editor.setValue(fixedCode);
                if (typeof Logger !== 'undefined') {
                    Logger.success(`[Fix] Applied attempt ${FIX_STATE.fixAttempt}/${MAX_FIX_BUTTON_ATTEMPTS}`);
                }
            }

            // Store chat and mark awaiting compile — toast shows after compile success
            FIX_STATE.pendingChat = chatMessage;
            FIX_STATE.awaitingCompile = true;

            // Trigger compile & run
            setButtonBusy(false);
            hideButton();

            if (typeof runProgram === 'function') {
                try {
                    await runProgram();
                } catch (runErr) {
                    if (typeof Logger !== 'undefined') Logger.error('[Fix] runProgram failed', runErr);
                    // Show toast anyway on run failure so the user still sees the message
                    if (FIX_STATE.pendingChat) {
                        showFixToast(FIX_STATE.pendingChat);
                        FIX_STATE.pendingChat = '';
                        FIX_STATE.awaitingCompile = false;
                    }
                }
            }

        } catch (err) {
            if (typeof Logger !== 'undefined') Logger.error('[Fix] Fix request failed', err?.message || err);
            setButtonFailed('Fix failed — retry');
        }
    }

    // ── Error panel integration ────────────────────────────────────────────────

    document.addEventListener('compiler-compilation-error', (event) => {
        const errorContent = event.detail?.content || '';
        FIX_STATE.currentError = errorContent;
        FIX_STATE.fixAttempt = 0;
        FIX_STATE.isBusy = false;
        fixBtn.disabled = false;
        fixBtn.style.display = '';
        fixBtnText.textContent = 'Fix with AI';
        if (fixGeminiLogo) fixGeminiLogo.style.opacity = '';

        // If there was a pending chat from a fix that failed to compile, show it now
        if (FIX_STATE.awaitingCompile && FIX_STATE.pendingChat) {
            showFixToast(FIX_STATE.pendingChat);
            FIX_STATE.pendingChat = '';
            FIX_STATE.awaitingCompile = false;
        }
    });

    document.addEventListener('compiler-compile-success', () => {
        // Show the pending fix toast now that compile succeeded
        if (FIX_STATE.awaitingCompile && FIX_STATE.pendingChat) {
            showFixToast(FIX_STATE.pendingChat);
            FIX_STATE.pendingChat = '';
            FIX_STATE.awaitingCompile = false;
        }
        resetFixState();
        hideButton();
    });

    document.addEventListener('compiler-run-success', () => {
        resetFixState();
        hideButton();
    });

    fixBtn.addEventListener('click', () => {
        triggerFix();
    });

    // Hidden by default — only visible when there's an error
    hideButton();

})();
