// The buyer/seller research survey (survey.html). One question per screen, branching by role.
// Answers go to Google Sheets through Make (see leads.js). Every completed survey is sent, including
// anonymous ones and those from under-18s; contact details are only asked for when someone opts in,
// and never from under-18s unless site-info.js → allowUnder18Contact is true.
import { shell, html, show, raw, track, link, $ } from '../core.js';
import { SITE } from '../site-info.js';
import { scrollToForm, STATES, AGE_RANGES, campaignSource, canCollectContact, isUnder18, normalisePhone, validEmail, sendLead, store, newId, shareSurvey, webhookReady } from '../leads.js';

shell('public');

const VERSION = 'v1-2026-11';
const DRAFT = 'tg_survey_draft';
const DONE = 'tg_survey_done';
const OTHER = 'Other';

const ROLES = { buyer: 'I buy online', seller: 'I sell online', both: 'I do both', curious: 'I am only interested in learning more' };
const buyerRole = (a) => a.role === 'buyer' || a.role === 'both';
const sellerRole = (a) => a.role === 'seller' || a.role === 'both';
const PLATFORMS = ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Jumia or Konga', 'Independent websites', OTHER];

// type: one (single choice) · many (tick all that apply) · text · select. `other: true` adds a text box for "Other".
const QUESTIONS = [
  // ---- Buyers
  { id: 'b_frequency', when: buyerRole, type: 'one', q: 'How often do you buy online?',
    options: ['Weekly', 'A few times a month', 'A few times a year', 'Rarely', 'I have not bought online yet'] },
  { id: 'b_channels', when: buyerRole, type: 'many', other: true, q: 'Where do you usually discover or buy products?', options: PLATFORMS },
  { id: 'b_scammed', when: buyerRole, type: 'one', q: 'Have you ever been scammed or seriously disappointed while buying online?',
    options: ['Yes, I paid and received nothing', 'Yes, the item was fake, damaged, incomplete or different', 'Yes, I had a payment or delivery problem', 'Almost, but I avoided it', 'No'] },
  { id: 'b_what_happened', when: (a) => buyerRole(a) && a.b_scammed && a.b_scammed !== 'No', type: 'one', other: true, q: 'What happened most recently?',
    options: ['Seller stopped responding', 'Item never arrived', 'Wrong or different item', 'Fake or counterfeit item', 'Damaged item', 'Delivery problem', 'Refund problem', 'Payment problem', OTHER] },
  { id: 'b_hesitation', when: buyerRole, type: 'many', q: 'What makes you hesitate before paying a social-media seller?',
    options: ['I do not know the seller well', 'I fear the seller will disappear', 'The item may not match the pictures', 'I am unsure whether the payment is safe',
      'I do not trust the delivery process', 'There is no clear return or refund process', 'Fees are unclear', 'Nothing in particular'] },
  { id: 'b_payment', when: buyerRole, type: 'many', other: true, q: 'How do you usually pay?',
    options: ['Bank transfer', 'Debit card', 'Payment link', 'Cash on delivery', 'Mobile wallet', OTHER] },
  { id: 'b_protection', when: buyerRole, type: 'one', q: 'Which protection would be most valuable to you?',
    options: ['Seller identity check', 'Payment held until delivery steps are completed', 'Delivery tracking', 'Ability to inspect before release', 'Clear dispute and refund process', 'All of the above'] },
  { id: 'b_likely', when: buyerRole, type: 'one', q: 'If a service protected the payment and coordinated delivery, how likely would you be to try it?',
    options: ['Very likely', 'Likely', 'Not sure', 'Unlikely', 'Very unlikely'] },
  { id: 'b_trust', when: buyerRole, type: 'many', other: true, q: 'What would make you trust a service like TrustGap?',
    options: ['Clear fees', 'Known payment partner', 'Known delivery partner', 'Visible customer support', 'Seller verification', 'Reviews from other buyers', 'Clear refund rules', OTHER] },
  // ---- Sellers
  { id: 's_category', when: sellerRole, type: 'many', other: true, q: 'What do you sell?',
    options: ['Fashion', 'Electronics', 'Beauty', 'Home and lifestyle', 'Food or groceries', 'Services', OTHER] },
  { id: 's_channels', when: sellerRole, type: 'many', other: true, q: 'Where do you sell?',
    options: ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Website', 'Jumia or Konga', 'Physical shop plus social media', OTHER] },
  { id: 's_orders', when: sellerRole, type: 'one', q: 'How many online orders do you receive in a typical month?', options: ['0–5', '6–20', '21–50', '51–100', 'More than 100'] },
  { id: 's_payment', when: sellerRole, type: 'many', other: true, q: 'Which payment methods do your customers use?',
    options: ['Bank transfer', 'Payment link', 'Cash on delivery', 'Card', 'Mobile wallet', OTHER] },
  { id: 's_problem', when: sellerRole, type: 'one', other: true, q: 'What is your biggest online-selling problem?',
    options: ['Buyers do not trust me before payment', 'Buyers refuse to pay at delivery', 'Fake orders', 'Delivery delays or failed delivery', 'Customers claim the item is different',
      'Refund and return disputes', 'Payment delays', 'Keeping records across chats and transfers', OTHER] },
  { id: 's_lost_money', when: sellerRole, type: 'one', q: 'Have you ever lost money because a buyer refused, cancelled, or could not receive an order?',
    options: ['Frequently', 'Sometimes', 'Once or twice', 'Never', 'Prefer not to say'] },
  { id: 's_would_use', when: sellerRole, type: 'many', other: true, q: 'What would make you use a protected-deal link?',
    options: ['Payment secured before dispatch', 'Buyer and seller see the same deal details', 'Delivery tracking', 'Fewer pay-on-delivery refusals', 'Clear dispute rules', 'Automatic payout after the inspection window', OTHER] },
  { id: 's_stop', when: sellerRole, type: 'many', other: true, q: 'What might stop you from using it?',
    options: ['Fees', 'Customers may not want another link', 'I do not understand how it works yet', 'Payout may take too long', 'I already have a payment method', 'I do not want identity verification', 'Delivery coverage', OTHER] },
  { id: 's_fee', when: sellerRole, type: 'one', q: 'What fee structure would feel reasonable for a protected transaction?',
    options: ['A small percentage of the item price', 'A flat fee', 'Buyer pays', 'Seller pays', 'Split between buyer and seller', 'I need to see the exact fee before deciding'] },
  // ---- Everyone
  { id: 'state', type: 'select', q: 'Which state do you live or operate in?', options: STATES },
  { id: 'age_range', type: 'one', q: 'What is your age range?', options: AGE_RANGES },
  { id: 'safer_change', type: 'text', optional: true, q: 'What one change would make online buying or selling feel safer for you?', placeholder: 'Optional. Type anything you like.' },
];

let answers = {};
let order = []; // ids of the questions this person sees, worked out from their answers so far
let at = -1; // -1 intro, 0 role, 1..n questions, n+1 contact
let started = 0;

// ---------------------------------------------------------------- saving progress (no contact details)
const saveDraft = () => store.set(DRAFT, { answers, at, v: VERSION });
const visible = () => QUESTIONS.filter((x) => !x.when || x.when(answers));
const refreshOrder = () => { order = visible().map((x) => x.id); };
const progress = () => Math.round((Math.max(at, 0) / (order.length + 2)) * 100);

function frame(inner, { back = true } = {}) {
  show('#survey', html`<div class="sv-card">
    <div class="sv-progress" aria-hidden="true"><span style="width:${progress()}%"></span></div>
    ${!webhookReady ? html`<p class="sv-warn">Survey not connected yet: answers can’t be saved. (Site owner: add the Make webhook URL in site-info.js.)</p>` : ''}
    ${inner}
    ${back ? html`<button type="button" class="linklike sv-back" id="sv-back">← Back</button>` : ''}
  </div>`);
  $('#sv-back')?.addEventListener('click', () => go(at - 1));
  if (at > -1) scrollToForm($('#survey'));
  $('#survey h2, #survey legend')?.focus?.();
}

// ---------------------------------------------------------------- screens
function intro() {
  const prior = store.get(DRAFT);
  frame(html`
    <p class="eyebrow">2-minute survey</p>
    <h1 tabindex="-1">Have you ever been scammed, disappointed, or left unsure while shopping or selling online?</h1>
    <p>We’re researching how Nigerians buy and sell through WhatsApp, Instagram, websites and online marketplaces. Your answers will help us build a safer way to secure payment and deliver items.</p>
    <ul class="sv-facts"><li><strong>Time:</strong> about 2 minutes</li>
      <li><strong>Privacy:</strong> we will never ask for your NIN, bank password, card PIN, OTP or payment details. Your name and contact are optional.</li></ul>
    <button class="btn btn-lg btn-block" id="sv-start">${prior?.at > 0 ? 'Continue where you stopped' : 'Start survey'}</button>
    ${prior?.at > 0 ? html`<button type="button" class="linklike sv-restart" id="sv-restart">Start again</button>` : ''}
    <p class="muted small">How we use your answers: <a href="${link('legal/privacy.html')}">Privacy Policy</a>. Answers are stored in TrustGap’s private records and used only for this research and, if you ask, to contact you.</p>`, { back: false });
  $('#sv-start').addEventListener('click', () => {
    if (prior?.v === VERSION && prior.at > 0) { answers = prior.answers; refreshOrder(); go(Math.min(prior.at, order.length + 1)); return; }
    go(0);
  });
  $('#sv-restart')?.addEventListener('click', () => { store.del(DRAFT); answers = {}; go(0); });
}

function roleScreen() {
  frame(html`<fieldset class="sv-q"><legend tabindex="-1"><h2>Which best describes you?</h2></legend>
    <div class="sv-options">${Object.entries(ROLES).map(([k, label]) =>
      html`<button type="button" class="sv-opt ${answers.role === k ? 'on' : ''}" data-role="${k}">${label}</button>`)}</div></fieldset>`, { back: true });
  for (const b of document.querySelectorAll('[data-role]')) {
    b.addEventListener('click', () => {
      answers.role = b.dataset.role;
      if (!started) { started = Date.now(); }
      track('survey_start', { role: answers.role });
      refreshOrder();
      go(1);
    });
  }
}

function questionScreen(q, n) {
  const value = answers[q.id];
  const otherText = answers[`${q.id}_other`] || '';
  const picked = (o) => (q.type === 'many' ? (value || []).includes(o) : value === o);
  let body;
  if (q.type === 'one' || q.type === 'many') {
    body = html`<div class="sv-options" role="${q.type === 'many' ? 'group' : 'radiogroup'}">${q.options.map((o) =>
      html`<button type="button" class="sv-opt ${picked(o) ? 'on' : ''}" data-opt="${o}" aria-pressed="${picked(o)}">${o}</button>`)}</div>
      ${q.other ? html`<input class="sv-other" id="sv-other" maxlength="200" placeholder="Tell us more" value="${otherText}" ${picked(OTHER) ? '' : raw('hidden')}>` : ''}
      ${q.type === 'many' ? html`<p class="muted small">Tick all that apply.</p>` : ''}`;
  } else if (q.type === 'select') {
    body = html`<select id="sv-select" class="sv-select"><option value="">Choose</option>${q.options.map((o) => html`<option ${value === o ? 'selected' : ''}>${o}</option>`)}</select>`;
  } else {
    body = html`<textarea id="sv-text" class="sv-text" rows="4" maxlength="600" placeholder="${q.placeholder || ''}">${value || ''}</textarea>`;
  }
  frame(html`<p class="sv-count">Question ${n} of ${order.length}</p>
    <fieldset class="sv-q"><legend tabindex="-1"><h2>${q.q}</h2></legend>${body}</fieldset>
    <p class="sv-err" id="sv-err" role="alert"></p>
    <button class="btn btn-lg btn-block" id="sv-next">${n === order.length ? 'Continue' : 'Next'}</button>`);

  for (const b of document.querySelectorAll('[data-opt]')) {
    b.addEventListener('click', () => {
      const o = b.dataset.opt;
      if (q.type === 'many') {
        const list = new Set(answers[q.id] || []);
        list.has(o) ? list.delete(o) : list.add(o);
        answers[q.id] = [...list];
      } else {
        answers[q.id] = o;
      }
      for (const x of document.querySelectorAll('[data-opt]')) {
        const on = q.type === 'many' ? answers[q.id].includes(x.dataset.opt) : answers[q.id] === x.dataset.opt;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', String(on));
      }
      const now = answers[q.id];
      if ($('#sv-other')) $('#sv-other').hidden = !(q.type === 'many' ? now.includes(OTHER) : now === OTHER);
      // Single answers without an "Other" box move on by themselves.
      if (q.type === 'one' && !(q.other && o === OTHER)) setTimeout(next, 180);
    });
  }
  $('#sv-select')?.addEventListener('change', (e) => { answers[q.id] = e.target.value; });
  $('#sv-text')?.addEventListener('input', (e) => { answers[q.id] = e.target.value; });
  $('#sv-other')?.addEventListener('input', (e) => { answers[`${q.id}_other`] = e.target.value; });
  $('#sv-next').addEventListener('click', next);

  function next() {
    const v = answers[q.id];
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (empty && !q.optional) { $('#sv-err').textContent = 'Please choose an answer to continue.'; return; }
    track('survey_step', { question: q.id, step: n });
    refreshOrder(); // an answer can add or remove a follow-up question
    go(order.indexOf(q.id) + 2);
  }
}

function contactScreen() {
  const allowed = canCollectContact(answers.age_range);
  const seller = sellerRole(answers);
  if (!allowed) {
    frame(html`<h2 tabindex="-1">Almost done</h2>
      <p>Thank you! Because you’re under 18, we won’t ask for your contact details. Your answers will be sent anonymously.</p>
      <p class="sv-err" id="sv-err" role="alert"></p>
      <button class="btn btn-lg btn-block" id="sv-submit">Submit my answers</button>`);
    $('#sv-submit').addEventListener('click', () => submit({ early_access: 'no (under 18)' }));
    return;
  }
  frame(html`<h2 tabindex="-1">Would you like early access to TrustGap?</h2>
    <p>Be first to try safer deals when we launch on ${SITE.launchDate}. Early-access members pay <strong>no TrustGap fee on their first deal</strong>.</p>
    <div class="sv-options sv-two">
      <button type="button" class="sv-opt ${answers.wants_contact === 'yes' ? 'on' : ''}" data-contact="yes">Yes, contact me</button>
      <button type="button" class="sv-opt ${answers.wants_contact === 'no' ? 'on' : ''}" data-contact="no">No, submit anonymously</button>
    </div>
    <form id="sv-contact" class="form sv-contact" ${answers.wants_contact === 'yes' ? '' : raw('hidden')} novalidate>
      <label>First name or nickname <input name="name" maxlength="60" autocomplete="given-name"></label>
      ${seller ? html`<label>Business or page name <small>optional</small><input name="business_name" maxlength="80" autocomplete="organization"></label>` : ''}
      <label>WhatsApp number <small>or leave blank and give an email</small><input name="phone" inputmode="tel" autocomplete="tel" placeholder="0803 123 4567"></label>
      <label>Email <small>optional</small><input name="email" type="email" autocomplete="email"></label>
      <label>Best way to reach you <select name="channel"><option>WhatsApp</option><option>SMS</option><option>Email</option></select></label>
      ${seller ? html`<label class="choice"><input type="checkbox" name="seller_pilot" value="yes"> I’d like to test TrustGap with my business before launch</label>` : ''}
      <label class="choice"><input type="checkbox" name="research_contact" value="yes"> You may also contact me with a few follow-up questions about this research</label>
      <p class="muted small">We’ll only use these details to contact you about TrustGap’s launch and this research. Reply STOP any time. <a href="${link('legal/privacy.html')}">Privacy Policy</a></p>
    </form>
    <p class="sv-err" id="sv-err" role="alert"></p>
    <button class="btn btn-lg btn-block" id="sv-submit">Submit</button>`);
  for (const b of document.querySelectorAll('[data-contact]')) {
    b.addEventListener('click', () => {
      answers.wants_contact = b.dataset.contact;
      document.querySelectorAll('[data-contact]').forEach((x) => x.classList.toggle('on', x === b));
      $('#sv-contact').hidden = answers.wants_contact !== 'yes';
    });
  }
  $('#sv-submit').addEventListener('click', () => {
    const err = $('#sv-err');
    if (!answers.wants_contact) { err.textContent = 'Choose “Yes, contact me” or “No, submit anonymously”.'; return; }
    if (answers.wants_contact === 'no') return submit({ early_access: 'no' });
    const f = Object.fromEntries(new FormData($('#sv-contact')));
    const phone = f.phone ? normalisePhone(f.phone) : '';
    if (!f.name.trim()) { err.textContent = 'Tell us your first name or a nickname.'; return; }
    if (f.phone && !phone) { err.textContent = 'That WhatsApp number doesn’t look right. Use a Nigerian number like 0803 123 4567.'; return; }
    if (f.email && !validEmail(f.email)) { err.textContent = 'That email address doesn’t look right.'; return; }
    if (!phone && !f.email) { err.textContent = 'Give a WhatsApp number or an email so we can reach you.'; return; }
    submit({ early_access: 'yes', name: f.name.trim(), business_name: f.business_name || '', phone: phone || '', email: f.email?.trim() || '',
      channel: f.channel, seller_pilot: f.seller_pilot || 'no', research_contact: f.research_contact || 'no' });
  });
}

async function submit(contact) {
  const btn = $('#sv-submit');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const out = { form: 'survey', survey_version: VERSION, submission_id: newId(), ...campaignSource(), role: answers.role,
    seconds_taken: started ? Math.round((Date.now() - started) / 1000) : '', under_18: isUnder18(answers.age_range) ? 'yes' : 'no',
    promo_code: contact.early_access === 'yes' ? SITE.earlyAccessCode : '' };
  for (const q of QUESTIONS) {
    out[q.id] = q.when && !q.when(answers) ? '' : answers[q.id] ?? '';
    if (q.other) out[`${q.id}_other`] = (answers[q.id] === OTHER || (answers[q.id] || []).includes?.(OTHER)) ? answers[`${q.id}_other`] || '' : '';
  }
  try {
    const result = await sendLead({ ...out, ...contact });
    store.del(DRAFT);
    store.set(DONE, { id: out.submission_id, at: Date.now(), early: contact.early_access === 'yes' });
    track('survey_complete', { role: answers.role, early_access: contact.early_access, source: out.source, under_18: out.under_18 });
    if (contact.early_access === 'yes') track('early_access_signup', { role: answers.role, via: 'survey' });
    thanks(contact.early_access === 'yes', result === 'queued');
  } catch (e) {
    $('#sv-err').textContent = e.message;
    btn.disabled = false;
    btn.textContent = 'Try again';
  }
}

function thanks(early, queued) {
  at = order.length + 2;
  frame(html`<div class="sv-done">
    <div class="sv-tick" aria-hidden="true">✓</div>
    <h1 tabindex="-1">Thank you for helping us close the trust gap.</h1>
    ${queued ? html`<p class="sv-note">You seem to be offline. Your answers are saved on this phone and will be sent automatically when you’re back online.</p>` : ''}
    <p>Your answers help us understand the real problems Nigerian buyers and sellers face online. TrustGap is building a safer flow where the deal is clear, payment is secured, delivery is tracked, and both sides know what happens next.</p>
    ${early ? html`<div class="sv-code"><p>Your early-access code</p><strong>${SITE.earlyAccessCode}</strong>
        <span>No TrustGap fee on your first deal after launch (${SITE.launchDate}). Sellers: enter it when creating a link. Buyers: enter it on step 1 of a link. Valid until ${SITE.earlyAccessCodeEnds}.</span></div>`
      : html`<a class="btn btn-lg btn-block" href="${link('early-access.html')}">Join the TrustGap early-access list</a>`}
    <button type="button" class="btn btn-lg btn-block btn-secondary" id="sv-share">Share the survey with a buyer or seller</button>
    <a class="linklike sv-again" href="${link('survey.html')}" id="sv-again">Fill it in again for someone else on this phone</a>
  </div>`, { back: false });
  $('#sv-share').addEventListener('click', () => { track('share', { method: 'survey_share', content_type: 'survey' }); shareSurvey('share'); });
  $('#sv-again').addEventListener('click', () => store.del(DONE));
}

// ---------------------------------------------------------------- navigation
function go(n) {
  at = Math.max(-1, n);
  if (at > 0) saveDraft();
  if (at === -1) return intro();
  if (at === 0) return roleScreen();
  refreshOrder();
  if (at <= order.length) {
    const q = QUESTIONS.find((x) => x.id === order[at - 1]);
    return questionScreen(q, at);
  }
  return contactScreen();
}

const done = store.get(DONE);
const preset = new URLSearchParams(location.search).get('role');
campaignSource(); // remember where they came from, even if they start later
if (done) {
  thanks(done.early, false);
} else if (preset && ROLES[preset] && !store.get(DRAFT)) {
  answers.role = preset;
  started = Date.now();
  track('survey_start', { role: preset, preset: true });
  refreshOrder();
  go(1);
} else {
  intro();
}
