import os

from flask import jsonify, render_template, request, send_from_directory

from .compiler_assets import HASHED_COMPILER_ASSET_PATTERN


def is_maintenance_mode():
    return os.getenv('MAINTENANCE_MODE', 'false').lower() == 'true'


def get_maintenance_date():
    return os.getenv('MAINTENANCE_DATE', '25 Feb 2026 · 2:00 PM IST')


def register_hooks(app):
    @app.before_request
    def check_maintenance():
        if is_maintenance_mode() \
                and request.path != '/maintenance.html' \
                and not request.path.startswith('/api/maintenance') \
                and not request.path.startswith('/static/'):
            return render_template('maintenance.html', maintenance_date=get_maintenance_date())

    @app.after_request
    def apply_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        response.headers['X-XSS-Protection'] = '1; mode=block'

        request_path = (request.path or '').lower()
        if request_path.startswith('/static/'):
            static_path = request_path.removeprefix('/static/')
            if HASHED_COMPILER_ASSET_PATTERN.match(static_path) or static_path in {'js/compiler/codemirror.bundle.v1.js', 'analytics.js'}:
                response.cache_control.public = True
                response.cache_control.max_age = 31536000
                response.cache_control.immutable = True
            elif static_path.startswith('fonts/'):
                response.cache_control.public = True
                response.cache_control.max_age = 31536000
                response.cache_control.immutable = True

        return response

    @app.errorhandler(404)
    def not_found(_error):
        wants_json = (
            request.path.startswith('/api/')
            or request.path.startswith('/static/')
            or request.accept_mimetypes.best == 'application/json'
        )
        if wants_json:
            return jsonify({'error': 'Not found'}), 404
        return render_template('404.html'), 404

    @app.errorhandler(500)
    def server_error(_error):
        return jsonify({'error': 'Server error'}), 500
