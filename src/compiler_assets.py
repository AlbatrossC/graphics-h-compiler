import json
import re
from pathlib import Path

from .docs_data import DOCS_CANONICAL_SLUGS, DOCS_SLUG_TO_DESCRIPTION, DOCS_SLUG_TO_TEMPLATE, DOCS_SLUG_TO_TITLE


BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_BUILD_DIR = BASE_DIR / 'static' / 'build'
COMPILER_ASSET_MANIFEST = STATIC_BUILD_DIR / 'asset-manifest.json'
HASHED_COMPILER_ASSET_PATTERN = re.compile(r'^build/compiler\.[a-f0-9]+\.(css|js)$')


def get_compiler_assets():
    fallback = {
        'css_urls': ['/static/css/compiler.css'],
        'js_urls': [
            '/static/js/compiler/asset-sources.js',
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
        with COMPILER_ASSET_MANIFEST.open('r', encoding='utf-8') as handle:
            manifest = json.load(handle)
        compiler_manifest = manifest.get('compiler') or {}
        css_url = compiler_manifest.get('css')
        js_url = compiler_manifest.get('js')
        if css_url and js_url:
            return {'css_urls': [css_url], 'js_urls': [js_url]}
    except Exception:
        pass

    return fallback


def resolve_doc_template(slug):
    return DOCS_SLUG_TO_TEMPLATE.get(slug)


def resolve_doc_canonical_slug(slug):
    return DOCS_CANONICAL_SLUGS.get(slug, slug)


def resolve_doc_title(slug):
    return DOCS_SLUG_TO_TITLE.get(slug, 'Documentation')


def resolve_doc_description(slug):
    if slug in DOCS_SLUG_TO_DESCRIPTION:
        return DOCS_SLUG_TO_DESCRIPTION[slug]
    title = resolve_doc_title(slug)
    return f'{title} guide for graphics.h online compiler documentation with examples and student-friendly explanations.'
