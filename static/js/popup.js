/**
 * Cloud Save Notification Popup
 * Self-contained module with HTML, CSS, and JavaScript
 * Shows once per user to encourage Google Sign-in for cloud storage
 */

(function () {
    'use strict';

    // Check if popup has been shown before
    const POPUP_SHOWN_KEY = 'cloud_save_popup_shown';

    if (localStorage.getItem(POPUP_SHOWN_KEY) === 'true') {
        return; // Already shown, exit early
    }

    // CSS Styles
    const styles = `
        .cloud-popup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(4px);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            animation: fadeIn 0.3s ease forwards;
            padding: 20px;
        }

        @keyframes fadeIn {
            to {
                opacity: 1;
            }
        }

        @keyframes slideUp {
            from {
                transform: translateY(30px);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        .cloud-popup-container {
            background: var(--vscode-sidebar, #1a1a1a);
            border: 2px solid var(--primary, #00ff88);
            border-radius: 16px;
            max-width: 480px;
            width: 100%;
            padding: 32px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            position: relative;
            animation: slideUp 0.4s ease forwards;
            animation-delay: 0.1s;
            opacity: 0;
        }

        .cloud-popup-close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 32px;
            height: 32px;
            background: transparent;
            border: 1px solid var(--border-color, #333);
            border-radius: 8px;
            color: var(--text-secondary, #999);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            padding: 0;
        }

        .cloud-popup-close:hover {
            background: var(--vscode-line-bg, #2a2a2a);
            border-color: var(--primary, #00ff88);
            color: var(--primary, #00ff88);
            transform: rotate(90deg);
        }

        .cloud-popup-close svg {
            width: 16px;
            height: 16px;
        }

        .cloud-popup-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 20px;
            background: var(--primary, #00ff88);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 8px 24px rgba(0, 255, 136, 0.2);
        }

        .cloud-popup-icon svg {
            width: 36px;
            height: 36px;
            color: #0a0a0a;
        }

        .cloud-popup-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-primary, #fafafa);
            text-align: center;
            margin-bottom: 12px;
            line-height: 1.3;
        }

        .cloud-popup-description {
            font-size: 0.9375rem;
            color: var(--text-secondary, #a0a0a0);
            text-align: center;
            line-height: 1.6;
            margin-bottom: 8px;
        }

        .cloud-popup-highlight {
            font-size: 0.875rem;
            color: var(--primary, #00ff88);
            text-align: center;
            font-weight: 600;
            margin-bottom: 24px;
        }

        .cloud-popup-actions {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .cloud-popup-btn {
            width: 100%;
            padding: 14px 24px;
            border-radius: 10px;
            font-size: 0.9375rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .cloud-popup-btn-primary {
            background: var(--primary, #00ff88);
            color: #0a0a0a;
            box-shadow: 0 4px 16px rgba(0, 255, 136, 0.3);
        }

        .cloud-popup-btn-primary:hover {
            background: var(--primary-hover, #00cc6a);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 255, 136, 0.4);
        }

        .cloud-popup-btn-secondary {
            background: transparent;
            color: var(--text-secondary, #a0a0a0);
            border: 1px solid var(--border-color, #333);
        }

        .cloud-popup-btn-secondary:hover {
            background: var(--vscode-line-bg, #2a2a2a);
            border-color: var(--primary, #00ff88);
            color: var(--text-primary, #fafafa);
        }

        .cloud-popup-btn svg {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
        }

        .cloud-popup-btn-primary svg {
            color: #0a0a0a;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
            .cloud-popup-container {
                padding: 24px;
                max-width: 90%;
            }

            .cloud-popup-title {
                font-size: 1.25rem;
            }

            .cloud-popup-description {
                font-size: 0.875rem;
            }

            .cloud-popup-icon {
                width: 56px;
                height: 56px;
            }

            .cloud-popup-icon svg {
                width: 32px;
                height: 32px;
            }
        }

        /* Light theme support */
        [data-theme="light"] .cloud-popup-container {
            background: var(--vscode-sidebar, #f5f5f5);
            border-color: var(--primary, #00cc6a);
        }

        [data-theme="light"] .cloud-popup-title {
            color: var(--text-primary, #0a0a0a);
        }

        [data-theme="light"] .cloud-popup-description {
            color: var(--text-secondary, #606060);
        }
    `;

    // HTML Structure
    const popupHTML = `
        <div class="cloud-popup-overlay" id="cloud-popup-overlay">
            <div class="cloud-popup-container">
                <button class="cloud-popup-close" id="cloud-popup-close" title="Close">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                <div class="cloud-popup-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                    </svg>
                </div>

                <h2 class="cloud-popup-title">Save your files to the cloud</h2>
                
                <p class="cloud-popup-description">
                    Sign in with Google to save your files and access them from any device, anytime.
                </p>
                
                <p class="cloud-popup-highlight">
                    One click. Always backed up.
                </p>

                <div class="cloud-popup-actions">
                    <button class="cloud-popup-btn cloud-popup-btn-primary" id="cloud-popup-signin">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/>
                        </svg>
                        Sign in with Google & Save
                    </button>
                    
                    <button class="cloud-popup-btn cloud-popup-btn-secondary" id="cloud-popup-later">
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>
    `;

    // Initialize popup
    function init() {
        // Inject styles
        const styleElement = document.createElement('style');
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);

        // Inject HTML
        const popupContainer = document.createElement('div');
        popupContainer.innerHTML = popupHTML;
        document.body.appendChild(popupContainer.firstElementChild);

        // Add event listeners
        setupEventListeners();

        // Show popup after a short delay (2 seconds after page load)
        setTimeout(showPopup, 2000);
    }

    function setupEventListeners() {
        const overlay = document.getElementById('cloud-popup-overlay');
        const closeBtn = document.getElementById('cloud-popup-close');
        const signinBtn = document.getElementById('cloud-popup-signin');
        const laterBtn = document.getElementById('cloud-popup-later');

        // Close on X button
        closeBtn.addEventListener('click', closePopup);

        // Close on overlay click (outside popup)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closePopup();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closePopup();
            }
        });

        // Sign in button - trigger the existing Google sign-in
        signinBtn.addEventListener('click', () => {
            const googleSigninBtn = document.getElementById('google-signin-btn');
            if (googleSigninBtn) {
                googleSigninBtn.click();
            }
            closePopup();
        });

        // Maybe later button
        laterBtn.addEventListener('click', closePopup);
    }

    function showPopup() {
        const overlay = document.getElementById('cloud-popup-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    function closePopup() {
        const overlay = document.getElementById('cloud-popup-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
            }, 300);
        }

        // Mark as shown so it doesn't appear again
        localStorage.setItem(POPUP_SHOWN_KEY, 'true');
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
