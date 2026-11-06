// Shared helpers for every page: API calls, safe HTML, formatting, login tokens and the page shell.
import { API_URL as CONFIGURED_API_URL } from './config.js';
import { SITE } from './site-info.js';
import { campaignSource } from './source.js';
import { initAnalytics, openCookieSettings, trackingConfigured, track, trackThenGo, naira } from './analytics.js';

export { track, trackThenGo, naira };

// The web font loads without blocking the page (media="print" until now), with no inline script.
for (const l of document.querySelectorAll('link[data-font]')) l.media = 'all';

// Frame guard: TrustGap pages never run inside another site's frame (clickjacking).
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location = window.self.location.href; } catch { /* the framing site blocked it: stay hidden */ }
}

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
  // `role` 'cr_admin': the Customer Relations Admin, using the admin pages with their own login.
  setAdmin: (t, role = 'admin') => { session.set('tg_admin', t); session.set('tg_admin_role', role); },
  adminRole: () => session.get('tg_admin_role') || 'admin',
  isLead: () => session.get('tg_admin_role') === 'cr_admin',
  team: () => session.get('tg_team'),
  setTeam: (t) => session.set('tg_team', t),
  // The signed-in team member's name, for messages they send (e.g. WhatsApp).
  staffName: () => session.get('tg_staff_name') || '',
  setStaffName: (n) => session.set('tg_staff_name', n || ''),
  clear: () => { local.del('tg_seller'); for (const k of ['tg_admin', 'tg_admin_role', 'tg_team', 'tg_staff_name']) session.del(k); },
};

// ---------------------------------------------------------------- API
export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

// The last data each page loaded, per address, so live updates can tell when something changed.
// Signed photo addresses change on every request, so they're left out of the comparison.
const seen = new Map();
const comparable = (data) => JSON.stringify(data).replace(/\/api\/evidence\/[^"\\]+/g, '/api/evidence/*');

export async function api(path, { method = 'GET', body, as, peek = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const token = as === 'seller' ? auth.seller() : as === 'admin' ? auth.admin() : as === 'team' ? auth.team() : null;
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
    if (as === 'team') { session.del('tg_team'); location.href = link('team/index.html'); }
    throw new ApiError('Please log in.', 401);
  }
  if (!res.ok) throw new ApiError((data.error || 'Something went wrong.') + (data.detail ? ` Details: ${data.detail}` : ''), res.status, data.code);
  if (method === 'GET' && !peek) seen.set(path, comparable(data));
  return data;
}

// ---------------------------------------------------------------- live updates
// Every 30 seconds while the page is on screen, checks `path` for changes and redraws with `render`.
// If the person is in the middle of something (typing, a photo added, a choice made, a pop-up open),
// it doesn't redraw under them: a bar offers the update instead. A line shows when it last checked.
const clock = () => new Date().toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });

function busyOnPage() {
  if (document.querySelector('dialog[open], main details[open] form .photo-grid figure')) return true;
  const a = document.activeElement;
  if (a?.closest?.('main form') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
  for (const el of document.querySelectorAll('main input, main textarea, main select')) {
    if (['hidden', 'file', 'button', 'submit'].includes(el.type)) continue;
    if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== el.defaultChecked) return true; }
    else if (el.tagName === 'SELECT') { const first = [...el.options].find((o) => o.defaultSelected) || el.options[0]; if (first && !first.selected) return true; }
    else if (el.value !== el.defaultValue) return true;
  }
  return Boolean(document.querySelector('main .photo-grid figure .photo-del'));
}

export function keepFresh(path, render, { as, every = 30_000 } = {}) {
  let line = $('.live-line');
  if (!line) {
    line = Object.assign(document.createElement('p'), { className: 'live-line' });
    line.innerHTML = '<span class="live-dot" aria-hidden="true"></span> Live · updated <time></time> · <button type="button" class="linklike">Refresh</button>';
    $('main').before(line);
  }
  const stamp = () => { line.querySelector('time').textContent = clock(); };
  const redraw = async () => {
    $('.live-bar')?.remove();
    await render();
    stamp();
  };
  const offer = () => {
    if ($('.live-bar')) return;
    const bar = Object.assign(document.createElement('div'), { className: 'live-bar', role: 'status' });
    bar.innerHTML = '<span>New update on this page.</span> <button type="button" class="btn btn-small btn-light">Show it</button>';
    bar.querySelector('button').addEventListener('click', redraw);
    document.body.appendChild(bar);
  };
  let checking = false;
  const tick = async () => {
    if (checking || document.hidden) return;
    checking = true;
    try {
      const data = await api(path, { as, peek: true });
      if (comparable(data) === seen.get(path)) stamp();
      else if (busyOnPage()) offer();
      else await redraw();
    } catch { /* offline or a hiccup: try again next time */ } finally { checking = false; }
  };
  stamp();
  line.querySelector('button').onclick = redraw;
  clearInterval(keepFresh.timer);
  keepFresh.timer = setInterval(tick, every);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
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

// ---------------------------------------------------------------- WhatsApp
// A button that opens WhatsApp with this person's number and a first message typed in (editable).
export function whatsappButton(phone, text, label) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^0(?=[789])/, '234');
  if (!digits) return '';
  return html`<a class="btn btn-small btn-whatsapp" href="${`https://wa.me/${digits}?text=${encodeURIComponent(text)}`}" target="_blank" rel="noopener">💬 ${label}</a>`;
}
// The opening line for a dispute chat, from the signed-in person (Nora, a team member, or support).
export const disputeChatText = ({ name, ref, caseRef, as }) => {
  const me = auth.staffName() ? `${auth.staffName()} from TrustGap` : 'TrustGap support';
  return `Hello ${name}, this is ${me} about ${as === 'buyer' ? 'your order' : 'order'} ${ref}${caseRef ? ` (case ${caseRef})` : ''}. `;
};

