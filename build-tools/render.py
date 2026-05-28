"""
Static site renderer — renders all Jinja2 templates into plain HTML files.

Called by build-tools/build.py after bundling CSS/JS assets. Produces the dist/ directory
that gets deployed to Cloudflare Pages.
"""

from __future__ import annotations

import json
import os
import shutil
from copy import deepcopy
from pathlib import Path
from typing import Callable

from jinja2 import Environment, FileSystemLoader


# ── Paths ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT / 'site'
TEMPLATES_DIR = SITE_DIR / 'templates'
STATIC_DIR = SITE_DIR / 'static'
COMPILER_ASSETS_DIR = SITE_DIR / 'compiler-assets'
DIST_DIR = ROOT / 'dist'

ASSET_MANIFEST_PATH = STATIC_DIR / 'build' / 'asset-manifest.json'
DOCS_JSON_PATH = STATIC_DIR / 'assets' / 'docs.1.json'

SIMPLE_PAGES = {
    'index.html': 'index.html',
    'blog/index.html': 'blog.html',
    'blog.html': 'blog.html',
    'about.html': 'about.html',
    'privacy-policy.html': 'privacy-policy.html',
    'terms.html': 'terms.html',
    'embed.html': 'embed.html',
    'embed-docs.html': 'embed-docs.html',
    'maintenance.html': 'maintenance.html',
}

BLOG_PAGES = {
    'blog/clipping-algorithm-in-computer-graphics/index.html': 'blog/clipping-algorithm-in-computer-graphics.html',
    'blog/clipping-algorithm-in-computer-graphics.html': 'blog/clipping-algorithm-in-computer-graphics.html',
    'blog/cohen-sutherland-line-clipping/index.html': 'blog/cohen-sutherland-line-clipping.html',
    'blog/cohen-sutherland-line-clipping.html': 'blog/cohen-sutherland-line-clipping.html',
    'blog/transformations-in-computer-graphics/index.html': 'blog/transformations-in-computer-graphics.html',
    'blog/transformations-in-computer-graphics.html': 'blog/transformations-in-computer-graphics.html',
    'blog/midpoint-circle-algorithm/index.html': 'blog/midpoint-circle-algorithm.html',
    'blog/midpoint-circle-algorithm.html': 'blog/midpoint-circle-algorithm.html',
    'blog/bresenham-line-drawing-algorithm/index.html': 'blog/bresenham-line-drawing-algorithm.html',
    'blog/bresenham-line-drawing-algorithm.html': 'blog/bresenham-line-drawing-algorithm.html',
    'blog/dda-line-drawing-algorithm/index.html': 'blog/dda-line-drawing-algorithm.html',
    'blog/dda-line-drawing-algorithm.html': 'blog/dda-line-drawing-algorithm.html',
}

COMPILER_SOURCE_JS = {
    'app.js',
    'autocomplete.js',
    'editor.js',
    'execution.js',
    'files-ui.js',
    'files.js',
    'preferences.js',
    'shell.js',
}


class RenderError(RuntimeError):
    """Raised when one or more templates fail to render."""

# ── Environment config ──────────────────────────────────────────────────────

def get_env(key: str, default: str = '') -> str:
    return os.environ.get(key, default)


def get_site_domain() -> str:
    return get_env('SITE_DOMAIN', 'https://graphicsh.online').rstrip('/')


def get_public_assets_url() -> str:
    return get_env('PUBLIC_ASSETS_URL', '').rstrip('/')


def get_public_api_url() -> str:
    return get_env('PUBLIC_API_URL', 'https://graphics-oc-api.graphicshcompiler.workers.dev').rstrip('/')


# ── Compiler assets ─────────────────────────────────────────────────────────

def load_compiler_assets() -> dict:
    fallback = {
        'css_urls': ['/static/css/compiler.css'],
        'js_urls': [
            '/static/js/compiler/app.js',
            '/static/js/compiler/files-ui.js',
            '/static/js/compiler/files.js',
            '/static/js/compiler/editor.js',
            '/static/js/compiler/shell.js',
            '/static/js/compiler/execution.js',
            '/static/js/compiler/preferences.js',
        ],
    }
    try:
        with ASSET_MANIFEST_PATH.open('r', encoding='utf-8') as fh:
            manifest = json.load(fh)
        compiler = manifest.get('compiler') or {}
        css_url = compiler.get('css')
        js_url = compiler.get('js')
        if css_url and js_url:
            return {'css_urls': [css_url], 'js_urls': [js_url]}
    except Exception:
        pass
    return fallback


