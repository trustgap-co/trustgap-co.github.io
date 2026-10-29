// Google Analytics 4 + Meta Pixel, loaded only after the visitor accepts cookies, after the page has
// finished loading, and never on admin or rider pages. Set the IDs in site-info.js → tracking.
//
// Every event goes to GA4. Conversion events also go to Meta under its standard names (see META).
// Nothing personal is sent: no names, phones, emails, addresses, tokens or PINs.
// Debug: open any page with ?debug_tracking=1 to log every event in the browser console and in
// GA4 → Admin → DebugView. (It stays on for that browser until you visit with ?debug_tracking=0.)
import { SITE } from './site-info.js';

const CFG = SITE.tracking || {};
const GA_ID = /^G-[A-Z0-9]{6,}$/.test(CFG.ga4Id || '') && !/^G-X+$/.test(CFG.ga4Id) ? CFG.ga4Id : '';
const PIXEL_ID = /^\d{10,20}$/.test(CFG.metaPixelId || '') && !/^0+$/.test(CFG.metaPixelId) ? CFG.metaPixelId : '';
const CONSENT_KEY = 'tg_consent';
export const trackingConfigured = Boolean(GA_ID || PIXEL_ID);

// GA4 event → Meta standard event (or custom event, for names Meta doesn't have).
const META = {
  sign_up: 'CompleteRegistration',
  view_item: 'ViewContent',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
  contact_click: 'Contact',
  otp_requested: { custom: 'SignupStarted', only: (p) => p.flow === 'signup' },
  early_access_signup: 'Lead',
  survey_complete: { custom: 'SurveyCompleted' },
  deal_link_created: { custom: 'DealLinkCreated' },
  fee_calculator_used: { custom: 'FeeCalculatorUsed' },
};

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const qs = new URLSearchParams(location.search);
if (qs.has('debug_tracking')) store.set('tg_debug_tracking', qs.get('debug_tracking') === '1' ? '1' : '');
const DEBUG = store.get('tg_debug_tracking') === '1';

let enabled = false; // this page is tracked (not admin/rider)
let publicPage = false; // marketing pages: link texts and headings are safe to record
let loaded = false;
let queue = [];

// A visitor's own choice always wins. Without one: on by default unless requireConsent is true.
const consent = () => store.get(CONSENT_KEY) || (CFG.requireConsent === false ? 'granted' : null);

// ---------------------------------------------------------------- sending
// Last line of defence against personal data: quoted text (e.g. an account holder's name in an
// error), email addresses and long digit runs (phones, account numbers, NINs) are blanked out.
const scrubText = (v) => v.replace(/"[^"]*"|“[^”]*”/g, '"…"').replace(/\S+@\S+/g, '[email]').replace(/\+?\d[\d\s-]{5,}\d/g, '[number]');
const scrub = (v) => (typeof v === 'string' ? scrubText(v)
  : Array.isArray(v) ? v.map(scrub)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'transaction_id' || k === 'item_id' ? x : scrub(x)]))
  : v);

function send(name, rawParams = {}, { eventId } = {}) {
  const params = scrub(rawParams);
  if (DEBUG) console.info('[tracking]', name, params);
  if (GA_ID && window.gtag) window.gtag('event', name, { ...params, ...(DEBUG ? { debug_mode: true } : {}) });
  const meta = META[name];
  if (PIXEL_ID && window.fbq && meta && (!meta.only || meta.only(params))) {
    const p = metaParams(params);
    const opts = eventId ? { eventID: String(eventId) } : undefined;
    if (typeof meta === 'string') window.fbq('track', meta, p, opts);
    else window.fbq('trackCustom', meta.custom, p, opts);
  }
}

function metaParams(p) {
  const out = {};
  if (p.value != null) { out.value = p.value; out.currency = p.currency || 'NGN'; }
  if (p.items?.length) {
    out.content_type = 'product';
    out.content_name = p.items[0].item_name;
    out.content_category = p.items[0].item_category;
    out.contents = p.items.map((i) => ({ id: String(i.item_id), quantity: i.quantity || 1, item_price: i.price }));
    out.num_items = p.items.reduce((n, i) => n + (i.quantity || 1), 0);
  }
  for (const k of ['method', 'flow', 'delivery_payer', 'fee_payer', 'delivery_state', 'pickup_state']) if (p[k] != null) out[k] = p[k];
  return out;
}