// ---------------------------------------------------------------- delivery estimates
// The estimate from the Worker (lib/eta.js) as "Tue 10 Nov – Wed 11 Nov".
const etaDay = (d) => new Date(d).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' });
export const etaRange = (eta) => (eta ? (etaDay(eta.earliest) === etaDay(eta.latest) ? etaDay(eta.earliest) : `${etaDay(eta.earliest)} – ${etaDay(eta.latest)}`) : '');
export const etaNote = (eta) => (eta ? `${eta.transit[0].toUpperCase()}${eta.transit.slice(1)}. An estimate from the courier’s timelines.${eta.busy ? ' Busy festive season: allow a little longer.' : ''}` : '');
// The line under an order's progress: when to expect it, and why.
export const etaLine = (eta) => (eta ? html`<p class="eta-line"><span aria-hidden="true">🚚</span> <strong>Estimated delivery: ${etaRange(eta)}</strong><br><small class="muted">${etaNote(eta)}</small></p>` : '');

// ---------------------------------------------------------------- seller price quotes
// The breakdown from POST /api/seller/quote, shown on the price calculator and the new-link form, so
// the price a seller quotes a buyer is exactly what the link will charge. `d` is the form's answers.
const PAYER_LABEL = { buyer: 'paid by buyer', seller: 'paid by you', split: 'split 50/50' };
export function sellerQuoteBox({ price: p, delivery_state: state, promo, dispute_fee: disputeFee, eta }, d, fee) {
  return html`<table class="breakdown">
    <tr><td>Item price</td><td>${money(p.itemPrice)}</td></tr>
    <tr><td>Delivery to ${state} (${PAYER_LABEL[d.delivery_payer]})</td><td>${money(p.deliveryFee)}</td></tr>
    <tr><td>TrustGap fee ${feeLabel(fee, promo ? promo.saving : p.platformFee)} ${promo ? (promo.free_deal ? '(free deal)' : '(early-access code)') : `(${PAYER_LABEL[d.fee_payer]})`}</td>
      <td>${promo ? html`<s class="muted">${money(promo.saving)}</s> ${money(0)}` : money(p.platformFee)}</td></tr>
    <tr><td>Payment processing (${PAYER_LABEL[d.fee_payer]})</td><td>${money(p.processingFee)}</td></tr>
    <tr class="total"><td>Buyer pays</td><td>${money(p.buyerTotal)}</td></tr>
    <tr class="total"><td>You receive after delivery</td><td>${money(p.sellerPayout)}</td></tr>
  </table>${eta ? html`<p class="small"><span aria-hidden="true">🚚</span> <strong>Delivery time:</strong> ${eta.transit}. If the buyer pays today: estimated ${etaRange(eta)}${eta.busy ? ' (busy festive season: allow a little longer)' : ''}.</p>` : ''}${disputeFee ? html`<p class="small muted">Dispute fee: ${money(disputeFee)}, paid only by whoever TrustGap finds at fault if a dispute has to be decided. Settle problems with the buyer first and nobody pays it.</p>` : ''}${promo ? html`<p class="small ok-text">${promo.free_deal ? html`🎁 Free deal used: no TrustGap fee on this link${promo.left > 1 ? ` (${promo.left - 1} more after this)` : ''}.` : html`Early-access code ${promo.code} applied: no TrustGap fee on this link.`}</p>` : ''}`;
}
// A quote that can't be priced: the high-value route to support, or the reason (e.g. price too low).
export function sellerQuoteError(err) {
  return err.code === 'needs_support'
    ? html`<div class="callout info"><strong>High-value deal: let’s set it up together.</strong><p class="small">${err.message}</p>
        <p class="small">TrustGap support: <span data-site="supportPhone"></span> · <span data-site="supportEmail"></span></p></div>`
    : html`<div class="error">${err.message}</div>`;
}

