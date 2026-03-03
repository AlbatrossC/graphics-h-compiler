(function () {
  const content = document.getElementById('content');

  async function executeContentScripts(container) {
    const scripts = Array.from(container.querySelectorAll('script'));
    for (const oldScript of scripts) {
      const newScript = document.createElement('script');
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }

      if (oldScript.src) {
        await new Promise(function (resolve, reject) {
          newScript.onload = resolve;
          newScript.onerror = reject;
          oldScript.parentNode.replaceChild(newScript, oldScript);
        }).catch(function () {
          // Ignore script load failures to avoid breaking basic doc rendering.
        });
      } else {
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode.replaceChild(newScript, oldScript);
      }
    }
  }

  function slugFromPath(pathname) {
    if (pathname === '/docs' || pathname === '/docs/') {
      return 'what-is-graphicsh';
    }
    if (!pathname.startsWith('/docs/')) {
      return 'what-is-graphicsh';
    }
    const slug = pathname.slice('/docs/'.length).trim();
    return slug || 'what-is-graphicsh';
  }

  async function loadSlug(slug, shouldPush) {
    try {
      if (typeof window.__docsCleanup === 'function') {
        try {
          window.__docsCleanup();
        } catch (cleanupError) {
          // Ignore cleanup errors and continue loading content.
        }
      }
      window.__docsCleanup = null;

      const response = await fetch('/docs-content/' + encodeURIComponent(slug), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });

      if (!response.ok) {
        content.innerHTML = '<h1>Not Found</h1><p>The requested documentation page was not found.</p>';
        return;
      }

      const html = await response.text();
      content.innerHTML = html;
      await executeContentScripts(content);

      document.querySelectorAll('a[data-link]').forEach(function (anchor) {
        anchor.classList.toggle('active', anchor.getAttribute('href') === '/docs/' + slug);
      });

      if (shouldPush) {
        history.pushState({ slug: slug }, '', '/docs/' + slug);
      }
    } catch (err) {
      content.innerHTML = '<h1>Error</h1><p>Unable to load documentation content right now.</p>';
    }
  }

  document.addEventListener('click', function (event) {
    const link = event.target.closest('a[data-link]');
    if (!link) {
      return;
    }

    const href = link.getAttribute('href');
    if (!href || !href.startsWith('/docs/')) {
      return;
    }

    event.preventDefault();
    const slug = href.slice('/docs/'.length);
    loadSlug(slug, true);
  });

  window.addEventListener('popstate', function () {
    loadSlug(slugFromPath(window.location.pathname), false);
  });

  loadSlug(slugFromPath(window.location.pathname), false);
})();
