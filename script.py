#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════╗
║                  IndexNow Bulk URL Submission Tool                  ║
║          Submit sitemap URLs to search engines via IndexNow         ║
╚══════════════════════════════════════════════════════════════════════╝

Reads URLs from static/sitemap.xml and submits them in bulk to the
IndexNow API for instant indexing by Bing, Yandex, and other engines.
"""

import xml.etree.ElementTree as ET
import requests
import time
import sys
import os
from datetime import datetime

# ─── Configuration ────────────────────────────────────────────────────
INDEXNOW_KEY = "9264fa18540f4a9b94782e9617b7faad"
HOST = "graphics-h-compiler.vercel.app"
KEY_LOCATION = f"https://{HOST}/{INDEXNOW_KEY}.txt"
SITEMAP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "sitemap.xml")
INDEXNOW_API = "https://api.indexnow.org/indexnow"

# ─── ANSI Color Codes ────────────────────────────────────────────────
class C:
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    DIM     = "\033[2m"
    ITALIC  = "\033[3m"
    UNDERLINE = "\033[4m"

    BLACK   = "\033[30m"
    RED     = "\033[31m"
    GREEN   = "\033[32m"
    YELLOW  = "\033[33m"
    BLUE    = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN    = "\033[36m"
    WHITE   = "\033[37m"

    BG_GREEN  = "\033[42m"
    BG_RED    = "\033[41m"
    BG_YELLOW = "\033[43m"
    BG_BLUE   = "\033[44m"
    BG_CYAN   = "\033[46m"
    BG_MAGENTA = "\033[45m"

    BRIGHT_GREEN  = "\033[92m"
    BRIGHT_RED    = "\033[91m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_CYAN   = "\033[96m"
    BRIGHT_BLUE   = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_WHITE  = "\033[97m"


def banner():
    """Print the startup banner."""
    print(f"""
{C.BRIGHT_CYAN}{C.BOLD}
    ██╗███╗   ██╗██████╗ ███████╗██╗  ██╗███╗   ██╗ ██████╗ ██╗    ██╗
    ██║████╗  ██║██╔══██╗██╔════╝╚██╗██╔╝████╗  ██║██╔═══██╗██║    ██║
    ██║██╔██╗ ██║██║  ██║█████╗   ╚███╔╝ ██╔██╗ ██║██║   ██║██║ █╗ ██║
    ██║██║╚██╗██║██║  ██║██╔══╝   ██╔██╗ ██║╚██╗██║██║   ██║██║███╗██║
    ██║██║ ╚████║██████╔╝███████╗██╔╝ ██╗██║ ╚████║╚██████╔╝╚███╔███╔╝
    ╚═╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝  ╚══╝╚══╝
{C.RESET}
{C.DIM}    ─────────────────────────────────────────────────────────────────{C.RESET}
{C.BRIGHT_MAGENTA}    ⚡  Bulk URL Submission Tool  │  Search Engine Instant Indexing{C.RESET}
{C.DIM}    ─────────────────────────────────────────────────────────────────{C.RESET}
""")


def parse_sitemap(path):
    """Parse sitemap.xml and return a list of (url, priority, lastmod) tuples."""
    tree = ET.parse(path)
    root = tree.getroot()
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

    urls = []
    for url_elem in root.findall("sm:url", ns):
        loc = url_elem.find("sm:loc", ns)
        priority = url_elem.find("sm:priority", ns)
        lastmod = url_elem.find("sm:lastmod", ns)
        changefreq = url_elem.find("sm:changefreq", ns)

        if loc is not None and loc.text:
            urls.append({
                "url": loc.text.strip(),
                "priority": priority.text.strip() if priority is not None else "—",
                "lastmod": lastmod.text.strip() if lastmod is not None else "—",
                "changefreq": changefreq.text.strip() if changefreq is not None else "—",
            })
    return urls


def priority_color(p):
    """Return a color based on priority value."""
    try:
        val = float(p)
    except (ValueError, TypeError):
        return C.DIM
    if val >= 0.9:
        return C.BRIGHT_GREEN
    elif val >= 0.7:
        return C.BRIGHT_CYAN
    elif val >= 0.5:
        return C.YELLOW
    else:
        return C.DIM


def status_badge(code):
    """Return a styled badge for HTTP status codes."""
    if code in (200, 202):
        return f"{C.BG_GREEN}{C.BLACK}{C.BOLD} ✓ {code} {C.RESET}"
    elif code == 429:
        return f"{C.BG_YELLOW}{C.BLACK}{C.BOLD} ⏳ {code} {C.RESET}"
    elif code in (400, 403, 422):
        return f"{C.BG_RED}{C.WHITE}{C.BOLD} ✗ {code} {C.RESET}"
    else:
        return f"{C.BG_MAGENTA}{C.WHITE}{C.BOLD} ? {code} {C.RESET}"


def status_meaning(code):
    """Return a human-readable meaning for the status code."""
    meanings = {
        200: "URL submitted successfully",
        202: "URL accepted for processing",
        400: "Bad request — invalid format",
        403: "Forbidden — key not valid for this URL",
        422: "Unprocessable — URL doesn't belong to host",
        429: "Too many requests — rate limited",
    }
    return meanings.get(code, f"Unexpected response ({code})")


def submit_urls_bulk(urls_data):
    """Submit all URLs in a single bulk request to IndexNow API."""
    url_list = [u["url"] for u in urls_data]

    payload = {
        "host": HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": url_list
    }

    headers = {
        "Content-Type": "application/json; charset=utf-8"
    }

    print(f"\n{C.BRIGHT_CYAN}{'─' * 70}{C.RESET}")
    print(f"{C.BOLD}{C.BRIGHT_WHITE}  📡  Submitting {len(url_list)} URLs via Bulk API...{C.RESET}")
    print(f"{C.BRIGHT_CYAN}{'─' * 70}{C.RESET}\n")

    start_time = time.time()

    try:
        response = requests.post(INDEXNOW_API, json=payload, headers=headers, timeout=30)
        elapsed = time.time() - start_time
        status_code = response.status_code
    except requests.exceptions.RequestException as e:
        elapsed = time.time() - start_time
        print(f"  {C.BRIGHT_RED}✗ Request failed: {e}{C.RESET}\n")
        return None, elapsed

    return status_code, elapsed


def submit_urls_individual(urls_data):
    """Submit URLs one by one as a fallback, returning per-URL results."""
    results = []  # list of (url, status_code, elapsed)

    print(f"\n{C.BRIGHT_CYAN}{'─' * 70}{C.RESET}")
    print(f"{C.BOLD}{C.BRIGHT_WHITE}  📡  Submitting {len(urls_data)} URLs individually...{C.RESET}")
    print(f"{C.BRIGHT_CYAN}{'─' * 70}{C.RESET}\n")

    for i, entry in enumerate(urls_data, 1):
        url = entry["url"]
        path_part = url.replace(f"https://{HOST}", "") or "/"

        params = {
            "url": url,
            "key": INDEXNOW_KEY,
            "keyLocation": KEY_LOCATION,
        }

        start = time.time()
        try:
            resp = requests.get(INDEXNOW_API, params=params, timeout=15)
            code = resp.status_code
        except requests.exceptions.RequestException:
            code = 0
        elapsed = time.time() - start

        results.append((url, code, elapsed))

        # Progress line
        pct = int((i / len(urls_data)) * 100)
        bar_filled = int(pct / 4)
        bar_empty = 25 - bar_filled
        bar = f"{C.BRIGHT_GREEN}{'█' * bar_filled}{C.DIM}{'░' * bar_empty}{C.RESET}"

        if code in (200, 202):
            icon = f"{C.BRIGHT_GREEN}✓{C.RESET}"
        elif code == 429:
            icon = f"{C.BRIGHT_YELLOW}⏳{C.RESET}"
        elif code == 0:
            icon = f"{C.BRIGHT_RED}✗{C.RESET}"
        else:
            icon = f"{C.BRIGHT_RED}✗{C.RESET}"

        print(f"  {icon} {C.DIM}[{i:02d}/{len(urls_data):02d}]{C.RESET} {bar} {pct:>3}%  {status_badge(code) if code else f'{C.BG_RED}{C.WHITE}{C.BOLD} ERR {C.RESET}'}  {C.CYAN}{path_part}{C.RESET}")

        # Small delay to avoid rate-limiting
        if i < len(urls_data):
            time.sleep(0.3)

    return results


def print_url_table(urls_data):
    """Print a formatted table of all URLs found in the sitemap."""
    print(f"\n{C.BRIGHT_BLUE}{'─' * 70}{C.RESET}")
    print(f"{C.BOLD}{C.BRIGHT_WHITE}  📋  URLs Found in Sitemap ({len(urls_data)} total){C.RESET}")
    print(f"{C.BRIGHT_BLUE}{'─' * 70}{C.RESET}\n")

    print(f"  {C.BOLD}{C.UNDERLINE}{'#':>3}  {'URL Path':<42} {'Priority':>8}  {'Freq':<9}  {'Modified'}{C.RESET}")
    print(f"  {C.DIM}{'─' * 66}{C.RESET}")

    for i, entry in enumerate(urls_data, 1):
        path = entry["url"].replace(f"https://{HOST}", "") or "/"
        p = entry["priority"]
        pc = priority_color(p)

        # Truncate long paths
        display_path = path if len(path) <= 40 else path[:37] + "..."

        print(f"  {C.DIM}{i:>3}{C.RESET}  {C.BRIGHT_WHITE}{display_path:<42}{C.RESET} {pc}{p:>8}{C.RESET}  {C.DIM}{entry['changefreq']:<9}{C.RESET}  {C.DIM}{entry['lastmod']}{C.RESET}")

    print()


def print_report(urls_data, bulk_code, bulk_elapsed, individual_results=None):
    """Print the final summary report."""
    total = len(urls_data)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print(f"\n{C.BRIGHT_MAGENTA}{'═' * 70}{C.RESET}")
    print(f"{C.BOLD}{C.BRIGHT_WHITE}  📊  INDEXNOW SUBMISSION REPORT{C.RESET}")
    print(f"{C.BRIGHT_MAGENTA}{'═' * 70}{C.RESET}\n")

    # ── Summary Stats ──
    if bulk_code is not None:
        # Bulk submission mode
        if bulk_code in (200, 202):
            success = total
            failed = 0
            rate_limited = 0
            status_text = f"{C.BRIGHT_GREEN}✓ ALL URLS ACCEPTED{C.RESET}"
        elif bulk_code == 429:
            success = 0
            failed = 0
            rate_limited = total
            status_text = f"{C.BRIGHT_YELLOW}⏳ RATE LIMITED{C.RESET}"
        else:
            success = 0
            failed = total
            rate_limited = 0
            status_text = f"{C.BRIGHT_RED}✗ SUBMISSION FAILED (HTTP {bulk_code}){C.RESET}"

        elapsed = bulk_elapsed
    elif individual_results:
        # Individual submission mode
        success = sum(1 for _, c, _ in individual_results if c in (200, 202))
        failed = sum(1 for _, c, _ in individual_results if c not in (200, 202, 429) or c == 0)
        rate_limited = sum(1 for _, c, _ in individual_results if c == 429)
        elapsed = sum(e for _, _, e in individual_results)

        if success == total:
            status_text = f"{C.BRIGHT_GREEN}✓ ALL URLS INDEXED{C.RESET}"
        elif success > 0:
            status_text = f"{C.BRIGHT_YELLOW}⚠ PARTIAL SUCCESS{C.RESET}"
        else:
            status_text = f"{C.BRIGHT_RED}✗ SUBMISSION FAILED{C.RESET}"
    else:
        success = 0
        failed = total
        rate_limited = 0
        elapsed = 0
        status_text = f"{C.BRIGHT_RED}✗ ERROR{C.RESET}"

    # Success rate
    rate = (success / total * 100) if total > 0 else 0

    # Stats box
    print(f"  {C.BOLD}┌──────────────────────────────────────────────────────────────┐{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_WHITE}Status:{C.RESET}      {status_text:<50}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_WHITE}Timestamp:{C.RESET}   {C.CYAN}{now}{C.RESET}{' ' * (38 - len(now))}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_WHITE}Host:{C.RESET}        {C.CYAN}{HOST}{C.RESET}{' ' * (38 - len(HOST))}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_WHITE}API Key:{C.RESET}     {C.DIM}{INDEXNOW_KEY[:8]}...{INDEXNOW_KEY[-8:]}{C.RESET}{' ' * 19}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}├──────────────────────────────────────────────────────────────┤{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_WHITE}Total URLs:{C.RESET}  {C.BOLD}{C.BRIGHT_WHITE}{total}{C.RESET}{' ' * (39 - len(str(total)))}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_GREEN}✓ Indexed:{C.RESET}   {C.BRIGHT_GREEN}{success}{C.RESET}{' ' * (39 - len(str(success)))}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_RED}✗ Failed:{C.RESET}    {C.BRIGHT_RED}{failed}{C.RESET}{' ' * (39 - len(str(failed)))}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_YELLOW}⏳ Throttled:{C.RESET} {C.BRIGHT_YELLOW}{rate_limited}{C.RESET}{' ' * (39 - len(str(rate_limited)))}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}├──────────────────────────────────────────────────────────────┤{C.RESET}")

    # Success rate bar
    bar_width = 30
    filled = int(rate / 100 * bar_width)
    empty = bar_width - filled

    if rate >= 80:
        bar_color = C.BRIGHT_GREEN
    elif rate >= 50:
        bar_color = C.BRIGHT_YELLOW
    else:
        bar_color = C.BRIGHT_RED

    bar = f"{bar_color}{'█' * filled}{C.DIM}{'░' * empty}{C.RESET}"
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_WHITE}Success:{C.RESET}     {bar} {bar_color}{rate:.1f}%{C.RESET}{' ' * 6}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}│{C.RESET}  {C.BRIGHT_WHITE}Duration:{C.RESET}    {C.CYAN}{elapsed:.2f}s{C.RESET}{' ' * (38 - len(f'{elapsed:.2f}s'))}{C.BOLD}│{C.RESET}")
    print(f"  {C.BOLD}└──────────────────────────────────────────────────────────────┘{C.RESET}")

    # ── Search engines that will be notified ──
    print(f"\n  {C.BOLD}{C.BRIGHT_WHITE}🔍 Search Engines Notified via IndexNow:{C.RESET}")
    engines = ["Bing (Microsoft)", "Yandex", "Seznam", "Naver"]
    for eng in engines:
        print(f"     {C.BRIGHT_GREEN}●{C.RESET} {eng}")

    # ── Key file location ──
    print(f"\n  {C.BOLD}{C.BRIGHT_WHITE}🔑 Key Verification:{C.RESET}")
    print(f"     {C.CYAN}{KEY_LOCATION}{C.RESET}")

    print(f"\n{C.BRIGHT_MAGENTA}{'═' * 70}{C.RESET}")
    print(f"{C.DIM}  IndexNow allows instant URL indexing. Results may take a few minutes")
    print(f"  to reflect in search engine dashboards.{C.RESET}")
    print(f"{C.BRIGHT_MAGENTA}{'═' * 70}{C.RESET}\n")


def main():
    """Main entry point."""
    banner()

    # ── Step 1: Parse sitemap ──
    print(f"  {C.BRIGHT_WHITE}📂 Reading sitemap:{C.RESET} {C.CYAN}{SITEMAP_PATH}{C.RESET}")

    if not os.path.exists(SITEMAP_PATH):
        print(f"\n  {C.BRIGHT_RED}✗ Sitemap not found at:{C.RESET} {SITEMAP_PATH}")
        sys.exit(1)

    urls_data = parse_sitemap(SITEMAP_PATH)

    if not urls_data:
        print(f"\n  {C.BRIGHT_RED}✗ No URLs found in sitemap.{C.RESET}")
        sys.exit(1)

    print(f"  {C.BRIGHT_GREEN}✓ Found {len(urls_data)} URLs{C.RESET}")

    # ── Step 2: Show URL table ──
    print_url_table(urls_data)

    # ── Step 3: Submit via Bulk API ──
    bulk_code, bulk_elapsed = submit_urls_bulk(urls_data)

    if bulk_code is not None:
        # Show bulk result
        print(f"\n  {C.BOLD}Bulk API Response:{C.RESET} {status_badge(bulk_code)}  {C.DIM}{status_meaning(bulk_code)}{C.RESET}")
        print(f"  {C.DIM}Response time: {bulk_elapsed:.2f}s{C.RESET}")

        # If bulk succeeded, print report
        print_report(urls_data, bulk_code, bulk_elapsed)

        # If bulk was rate-limited or failed, fall back to individual
        if bulk_code not in (200, 202):
            print(f"\n  {C.BRIGHT_YELLOW}⚠ Bulk request returned {bulk_code}. Falling back to individual submissions...{C.RESET}")
            individual_results = submit_urls_individual(urls_data)
            print_report(urls_data, None, 0, individual_results)
    else:
        # Bulk request itself failed, try individual
        print(f"\n  {C.BRIGHT_YELLOW}⚠ Bulk request failed. Falling back to individual submissions...{C.RESET}")
        individual_results = submit_urls_individual(urls_data)
        print_report(urls_data, None, 0, individual_results)


if __name__ == "__main__":
    main()
