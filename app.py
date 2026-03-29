from flask import Flask, send_file, send_from_directory, jsonify, request, render_template, make_response
from dotenv import load_dotenv
import requests as req
import os
import json
import time
from urllib.parse import urljoin

load_dotenv()

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 604800  # 7 days for static files by default

PROXY_HTTP = req.Session()
PROXY_HTTP.mount('http://', req.adapters.HTTPAdapter(pool_connections=50, pool_maxsize=100))
PROXY_HTTP.mount('https://', req.adapters.HTTPAdapter(pool_connections=50, pool_maxsize=100))

# ==================== LOGGING ====================
RESET   = '\033[0m'
BOLD    = '\033[1m'
GREEN   = '\033[92m'
CYAN    = '\033[96m'
YELLOW  = '\033[93m'
RED     = '\033[91m'
GRAY    = '\033[90m'
BLUE    = '\033[94m'
MAGENTA = '\033[95m'

def _ts():
    return time.strftime('%H:%M:%S')

def log_info(msg):
    print(f"{GRAY}[{_ts()}]{RESET} {CYAN}INFO{RESET}  {msg}", flush=True)

def log_ok(msg):
    print(f"{GRAY}[{_ts()}]{RESET} {GREEN}{BOLD}OK{RESET}    {msg}", flush=True)

def log_warn(msg):
    print(f"{GRAY}[{_ts()}]{RESET} {YELLOW}WARN{RESET}  {msg}", flush=True)

def log_error(msg):
    print(f"{GRAY}[{_ts()}]{RESET} {RED}{BOLD}ERR{RESET}   {msg}", flush=True)

def log_request(method, path, status):
    color = GREEN if status < 300 else (YELLOW if status < 400 else RED)
    print(f"{GRAY}[{_ts()}]{RESET} {BLUE}{method:<7}{RESET} {path:<38} {color}{status}{RESET}", flush=True)

def log_file_save(body_bytes, status):
    """Parse and log file-save details in a human-readable format."""
    try:
        data = json.loads(body_bytes or b'{}')
        filename  = data.get('file_name') or data.get('filename') or '?'
        folder_id = data.get('folder_id')
        folder    = f"folder:{folder_id}" if folder_id else 'root'
        size      = len((data.get('content') or '').encode())
        if status < 300:
            log_ok(f"Saved  {BOLD}{filename}{RESET}  in {MAGENTA}{folder}{RESET}  ({size:,} bytes)  → cloud")
        else:
            log_warn(f"Save FAILED  {filename}  in {folder}  (HTTP {status})")
    except Exception:
        log_info(f"File save request (status {status})")

# ==================== VIDEOS ====================
VIDEOS_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'videos')
os.makedirs(VIDEOS_FOLDER, exist_ok=True)

DOCS_SLUG_TO_TEMPLATE = {
    'what-is-graphicsh': 'docs/getting-started/what-is-graphicsh.html',
    'what-is-graphics': 'docs/getting-started/what-is-graphicsh.html',
    'where-to-run': 'docs/getting-started/where-to-run.html',
    'hello-graphics': 'docs/getting-started/hello-graphics.html',
    'graphics-initialization': 'docs/initialization/graphics-initialization.html',
    'line-and-movement': 'docs/drawing/line-and-movement.html',
    'line': 'docs/drawing/line.html',
    'circle': 'docs/drawing/circle.html',
    'rectangle': 'docs/drawing/rectangle.html',
    'bar': 'docs/drawing/bar.html',
    'bar3d': 'docs/drawing/bar3d.html',
    'arc': 'docs/drawing/arc.html',
    'ellipse': 'docs/drawing/ellipse.html',
    'pieslice': 'docs/drawing/pieslice.html',
    'sector': 'docs/drawing/sector.html',
    'polygons-and-fill': 'docs/polygons/polygons-and-fill.html',
    'colors-and-palette': 'docs/colors/colors-and-palette.html',
    'fill-and-patterns': 'docs/fill/fill-and-patterns.html',
    'viewport-and-screen': 'docs/viewport/viewport-and-screen.html',
    'text-and-fonts': 'docs/text/text-and-fonts.html',
    'image-handling': 'docs/image/image-handling.html',
    'drivers-and-modes': 'docs/drivers/drivers-and-modes.html',
    'advanced-functions': 'docs/advanced/advanced-functions.html',
    'error-codes': 'docs/errors/error-codes.html',
}