// ---------------------------------------------------------------- the order journey
// Agreed → Payment secured → Preparing → Picked up → On the way → Delivered → Inspection → Released,
// with one plain sentence on what happens next and what (if anything) the reader should do.
const JOURNEY = ['Agreed', 'Payment secured', 'Preparing', 'Picked up', 'On the way', 'Delivered', 'Inspection', 'Released'];
function journeyStep(o) {
  if (['awaiting_payment', 'cancelled'].includes(o.status)) return 1;
  if (o.status === 'completed') return JOURNEY.length;
  if (o.status === 'delivered' || o.delivered_at) return 6;
  if (o.status === 'paid') return 2;
  return { picked_up: 3, out_for_delivery: 4, attempt_failed: 4, refused: 4, returned: 4 }[o.delivery_status] ?? 2;
}
function nextStep(o, as, dispute) {
  const buyer = as === 'buyer';
  if (dispute && ['open', 'awaiting_return'].includes(dispute.status)) {
    return dispute.status === 'awaiting_return'
      ? `A decision has been made. ${buyer ? 'Your refund is sent' : 'The money moves'} as soon as the item is back with the seller.`
      : `Case ${dispute.case_ref} is under review and the money stays held. ${buyer ? (o.delivered_at ? 'Keep the item and packaging safe.' : '') : 'Add your side and any photos below.'} Next update by ${date(dispute.update_by)}.`;
  }
  const d = o.delivery_status;
  switch (o.status) {
    case 'awaiting_payment': case 'cancelled': return buyer ? 'Complete your payment to secure the deal.' : 'Waiting for the buyer to pay.';
    case 'paid': return buyer
      ? `Your payment is secured. The seller is preparing your item and must hand it to the courier by ${date(o.ship_by)}. Nothing to do yet.`
      : `Payment confirmed. Pack the item and book pickup before ${date(o.ship_by)}.`;
    case 'shipping':
      if (d === 'out_for_delivery') return buyer ? 'On its way to you. When it arrives, inspect it before you share your delivery code.' : 'The courier is delivering it. Nothing to do; we’ll tell you when it’s delivered.';
      if (d === 'attempt_failed') return buyer ? 'The rider couldn’t deliver and will try again. Please keep your phone on.' : 'The rider couldn’t deliver and will try again.';
      if (d === 'picked_up') return buyer ? 'Your item has left the seller. We’ll text you when it’s on the way.' : 'The courier has collected it. Your part is nearly done.';
      return buyer ? 'The seller has packed your item and pickup is booked. We’ll text you when it’s on the way.' : 'Pickup is booked. Hand the parcel to the courier when they arrive.';
    case 'delivered': return buyer
      ? `Delivered. Inspect everything now: confirm below if all is well, or report a problem before ${date(o.inspection_ends_at)}.`
      : `Delivered. You have completed your part of the deal. Your payout is scheduled for when the buyer confirms, or ${date(o.inspection_ends_at)} at the latest.`;
    case 'completed': return buyer ? 'Complete. The seller has been paid. Thank you for buying safely.' : 'Complete. Your payout has been released to your bank account.';
    case 'refunded': return buyer ? 'This order was refunded.' : 'This order was refunded to the buyer.';
    default: return '';
  }
}
// What each step means, for the person looking: shown when they tap a step (or hover on a computer).
const STEP_MEANING = {
  buyer: [
    'You reviewed the item, photos, price, delivery address and rules, and accepted them. Nothing is paid at this point.',
    'Your money is held by TrustGap, not the seller. It goes to the seller only after delivery and your inspection, or back to you under the deal rules.',
    'The seller is packing your item and booking the courier. If they don’t hand it over by the ship-by date, you get a full refund.',
    'The courier has collected your item from the seller.',
    'A rider is bringing it to you. Keep your phone on, and inspect the item before you share your delivery code.',
    'You checked the item and gave the rider your delivery code. That confirms the handover.',
    'Your time to check everything properly{hours}. Confirm if all is well, or report a problem before it ends. Nobody is paid while you inspect.',
    'The seller has been paid and the deal is complete.',
  ],
  seller: [
    'You created the link with the item, price and delivery details, and the buyer accepted them.',
    'The buyer has paid. The money is held safely by TrustGap for you, so you can send the item with confidence.',
    'Your turn: pack the item, write the packing note (your evidence) and book pickup before the ship-by date.',
    'The courier has the parcel. Your part of the delivery is done.',
    'A rider is delivering it. If the buyer refuses a correct item, it comes back to you and the delivery costs come out of their refund.',
    'The buyer checked the item and confirmed with their delivery code.',
    'The buyer is checking the item{hours}. If they confirm, or the time ends with no problem reported, you are paid.',
    'Your payout has been released to your bank account.',
  ],
};
export function orderJourney(o, { as = 'buyer', dispute = null } = {}) {
  const at = journeyStep(o);
  const paused = ['disputed', 'refunded', 'duplicate_refunded'].includes(o.status);
  const hours = o.inspection_hours ? ` (${o.inspection_hours} hours after delivery)` : '';
  const meaning = STEP_MEANING[as === 'seller' ? 'seller' : 'buyer'].map((m) => m.replace('{hours}', hours));
  const state = (i) => (i < at ? 'Done' : i === at && !paused ? 'Happening now' : paused && i === at ? 'Paused' : 'Still to come');
  return html`<div class="journey"><div class="status-strip" role="list" aria-label="Order progress. Tap a step to see what it means.">${JOURNEY.map((label, i) => html`<button type="button" role="listitem" class="${i < at ? 'done' : i === at && !paused ? 'now' : ''}" data-step-info="${`${label} (${state(i)}): ${meaning[i]}`}"${i === at && !paused ? raw(' aria-current="step"') : ''}>${label}</button>`)}</div>
    <p class="step-info" aria-live="polite"><span class="muted">Tap any step to see what it means for you.</span></p>
    ${nextStep(o, as, dispute) ? html`<p class="next-step"><strong>${paused && dispute ? 'Paused for review.' : 'What happens next:'}</strong> ${nextStep(o, as, dispute)}</p>` : ''}
    ${paused ? '' : etaLine(o.eta)}</div>`;
}

