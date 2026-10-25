// Survey and early-access answers go straight from the browser to a Make.com webhook, which adds a
// row to a Google Sheet. Nothing goes through the TrustGap Worker.
//
// The data is sent as an ordinary form post (no special headers), which Make accepts from any website.
// The reply can't be read from another site, so "sent" means the request reached Make. Each response
// carries a submission_id, so a rare duplicate can be spotted in the sheet.
// If the phone is offline, the response waits on this device and is sent when the connection is back.
import { SITE } from './site-info.js';

const OUTBOX = 'tg_leads_outbox';
export const webhookReady = /^https:\/\/hook\.[a-z0-9.-]+\.make\.com\//i.test(SITE.leadsWebhookUrl || '');

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
  await fetch(SITE.leadsWebhookUrl, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(payload), keepalive: true });
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
  if (!webhookReady) {
    console.warn('[leads] Make webhook URL not set in site-info.js; nothing was saved:', payload);
    throw new Error('Sorry, this form is not connected yet, so your answers could not be saved. Please try again later.');
  }
  try {
    await post(payload);
    return 'sent';
  } catch {
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
    try { await post(p); } catch { left.push(p); }
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