DEFAULT_DOCS_SLUG = 'what-is-graphicsh'
DOCS_SITE_TITLE = 'graphics.h online compiler docs'
DOCS_SLUG_TO_TITLE = {
    'what-is-graphicsh': 'What is graphics.h',
    'what-is-graphics': 'What is graphics.h',
    'where-to-run': 'Where to Run graphics.h',
    'hello-graphics': 'Hello Graphics Program',
    'graphics-initialization': 'Graphics Initialization',
    'line-and-movement': 'Line and Cursor Movement',
    'line': 'line()',
    'circle': 'circle()',
    'rectangle': 'rectangle()',
    'bar': 'bar()',
    'bar3d': 'bar3d()',
    'arc': 'arc()',
    'ellipse': 'ellipse()',
    'pieslice': 'pieslice()',
    'sector': 'sector()',
    'polygons-and-fill': 'Polygons and Fill',
    'colors-and-palette': 'Colors and Palette',
    'fill-and-patterns': 'Fill and Patterns',
    'viewport-and-screen': 'Viewport and Screen',
    'text-and-fonts': 'Text and Fonts',
    'image-handling': 'Image and Pixel Operations',
    'drivers-and-modes': 'Drivers and Modes',
    'advanced-functions': 'Advanced Functions',
    'error-codes': 'Error Codes',
}
DOCS_SLUG_TO_DESCRIPTION = {
    'what-is-graphicsh': 'Learn what graphics.h is, why it is still taught, and which modern alternatives like SDL and SFML are better for real-world development.',
    'what-is-graphics': 'Learn what graphics.h is, why it is still taught, and which modern alternatives like SDL and SFML are better for real-world development.',
    'where-to-run': 'Compare the best ways to run graphics.h programs: online compiler, VS Code extension, Turbo C with DOSBox, and Ubuntu setup options.',
    'hello-graphics': 'Build and run your first graphics.h hello graphics program with step-by-step explanation, code sample, and DOS output preview.',
    'graphics-initialization': 'Understand graphics.h initialization using initgraph, detectgraph, graphresult, grapherrormsg, closegraph, and restorecrtmode.',
    'line-and-movement': 'Learn line drawing and cursor movement concepts in graphics.h with beginner-friendly examples.',
    'line': 'Explore graphics.h line() function syntax, parameters, and usage examples.',
    'circle': 'Explore graphics.h circle() function syntax, parameters, and usage examples.',
    'rectangle': 'Explore graphics.h rectangle() function syntax, parameters, and usage examples.',
    'bar': 'Explore graphics.h bar() function syntax, parameters, and usage examples.',
    'bar3d': 'Explore graphics.h bar3d() function syntax, parameters, and usage examples.',
    'arc': 'Explore graphics.h arc() function syntax, parameters, and usage examples.',
    'ellipse': 'Explore graphics.h ellipse() function syntax, parameters, and usage examples.',
    'pieslice': 'Explore graphics.h pieslice() function syntax, parameters, and usage examples.',
    'sector': 'Explore graphics.h sector() function syntax, parameters, and usage examples.',
    'polygons-and-fill': 'Learn polygon drawing and fill operations in graphics.h with practical examples.',
    'colors-and-palette': 'Understand graphics.h color constants, palette usage, and fill color behavior.',
    'fill-and-patterns': 'Learn fill styles and patterns in graphics.h for area shading and visual effects.',
    'viewport-and-screen': 'Understand graphics.h viewport, coordinate clipping, and screen handling basics.',
    'text-and-fonts': 'Learn text rendering functions and font styling in graphics.h.',
    'image-handling': 'Learn graphics.h image and pixel operations including putpixel, getimage, and putimage.',
    'drivers-and-modes': 'Understand graphics.h drivers, graphics modes, and compatibility concerns.',
    'advanced-functions': 'Explore advanced graphics.h functions and practical usage tips.',
    'error-codes': 'Learn graphics.h error codes and debugging techniques for initialization and drawing issues.',
}


