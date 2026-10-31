#!/usr/bin/env python3
"""SEO and AEO (answer-engine) tags for the public pages of the TrustGap website.

Run from the repo root after changing a page's title, description, FAQ or team:

    python3 tools/seo.py

For every public page it (re)writes, between <!-- seo:start --> and <!-- seo:end -->:
  - the canonical address and Open Graph / Twitter tags (link previews on WhatsApp, X, LinkedIn)
  - JSON-LD structured data: the organisation, the website, the page, its breadcrumb, and where it
    applies the FAQ (faq.html), the how-it-works steps (how.html) and the team (about.html)
and, between <!-- seo:links:start --> and <!-- seo:links:end -->, a plain list of links to the other
pages. The menu is drawn by JavaScript, which AI crawlers don't run; this list lets them find every page
(the site's script removes it in browsers, where the normal menu shows).
It also rewrites sitemap.xml. Running it again replaces its own blocks; nothing is duplicated.

Private pages (marked noindex, such as the deal link pay.html) stay out of search, but they are shared in
chats, so they get the link-preview tags only: no canonical address, no structured data.
"""
import html
import json
import re
from datetime import date
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / 'docs'
BASE = 'https://trustgap-co.github.io/'
TODAY = date.today().isoformat()
OG_IMAGE = BASE + 'assets/images/og-image.png?v=2'  # bump when the image changes: WhatsApp caches by address
ORG_ID, SITE_ID = BASE + '#org', BASE + '#website'

# Company details come from the same file the website uses.
site_info = (DOCS / 'assets/js/site-info.js').read_text(encoding='utf-8')
SITE = dict(re.findall(r"^\s*(\w+):\s*'([^']*)'", site_info, re.M))

# path → (better title or None to keep, breadcrumb label, sitemap priority)
PAGES = {
    'index.html': ('TrustGap: safe payments for WhatsApp & Instagram deals in Nigeria', None, '1.0'),
    'how.html': (None, 'How it works', '0.9'),
    'buyers.html': ('Buy safely from WhatsApp & Instagram sellers in Nigeria · TrustGap', 'For buyers', '0.9'),
    'sellers.html': ('Sell on WhatsApp & Instagram with payment secured before dispatch · TrustGap', 'For sellers', '0.9'),
    'fees.html': ('TrustGap fees: 1.5% protection fee and calculator · TrustGap', 'Fees', '0.8'),
    'faq.html': ('TrustGap FAQ: safe payments for WhatsApp & Instagram deals in Nigeria', 'FAQ', '0.9'),
    'about.html': (None, 'About', '0.8'),
    'survey.html': (None, 'Survey', '0.6'),
    'early-access.html': (None, 'Early access', '0.7'),
    'legal/index.html': (None, 'Policies', '0.5'),
}
for f in sorted((DOCS / 'legal').glob('*.html')):
    rel = f'legal/{f.name}'
    if rel not in PAGES:
        PAGES[rel] = (None, None, '0.4')

LINKS = [('index.html', 'Home'), ('how.html', 'How TrustGap works'), ('buyers.html', 'For buyers'),
         ('sellers.html', 'For sellers'), ('fees.html', 'Fees'), ('faq.html', 'FAQ'), ('about.html', 'About TrustGap'),
         ('early-access.html', 'Get early access'), ('survey.html', 'Survey'), ('legal/index.html', 'Policies'),
         ('legal/terms.html', 'Terms of Service'), ('legal/privacy.html', 'Privacy Policy'),
         ('legal/disputes.html', 'Returns, refunds and disputes')]

ORG = {
    '@type': 'Organization', '@id': ORG_ID, 'name': 'TrustGap', 'url': BASE,
    'legalName': SITE.get('legalName', ''), 'logo': BASE + 'assets/favicon.png', 'image': OG_IMAGE,
    'slogan': 'Agree. Secure. Deliver. Inspect. Release.',
    'description': ('TrustGap is a Nigerian payment-protection service for deals made on WhatsApp, Instagram and other '
                    'social platforms. The buyer’s payment is secured before the seller dispatches, the item is delivered '
                    'by a courier, the buyer confirms with a private PIN and gets an inspection window, and the seller is '
                    'paid when the agreed release condition is met.'),
    'areaServed': {'@type': 'Country', 'name': 'Nigeria'},
    'founder': {'@id': BASE + 'about.html#alajayibo-mystery'},
    'knowsAbout': ['social commerce', 'buyer protection', 'seller protection', 'online payment safety in Nigeria',
                   'WhatsApp and Instagram selling'],
}
WEBSITE = {'@type': 'WebSite', '@id': SITE_ID, 'url': BASE, 'name': 'TrustGap', 'inLanguage': 'en-NG', 'publisher': {'@id': ORG_ID}}
SERVICE = {
    '@type': 'Service', '@id': BASE + '#service', 'name': 'TrustGap protected deal link',
    'serviceType': 'Payment protection for social-commerce deals', 'provider': {'@id': ORG_ID},
    'areaServed': {'@type': 'Country', 'name': 'Nigeria'}, 'audience': {'@type': 'Audience', 'audienceType': 'Buyers and sellers on WhatsApp and Instagram'},
    'description': ('One link per deal: the buyer reviews the item, photos, delivery address and every fee, pays, and the '
                    'seller is paid only after delivery with the buyer’s PIN and an inspection window. Published dispute, '
                    'return and refund rules.'),
    'offers': {'@type': 'Offer', 'priceCurrency': 'NGN', 'description':
               'TrustGap fee: 1.5% of the item price up to ₦200,000, then 1% (minimum ₦100, maximum ₦15,000). Payment processing is passed on at cost (capped at ₦2,000 plus the payout fee). Buyer and seller choose who pays.'},
}


