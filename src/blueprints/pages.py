import json
import re
from copy import deepcopy

from flask import Blueprint, Response, redirect, render_template, send_file

from ..compiler_assets import BASE_DIR
from ..compiler_assets import get_compiler_assets
from ..hooks import get_maintenance_date
from ..docs_data import DOCS_SLUG_TO_TEMPLATE, DOCS_ORDERED_SLUGS, TUTORIALS_ORDERED, TUTORIALS_DATA


pages_bp = Blueprint('pages', __name__)

# ── SSR docs data (loaded once at import time) ──────────────────────
_DOCS_JSON_PATH = BASE_DIR / 'static' / 'assets' / 'docs.1.json'
_DOCS_CATEGORIES = []

_DOCS_CATEGORY_PAGE_FALLBACKS = {
    'graphics-initialization': 'graphics-initialization',
    'drawing-cursor-movement': 'line-and-movement',
    'basic-shapes': 'line',
    'polygons-fill': 'polygons-and-fill',
    'colors-palette': 'colors-and-palette',
    'line-fill-styles': 'fill-and-patterns',
    'screen-viewport': 'viewport-and-screen',
    'text-fonts': 'text-and-fonts',
    'image-pixel-operations': 'image-handling',
    'arc-coordinates': 'advanced-functions',
    'drivers-registration': 'drivers-and-modes',
    'memory-management': 'advanced-functions',
    'error-handling': 'error-codes',
    'error-codes-reference': 'error-codes',
}

_DOCS_FUNCTION_PAGE_OVERRIDES = {
    'cleardevice': 'advanced-functions',
}

_DOCS_FUNCTION_ANCHOR_OVERRIDES = {
    'drawpoly': 'drawpoly-function',
    'fillpoly': 'fillpoly-function',
    'floodfill': 'floodfill-function',
    'setcolor': 'core',
    'getcolor': 'core',
    'setbkcolor': 'core',
    'getbkcolor': 'core',
    'getmaxcolor': 'core',
    'setpalette': 'palette',
    'setallpalette': 'palette',
    'getpalette': 'palette',
    'getdefaultpalette': 'palette',
    'getpalettesize': 'palette',
    'setrgbpalette': 'palette',
    'setaspectratio': 'palette',
    'getaspectratio': 'palette',
    'setfillstyle': 'setfillstyle',
    'setfillpattern': 'setfillpattern',
    'setlinestyle': 'how-fill-works',
    'getlinesettings': 'how-fill-works',
    'getfillsettings': 'how-fill-works',
    'getfillpattern': 'how-fill-works',
    'clearviewport': 'core',
    'setviewport': 'core',
    'getviewsettings': 'core',
    'setactivepage': 'core',
    'setvisualpage': 'core',
    'setwritemode': 'core',
    'outtext': 'core',
    'outtextxy': 'core',
    'settextstyle': 'font-style',
    'settextjustify': 'font-style',
    'setusercharsize': 'font-style',
    'gettextsettings': 'font-style',
    'textheight': 'core',
    'textwidth': 'core',
    'getarccoords': 'viewport',
    'graphgetmem': 'full-program',
    'graphfreemem': 'full-program',
    'setgraphbufsize': 'full-program',
    'grOk': 'common',
    'grnoinitgraph': 'common',
    'grnotdetected': 'common',
    'grfilenotfound': 'common',
    'grinvaliddriver': 'common',
    'grnoloadmem': 'common',
    'grnoscanmem': 'common',
    'grnofloadmem': 'common',
    'grfontnotfound': 'common',
    'grnofontmem': 'common',
    'grinvalidmode': 'common',
    'grerror': 'common',
    'grioerror': 'common',
    'grinvalidfont': 'common',
    'grinvalidfontnum': 'common',
    'grinvalidversion': 'common',
}


def _load_doc_section_ids():
    section_ids_by_slug = {}
    section_id_pattern = re.compile(r'<section\b[^>]*\bid="([^"]+)"', re.IGNORECASE)
    for slug, template_name in DOCS_SLUG_TO_TEMPLATE.items():
        template_path = BASE_DIR / 'templates' / template_name
        try:
            template_source = template_path.read_text(encoding='utf-8')
        except OSError:
            section_ids_by_slug[slug] = set()
            continue
        section_ids_by_slug[slug] = set(section_id_pattern.findall(template_source))
    return section_ids_by_slug


_DOC_SECTION_IDS_BY_SLUG = _load_doc_section_ids()


def _build_detail_url(page_slug, anchor=None):
    if not page_slug:
        return '/docs'
    return f'/docs/{page_slug}#{anchor}' if anchor else f'/docs/{page_slug}'


