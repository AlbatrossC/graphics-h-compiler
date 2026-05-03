import json
import os

from flask import Blueprint, jsonify, request

from ..logging_utils import BOLD, GREEN, GRAY, RED, RESET, _ts, log_file_save, log_info, log_ok, log_request, log_warn
from ..proxy import proxy_request


storage_bp = Blueprint('storage', __name__)


@storage_bp.route('/api/auth/config')
def auth_config():
    return jsonify({
        'authEnabled': bool(os.getenv('USER_FILES_WORKERS') and os.getenv('GOOGLE_CLIENT_ID')),
        'storageEnabled': bool(os.getenv('USER_FILES_WORKERS')),
        'googleClientId': os.getenv('GOOGLE_CLIENT_ID', ''),
    })


@storage_bp.route('/api/auth/google', methods=['POST', 'OPTIONS'])
@storage_bp.route('/api/auth/session', methods=['GET', 'OPTIONS'])
@storage_bp.route('/api/auth/logout', methods=['POST', 'OPTIONS'])
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

    return resp


@storage_bp.route('/api/files', methods=['GET', 'OPTIONS'])
@storage_bp.route('/api/file/create', methods=['POST', 'OPTIONS'])
@storage_bp.route('/api/file/save', methods=['POST', 'OPTIONS'])
@storage_bp.route('/api/file/delete', methods=['DELETE', 'OPTIONS'])
@storage_bp.route('/api/folder/create', methods=['POST', 'OPTIONS'])
@storage_bp.route('/api/folder/delete', methods=['DELETE', 'OPTIONS'])
def storage_proxy():
    storage_worker_url = os.getenv('USER_FILES_WORKERS')
    if not storage_worker_url:
        return jsonify({'error': 'Storage worker is not configured'}), 503

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
