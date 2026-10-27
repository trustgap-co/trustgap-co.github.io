// Shared helpers for every page: API calls, safe HTML, formatting, login tokens and the page shell.
import { API_URL as CONFIGURED_API_URL } from './config.js';
import { SITE } from './site-info.js';
import { initAnalytics, openCookieSettings, trackingConfigured, track, trackThenGo, naira } from './analytics.js';

export { track, trackThenGo, naira };

// Tolerates a trailing slash in config.js ("…workers.dev/" would otherwise give "//api/…").
const API_URL = CONFIGURED_API_URL.replace(/\/+$/, '');

export const ROOT = new URL('../../', import.meta.url).href; // the site root, wherever it is hosted
export const link = (path) => ROOT + path.replace(/^\//, '');
export const params = new URLSearchParams(location.search);
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------- safe HTML
// Everything interpolated into html`` is escaped unless it is itself html`` (or raw()).
class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}
export const raw = (s) => new SafeHtml(String(s));
export const escape = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const renderValue = (v) =>
  v == null || v === false ? '' : v instanceof SafeHtml ? v.value : Array.isArray(v) ? v.map(renderValue).join('') : escape(v);
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => (out += renderValue(v) + strings[i + 1]));
  return new SafeHtml(out);
}
export const show = (el, content) => {
  (typeof el === 'string' ? $(el) : el).innerHTML = String(content);
};

// ---------------------------------------------------------------- storage (can fail in private mode)
const safeStore = (store) => ({
  get: (k) => { try { return store.getItem(k); } catch { return null; } },
  set: (k, v) => { try { store.setItem(k, v); } catch { /* ignore */ } },
  del: (k) => { try { store.removeItem(k); } catch { /* ignore */ } },
});
export const local = safeStore(window.localStorage);
export const session = safeStore(window.sessionStorage);

// ---------------------------------------------------------------- private links
// The buyer's links carry secret tokens (pay.html?d=…, track.html?t=…; the tracking page shows the
// delivery PIN). Analytics tools record the page address, so the token is swapped for a short local
// key (?o=…) before any of them load. The key → token map stays on this device, so reloading and
// bookmarks keep working here; the link in the buyer's SMS works anywhere.
const PRIVATE_PARAM = { 'pay.html': 'd', 'track.html': 't' }[location.pathname.split('/').pop()];
if (PRIVATE_PARAM) {
  const token = params.get(PRIVATE_PARAM);
  if (token) {
    let h = 0x811c9dc5; // FNV-1a: a short, stable key for this token (not a secret)
    for (const ch of token) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const key = h.toString(36);
    try {
      localStorage.setItem(`tg_link_${key}`, token);
      history.replaceState(history.state, '', `${location.pathname}?o=${key}${location.hash}`);
    } catch { /* storage blocked: keep the token in the address so the page still works */ }
  } else if (params.get('o')) {
    params.set(PRIVATE_PARAM, local.get(`tg_link_${params.get('o')}`) || '');
  }
}

export const auth = {
  seller: () => local.get('tg_seller'),
  setSeller: (t) => local.set('tg_seller', t),
  admin: () => session.get('tg_admin'),
  setAdmin: (t) => session.set('tg_admin', t),
  clear: () => { local.del('tg_seller'); session.del('tg_admin'); },
};

// ---------------------------------------------------------------- API
export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, as } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = as === 'seller' ? auth.seller() : as === 'admin' ? auth.admin() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Network problem. Check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && as) {
    if (as === 'seller') { local.del('tg_seller'); location.href = link(`seller/login.html?next=${encodeURIComponent(location.href)}`); }
    if (as === 'admin') { session.del('tg_admin'); location.href = link('admin/index.html'); }
    throw new ApiError('Please log in.', 401);
  }
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong.', res.status);
  return data;
}

// Site settings from the API. Kept for 10 minutes in this tab so later pages don't wait for it.
let configPromise;
export const getConfig = () => (configPromise ||= (() => {
  const cached = JSON.parse(session.get('tg_config') || 'null');
  const fresh = api('/api/config').then((c) => { session.set('tg_config', JSON.stringify({ at: Date.now(), c })); return c; });
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) { fresh.catch(() => {}); return Promise.resolve(cached.c); }
  return fresh.catch(() => cached?.c || { test_mode: false, zones: [] });
})());
export const getBanks = () => api('/api/banks').then((d) => d.banks);

