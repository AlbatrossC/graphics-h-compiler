# Monetag Ads Backup

All Monetag ad placements were removed from `site/templates/compiler.html`, `site/_redirects`,
and the associated service-worker files on **2026-06-17**.
This document preserves every snippet exactly so they can be re-added at any time.

---

## 1 — Sidebar Direct Link Banner (160×300)

**Location in file:** Inside `#cloud-promo-view`, after the `<ul class="cloud-promo-features">` closing tag,
before `<p id="auth-status-text" ...>`.

**Container class:** `.sidebar-ad-slot`

**Network:** Monetag / omg10.com

**Zone ID:** `11161542`

**Snippet to restore:**

```html
<!-- Monetag Direct Link Banner — sidebar ad slot -->
<div class="sidebar-ad-slot" style="display:flex;justify-content:center;margin:10px 0;">
  <iframe src="https://omg10.com/4/11161542"
    width="160" height="300"
    style="border:0;overflow:hidden;display:block;"
    scrolling="no"
    frameborder="0"
    allowtransparency="true"
    loading="lazy"
    title="Advertisement">
  </iframe>
</div>
```

---

## 2 — Error Panel Direct Link Banner (300×250)

**Location in file:** Inside `#output-panel`, after `<div id="output-content" class="output-content"></div>`,
before the closing `</div>` of `#output-panel`.

**Container class:** `.error-ad-slot`

**Network:** Monetag / omg10.com

**Zone ID:** `11161542`

**Snippet to restore:**

```html
<!-- Monetag Direct Link Banner — error panel ad slot -->
<div class="error-ad-slot" style="display:flex;justify-content:center;padding:12px 0;">
  <iframe src="https://omg10.com/4/11161542"
    width="300" height="250"
    style="border:0;overflow:hidden;display:block;"
    scrolling="no"
    frameborder="0"
    allowtransparency="true"
    loading="lazy"
    title="Advertisement">
  </iframe>
</div>
```

---

## 3 — Push Notifications Script

**Location in file:** Near the bottom of `<body>`, after the wdosbox-wasm-url patch `<script>` block,
before the `{% for js_url in compiler_assets.js_urls %}` loop.

**Network:** Monetag / 5gvci.com

**Zone ID:** `11158521`

**Script URL:** `https://5gvci.com/act/files/tag.min.js?z=11158521`

**Snippet to restore:**

```html
<!-- Monetag Push Notifications -->
<script src="https://5gvci.com/act/files/tag.min.js?z=11158521" data-cfasync="false" async></script>
```

---

## 4 — Service Worker Files

Three service-worker JS files were removed. They were served at `/sw.js` (root scope) via a
`_redirects` rewrite so Monetag could register a push-notification service worker.

### 4a — `site/static/sw.js` (also copied to `site/static/build/sw.0663349ee830.js`)

**Domain / Zone:** `5gvci.com` / zone `11158471`

**File contents to restore:**

```js
self.options = {
    "domain": "5gvci.com",
    "zoneId": 11158471
}
self.lary = ""
importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw')
```

### 4b — `site/static/js/sw (1).js`

**Domain / Zone:** `3nbf4.com` / zone `11153373`

**File contents to restore:**

```js
self.options = {
    "domain": "3nbf4.com",
    "zoneId": 11153373
}
self.lary = ""
importScripts('https://3nbf4.com/act/files/service-worker.min.js?r=sw')
```

### 4c — `site/static/js/sw (2).js`

**Domain / Zone:** `5gvci.com` / zone `11158471` (identical to 4a)

**File contents to restore:**

```js
self.options = {
    "domain": "5gvci.com",
    "zoneId": 11158471
}
self.lary = ""
importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw')
```

---

## 5 — `_redirects` Rule

**File:** `site/_redirects`

**Purpose:** Served `site/static/sw.js` at the root path `/sw.js` so the service worker
had the broadest possible scope and could pass Monetag's verification check.

**Rule to restore (add at bottom of file):**

```
# ── Monetag service worker (must be at root for SW scope + verification) ──────
/sw.js                                       /static/sw.js                             200
```

---

## Summary Table

| # | Ad Type | Size | Container | Network | Key / URL path |
|---|---------|------|-----------|---------|----------------|
| 1 | Direct Link Banner (sidebar) | 160×300 | `.sidebar-ad-slot` | omg10.com | zone `11161542` |
| 2 | Direct Link Banner (error panel) | 300×250 | `.error-ad-slot` | omg10.com | zone `11161542` |
| 3 | Push Notifications script | N/A | `<body>` bottom | 5gvci.com | zone `11158521` |
| 4a | Service Worker | N/A | `site/static/sw.js` | 5gvci.com | zone `11158471` |
| 4b | Service Worker (alt) | N/A | `site/static/js/sw (1).js` | 3nbf4.com | zone `11153373` |
| 4c | Service Worker (alt) | N/A | `site/static/js/sw (2).js` | 5gvci.com | zone `11158471` |
| 5 | `_redirects` rule | N/A | `/sw.js` → `/static/sw.js` | Cloudflare Pages | — |
