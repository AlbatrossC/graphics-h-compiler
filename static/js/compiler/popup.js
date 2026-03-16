(function () {
    'use strict';

    const STORAGE_KEY = 'ai_poll_voted';
    const POPUP_ID = 'ai-poll-popup';
    const SUPABASE_SCRIPT_ID = 'ai-poll-supabase-script';
    const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    const DISPLAY_DELAY_MS = 1200;

    let popupMounted = false;

    function shouldSkipPopup() {
        return localStorage.getItem(STORAGE_KEY) === 'true' || document.getElementById(POPUP_ID);
    }

    function loadSupabaseScript() {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            return Promise.resolve();
        }

        const existingScript = document.getElementById(SUPABASE_SCRIPT_ID);
        if (existingScript) {
            return new Promise((resolve, reject) => {
                existingScript.addEventListener('load', resolve, { once: true });
                existingScript.addEventListener('error', () => reject(new Error('Failed to load Supabase library')), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.id = SUPABASE_SCRIPT_ID;
            script.src = SUPABASE_CDN_URL;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Supabase library'));
            document.head.appendChild(script);
        });
    }

    async function loadSupabaseConfig() {
        const response = await fetch('/api/auth/config', {
            credentials: 'same-origin',
            cache: 'no-cache',
        });

        if (!response.ok) {
            throw new Error('Failed to load project configuration');
        }

        const config = await response.json();
        if (!config.supabaseUrl || !config.supabaseAnonKey) {
            throw new Error('Supabase is not configured');
        }

        return config;
    }

    async function createSupabaseClient() {
        const [config] = await Promise.all([loadSupabaseConfig(), loadSupabaseScript()]);
        return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    }

    function closePopup() {
        const popup = document.getElementById(POPUP_ID);
        if (popup) {
            popup.remove();
        }
        popupMounted = false;
    }

    function createPopup() {
        const wrapper = document.createElement('div');
        wrapper.id = POPUP_ID;
        wrapper.setAttribute('aria-live', 'polite');

        wrapper.innerHTML = `
            <style>
                #${POPUP_ID} {
                    position: fixed;
                    right: 20px;
                    bottom: 20px;
                    width: min(520px, calc(100vw - 32px));
                    z-index: 9999;
                    font-family: "JetBrains Mono", monospace;
                    color: #132238;
                }

                #${POPUP_ID} .ai-poll-card {
                    background: #ffffff;
                    border: 1px solid rgba(19, 34, 56, 0.12);
                    border-radius: 14px;
                    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.14);
                    padding: 14px;
                }

                #${POPUP_ID} .ai-poll-layout {
                    display: flex;
                    gap: 14px;
                    align-items: flex-start;
                }

                #${POPUP_ID} .ai-poll-main {
                    flex: 1;
                    min-width: 0;
                }

                #${POPUP_ID} .ai-poll-topbar {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 8px;
                }

                #${POPUP_ID} .ai-poll-heading {
                    margin: 0;
                    font-size: 12px;
                    font-weight: 700;
                    color: #50627a;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                #${POPUP_ID} .ai-poll-close {
                    flex: 0 0 auto;
                    border: 0;
                    border-radius: 999px;
                    background: #eef2f7;
                    color: #50627a;
                    font: inherit;
                    font-size: 12px;
                    line-height: 1;
                    font-weight: 700;
                    padding: 7px 10px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    white-space: nowrap;
                }

                #${POPUP_ID} .ai-poll-question {
                    margin: 0 0 12px;
                    font-size: 13px;
                    line-height: 1.5;
                }

                #${POPUP_ID} .ai-poll-options {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-bottom: 10px;
                }

                #${POPUP_ID} .ai-poll-option {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 10px;
                    border: 1px solid #d6dde8;
                    border-radius: 10px;
                    background: #f8fafc;
                    cursor: pointer;
                    transition: border-color 0.2s ease, background-color 0.2s ease;
                }

                #${POPUP_ID} .ai-poll-option:has(input:checked) {
                    border-color: #2563eb;
                    background: #eff6ff;
                }

                #${POPUP_ID} .ai-poll-option input {
                    margin: 0;
                }

                #${POPUP_ID} .ai-poll-textarea {
                    width: 100%;
                    min-height: 68px;
                    padding: 10px;
                    border: 1px solid #d6dde8;
                    border-radius: 10px;
                    resize: vertical;
                    font: inherit;
                    font-size: 12px;
                    color: inherit;
                    background: #ffffff;
                    box-sizing: border-box;
                }

                #${POPUP_ID} .ai-poll-textarea:focus,
                #${POPUP_ID} .ai-poll-submit:focus {
                    outline: 2px solid rgba(37, 99, 235, 0.22);
                    outline-offset: 2px;
                }

                #${POPUP_ID} .ai-poll-footer {
                    margin-top: 10px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                #${POPUP_ID} .ai-poll-submit {
                    border: 0;
                    border-radius: 10px;
                    padding: 10px 12px;
                    background: #2563eb;
                    color: #ffffff;
                    font: inherit;
                    font-size: 12px;
                    font-weight: 700;
                    cursor: pointer;
                    white-space: nowrap;
                }

                #${POPUP_ID} .ai-poll-submit[disabled] {
                    opacity: 0.7;
                    cursor: wait;
                }

                #${POPUP_ID} .ai-poll-status {
                    min-height: 16px;
                    margin: 0;
                    font-size: 12px;
                    color: #b42318;
                    flex: 1;
                }

                #${POPUP_ID} .ai-poll-placeholder {
                    margin: 0;
                    font-size: 13px;
                    line-height: 1.6;
                    color: #50627a;
                }

                @media (max-width: 640px) {
                    #${POPUP_ID} {
                        right: 12px;
                        bottom: 12px;
                        width: calc(100vw - 24px);
                    }

                    #${POPUP_ID} .ai-poll-layout {
                        display: block;
                    }

                    #${POPUP_ID} .ai-poll-footer {
                        display: grid;
                    }
                }
            </style>
            <div class="ai-poll-card">
                <div class="ai-poll-content">
                    <div class="ai-poll-layout">
                        <div class="ai-poll-main">
                            <div class="ai-poll-topbar">
                                <p class="ai-poll-heading">Quick question for users 👋</p>
                                <button type="button" class="ai-poll-close" aria-label="Close poll"><span aria-hidden="true">×</span><span>Close</span></button>
                            </div>
                            <p class="ai-poll-question">I'm thinking of adding an AI assistant to this website to help you write and generate your code here. What do you think, should I add this feature?</p>
                    <form class="ai-poll-form">
                        <div class="ai-poll-options" role="radiogroup" aria-label="AI feature poll">
                            <label class="ai-poll-option">
                                <input type="radio" name="ai-poll-vote" value="yes" />
                                <span>Yes, add it</span>
                            </label>
                            <label class="ai-poll-option">
                                <input type="radio" name="ai-poll-vote" value="no" />
                                <span>No, not needed</span>
                            </label>
                        </div>
                        <textarea class="ai-poll-textarea" name="message" placeholder="If you have suggestions for the AI feature, you can write them here (optional)."></textarea>
                        <div class="ai-poll-footer">
                            <button type="submit" class="ai-poll-submit">Submit Vote</button>
                            <p class="ai-poll-status" data-status></p>
                        </div>
                    </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return wrapper;
    }

    async function handleSubmit(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const submitButton = form.querySelector('.ai-poll-submit');
        const status = form.querySelector('[data-status]');
        const selectedVote = form.querySelector('input[name="ai-poll-vote"]:checked');
        const messageField = form.querySelector('textarea[name="message"]');

        if (!selectedVote) {
            status.textContent = 'Please select Yes or No before submitting.';
            return;
        }

        submitButton.disabled = true;
        status.textContent = '';

        try {
            const supabaseClient = await createSupabaseClient();
            const payload = {
                vote: selectedVote.value,
                message: (messageField.value || '').trim(),
                created_at: new Date().toISOString(),
            };

            const { error } = await supabaseClient.from('ai_poll').insert(payload);
            if (error) {
                throw error;
            }

            localStorage.setItem(STORAGE_KEY, 'true');
            closePopup();
        } catch (error) {
            status.textContent = error && error.message ? error.message : 'Unable to submit your vote right now.';
            submitButton.disabled = false;
        }
    }

    function mountPopup() {
        if (popupMounted || shouldSkipPopup()) return;

        const popup = createPopup();
        const form = popup.querySelector('.ai-poll-form');
        const closeButton = popup.querySelector('.ai-poll-close');
        form.addEventListener('submit', handleSubmit);
        closeButton.addEventListener('click', closePopup);
        document.body.appendChild(popup);
        popupMounted = true;
    }

    function schedulePopup() {
        if (shouldSkipPopup()) return;
        window.setTimeout(mountPopup, DISPLAY_DELAY_MS);
    }

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', schedulePopup, { once: true });
    } else {
        schedulePopup();
    }
})();