# ── Docs reference data (SSR cards for compiler page) ────────────────────────


def _build_detail_url(page_slug: str | None, anchor: str | None = None) -> str:
    return '/compiler#docs-reference'


def _build_docs_reference_categories(raw_categories: list) -> list:
    categories = deepcopy(raw_categories)
    for category in categories:
        for fn in category.get('functions', []):
            fn['detail_url'] = _build_detail_url(None, None)
    return categories


def load_docs_categories() -> list:
    try:
        with DOCS_JSON_PATH.open('r', encoding='utf-8') as fh:
            return _build_docs_reference_categories(json.load(fh).get('categories', []))
    except Exception:
        return []


# ── Jinja2 environment setup ────────────────────────────────────────────────

def create_jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=False,
    )


# ── Sitemap generator ───────────────────────────────────────────────────────

def generate_sitemap(base_url: str) -> str:
    def url(path, priority, changefreq='weekly'):
        return (
            f'  <url>\n'
            f'    <loc>{base_url}{path}</loc>\n'
            f'    <changefreq>{changefreq}</changefreq>\n'
            f'    <priority>{priority}</priority>\n'
            f'  </url>'
        )

    entries = [
        url('/compiler', '1.0', 'daily'),
        url('/', '0.95', 'weekly'),
        url('/blog', '0.7', 'weekly'),
        url('/blog/clipping-algorithm-in-computer-graphics', '0.65', 'monthly'),
        url('/blog/cohen-sutherland-line-clipping', '0.65', 'monthly'),
        url('/blog/transformations-in-computer-graphics', '0.65', 'monthly'),
        url('/blog/midpoint-circle-algorithm', '0.65', 'monthly'),
        url('/blog/bresenham-line-drawing-algorithm', '0.65', 'monthly'),
        url('/blog/dda-line-drawing-algorithm', '0.65', 'monthly'),
        url('/about', '0.5', 'monthly'),
        url('/contact', '0.5', 'monthly'),
        url('/privacy-policy', '0.4', 'yearly'),
        url('/terms', '0.4', 'yearly'),
    ]

    xml_body = '\n'.join(entries)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'{xml_body}\n'
        '</urlset>'
    )


# ── Main render pipeline ────────────────────────────────────────────────────

def write_page(content: str, *path_parts: str) -> None:
    out_path = DIST_DIR.joinpath(*path_parts)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content, encoding='utf-8', newline='\n')


def uses_bundled_compiler_assets(compiler_assets: dict) -> bool:
    js_urls = compiler_assets.get('js_urls') or []
    css_urls = compiler_assets.get('css_urls') or []
    return any('/static/build/compiler.' in url for url in [*js_urls, *css_urls])


def make_static_ignore(compiler_assets: dict) -> Callable[[str, list[str]], set[str]]:
    should_skip_sources = uses_bundled_compiler_assets(compiler_assets)

    def ignore(directory: str, names: list[str]) -> set[str]:
        if not should_skip_sources:
            return set()

        current = Path(directory)
        ignored: set[str] = set()

        if current == STATIC_DIR / 'css':
            ignored.add('compiler.css')
            ignored.add('compiler')
        elif current == STATIC_DIR / 'css' / 'compiler':
            ignored.update(names)
        elif current == STATIC_DIR / 'js' / 'compiler':
            ignored.update(name for name in names if name in COMPILER_SOURCE_JS)

        return ignored

    return ignore


def copy_static_assets(compiler_assets: dict) -> None:
    shutil.copytree(
        STATIC_DIR,
        DIST_DIR / 'static',
        dirs_exist_ok=True,
        ignore=make_static_ignore(compiler_assets),
    )
    print('  [ok] static/')


def render_template_page(env: Environment, output_path: str, template_name: str, context: dict) -> str | None:
    try:
        html = env.get_template(template_name).render(**context)
        write_page(html, output_path)
        print(f'  [ok] {output_path}')
        return None
    except Exception as exc:
        message = f'{output_path}: {exc}'
        print(f'  [FAIL] {message}')
        return message