def resolve_doc_template(slug):
    return DOCS_SLUG_TO_TEMPLATE.get(slug)


def resolve_doc_title(slug):
    return DOCS_SLUG_TO_TITLE.get(slug, 'Documentation')


def resolve_doc_description(slug):
    if slug in DOCS_SLUG_TO_DESCRIPTION:
        return DOCS_SLUG_TO_DESCRIPTION[slug]
    title = resolve_doc_title(slug)
    return f'{title} guide for graphics.h online compiler documentation with examples and student-friendly explanations.'

# Maintenance mode check
def is_maintenance_mode():
    return os.getenv('MAINTENANCE_MODE', 'false').lower() == 'true'


def get_maintenance_date():
    return os.getenv('MAINTENANCE_DATE', '25 Feb 2026 · 2:00 PM IST')


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
    return response

def get_missing_env(keys):
    missing = []
    for key in keys:
        if not os.getenv(key):
            missing.append(key)
    return missing


def truncate_discord_field(text, limit=1024):
    value = (text or '').strip()
    if len(value) <= limit:
        return value
    return value[:limit - 3] + '...'


def send_discord_webhook(payload):
    discord_webhook_url = os.getenv('DISCORD_WEBHOOK_URL')
    if not discord_webhook_url:
        return False

    try:
        PROXY_HTTP.post(discord_webhook_url, json=payload, timeout=5)
        return True
    except Exception as exc:
        log_warn(f'Discord webhook failed: {exc}')
        return False


def build_proxy_headers():
    headers = {}
    for key, value in request.headers.items():
        key_lower = key.lower()
        if key_lower in {'host', 'content-length', 'accept-encoding'}:
            continue
        headers[key] = value
    # Avoid upstream brotli/zstd payloads that may be passed through as bytes
    # while content-encoding is stripped by this proxy path.
    headers['Accept-Encoding'] = 'identity'
    forwarded_for = request.headers.get('X-Forwarded-For', request.remote_addr or '')
    if forwarded_for:
        headers['X-Forwarded-For'] = forwarded_for
    headers['X-Forwarded-Proto'] = request.scheme
    headers['X-Forwarded-Host'] = request.host
    return headers


def rewrite_set_cookie(cookie_value):
    is_https = request.scheme == 'https' or request.headers.get('X-Forwarded-Proto') == 'https'
    parts = []
    for part in cookie_value.split(';'):
        stripped = part.strip()
        if stripped.lower().startswith('domain='):
            continue
        if stripped.lower() == 'secure' and not is_https:
            continue
        parts.append(stripped)
    return '; '.join(parts)


def proxy_request(base_url, path='', allow_redirects=False, body=None, read_timeout=20):
    target_url = urljoin(base_url.rstrip('/') + '/', path.lstrip('/'))
    query_string = request.query_string.decode('utf-8')
    if query_string:
        target_url = f'{target_url}?{query_string}'

    upstream_response = PROXY_HTTP.request(
        method=request.method,
        url=target_url,
        headers=build_proxy_headers(),
        data=body if body is not None else (request.get_data() if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} else None),
        allow_redirects=allow_redirects,
        timeout=(3.5, read_timeout)
    )

    response = make_response(upstream_response.content, upstream_response.status_code)

    excluded_headers = {
        'content-encoding',
        'content-length',
        'transfer-encoding',
        'connection',
        'set-cookie',
    }
    for key, value in upstream_response.headers.items():
        if key.lower() in excluded_headers:
            continue
        response.headers[key] = value

    raw_headers = getattr(upstream_response.raw, 'headers', None)
    if raw_headers and hasattr(raw_headers, 'getlist'):
        set_cookies = raw_headers.getlist('Set-Cookie')
    else:
        set_cookie_value = upstream_response.headers.get('Set-Cookie')
        set_cookies = [set_cookie_value] if set_cookie_value else []

    for cookie in set_cookies:
        response.headers.add('Set-Cookie', rewrite_set_cookie(cookie))

    return response

