(function () {
  // Inject CSS for the modal
  const style = document.createElement('style');
  style.textContent = `
    .contact-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
      backdrop-filter: blur(3px);
    }
    .contact-modal-overlay.active {
      opacity: 1;
      pointer-events: all;
    }
    .contact-modal {
      background: var(--vscode-sidebar, #151515);
      border: 1px solid var(--border-color, #262626);
      border-radius: var(--panel-radius, 8px);
      width: 90%;
      max-width: 450px;
      padding: 24px;
      box-shadow: var(--shadow, 0 2px 8px rgba(0, 0, 0, 0.4));
      transform: translateY(20px);
      transition: transform var(--transition-slow, 0.3s ease);
      position: relative;
      font-family: inherit;
    }
    .contact-modal-overlay.active .contact-modal {
      transform: translateY(0);
    }
    .contact-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: transparent;
      border: none;
      color: var(--text-secondary, #a0a0a0);
      font-size: 24px;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
      transition: color var(--transition-fast, 0.15s ease);
    }
    .contact-close:hover {
      color: var(--primary, #00ff88);
    }
    .contact-title {
      margin: 0 0 8px 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text-primary, #fafafa);
      letter-spacing: -0.01em;
    }
    .contact-subtitle {
      margin: 0 0 20px 0;
      font-size: 0.875rem;
      color: var(--text-secondary, #a0a0a0);
      line-height: 1.5;
    }
    .contact-form-group {
      margin-bottom: 20px;
    }
    .contact-form-group label {
      display: block;
      margin-bottom: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary, #a0a0a0);
    }
    .contact-form-group input,
    .contact-form-group textarea {
      width: 100%;
      padding: 10px 12px;
      background: var(--vscode-bg, #0a0a0a);
      border: 1px solid var(--border-color, #262626);
      border-radius: 6px;
      color: var(--text-primary, #fafafa);
      font-family: inherit;
      box-sizing: border-box;
      font-size: 0.875rem;
      transition: all var(--transition-fast, 0.15s ease);
    }
    .contact-form-group input:focus,
    .contact-form-group textarea:focus {
      outline: none;
      border-color: var(--primary, #00ff88);
      box-shadow: 0 0 0 2px rgba(0, 255, 136, 0.15);
    }
    .contact-form-group textarea {
      resize: vertical;
      min-height: 100px;
    }
    .contact-submit {
      width: 100%;
      height: 38px;
      background: var(--primary, #00ff88);
      color: #0a0a0a;
      border: 1px solid var(--primary, #00ff88);
      border-radius: 6px;
      font-weight: 700;
      font-size: 0.875rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast, 0.15s ease);
      font-family: inherit;
    }
    .contact-submit:hover:not(:disabled) {
      background: var(--primary-hover, #00cc6a);
      border-color: var(--primary-hover, #00cc6a);
      transform: translateY(-1px);
    }
    .contact-submit:active:not(:disabled) {
      transform: translateY(0);
    }
    .contact-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .contact-status {
      margin-top: 16px;
      font-size: 14px;
      text-align: center;
      display: none;
      padding: 10px;
      border-radius: 4px;
    }
    .contact-status.success {
      color: #2e7d32;
      background: #e8f5e9;
      display: block;
    }
    .contact-status.error {
      color: #c62828;
      background: #ffebee;
      display: block;
    }
    
    html[data-theme="dark"] .contact-status.success,
    body[data-theme="dark"] .contact-status.success {
      color: #81c784;
      background: rgba(46, 125, 50, 0.2);
    }
    html[data-theme="dark"] .contact-status.error,
    body[data-theme="dark"] .contact-status.error {
      color: #e57373;
      background: rgba(198, 40, 40, 0.2);
    }
  `;
  document.head.appendChild(style);

  // Inject HTML
  const container = document.createElement('div');
  container.innerHTML = `
    <!-- Modal -->
    <div class="contact-modal-overlay" id="contact-modal-overlay">
      <div class="contact-modal">
        <button class="contact-close" id="contact-close-btn">&times;</button>
        <h3 class="contact-title">How can I help?</h3>
        <p class="contact-subtitle">Send me a message if you run into any issues or have an idea for a new feature.</p>
        <form id="contact-form">
          <div class="contact-form-group">
            <label for="contact-name">Name (Optional)</label>
            <input type="text" id="contact-name" placeholder="Your Name">
          </div>
          <div class="contact-form-group">
            <label for="contact-email">Email (Required)</label>
            <input type="email" id="contact-email" required placeholder="your@email.com">
          </div>
          <div class="contact-form-group">
            <label for="contact-message">Message (Required)</label>
            <textarea id="contact-message" required placeholder="Type your message here..." data-clarity-unmask="true"></textarea>
          </div>
          <button type="submit" class="contact-submit" id="contact-submit-btn">Send Message</button>
          <div class="contact-status" id="contact-status"></div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // Logic
  const overlay = document.getElementById('contact-modal-overlay');
  const closeBtn = document.getElementById('contact-close-btn');
  const form = document.getElementById('contact-form');
  const submitBtn = document.getElementById('contact-submit-btn');
  const statusEl = document.getElementById('contact-status');

  // Instead of floating button, hook into header button if available
  const headerBtn = document.getElementById('contact-header-btn');
  if (headerBtn) {
    headerBtn.addEventListener('click', () => {
      overlay.classList.add('active');
      statusEl.className = 'contact-status';
      statusEl.style.display = 'none';
      statusEl.textContent = '';
    });
  }

  const closeModal = () => {
    overlay.classList.remove('active');
  };

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    const message = document.getElementById('contact-message').value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
    statusEl.className = 'contact-status';
    statusEl.style.display = 'none';

    try {
      const apiBase = String(window.API_URL || 'https://graphics-oc-api.graphicshcompiler.workers.dev').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, message })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        statusEl.textContent = 'Message sent successfully!';
        statusEl.className = 'contact-status success';
        statusEl.style.display = 'block';
        form.reset();
        setTimeout(closeModal, 2000);
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (err) {
      statusEl.textContent = err.message || 'Network error occurred';
      statusEl.className = 'contact-status error';
      statusEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
    }
  });
})();
