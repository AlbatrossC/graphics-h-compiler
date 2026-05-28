# Site Architecture

This document covers how the site is built, served, and deployed. It explains the build pipeline, template rendering, static asset handling, caching headers, editor configuration, responsive layout, data persistence, and local development workflow.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Build Pipeline](#build-pipeline)
  - [Step 1: CodeMirror Bundle](#step-1-codemirror-bundle)
  - [Step 2: Compiler CSS/JS Bundle](#step-2-compiler-cssjs-bundle)
  - [Step 3: Asset Manifest](#step-3-asset-manifest)
  - [Step 4: Jinja2 Rendering](#step-4-jinja2-rendering)
  - [Step 5: Asset Copy](#step-5-asset-copy)
- [Pages Served](#pages-served)
- [URL Rewrites and Redirects](#url-rewrites-and-redirects)
- [Caching Headers](#caching-headers)
- [Security Headers](#security-headers)
- [Code Editor (CodeMirror 6)](#code-editor-codemirror-6)
  - [Loading Sequence](#loading-sequence)
  - [Extensions and Compartments](#extensions-and-compartments)
  - [Custom VS Code-Style Theme](#custom-vs-code-style-theme)
  - [Bracket Closing](#bracket-closing)
  - [Editor Settings](#editor-settings)
- [Data Persistence](#data-persistence)
  - [Guest Mode](#guest-mode)
  - [Logged-In Mode](#logged-in-mode)
  - [Autosave](#autosave)
- [Responsive Layout](#responsive-layout)
  - [Desktop Layout](#desktop-layout)
  - [Mobile Layout](#mobile-layout)
  - [Panel Splitters](#panel-splitters)
- [Theme System](#theme-system)
- [Preferences Panel](#preferences-panel)
- [Deployment](#deployment)
- [Running Locally](#running-locally)
- [CSS Architecture](#css-architecture)
- [File Reference](#file-reference)

---

## Tech Stack

| Layer | Technology | Details |
|:---|:---|:---|
| Templates | Jinja2 (Python) | Renders HTML from `site/templates/` into `dist/` |
| Bundler | Python `build.py` + esbuild | CSS/JS concatenation + minification; esbuild for CodeMirror |
| CSS minifier | `rcssmin` | Python-based CSS minifier |
| JS minifier | `rjsmin` | Python-based JS minifier |
| Editor | CodeMirror 6 | Modular code editor framework (~530 KB bundled) |
| Fonts | JetBrains Mono, IBM Plex Sans, Space Mono | Via `@fontsource` npm packages |
| Hosting | Cloudflare Pages | Static site deployment from `dist/` |
| API | Cloudflare Workers | Two workers: `graphics-oc-api` and `graphics-oc-files` |
| Database | Cloudflare D1 (SQLite) | User files, folders, accounts |
| Auth | Google Sign-In + JWT | HMAC-SHA256 signed session cookies |
| File storage (client) | IndexedDB | Primary local draft storage (replaces localStorage) |

---

## Project Structure

```
graphics-h-online-compiler/
├── build-tools/                    # Build scripts
│   ├── build.py                    # Main build orchestrator (entry point)
│   ├── render.py                   # Jinja2 → HTML renderer + asset copier
│   ├── codemirror-entry.js         # esbuild entry for CodeMirror bundle
│   └── readme.md                   # Build tools documentation
├── site/
│   ├── templates/                  # Jinja2 HTML templates (10 pages)
│   │   ├── compiler.html           # Main compiler IDE (~50 KB)
│   │   ├── index.html              # Landing page
│   │   ├── about.html              # About page
│   │   ├── contact.html            # Contact form
│   │   ├── embed.html              # Embeddable compiler widget
│   │   ├── embed-docs.html         # Embeddable docs widget
│   │   ├── privacy-policy.html     # Privacy policy
│   │   ├── terms.html              # Terms of service
│   │   ├── maintenance.html        # Maintenance page
│   │   └── 404.html                # Not found page
│   ├── static/
│   │   ├── css/
│   │   │   ├── compiler/           # 6 CSS files (see CSS Architecture)
│   │   │   ├── compiler.css        # Import wrapper (306 bytes)
│   │   │   ├── fonts.css           # @font-face declarations
│   │   │   └── index.css           # Landing page styles (~44 KB)
│   │   ├── js/
│   │   │   └── compiler/           # 9 JS files (see File Reference)
│   │   ├── build/                  # Build output (hashed bundles + manifest)
│   │   ├── fonts/                  # Self-hosted font files
│   │   ├── images/                 # Static images
│   │   ├── assets/                 # JSON data (docs.1.json, demo-files-v1.json)
│   │   └── html/
│   │       └── dos-runner.html     # DOSBox iframe (see compiler.md)
│   ├── compiler-assets/
│   │   ├── libs/                   # JS-DOS runtime (js-dos.js, wdosbox.js, wdosbox.wasm.js)
│   │   ├── zip-files/              # Compiler filesystem (tc-v1.zip)
│   │   ├── Demo_files/             # Demo .cpp source files
│   │   ├── graphics/               # Graphics library files
│   │   ├── Installers/             # Downloadable installers
│   │   └── unified/               # Standalone single-HTML-file compiler
│   ├── _headers                    # Cloudflare Pages cache & security headers
│   └── _redirects                  # Cloudflare Pages URL rewrites
├── workers/
│   ├── graphics-oc-api/            # Public API gateway (see workers.md)
│   └── graphics-oc-files/          # File storage & auth (see workers.md)
├── dist/                           # Build output (deployed to Cloudflare Pages)
├── package.json                    # npm scripts and dependencies
└── requirements.txt                # Python dependencies (Jinja2, rcssmin, rjsmin)
```

---

## Build Pipeline

The build is triggered from the repository root:

```bash
npm run build
# which runs: python build-tools/build.py
```

The `main()` function in `build.py` (line 194) orchestrates five steps in sequence.

### Step 1: CodeMirror Bundle

esbuild bundles all CodeMirror 6 packages from `node_modules` into a single ESM file. The entry point is `build-tools/codemirror-entry.js`, which imports and re-exports the required packages:

```
@codemirror/state       → cmCore
@codemirror/view        → cmView
@codemirror/language    → cmLanguage
@codemirror/lang-cpp    → cmCpp
@codemirror/commands    → cmCommands
@codemirror/search      → cmSearch
@codemirror/autocomplete → cmAutocomplete
@lezer/highlight        → lezerHighlight
```

Output:
```
site/static/js/compiler/codemirror.bundle.v1.js
```

The esbuild config (constructed inline in `build.py` line 122):
```js
esbuild.buildSync({
    entryPoints: ['build-tools/codemirror-entry.js'],
    bundle: true,
    outfile: 'site/static/js/compiler/codemirror.bundle.v1.js',
    format: 'esm',
    minify: true,
    treeShaking: true,
    sourcemap: false,
    target: ['es2020'],
});
```

### Step 2: Compiler CSS/JS Bundle

Source CSS and JS files for the compiler page are concatenated in a **defined priority order**, minified, and written to `site/static/build/` with content-hash filenames.

**CSS load order** (defined in `build.py` line 27):

| Priority | File | Purpose |
|:---|:---|:---|
| 1 | `base.css` | CSS variables, resets, foundational styles |
| 2 | `panels.css` | Editor, terminal, output panel layout |
| 3 | `sidebar.css` | File explorer and sidebar styles |
| 4 | `preferences.css` | Settings panel styles |
| 5 | `docs-reference.css` | Function reference panel styles |
| 6 | `responsive.css` | Media queries and mobile overrides |

**JS load order** (defined in `build.py` line 36):

| Priority | File | Purpose |
|:---|:---|:---|
| 1 | `app.js` | Global state, caching, preloading, DOM refs, splitters |
| 2 | `files-ui.js` | File explorer UI rendering |
| 3 | `files.js` | Cloud sync, auth, IndexedDB, autosave |
| 4 | `autocomplete.js` | C++ autocomplete with `graphics.h` signatures |
| 5 | `editor.js` | CodeMirror 6 initialization and wrapper API |
| 6 | `shell.js` | Sidebar UI interactions, mobile tab switching |
| 7 | `execution.js` | Run button, batch script, iframe messaging |
| 8 | `preferences.js` | Settings panel with live editor reconfiguration |

Files in `EXCLUDED_JS` are never bundled: `codemirror.bundle.v1.js`, `js-dos-loader.js`, `dosbox.js`, `dosbox.wasm`.

The bundling process (`bundle_text()` in `build.py` line 72):
1. Reads each file in order
2. Prepends a source comment (`/* Source: path */` for CSS, `// Source: path` for JS)
3. Joins with a separator (empty string for CSS, `;` for JS)
4. Minifies the result (`rcssmin` for CSS, `rjsmin` for JS)

Output filenames include a 12-character SHA-256 content hash:
```
site/static/build/compiler.<hash>.css
site/static/build/compiler.<hash>.js
```

### Step 3: Asset Manifest

After bundling, an asset manifest is written to `site/static/build/asset-manifest.json`:

```json
{
  "compiler": {
    "css": "/static/build/compiler.abc123def456.css",
    "js": "/static/build/compiler.abc123def456.js",
    "css_sources": ["site/static/css/compiler/base.css", "..."],
    "js_sources": ["site/static/js/compiler/app.js", "..."]
  },
  "separate": {
    "codemirror_bundle": "/static/js/compiler/codemirror.bundle.v1.js",
    "lazy_loaded": [
      "/static/js/compiler/codemirror.bundle.v1.js",
      "/libs/js-dos.js",
      "/libs/wdosbox.js",
      "/libs/wdosbox.wasm",
      "/static/js/analytics.js"
    ]
  }
}
```

### Step 4: Jinja2 Rendering

`render.py` is imported by `build.py` and its `render_site()` function renders templates into `dist/`.

Template context variables:

| Variable | Source | Default |
|:---|:---|:---|
| `SITE_DOMAIN` | `SITE_DOMAIN` env var | `https://cloudflare.graphics-h-compiler.pages.dev` |
| `PUBLIC_ASSETS_URL` | `PUBLIC_ASSETS_URL` env var | (empty — same origin) |
| `PUBLIC_API_URL` | `PUBLIC_API_URL` env var | `https://graphics-oc-api.graphicshcompiler.workers.dev` |
| `compiler_assets` | From asset manifest | `{ css_urls: [...], js_urls: [...] }` |
| `docs_categories` | From `static/assets/docs.1.json` | Array of function categories for reference panel |
| `feedback_enabled` | Hardcoded `True` | Enables the feedback button |
| `contact_enabled` | Hardcoded `True` | Enables the contact form |
| `maintenance_date` | `MAINTENANCE_DATE` env var | `25 Feb 2026 - 2:00 PM IST` |

The Jinja2 environment uses `autoescape=False` (no HTML escaping) since templates contain raw HTML.

Render failures are collected and raised as a single `RenderError` at the end. This prevents partial deploys where some pages are broken.

A `sitemap.xml` is also generated with entries for `/compiler` (priority 1.0), `/` (0.95), `/about` (0.5), `/contact` (0.5), and policy pages (0.4).

### Step 5: Asset Copy

After rendering HTML, the build copies static assets into `dist/`:

| Source | Destination | Notes |
|:---|:---|:---|
| `site/static/` | `dist/static/` | CSS, JS, fonts, images, videos, JSON. When hashed bundles are used, unbundled compiler source CSS/JS are **excluded** from the copy. |
| `site/compiler-assets/` | `dist/compiler-assets/` | DOS runtime libs, compiler ZIP, demo files |
| `site/compiler-assets/libs/` | `dist/libs/` | Aliased copy for the `/libs/*` URL path |
| `site/_headers` | `dist/_headers` | Cloudflare cache/security headers |
| `site/_redirects` | `dist/_redirects` | URL rewrites |
| `site/static/robots.txt` | `dist/robots.txt` | Robots file at root |
| `site/static/sdk.js` | `dist/sdk.js` | Public SDK at root |

The source file exclusion is handled by `make_static_ignore()` in `render.py` (line 179). It returns a callback for `shutil.copytree(ignore=...)` that skips the `css/compiler/` directory and individual JS source files when the build is using hashed bundles.

---

## Pages Served

| URL | Template | Description |
|:---|:---|:---|
| `/` | `index.html` | Landing page with project overview |
| `/compiler` | `compiler.html` | Main compiler IDE (editor + terminal + sidebar) |
| `/about` | `about.html` | About the project |
| `/contact` | `contact.html` | Contact form (sends to Discord webhook) |
| `/embed` | `embed.html` | Embeddable compiler widget for third-party sites |
| `/embed-docs` | `embed-docs.html` | Embeddable docs reference widget |
| `/privacy-policy` | `privacy-policy.html` | Privacy policy |
| `/terms` | `terms.html` | Terms of service |
| `/maintenance` | `maintenance.html` | Maintenance page (shown when site is down) |
| `/404.html` | `404.html` | Custom 404 page |

---

## URL Rewrites and Redirects

Defined in `site/_redirects`:

```
/compiler.html  /compiler                     301    # Pretty URL redirect
/libs/*         /compiler-assets/libs/:splat  200    # Runtime library alias
/sdk.js         /static/js/sdk.js             200    # Public SDK shortcut
```

The `/libs/*` rewrite is important — all compiler code references runtime files at `/libs/js-dos.js`, `/libs/wdosbox.js`, etc., but the actual files live under `/compiler-assets/libs/`. The `200` status means this is a proxy rewrite (the URL doesn't change in the browser).

---

## Caching Headers

Defined in `site/_headers`. The strategy uses three tiers:

### Tier 1 — Immutable (1 year)

For assets with content hashes or version strings in filenames. These never change at the same URL.

```
Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable, no-transform
```

| Path pattern | Example |
|:---|:---|
| `/static/build/compiler.*.css` | Hashed CSS bundle |
| `/static/build/compiler.*.js` | Hashed JS bundle |
| `/libs/*` | js-dos.js, wdosbox.js, wdosbox.wasm.js |
| `/compiler-assets/zip-files/*.zip` | tc-v1.zip (also gets `Content-Disposition: attachment`) |
| `/static/fonts/*` | JetBrains Mono, IBM Plex Sans files |
| `/static/images/*` | Static images |
| `/static/audio/*` | Audio files |
| `/static/videos/*` | Video files |
| `/static/assets/*` | JSON data bundles (docs.1.json, demo-files-v1.json) |
| `/static/js/compiler/codemirror.bundle.v1.js` | CodeMirror bundle (version in filename) |
| `/static/html/dos-runner.html` | DOS runner iframe |

### Tier 2 — Revalidatable (7 days)

For non-hashed CSS/JS entry files that may change between deploys:

```
Cache-Control: public, max-age=604800, s-maxage=604800, must-revalidate
```

Applies to `/static/css/*` and `/static/js/*` (catch-all for files not matched by Tier 1).

### Tier 3 — Always fresh (0 seconds)

For HTML pages and metadata that should reflect deploys immediately:

```
Cache-Control: public, max-age=0, must-revalidate
```

Applies to all HTML routes (`/`, `/compiler`, `/about`, `/contact`, `/embed`, `/embed-docs`, `/privacy-policy`, `/terms`, `/maintenance`, `/404.html`), plus `manifest.json`, `asset-manifest.json`, `robots.txt`, and `sitemap.xml`.

---

## Security Headers

Applied globally to all routes (`/*`):

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

The `/compiler` and `/compiler.html` pages additionally get:

```
Cross-Origin-Opener-Policy: same-origin-allow-popups
```

This is required for the Google Sign-In popup to work correctly. Without it, `window.open()` calls from the Google Identity Services library are blocked.

---

## Code Editor (CodeMirror 6)

### Loading Sequence

The editor loads in a specific order managed by `loadAllScripts()` in `editor.js` (line 37):

1. **Initialize resource sources** — `initializeResourcesFromManifest()` sets up compiler asset URLs
2. **Load CodeMirror** — Dynamic ESM import of `codemirror.bundle.v1.js` (the `editorPromise` at line 7)
3. **Initialize editor** — `initializeEditor()` creates the EditorView with all extensions
4. **Load default code** — Restores from IndexedDB, localStorage migration, or loads the default demo
5. **Ensure DOS runner frame** — Lazy-loads the iframe for the terminal
6. **Start preloading** — Queues runtime asset downloads via `requestIdleCallback`

Each step updates the loading progress bar (10% → 30% → 50% → 70% → 100%).

### Extensions and Compartments

The editor uses CodeMirror 6's **Compartment** system for dynamic reconfiguration. Each toggleable feature has its own compartment:

```js
editorStyleCompartment   // VS Code-style theme
fontSizeCompartment      // Font size (10–32px)
wordWrapCompartment      // Word wrap toggle
lineNumbersCompartment   // Line numbers toggle
bracketMatchCompartment  // Bracket matching toggle
activeLineCompartment    // Active line highlight toggle
```

Reconfiguring a setting at runtime dispatches an effect:

```js
cmView.dispatch({
    effects: wordWrapCompartment.reconfigure(
        enabled ? EditorView.lineWrapping : []
    )
});
```

**Heavy features** (history, bracket matching, selection match highlighting) are loaded via a deferred `requestIdleCallback` to keep the initial editor render instant:

```js
const executeHeavyFeatures = () => {
    const heavyExtensions = [
        bracketMatchCompartment.of(bracketMatching()),
        history(),
        highlightSelectionMatches(),
        createSelectedMatchHighlightExtension(),
        keymap.of([...historyKeymap])
    ];
    cmView.dispatch({
        effects: heavyFeaturesCompartment.reconfigure(heavyExtensions)
    });
};

if (window.requestIdleCallback) {
    window.requestIdleCallback(executeHeavyFeatures);
} else {
    setTimeout(executeHeavyFeatures, 300);
}
```

### Custom VS Code-Style Theme

The editor uses CSS custom properties for syntax highlighting, defined in `createVsCodeEditorStyleExtension()` in `editor.js` (line 251):

```js
{ tag: tags.keyword,    color: 'var(--syn-keyword)' },
{ tag: tags.string,     color: 'var(--syn-string)' },
{ tag: tags.number,     color: 'var(--syn-number)' },
{ tag: tags.comment,    color: 'var(--syn-comment)' },
{ tag: tags.typeName,   color: 'var(--syn-type)' },
{ tag: tags.function(), color: 'var(--syn-property)' },
{ tag: tags.meta,       color: 'var(--syn-meta)' },
// ...
```

The editor styling references CSS variables like `--vscode-line-bg`, `--vscode-sidebar`, `--vscode-border`, and `--primary` so colors automatically update when switching themes (dark/light).

### Bracket Closing

Custom bracket auto-closing is implemented in `createBracketClosingExtension()` in `editor.js` (line 357). It handles:

- **Auto-pairing** — Typing `(`, `[`, `{`, `"`, or `'` inserts the closing pair
- **Skip-close** — If the next character is already the closing bracket, typing it just moves the cursor right
- **Paired deletion** — Pressing Backspace between `()`, `[]`, or `{}` deletes both characters
- **Split brackets** — Pressing Enter between `{}`, `[]`, or `()` creates an indented newline

### Editor Settings

Settings are persisted to localStorage under the key `editor_settings`:

```js
const SETTINGS_STORAGE_KEY = 'editor_settings';
```

The settings object shape:

```json
{
  "editor": {
    "fontSize": 16,
    "wordWrap": true,
    "lineNumbers": true,
    "bracketMatching": true,
    "activeLine": true,
    "autocomplete": true,
    "hoverTooltips": true,
    "floatingRunBtn": true
  }
}
```

Font size is clamped to 10–32px. There's a legacy migration path that reads from `editor_font_size` (old key) and migrates to the new structured format.

---

## Data Persistence

### Guest Mode

Guest users (not signed in) store their code in **IndexedDB** as the primary storage:

- **Database:** `compiler_project_files_v1` (version 1)
- **Object store:** `files` (keyed by `id` = `folder/filename`)
- **Record shape:**
  ```json
  {
    "id": "root/main.cpp",
    "name": "main.cpp",
    "content": "...",
    "lastSavedHash": "sha256...",
    "lastModified": 1716825600000,
    "dirty": true,
    "folderId": null,
    "folderKey": "root"
  }
  ```

There's a legacy migration path from localStorage (`tc_code` key). On first load, if IndexedDB has no draft but `localStorage.tc_code` exists, the code is migrated to IndexedDB and the localStorage key is deleted.

IndexedDB has a 3-second open timeout to handle iOS Safari private mode and some Android browsers that silently hang on `indexedDB.open()`.

### Logged-In Mode

Signed-in users get cloud storage via the Workers API. IndexedDB serves as a **local cache mirror** of cloud state. The cloud sync flow:

1. **On sign-in:** Cloud files are fetched via `GET /api/files` and cached in IndexedDB
2. **On edit:** Code is written to IndexedDB immediately (non-blocking `setLocalDraftImmediate()`), and a 20-second autosave timer starts
3. **On autosave:** Code is saved to the cloud via `POST /api/file/save`
4. **On run:** If there are unsaved changes, a `forceSaveActiveFile()` is called in the background

Content-hash deduplication: The save API returns early (`changed: false`) if the content hash matches what's already stored. The `CLOUD_STATE.hashToFileKey` Map provides O(1) duplicate detection on sign-in.

### Autosave

Autosave is configured in `app.js`:

```js
const AUTOSAVE_DELAY_MS = 20000;  // 20-second idle autosave
const TYPING_DEBOUNCE_MS = 0;     // Timer resets immediately on every keystroke
```

The change listener in `editor.js` (line 650) triggers on every document change:
1. Sets `DIRTY_FLAG.isDirty = true`
2. Writes to IndexedDB immediately (non-blocking)
3. Calls `scheduleAutosave()` which resets the 20-second timer
4. Debounces UI updates (editor info, save indicator) by 150ms

---

## Responsive Layout

### Desktop Layout

Three-panel layout with draggable splitters:

```
┌──────────┬────────────────────┬────────────────────┐
│ Sidebar  │  Editor (CM6)      │  Terminal (DOS)     │
│ (Files/  │                    │                     │
│  Settings)│                    │  ┌──────────────┐  │
│          │                    │  │ <iframe>      │  │
│          │                    │  │ dos-runner    │  │
│          │                    │  │               │  │
│          │                    │  └──────────────┘  │
│          │                    │  ┌──────────────┐  │
│          │                    │  │ Error Panel   │  │
│          │                    │  └──────────────┘  │
└──────────┴────────────────────┴────────────────────┘
         ↕ sidebar splitter    ↕ terminal splitter
```

### Mobile Layout

Tab-based layout with a bottom tab bar:

```
┌────────────────────────────────┐
│  Toolbar (Run, Files, etc.)    │
├────────────────────────────────┤
│                                │
│  Active Tab Content            │
│  (Editor OR Terminal)          │
│                                │
├────────────────────────────────┤
│  [Code]  [Output]             │  ← Bottom tab bar
└────────────────────────────────┘
```

The sidebar slides in as an overlay on mobile, triggered via the Files button. The overlay has a semi-transparent backdrop.

Mobile detection uses both user agent and viewport width:

```js
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
    .test(navigator.userAgent) || window.innerWidth <= 768;
```

### Panel Splitters

Draggable splitters between panels are implemented in `app.js` (line 616, the `initSplitters()` IIFE). Features:

- **Sidebar splitter** — Resizes the sidebar width (min 120px, max 600px). Dragging below 80px collapses the sidebar.
- **Terminal splitter** — Adjusts the editor/terminal flex ratio. Min width of 80px for each panel.
- **Mouse and touch support** — Both `mousedown/mousemove/mouseup` and `touchstart/touchmove/touchend` handlers.
- **Double-click to reset** — Double-clicking a splitter resets the panel to its default size.
- **Pointer events** — The DOS iframe's `pointerEvents` are set to `none` during drag to prevent it from stealing mouse events.
- **Fullscreen awareness** — Splitters are hidden when either panel goes fullscreen.

---

## Theme System

The site supports dark (default) and light themes. Theme switching is handled in `preferences.js` (line 476):

```js
function applyTheme(theme, save = true) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    if (save) {
        localStorage.setItem('app-theme', theme);
    }
}
```

CSS uses `[data-theme="light"]` selectors to override CSS custom properties. The saved theme is loaded from `localStorage.app-theme` on page load.

---

## Preferences Panel

The settings panel lives in the sidebar and is managed by `preferences.js`. It provides live editor reconfiguration through these controls:

| Setting | Control Type | Range | Effect |
|:---|:---|:---|:---|
| Font size | Slider + buttons | 10–32px | Reconfigures `fontSizeCompartment` |
| Word wrap | Toggle | on/off | Reconfigures `wordWrapCompartment` |
| Line numbers | Toggle | on/off | Reconfigures `lineNumbersCompartment` |
| Bracket matching | Toggle | on/off | Reconfigures `bracketMatchCompartment` |
| Active line | Toggle | on/off | Reconfigures `activeLineCompartment` |
| Autocomplete | Toggle | on/off | Enables/disables suggestions |
| Hover tooltips | Toggle | on/off | Enables/disables hover documentation |
| Floating run button | Toggle | on/off | Shows/hides the floating run button (desktop only) |
| Theme | Toggle button | dark/light | Sets `data-theme` attribute |
| Reset | Button | — | Resets all settings to defaults |

All changes are applied immediately (no save button needed) and persisted to localStorage. Settings sync across tabs via the `editor-settings-changed` custom event.

---

## Deployment

### Cloudflare Pages

The site is deployed to **Cloudflare Pages**. The `dist/` folder is the deploy artifact.

- **Build command:** `npm run build`
- **Output directory:** `dist/`

### Environment Variables

| Variable | Purpose | Default |
|:---|:---|:---|
| `SITE_DOMAIN` | Canonical site URL for meta tags and sitemap | `https://cloudflare.graphics-h-compiler.pages.dev` |
| `PUBLIC_ASSETS_URL` | CDN prefix for static assets | (empty — serve from same origin) |
| `PUBLIC_API_URL` | API worker URL | `https://graphics-oc-api.graphicshcompiler.workers.dev` |
| `MAINTENANCE_DATE` | Display date on maintenance page | `25 Feb 2026 - 2:00 PM IST` |

### Workers

Workers are deployed separately via Wrangler:

```bash
cd workers/graphics-oc-api && npx wrangler deploy
cd workers/graphics-oc-files && npx wrangler deploy
```

---

## Running Locally

### Prerequisites

- Python 3.8+
- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/AlbatrossC/graphics-h-compiler.git
cd graphics-h-compiler

# Install Python dependencies
pip install -r requirements.txt

# Install npm dependencies
npm install
```

### Build

```bash
npm run build
```

This generates the full `dist/` folder. To serve it locally:

```bash
# Option 1: Python HTTP server
cd dist && python -m http.server 8000

# Option 2: npx serve
npx serve dist

# Option 3: Flask dev server (if app.py exists)
python app.py
# → http://localhost:5000/compiler
```

Then open `http://localhost:8000/compiler` (or the appropriate port).

For the Jinja2 renderer only (without npm), you can call the build script directly:

```bash
python build-tools/build.py
```

To add a new CodeMirror package: install with npm, add the import/export to `codemirror-entry.js`, and run `npm run build`.

---

## CSS Architecture

The compiler page styles are split across 6 CSS files in `site/static/css/compiler/`:

| File | Responsibility |
|:---|:---|
| `base.css` | CSS custom properties (colors, spacing, typography), resets, scrollbar styles, general layout rules |
| `panels.css` | Editor wrapper, terminal wrapper, output/error panel, loading overlay, splitter styling |
| `sidebar.css` | File explorer tree, sidebar header, activity bar, cloud promo view, mobile sidebar overlay |
| `preferences.css` | Settings panel layout, toggles, sliders, reset button, theme toggle |
| `docs-reference.css` | Function reference panel cards, search, categories |
| `responsive.css` | Media queries for `max-width: 768px`, mobile tab bar, mobile-specific overrides |

The order matters because later files override earlier ones (e.g., `responsive.css` overrides `panels.css` with mobile-specific styles).

---

## File Reference

| File | Lines | Role |
|:---|:---|:---|
| `build-tools/build.py` | 216 | Main build script: bundles CSS/JS, generates asset manifest, calls renderer |
| `build-tools/render.py` | 357 | Jinja2 template renderer: produces `dist/`, copies assets, generates sitemap |
| `build-tools/codemirror-entry.js` | ~30 | esbuild entry point: imports and re-exports CodeMirror packages |
| `site/static/js/compiler/app.js` | 797 | Global state, caching (`cachedFetch`, Cache API), TC ZIP download, preloading, iframe management, output panel, panel splitters, settings, metrics, logger |
| `site/static/js/compiler/editor.js` | 775 | CodeMirror 6 setup: bundle loading, EditorView creation, VS Code theme, bracket closing, editor wrapper API, font controls, change listener, demo file loading, code restore |
| `site/static/js/compiler/files.js` | 1434 | Cloud sync: Google auth, IndexedDB (`FileDB`), autosave, file/folder CRUD, sign-in flow (hash dedup, save modal), sign-out, tab management |
| `site/static/js/compiler/files-ui.js` | — | File explorer UI rendering (tree view, drag & drop) |
| `site/static/js/compiler/autocomplete.js` | — | C++ autocomplete: `graphics.h` function signatures, parameter hints |
| `site/static/js/compiler/shell.js` | — | Sidebar interactions, mobile tab switching, fullscreen toggles |
| `site/static/js/compiler/execution.js` | 420 | Run button, batch script, iframe messaging, keyboard shortcuts, terminal zoom |
| `site/static/js/compiler/preferences.js` | 520 | Settings panel: live editor reconfiguration, theme toggle, floating run button |
| `site/_headers` | 133 | Cloudflare Pages cache and security headers (3 tiers) |
| `site/_redirects` | 14 | URL rewrites for pretty URLs and lib aliases |
| `package.json` | 24 | npm scripts (`build`), dependencies (CodeMirror, fonts, esbuild) |
