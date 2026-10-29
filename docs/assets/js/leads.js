// Survey and early-access answers go to the TrustGap Worker (POST /api/leads), which checks them and
// forwards them to the Make.com webhook that adds a row to the Google Sheet. The Make address is a
// Worker secret (LEADS_WEBHOOK_URL), never in the website. Each response carries a submission_id, so
// a resend after a poor connection isn't saved twice.
// If the phone is offline, the response waits on this device and is sent when the connection is back.
import { SITE } from './site-info.js';
import { API_URL } from './config.js';

const OUTBOX = 'tg_leads_outbox';
export const webhookReady = true; // the Worker says if the sheet isn't connected yet

// The Worker refused the response (e.g. too many from this connection): shown, not queued.
class Refused extends Error {}

export const STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
  'I live outside Nigeria'];

export const AGE_RANGES = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55+', 'Prefer not to say'];
export const isUnder18 = (age) => age === 'Under 18';
export const canCollectContact = (age) => !isUnder18(age) || SITE.allowUnder18Contact;

const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export { store };

// Where the visitor came from: ?source=instagram (or utm_source), else the referring site, else "direct".
export function campaignSource() {
  const q = new URLSearchParams(location.search);
  const saved = store.get('tg_source');
  const source = q.get('source') || q.get('utm_source') || saved?.source || 'direct';
  const info = { source, medium: q.get('utm_medium') || saved?.medium || '', campaign: q.get('utm_campaign') || saved?.campaign || '' };
  store.set('tg_source', info); // remembered, so it survives moving between pages
  return info;
}

// Nigerian mobile numbers in any common format → +234XXXXXXXXXX. Returns null if it isn't one.
export function normalisePhone(input) {
  let d = String(input || '').replace(/[\s()-]/g, '');
  if (/^\+?234\d{10}$/.test(d)) d = '0' + d.replace(/^\+?234/, '');
  return /^0[789][01]\d{8}$/.test(d) ? '+234' + d.slice(1) : null;
}
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Lists become "A | B | C" so each answer fits in one sheet cell.
const flatten = (data) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.join(' | ') : v ?? '']));

async function post(payload) {
  const res = await fetch(`${API_URL}/api/leads`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // A temporary problem saving it: keep it and try again later. Anything else: tell the person.
    if (res.status >= 500 && res.status !== 503) throw new Error('retry');
    throw new Refused(data.error || 'Sorry, your answers couldn’t be saved. Please try again later.');
  }
}

/** Sends one response. Resolves 'sent', or 'queued' if the phone is offline (sent later). */
export async function sendLead(data) {
  const now = new Date();
  const payload = flatten({
    ...data,
    submitted_at: now.toISOString(),
    submitted_at_lagos: now.toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }),
    page: location.pathname.split('/').pop(),
    device: matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop',
  });
  try {
    await post(payload);
    return 'sent';
  } catch (err) {
    if (err instanceof Refused) throw err;
    const box = store.get(OUTBOX) || [];
    box.push(payload);
    store.set(OUTBOX, box.slice(-10));
    return 'queued';
  }
}

// Sends anything left over from an offline moment (on page load and when the phone reconnects).
export async function flushOutbox() {
  const box = store.get(OUTBOX) || [];
  if (!box.length || !webhookReady || !navigator.onLine) return;
  const left = [];
  for (const p of box) {
    try { await post(p); } catch (err) { if (!(err instanceof Refused)) left.push(p); }
  }
  if (left.length) store.set(OUTBOX, left);
  else store.del(OUTBOX);
}
addEventListener('online', flushOutbox);
flushOutbox();

// Brings the top of a form into view just below the sticky header.
export function scrollToForm(el) {
  const top = el.getBoundingClientRect().top + scrollY - 76;
  const gap = Math.abs(scrollY - top);
  if (gap > 4) scrollTo({ top, behavior: gap > 600 ? 'instant' : 'smooth' });
}

// A share link for the survey: WhatsApp on phones, or the browser's share sheet when available.
export function shareSurvey(source = 'share') {
  const url = new URL('survey.html', new URL('../../', import.meta.url)).href + `?source=${source}`;
  const text = 'Have you ever been scammed while shopping online? Help shape safer online shopping in Nigeria. 2-minute survey:';
  if (navigator.share) return navigator.share({ title: 'TrustGap survey', text, url }).catch(() => {});
  open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
}