// ---------------------------------------------------------------- formatting
export const money = (kobo) =>
  '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const date = (d) =>
  d ? new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

const ORDER_STATUS = {
  awaiting_payment: ['Awaiting payment', 'muted'],
  paid: ['Paid, money held', 'info'],
  shipping: ['On the way', 'info'],
  delivered: ['Delivered, inspection period', 'info'],
  disputed: ['Under review', 'warn'],
  completed: ['Completed', 'ok'],
  refunded: ['Refunded', 'muted'],
  cancelled: ['Cancelled', 'muted'],
  duplicate_refunded: ['Duplicate payment, refunded', 'muted'],
};
const DEAL_STATUS = {
  open: ['Open, waiting for buyer', 'info'],
  paid: ['Paid', 'ok'],
  expired: ['Expired', 'muted'],
  cancelled: ['Cancelled', 'muted'],
  replaced: ['Replaced by a new version', 'muted'],
};
const badge = ([label, tone]) => html`<span class="badge badge-${tone}">${label}</span>`;
export const orderBadge = (s) => badge(ORDER_STATUS[s] || [s, 'muted']);
export const dealBadge = (s) => badge(DEAL_STATUS[s] || [s, 'muted']);

const EVENT_LABELS = {
  terms_accepted: 'Buyer reviewed and accepted the deal terms',
  payment_failed: 'Payment attempt failed',
  payment_mismatch: 'Payment amount did not match, flagged',
  payment_received: 'Payment received and held by TrustGap',
  duplicate_payment_refunded: 'Duplicate payment refunded',
  pickup_booked: 'Seller packed the item and booked pickup',
  delivery_picked_up: 'Courier picked up the parcel',
  delivery_out_for_delivery: 'Out for delivery',
  delivery_attempt_failed: 'Delivery attempt failed',
  delivery_refused: 'Buyer refused the parcel at the door',
  delivery_returned: 'Parcel returned to seller',
  wrong_pin: 'Wrong delivery PIN entered',
  delivered_with_pin: 'Delivered: buyer gave the delivery PIN',
  dispute_opened: 'Problem reported, money held for review',
  dispute_resolved: 'Dispute decided',
  buyer_confirmed: 'Buyer confirmed everything is fine',
  auto_released: 'Inspection period ended, payment released',
  checkout_abandoned: 'Checkout expired without payment',
  transfer_failed: 'A bank transfer failed and will be retried',
};
export const timeline = (events, { detail = false } = {}) => html`<ol class="timeline">${events.map(
  (e) => html`<li><span class="t-time">${date(e.created_at)}</span><span class="t-label">${EVENT_LABELS[e.type] || e.type}</span>
    ${detail && e.detail ? html`<code class="t-detail">${e.detail}</code>` : ''}</li>`,
)}</ol>`;

// The seller's item photos as a swipeable strip; tapping one opens it full size.
export const gallery = (urls, label = 'Item') =>
  urls?.length
    ? html`<div class="gallery" role="list" aria-label="${label} photos">${urls.map((u, i) =>
      html`<a role="listitem" href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="${label}, photo ${i + 1} of ${urls.length}" decoding="async" ${i ? raw('loading="lazy"') : ''}></a>`)}</div>`
    : '';
// A pop-up asking the person to confirm something important. Resolves true only if they press the
// confirm button (Escape, the back button or "Go back" resolve false).
export function confirmModal({ title, body, confirm, cancel = 'Go back and check', tone = 'warn' }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `modal modal-${tone}`;
    dlg.innerHTML = String(html`<form method="dialog">
      <div class="modal-icon" aria-hidden="true">!</div>
      <h2>${title}</h2>
      <p>${body}</p>
      <button class="btn btn-block" value="yes">${confirm}</button>
      <button class="btn btn-block btn-secondary" value="no">${cancel}</button>
    </form>`);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'yes'); dlg.remove(); });
    dlg.showModal();
    dlg.querySelector('button[value=no]').focus(); // the safe choice has focus
  });
}