# Pages
@app.route('/')
@app.route('/index.html')
def index():
    return render_template('index.html')

@app.route('/compiler')
@app.route('/compiler.html')
def compiler():
    return render_template('compiler.html')


@app.route('/api/auth/config')
def auth_config():
    return jsonify({
        'authEnabled': bool(os.getenv('USER_FILES_WORKERS') and os.getenv('GOOGLE_CLIENT_ID')),
        'storageEnabled': bool(os.getenv('USER_FILES_WORKERS')),
        'aiEnabled': bool(os.getenv('AI_ASSISTANT_WORKER')),
        'googleClientId': os.getenv('GOOGLE_CLIENT_ID', ''),
        'supabaseUrl': os.getenv('SUPABASE_URL', ''),
        'supabaseAnonKey': os.getenv('SUPABASE_ANON_KEY', ''),
    })


@app.route('/api/auth/google', methods=['POST', 'OPTIONS'])
@app.route('/api/auth/session', methods=['GET', 'OPTIONS'])
@app.route('/api/auth/logout', methods=['POST', 'OPTIONS'])
def auth_proxy():
    storage_worker_url = os.getenv('USER_FILES_WORKERS')
    if not storage_worker_url:
        return jsonify({'error': 'Authentication is not configured'}), 503
    worker_path = request.path.replace('/api', '', 1)
    resp = proxy_request(storage_worker_url, worker_path, allow_redirects=False)
    status = resp.status_code

    if request.path == '/api/auth/google':
        if status < 300:
            try:
                user_email = resp.get_json(force=True).get('email', '?')
                log_ok(f"Google sign-in  → {BOLD}{user_email}{RESET}")
            except Exception:
                log_ok("Google sign-in  → success")
        else:
            log_warn(f"Google sign-in failed  (HTTP {status})")
    elif request.path == '/api/auth/logout':
        log_info("User signed out")
    # session checks are silent (called on every page load)

    return resp


@app.route('/api/files', methods=['GET', 'OPTIONS'])
@app.route('/api/file/create', methods=['POST', 'OPTIONS'])
@app.route('/api/file/save', methods=['POST', 'OPTIONS'])
@app.route('/api/file/delete', methods=['DELETE', 'OPTIONS'])
@app.route('/api/folder/create', methods=['POST', 'OPTIONS'])
@app.route('/api/folder/delete', methods=['DELETE', 'OPTIONS'])
def storage_proxy():
    storage_worker_url = os.getenv('USER_FILES_WORKERS')
    if not storage_worker_url:
        return jsonify({'error': 'Storage worker is not configured'}), 503

    # Read body once before passing to proxy (stream is consumed on first read)
    body_bytes = request.get_data() if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} else None
    resp = proxy_request(storage_worker_url, request.path, allow_redirects=False, body=body_bytes)
    status = resp.status_code

    if request.path == '/api/file/save':
        log_file_save(body_bytes, status)

    elif request.path == '/api/file/delete':
        try:
            data = json.loads(body_bytes or b'{}')
            fname = data.get('file_name') or data.get('filename') or '?'
            color = GREEN if status < 300 else RED
            print(f"{GRAY}[{_ts()}]{RESET} {RED}DEL{RESET}   File deleted  {BOLD}{fname}{RESET}  ({color}{status}{RESET})", flush=True)
        except Exception:
            log_request(request.method, request.path, status)

    elif request.path == '/api/folder/create':
        try:
            data = json.loads(body_bytes or b'{}')
            fname = data.get('folder_name') or '?'
            log_ok(f"Folder created  {BOLD}{fname}{RESET}  (HTTP {status})")
        except Exception:
            log_request(request.method, request.path, status)

    elif request.path == '/api/folder/delete':
        log_info(f"Folder deleted  (HTTP {status})")

    elif request.path == '/api/files':
        log_info(f"File list fetched  (HTTP {status})")

    else:
        log_request(request.method, request.path, status)

    return resp

