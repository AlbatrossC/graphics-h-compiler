from flask import Blueprint, jsonify, make_response, redirect, render_template

from ..compiler_assets import resolve_doc_canonical_slug, resolve_doc_description, resolve_doc_template, resolve_doc_title
from ..docs_data import (
    DOCS_ORDERED_SLUGS,
    DOCS_SITE_TITLE,
    TUTORIALS_DATA,
    TUTORIALS_ORDERED,
)


docs_bp = Blueprint('docs', __name__)

# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_adjacent_slugs(canonical_slug):
    """Return (prev_slug, prev_title, next_slug, next_title) for pagination."""
    try:
        idx = DOCS_ORDERED_SLUGS.index(canonical_slug)
    except ValueError:
        return None, None, None, None

    prev_slug = DOCS_ORDERED_SLUGS[idx - 1] if idx > 0 else None
    next_slug = DOCS_ORDERED_SLUGS[idx + 1] if idx < len(DOCS_ORDERED_SLUGS) - 1 else None
    prev_title = resolve_doc_title(prev_slug) if prev_slug else None
    next_title = resolve_doc_title(next_slug) if next_slug else None
    return prev_slug, prev_title, next_slug, next_title


def _render_doc_page(canonical_slug):
    """Return a fully-rendered standalone SSR doc page, or None if not found."""
    template_name = resolve_doc_template(canonical_slug)
    if not template_name:
        return None

    content_html = render_template(template_name)
    page_title = resolve_doc_title(canonical_slug)
    meta_description = resolve_doc_description(canonical_slug)
    prev_slug, prev_title, next_slug, next_title = _get_adjacent_slugs(canonical_slug)

    return render_template(
        'doc_page.html',
        content_html=content_html,
        current_slug=canonical_slug,
        page_title=page_title,
        site_title=DOCS_SITE_TITLE,
        meta_description=meta_description,
        prev_slug=prev_slug,
        prev_title=prev_title,
        next_slug=next_slug,
        next_title=next_title,
    )


# ── /docs/* → 301 redirect to /<slug> ───────────────────────────────────────

@docs_bp.route('/docs.html')
def docs_landing_html():
    return redirect('/docs', code=301)


@docs_bp.route('/docs')
def docs_landing():
    return render_template('docs.html')


@docs_bp.route('/docs/<slug>.html')
def docs_html_slug(slug):
    if slug == 'line':
        return redirect('/line-and-movement#line', code=301)
    canonical_slug = resolve_doc_canonical_slug(slug)
    if not resolve_doc_template(slug):
        return jsonify({'error': 'Doc not found'}), 404
    return redirect(f'/{canonical_slug}', code=301)


@docs_bp.route('/docs/<slug>')
def docs_legacy_redirect(slug):
    """301 redirect every old /docs/<slug> to the new /<slug> URL."""
    if slug == 'line':
        return redirect('/line-and-movement#line', code=301)
    canonical_slug = resolve_doc_canonical_slug(slug)
    if not resolve_doc_template(slug):
        return jsonify({'error': 'Doc not found'}), 404
    return redirect(f'/{canonical_slug}', code=301)


# ── /docs-content/<slug>  (kept for any existing fetches) ───────────────────

@docs_bp.route('/docs-content/<slug>')
def docs_content(slug):
    template_name = resolve_doc_template(slug)
    if not template_name:
        return jsonify({'error': 'Doc not found'}), 404
    canonical_slug = resolve_doc_canonical_slug(slug)
    response = make_response(render_template(template_name))
    response.headers['X-Doc-Title'] = resolve_doc_title(canonical_slug)
    response.headers['X-Doc-Slug'] = canonical_slug
    response.headers['X-Doc-Description'] = resolve_doc_description(canonical_slug)
    return response


# ── Canonical /<slug> doc pages — built dynamically from DOCS_ORDERED_SLUGS ──

def _make_doc_view(slug):
    """Factory: returns a view function for the given slug."""
    def _view():
        canonical = resolve_doc_canonical_slug(slug)
        if canonical != slug:
            return redirect(f'/{canonical}', code=301)
        page = _render_doc_page(canonical)
        if page is None:
            return jsonify({'error': 'Doc not found'}), 404
        return page
    _view.__name__ = f'doc_{slug.replace("-", "_")}'
    return _view


# Register a Flask route for every slug (canonical + aliases)
_ALL_SLUGS = list(DOCS_ORDERED_SLUGS) + [s for s in ['what-is-graphics'] if s not in DOCS_ORDERED_SLUGS]
for _slug in _ALL_SLUGS:
    docs_bp.add_url_rule(
        f'/{_slug}',
        endpoint=f'doc_{_slug.replace("-", "_")}',
        view_func=_make_doc_view(_slug),
    )


# ── Tutorials ────────────────────────────────────────────────────────────────

@docs_bp.route('/tutorials')
def tutorials_landing():
    tutorials = [
        {'slug': slug, **TUTORIALS_DATA[slug]}
        for slug in TUTORIALS_ORDERED
        if slug in TUTORIALS_DATA
    ]
    return render_template('tutorials.html', tutorials=tutorials)


@docs_bp.route('/tutorials/<slug>')
def tutorial_detail(slug):
    data = TUTORIALS_DATA.get(slug)
    if not data:
        return jsonify({'error': 'Tutorial not found'}), 404

    idx = TUTORIALS_ORDERED.index(slug) if slug in TUTORIALS_ORDERED else -1
    prev_slug = TUTORIALS_ORDERED[idx - 1] if idx > 0 else None
    next_slug = TUTORIALS_ORDERED[idx + 1] if idx < len(TUTORIALS_ORDERED) - 1 else None
    prev_data = TUTORIALS_DATA.get(prev_slug) if prev_slug else None
    next_data = TUTORIALS_DATA.get(next_slug) if next_slug else None

    content_html = render_template(data['template'])
    return render_template(
        'tutorial_page.html',
        content_html=content_html,
        current_slug=slug,
        page_title=data['title'],
        meta_description=data['description'],
        category=data['category'],
        read_time=data['read_time'],
        prev_slug=prev_slug,
        prev_title=prev_data['title'] if prev_data else None,
        next_slug=next_slug,
        next_title=next_data['title'] if next_data else None,
    )
