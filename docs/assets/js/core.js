// Shared helpers for every page: API calls, safe HTML, formatting, login tokens and the page shell.
import { API_URL } from './config.js';

export const ROOT = new URL('../../', import.meta.url).href; // the site root, wherever it is hosted
export const link = (path) => ROOT + path.replace(/^\//, '');
export const params = new URLSearchParams(location.search);
export const $ = (sel, root = document) => root.querySelector(sel);

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

let configPromise;
export const getConfig = () => (configPromise ||= api('/api/config').catch(() => ({ test_mode: false, zones: [] })));
export const getBanks = () => api('/api/banks').then((d) => d.banks);

// ---------------------------------------------------------------- formatting
export const money = (kobo) =>
  '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 });
export const date = (d) =>
  d ? new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

const ORDER_STATUS = {
  awaiting_payment: ['Awaiting payment', 'muted'],
  paid: ['Paid — money held', 'info'],
  shipping: ['On the way', 'info'],
  delivered: ['Delivered — inspection period', 'info'],
  disputed: ['Under review', 'warn'],
  completed: ['Completed', 'ok'],
  refunded: ['Refunded', 'muted'],
  cancelled: ['Cancelled', 'muted'],
  duplicate_refunded: ['Duplicate payment — refunded', 'muted'],
};
const DEAL_STATUS = {
  open: ['Open — waiting for buyer', 'info'],
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
  payment_mismatch: 'Payment amount did not match — flagged',
  payment_received: 'Payment received and held by TrustGap',
  duplicate_payment_refunded: 'Duplicate payment refunded',
  pickup_booked: 'Seller packed the item and booked pickup',
  delivery_picked_up: 'Courier picked up the parcel',
  delivery_out_for_delivery: 'Out for delivery',
  delivery_attempt_failed: 'Delivery attempt failed',
  delivery_refused: 'Buyer refused the parcel at the door',
  delivery_returned: 'Parcel returned to seller',
  wrong_pin: 'Wrong delivery PIN entered',
  delivered_with_pin: 'Delivered — buyer gave the delivery PIN',
  dispute_opened: 'Problem reported — money held for review',
  dispute_resolved: 'Dispute decided',
  buyer_confirmed: 'Buyer confirmed everything is fine',
  auto_released: 'Inspection period ended — payment released',
  checkout_abandoned: 'Checkout expired without payment',
  transfer_failed: 'A bank transfer failed — will be retried',
};
export const timeline = (events, { detail = false } = {}) => html`<ol class="timeline">${events.map(
  (e) => html`<li><span class="t-time">${date(e.created_at)}</span><span class="t-label">${EVENT_LABELS[e.type] || e.type}</span>
    ${detail && e.detail ? html`<code class="t-detail">${e.detail}</code>` : ''}</li>`,
)}</ol>`;

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
    } catch (err) {
      box.innerHTML = String(errorBox(err.message));
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

export const bankOptions = (banks, selected) =>
  html`<option value="">Choose your bank</option>${banks.map((b) => html`<option value="${b.code}" ${b.code === selected ? 'selected' : ''}>${b.name}</option>`)}`;

export const testAccountsHint = (config) =>
  config.test_mode && config.payment_provider === 'mock'
    ? html`<details class="hint"><summary>Test mode: use a test account number</summary><ul>
        <li>0000000001 — Adebayo Oluwaseun John</li><li>0000000002 — Chioma Ngozi Okafor</li>
        <li>0000000003 — Musa Ibrahim Bello</li><li>0000000004 — Funmilayo Grace Adeyemi</li>
        <li>0000000005 — Emeka Peter Nwosu</li></ul><p>Pick any bank. The name must match.</p></details>`
    : '';

// ---------------------------------------------------------------- page shell
export async function shell(area) {
  const config = await getConfig();
  const nav = {
    seller: html`<nav><a href="${link('seller/dashboard.html')}">Dashboard</a><a href="${link('seller/new.html')}">New link</a>
      <a href="${link('seller/settings.html')}">Settings</a><button class="linklike" id="logout">Log out</button></nav>`,
    admin: auth.admin()
      ? html`<nav><a href="${link('admin/orders.html')}">Orders</a><a href="${link('admin/disputes.html')}">Disputes</a>
        <a href="${link('admin/sellers.html')}">Sellers</a><a href="${link('admin/messages.html')}">Messages</a>
        <a href="${link('admin/ledger.html')}">Ledger</a><button class="linklike" id="logout">Log out</button></nav>`
      : '',
    buyer: html`<span class="protected">🔒 Payment protection</span>`,
    public: html`<nav><a href="${link('seller/login.html')}">Seller login</a> <a class="btn btn-small" href="${link('seller/signup.html')}">Start selling</a></nav>`,
  }[area];
  document.body.insertAdjacentHTML('afterbegin', String(html`
    ${config.test_mode ? html`<div class="testbar">TEST MODE — no real money moves. Payments and couriers are simulated.</div>` : ''}
    <header class="top"><a class="logo" href="${link('index.html')}">Trust<span>Gap</span></a>${nav}</header>`));
  document.body.insertAdjacentHTML('beforeend', String(html`<footer class="foot">TrustGap · Pay safely on WhatsApp &amp; Instagram deals ·
    <a href="${link('how.html')}">How it works</a></footer>`));
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
    navigator.clipboard.writeText(b.dataset.copy).then(() => {
      const t = b.textContent;
      b.textContent = 'Copied!';
      setTimeout(() => (b.textContent = t), 1500);
    });
  });
  return config;
}

// Shows a friendly error in place of the page content.
export function fail(err) {
  show('#app', html`<section class="card narrow"><h1>Something went wrong</h1><p>${err.message}</p></section>`);
}

export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
