// Survey and early-access answers: the website posts them here, and the Worker forwards them to the
// Make.com webhook (LEADS_WEBHOOK_URL, a secret) that adds a row to the Google Sheet. The Make address
// is never in the website, so it can't be spammed directly; this route is rate-limited per
// connection (lib/limits.js), checks sizes, drops bots and duplicates.
import { UserError } from '../lib/http.js';
import { hit } from '../lib/limits.js';

const FORMS = ['survey', 'early_access'];
const MAX_FIELDS = 60;
const MAX_VALUE = 2000;
const MAX_TOTAL = 24_000;

export async function forwardLead(ctx, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('Nothing to save.');
  if (!FORMS.includes(body.form)) throw new UserError('Unknown form.');
  if (String(body.website || '').trim()) return { ok: true }; // the hidden field only bots fill in: pretend it worked
  const entries = Object.entries(body).filter(([k]) => k !== 'website');
  if (entries.length > MAX_FIELDS) throw new UserError('Too many answers in one response.');
  const fields = {};
  let total = 0;
  for (const [k, v] of entries) {
    if (!/^[a-z0-9_]{1,40}$/i.test(k)) throw new UserError('An answer has an invalid name.');
    const text = (Array.isArray(v) ? v.join(' | ') : String(v ?? '')).slice(0, MAX_VALUE);
    total += text.length;
    fields[k] = text;
  }
  if (total > MAX_TOTAL) throw new UserError('This response is too long.');

  // Duplicates (a resend after a poor connection) and floods of responses for one phone or email are
  // accepted quietly but not forwarded again.
  const id = String(fields.submission_id || '').slice(0, 80);
  if (id && !(await hit(ctx, `lead:${id}`, 1, 86_400))) return { ok: true, duplicate: true };
  for (const contact of [fields.phone, fields.email].filter(Boolean)) {
    if (!(await hit(ctx, `lead-contact:${contact.toLowerCase()}`, 3, 86_400))) return { ok: true };
  }

  const url = String(ctx.env.LEADS_WEBHOOK_URL || '').trim();
  if (!url) throw new UserError('Sorry, this form isn’t connected yet, so your answers couldn’t be saved. Please try again later.', 503);
  fields.received_at = ctx.now().toISOString();
  let res;
  try {
    res = await fetch(url, { method: 'POST', body: new URLSearchParams(fields) });
  } catch {
    res = null;
  }
  if (!res?.ok) throw new UserError('We couldn’t save your answers just now. Please try again in a minute.', 502);
  return { ok: true };
}
