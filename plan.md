# graphicsh.online — URL Restructuring & AdSense Approval Plan

> **Goal**: Get Google AdSense approval by properly structuring URLs for indexing, creating substantial original content across blogs and documentation pages, and eliminating thin/duplicate content.

---

## The Problem

1. **3rd-level URLs don't get indexed.** Current blog URLs like `/blog/midpoint-circle-algorithm` (3 levels deep) are not being indexed by Google. Only 2nd-level URLs like `/about`, `/contact`, `/compiler` get indexed.
2. **No documentation pages exist.** The graphics.h function reference lives inside `docs.1.json` and is rendered client-side on the compiler page. Google can't index this content separately.
3. **Not enough indexable pages for AdSense.** AdSense requires substantial, original, well-structured content across multiple pages.

---

## Decisions Made

### URL Convention
- **Blogs**: `/<slug>-blog` (e.g., `/midpoint-circle-algorithm-blog`)
- **Docs**: `/<function>-docs` (e.g., `/circle-docs`)
- **Blog listing**: `/blog` (unchanged)
- **Docs listing**: `/docs` (new)
- The `-blog` and `-docs` suffixes make it easy to identify content type at a glance.

### Domain
- **Everything stays on `graphicsh.online`** — no subdomains.
- `docs.graphicsh.online` was considered and rejected because Google/AdSense treat subdomains as separate websites. SEO authority doesn't transfer, and AdSense would require separate approval.
- **Hardcode the domain** `https://graphicsh.online` everywhere. Remove the `{{ SITE_DOMAIN }}` Jinja template variable and the `SITE_DOMAIN` env var from the build system. It's unnecessary indirection since the domain never changes.

### Redirects
- **No redirects for old `/blog/<slug>` URLs** — they were never indexed by Google, so 301 redirects would be unnecessary overhead. SEO penalizes redirect chains and unnecessary redirects.
- Keep only the existing necessary redirects (`/contact-us` → `/contact`, `/privacy` → `/privacy-policy`, etc.).

### Content Quality
- **Each docs page must be a separate `.html` file** — hand-crafted, not pre-generated from JSON. This avoids duplication and thin content.
- **Each docs page must have 800+ words** of unique, substantial content.
- **Generate only 5 docs pages per prompt** to maintain content quality. More pages per batch = degraded quality.

---

## Current Site Structure

```
graphicsh.online/                    ← Home (landing page)
graphicsh.online/compiler            ← Online compiler
graphicsh.online/blog                ← Blog listing page
graphicsh.online/blog/<slug>         ← Blog posts (NOT INDEXED — 3rd level)
graphicsh.online/about               ← About page
graphicsh.online/contact             ← Contact page
graphicsh.online/privacy-policy      ← Privacy policy
graphicsh.online/terms               ← Terms of service
graphicsh.online/embed               ← Embed page
graphicsh.online/embed-docs          ← Embed docs
```

## New Site Structure

```
graphicsh.online/                                            ← Home
graphicsh.online/compiler                                    ← Compiler
graphicsh.online/blog                                        ← Blog listing (links to all -blog pages)
graphicsh.online/docs                                        ← Docs listing (links to all -docs pages)
graphicsh.online/about                                       ← About
graphicsh.online/contact                                     ← Contact
graphicsh.online/privacy-policy                              ← Privacy policy
graphicsh.online/terms                                       ← Terms

# Blog posts (flat 2nd-level URLs with -blog suffix)
graphicsh.online/midpoint-circle-algorithm-blog
graphicsh.online/dda-line-drawing-algorithm-blog
graphicsh.online/bresenham-line-drawing-algorithm-blog
graphicsh.online/clipping-algorithm-in-computer-graphics-blog
graphicsh.online/cohen-sutherland-line-clipping-blog
graphicsh.online/transformations-in-computer-graphics-blog

# Documentation pages (flat 2nd-level URLs with -docs suffix)
graphicsh.online/circle-docs
graphicsh.online/rectangle-docs
graphicsh.online/line-docs
graphicsh.online/arc-docs
graphicsh.online/ellipse-docs
graphicsh.online/bar-docs
graphicsh.online/setcolor-docs
graphicsh.online/setbkcolor-docs
graphicsh.online/setfillstyle-docs
graphicsh.online/floodfill-docs
graphicsh.online/outtextxy-docs
graphicsh.online/putpixel-docs
graphicsh.online/initgraph-docs
graphicsh.online/closegraph-docs
graphicsh.online/delay-docs
```

