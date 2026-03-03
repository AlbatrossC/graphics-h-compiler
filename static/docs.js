(function () {
  const content = document.getElementById('content');
  const body = document.body;
  const SITE_TITLE = body.dataset.siteTitle || 'Graphics.h Documentation';
  const DOC_TITLES = {
    'what-is-graphicsh': 'What is graphics.h',
    'what-is-graphics': 'What is graphics.h',
    'where-to-run': 'Where to Run graphics.h',
    'hello-graphics': 'Hello Graphics Program',
    'graphics-initialization': 'Graphics Initialization',
    'line-and-movement': 'Line and Cursor Movement',
    'line': 'line()',
    'circle': 'circle()',
    'rectangle': 'rectangle()',
    'bar': 'bar()',
    'bar3d': 'bar3d()',
    'arc': 'arc()',
    'ellipse': 'ellipse()',
    'pieslice': 'pieslice()',
    'sector': 'sector()',
    'polygons-and-fill': 'Polygons and Fill',
    'colors-and-palette': 'Colors and Palette',
    'fill-and-patterns': 'Fill and Patterns',
    'viewport-and-screen': 'Viewport and Screen',
    'text-and-fonts': 'Text and Fonts',
    'image-handling': 'Image and Pixel Operations',
    'drivers-and-modes': 'Drivers and Modes',
    'advanced-functions': 'Advanced Functions',
    'error-codes': 'Error Codes'
  };

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
    if (!pathname.startsWith('/docs/')) {
      return 'what-is-graphicsh';
    }
    const slug = pathname.slice('/docs/'.length).trim();
    return slug || 'what-is-graphicsh';
  }

  function setActiveLink(slug) {
    document.querySelectorAll('a[data-link]').forEach(function (anchor) {
      anchor.classList.toggle('active', anchor.getAttribute('href') === '/docs/' + slug);
    });
  }

  function setDocumentTitle(slug, explicitTitle) {
    const pageTitle = explicitTitle || DOC_TITLES[slug] || body.dataset.docTitle || 'Documentation';
    document.title = pageTitle + ' | ' + SITE_TITLE;
  }

  function hasServerRenderedContent() {
    const text = content.textContent.trim();
    return text && text !== 'Loading...';
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
        document.title = 'Not Found | ' + SITE_TITLE;
        return;
      }

      const docTitle = response.headers.get('X-Doc-Title');
      const canonicalSlug = response.headers.get('X-Doc-Slug') || slug;
      const html = await response.text();
      content.innerHTML = html;
      await executeContentScripts(content);
      setActiveLink(canonicalSlug);
      setDocumentTitle(canonicalSlug, docTitle);
      body.dataset.docSlug = canonicalSlug;
      body.dataset.docTitle = docTitle || DOC_TITLES[canonicalSlug] || '';

      if (shouldPush) {
        history.pushState({ slug: canonicalSlug }, '', '/docs/' + canonicalSlug);
      }
    } catch (err) {
      content.innerHTML = '<h1>Error</h1><p>Unable to load documentation content right now.</p>';
      document.title = 'Error | ' + SITE_TITLE;
    }
  }

  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
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

  const initialSlug = slugFromPath(window.location.pathname);
  setActiveLink(initialSlug);
  setDocumentTitle(initialSlug, body.dataset.docTitle || undefined);

  if (!hasServerRenderedContent()) {
    loadSlug(initialSlug, false);
  }
})();