@app.route('/api/ai', methods=['POST', 'OPTIONS'])
@app.route('/api/ai/fix', methods=['POST', 'OPTIONS'])
@app.route('/api/ai/action', methods=['PATCH', 'OPTIONS'])
@app.route('/api/ai/sessions', methods=['GET', 'OPTIONS'])
@app.route('/api/ai/sessions/<session_id>', methods=['GET', 'DELETE', 'OPTIONS'])
def ai_proxy(session_id=None):
    ai_worker_url = os.getenv('AI_ASSISTANT_WORKER')
    if not ai_worker_url:
        return jsonify({'error': 'AI assistant worker is not configured'}), 503

    body_bytes = request.get_data() if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} else None
    try:
        resp = proxy_request(ai_worker_url, request.path, allow_redirects=False, body=body_bytes, read_timeout=120)
    except req.exceptions.Timeout as exc:
        log_warn(f"AI proxy timeout  path={request.path}  error={exc}")
        return jsonify({'error': 'AI request timed out. Please try again.', 'code': 'timeout'}), 504
    except req.exceptions.RequestException as exc:
        log_warn(f"AI proxy error  path={request.path}  error={exc}")
        return jsonify({'error': 'AI service unreachable. Please try again.', 'code': 'proxy_error'}), 502
    status = resp.status_code
    response_text = ''
    ai_payload = None
    try:
        response_text = resp.get_data(as_text=True)
        ai_payload = json.loads(response_text) if response_text else None
    except Exception:
        response_text = response_text[:300] if response_text else ''

    response_excerpt = response_text[:300] if response_text else ''
    ai_code = ai_payload.get('code') if isinstance(ai_payload, dict) else ''
    ai_reason = ''
    if isinstance(ai_payload, dict) and isinstance(ai_payload.get('debug'), dict):
        ai_reason = ai_payload['debug'].get('reason') or ''
    retry_after = resp.headers.get('Retry-After', '')

    if request.path == '/api/ai':
        if status < 300:
            log_ok(f"AI request completed  (HTTP {status})")
        else:
            log_warn(
                f"AI request failed  (HTTP {status})  target={ai_worker_url}  "
                f"code={ai_code or '?'}  reason={ai_reason or '?'}  retry_after={retry_after or 'n/a'}  "
                f"{response_excerpt}"
            )
    elif request.path == '/api/ai/fix':
        if status < 300:
            log_ok(f"AI fix completed  (HTTP {status})")
        else:
            log_warn(
                f"AI fix failed  (HTTP {status})  target={ai_worker_url}  "
                f"code={ai_code or '?'}  reason={ai_reason or '?'}  retry_after={retry_after or 'n/a'}  "
                f"{response_excerpt}"
            )
    elif request.path == '/api/ai/action':
        if status < 300:
            log_info("AI draft action recorded")
        else:
            log_warn(
                f"AI draft action failed  (HTTP {status})  target={ai_worker_url}  "
                f"code={ai_code or '?'}  reason={ai_reason or '?'}  {response_excerpt}"
            )
    elif request.path == '/api/ai/sessions':
        if status < 300:
            log_info("AI session history fetched")
        else:
            log_warn(f"AI session history failed  (HTTP {status})")

    return resp

@app.route('/maintenance.html')
def maintenance():
    return render_template('maintenance.html', maintenance_date=get_maintenance_date())


@app.route('/embed')
@app.route('/embed.html')
def embed():
    return render_template('embed.html')

@app.route('/embed-docs')
@app.route('/embed-docs.html')
def embed_docs():
    return render_template('embed-docs.html')


@app.route('/about')
def about():
    return render_template('about.html')


@app.route('/contact')
def contact_page():
    return render_template('contact.html')


@app.route('/privacy-policy')
def privacy_policy():
    return render_template('privacy-policy.html')


@app.route('/terms')
def terms():
    return render_template('terms.html')


@app.route('/docs')
def docs_landing():
    return render_template('docs.html')


@app.route('/docs/<slug>')
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
        meta_description=meta_description
    )