// One listener for every journey on the page (pages redraw it every 30 seconds): a tap shows a step's
// meaning under the steps and keeps it; hovering with a mouse previews it.
const HINT = 'Tap any step to see what it means for you.';
function showStep(button, pinned) {
  const box = button.closest('.journey')?.querySelector('.step-info');
  if (!box) return;
  const [head, ...rest] = button.dataset.stepInfo.split(': ');
  box.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = head + ': ';
  box.append(strong, rest.join(': '));
  if (pinned) {
    button.closest('.status-strip').querySelectorAll('[data-step-info]').forEach((b) => b.classList.toggle('picked', b === button));
    box.dataset.pinned = '1';
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('.journey [data-step-info]');
    if (b) showStep(b, true);
  });
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest?.('.journey [data-step-info]');
    // A mouse previews steps until one is clicked; after that the clicked step stays shown.
    if (b && matchMedia('(hover: hover)').matches && !b.closest('.journey').querySelector('.step-info').dataset.pinned) showStep(b, false);
  });
  document.addEventListener('mouseout', (e) => {
    const strip = e.target.closest?.('.journey .status-strip');
    if (!strip || strip.contains(e.relatedTarget)) return;
    const box = strip.parentElement.querySelector('.step-info');
    if (box && !box.dataset.pinned) box.innerHTML = `<span class="muted">${HINT}</span>`;
  });
}

// ---------------------------------------------------------------- dispute decisions
// "Who is at fault" on the decision forms (admin and team). Amounts are entered before the dispute fee;
// the Worker applies it to the side at fault.
export const faultField = (disputeFee) => html`<label>Who is at fault? <small>${disputeFee
    ? html`The dispute fee for this deal is <strong>${money(disputeFee)}</strong>. Buyer at fault: it comes out of their refund (not charged if they get nothing back). Seller at fault: out of their payout, or added to what they owe. Enter the amounts below before the fee.`
    : 'No dispute fee on this deal (made before the fee started).'}</small>
  <select name="fault" required><option value="">Choose</option><option value="buyer">The buyer</option><option value="seller">The seller</option>
    <option value="courier">The courier (lost or damaged it): no fee</option><option value="none">No one, or both: no fee</option></select></label>`;
export const FAULT_LABELS = { buyer: 'the buyer', seller: 'the seller', courier: 'the courier', none: 'no one' };

// ---------------------------------------------------------------- formatting
export const money = (kobo) =>
  '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: kobo % 100 ? 2 : 0, maximumFractionDigits: 2 });