---

## Files to Modify

### Build System

**`build-tools/render.py`**:
- Remove `get_site_domain()` function
- Hardcode `SITE_DOMAIN = 'https://graphicsh.online'` as a module constant
- Remove `'SITE_DOMAIN': site_domain` from the Jinja template context (`global_ctx`)
- Replace `BLOG_PAGES` dict — change output paths from `blog/<slug>` to `<slug>-blog`
- Add `DOCS_PAGES` dict for documentation pages
- Add `docs.html` to `SIMPLE_PAGES`
- Add rendering loop for `DOCS_PAGES` in `render_site()`
- Update `generate_sitemap()` — use hardcoded domain, flat blog URLs, add docs URLs

### Templates to Rename (blog posts)

| Old Location | New Location |
|---|---|
| `templates/blog/midpoint-circle-algorithm.html` | `templates/midpoint-circle-algorithm-blog.html` |
| `templates/blog/dda-line-drawing-algorithm.html` | `templates/dda-line-drawing-algorithm-blog.html` |
| `templates/blog/bresenham-line-drawing-algorithm.html` | `templates/bresenham-line-drawing-algorithm-blog.html` |
| `templates/blog/clipping-algorithm-in-computer-graphics.html` | `templates/clipping-algorithm-in-computer-graphics-blog.html` |
| `templates/blog/cohen-sutherland-line-clipping.html` | `templates/cohen-sutherland-line-clipping-blog.html` |
| `templates/blog/transformations-in-computer-graphics.html` | `templates/transformations-in-computer-graphics-blog.html` |

Inside each renamed blog file:
- Replace all `{{ SITE_DOMAIN }}` with `https://graphicsh.online`
- Update canonical URL to new flat path (e.g., `https://graphicsh.online/midpoint-circle-algorithm-blog`)
- Update OG/Twitter URLs
- Update BreadcrumbList and Article structured data URLs
- Update internal links: `/blog/<slug>` → `/<slug>-blog`
- Add "Docs" link to navigation

### Templates to Edit (existing pages)

**All 13 templates using `{{ SITE_DOMAIN }}`** — replace with `https://graphicsh.online`:
- `index.html`, `compiler.html`, `blog.html`, `about.html`, `contact.html`, `privacy-policy.html`, `terms.html`, + 6 blog post templates

**`templates/blog.html`** (blog listing):
- Update all `href="/blog/<slug>"` → `href="/<slug>-blog"`
- Update BlogPosting URLs in structured data
- Add "Docs" link to navigation

**`templates/index.html`** (homepage):
- Add "Docs" link to desktop nav, mobile menu, and footer Resources section

### New Templates to Create

**`templates/docs.html`** — Documentation listing page at `/docs`:
- Lists all function docs grouped by category (Shapes, Drawing, Colors, Fill, Text, etc.)
- Card layout matching blog.html visual style
- SEO meta tags, canonical URL, OG tags
- CollectionPage structured data
- Navigation: Compiler | Blog | Docs | About | Contact

**15 individual docs pages** (created in 3 phases of 5):
- `templates/circle-docs.html`
- `templates/rectangle-docs.html`
- `templates/line-docs.html`
- `templates/arc-docs.html`
- `templates/ellipse-docs.html`
- `templates/bar-docs.html`
- `templates/setcolor-docs.html`
- `templates/setbkcolor-docs.html`
- `templates/setfillstyle-docs.html`
- `templates/floodfill-docs.html`
- `templates/outtextxy-docs.html`
- `templates/putpixel-docs.html`
- `templates/initgraph-docs.html`
- `templates/closegraph-docs.html`
- `templates/delay-docs.html`