/** Records an event. Safe to call any time: events wait until consent and loading, then flush. */
export function track(name, params = {}, opts = {}) {
  if (!enabled) return;
  if (!GA_ID && !PIXEL_ID) { if (DEBUG) console.info('[tracking] (IDs not set yet)', name, params); return; }
  if (loaded) return send(name, params, opts);
  if (queue.length < 100) queue.push([name, params, opts]);
  if (DEBUG) console.info('[tracking] waiting for cookie consent / page load:', name, params);
}

/** Same as track(), but gives the request a moment to leave before the page navigates away. */
export function trackThenGo(name, params, url, opts) {
  load(); // if the visitor already accepted but the tags were still waiting for idle time
  track(name, params, opts);
  const go = () => { location.href = url; };
  if (!loaded) return go();
  setTimeout(go, 350);
}

// ---------------------------------------------------------------- loading the tags
function addScript(src) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function load() {
  if (loaded || !enabled || consent() !== 'granted' || (!GA_ID && !PIXEL_ID)) return;
  loaded = true;
  const visitor = { visitor_type: safeGet('tg_seller') ? 'seller' : 'visitor', connection: navigator.connection?.effectiveType || 'unknown' };
  if (GA_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, {
      page_location: location.href, // private tokens are already removed from the address (core.js)
      user_properties: visitor,
      ...(DEBUG ? { debug_mode: true } : {}),
    });
    addScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  }
  if (PIXEL_ID) {
    const fbq = (window.fbq = function fbq() {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
    });
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    fbq('set', 'autoConfig', false, PIXEL_ID); // no automatic button/form scraping
    fbq('init', PIXEL_ID);
    fbq('track', 'PageView');
    addScript('https://connect.facebook.net/en_US/fbevents.js');
  }
  const pending = queue;
  queue = [];
  pending.forEach(([n, p, o]) => send(n, p, o));
}

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// Loads the tags once the page is idle, so they never slow down what the visitor sees first.
function loadWhenIdle() {
  const start = () => (window.requestIdleCallback ? requestIdleCallback(load, { timeout: 3000 }) : setTimeout(load, 1500));
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

// ---------------------------------------------------------------- cookie banner
function banner() {
  if (document.getElementById('consent')) return;
  const el = document.createElement('div');
  el.id = 'consent';
  el.className = 'consent';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Cookie choices');
  el.innerHTML = `<p>We use cookies to understand how people use TrustGap and to measure our adverts.
    Pages work the same either way. <a href="${new URL('../../legal/cookies.html', import.meta.url).href}">Cookie Policy</a></p>
    <div><button type="button" class="btn btn-small btn-secondary" data-consent="denied">No thanks</button>
    <button type="button" class="btn btn-small" data-consent="granted">Accept</button></div>`;
  el.addEventListener('click', (e) => {
    const choice = e.target.closest('[data-consent]')?.dataset.consent;
    if (!choice) return;
    store.set(CONSENT_KEY, choice);
    el.remove();
    if (choice === 'granted') load();
    else if (loaded) location.reload(); // already running: reload so they stop
    else queue = [];
  });
  document.body.appendChild(el);
}

/** Lets visitors change their answer (footer → "Cookie settings"). */
export function openCookieSettings() {
  banner();
}

// ---------------------------------------------------------------- automatic events
const textOf = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
// On seller and buyer pages, headings and links show deal details and buyers' names, so only
// generic labels are recorded there.
const sectionOf = (el) => {
  const s = el.closest('section, header, footer, nav, .card');
  if (!s) return 'page';
  if (s.matches('header, .top')) return 'header';
  if (s.matches('footer')) return 'footer';
  if (!publicPage) return s.id || 'content';
  return s.id || textOf(s.querySelector('h1, h2, .eyebrow')) || 'section';
};
const labelOf = (el) => el.dataset.trackLabel || el.getAttribute('aria-label') || (publicPage || el.classList.contains('btn') ? textOf(el) : '');

function autoEvents() {
  // Clicks on links and buttons.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('a, button, [data-track]');
    if (!el || el.closest('#consent')) return;
    if (el.dataset.track) {
      const extra = Object.fromEntries(Object.entries(el.dataset).filter(([k]) => k.startsWith('track') && k !== 'track')
        .map(([k, v]) => [k.slice(5).replace(/^./, (c) => c.toLowerCase()), v]));
      track(el.dataset.track, extra);
      return;
    }
    const where = sectionOf(el);
    const label = labelOf(el);
    if (el.tagName === 'A' && el.href) {
      const url = new URL(el.href, location.href);
      if (url.protocol === 'mailto:' || url.protocol === 'tel:') return track('contact_click', { method: url.protocol === 'tel:' ? 'phone' : 'email', link_location: where });
      if (url.hostname === 'wa.me' || url.hostname.endsWith('whatsapp.com')) return track('share', { method: 'whatsapp', content_type: where });
      if (url.origin !== location.origin) return track('outbound_click', { link_domain: url.hostname, link_text: label, link_location: where });
      const name = where === 'header' ? 'nav_click' : where === 'footer' ? 'footer_click' : el.classList.contains('btn') ? 'cta_click' : 'link_click';
      return track(name, { link_text: label, link_url: url.pathname, link_location: where });
    }
    if (el.tagName === 'BUTTON' && el.type === 'button' && !el.dataset.copy) track('button_click', { button_text: label, link_location: where });
  }, { capture: true });

  // FAQ / "details" panels opened.
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.tagName !== 'DETAILS' || !d.open) return;
    track(d.closest('.faq') ? 'faq_open' : 'details_open', { question: textOf(d.querySelector('summary')), link_location: sectionOf(d) });
  }, true);

  // How far down the page people get.
  const marks = [25, 50, 75, 100];
  let reached = 0;
  const onScroll = () => {
    const h = document.documentElement;
    const pct = ((h.scrollTop + innerHeight) / h.scrollHeight) * 100;
    while (reached < marks.length && pct >= marks[reached] - 1) track('scroll_depth', { percent: marks[reached++] });
    if (reached === marks.length) removeEventListener('scroll', onScroll);
  };
  addEventListener('scroll', onScroll, { passive: true });

  // Which sections are actually seen (each once per page view).
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      track('section_view', { section: sectionOf(en.target), section_index: [...en.target.parentNode.children].indexOf(en.target) });
    }), { threshold: 0.4 });
    document.querySelectorAll('main > section').forEach((s) => io.observe(s));
  }

  // Script errors (a few per page at most).
  let errors = 0;
  const err = (msg) => errors++ < 5 && track('exception', { description: String(msg).slice(0, 150), fatal: false });
  addEventListener('error', (e) => err(e.message));
  addEventListener('unhandledrejection', (e) => err(e.reason?.message || e.reason));

  webVitals();
}

