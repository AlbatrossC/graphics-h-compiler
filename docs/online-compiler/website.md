# Website — Build, Deployment, and Infrastructure

> Everything about how the website is built, deployed, cached, and tracked.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Flask Application](#flask-application)
  - [App Factory](#app-factory)
  - [Blueprints](#blueprints)
  - [Middleware & Hooks](#middleware--hooks)
- [Pages & Routes](#pages--routes)
- [Build Pipeline (build.py)](#build-pipeline-buildpy)
  - [CSS Bundle](#css-bundle)
  - [JS Bundle](#js-bundle)
  - [Asset Manifest](#asset-manifest)
  - [Hashed Filenames](#hashed-filenames)
- [Vercel Deployment](#vercel-deployment)
  - [vercel.json Configuration](#verceljson-configuration)
  - [Build Command](#build-command)
  - [Route Rules](#route-rules)
- [Caching Strategy](#caching-strategy)
  - [Immutable Assets (1 year)](#immutable-assets-1-year)
  - [Standard Assets (1 week)](#standard-assets-1-week)
  - [Client-Side Cache API](#client-side-cache-api)
  - [Demo File Cache](#demo-file-cache)
- [SEO & Structured Data](#seo--structured-data)
  - [Meta Tags](#meta-tags)
  - [Structured Data (JSON-LD)](#structured-data-json-ld)
  - [SSR Documentation Reference](#ssr-documentation-reference)
  - [Sitemap & Robots](#sitemap--robots)
- [Analytics & Trackers](#analytics--trackers)
  - [Google Analytics (GA4)](#google-analytics-ga4)
  - [Microsoft Clarity](#microsoft-clarity)
  - [Vercel Web Analytics](#vercel-web-analytics)
  - [Google AdSense](#google-adsense)
- [Security Headers](#security-headers)
- [Maintenance Mode](#maintenance-mode)
- [Asset Sources & CDN Fallbacks](#asset-sources--cdn-fallbacks)
- [Static Assets](#static-assets)
- [Templates](#templates)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)

---

## Overview

The Graphics.h Online Compiler is a **Flask** web application deployed on **Vercel** as a serverless Python function. Static assets (CSS, JS, fonts, images) are served via Vercel's CDN with aggressive caching. The compiler page bundles all CSS and JS into hashed files for cache-busting.

![Homepage](../images/online-demo-2.png)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Flask (Python) |
| Frontend | Vanilla HTML/CSS/JS |
| Editor | CodeMirror 6 (ESM bundle) |
| DOS Emulation | JS-DOS 6.22 + WDOSBOX (WASM) |
| Hosting | Vercel (serverless Python + static CDN) |
| Database | Cloudflare D1 (SQLite) |
| Worker | Cloudflare Workers |
| Auth | Google Identity Services (One Tap) |
| Build | Python (`build.py`) + esbuild |
| Fonts | JetBrains Mono (self-hosted) |

---

## Project Structure

```
graphics.h-online-compiler/
├── app.py                     ← Entry point (Vercel + local)
├── build.py                   ← Asset build pipeline
├── package.json               ← npm deps (CodeMirror, esbuild)
├── vercel.json                ← Vercel deployment config
├── requirements.txt           ← Python deps (Flask, etc.)
│
├── src/                       ← Flask app package
│   ├── __init__.py            ← App factory (create_app)
│   ├── compiler_assets.py     ← Asset manifest loader
│   ├── hooks.py               ← Security headers, maintenance, errors
│   ├── proxy.py               ← Reverse proxy for Worker API
│   ├── docs_data.py           ← Documentation slug/template mapping
│   ├── logging_utils.py       ← Colored console logging
│   └── blueprints/
│       ├── pages.py           ← Page routes (/, /compiler, /about, etc.)
│       ├── storage.py         ← API proxy (/api/*)
│       ├── assets.py          ← Static asset routes (/libs/*)
│       ├── docs.py            ← Documentation pages (/docs/*)
│       └── contact.py         ← Contact form handler
│
├── templates/                 ← Jinja2 HTML templates
│   ├── compiler.html          ← Main compiler workspace
│   ├── index.html             ← Landing page
│   ├── about.html             ← About page
│   ├── contact.html           ← Contact page
│   ├── base.html              ← Base layout template
│   ├── docs.html              ← Documentation hub
│   ├── docs/                  ← Individual docs pages
│   ├── 404.html               ← Error page
│   ├── maintenance.html       ← Maintenance mode page
│   ├── embed.html             ← Embeddable compiler widget
│   ├── embed-docs.html        ← Embeddable docs widget
│   ├── privacy-policy.html
│   └── terms.html
│
├── static/                    ← Static files
│   ├── css/compiler/          ← Compiler CSS source files
│   ├── js/compiler/           ← Compiler JS source files
│   ├── build/                 ← Built/hashed bundles + manifest
│   ├── assets/                ← JSON data files (functions, docs)
│   ├── fonts/                 ← Self-hosted fonts
│   ├── analytics.js           ← Analytics loader
│   ├── dos-runner.html        ← Isolated DOS iframe
│   ├── sitemap.xml            ← SEO sitemap
│   └── robots.txt             ← Crawler instructions
│
├── compiler-assets/           ← Compiler runtime files
│   ├── libs/                  ← JS-DOS, WDOSBOX, legacy Ace
│   ├── zip-files/             ← tc-v1.zip (Turbo C++)
│   ├── fonts/                 ← JetBrains Mono woff2
│   ├── Demo_files/            ← Demo source files + JSON bundle
│   └── graphics/              ← Graphics docs data
│
├── workers/                   ← Cloudflare Workers
│   └── graphics-oc-files/     ← User file storage worker
│
├── build-tools/               ← Build inputs (not served directly)
│   └── codemirror/entry.js    ← CodeMirror bundle entry point
│
└── docs/                      ← Developer documentation
```

---

## Flask Application

### App Factory

File: `src/__init__.py`

```python
def create_app():
    load_dotenv()
    app = Flask(__name__, static_folder='../static', template_folder='../templates')
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 604800  # 1 week
    register_hooks(app)
    app.register_blueprint(pages_bp)
    app.register_blueprint(docs_bp)
    app.register_blueprint(storage_bp)
    app.register_blueprint(assets_bp)
    app.register_blueprint(contact_bp)
    return app
```

### Blueprints

| Blueprint | File | Prefix | Purpose |
|---|---|---|---|
| `pages_bp` | `blueprints/pages.py` | `/` | HTML pages (`/`, `/compiler`, `/about`, etc.) |
| `docs_bp` | `blueprints/docs.py` | `/docs` | Documentation pages |
| `storage_bp` | `blueprints/storage.py` | `/api` | Auth + file storage proxy |
| `assets_bp` | `blueprints/assets.py` | `/libs`, `/compiler-assets` | Static asset serving |
| `contact_bp` | `blueprints/contact.py` | `/contact` | Contact form submission |

### Middleware & Hooks

File: `src/hooks.py`

**Before request:**
- **Maintenance mode** — if `MAINTENANCE_MODE=true` env var is set, all non-static, non-API requests return the maintenance page.

**After request:**
- **Security headers** — applied to every response (see [Security Headers](#security-headers)).
- **Cache headers** — hashed assets get `immutable` cache, fonts get 1-year cache.

**Error handlers:**
- `404` → HTML error page for browsers, JSON for API/static requests.
- `500` → JSON error response.

---

## Pages & Routes

| Path | Template | Notes |
|---|---|---|
| `/` | `index.html` | Landing page |
| `/compiler` | `compiler.html` | Main compiler workspace (passes `compiler_assets` + `docs_categories`) |
| `/about` | `about.html` | About page |
| `/contact` | `contact.html` | Contact form |
| `/docs` | `docs.html` | Documentation hub |
| `/docs/<slug>` | `docs/<slug>.html` | Individual function docs |
| `/embed` | `embed.html` | Embeddable compiler |
| `/embed-docs` | `embed-docs.html` | Embeddable docs |
| `/privacy-policy` | `privacy-policy.html` | Privacy policy |
| `/terms` | `terms.html` | Terms of service |
| `/maintenance.html` | `maintenance.html` | Maintenance page |

**Redirects:**
- `/compiler.html` → `/compiler` (301 permanent)
- `/index.html` → `/` (served directly)

---

## Build Pipeline (build.py)

File: `build.py`

The build script does four things:

### CSS Bundle

Source files from `static/css/compiler/` are concatenated in priority order and minified with `rcssmin`:

```
base.css → panels.css → sidebar.css → preferences.css → responsive.css → toasts.css → (any extras)
```

Output: `static/build/compiler.[hash].css`

### JS Bundle

Source files from `static/js/compiler/` are concatenated in priority order and minified with `rjsmin`:

```
asset-sources.js → app.js → files-ui.js → files.js → autocomplete.js → editor.js → shell.js → execution.js → preferences.js → (any extras)
```

**Excluded from bundle** (loaded separately):
- `codemirror.bundle.v1.js` — lazy-loaded ESM module
- `dosbox.js` / `dosbox.wasm` — loaded on demand
- `analytics.js` — loaded with `defer`

Output: `static/build/compiler.[hash].js`

### Asset Manifest

Output: `static/build/asset-manifest.json`

```json
{
  "compiler": {
    "css": "/static/build/compiler.a1b2c3d4e5f6.css",
    "js": "/static/build/compiler.f6e5d4c3b2a1.js"
  },
  "separate": {
    "codemirror_bundle": "/static/js/compiler/codemirror.bundle.v1.js",
    "lazy_loaded": [
      "/static/js/compiler/codemirror.bundle.v1.js",
      "/libs/js-dos.js",
      "/libs/wdosbox.js",
      "/libs/wdosbox.wasm",
      "/static/analytics.js"
    ]
  }
}
```

The Flask app reads this manifest to inject the correct `<link>` and `<script>` tags into `compiler.html` via Jinja2 template variables.

### Hashed Filenames

Filenames use a 12-character SHA-256 prefix for cache busting:

```
compiler.[sha256_first_12_chars].css
compiler.[sha256_first_12_chars].js
```

When any source file changes, the hash changes, and the old cached version is automatically invalidated.

---

## Vercel Deployment

### vercel.json Configuration

```json
{
  "buildCommand": "python build.py",
  "builds": [
    { "src": "static/**/*", "use": "@vercel/static" },
    { "src": "compiler-assets/libs/**/*", "use": "@vercel/static" },
    { "src": "compiler-assets/fonts/**/*", "use": "@vercel/static" },
    { "src": "app.py", "use": "@vercel/python" }
  ]
}
```

- `python build.py` runs on every deployment to generate hashed bundles.
- Static files are served directly by Vercel's CDN.
- `app.py` runs as a serverless Python function.

### Build Command

On deploy, Vercel runs:
1. `npm install` (installs CodeMirror packages + esbuild)
2. `pip install -r requirements.txt` (installs Flask, rcssmin, rjsmin)
3. `python build.py` (builds the bundles)

### Route Rules

| Pattern | Destination | Cache |
|---|---|---|
| `/static/build/compiler.[hash].(css\|js)` | Hashed bundles | 1 year, immutable |
| `/static/fonts/*` | Self-hosted fonts | 1 year, immutable |
| `/static/js/compiler/codemirror.bundle.v1.js` | CM bundle | 1 year, immutable |
| `/static/analytics.js` | Analytics loader | 1 year |
| `/libs/js-dos.js` | `compiler-assets/libs/js-dos.js` | 1 year |
| `/libs/wdosbox.wasm` | `compiler-assets/libs/wdosbox.wasm.js` | 1 year |
| `/libs/*` | `compiler-assets/libs/*` | Default |
| `/compiler-assets/fonts/*` | Font files | 1 year, immutable |
| `/static/*` | Static files | 1 week |
| `/*` | `app.py` (Flask) | No cache |

---

## Caching Strategy

### Immutable Assets (1 year)

These assets use `Cache-Control: public, max-age=31536000, immutable`:

- **Hashed bundles** (`/static/build/compiler.[hash].css` and `.js`) — filename changes when content changes.
- **CodeMirror bundle** (`codemirror.bundle.v1.js`) — versioned filename.
- **Fonts** (`/static/fonts/*`, `/compiler-assets/fonts/*`) — content never changes.
- **JS-DOS runtime** (`/libs/js-dos.js`) — version-locked.
- **WDOSBOX** (`/libs/wdosbox.wasm`) — version-locked.

### Standard Assets (1 week)

`Cache-Control: public, max-age=604800`:
- All other files under `/static/*` (images, icons, etc.)

### Client-Side Cache API

The compiler uses the browser **Cache API** (`caches.open('graphics-h-compiler-runtime-v1')`) to pre-cache critical runtime files:

```
Cached assets:
  /libs/js-dos.js
  /libs/wdosbox.js
  /libs/wdosbox.wasm
  tc-v1.zip (from resolved asset URL)
```

This enables **offline-capable compilation** — once the user has compiled once, the runtime is cached and subsequent runs load from the cache.

### Demo File Cache

Demo source files are cached in `localStorage` with a 7-day TTL:

```js
localStorage.setItem('demo_cache_graphics-demo', JSON.stringify({
    code: '// source...',
    timestamp: Date.now()
}));
```

---

## SEO & Structured Data

### Meta Tags

The `compiler.html` template includes comprehensive SEO meta tags:

```html
<title>Graphics.h Online Compiler | Turbo C++ DOS Emulation</title>
<meta name="description" content="Free graphics.h online compiler for Turbo C++ with DOS emulation..." />
<link rel="canonical" href="https://graphics-h-compiler.vercel.app/compiler" />
<link rel="alternate" hreflang="en" href="..." />
<link rel="alternate" hreflang="x-default" href="..." />

<!-- Open Graph -->
<meta property="og:title" content="Graphics.h Online Compiler | Turbo C++ DOS Emulation" />
<meta property="og:type" content="website" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
```

### Structured Data (JSON-LD)

The compiler page includes a `SoftwareApplication` schema:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Graphics.h Online Compiler",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Web",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "author": { "@type": "Person", "name": "AlbatrossC" }
}
```

### SSR Documentation Reference

Below the compiler workspace, `compiler.html` renders a **server-side generated documentation reference** section. This is SEO-critical — search engines can crawl all 99 function definitions without executing JavaScript.

The data is loaded at Flask startup from `static/assets/docs.1.json` and rendered via Jinja2:

```html
{% for category in docs_categories %}
  {% for fn in category.functions %}
    <article class="docs-fn-card" id="fn-{{ fn.slug }}">
      <h3>{{ fn.name }}()</h3>
      <p>{{ fn.description }}</p>
      <code>{{ fn.syntax }}</code>
      <!-- parameters, examples, notes, related functions -->
    </article>
  {% endfor %}
{% endfor %}
```

Only **one card is visible at a time** (controlled via CSS/JS) for performance, but all cards exist in the DOM for crawlers.

A lightweight inline C syntax highlighter (< 2KB) provides syntax colouring for example code blocks without loading CodeMirror.

### Sitemap & Robots

- `static/sitemap.xml` — lists all pages for search engines.
- `static/robots.txt` — allows all crawlers.
- `ads.txt` — Google AdSense verification file.

---

## Analytics & Trackers

File: `static/analytics.js`

All trackers are loaded **asynchronously/deferred** and are **disabled on localhost**.

### Google Analytics (GA4)

```
Tracking ID: G-7WDYZ2W2R0
```

Loaded via `gtag.js` from `googletagmanager.com`.

### Microsoft Clarity

```
Project ID: up3p2m5ovd
```

Provides heatmaps, session recordings, and user behavior analytics. The compiler page uses `data-clarity-unmask="true"` on the editor and output content elements to allow Clarity to capture text content.

### Vercel Web Analytics

Loaded from `/_vercel/insights/script.js`. Provides page view and performance metrics.

### Google AdSense

```html
<meta name="google-adsense-account" content="ca-pub-3909487557887107">
```

AdSense publisher ID is declared in the `<head>`.

---

## Security Headers

Applied to every response via `hooks.py`:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-XSS-Protection` | `1; mode=block` |

---

## Maintenance Mode

When the `MAINTENANCE_MODE` env variable is set to `true`, all non-static, non-API requests are intercepted and the `maintenance.html` template is rendered instead. The `MAINTENANCE_DATE` env variable sets the displayed return date.

---

## Asset Sources & CDN Fallbacks

File: `static/js/compiler/asset-sources.js`

All critical assets (tc.zip, demo files, JS-DOS) have multiple source URLs with automatic fallover:

| Asset | Primary CDN | Secondary CDN | Local Fallback |
|---|---|---|---|
| `tc-v1.zip` | R2 (`r2-public-assets.albatrossc.workers.dev`) | Vercel Blob Storage | `/compiler-assets/zip-files/tc-v1.zip` |
| Demo files | R2 | Vercel Blob Storage | `/compiler-assets/Demo_files/*.cpp` |
| JS-DOS | js-dos.com | — | `/libs/js-dos.js` |
| WDOSBOX | js-dos.com | — | `/libs/wdosbox.js` |

Health checks use `HEAD` requests with 3-second timeout and 5-minute cache.

---

## Static Assets

| Directory | Contents |
|---|---|
| `static/css/compiler/` | 7 CSS files (base, panels, sidebar, preferences, responsive, toasts, docs-reference) |
| `static/js/compiler/` | 10 JS files (app, editor, autocomplete, files, files-ui, shell, execution, preferences, asset-sources, CM bundle) |
| `static/build/` | Hashed production bundles + asset manifest |
| `static/assets/` | JSON data files (`functions.1.json`, `docs.1.json`) |
| `static/fonts/` | Font files |
| `static/videos/` | Background videos |
| `compiler-assets/libs/` | JS-DOS, WDOSBOX, Ace (legacy), Lucide icons |
| `compiler-assets/fonts/` | JetBrains Mono woff2 |
| `compiler-assets/zip-files/` | `tc-v1.zip` (3.1 MB) |
| `compiler-assets/Demo_files/` | Demo `.cpp` files + bundled JSON |

---

## Templates

All templates use **Jinja2** templating with Flask:

| Template | Purpose |
|---|---|
| `compiler.html` | Standalone page — does NOT extend `base.html`. Contains its own `<head>`, SEO meta, structured data, inline footer styles, and the full compiler workspace + docs reference section. |
| `base.html` | Shared layout for non-compiler pages (landing, about, contact, docs, etc.) |
| `index.html` | Landing page with feature showcase |
| `about.html` | Project information |
| `docs.html` | Documentation hub with category navigation |
| `embed.html` | Lightweight embeddable compiler for third-party sites |

The compiler page injects assets dynamically:

```html
{% for css_url in compiler_assets.css_urls %}
<link rel="stylesheet" href="{{ css_url }}" />
{% endfor %}

{% for js_url in compiler_assets.js_urls %}
<script src="{{ js_url }}" defer></script>
{% endfor %}
```

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `USER_FILES_WORKERS` | URL of the Cloudflare Worker for file storage | For auth/storage |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID | For Google sign-in |
| `MAINTENANCE_MODE` | Set to `true` to enable maintenance mode | No |
| `MAINTENANCE_DATE` | Display date for maintenance page | No |
| `DISCORD_WEBHOOK_URL` | Discord webhook for contact form notifications | For contact form |

---

## Local Development

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm

### Setup

```bash
# Install npm dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt

# Create .env file with required variables
cp .env.local .env

# Build production bundles (optional — Flask falls back to source files)
python build.py

# Start the Flask dev server
python app.py
```

The app will be available at `http://localhost:5000`.

**Without building:** If you skip `python build.py`, the Flask app uses the individual source CSS/JS files (listed in `compiler_assets.py` fallback) instead of the hashed bundles. This is useful for development since changes are reflected immediately.

---

*Last updated: May 2026*
