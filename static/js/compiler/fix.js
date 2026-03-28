(function () {
    'use strict';

    const GUEST_FINGERPRINT_KEY = 'graphicsh_ai_guest_id_v1';
    const MAX_FIX_BUTTON_ATTEMPTS = 3;
    const DEFAULT_TOAST_DURATION_MS = 15000;

    // ── State ──────────────────────────────────────────────────────────────────
    const FIX_STATE = {
        isBusy: false,
        fixAttempt: 0,
        currentError: '',
        preserveToastOnNextCompileSuccess: false,
        toastDurationMs: DEFAULT_TOAST_DURATION_MS,
    };

    // ── DOM refs ───────────────────────────────────────────────────────────────
    const fixBtn = document.getElementById('fix-with-ai-btn');
    const fixBtnText = document.getElementById('fix-ai-btn-text');
    const fixGeminiLogo = document.getElementById('fix-ai-gemini-logo');
    const toast = document.getElementById('fix-chat-toast');
    const toastBody = document.getElementById('fix-toast-body');
    const toastBar = document.getElementById('fix-toast-bar');
    const toastCloseBtn = document.getElementById('fix-toast-close-btn');

    if (!fixBtn) return;

    // ── Toast ──────────────────────────────────────────────────────────────────
    let toastTimer = null;

    function getToastDurationMs(payload) {
        const candidates = [
            payload?.toast_duration_ms,
            window.__AI_FIX_TOAST_DURATION_MS,
            DEFAULT_TOAST_DURATION_MS,
        ];

        for (const value of candidates) {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 1000) {
                return parsed;
            }
        }

        return DEFAULT_TOAST_DURATION_MS;
    }

    function showToast(message) {
        if (!toast || !toastBody) return;

        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }

        toastBody.textContent = message;

        // Restart the drain animation by replacing the bar with a fresh clone
        const progressWrap = toast.querySelector('.fix-toast-progress');
        if (progressWrap) {
            const oldBar = progressWrap.querySelector('.fix-toast-progress-bar');
            if (oldBar) oldBar.remove();
            const newBar = document.createElement('div');
            newBar.className = 'fix-toast-progress-bar';
            newBar.style.animationDuration = `${FIX_STATE.toastDurationMs}ms`;
            progressWrap.appendChild(newBar);
            // Force reflow so the browser registers the element before adding class
            void newBar.offsetWidth;
            newBar.classList.add('draining');
        }

        toast.style.setProperty('--fix-toast-duration', `${FIX_STATE.toastDurationMs}ms`);
        toast.classList.add('visible');
        FIX_STATE.preserveToastOnNextCompileSuccess = true;

        toastTimer = setTimeout(() => dismissToast(), FIX_STATE.toastDurationMs);
    }

    function dismissToast() {
        if (!toast) return;
        toast.classList.remove('visible');
        FIX_STATE.preserveToastOnNextCompileSuccess = false;
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
    }

    if (toastCloseBtn) {
        toastCloseBtn.addEventListener('click', dismissToast);
    }

    if (toast) {
        toast.addEventListener('click', (event) => {
            if (event.target === toast) {
                dismissToast();
            }
        });
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
        FIX_STATE.preserveToastOnNextCompileSuccess = false;
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
                    FIX_STATE.toastDurationMs = getToastDurationMs(payload);
                    setButtonExhausted('Too many errors — cool down');
                    showToast(errMsg);
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
            const chatMessage = payload?.chat || 'Fixed the compilation errors and updated your code.';
            FIX_STATE.toastDurationMs = getToastDurationMs(payload);

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

            // Trigger compile & run
            setButtonBusy(false);
            hideButton();

            // Set flag before runProgram so compiler-compile-success doesn't dismiss the toast
            FIX_STATE.preserveToastOnNextCompileSuccess = true;

            if (typeof runProgram === 'function') {
                try {
                    await runProgram();
                } catch (runErr) {
                    if (typeof Logger !== 'undefined') Logger.error('[Fix] runProgram failed', runErr);
                }
            }

            // Show chat message toast after compile/run so the timer starts when user can read it
            showToast(chatMessage);

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
        FIX_STATE.preserveToastOnNextCompileSuccess = false;
        fixBtn.disabled = false;
        fixBtn.style.display = '';
        fixBtnText.textContent = 'Fix with AI';
        if (fixGeminiLogo) fixGeminiLogo.style.opacity = '';
    });

    document.addEventListener('compiler-compile-success', () => {
        const shouldKeepToastVisible = FIX_STATE.preserveToastOnNextCompileSuccess;
        resetFixState();
        hideButton();
        if (!shouldKeepToastVisible) {
            dismissToast();
        }
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
