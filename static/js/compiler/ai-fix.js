(function () {
    'use strict';

    const GUEST_FINGERPRINT_KEY = 'graphicsh_ai_guest_id_v1';
    const POLL_INTERVAL_MS = 1750;
    const MAX_POLL_ATTEMPTS = 90;
    const FIX_TOAST_DURATION_MS = 10000;
    const MAX_AUTO_RETRIES = 2;

    const state = {
        busy: false,
        currentError: '',
        currentJobId: '',
        lastExplanation: '',
        loadingTimer: null,
        loadingBaseText: '',
        awaitingAutoCompileResult: false,
        autoRetryCount: 0,
        isAutoRetrying: false,
    };

    const fixBtn = document.getElementById('fix-with-ai-btn');
    const fixBtnText = document.getElementById('fix-ai-btn-text');
    const fixGeminiLogo = document.getElementById('fix-ai-gemini-logo');
    const explanationPanel = document.getElementById('fix-ai-explanation');
    const explanationBody = document.getElementById('fix-ai-explanation-body');

    if (!fixBtn || !fixBtnText || !explanationPanel || !explanationBody) {
        return;
    }

    let activeToast = null;
    let toastTimer = null;

    function shortenMessage(message, maxLength = 110) {
        const text = String(message || '').replace(/\s+/g, ' ').trim();
        if (!text) {
            return 'Fix applied.';
        }

        const firstSentence = text.match(/^.*?[.!?](?:\s|$)/);
        const candidate = firstSentence ? firstSentence[0].trim() : text;
        if (candidate.length <= maxLength) {
            return candidate;
        }

        return `${candidate.slice(0, maxLength - 1).trim()}…`;
    }

    function dismissToast() {
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }
        if (activeToast) {
            activeToast.classList.add('fix-toast-exit');
            const toast = activeToast;
            activeToast = null;
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
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
        text.textContent = shortenMessage(message);

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

        toast.offsetHeight;
        toast.classList.add('fix-toast-enter');

        activeToast = toast;
        toastTimer = setTimeout(dismissToast, FIX_TOAST_DURATION_MS);
    }

    function getGuestFingerprintId() {
        try {
            let id = localStorage.getItem(GUEST_FINGERPRINT_KEY);
            if (!id) {
                id = `fp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                localStorage.setItem(GUEST_FINGERPRINT_KEY, id);
            }
            return id;
        } catch {
            return `fp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        }
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function requestJson(url, options) {
        if (typeof fetchJson === 'function') {
            return fetchJson(url, options);
        }

        const response = await fetch(url, {
            credentials: 'same-origin',
            ...options,
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        return { response, payload };
    }

    function hideButton() {
        fixBtn.style.display = 'none';
    }

    function showButton() {
        fixBtn.style.display = '';
    }

    function stopButtonAnimation() {
        if (state.loadingTimer) {
            clearInterval(state.loadingTimer);
            state.loadingTimer = null;
        }
        state.loadingBaseText = '';
        fixBtn.classList.remove('is-fixing');
    }

    function startButtonAnimation(baseText) {
        stopButtonAnimation();
        state.loadingBaseText = baseText;
        fixBtn.classList.add('is-fixing');

        let frame = 0;
        const frames = [`${baseText}.`, `${baseText}..`, `${baseText}...`];
        fixBtnText.textContent = frames[0];

        state.loadingTimer = setInterval(() => {
            frame = (frame + 1) % frames.length;
            fixBtnText.textContent = frames[frame];
        }, 420);
    }

    function setButtonState(text, disabled) {
        state.busy = disabled;
        fixBtn.disabled = disabled;
        fixBtnText.textContent = text;
        if (fixGeminiLogo) {
            fixGeminiLogo.style.opacity = disabled ? '0.5' : '';
        }
        if (!disabled) {
            stopButtonAnimation();
        }
    }

    function resetButton() {
        stopButtonAnimation();
        state.busy = false;
        fixBtn.disabled = false;
        fixBtnText.textContent = 'Fix with AI';
        if (fixGeminiLogo) {
            fixGeminiLogo.style.opacity = '';
        }
    }

    function showExplanation(message) {
        state.lastExplanation = message || '';
        explanationBody.textContent = '';
        explanationPanel.classList.add('hidden');
    }

    function hideExplanation() {
        state.lastExplanation = '';
        explanationBody.textContent = '';
        explanationPanel.classList.add('hidden');
    }

    function getCurrentCode() {
        if (typeof editor === 'undefined' || !editor) {
            return '';
        }
        return editor.getValue();
    }

    function getFingerprintQuery() {
        return `fingerprint_id=${encodeURIComponent(getGuestFingerprintId())}`;
    }

    function buildStatusUrl(jobId) {
        return `/api/ai/fix/${encodeURIComponent(jobId)}?${getFingerprintQuery()}`;
    }

    function handleApiFailure(response, payload) {
        const errorMessage = payload?.error || 'Fix with AI failed. Please try again.';

        if (response.status === 429) {
            throw new Error(errorMessage);
        }

        if (response.status === 401) {
            throw new Error(errorMessage);
        }

        throw new Error(errorMessage);
    }

    async function createFixJob(code, errorText) {
        const body = {
            code,
            error: errorText,
            fingerprint_id: getGuestFingerprintId(),
        };

        const { response, payload } = await requestJson('/api/ai/fix', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            handleApiFailure(response, payload);
        }

        if (!payload?.job_id) {
            throw new Error('Fix job was created without a job id.');
        }

        return payload;
    }

    async function pollFixJob(jobId) {
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
            const { response, payload } = await requestJson(buildStatusUrl(jobId), {
                method: 'GET',
                cache: 'no-cache',
            });

            if (!response.ok) {
                handleApiFailure(response, payload);
            }

            if (!payload?.status) {
                throw new Error('Fix job returned an invalid status response.');
            }

            if (payload.status === 'done' || payload.status === 'failed') {
                return payload;
            }

            await delay(POLL_INTERVAL_MS);
        }

        throw new Error('Fix with AI is taking too long. Please try again.');
    }

    function applyFixedCode(fixedCode) {
        if (typeof editor === 'undefined' || !editor) {
            throw new Error('Editor is not ready yet.');
        }

        editor.setValue(fixedCode);
        if (typeof editor.focus === 'function') {
            editor.focus();
        }
    }

    async function autoCompileFixedCode() {
        if (typeof runProgram !== 'function') {
            return;
        }

        state.awaitingAutoCompileResult = true;
        setButtonState('Compiling...', true);
        startButtonAnimation('Compiling');
        await runProgram();
    }

    async function triggerFix(options = {}) {
        if (state.busy) {
            return;
        }

        const errorText = state.currentError;
        const code = getCurrentCode();
        const isAutoRetry = options.isAutoRetry === true;

        if (!errorText || !code.trim()) {
            return;
        }

        if (!isAutoRetry) {
            state.autoRetryCount = 0;
            state.isAutoRetrying = false;
        }

        state.currentJobId = '';
        setButtonState('Starting...', true);
        startButtonAnimation('Starting');

        try {
            const job = await createFixJob(code, errorText);
            state.currentJobId = job.job_id;

            if (job.status === 'done') {
                const immediateResult = await requestJson(buildStatusUrl(job.job_id), {
                    method: 'GET',
                    cache: 'no-cache',
                });
                if (!immediateResult.response.ok) {
                    handleApiFailure(immediateResult.response, immediateResult.payload);
                }
                applyFixedCode(immediateResult.payload.fixed_code || '');
                showExplanation(immediateResult.payload.explanation || 'Fix applied.');
                await autoCompileFixedCode();
            } else {
                setButtonState('Fixing...', true);
                startButtonAnimation('Fixing');
                const result = await pollFixJob(job.job_id);

                if (result.status === 'failed') {
                    throw new Error(result.error || 'Fix with AI could not repair this error.');
                }

                applyFixedCode(result.fixed_code || '');
                showExplanation(result.explanation || 'Fix applied.');
                await autoCompileFixedCode();
            }
        } catch (error) {
            state.awaitingAutoCompileResult = false;
            resetButton();
            showButton();
            state.isAutoRetrying = false;
            showFixToast(
                error instanceof Error
                    ? error.message
                    : 'Fix with AI could not repair this error.'
            );
            if (typeof Logger !== 'undefined') {
                Logger.error('[Fix] Async fix flow failed', error);
            }
        }
    }

    document.addEventListener('compiler-compilation-error', (event) => {
        state.currentError = event.detail?.content || '';
        state.currentJobId = '';

        if (state.awaitingAutoCompileResult) {
            state.awaitingAutoCompileResult = false;

            if (state.autoRetryCount < MAX_AUTO_RETRIES) {
                state.autoRetryCount += 1;
                state.isAutoRetrying = true;
                showButton();
                showFixToast(`Retrying fix ${state.autoRetryCount}/${MAX_AUTO_RETRIES}...`);
                resetButton();
                triggerFix({ isAutoRetry: true });
                return;
            }

            state.isAutoRetrying = false;
            resetButton();
            showButton();
            showFixToast('Auto-fix retries are exhausted. Review the latest compiler error and try again.');
            return;
        }

        state.autoRetryCount = 0;
        state.isAutoRetrying = false;
        resetButton();
        showButton();
    });

    document.addEventListener('compiler-compile-success', () => {
        state.currentError = '';
        state.currentJobId = '';

        if (state.awaitingAutoCompileResult) {
            state.awaitingAutoCompileResult = false;
            state.autoRetryCount = 0;
            state.isAutoRetrying = false;
            resetButton();
            hideButton();
            showFixToast(state.lastExplanation || 'Fix applied.');
            return;
        }

        state.autoRetryCount = 0;
        state.isAutoRetrying = false;
        resetButton();
        hideButton();
    });

    document.addEventListener('compiler-run-success', () => {
        state.currentError = '';
        state.currentJobId = '';

        if (state.awaitingAutoCompileResult) {
            state.awaitingAutoCompileResult = false;
            state.autoRetryCount = 0;
            state.isAutoRetrying = false;
            resetButton();
            hideButton();
            showFixToast(state.lastExplanation || 'Fix applied.');
            return;
        }

        state.autoRetryCount = 0;
        state.isAutoRetrying = false;
        resetButton();
        hideButton();
    });

    fixBtn.addEventListener('click', () => {
        triggerFix({ isAutoRetry: false });
    });

    hideButton();
    hideExplanation();
})();
