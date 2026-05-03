import json
import time


RESET = '\033[0m'
BOLD = '\033[1m'
GREEN = '\033[92m'
CYAN = '\033[96m'
YELLOW = '\033[93m'
RED = '\033[91m'
GRAY = '\033[90m'
BLUE = '\033[94m'
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
    try:
        data = json.loads(body_bytes or b'{}')
        filename = data.get('file_name') or data.get('filename') or '?'
        folder_id = data.get('folder_id')
        folder = f"folder:{folder_id}" if folder_id else 'root'
        size = len((data.get('content') or '').encode())
        if status < 300:
            log_ok(f"Saved  {BOLD}{filename}{RESET}  in {MAGENTA}{folder}{RESET}  ({size:,} bytes)  → cloud")
        else:
            log_warn(f"Save FAILED  {filename}  in {folder}  (HTTP {status})")
    except Exception:
        log_info(f"File save request (status {status})")
