// The newsletter invitation on the "Is it safe?" pages (deal safety check, Spot the Scam): a pop-up
// after a result or a game, never in the middle of one. Shown once; if closed, offered again after
// 14 days; never again once joined. Name, phone, email and buyer/seller/both, with clear consent.
import { api, html, track } from './core.js';

const KEY = 'tg_newsletter';
const AGAIN_DAYS = 14;
const T = {
  pcm: {
    title: 'No let scammer catch you 🛡️',
    lead: 'Join TrustGap newsletter: new scam tricks wey dey go round, how to buy and sell safe for WhatsApp and Instagram, and TrustGap news. Free.',
    name: 'Your name', phone: 'Phone number', email: 'Email',
    who: 'You be…', buyer: 'Buyer', seller: 'Seller', both: 'Both',
    consent: 'I agree make TrustGap send me news and tips by email, SMS or WhatsApp. I fit stop am any time.',
    join: 'Join now', later: 'Maybe later', done: 'You don join! Check your email: we don send you welcome message. 🎉',
  },
  en: {
    title: 'Don’t let scammers catch you 🛡️',
    lead: 'Join the TrustGap newsletter: new scam tricks going around, how to buy and sell safely on WhatsApp and Instagram, and TrustGap news. Free.',
    name: 'Your name', phone: 'Phone number', email: 'Email',
    who: 'You are a…', buyer: 'Buyer', seller: 'Seller', both: 'Both',
    consent: 'I agree to receive TrustGap news and tips by email, SMS or WhatsApp. I can stop any time.',
    join: 'Join now', later: 'Maybe later', done: 'You’re in! Check your email: we’ve sent you a welcome message. 🎉',
  },
};
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

export function offerNewsletter(source, lang = 'pcm', role = null) {
  const seen = read();
  if (seen?.joined) return;
  if (seen?.closed && Date.now() - seen.closed < AGAIN_DAYS * 86_400_000) return;
  if (document.querySelector('dialog.nl-pop')) return;
  const L = T[lang] || T.en;
  const d = document.createElement('dialog');
  d.className = 'nl-pop';
  d.setAttribute('aria-labelledby', 'nl-title');
  d.innerHTML = String(html`<form class="form" id="nl-form" method="dialog">
    <button type="button" class="ann-close nl-x" data-close aria-label="Close">×</button>
    <h2 id="nl-title">${L.title}</h2><p class="muted">${L.lead}</p>
    <label>${L.name}<input name="name" required maxlength="80" autocomplete="name"></label>
    <label>${L.phone}<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="0803 123 4567"></label>
    <label>${L.email}<input name="email" type="email" required autocomplete="email"></label>
    <fieldset><legend>${L.who}</legend><div class="choices">
      ${['buyer', 'seller', 'both'].map((r) => html`<label class="choice"><input type="radio" name="role" value="${r}" ${r === (role || 'buyer') ? 'checked' : ''}> ${L[r]}</label>`)}</div></fieldset>
    <label class="choice"><input type="checkbox" name="consent" value="yes" required> <span class="small">${L.consent}</span></label>
    <p class="error small" id="nl-err" aria-live="polite"></p>
    <button class="btn btn-block" id="nl-join">${L.join}</button>
    <p class="center"><button type="button" class="linklike small" data-close>${L.later}</button></p></form>`);
  document.body.append(d);
  const close = () => { write({ ...read(), closed: Date.now() }); track('newsletter_dismissed', { source }); d.close(); d.remove(); };
  for (const b of d.querySelectorAll('[data-close]')) b.addEventListener('click', close);
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.querySelector('#nl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget, btn = d.querySelector('#nl-join');
    btn.disabled = true;
    d.querySelector('#nl-err').textContent = '';
    try {
      await api('/api/newsletter', { method: 'POST', body: {
        name: f.name.value, phone: f.phone.value, email: f.email.value, role: f.role.value,
        consent: f.consent.checked, source, lang,
      } });
      write({ joined: Date.now() });
      track('newsletter_joined', { source, role: f.role.value });
      f.innerHTML = String(html`<h2>🎉</h2><p>${L.done}</p><button type="button" class="btn btn-block" data-close>OK</button>`);
      f.querySelector('[data-close]').addEventListener('click', () => { d.close(); d.remove(); });
    } catch (err) {
      d.querySelector('#nl-err').textContent = err.message;
      btn.disabled = false;
    }
  });
  d.showModal();
  track('newsletter_offered', { source });
}
