// Contact Modal - Optimized for Performance with Green Palette
const ContactModal = {
    isLoaded: false,
    escapeHandler: null,

    // HTML Template
    getHTML: () => `
        <div id="contact-modal" class="modal" onclick="ContactModal.close(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <button class="modal-close" onclick="ContactModal.close()">
                    <i data-lucide="x"></i>
                </button>

                <h2 class="modal-title">Get in Touch</h2>

                <form id="contact-form" onsubmit="ContactModal.handleSubmit(event)">
                    <div class="form-group">
                        <label class="form-label" for="contact-name">
                            Name <span style="opacity: 0.5; font-size: 0.8em;">(Optional)</span>
                        </label>
                        <input 
                            type="text" 
                            id="contact-name" 
                            class="form-input"
                            placeholder="Your name"
                        >
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="contact-email">
                            Email <span style="color: #ff4444;">*</span>
                        </label>
                        <input 
                            type="email" 
                            id="contact-email" 
                            class="form-input"
                            required
                            placeholder="your.email@example.com"
                        >
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="contact-message">
                            Message <span style="color: #ff4444;">*</span>
                        </label>
                        <textarea 
                            id="contact-message" 
                            class="form-textarea"
                            required
                            placeholder="What would you like to say?"
                        ></textarea>
                    </div>

                    <button type="submit" id="contact-submit" class="form-submit">
                        Send Message
                    </button>
                </form>
            </div>
        </div>

        <!-- Toast Notification -->
        <div id="contact-toast" class="toast"></div>
    `,

    // CSS Styles - Green Palette
    getStyles: () => `
        /* Contact Form Styles - Green Palette */
        .form-group {
            margin-bottom: 1.5rem;
        }

        .form-label {
            display: block;
            font-size: 0.9rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            font-family: 'Space Mono', monospace;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .form-input,
        .form-textarea {
            width: 100%;
            padding: 0.8rem 1rem;
            border: 2px solid;
            background: transparent;
            color: inherit;
            font-family: inherit;
            font-size: 0.95rem;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }

        body.light .form-input,
        body.light .form-textarea {
            border-color: #e5e5e5;
        }

        body:not(.light) .form-input,
        body:not(.light) .form-textarea {
            border-color: #1a1a1a;
        }

        .form-input:focus,
        .form-textarea:focus {
            outline: none;
            border-color: #00ff88;
        }

        .form-textarea {
            resize: vertical;
            min-height: 120px;
        }

        .form-submit {
            width: 100%;
            padding: 1rem;
            background: #00ff88;
            color: #0a0a0a;
            border: 3px solid #00ff88;
            font-weight: 700;
            font-size: 0.95rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: 'Space Mono', monospace;
        }

        .form-submit:hover {
            background: transparent;
            color: #00ff88;
        }

        .form-submit:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Toast Notification - Green Palette */
        .toast {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            padding: 1.5rem 2rem;
            background: #00ff88;
            color: #0a0a0a;
            border: 3px solid #00ff88;
            font-weight: 700;
            font-family: 'Space Mono', monospace;
            z-index: 3000;
            opacity: 0;
            transform: translateY(100px);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            pointer-events: none;
        }

        .toast.show {
            opacity: 1;
            transform: translateY(0);
            pointer-events: all;
        }

        .toast.error {
            background: #ff4444;
            border-color: #ff4444;
            color: white;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
            .toast {
                left: 1rem;
                right: 1rem;
                bottom: 1rem;
            }
        }
    `,

    // Initialize modal (optimized)
    init: function() {
        if (this.isLoaded) return;

        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        
        // Inject styles
        const styleTag = document.createElement('style');
        styleTag.textContent = this.getStyles();
        fragment.appendChild(styleTag);

        // Inject HTML
        const container = document.createElement('div');
        container.innerHTML = this.getHTML();
        while (container.firstChild) {
            fragment.appendChild(container.firstChild);
        }

        // Batch DOM update
        document.head.appendChild(fragment.childNodes[0]);
        document.body.appendChild(fragment);

        // Setup escape key handler (only once)
        this.escapeHandler = (e) => {
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this.escapeHandler);

        this.isLoaded = true;

        // Initialize Lucide icons (only once)
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    },

    // Open modal (optimized)
    open: function() {
        this.init();
        const modal = document.getElementById('contact-modal');
        
        // Use requestAnimationFrame for smooth animation
        requestAnimationFrame(() => {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });

        // Icons already initialized in init(), no need to reinitialize
    },

    // Close modal
    close: function(event) {
        if (!event || event.target.id === 'contact-modal' || event.target.closest('.modal-close')) {
            const modal = document.getElementById('contact-modal');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        }
    },

    // Handle form submission (optimized)
    handleSubmit: async function(e) {
        e.preventDefault();

        const submitBtn = document.getElementById('contact-submit');
        const form = e.target;

        // Get form data (cached DOM queries)
        const nameInput = document.getElementById('contact-name');
        const emailInput = document.getElementById('contact-email');
        const messageInput = document.getElementById('contact-message');

        const formData = {
            name: nameInput.value.trim() || 'Anonymous',
            email: emailInput.value.trim(),
            message: messageInput.value.trim()
        };

        // Validate
        if (!formData.email || !formData.message) {
            this.showToast('Please fill in all required fields.', 'error');
            return;
        }

        // Show loading state
        submitBtn.disabled = true;
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'SENDING...';

        try {
            // Send to Vercel serverless function with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Failed to send message');
            }

            // Success
            this.showToast('✓ Message sent successfully!');
            form.reset();
            
            // Close modal after short delay
            setTimeout(() => this.close(), 1500);

        } catch (error) {
            console.error('Error sending message:', error);
            const errorMsg = error.name === 'AbortError' 
                ? 'Request timeout. Please try again.' 
                : 'Failed to send message. Please try again.';
            this.showToast(errorMsg, 'error');
        } finally {
            // Remove loading state
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    },

    // Show toast notification (optimized)
    showToast: function(message, type = 'success') {
        const toast = document.getElementById('contact-toast');
        toast.textContent = message;
        toast.className = 'toast show' + (type === 'error' ? ' error' : '');

        // Use requestAnimationFrame for smooth animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }
};

// Export for use in HTML
window.ContactModal = ContactModal;