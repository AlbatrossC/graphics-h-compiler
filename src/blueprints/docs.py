from flask import Blueprint, jsonify, make_response, redirect, render_template

from ..compiler_assets import resolve_doc_canonical_slug, resolve_doc_description, resolve_doc_template, resolve_doc_title
from ..docs_data import DOCS_SITE_TITLE


docs_bp = Blueprint('docs', __name__)


@docs_bp.route('/docs.html')
def docs_landing_html():
    return redirect('/docs', code=301)


@docs_bp.route('/docs')
def docs_landing():
    return render_template('docs.html')


@docs_bp.route('/docs/<slug>.html')
def docs_html_slug(slug):
    if slug == 'line':
        return redirect('/docs/line-and-movement#line', code=301)
    canonical_slug = resolve_doc_canonical_slug(slug)
    if not resolve_doc_template(slug):
        return jsonify({'error': 'Doc not found'}), 404
    return redirect(f'/docs/{canonical_slug}', code=301)


@docs_bp.route('/docs/<slug>')
def docs(slug):
    if slug == 'line':
        return redirect('/docs/line-and-movement#line', code=301)
    template_name = resolve_doc_template(slug)
    if not template_name:
        return jsonify({'error': 'Doc not found'}), 404

    canonical_slug = resolve_doc_canonical_slug(slug)
    if canonical_slug != slug:
        return redirect(f'/docs/{canonical_slug}', code=301)

    content_html = render_template(template_name)
    page_title = resolve_doc_title(canonical_slug)
    meta_description = resolve_doc_description(canonical_slug)
    return render_template(
        'base.html',
        content_html=content_html,
        current_slug=canonical_slug,
        page_title=page_title,
        site_title=DOCS_SITE_TITLE,
        meta_description=meta_description,
    )


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
