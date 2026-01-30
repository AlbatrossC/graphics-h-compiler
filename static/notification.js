(function () {
    // Check if notification has been shown before
    if (localStorage.getItem('sppucodes_notification_shown')) {
        return;
    }

    // SVG for external link
    const externalLinkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

    // SVG for close button
    const closeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    // Create container
    const container = document.createElement('div');
    container.id = 'sppucodes-notification';
    container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 380px;
        max-width: calc(100vw - 40px);
        background: #111;
        color: #fff;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        z-index: 10000;
        font-family: 'IBM Plex Sans', -apple-system, sans-serif;
        transform: translateY(120%);
        transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        flex-direction: column;
        gap: 12px;
    `;

    // Inner HTML
    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <h3 style="margin: 0; font-size: 1rem; font-weight: 600; color: #00ff88; font-family: 'Space Mono', monospace;">For SPPU Students</h3>
            <button id="sppucodes-close" style="background: none; border: none; color: #888; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
                ${closeSvg}
            </button>
        </div>
        <p style="margin: 0; font-size: 0.9rem; line-height: 1.5; color: #ccc;">
            Visit my website for Computer Graphics programs, including graphics.h and other codes, and SPPU question papers.
        </p>
        <a href="https://sppucodes.vercel.app/cgl?ref=https://graphics-h-compiler.vercel.app/" target="_blank" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #00ff88; color: #000; text-decoration: none; padding: 10px 16px; border-radius: 4px; font-size: 0.9rem; font-weight: 600; transition: background 0.2s; margin-top: 4px;">
            ${externalLinkSvg}
            <span>SPPU Codes (Computer graphics)</span>
        </a>
    `;

    document.body.appendChild(container);

    // Hover effect for close button
    const closeBtn = document.getElementById('sppucodes-close');
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#fff');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = '#888');

    // Show function
    setTimeout(() => {
        container.style.transform = 'translateY(0)';
        localStorage.setItem('sppucodes_notification_shown', 'true');
    }, 1000); // Slight delay before showing

    // Hide function
    const hideNotification = () => {
        container.style.transform = 'translateY(120%)';
        setTimeout(() => {
            container.remove();
        }, 500);
    };

    // Close button click
    closeBtn.addEventListener('click', hideNotification);

    // Auto close removed (user must close manually)
})();