def _build_docs_reference_categories(raw_categories):
    categories = deepcopy(raw_categories)
    for category in categories:
        category_page_slug = _DOCS_CATEGORY_PAGE_FALLBACKS.get(category.get('slug'))
        for fn in category.get('functions', []):
            fn_slug = fn.get('slug')
            page_slug = _DOCS_FUNCTION_PAGE_OVERRIDES.get(fn_slug)
            if not page_slug:
                page_slug = fn_slug if fn_slug in DOCS_SLUG_TO_TEMPLATE else category_page_slug

            anchor = _DOCS_FUNCTION_ANCHOR_OVERRIDES.get(fn_slug)
            if not anchor and page_slug and fn_slug in _DOC_SECTION_IDS_BY_SLUG.get(page_slug, set()):
                anchor = fn_slug

            fn['detail_url'] = _build_detail_url(page_slug, anchor)
    return categories

try:
    with _DOCS_JSON_PATH.open('r', encoding='utf-8') as _fh:
        _DOCS_CATEGORIES = _build_docs_reference_categories(json.load(_fh).get('categories', []))
except Exception:
    _DOCS_CATEGORIES = []


@pages_bp.route('/')
@pages_bp.route('/index.html')
def index():
    return render_template('index.html')


@pages_bp.route('/compiler')
def compiler():
    import os
    feedback_enabled = bool(os.getenv('DISCORD_WEBHOOK_URL'))
    return render_template(
        'compiler.html',
        compiler_assets=get_compiler_assets(),
        docs_categories=_DOCS_CATEGORIES,
        feedback_enabled=feedback_enabled,
    )


@pages_bp.route('/compiler.html')
def compiler_html_redirect():
    return redirect('/compiler', code=301)


@pages_bp.route('/maintenance.html')
def maintenance():
    return render_template('maintenance.html', maintenance_date=get_maintenance_date())


@pages_bp.route('/embed')
@pages_bp.route('/embed.html')
def embed():
    return render_template('embed.html')


@pages_bp.route('/embed-docs')
@pages_bp.route('/embed-docs.html')
def embed_docs():
    return render_template('embed-docs.html')


@pages_bp.route('/about')
def about():
    return render_template('about.html')


@pages_bp.route('/contact')
def contact_page():
    import os
    contact_enabled = bool(os.getenv('DISCORD_WEBHOOK_URL'))
    return render_template('contact.html', contact_enabled=contact_enabled)


@pages_bp.route('/privacy-policy')
def privacy_policy():
    return render_template('privacy-policy.html')


@pages_bp.route('/terms')
def terms():
    return render_template('terms.html')


@pages_bp.route('/60fdeab2245d4db481d42962ab440eb2.txt')
def serve_txt():
    return send_file(BASE_DIR / '60fdeab2245d4db481d42962ab440eb2.txt')


@pages_bp.route('/sitemap.xml')
def sitemap():
    BASE_URL = 'https://graphics-h-compiler.vercel.app'

    # Canonical slugs only (exclude aliases like 'what-is-graphics')
    from ..docs_data import DOCS_CANONICAL_SLUGS
    canonical_doc_slugs = [s for s in DOCS_ORDERED_SLUGS if s not in DOCS_CANONICAL_SLUGS]

    tutorial_slugs = [s for s in TUTORIALS_ORDERED if s in TUTORIALS_DATA]

    def url(path, priority, changefreq='weekly'):
        return (
            f'  <url>\n'
            f'    <loc>{BASE_URL}{path}</loc>\n'
            f'    <changefreq>{changefreq}</changefreq>\n'
            f'    <priority>{priority}</priority>\n'
            f'  </url>'
        )

    entries = [
        # Compiler gets top priority — it's the main product
        url('/compiler', '1.0', 'daily'),
        url('/', '0.95', 'weekly'),
        url('/docs', '0.85', 'weekly'),
        url('/tutorials', '0.85', 'weekly'),
        url('/about', '0.5', 'monthly'),
        url('/contact', '0.5', 'monthly'),
        url('/privacy-policy', '0.4', 'yearly'),
        url('/terms', '0.4', 'yearly'),
    ]

    for slug in canonical_doc_slugs:
        entries.append(url(f'/{slug}', '0.8', 'monthly'))

    for slug in tutorial_slugs:
        entries.append(url(f'/tutorials/{slug}', '0.75', 'monthly'))

    xml_body = '\n'.join(entries)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f'{xml_body}\n'
        '</urlset>'
    )
    return Response(xml, mimetype='application/xml')