@app.route('/docs-content/<slug>')
def docs_content(slug):
    template_name = resolve_doc_template(slug)
    if not template_name:
        return jsonify({'error': 'Doc not found'}), 404
    response = make_response(render_template(template_name))
    response.headers['X-Doc-Title'] = resolve_doc_title(slug)
    response.headers['X-Doc-Slug'] = slug
    response.headers['X-Doc-Description'] = resolve_doc_description(slug)
    return response

# Static assets
@app.route('/static/<path:path>')
def serve_static(path):
    response = send_from_directory('static', path)
    lower_path = path.lower()

    # Manifest should revalidate quickly; other static assets can be cached longer.
    if lower_path == 'manifest.json':
        response.cache_control.public = True
        response.cache_control.max_age = 300
        response.cache_control.must_revalidate = True
    elif any(lower_path.endswith(ext) for ext in ('.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.mp4', '.webm')):
        response.cache_control.public = True
        response.cache_control.max_age = 604800
    return response

@app.route('/robots.txt')
def robots_txt():
    return send_from_directory('static', 'robots.txt', mimetype='text/plain')

@app.route('/ads.txt')
def ads_txt():
    return send_file('ads.txt')

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
    response = send_from_directory('compiler-assets', filepath)
    lower_path = filepath.lower()
    if any(lower_path.endswith(ext) for ext in ('.zip', '.cpp', '.js', '.wasm', '.data')):
        response.cache_control.public = True
        response.cache_control.max_age = 604800
    return response


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

# Contact API
@app.route('/api/contact', methods=['POST', 'OPTIONS'])
def contact():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response, 200

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
                    {'name': 'Message', 'value': truncate_discord_field(message), 'inline': False}
                ]
            }]
        }

        send_discord_webhook(payload)

        return jsonify({'success': True, 'message': 'Message sent successfully'}), 200

    except Exception as e:
        log_error(f'Contact error: {e}')
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
                    {'name': 'Message', 'value': truncate_discord_field(message), 'inline': False}
                ]
            }]
        }

        send_discord_webhook(payload)

        return jsonify({'success': True, 'message': 'Message sent successfully'}), 200

    except Exception as e:
        log_error(f'Maintenance message error: {e}')
        return jsonify({'error': 'Failed to send message'}), 500


@app.route('/api/ai-feedback', methods=['POST', 'OPTIONS'])
def ai_feedback():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response, 200

    if not os.getenv('DISCORD_WEBHOOK_URL'):
        return jsonify({'error': 'Server configuration error'}), 500

    try:
        data = request.get_json() or {}
        name = data.get('name', '').strip() or 'Anonymous'
        suggestion = data.get('suggestion', '').strip()

        if not suggestion:
            return jsonify({'error': 'Suggestion is required'}), 400

        payload = {
            'content': 'AI assistant feedback from compiler',
            'embeds': [{
                'color': 0x5865F2,
                'fields': [
                    {'name': 'Name', 'value': truncate_discord_field(name), 'inline': False},
                    {'name': 'Suggestion', 'value': truncate_discord_field(suggestion), 'inline': False},
                    {'name': 'Page', 'value': '/compiler.html', 'inline': False},
                ]
            }]
        }

        webhook_sent = send_discord_webhook(payload)
        if not webhook_sent:
            return jsonify({'error': 'Failed to send feedback'}), 502

        log_ok(f"AI feedback sent  from {BOLD}{name}{RESET}")
        return jsonify({'success': True, 'message': 'Feedback sent successfully'}), 200

    except Exception as e:
        log_error(f'AI feedback error: {e}')
        return jsonify({'error': 'Failed to send feedback'}), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    wants_json = (
        request.path.startswith('/api/')
        or request.path.startswith('/static/')
        or request.accept_mimetypes.best == 'application/json'
    )
    if wants_json:
        return jsonify({'error': 'Not found'}), 404
    return render_template('404.html'), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Server error'}), 500

@app.route('/60fdeab2245d4db481d42962ab440eb2.txt')
def serve_txt():
    return send_file('60fdeab2245d4db481d42962ab440eb2.txt')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
