(function () {
  const content = document.getElementById('content');
  const body = document.body;
  const root = document.documentElement;
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const themeToggle = document.getElementById('theme-toggle');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const SITE_TITLE = body.dataset.siteTitle || 'Graphics.h Documentation';
  const mobileQuery = window.matchMedia('(max-width: 900px)');
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

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    if (themeToggle) {
      themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
      themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  }

  function initTheme() {
    let initial = 'light';
    try {
      const saved = localStorage.getItem('docs-theme');
      if (saved === 'dark' || saved === 'light') {
        initial = saved;
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        initial = 'dark';
      }
    } catch (e) {
      initial = 'light';
    }
    applyTheme(initial);
  }

  function updateSidebarUi(open) {
    const isMobile = mobileQuery.matches;
    if (isMobile) {
      body.classList.toggle('sidebar-open', open);
      body.classList.remove('sidebar-collapsed');
      if (sidebarBackdrop) {
        sidebarBackdrop.hidden = !open;
      }
      if (sidebarToggle) {
        sidebarToggle.setAttribute('aria-expanded', String(open));
      }
      return;
    }

    body.classList.remove('sidebar-open');
    if (sidebarBackdrop) {
      sidebarBackdrop.hidden = true;
    }
    body.classList.toggle('sidebar-collapsed', !open);
    if (sidebarToggle) {
      sidebarToggle.setAttribute('aria-expanded', String(open));
    }
  }

  function initSidebarState() {
    updateSidebarUi(!mobileQuery.matches);
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

  function setMetaDescription(explicitDescription) {
    const fallback = 'Graphics.h online compiler documentation with function references, examples, and student-friendly guides.';
    const description = explicitDescription || body.dataset.docDescription || fallback;
    const meta = document.getElementById('meta-description');
    if (meta) {
      meta.setAttribute('content', description);
    }
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
      const docDescription = response.headers.get('X-Doc-Description');
      const html = await response.text();
      content.innerHTML = html;
      await executeContentScripts(content);
      setActiveLink(canonicalSlug);
      setDocumentTitle(canonicalSlug, docTitle);
      setMetaDescription(docDescription || undefined);
      body.dataset.docSlug = canonicalSlug;
      body.dataset.docTitle = docTitle || DOC_TITLES[canonicalSlug] || '';
      body.dataset.docDescription = docDescription || '';

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
    if (mobileQuery.matches) {
      updateSidebarUi(false);
    }
  });

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      const isMobile = mobileQuery.matches;
      if (isMobile) {
        const nextOpen = !body.classList.contains('sidebar-open');
        updateSidebarUi(nextOpen);
      } else {
        const nextOpen = body.classList.contains('sidebar-collapsed');
        updateSidebarUi(nextOpen);
      }
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', function () {
      updateSidebarUi(false);
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('docs-theme', next);
      } catch (e) {}
      applyTheme(next);
    });
  }

  mobileQuery.addEventListener('change', function () {
    initSidebarState();
  });

  window.addEventListener('popstate', function () {
    loadSlug(slugFromPath(window.location.pathname), false);
  });

  const initialSlug = slugFromPath(window.location.pathname);
  initTheme();
  initSidebarState();
  setActiveLink(initialSlug);
  setDocumentTitle(initialSlug, body.dataset.docTitle || undefined);
  setMetaDescription(body.dataset.docDescription || undefined);

  if (!hasServerRenderedContent()) {
    loadSlug(initialSlug, false);
  }
})();