export const errorBox = (msg) => (msg ? html`<div class="error" role="alert">${msg}</div>` : '');
export const flash = {
  set: (m) => session.set('tg_flash', m),
  take: () => { const m = session.get('tg_flash'); session.del('tg_flash'); return m; },
};

// ---------------------------------------------------------------- forms
export const formData = (form) => Object.fromEntries(new FormData(form));

// Runs `handler(data)` on submit, disabling the button and showing errors inside the form.
export function onSubmit(form, handler) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || form.querySelector('button[type=submit], button:not([type])');
    const box = form.querySelector('.form-error') || form.insertBefore(Object.assign(document.createElement('div'), { className: 'form-error' }), form.firstChild);
    box.innerHTML = '';
    if (btn) btn.disabled = true;
    try {
      const data = formData(form);
      if (btn?.name) data[btn.name] = btn.value;
      await handler(data);
      track('form_success', { form_id: form.id || 'form' });
    } catch (err) {
      track('form_error', { form_id: form.id || 'form', error_message: String(err.message).slice(0, 100), error_status: err.status ?? 0 });
      box.innerHTML = String(errorBox(err.message));
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// A state box people can type in, with the 36 states + FCT as suggestions. The Worker accepts
// "lagos", "Lagos State", "Abuja" etc. and rejects anything that isn't a real state.
// Put statesList(states) once on the page; any number of stateInput()s can use it.
export const stateInput = (name, value, attrs = '') =>
  html`<input name="${name}" list="states-list" required autocomplete="off" placeholder="Start typing, e.g. Lagos" value="${value || ''}" ${raw(attrs)}>`;
export const statesList = (states) => html`<datalist id="states-list">${states.map((s) => html`<option value="${s}"></option>`)}</datalist>`;

export const bankOptions = (banks, selected) =>
  html`<option value="">Choose your bank</option>${banks.map((b) => html`<option value="${b.code}" ${b.code === selected ? 'selected' : ''}>${b.name}</option>`)}`;

// Which bank accounts work while testing: TrustGap's own simulator, or Flutterwave's test mode.
export const testAccountsHint = (config) =>
  config.test_mode && config.payment_provider === 'mock'
    ? html`<details class="hint"><summary>Test mode: use a test account number</summary><ul>
        <li>0000000001: Adebayo Oluwaseun John</li><li>0000000002: Chioma Ngozi Okafor</li>
        <li>0000000003: Musa Ibrahim Bello</li><li>0000000004: Funmilayo Grace Adeyemi</li>
        <li>0000000005: Emeka Peter Nwosu</li></ul><p>Pick any bank. The name must match.</p></details>`
    : config.payment_provider === 'flutterwave' && config.payment_test
      ? html`<details class="hint"><summary>Flutterwave test mode: use a Flutterwave test account</summary>
          <p>Real account numbers don’t work with test keys. Choose <strong>Access Bank</strong> and account
          <strong>0690000032</strong> (or 0690000031 to 0690000040). The name must match the account’s name:
          if it doesn’t, the message tells you the name Flutterwave has for it, so type that.</p></details>`
      : '';

// ---------------------------------------------------------------- page shell
const PUBLIC_NAV = [
  ['how.html', 'How it works'],
  ['buyers.html', 'For buyers'],
  ['sellers.html', 'For sellers'],
  ['fees.html', 'Fees'],
  ['faq.html', 'FAQ'],
];

const isPlaceholder = (v) => /^\[.*\]$/.test(String(v));

// Fills <span data-site="supportEmail"></span> etc. from site-info.js; unfilled values are highlighted.
function fillSiteInfo() {
  for (const el of $$('[data-site]')) {
    const value = SITE[el.dataset.site];
    if (value === undefined) continue;
    el.textContent = value;
    el.classList.toggle('ph', isPlaceholder(value));
  }
  if (SITE.policiesApproved) $$('.draft-notice').forEach((el) => el.remove());
  if (SITE.partnerNamesApproved) $$('.needs-partner-approval').forEach((el) => el.classList.remove('needs-partner-approval'));
}

// <figure class="img-slot" data-src="assets/images/x.png" data-alt="…" data-hint="…" data-size="1200×900">
// shows the photo once you add the file, or a labelled placeholder until then. Photos load only when
// they come near the screen, so phones don't download images nobody scrolls to.
function loadImages() {
  const slots = $$('.img-slot[data-src]');
  if (!('IntersectionObserver' in window)) return slots.forEach(loadImage);
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { io.unobserve(e.target); loadImage(e.target); }
  }), { rootMargin: '400px 0px' });
  slots.forEach((slot) => io.observe(slot));
}

