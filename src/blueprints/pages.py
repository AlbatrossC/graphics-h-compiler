from flask import Blueprint, render_template, send_file

from ..compiler_assets import BASE_DIR
from ..compiler_assets import get_compiler_assets
from ..hooks import get_maintenance_date


pages_bp = Blueprint('pages', __name__)


@pages_bp.route('/')
@pages_bp.route('/index.html')
def index():
    return render_template('index.html')


@pages_bp.route('/compiler')
@pages_bp.route('/compiler.html')
def compiler():
    return render_template('compiler.html', compiler_assets=get_compiler_assets())


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
    return render_template('contact.html')


@pages_bp.route('/privacy-policy')
def privacy_policy():
    return render_template('privacy-policy.html')


@pages_bp.route('/terms')
def terms():
    return render_template('terms.html')


@pages_bp.route('/60fdeab2245d4db481d42962ab440eb2.txt')
def serve_txt():
    return send_file(BASE_DIR / '60fdeab2245d4db481d42962ab440eb2.txt')