### Hosting Config

**`site/_headers`**:
- Remove old `/blog/<slug>` cache-control entries
- Add new `/<slug>-blog` and `/<fn>-docs` entries
- Add `/docs` listing page entry

**`site/serve.json`**:
- Update HTML page cache-control source pattern to include new page names

**`site/_redirects`**:
- No changes needed (no new redirects)

---

## Docs Page Content Structure

Each docs page must be a standalone, substantial HTML file with this structure:

1. **Header** — Brand logo + nav (Compiler | Blog | Docs | About | Contact)
2. **Hero** — Function name, category eyebrow, syntax highlight box
3. **Description** — Detailed explanation (not just the 1-liner from docs.json)
4. **Parameters table** — Each parameter with type, description, edge cases
5. **Return value** — What the function returns and when
6. **Code examples** — 2-3 complete, runnable graphics.h programs
7. **Output description** — What the code visually produces
8. **Common mistakes** — Gotchas and pitfalls
9. **Related functions** — Links to other docs pages
10. **"Try it online" CTA** — Link to the compiler
11. **Footer** — Same as blog posts
12. **Structured data** — `TechArticle` + `BreadcrumbList` schema

---

## Docs Creation Phases

| Phase | Functions | Prompt |
|---|---|---|
| **Phase 1** | `circle`, `rectangle`, `line`, `arc`, `ellipse` | "Create docs Phase 1" |
| **Phase 2** | `bar`, `setcolor`, `setbkcolor`, `setfillstyle`, `floodfill` | "Create docs Phase 2" |
| **Phase 3** | `outtextxy`, `putpixel`, `initgraph`, `closegraph`, `delay` | "Create docs Phase 3" |
| **Phase 4+** | More functions as needed | expandable |

---

## Execution Order

| Step | Task |
|---|---|
| 1 | Hardcode domain: replace `{{ SITE_DOMAIN }}` in all 13 templates + update `render.py` |
| 2 | Rename 6 blog template files from `blog/` to root with `-blog` suffix |
| 3 | Update internal content in renamed blog files (canonical, OG, links, structured data) |
| 4 | Update `render.py` — `BLOG_PAGES`, `DOCS_PAGES`, `SIMPLE_PAGES`, sitemap, rendering |
| 5 | Update `blog.html` — internal links, nav, structured data |
| 6 | Update `_headers` — remove old entries, add new |
| 7 | Update `serve.json` |
| 8 | Update `index.html` — add Docs to navigation |
| 9 | Create `docs.html` listing page |
| 10 | Create docs Phase 1 (5 pages) |
| 11 | Build & verify (`python build-tools/build.py`) |
| 12 | Create docs Phase 2 (5 pages) |
| 13 | Create docs Phase 3 (5 pages) |
| 14 | Final build & verification |

---

## Final Page Count

| Category | Count |
|---|---|
| Core pages (home, compiler, about, contact, privacy, terms, 404) | 7 |
| Blog listing (`/blog`) | 1 |
| Blog posts (`/<slug>-blog`) | 6 |
| Docs listing (`/docs`) | 1 |
| Docs pages (`/<fn>-docs`) — Phase 1-3 | 15 |
| **Total indexable pages** | **30** |

---

## Verification Checklist

- [ ] `python build-tools/build.py` runs without errors
- [ ] No `{{ SITE_DOMAIN }}` remains in any rendered HTML in `dist/`
- [ ] All HTML files exist at correct flat paths in `dist/`
- [ ] `sitemap.xml` contains all new URLs, no old `/blog/<slug>` URLs
- [ ] `_redirects` has no unnecessary entries
- [ ] All internal links across pages work correctly
- [ ] Canonical URLs are correct in every page's `<head>`
- [ ] After deploy: submit new sitemap to Google Search Console
- [ ] Request indexing for all new flat URLs