function loadImage(slot) {
  {
    const src = link(slot.dataset.src);
    const img = new Image();
    img.alt = slot.dataset.alt || '';
    img.decoding = 'async'; // (not loading="lazy": a detached lazy image never starts loading)
    img.width = 1200;
    img.height = 900;
    img.onload = () => {
      slot.classList.add('has-img');
      slot.replaceChildren(img);
    };
    img.onerror = () => {
      slot.classList.add('missing');
      slot.innerHTML = String(html`<div class="img-ph"><strong>Image: ${slot.dataset.src.split('/').pop()}</strong>
        <span>${slot.dataset.hint || slot.dataset.alt || ''}</span><small>${slot.dataset.size || ''} · add it to docs/${slot.dataset.src}</small></div>`);
    };
    img.src = src;
  }
}

// Which campaign link brought this visitor (?source=instagram, utm_source, or the referring site),
// remembered from the page they land on so the survey and early-access forms can record it.
function rememberSource() {
  const q = new URLSearchParams(location.search);
  const tagged = q.get('source') || q.get('utm_source');
  const ref = document.referrer && new URL(document.referrer).hostname;
  if (tagged) local.set('tg_source', JSON.stringify({ source: tagged, medium: q.get('utm_medium') || '', campaign: q.get('utm_campaign') || '' }));
  else if (ref && ref !== location.hostname && !local.get('tg_source')) local.set('tg_source', JSON.stringify({ source: ref, medium: 'referral', campaign: '' }));
}

