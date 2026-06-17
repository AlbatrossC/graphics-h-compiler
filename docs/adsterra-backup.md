# Adsterra Ads Backup

All Adsterra ad placements were removed from `site/templates/compiler.html` on **2026-06-17**.
This document preserves every snippet exactly so they can be re-added at any time.

---

## 1 — Sidebar Native Banner

**Location in file:** Inside `#cloud-promo-view`, after the `<ul class="cloud-promo-features">` closing tag,
before `<p id="auth-status-text" ...>`.

**Container class:** `.sidebar-ad-slot`

**Network:** Adsterra / effectivecpmnetwork.com

**Snippet to restore:**

```html
<!-- Adsterra Native Banner: sidebar ad (auto-hidden when user signs in) -->
<div class="sidebar-ad-slot">
  <script async="async" data-cfasync="false" src="https://pl29745906.effectivecpmnetwork.com/7d7960bca9a1b2b3ff13440a251034c6/invoke.js"></script>
  <div id="container-7d7960bca9a1b2b3ff13440a251034c6"></div>
</div>
```

---

## 2 — Error Panel Banner (300×250)

**Location in file:** Inside `#output-panel`, after `<div id="output-content" class="output-content"></div>`,
before the closing `</div>` of `#output-panel`.

**Container id:** `#error-ad-slot` / class `.error-ad-slot`

**Network:** Adsterra / highperformanceformat.com

**Key:** `544236366cfcb02019990cf9b6049ecc`

**Snippet to restore:**

```html
<!-- Adsterra Banner 300x250: shown only on compilation errors -->
<div id="error-ad-slot" class="error-ad-slot">
  <script>
    atOptions = {
      'key' : '544236366cfcb02019990cf9b6049ecc',
      'format' : 'iframe',
      'height' : 250,
      'width' : 300,
      'params' : {}
    };
  </script>
  <script src="https://www.highperformanceformat.com/544236366cfcb02019990cf9b6049ecc/invoke.js"></script>
</div>
```

---

## 3 — Docs Section Banner (728×90 desktop + 320×50 mobile)

**Location in file:** Inside `<section class="docs-reference">` → `.docs-reference-inner`,
after the `.docs-ref-header` div, before `<div class="docs-ref-layout">`.

**Container class:** `.docs-banner-ad` (wraps two inner divs: `.docs-banner-desktop` and `.docs-banner-mobile`)

**Network:** Adsterra / highperformanceformat.com

**Keys:**
- Desktop (728×90): `d20d41443f2de8c00a7579af1f2bc74d`
- Mobile (320×50): `402e4de1f3a9fc348f89f20ec7797d9b`

**Snippet to restore:**

```html
<!-- Adsterra Docs Banner: 728x90 on desktop, 320x50 on mobile -->
<div class="docs-banner-ad">
  <div class="docs-banner-desktop">
    <script>
      atOptions = {
        'key' : 'd20d41443f2de8c00a7579af1f2bc74d',
        'format' : 'iframe',
        'height' : 90,
        'width' : 728,
        'params' : {}
      };
    </script>
    <script src="https://www.highperformanceformat.com/d20d41443f2de8c00a7579af1f2bc74d/invoke.js"></script>
  </div>
  <div class="docs-banner-mobile">
    <script>
      atOptions = {
        'key' : '402e4de1f3a9fc348f89f20ec7797d9b',
        'format' : 'iframe',
        'height' : 50,
        'width' : 320,
        'params' : {}
      };
    </script>
    <script src="https://www.highperformanceformat.com/402e4de1f3a9fc348f89f20ec7797d9b/invoke.js"></script>
  </div>
</div>
```

---

## 4 — Adsterra Social Bar (Floating Widget)

**Location in file:** Near the bottom of `<body>`, after the wdosbox-wasm-url patch `<script>` block,
before the `{% for js_url in compiler_assets.js_urls %}` loop.

**Network:** Adsterra / effectivecpmnetwork.com

**Script URL:** `https://pl29745905.effectivecpmnetwork.com/6d/70/86/6d70864c8b1bb94fc1a594779fd8e70d.js`

**Snippet to restore:**

```html
<!-- Adsterra Social Bar (floating widget) -->
<script src="https://pl29745905.effectivecpmnetwork.com/6d/70/86/6d70864c8b1bb94fc1a594779fd8e70d.js"></script>
```

---

## Summary Table

| # | Ad Type | Size | Container | Network | Key / URL path |
|---|---------|------|-----------|---------|----------------|
| 1 | Native Banner (sidebar) | auto | `.sidebar-ad-slot` | effectivecpmnetwork.com | `7d7960bca9a1b2b3ff13440a251034c6` |
| 2 | Banner (error panel) | 300×250 | `#error-ad-slot` | highperformanceformat.com | `544236366cfcb02019990cf9b6049ecc` |
| 3a | Banner (docs, desktop) | 728×90 | `.docs-banner-desktop` | highperformanceformat.com | `d20d41443f2de8c00a7579af1f2bc74d` |
| 3b | Banner (docs, mobile) | 320×50 | `.docs-banner-mobile` | highperformanceformat.com | `402e4de1f3a9fc348f89f20ec7797d9b` |
| 4 | Social Bar (floating) | N/A | `<body>` bottom | effectivecpmnetwork.com | `6d70864c8b1bb94fc1a594779fd8e70d` |