// The TrustGap fee, the same calculation as the Worker (lib/money.js): `percent` up to `tierKobo`,
// `percentAbove` on the rest, between the minimum and the cap.
export function platformFee(itemPrice, fee) {
  const tier = fee.tierKobo || Infinity;
  const above = Math.max(0, itemPrice - tier);
  const pf = Math.max(fee.minKobo, Math.round(((itemPrice - above) * fee.percent + above * (fee.percentAbove ?? fee.percent)) / 100));
  return fee.maxKobo ? Math.min(fee.maxKobo, pf) : pf;
}
const tiered = (fee) => fee.tierKobo && fee.percentAbove != null && fee.percentAbove !== fee.percent;
// How the fee works in one line: "1.5% up to ₦200,000, then 1% (max ₦15,000)".
export const feeSummary = (fee) => `${fee.percent}%${tiered(fee) ? ` up to ${money(fee.tierKobo)}, then ${fee.percentAbove}%` : ''}${fee.maxKobo ? ` (max ${money(fee.maxKobo)})` : ''}`;
// The TrustGap fee's label on one deal: "1.5%", "1.5% / 1% above ₦200,000", plus ", capped at …" at the cap.
export const feeLabel = (fee, fullKobo) => `${fee.percent}%${tiered(fee) && fullKobo > platformFee(fee.tierKobo, fee) ? ` / ${fee.percentAbove}% above ${money(fee.tierKobo)}` : ''}${fee.maxKobo && fullKobo >= fee.maxKobo ? `, capped at ${money(fee.maxKobo)}` : ''}`;
// The pop-up wording from /api/config: {fee} is twice the delivery fee, {dispute} the dispute fee (that
// clause is dropped when the deal has none). Same as the Worker's fillConsentBody.
export const fillConsentBody = (body, deliveryKobo, disputeKobo) =>
  (disputeKobo ? body.replace('{dispute}', money(disputeKobo)) : body.replace(/, plus the dispute fee \(\{dispute\}\)( if TrustGap has to decide it)?/, ''))
    .replace('{fee}', deliveryKobo != null ? money(2 * deliveryKobo) : 'shown in the price box');
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
  return_started: 'Rider is taking the item back to the seller',
  return_booked: 'Return booked: a rider will collect the item from the buyer',
  return_picked_up: 'Return collected from the buyer',
  return_out_for_delivery: 'Return on the way to the seller',
  return_attempt_failed: 'Return collection attempt failed',
  return_courier_status: 'Courier update on the return',
  wrong_return_pin: 'Wrong return PIN entered',
  return_received: 'Seller has the item back',
  return_cancelled: 'Return cancelled by TrustGap',
  dispute_decided_after_return: 'Decided: refund waits until the seller has the item back',
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

// Evidence photos for the admin and team: the photos, then how each was taken and any warnings.
export const evidencePhotos = (photos, label = 'Evidence') => (photos?.length ? html`
  <p class="small" style="margin:10px 0 4px"><strong>Photos (${photos.length})</strong>: tap to open full size</p>
  ${gallery(photos.map((p) => p.url), label)}
  <ul class="photo-checks">${photos.map((p, i) => html`<li>Photo ${i + 1}: ${p.source === 'camera' && !p.warnings.length
    ? html`<span class="ok">✓ Taken with the TrustGap camera (stamp ${p.stamp_code}, ${date(p.captured_at)})</span>`
    : html`<span class="warn">⚠ ${p.warnings.join(' · ')}</span>`}</li>`)}</ul>` : '');

// The accounts in an open case (first report, then each side's), for every page that shows a case.
// Staff see photos with their checks; buyers and sellers see their own photos.
const PARCEL_TEXT = { rider: 'the rider has the parcel', buyer: 'the parcel is with the buyer' };
export const caseAccounts = (c, { staff = false, me = null } = {}) => (c?.statements?.length ? html`
  ${staff && c.parcel_conflict ? html`<p class="callout warn small"><strong>The accounts differ on where the parcel is:</strong> ${c.parcel_conflict}. Check with the rider and buyer; book a return from the buyer if needed.</p>` : ''}
  <ul class="accounts">${c.statements.map((s) => html`<li class="account account-${s.party}">
    <p class="account-head"><strong>${s.party === me ? 'You' : s.party_label}</strong>${s.opening ? ' (first report)' : ''} <span class="muted small">${date(s.created_at)}${s.parcel_location ? ` · says ${PARCEL_TEXT[s.parcel_location]}` : ''}</span></p>
    <p class="pre">${s.body}</p>
    ${s.photos?.length ? (staff ? evidencePhotos(s.photos) : gallery(s.photos, 'Photo')) : ''}</li>`)}</ul>` : '');

// ---------------------------------------------------------------- records by date (admin lists)
// Dates are Lagos days. The filter lives in the page address (?from=&to=&order=), so a filtered view
// can be bookmarked or shared, and survives a refresh.
const lagosDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const shiftDay = (key, days) => lagosDay(new Date(`${key}T12:00:00+01:00`).getTime() + days * 86_400_000);
export const dateQuery = () => {
  const q = new URLSearchParams();
  for (const k of ['from', 'to', 'order']) if (params.get(k)) q.set(k, params.get(k));
  return q.toString();
};
const dayTitle = (key) => {
  const today = lagosDay(Date.now());
  if (key === today) return 'Today';
  if (key === shiftDay(today, -1)) return 'Yesterday';
  return new Date(`${key}T12:00:00+01:00`).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
};