def text(fragment):
    """Visible text of an HTML fragment, with data-site placeholders filled from site-info.js."""
    fragment = re.sub(r'<span data-site="(\w+)"></span>', lambda m: SITE.get(m.group(1), ''), fragment)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', fragment))).strip()


def meta(page, name):
    m = re.search(rf'<meta name="{name}" content="([^"]*)">', page)
    return html.unescape(m.group(1)) if m else ''


def faq_entities(page):
    out = []
    for q, a in re.findall(r'<details><summary>(.*?)</summary><p>(.*?)</p></details>', page, re.S):
        q, a = text(q), text(a)
        if '[' in q + a:  # an answer that still has an unfilled [PLACEHOLDER] would be wrong in search results
            continue
        out.append({'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}})
    return out


def howto(page):
    steps = re.findall(r'<li><h3>\d+\.\s*(.*?)</h3>\s*<p>(.*?)</p></li>', page, re.S)
    return {'@type': 'HowTo', 'name': 'How a TrustGap protected deal works', 'inLanguage': 'en-NG',
            'step': [{'@type': 'HowToStep', 'position': i + 1, 'name': text(n), 'text': text(t)} for i, (n, t) in enumerate(steps)]}


def team(page):
    pattern = (r'<article class="person">\s*<img src="([^"]*?/([\w-]+)\.png)"[^>]*>.*?<h3>(.*?)</h3>\s*'
               r'<p class="person-role">(.*?)</p>\s*<p>(.*?)</p>.*?<a class="person-link" href="([^"]+)"')
    people = []
    for img, slug, name, role, bio, link in re.findall(pattern, page, re.S):
        person = {'@type': 'Person', '@id': BASE + f'about.html#{slug}', 'name': text(name), 'jobTitle': text(role),
                  'description': text(bio), 'image': BASE + img, 'worksFor': {'@id': ORG_ID}, 'sameAs': [link]}
        if slug == 'alajayibo-mystery':
            person['sameAs'].append('https://tubalcainmy.github.io/alajayibomystery/')
            person['address'] = {'@type': 'PostalAddress', 'addressLocality': 'Warri', 'addressCountry': 'NG'}
        people.append(person)
    return people


def head_block(rel, page, title, desc):
    url = BASE if rel == 'index.html' else BASE + rel
    crumbs = [{'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': BASE}]
    if rel.startswith('legal/') and rel != 'legal/index.html':
        crumbs.append({'@type': 'ListItem', 'position': 2, 'name': 'Policies', 'item': BASE + 'legal/index.html'})
    if rel != 'index.html':
        crumbs.append({'@type': 'ListItem', 'position': len(crumbs) + 1, 'name': PAGES[rel][1] or title.split(' · ')[0], 'item': url})
    page_type = {'faq.html': 'FAQPage', 'about.html': 'AboutPage'}.get(rel, 'WebPage')
    webpage = {'@type': page_type, '@id': url + '#webpage', 'url': url, 'name': title, 'description': desc,
               'isPartOf': {'@id': SITE_ID}, 'about': {'@id': ORG_ID}, 'inLanguage': 'en-NG', 'dateModified': TODAY,
               'primaryImageOfPage': OG_IMAGE, 'breadcrumb': {'@type': 'BreadcrumbList', 'itemListElement': crumbs}}
    graph = [ORG, WEBSITE] if rel == 'index.html' else [{'@type': 'Organization', '@id': ORG_ID, 'name': 'TrustGap', 'url': BASE}]
    if rel == 'index.html':
        graph.append(SERVICE)
    if page_type == 'FAQPage':
        webpage['mainEntity'] = faq_entities(page)
    if rel == 'how.html':
        graph.append(howto(page))
    if rel == 'about.html':
        people = team(page)
        graph[0] = ORG | {'employee': [{'@id': p['@id']} for p in people]}
        graph += people
    graph.append(webpage)
    e = lambda s: html.escape(s, quote=True)
    return '\n'.join([
        '  <!-- seo:start (written by tools/seo.py) -->',
        f'  <link rel="canonical" href="{url}">',
        '  <meta property="og:site_name" content="TrustGap">',
        '  <meta property="og:type" content="website">',
        '  <meta property="og:locale" content="en_NG">',
        f'  <meta property="og:url" content="{url}">',
        f'  <meta property="og:title" content="{e(title)}">',
        f'  <meta property="og:description" content="{e(desc)}">',
        f'  <meta property="og:image" content="{OG_IMAGE}">',
        '  <meta property="og:image:width" content="1200">',
        '  <meta property="og:image:height" content="630">',
        '  <meta property="og:image:alt" content="TrustGap: buy from social sellers without the trust wahala.">',
        '  <meta name="twitter:card" content="summary_large_image">',
        f'  <meta name="twitter:title" content="{e(title)}">',
        f'  <meta name="twitter:description" content="{e(desc)}">',
        f'  <meta name="twitter:image" content="{OG_IMAGE}">',
        '  <script type="application/ld+json">',
        json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, indent=1).replace('</', '<\\/'),
        '  </script>',
        '  <!-- seo:end -->',
    ])


# Link previews for private pages, which people share in chats. The preview shows these words, not the
# page's own title, because WhatsApp and Instagram read the page before its script fills in the deal.
PREVIEWS = {
    'pay.html': ('Your TrustGap payment link',
                 'Check the item, delivery address and total before you pay. The seller is paid only after you receive the item.'),
    'track.html': ('Track your TrustGap deal',
                   'Follow your payment and delivery, and report a problem before the inspection window ends.'),
    'rider.html': ('TrustGap delivery confirmation', 'Confirm a TrustGap delivery with the buyer\'s PIN.'),
}
PREVIEW_DESC = 'Payment protection for WhatsApp and Instagram deals in Nigeria.'


def preview_block(title, desc):
    e = lambda v: html.escape(v, quote=True)
    return '\n'.join([
        '  <!-- seo:start (written by tools/seo.py) -->',
        '  <meta property="og:site_name" content="TrustGap">',
        '  <meta property="og:type" content="website">',
        '  <meta property="og:locale" content="en_NG">',
        f'  <meta property="og:title" content="{e(title)}">',
        f'  <meta property="og:description" content="{e(desc)}">',
        f'  <meta property="og:image" content="{OG_IMAGE}">',
        '  <meta property="og:image:width" content="1200">',
        '  <meta property="og:image:height" content="630">',
        '  <meta property="og:image:alt" content="TrustGap: buy from social sellers without the trust wahala.">',
        '  <meta name="twitter:card" content="summary_large_image">',
        f'  <meta name="twitter:title" content="{e(title)}">',
        f'  <meta name="twitter:description" content="{e(desc)}">',
        f'  <meta name="twitter:image" content="{OG_IMAGE}">',
        '  <!-- seo:end -->',
    ])


def links_block(rel):
    up = '../' * rel.count('/')
    items = ''.join(f'<a href="{up}{href}">{label}</a>' for href, label in LINKS if href != rel)
    return f'<!-- seo:links:start --><nav class="static-links" aria-label="TrustGap pages">{items}</nav><!-- seo:links:end -->'


for rel, (new_title, _, _) in PAGES.items():
    path = DOCS / rel
    page = path.read_text(encoding='utf-8')
    page = re.sub(r'\s*<!-- seo:start.*?<!-- seo:end -->', '', page, flags=re.S)
    page = re.sub(r'<!-- seo:links:start -->.*?<!-- seo:links:end -->\n?', '', page, flags=re.S)
    page = re.sub(r'\s*<meta (?:property="og:[^"]+"|name="twitter:[^"]+") content="[^"]*">', '', page)
    if new_title:
        page = re.sub(r'<title>[^<]*</title>', f'<title>{html.escape(new_title, quote=False)}</title>', page, count=1)
    title = html.unescape(re.search(r'<title>([^<]*)</title>', page).group(1))
    desc = meta(page, 'description')
    page = page.replace('<meta name="theme-color"', head_block(rel, page, title, desc) + '\n  <meta name="theme-color"', 1)
    page = page.replace('</main>', '</main>\n' + links_block(rel), 1)
    path.write_text(page, encoding='utf-8')

private = 0
for path in sorted(DOCS.rglob('*.html')):
    rel = path.relative_to(DOCS).as_posix()
    page = path.read_text(encoding='utf-8')
    if rel in PAGES or 'name="robots" content="noindex"' not in page:
        continue
    page = re.sub(r'\s*<!-- seo:start.*?<!-- seo:end -->', '', page, flags=re.S)
    own = html.unescape(re.search(r'<title>([^<]*)</title>', page).group(1))
    title, desc = PREVIEWS.get(rel, (own, PREVIEW_DESC))
    page = page.replace('<meta name="theme-color"', preview_block(title, desc) + '\n  <meta name="theme-color"', 1)
    path.write_text(page, encoding='utf-8')
    private += 1

urls = ''.join(f'  <url><loc>{BASE if rel == "index.html" else BASE + rel}</loc><lastmod>{TODAY}</lastmod><priority>{p}</priority></url>\n'
               for rel, (_, _, p) in PAGES.items())
(DOCS / 'sitemap.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n', encoding='utf-8')
print(f'updated {len(PAGES)} pages, link previews on {private} private pages, and sitemap.xml')