// Real loading speed from visitors' phones: LCP, CLS, FCP, TTFB and slowest interaction (≈INP).
// Sent once when the page is hidden. Find them in GA4 as the "web_vitals" event.
function webVitals() {
  if (!('PerformanceObserver' in window)) return;
  const v = {};
  const obs = (type, cb) => { try { new PerformanceObserver((l) => l.getEntries().forEach(cb)).observe({ type, buffered: true }); } catch { /* unsupported */ } };
  obs('largest-contentful-paint', (e) => { v.LCP = e.startTime; });
  obs('paint', (e) => { if (e.name === 'first-contentful-paint') v.FCP = e.startTime; });
  obs('layout-shift', (e) => { if (!e.hadRecentInput) v.CLS = (v.CLS || 0) + e.value; });
  obs('event', (e) => { if (e.interactionId) v.INP = Math.max(v.INP || 0, e.duration); });
  const nav = performance.getEntriesByType?.('navigation')[0];
  if (nav) v.TTFB = nav.responseStart;
  const limits = { LCP: [2500, 4000], FCP: [1800, 3000], CLS: [0.1, 0.25], INP: [200, 500], TTFB: [800, 1800] };
  let sent = false;
  addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || sent) return;
    sent = true;
    for (const [metric, value] of Object.entries(v)) {
      const [good, poor] = limits[metric];
      track('web_vitals', {
        metric_name: metric,
        metric_value: metric === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value),
        metric_rating: value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor',
      });
    }
  });
}

/** Called once per page by shell(). `area` is public / buyer / seller / admin / team. */
export function initAnalytics(area) {
  const page = location.pathname.split('/').pop() || 'index.html';
  if (area === 'admin' || area === 'team' || page === 'rider.html') return; // staff and riders are not tracked
  publicPage = area === 'public';
  if (!GA_ID && !PIXEL_ID && !DEBUG) return;
  enabled = true;
  autoEvents();
  if (!GA_ID && !PIXEL_ID) return; // debug only: events are logged to the console
  const c = consent();
  if (c === 'granted') loadWhenIdle();
  else if (c !== 'denied') {
    if (document.readyState === 'complete') banner();
    else addEventListener('load', banner, { once: true });
  }
}

// Naira helpers for event values (the API works in kobo).
export const naira = (kobo) => Math.round(Number(kobo || 0)) / 100;