// Draws the header and footer straight away (no waiting for the API), then adds the test-mode bar
// when the settings arrive. Returns the settings.
export async function shell(area) {
  const configReady = getConfig();
  const here = location.pathname.split('/').pop() || 'index.html';
  const nav = {
    seller: html`<nav class="nav"><a href="${link('seller/dashboard.html')}">Dashboard</a><a href="${link('seller/new.html')}">New link</a>
      <a href="${link('seller/settings.html')}">Settings</a><button class="linklike" id="logout">Log out</button></nav>`,
    admin: auth.admin()
      ? html`<nav class="nav"><a href="${link('admin/orders.html')}">Orders</a><a href="${link('admin/disputes.html')}">Disputes</a>
        <a href="${link('admin/sellers.html')}">Sellers</a><a href="${link('admin/messages.html')}">Messages</a>
        <a href="${link('admin/ledger.html')}">Ledger</a><button class="linklike" id="logout">Log out</button></nav>`
      : '',
    buyer: html`<span class="protected">🔒 Protected deal</span>`,
    public: html`<button class="menu-btn" id="menu" aria-expanded="false" aria-controls="site-nav" aria-label="Menu"><span></span><span></span><span></span></button>
      <nav class="nav site-nav" id="site-nav">
        ${PUBLIC_NAV.map(([href, label]) => html`<a href="${link(href)}" class="${here === href ? 'on' : ''}">${label}</a>`)}
        ${SITE.launched
          ? html`<a href="${link('seller/login.html')}">Seller login</a>
            <a class="btn btn-small btn-light" href="${link('seller/signup.html')}">Sell with payment secured</a>`
          : html`<a href="${link('survey.html')}" class="${here === 'survey.html' ? 'on' : ''}">Take the survey</a>
            <a class="btn btn-small btn-light" href="${link('early-access.html')}">Get early access</a>`}
      </nav>`,
  }[area];
  document.body.insertAdjacentHTML('afterbegin', String(html`
    <a class="skip" href="#app">Skip to content</a>
    <header class="top"><div class="top-in"><a class="logo" href="${link('index.html')}" aria-label="TrustGap home">Trust<span>Gap</span></a>${nav}</div></header>`));
  document.body.insertAdjacentHTML('beforeend', String(html`<footer class="site-foot"><div class="container foot-grid">
    <div class="foot-brand"><a class="logo" href="${link('index.html')}">Trust<span>Gap</span></a>
      <p>The safe completion layer for social commerce in Nigeria: payment secured, item delivered, both sides know what happens next.</p></div>
    <div><h4>Product</h4>${PUBLIC_NAV.map(([href, label]) => html`<a href="${link(href)}">${label}</a>`)}
      ${SITE.launched ? html`<a href="${link('seller/signup.html')}">Create a seller account</a>`
        : html`<a href="${link('early-access.html')}">Get early access</a><a href="${link('survey.html')}">Take the survey</a>`}</div>
    <div><h4>Policies</h4>
      <a href="${link('legal/terms.html')}">Terms of Service</a><a href="${link('legal/privacy.html')}">Privacy Policy</a>
      <a href="${link('legal/data-protection.html')}">Data protection &amp; your rights</a><a href="${link('legal/delivery.html')}">Delivery Policy</a>
      <a href="${link('legal/disputes.html')}">Returns, refunds &amp; disputes</a><a href="${link('legal/fees.html')}">Fees &amp; payments</a>
      <a href="${link('legal/acceptable-use.html')}">Acceptable use &amp; prohibited items</a><a href="${link('legal/cookies.html')}">Cookie Policy</a>
      <a href="${link('legal/seller-terms.html')}">Seller terms</a><a href="${link('legal/partners.html')}">Partners &amp; responsibilities</a></div>
    <div><h4>Contact</h4><p>
      <span data-site="supportEmail"></span><br><span data-site="supportPhone"></span><br><span data-site="supportHours"></span><br>
      <span data-site="registeredAddress"></span></p></div>
  </div><div class="container foot-bottom">© ${new Date().getFullYear()} TrustGap, a trading name of <span data-site="legalName"></span> · RC <span data-site="rcNumber"></span>.
    TrustGap is not a bank and does not guarantee items or sellers. See the <a href="${link('legal/terms.html')}">Terms</a>.
    ${trackingConfigured && area !== 'admin' ? html` · <button type="button" class="linklike" id="cookie-settings">Cookie settings</button>` : ''}</div></footer>`));
  rememberSource();
  document.body.classList.add('has-shell');
  // Launch switch (site-info.js → launched): pages mark buttons .when-live / .when-prelaunch.
  document.body.classList.toggle('is-live', Boolean(SITE.launched));
  $('#cookie-settings')?.addEventListener('click', openCookieSettings);
  fillSiteInfo();
  loadImages();
  const menu = $('#menu');
  menu?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menu.setAttribute('aria-expanded', String(open));
  });
  $('#logout')?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: {}, as: area === 'admin' ? 'admin' : 'seller' }).catch(() => {});
    auth.clear();
    location.href = link(area === 'admin' ? 'admin/index.html' : 'index.html');
  });
  const message = flash.take();
  // Placed before <main> because each page replaces main's content when it renders.
  if (message) $('main').insertAdjacentHTML('beforebegin', String(html`<div class="flash-wrap"><div class="flash">${message}</div></div>`));
  // Copy buttons.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    track('share', { method: 'copy', content_type: b.dataset.copyType || 'link' });
    navigator.clipboard.writeText(b.dataset.copy).then(() => {
      const t = b.textContent;
      b.textContent = 'Copied!';
      setTimeout(() => (b.textContent = t), 1500);
    });
  });
  initAnalytics(area);
  const config = await configReady;
  if (config.test_mode) {
    document.body.insertAdjacentHTML('beforeend', '<div class="testbar" role="note">TEST MODE: a demonstration. No real money moves; payments and couriers are simulated.</div>');
    document.body.classList.add('has-testbar');
  }
  return config;
}

// Shows a friendly error in place of the page content.
export function fail(err) {
  show('#app', html`<section class="card narrow"><h1>Something went wrong</h1><p>${err.message}</p></section>`);
}

