from flask import Flask, send_file, send_from_directory, jsonify, request, Response, render_template
from dotenv import load_dotenv
import requests as req
import os
import uuid

load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')

VIDEOS_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'videos')
os.makedirs(VIDEOS_FOLDER, exist_ok=True)

# Maintenance mode check
def is_maintenance_mode():
    return os.getenv('MAINTENANCE_MODE', 'false').lower() == 'true'

@app.before_request
def check_maintenance():
    if is_maintenance_mode() \
            and request.path != '/maintenance.html' \
            and not request.path.startswith('/api/maintenance') \
            and not request.path.startswith('/static/'):
        return render_template('maintenance.html')

def get_missing_env(keys):
    missing = []
    for key in keys:
        if not os.getenv(key):
            missing.append(key)
    return missing

# Pages
@app.route('/')
@app.route('/index.html')
def index():
    return render_template('index.html')

@app.route('/compiler')
@app.route('/compiler.html')
def compiler():
    return render_template('compiler.html')

@app.route('/maintenance.html')
def maintenance():
    return render_template('maintenance.html')

@app.route('/docs')
@app.route('/docs.html')
def docs():
    return render_template('docs.html')

@app.route('/embed')
@app.route('/embed.html')
def embed():
    return render_template('embed.html')

@app.route('/embed-docs')
@app.route('/embed-docs.html')
def embed_docs():
    return render_template('embed-docs.html')

# Static assets
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/robots.txt')
def robots_txt():
    return send_from_directory('static', 'robots.txt', mimetype='text/plain')

@app.route('/sitemap.xml')
def sitemap_xml():
    return send_from_directory('static', 'sitemap.xml', mimetype='application/xml')

@app.route('/sdk.js')
def serve_sdk():
    return send_from_directory('static', 'sdk.js', mimetype='application/javascript')

@app.route('/libs/<path:filename>')
def serve_libs(filename):
    return send_from_directory('compiler-assets/libs', filename)

# Serve compiler assets (demos, zip files) for offline mode
@app.route('/compiler-assets/<path:filepath>')
def serve_compiler_assets(filepath):
    return send_from_directory('compiler-assets', filepath)


# Video API
@app.route('/api/video/<path:filename>')
def get_video(filename):
    video_path = os.path.join(VIDEOS_FOLDER, filename)
    
    if not os.path.abspath(video_path).startswith(os.path.abspath(VIDEOS_FOLDER)):
        return jsonify({'error': 'File not found'}), 404
    
    if not os.path.exists(video_path):
        return jsonify({'error': 'Video not found'}), 404
    
    mime_types = {'.webm': 'video/webm', '.mkv': 'video/x-matroska'}
    ext = os.path.splitext(filename)[1]
    mime_type = mime_types.get(ext, 'video/mp4')
    
    return send_file(video_path, mimetype=mime_type)

# Supabase Auth Config API
@app.route('/api/auth/config')
def auth_config():
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_anon_key = os.getenv('SUPABASE_ANON_KEY')
    
    if not supabase_url or not supabase_anon_key:
        missing = get_missing_env(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
        return jsonify({
            'error': 'Auth not configured',
            'missing': missing
        }), 500
    
    return jsonify({
        'supabaseUrl': supabase_url,
        'supabaseAnonKey': supabase_anon_key
    })

# Storage Worker Proxy (server-side only)
@app.route('/files/<path:subpath>', methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
def proxy_storage_worker(subpath):
    request_id = str(uuid.uuid4())
    storage_worker_url = os.getenv('STORAGE_WORKER_URL')
    if not storage_worker_url:
        return jsonify({
            'error': 'Storage worker not configured',
            'missing': ['STORAGE_WORKER_URL'],
            'requestId': request_id
        }), 500

    if request.method == 'OPTIONS':
        response = Response(status=204)
        response.headers['Access-Control-Allow-Origin'] = request.host_url.rstrip('/')
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response

    base_url = storage_worker_url.rstrip('/')
    target_url = f'{base_url}/files/{subpath}'
    if request.query_string:
        target_url = f'{target_url}?{request.query_string.decode()}'

    headers = {}
    if 'Authorization' in request.headers:
        headers['Authorization'] = request.headers.get('Authorization')
    if request.content_type:
        headers['Content-Type'] = request.content_type
    host = request.host.split(':')[0]
    if host in ('127.0.0.1', '::1'):
        headers['Origin'] = 'http://localhost:5000'
    else:
        headers['Origin'] = request.host_url.rstrip('/')

    try:
        upstream = req.request(
            method=request.method,
            url=target_url,
            headers=headers,
            data=request.get_data(),
            timeout=20
        )
    except Exception as e:
        return jsonify({
            'error': 'Storage worker request failed',
            'detail': str(e),
            'target': target_url,
            'requestId': request_id
        }), 502

    response = Response(upstream.content, status=upstream.status_code)
    if upstream.headers.get('Content-Type'):
        response.headers['Content-Type'] = upstream.headers.get('Content-Type')
    if upstream.headers.get('X-Request-Id'):
        response.headers['X-Request-Id'] = upstream.headers.get('X-Request-Id')
    else:
        response.headers['X-Request-Id'] = request_id
    return response

# Contact API
@app.route('/api/contact', methods=['POST', 'OPTIONS'])
def contact():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response, 200

    discord_webhook_url = os.getenv('DISCORD_WEBHOOK_URL')
    if not discord_webhook_url:
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
                    {'name': 'Message', 'value': message[:1021] + '...' if len(message) > 1024 else message, 'inline': False}
                ]
            }]
        }
        
        try:
            req.post(discord_webhook_url, json=payload, timeout=5)
        except:
            pass
        
        return jsonify({'success': True, 'message': 'Message sent successfully'}), 200
        
    except Exception as e:
        print(f'Contact error: {e}')
        return jsonify({'error': 'Failed to send message'}), 500

# Maintenance Message API
@app.route('/api/maintenance/message', methods=['POST', 'OPTIONS'])
def maintenance_message():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response, 200

    discord_webhook_url = os.getenv('DISCORD_WEBHOOK_URL')
    if not discord_webhook_url:
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
                    {'name': 'Message', 'value': message[:1021] + '...' if len(message) > 1024 else message, 'inline': False}
                ]
            }]
        }
        
        try:
            req.post(discord_webhook_url, json=payload, timeout=5)
        except:
            pass
        
        return jsonify({'success': True, 'message': 'Message sent successfully'}), 200
        
    except Exception as e:
        print(f'Maintenance message error: {e}')
        return jsonify({'error': 'Failed to send message'}), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Server error'}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)