def render_site(compiler_assets: dict) -> None:
    """Render all pages and copy all assets into dist/."""

    site_domain = get_site_domain()
    public_assets_url = get_public_assets_url()
    public_api_url = get_public_api_url()
    docs_categories = load_docs_categories()

    env = create_jinja_env()
    failures: list[str] = []

    # Clean dist
    if DIST_DIR.exists():
        try:
            shutil.rmtree(DIST_DIR)
            DIST_DIR.mkdir(parents=True)
        except PermissionError:
            # If dist is locked (e.g., on Windows when shell/server is open there),
            # clean as much inside it as possible rather than failing the whole build.
            for item in DIST_DIR.iterdir():
                try:
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
                except Exception:
                    pass
    else:
        DIST_DIR.mkdir(parents=True)

    print('Rendering static pages...')

    # ── Global template context ──────────────────────────────────────────
    global_ctx = {
        'SITE_DOMAIN': site_domain,
        'PUBLIC_ASSETS_URL': public_assets_url,
        'PUBLIC_API_URL': public_api_url,
    }

    # ── Simple pages (no dynamic data beyond globals) ────────────────────
    for output_path, template_name in SIMPLE_PAGES.items():
        ctx = {**global_ctx}
        if template_name == 'maintenance.html':
            ctx['maintenance_date'] = get_env('MAINTENANCE_DATE', '25 Feb 2026 - 2:00 PM IST')
        failure = render_template_page(env, output_path, template_name, ctx)
        if failure:
            failures.append(failure)

    # ── Blog/tutorial pages ─────────────────────────────────────────────
    for output_path, template_name in BLOG_PAGES.items():
        failure = render_template_page(env, output_path, template_name, global_ctx)
        if failure:
            failures.append(failure)

    # ── Contact page ─────────────────────────────────────────────────────
    failure = render_template_page(
        env,
        'contact.html',
        'contact.html',
        {**global_ctx, 'contact_enabled': True},
    )
    if failure:
        failures.append(failure)

    # ── Compiler page ────────────────────────────────────────────────────
    failure = render_template_page(
        env,
        'compiler.html',
        'compiler.html',
        {
            **global_ctx,
            'compiler_assets': compiler_assets,
            'docs_categories': docs_categories,
            'feedback_enabled': True,
        },
    )
    if failure:
        failures.append(failure)

    # ── Docs landing page (DISABLED) ────────────────────────────────────
    # Documentation and tutorials pages are not rendered.

    # ── 404 page ─────────────────────────────────────────────────────────
    failure = render_template_page(env, '404.html', '404.html', global_ctx)
    if failure:
        failures.append(failure)

    if failures:
        raise RenderError('Static render failed:\n' + '\n'.join(f'  - {failure}' for failure in failures))

    # ── Sitemap ──────────────────────────────────────────────────────────
    sitemap_xml = generate_sitemap(site_domain)
    write_page(sitemap_xml, 'sitemap.xml')
    print('  [ok] sitemap.xml')

    # ── Copy static assets ───────────────────────────────────────────────
    print('Copying static assets...')

    # static/
    copy_static_assets(compiler_assets)

    # compiler-assets/
    shutil.copytree(COMPILER_ASSETS_DIR, DIST_DIR / 'compiler-assets', dirs_exist_ok=True)
    print('  [ok] compiler-assets/')

    # /libs/ alias — copy compiler-assets/libs/ to dist/libs/ for backward compat
    libs_src = COMPILER_ASSETS_DIR / 'libs'
    if libs_src.exists():
        shutil.copytree(libs_src, DIST_DIR / 'libs', dirs_exist_ok=True)
        print('  [ok] libs/')

    # Root files (ads.txt removed)
    # for root_file in ['ads.txt']:
    #     src = ROOT / root_file
    #     if src.exists():
    #         shutil.copy2(src, DIST_DIR / root_file)
    #         print(f'  [ok] {root_file}')

    # robots.txt (copy from static to root)
    robots_src = STATIC_DIR / 'robots.txt'
    if robots_src.exists():
        shutil.copy2(robots_src, DIST_DIR / 'robots.txt')
        print('  [ok] robots.txt (root)')

    # sdk.js (served from root)
    sdk_src = STATIC_DIR / 'sdk.js'
    if sdk_src.exists():
        shutil.copy2(sdk_src, DIST_DIR / 'sdk.js')
        print('  [ok] sdk.js (root)')

    # _headers and _redirects
    for cfg_file in ['_headers', '_redirects']:
        src = SITE_DIR / cfg_file
        if src.exists():
            shutil.copy2(src, DIST_DIR / cfg_file)
            print(f'  [ok] {cfg_file}')

    page_count = sum(1 for _ in DIST_DIR.rglob('*.html'))
    print(f'\nDone! {page_count} HTML pages rendered to dist/')
