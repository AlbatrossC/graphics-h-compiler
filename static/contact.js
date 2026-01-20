// Contact Modal - Optimized for Performance
const ContactModal = {
    isLoaded: false,
    escapeHandler: null,

    // HTML Template
    getHTML: () => `
        <div id="contact-modal" class="modal items-center justify-center" onclick="ContactModal.close(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="p-8">
                    <div class="flex items-center justify-between mb-6">
                        <h2 class="text-2xl font-black text-slate-900">Get in Touch</h2>
                        <div class="modal-close" onclick="ContactModal.close()">
                            <i data-lucide="x" class="w-5 h-5 text-slate-600"></i>
                        </div>
                    </div>
                    
                    <form id="contact-form" class="space-y-5">
                        <div>
                            <label for="contact-name" class="block text-sm font-bold text-slate-700 mb-2">
                                Name <span class="text-slate-400 font-normal">(Optional)</span>
                            </label>
                            <input 
                                type="text" 
                                id="contact-name" 
                                name="name"
                                class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-400 focus:outline-none transition-colors text-slate-900 font-medium"
                                placeholder="Your name"
                            >
                        </div>

                        <div>
                            <label for="contact-email" class="block text-sm font-bold text-slate-700 mb-2">
                                Email Address <span class="text-red-500">*</span>
                            </label>
                            <input 
                                type="email" 
                                id="contact-email" 
                                name="email"
                                required
                                class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-400 focus:outline-none transition-colors text-slate-900 font-medium"
                                placeholder="your.email@example.com"
                            >
                        </div>

                        <div>
                            <label for="contact-message" class="block text-sm font-bold text-slate-700 mb-2">
                                Message <span class="text-red-500">*</span>
                            </label>
                            <textarea 
                                id="contact-message" 
                                name="message"
                                required
                                rows="5"
                                class="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-400 focus:outline-none transition-colors text-slate-900 font-medium resize-none"
                                placeholder="What would you like to say?"
                            ></textarea>
                        </div>

                        <button 
                            type="submit" 
                            id="contact-submit"
                            class="w-full btn-primary group shadow-lg"
                        >
                            <i data-lucide="send" class="w-4 h-4"></i>
                            <span>Send Message</span>
                            <i data-lucide="arrow-right" class="w-4 h-4 group-hover:translate-x-1 transition-transform"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <!-- Success Toast Notification - Bottom Right -->
        <div id="contact-toast" class="fixed bottom-6 right-6 z-[1100] opacity-0 pointer-events-none transition-all duration-300 transform translate-x-[120%]">
            <div class="bg-green-600 text-white px-6 py-4 rounded-xl shadow-2xl border-2 border-green-500 max-w-md">
                <div class="flex items-start gap-4">
                    <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        <i data-lucide="check-circle" class="w-6 h-6"></i>
                    </div>
                    <div class="flex-1">
                        <h3 class="font-bold text-lg mb-1">Message Sent!</h3>
                        <p class="text-sm text-green-50">Thanks for reaching out. The owner will contact you soon.</p>
                    </div>
                </div>
            </div>
        </div>
    `,

    // CSS Styles (added to existing styles)
    getStyles: () => `
        /* Contact Form Styles */
        #contact-form input:invalid:not(:placeholder-shown),
        #contact-form textarea:invalid:not(:placeholder-shown) {
            border-color: #ef4444;
        }

        #contact-form input:valid:not(:placeholder-shown),
        #contact-form textarea:valid:not(:placeholder-shown) {
            border-color: #10b981;
        }

        /* Toast Animation */
        #contact-toast.show {
            opacity: 1;
            pointer-events: auto;
            transform: translateX(0);
        }

        /* Loading State */
        .btn-loading {
            position: relative;
            pointer-events: none;
        }

        .btn-loading::after {
            content: '';
            position: absolute;
            width: 16px;
            height: 16px;
            top: 50%;
            left: 50%;
            margin-left: -8px;
            margin-top: -8px;
            border: 2px solid #ffffff;
            border-radius: 50%;
            border-top-color: transparent;
            animation: spinner 0.6s linear infinite;
        }

        @keyframes spinner {
            to { transform: rotate(360deg); }
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
        fragment.appendChild(container);

        // Batch DOM update
        document.head.appendChild(fragment.firstChild);
        document.body.appendChild(fragment);

        // Setup form handler
        const form = document.getElementById('contact-form');
        form.addEventListener('submit', this.handleSubmit.bind(this));

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
        if (!event || event.target.id === 'contact-modal') {
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

        // Show loading state (optimized)
        submitBtn.disabled = true;
        submitBtn.classList.add('btn-loading');
        const originalHTML = submitBtn.innerHTML;
        submitBtn.textContent = ''; // Faster than innerHTML

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

            // Success - show immediate feedback
            this.showToast();
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
            submitBtn.classList.remove('btn-loading');
            submitBtn.innerHTML = originalHTML;
            
            // Reinitialize icons only if needed
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    },

    // Show toast notification (optimized)
    showToast: function(message, type = 'success') {
        const toast = document.getElementById('contact-toast');
        
        // Only update HTML for error type (success uses default HTML)
        if (type === 'error') {
            toast.innerHTML = `
                <div class="bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl border-2 border-red-500 max-w-md">
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                            <i data-lucide="alert-circle" class="w-6 h-6"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="font-bold text-lg mb-1">Error</h3>
                            <p class="text-sm text-red-50">${message}</p>
                        </div>
                    </div>
                </div>
            `;
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }

        // Use requestAnimationFrame for smooth animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000); // Reduced from 5000ms
    }
};

// Export for use in HTML
window.ContactModal = ContactModal;