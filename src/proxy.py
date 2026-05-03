from urllib.parse import urljoin

import requests as req
from flask import make_response, request


PROXY_HTTP = req.Session()
PROXY_HTTP.mount('http://', req.adapters.HTTPAdapter(pool_connections=50, pool_maxsize=100))
PROXY_HTTP.mount('https://', req.adapters.HTTPAdapter(pool_connections=50, pool_maxsize=100))


def build_proxy_headers():
    headers = {}
    for key, value in request.headers.items():
        key_lower = key.lower()
        if key_lower in {'host', 'content-length', 'accept-encoding'}:
            continue
        headers[key] = value

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
        timeout=(3.5, read_timeout),
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
