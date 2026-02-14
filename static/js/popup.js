/**
 * Maintenance Popup & Notice Logic
 * Injects a maintenance popup and a header button to trigger it.
 * Handles triggering messages to Discord via /api/maintenance/message
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject Styles
    const style = document.createElement('style');
    style.textContent = `
        /* Overlay */
        .maintenance-popup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(5px);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        .maintenance-popup-overlay.active {
            opacity: 1;
            pointer-events: all;
        }

        /* Modal */
        .maintenance-popup {
            background: var(--vscode-sidebar, #151515);
            /* No borders as requested */
            border: none; 
            border-radius: 12px;
            width: 90%;
            max-width: 520px;
            padding: 30px;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6);
            transform: translateY(20px) scale(0.95);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            color: var(--text-primary, #fff);
            font-family: inherit;
            position: relative;
        }

        .maintenance-popup-overlay.active .maintenance-popup {
            transform: translateY(0) scale(1);
        }

        /* Content */
        .mp-header {
            margin-bottom: 24px;
        }

        .mp-title {
            font-size: 1.4rem;
            font-weight: 700;
            color: var(--text-primary, #fff);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .mp-title svg {
            color: var(--warning, #ffaa00);
        }

        .mp-subtitle {
            font-size: 1rem;
            color: var(--text-secondary, #a0a0a0);
            line-height: 1.6;
        }

        .mp-highlight-time {
            color: var(--warning, #ffaa00);
            font-weight: 700;
            background: rgba(255, 170, 0, 0.1);
            padding: 2px 6px;
            border-radius: 4px;
        }

        .mp-body {
            margin-bottom: 24px;
        }

        .mp-input-group {
            margin-bottom: 24px;
        }

        .mp-input-label {
            display: block;
            margin-bottom: 10px;
            font-size: 0.95rem;
            font-weight: 500;
            color: var(--text-primary, #fff);
        }

        .mp-input {
            width: 100%;
            padding: 14px;
            background: var(--vscode-bg, #0a0a0a);
            border: 1px solid transparent; /* No visible border initially */
            border-radius: 8px;
            color: var(--text-primary, #fff);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.95rem;
            resize: vertical;
            min-height: 110px;
            outline: none;
            transition: background-color 0.2s, box-shadow 0.2s;
        }

        .mp-input:focus {
            background: #000;
            box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.4); /* Blue focus ring */
        }

        .mp-actions {
            display: flex;
            justify-content: flex-end; /* Keeps items on the right */
            gap: 12px;
            align-items: center;
        }

        .mp-btn {
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        /* Send Message - Blue */
        .mp-btn-blue {
            background: #3b82f6; /* Modern Blue */
            color: #fff;
        }

        .mp-btn-blue:hover {
            background: #2563eb;
            transform: translateY(-1px);
        }

        .mp-btn-blue:active {
            transform: translateY(0);
        }
        
        .mp-btn-blue:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        /* Yeah go for maintenance - Green */
        .mp-btn-green {
            background: var(--primary, #00ff88);
            color: #000;
        }

        .mp-btn-green:hover {
            background: var(--primary-hover, #00cc6a);
            transform: translateY(-1px);
        }

        .mp-feedback {
            font-size: 0.9rem;
            margin-top: 10px;
            min-height: 1.25em;
            font-weight: 500;
        }
        .mp-feedback.success { color: var(--success, #00ff88); }
        .mp-feedback.error { color: var(--danger, #ff4444); }

        /* Header Button (Maintenance Notice) */
        .maintenance-btn-trigger {
            background: transparent;
            color: var(--warning, #ffaa00);
            border: 1px solid transparent;
            padding: 0 12px;
            height: 36px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            margin-right: 8px;
            transition: all 0.2s;
            white-space: nowrap;
        }

        .maintenance-btn-trigger:hover {
            background: rgba(255, 170, 0, 0.1);
        }
        
        @media (max-width: 600px) {
            .maintenance-btn-trigger span {
                display: none;
            }
            .maintenance-btn-trigger {
                padding: 0;
                width: 36px;
                justify-content: center;
            }
        }
    `;
    document.head.appendChild(style);

    // 2. Inject HTML for Popup
    const popupHTML = `
        <div class="maintenance-popup" id="maintenance-popup">
            <div class="mp-header">
                <div class="mp-title">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    Quick Maintenance Update
                </div>
                <div class="mp-subtitle">
                    Maintenance is scheduled for <span class="mp-highlight-time">Monday at 12:00 AM IST</span>. The compiler may be temporarily unavailable. 
                    If you need access during that time, just reach out below.
                </div>
            </div>
            <div class="mp-body">
                <div class="mp-input-group">
                    <label class="mp-input-label" for="mp-message">Need access? Leave a message:</label>
                    <textarea class="mp-input" id="mp-message" placeholder="If you need compiler during that time just message me..."></textarea>
                    <div class="mp-feedback" id="mp-feedback"></div>
                </div>
                <div class="mp-actions">
                    <button class="mp-btn mp-btn-blue" id="mp-send-btn">Send Message</button>
                    <button class="mp-btn mp-btn-green" id="mp-close-btn">Yeah, go for maintenance</button>
                </div>
            </div>
        </div>
    `;

    const overlay = document.createElement('div');
    overlay.className = 'maintenance-popup-overlay';
    overlay.id = 'maintenance-overlay';
    overlay.innerHTML = popupHTML;
    document.body.appendChild(overlay);

    // 3. Logic
    const overlayEl = document.getElementById('maintenance-overlay');
    const messageInput = document.getElementById('mp-message');
    const feedbackEl = document.getElementById('mp-feedback');
    const sendBtn = document.getElementById('mp-send-btn');
    const closeBtn = document.getElementById('mp-close-btn');

    function showPopup() {
        overlayEl.classList.add('active');
        setTimeout(() => {
            messageInput.focus();
        }, 100);
    }

    function hidePopup() {
        overlayEl.classList.remove('active');
        localStorage.setItem('maintenance_notice_seen_v1', 'true');
    }

    // Auto-show logic: show once if not seen
    if (!localStorage.getItem('maintenance_notice_seen_v1')) {
        setTimeout(showPopup, 1500);
    }

    // Close Handler
    closeBtn.addEventListener('click', hidePopup);

    // Also close on click outside
    overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl) hidePopup();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlayEl.classList.contains('active')) {
            hidePopup();
        }
    });

    // Send Handler
    sendBtn.addEventListener('click', async () => {
        const message = messageInput.value.trim();
        if (!message) {
            feedbackEl.textContent = 'Please enter a message first.';
            feedbackEl.className = 'mp-feedback error';
            return;
        }

        // Send to backend
        sendBtn.disabled = true;
        const originalText = sendBtn.textContent;
        sendBtn.innerHTML = '<span style="animation: spin 1s infinite linear; display: inline-block; margin-right: 5px;">⟳</span> Sending...';

        try {
            const response = await fetch('/api/maintenance/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: message })
            });

            const data = await response.json();

            if (response.ok) {
                feedbackEl.textContent = 'Message sent! Thanks for letting us know.';
                feedbackEl.className = 'mp-feedback success';
                messageInput.value = '';
                sendBtn.textContent = 'Sent!';
                setTimeout(() => {
                    sendBtn.textContent = originalText;
                    sendBtn.disabled = false;
                }, 3000);
            } else {
                throw new Error(data.error || 'Failed to send');
            }
        } catch (error) {
            console.error(error);
            feedbackEl.textContent = 'Error sending message. Please try again.';
            feedbackEl.className = 'mp-feedback error';
            sendBtn.textContent = originalText;
            sendBtn.disabled = false;
        }
    });

    // 4. Inject Header Button
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const noticeBtn = document.createElement('button');
        noticeBtn.className = 'maintenance-btn-trigger';
        noticeBtn.title = 'Maintenance Notice';
        noticeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <span>Maintenance Notice</span>
        `;
        noticeBtn.addEventListener('click', showPopup);

        headerRight.insertBefore(noticeBtn, headerRight.firstChild);
    }
});