// From / To / newest-oldest, plus one-tap ranges. Changing it reloads the page with the new address.
export function dateFilters() {
  const today = lagosDay(Date.now());
  const monthStart = `${today.slice(0, 8)}01`;
  const go = (from, to) => { const q = new URLSearchParams(location.search); for (const [k, v] of [['from', from], ['to', to]]) (v ? q.set(k, v) : q.delete(k)); return `?${q}`; };
  const on = (from, to) => (params.get('from') || '') === from && (params.get('to') || '') === to;
  return html`<form class="date-filters" id="date-filters">
    <div class="quick">${[['Today', today, today], ['Yesterday', shiftDay(today, -1), shiftDay(today, -1)], ['Last 7 days', shiftDay(today, -6), today],
      ['This month', monthStart, today], ['All', '', '']].map(([label, f, t]) => html`<a class="${on(f, t) ? 'on' : ''}" href="${go(f, t)}">${label}</a>`)}</div>
    <label>From <input type="date" name="from" value="${params.get('from') || ''}"></label>
    <label>To <input type="date" name="to" value="${params.get('to') || ''}"></label>
    <label>Show <select name="order"><option value="">Newest first</option><option value="oldest" ${params.get('order') === 'oldest' ? 'selected' : ''}>Oldest first</option></select></label>
    <button class="btn btn-small btn-secondary">Apply</button>
  </form>`;
}
export function wireDateFilters() {
  const f = $('#date-filters');
  if (!f) return;
  const apply = (e) => {
    e?.preventDefault();
    const q = new URLSearchParams(location.search);
    for (const k of ['from', 'to', 'order']) (f.elements[k].value ? q.set(k, f.elements[k].value) : q.delete(k));
    location.search = q.toString();
  };
  f.addEventListener('submit', apply);
  f.elements.order.addEventListener('change', apply);
}

// Rows grouped under a heading per day (in the order the server sent them), with an optional
// summary for each day (e.g. money in and out on the ledger).
export function byDay(items, row, { when = (x) => x.created_at, summary = null } = {}) {
  if (!items.length) return html`<p class="muted">Nothing in these dates.</p>`;
  const groups = [];
  for (const item of items) {
    const key = lagosDay(when(item));
    if (groups.at(-1)?.key !== key) groups.push({ key, items: [] });
    groups.at(-1).items.push(item);
  }
  return html`${groups.map((g) => html`<section class="day-group">
    <h3 class="day-head">${dayTitle(g.key)} <span class="muted">· ${g.items.length}${summary ? html` · ${summary(g.items)}` : ''}</span></h3>
    ${g.items.map(row)}</section>`)}`;
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
  config.test_accounts === 'simulator'
    ? html`<details class="hint"><summary>Test mode: use a test account number</summary><ul>
        <li>0000000001: Adebayo Oluwaseun John</li><li>0000000002: Chioma Ngozi Okafor</li>
        <li>0000000003: Musa Ibrahim Bello</li><li>0000000004: Funmilayo Grace Adeyemi</li>
        <li>0000000005: Emeka Peter Nwosu</li></ul><p>Pick any bank. The name must match.</p></details>`
    : config.test_accounts === 'flutterwave'
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
  ['check.html', 'Is it safe?'],
  ['faq.html', 'FAQ'],
  ['about.html', 'About'],
];

const isPlaceholder = (v) => /^\[.*\]$/.test(String(v));

