from flask import Blueprint, jsonify, make_response, render_template

from ..compiler_assets import resolve_doc_description, resolve_doc_template, resolve_doc_title
from ..docs_data import DOCS_SITE_TITLE


docs_bp = Blueprint('docs', __name__)


@docs_bp.route('/docs')
def docs_landing():
    return render_template('docs.html')


@docs_bp.route('/docs/<slug>')
def docs(slug):
    template_name = resolve_doc_template(slug)
    if not template_name:
        return jsonify({'error': 'Doc not found'}), 404

    content_html = render_template(template_name)
    page_title = resolve_doc_title(slug)
    meta_description = resolve_doc_description(slug)
    return render_template(
        'base.html',
        content_html=content_html,
        current_slug=slug,
        page_title=page_title,
        site_title=DOCS_SITE_TITLE,
        meta_description=meta_description,
    )


@docs_bp.route('/docs-content/<slug>')
def docs_content(slug):
    template_name = resolve_doc_template(slug)
    if not template_name:
        return jsonify({'error': 'Doc not found'}), 404

    response = make_response(render_template(template_name))
    response.headers['X-Doc-Title'] = resolve_doc_title(slug)
    response.headers['X-Doc-Slug'] = slug
    response.headers['X-Doc-Description'] = resolve_doc_description(slug)
    return response
