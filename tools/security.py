#!/usr/bin/env python3
"""Browser protections for every page of the website (GitHub Pages can't send security headers, so
they go in each page's <head>). Run from the repo root after adding a page or changing API_URL:

    python3 tools/security.py

Between <!-- security:start --> and <!-- security:end --> it writes:
  - a Content Security Policy: scripts only from the site itself, Google Analytics and the Meta Pixel;
    connections only to the site, the TrustGap API (API_URL in docs/assets/js/config.js) and analytics;
    no plugins, no frames, forms post only to the site.
  - a referrer rule: private pages (payment, tracking, rider, seller, admin, team: the ones marked
    noindex) send no referrer at all; public pages send only the site's address to other sites.
The frame guard (pages never run inside another site's frame) is in docs/assets/js/core.js.
Running it again replaces its own block; nothing is duplicated.
"""
import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / 'docs'
config = (DOCS / 'assets/js/config.js').read_text(encoding='utf-8')
api = re.findall(r"'(https://[^']+)'", config)
API = ' '.join(sorted(set(a.rstrip('/') for a in api)))

CSP = '; '.join([
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com https://connect.facebook.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https: http://localhost:8787",
    f"connect-src 'self' {API} http://localhost:8787 https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.facebook.com",
    "media-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
])

count = 0
for path in sorted(DOCS.rglob('*.html')):
    page = path.read_text(encoding='utf-8')
    page = re.sub(r'\n?[ \t]*<!-- security:start.*?<!-- security:end -->', '', page, flags=re.S)
    private = 'name="robots" content="noindex"' in page
    block = '\n'.join([
        '  <!-- security:start (written by tools/security.py) -->',
        f'  <meta http-equiv="Content-Security-Policy" content="{CSP}">',
        f'  <meta name="referrer" content="{"no-referrer" if private else "strict-origin-when-cross-origin"}">',
        '  <!-- security:end -->',
    ])
    page, n = re.subn(r'(<meta charset="utf-8">)', lambda m: m.group(1) + '\n' + block, page, count=1)
    if not n:
        raise SystemExit(f'{path}: no <meta charset="utf-8"> to put the protections after')
    path.write_text(page, encoding='utf-8')
    count += 1
print(f'protections written to {count} pages')
