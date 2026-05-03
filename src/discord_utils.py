import os

from .logging_utils import log_warn
from .proxy import PROXY_HTTP


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
