import os

from flask import Blueprint, jsonify, request

from ..discord_utils import send_discord_webhook, truncate_discord_field
from ..logging_utils import log_error


contact_bp = Blueprint('contact_api', __name__)


def cors_ok_response():
    response = jsonify({'status': 'ok'})
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response, 200


@contact_bp.route('/api/contact', methods=['POST', 'OPTIONS'])
def contact():
    if request.method == 'OPTIONS':
        return cors_ok_response()

    if not os.getenv('DISCORD_WEBHOOK_URL'):
        return jsonify({'error': 'Server configuration error'}), 500

    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        message = data.get('message', '').strip()
        name = data.get('name', '').strip() or 'Anonymous'

        if not email or not message:
            return jsonify({'error': 'Email and message are required'}), 400

        if '@' not in email or '.' not in email:
            return jsonify({'error': 'Invalid email format'}), 400

        payload = {
            'content': 'New contact query for Graphics.H OC',
            'embeds': [{
                'color': 0x00ff88,
                'fields': [
                    {'name': 'Name', 'value': name, 'inline': False},
                    {'name': 'Email', 'value': email, 'inline': False},
                    {'name': 'Message', 'value': truncate_discord_field(message), 'inline': False},
                ],
            }],
        }

        send_discord_webhook(payload)
        return jsonify({'success': True, 'message': 'Message sent successfully'}), 200
    except Exception as error:
        log_error(f'Contact error: {error}')
        return jsonify({'error': 'Failed to send message'}), 500


@contact_bp.route('/api/maintenance/message', methods=['POST', 'OPTIONS'])
def maintenance_message():
    if request.method == 'OPTIONS':
        return cors_ok_response()

    if not os.getenv('DISCORD_WEBHOOK_URL'):
        return jsonify({'error': 'Server configuration error'}), 500

    try:
        data = request.get_json()
        message = data.get('message', '').strip()

        if not message:
            return jsonify({'error': 'Message is required'}), 400

        payload = {
            'content': '🔧 Message from Maintenance Page',
            'embeds': [{
                'color': 0xff9900,
                'fields': [
                    {'name': 'Message', 'value': truncate_discord_field(message), 'inline': False},
                ],
            }],
        }

        send_discord_webhook(payload)
        return jsonify({'success': True, 'message': 'Message sent successfully'}), 200
    except Exception as error:
        log_error(f'Maintenance message error: {error}')
        return jsonify({'error': 'Failed to send message'}), 500


@contact_bp.route('/api/migration-feedback', methods=['POST', 'OPTIONS'])
def migration_feedback():
    if request.method == 'OPTIONS':
        return cors_ok_response()

    if not os.getenv('DISCORD_WEBHOOK_URL'):
        return jsonify({'error': 'Server configuration error'}), 500

    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        city = data.get('city', '').strip() or 'Unknown'

        if not message:
            return jsonify({'error': 'Message is required'}), 400

        payload = {
            'content': '🚚 **Migration Feedback from Compiler Page**',
            'embeds': [{
                'color': 0xffaa00,
                'fields': [
                    {'name': '📍 City', 'value': city, 'inline': True},
                    {'name': '📝 Message', 'value': truncate_discord_field(message), 'inline': False},
                ],
                'footer': {
                    'text': 'Cloudflare Migration — Downtime Scheduling Feedback'
                }
            }],
        }

        send_discord_webhook(payload)
        return jsonify({'success': True, 'message': 'Feedback sent successfully'}), 200
    except Exception as error:
        log_error(f'Migration feedback error: {error}')
        return jsonify({'error': 'Failed to send feedback'}), 500


@contact_bp.route('/api/feedback', methods=['POST', 'OPTIONS'])
def feedback():
    if request.method == 'OPTIONS':
        return cors_ok_response()

    if not os.getenv('DISCORD_WEBHOOK_URL'):
        return jsonify({'error': 'Server configuration error'}), 500

    try:
        data = request.get_json()
        message = data.get('message', '').strip()

        if not message:
            return jsonify({'error': 'Message is required'}), 400

        payload = {
            'content': '⭐ **New Feedback from Compiler Pop-up**',
            'embeds': [{
                'color': 0xe3b341,
                'fields': [
                    {'name': 'Message', 'value': truncate_discord_field(message), 'inline': False},
                ],
                'footer': {
                    'text': 'Graphics.h Online Compiler Star Pop-up'
                }
            }],
        }

        send_discord_webhook(payload)
        return jsonify({'success': True, 'message': 'Feedback sent successfully'}), 200
    except Exception as error:
        log_error(f'Feedback error: {error}')
        return jsonify({'error': 'Failed to send feedback'}), 500