// TrustGap's social pages (site-info.js), as icons; any without an address is left out.
const SOCIAL = [
  ['instagramUrl', 'Instagram', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>'],
  ['xUrl', 'X (Twitter)', '<path d="M4 4l16 16M20 4L4 20" />'],
  ['tiktokUrl', 'TikTok', '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.6 2.4 4.5 5 5"/>'],
  ['facebookUrl', 'Facebook', '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>'],
];
function socialLinks() {
  const links = SOCIAL.filter(([key]) => SITE[key] && !isPlaceholder(SITE[key]));
  if (!links.length) return '';
  return html`<p class="socials" aria-label="TrustGap on social media">${links.map(([key, label, icon]) => html`<a href="${SITE[key]}" target="_blank" rel="noopener" aria-label="TrustGap on ${label}" title="${label}">${raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`)}</a>`)}</p>`;
}

// Fills <span data-site="supportEmail"></span> etc. from site-info.js; unfilled values are highlighted.
export function fillSiteInfo() {
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

// Which campaign link or ad brought this visitor, remembered from the page they land on (source.js).
const rememberSource = () => campaignSource();

// ---------------------------------------------------------------- app layout (accounts and deal pages)
// Inside the seller, admin and team accounts the pages look and work like an app: a slim top bar
// with the page name, a tab bar at the bottom on phones and a side menu on computers.
// The buyer's deal pages get the same slim bar, without tabs.
const APP_AREAS = ['seller', 'buyer', 'admin', 'team'];
const AREA_LABEL = { seller: 'Seller', admin: 'Admin', team: 'Team', buyer: '' };
const svg = (d) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`);
const ICON = {
  home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  calc: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11v6M8 15h2M12 15h2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>'),
  box: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
  alert: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  store: svg('<path d="M4 9 5.5 4h13L20 9"/><path d="M4 9v11h16V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/>'),
  chat: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  coins: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
  team: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>'),
  book: svg('<path d="M4 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3"/><path d="M20 4v13.5h-6.5A2.5 2.5 0 0 0 11 20"/>'),
  tasks: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>'),
  more: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  out: svg('<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
};
// [page, label, icon, other pages that light this tab, under "More" on phones, style]
function appTabs(area) {
  if (area === 'seller') return auth.seller() ? [
    ['seller/dashboard.html', 'Home', 'home', ['deal.html', 'order.html']],
    ['seller/new.html', 'New link', 'plus', [], false, 'primary'],
    ['seller/price.html', 'Prices', 'calc'],
    ['seller/settings.html', 'Settings', 'gear'],
  ] : null;
  if (area === 'admin') return auth.admin() ? [
    ['admin/orders.html', 'Orders', 'box', ['order.html']],
    ['admin/disputes.html', 'Disputes', 'alert'],
    ['admin/sellers.html', 'Sellers', 'store'],
    ['admin/team.html', 'Team', 'team'],
    ['admin/messages.html', 'Messages', 'chat', [], true],
    ...(auth.isLead() ? [] : [['admin/ledger.html', 'Ledger', 'coins', [], true]]),
    ['team/manual.html', 'Manual', 'book', [], true],
  ] : null;
  if (area === 'team') return auth.team() ? [
    ['team/index.html', 'My tasks', 'tasks', ['order.html']],
    ['team/manual.html', 'Manual', 'book'],
  ] : null;
  return null;
}
function tabBar(tabs, here) {
  const folder = location.pathname.split('/').slice(-2, -1)[0];
  const isOn = ([href, , , also = []]) => href === `${folder}/${here}` || (href.startsWith(`${folder}/`) && also.includes(here));
  const tab = (t) => html`<a class="app-tab ${t[4] ? 'tab-extra' : ''} ${t[5] === 'primary' ? 'tab-primary' : ''} ${isOn(t) ? 'on' : ''}" href="${link(t[0])}" ${isOn(t) ? raw('aria-current="page"') : ''}>
    <span class="tab-icon">${ICON[t[2]]}</span><span class="tab-label">${t[1]}</span></a>`;
  const extras = tabs.filter((t) => t[4]);
  return html`<nav class="app-nav" aria-label="Main">
    ${tabs.map(tab)}
    ${extras.length ? html`<button type="button" class="app-tab tab-more ${extras.some(isOn) ? 'on' : ''}" data-more aria-expanded="false" aria-controls="app-sheet">
      <span class="tab-icon">${ICON.more}</span><span class="tab-label">More</span></button>` : ''}
    <button type="button" class="app-tab tab-logout" data-logout><span class="tab-icon">${ICON.out}</span><span class="tab-label">Log out</span></button>
  </nav>
  ${extras.length ? html`<div class="app-sheet-shade"></div><div class="app-sheet" id="app-sheet" role="menu">
    ${extras.map((t) => html`<a href="${link(t[0])}" role="menuitem" class="${isOn(t) ? 'on' : ''}"><span class="tab-icon">${ICON[t[2]]}</span>${t[1]}</a>`)}
    <button type="button" data-logout role="menuitem"><span class="tab-icon">${ICON.out}</span>Log out</button></div>` : ''}`;
}

// Draws the header and footer straight away (no waiting for the API), then adds the test-mode bar
// when the settings arrive. Returns the settings.
export async function shell(area) {
  const configReady = getConfig();
  const here = location.pathname.split('/').pop() || 'index.html';
  const app = APP_AREAS.includes(area);
  const nav = {
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
  }[area] || '';
  const tabs = app ? appTabs(area) : null;
  const title = document.title.split(' · ')[0];
  document.body.insertAdjacentHTML('afterbegin', String(app
    ? html`<a class="skip" href="#app">Skip to content</a>
      <header class="top app-top"><div class="top-in">
        <a class="logo" href="${link(area === 'seller' && tabs ? 'seller/dashboard.html' : 'index.html')}" aria-label="TrustGap home">Trust<span>Gap</span></a>
        ${tabs ? html`<span class="app-title">${title}</span>` : ''}
        <span class="app-right">${area === 'buyer' ? nav : html`<span class="app-tag">${AREA_LABEL[area]}${area === 'admin' && auth.isLead() ? ' · CR' : ''}</span>`}</span>
      </div></header>
      ${tabs ? tabBar(tabs, here) : ''}`
    : html`<a class="skip" href="#app">Skip to content</a>
      <header class="top"><div class="top-in"><a class="logo" href="${link('index.html')}" aria-label="TrustGap home">Trust<span>Gap</span></a>${nav}</div></header>`));
  if (app) {
    document.body.classList.add('app', `app-${area}`);
    if (tabs) document.body.classList.add('has-tabs');
    if (area === 'seller' && !$('link[rel=manifest]')) {
      // "Add to Home screen" opens the seller account like an app (no service worker: pages are never cached offline).
      document.head.insertAdjacentHTML('beforeend', `<link rel="manifest" href="${link('manifest.webmanifest')}">
        <meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-title" content="TrustGap"><link rel="apple-touch-icon" href="${link('assets/app-icon-512.png')}">`);
    }
  }
  const fullFooter = html`<div class="container foot-grid">
    <div class="foot-brand"><a class="logo" href="${link('index.html')}">Trust<span>Gap</span></a>
      <p>The safe completion layer for social commerce in Nigeria: payment secured, item delivered, both sides know what happens next.</p>
      ${socialLinks()}</div>
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
    ${trackingConfigured && !['admin', 'team'].includes(area) ? html` · <button type="button" class="linklike" id="cookie-settings">Cookie settings</button>` : ''}</div>`;
  // Inside accounts and on deal pages (seller, buyer, admin, team) the footer is one slim line; the
  // full footer opens with "More links". The public pages keep the full footer.
  const slim = ['seller', 'buyer', 'admin', 'team'].includes(area);
  document.body.insertAdjacentHTML('beforeend', String(slim
    ? html`<footer class="site-foot site-foot-slim"><div class="container slim-row">
        <span>© ${new Date().getFullYear()} TrustGap</span>
        <a href="${link('legal/terms.html')}">Terms</a><a href="${link('legal/privacy.html')}">Privacy</a>
        <a href="${link('legal/disputes.html')}">Refunds &amp; disputes</a>
        <span>Support: <span data-site="supportEmail"></span></span></div>
      <details class="foot-more"><summary class="container">More links</summary>${fullFooter}</details></footer>`
    : html`<footer class="site-foot">${fullFooter}</footer>`));
  rememberSource();
  $('.static-links')?.remove(); // plain links for crawlers that don't run JavaScript; the menu replaces them
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
  $$('[data-logout]').forEach((b) => b.addEventListener('click', async () => {
    const as = ['admin', 'team'].includes(area) ? area : 'seller';
    await api('/api/auth/logout', { method: 'POST', body: {}, as }).catch(() => {});
    auth.clear();
    location.href = link(as === 'seller' ? 'index.html' : `${as}/index.html`);
  }));
  // "More" on the phone tab bar (admin): a sheet with the other pages and Log out.
  $('[data-more]')?.addEventListener('click', () => {
    const open = document.body.classList.toggle('more-open');
    $('[data-more]').setAttribute('aria-expanded', String(open));
  });
  $('.app-sheet-shade')?.addEventListener('click', () => document.body.classList.remove('more-open'));
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
  // The test bar shows only on the deal pages (payment, tracking, rider, seller, admin, team), never on
  // the public site (home, survey, early access, policies…), which stays clean while being promoted.
  const innerPage = area !== 'public' || location.pathname.includes('/seller/');
  if (config.test_mode && innerPage) {
    const bar = '<div class="testbar" role="note">TEST MODE: a demonstration. No real money moves; payments and couriers are simulated.</div>';
    // In the app pages it sits under the top bar, clear of the tab bar and the pay button.
    if (document.body.classList.contains('app')) $('.app-top').insertAdjacentHTML('afterend', bar.replace('class="testbar"', 'class="testbar testbar-top"'));
    else {
      document.body.insertAdjacentHTML('beforeend', bar);
      document.body.classList.add('has-testbar');
    }
  }
  return config;
}

// Shows a friendly error in place of the page content.
export function fail(err) {
  show('#app', html`<section class="card narrow"><h1>Something went wrong</h1><p>${err.message}</p></section>`);
}

