from flask import Flask
from dotenv import load_dotenv

from .hooks import register_hooks
from .blueprints.assets import assets_bp
from .blueprints.contact import contact_bp
from .blueprints.docs import docs_bp
from .blueprints.pages import pages_bp
from .blueprints.storage import storage_bp


def create_app():
    load_dotenv()

    app = Flask(__name__, static_folder='../static', template_folder='../templates')
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 604800

    register_hooks(app)

    app.register_blueprint(pages_bp)
    app.register_blueprint(docs_bp)
    app.register_blueprint(storage_bp)
    app.register_blueprint(assets_bp)
    app.register_blueprint(contact_bp)

    return app
