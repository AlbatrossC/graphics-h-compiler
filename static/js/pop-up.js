(function() {
    // Check if user has already closed the popup
    if (localStorage.getItem('gh-star-popup-closed')) {
        return;
    }

    // Reference URL
    const REPO_URL = 'https://github.com/AlbatrossC/graphics-h-compiler';
    const FEEDBACK_API_URL = '/api/feedback';

    // 1. Inject Styles
    const css = `
        #gh-star-notification {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 320px;
            z-index: 9999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            pointer-events: none; /* Let clicks pass through to background unless on modal */
        }

        .gh-star-modal {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
            animation: gh-notification-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: auto; /* Re-enable clicks for modal */
        }

        @keyframes gh-notification-in {
            from { transform: translateX(100%) translateY(20px); opacity: 0; }
            to { transform: translateX(0) translateY(0); opacity: 1; }
        }

        .gh-star-modal-img-container {
            width: 100%;
            height: 140px;
            background: #0d1117;
            border-bottom: 1px solid #30363d;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px;
        }

        .gh-star-modal-img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain; /* Ensure whole image is visible */
            border-radius: 4px;
        }

        .gh-star-modal-body {
            padding: 16px;
        }

        .gh-star-message {
            font-size: 13.5px;
            color: #e6edf3;
            line-height: 1.5;
            margin-bottom: 16px;
            text-align: left;
        }

        .gh-star-btn-star {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            width: 100%;
            background: #21262d;
            color: #e6edf3;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 13px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.2s ease;
            margin-bottom: 12px;
        }

        .gh-star-btn-star:hover {
            background: #30363d;
            border-color: #8b949e;
        }

        .gh-star-hr {
            border: none;
            border-top: 1px solid #30363d;
            margin-bottom: 12px;
        }

        .gh-star-issue-heading {
            font-size: 12px;
            font-weight: 600;
            color: #8b949e;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .gh-star-textarea {
            width: 100%;
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            color: #e6edf3;
            font-family: inherit;
            font-size: 12px;
            padding: 8px 10px;
            resize: none;
            height: 60px;
            line-height: 1.4;
            transition: all 0.2s ease;
            margin-bottom: 12px;
        }

        .gh-star-textarea::placeholder {
            color: #484f58;
        }

        .gh-star-textarea:focus {
            outline: none;
            border-color: #388bfd;
            box-shadow: 0 0 0 3px rgba(56, 139, 253, 0.15);
        }

        .gh-star-btn-row {
            display: flex;
            gap: 8px;
            justify-content: space-between;
        }

        .gh-star-btn {
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.2s ease;
            flex: 1;
        }

        .gh-star-btn-close {
            background: #21262d;
            color: #f85149;
            border-color: rgba(248, 81, 73, 0.2);
        }

        .gh-star-btn-close:hover {
            background: rgba(248, 81, 73, 0.1);
            border-color: #f85149;
        }

        .gh-star-btn-send {
            background: #238636;
            color: #ffffff;
            border-color: rgba(240, 246, 252, 0.1);
        }

        .gh-star-btn-send:hover {
            background: #2ea043;
        }

        .gh-star-btn-send:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    `;

    const styleTag = document.createElement('style');
    styleTag.id = 'gh-star-styles';
    styleTag.textContent = css;
    document.head.appendChild(styleTag);

    // 2. Inject HTML
    const overlay = document.createElement('div');
    overlay.id = 'gh-star-notification';
    const feedbackSection = window.FEEDBACK_ENABLED ? `
                <div class="gh-star-hr"></div>

                <div class="gh-star-issue-heading">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="#8b949e">
                        <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
                        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
                    </svg>
                    Found something weird?
                </div>

                <textarea class="gh-star-textarea" id="gh-star-issue-text" placeholder="Describe it — I'll fix it."></textarea>

                <div class="gh-star-btn-row">
                    <button class="gh-star-btn gh-star-btn-close" id="gh-star-close-btn">Close</button>
                    <button class="gh-star-btn gh-star-btn-send" id="gh-star-send-btn">Send</button>
                </div>
    ` : `
                <div class="gh-star-btn-row">
                    <button class="gh-star-btn gh-star-btn-close" id="gh-star-close-btn" style="flex: 1;">Close</button>
                </div>
    `;

    overlay.innerHTML = `
        <div class="gh-star-modal">
            <div class="gh-star-modal-img-container">
                <img class="gh-star-modal-img" src="/static/images/github_star.webp" alt="GitHub Star">
            </div>
            <div class="gh-star-modal-body">
                <p class="gh-star-message">
                    Please star my repo! I really want to flex my GitHub stats on my professors during my next demo. 🙏🙏🙏
                </p>

                <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer" class="gh-star-btn-star" id="gh-star-link">
                    <svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#e3b341" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.873 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
                    </svg>
                    <span>Star AlbatrossC/graphics-h-compiler</span>
                </a>

                ${feedbackSection}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // 3. Logic
    const closeBtn = document.getElementById('gh-star-close-btn');
    const sendBtn = document.getElementById('gh-star-send-btn');
    const textarea = document.getElementById('gh-star-issue-text');
    const starLink = document.getElementById('gh-star-link');

    function closeModal() {
        overlay.remove();
        localStorage.setItem('gh-star-popup-closed', 'true');
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    starLink.addEventListener('click', () => {
        // Optional: you could also close the modal after clicking star, 
        // but usually we want them to stay and maybe send feedback.
        // localStorage.setItem('gh-star-popup-closed', 'true');
    });

    if (sendBtn && textarea) {
        sendBtn.addEventListener('click', async () => {
            const message = textarea.value.trim();
            if (!message) {
                textarea.style.borderColor = '#f85149';
                textarea.focus();
                setTimeout(() => textarea.style.borderColor = '', 1500);
                return;
            }

            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending...';

            try {
                const response = await fetch(FEEDBACK_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: message
                    })
                });

                if (response.ok) {
                    sendBtn.textContent = '✓ Sent!';
                    textarea.value = '';
                    setTimeout(closeModal, 1500);
                } else {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to send');
                }
            } catch (error) {
                console.error('Error sending feedback:', error);
                sendBtn.textContent = 'Error!';
                sendBtn.style.background = '#f85149';
                setTimeout(() => {
                    sendBtn.disabled = false;
                    sendBtn.textContent = 'Send Feedback';
                    sendBtn.style.background = '';
                }, 3000);
            }
        });
    }

    // Handle Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('gh-star-notification')) {
            closeModal();
        }
    });
})();
