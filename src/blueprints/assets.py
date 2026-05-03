import os

from flask import Blueprint, jsonify, send_file, send_from_directory

from ..compiler_assets import BASE_DIR, HASHED_COMPILER_ASSET_PATTERN


assets_bp = Blueprint('assets', __name__)


def videos_folder():
    return os.path.join(BASE_DIR, 'static', 'videos')


@assets_bp.route('/static/fonts/<path:filename>')
def serve_static_fonts(filename):
    response = send_from_directory(BASE_DIR / 'static' / 'fonts', filename)
    response.cache_control.public = True
    response.cache_control.max_age = 31536000
    response.cache_control.immutable = True
    return response


@assets_bp.route('/static/build/<path:filename>')
def serve_static_build(filename):
    response = send_from_directory(BASE_DIR / 'static' / 'build', filename)
    response.cache_control.public = True
    response.cache_control.max_age = 31536000
    response.cache_control.immutable = True
    return response


@assets_bp.route('/static/<path:path>')
def serve_static(path):
    response = send_from_directory(BASE_DIR / 'static', path)
    lower_path = path.lower()

    if lower_path == 'manifest.json':
        response.cache_control.public = True
        response.cache_control.max_age = 300
        response.cache_control.must_revalidate = True
    elif HASHED_COMPILER_ASSET_PATTERN.match(lower_path):
        response.cache_control.public = True
        response.cache_control.max_age = 31536000
        response.cache_control.immutable = True
    elif lower_path in {'js/compiler/codemirror.bundle.v1.js', 'analytics.js'}:
        response.cache_control.public = True
        response.cache_control.max_age = 31536000
        response.cache_control.immutable = True
    elif lower_path.startswith('fonts/'):
        response.cache_control.public = True
        response.cache_control.max_age = 31536000
        response.cache_control.immutable = True
    elif any(lower_path.endswith(ext) for ext in ('.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.mp4', '.webm')):
        response.cache_control.public = True
        response.cache_control.max_age = 604800
    return response


@assets_bp.route('/robots.txt')
def robots_txt():
    return send_from_directory(BASE_DIR / 'static', 'robots.txt', mimetype='text/plain')


@assets_bp.route('/ads.txt')
def ads_txt():
    return send_file(BASE_DIR / 'ads.txt')


@assets_bp.route('/sitemap.xml')
def sitemap_xml():
    return send_from_directory(BASE_DIR / 'static', 'sitemap.xml', mimetype='application/xml')


@assets_bp.route('/sdk.js')
def serve_sdk():
    return send_from_directory(BASE_DIR / 'static', 'sdk.js', mimetype='application/javascript')


@assets_bp.route('/libs/<path:filename>')
def serve_libs(filename):
    lower_name = filename.lower()

    if lower_name == 'wdosbox.wasm':
        response = send_from_directory(BASE_DIR / 'compiler-assets' / 'libs', 'wdosbox.wasm.js', mimetype='application/wasm')
    else:
        response = send_from_directory(BASE_DIR / 'compiler-assets' / 'libs', filename)

    if lower_name in {'js-dos.js', 'wdosbox.js', 'wdosbox.wasm'}:
        response.cache_control.public = True
        response.cache_control.max_age = 31536000
        response.cache_control.immutable = True

    return response


@assets_bp.route('/compiler-assets/<path:filepath>')
def serve_compiler_assets(filepath):
    response = send_from_directory(BASE_DIR / 'compiler-assets', filepath)
    lower_path = filepath.lower()
    if any(lower_path.endswith(ext) for ext in ('.zip', '.cpp', '.js', '.wasm', '.data', '.woff', '.woff2')):
        response.cache_control.public = True
        response.cache_control.max_age = 31536000
        response.cache_control.immutable = True
    return response


@assets_bp.route('/api/video/<path:filename>')
def get_video(filename):
    video_path = os.path.join(videos_folder(), filename)

    if not os.path.abspath(video_path).startswith(os.path.abspath(videos_folder())):
        return jsonify({'error': 'File not found'}), 404

    if not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404

    mime_types = {'.webm': 'video/webm', '.mkv': 'video/x-matroska'}
    ext = os.path.splitext(filename)[1]
    mime_type = mime_types.get(ext, 'video/mp4')

    return send_file(video_path, mimetype=mime_type)
