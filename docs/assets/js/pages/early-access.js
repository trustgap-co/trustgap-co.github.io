// Early-access sign-up (early-access.html): a short form that goes to Google Sheets through Make.
import { shell, html, show, track, link, $ } from '../core.js';
import { SITE } from '../site-info.js';
import { scrollToForm, STATES, AGE_RANGES, campaignSource, canCollectContact, normalisePhone, validEmail, sendLead, store, newId, shareSurvey, webhookReady } from '../leads.js';

shell('public');
campaignSource();

const DONE = 'tg_early_access_done';
const CATEGORIES = ['Fashion', 'Electronics', 'Beauty', 'Home and lifestyle', 'Food or groceries', 'Services', 'Other'];

function form() {
  show('#ea', html`<form class="form ea-form" id="ea-form" novalidate>
    ${!webhookReady ? html`<p class="sv-warn">Sign-up not connected yet: details can’t be saved. (Site owner: add the Make webhook URL in site-info.js.)</p>` : ''}
    <fieldset><legend>I want to</legend>
      <div class="choices">
        <label class="choice"><input type="radio" name="role" value="buyer" required> Buy safely</label>
        <label class="choice"><input type="radio" name="role" value="seller"> Sell safely</label>
        <label class="choice"><input type="radio" name="role" value="both"> Both</label>
      </div></fieldset>
    <label>First name or nickname <input name="name" required maxlength="60" autocomplete="given-name"></label>
    <div class="seller-only" hidden>
      <label>Business or page name <input name="business_name" maxlength="80" autocomplete="organization"></label>
      <label>What do you sell? <select name="category"><option value="">Choose</option>${CATEGORIES.map((c) => html`<option>${c}</option>`)}</select></label>
    </div>
    <div class="grid2">
      <label>WhatsApp number <input name="phone" inputmode="tel" autocomplete="tel" placeholder="0803 123 4567"></label>
      <label>Email <small>optional if you give WhatsApp</small><input name="email" type="email" autocomplete="email"></label>
    </div>
    <div class="grid2">
      <label>Best way to reach you <select name="channel"><option>WhatsApp</option><option>SMS</option><option>Email</option></select></label>
      <label>State <select name="state" required><option value="">Choose</option>${STATES.map((s) => html`<option>${s}</option>`)}</select></label>
    </div>
    <label>Age range <select name="age_range" required><option value="">Choose</option>${AGE_RANGES.map((a) => html`<option>${a}</option>`)}</select></label>
    <label class="choice"><input type="checkbox" name="consent" value="yes"> TrustGap may contact me about early access and the launch. I can reply STOP at any time.</label>
    <!-- Spam trap: people never see or fill this. -->
    <label class="hp" aria-hidden="true">Company website <input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="sv-err" id="ea-err" role="alert"></p>
    <button class="btn btn-lg btn-block">Get early access</button>
    <p class="muted small">We only use your details for TrustGap’s launch and early access. <a href="${link('legal/privacy.html')}">Privacy Policy</a></p>
  </form>`);

  const f = $('#ea-form');
  f.addEventListener('change', () => {
    const role = new FormData(f).get('role');
    f.querySelector('.seller-only').hidden = !(role === 'seller' || role === 'both');
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const err = $('#ea-err');
    const phone = d.phone ? normalisePhone(d.phone) : '';
    err.textContent = '';
    if (!d.role) return (err.textContent = 'Choose whether you want to buy, sell, or both.');
    if (!d.name.trim()) return (err.textContent = 'Tell us your first name or a nickname.');
    if (d.phone && !phone) return (err.textContent = 'That WhatsApp number doesn’t look right. Use a Nigerian number like 0803 123 4567.');
    if (d.email && !validEmail(d.email)) return (err.textContent = 'That email address doesn’t look right.');
    if (!phone && !d.email) return (err.textContent = 'Give a WhatsApp number or an email so we can reach you.');
    if (!d.state) return (err.textContent = 'Choose your state.');
    if (!d.age_range) return (err.textContent = 'Choose your age range.');
    if (!canCollectContact(d.age_range)) return underAge();
    if (d.consent !== 'yes') return (err.textContent = 'Tick the box so we’re allowed to contact you about early access.');
    if (d.website) return thanks(d.role); // a bot filled the hidden field: pretend it worked, send nothing

    const btn = f.querySelector('button.btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const result = await sendLead({
        form: 'early_access', submission_id: newId(), ...campaignSource(), role: d.role, name: d.name.trim(),
        business_name: d.business_name || '', category: d.category || '', phone: phone || '', email: d.email?.trim() || '',
        channel: d.channel, state: d.state, age_range: d.age_range, under_18: 'no', early_access: 'yes', consent: 'yes',
        promo_code: SITE.earlyAccessCode,
      });
      store.set(DONE, { role: d.role, at: Date.now() });
      track('early_access_signup', { role: d.role, via: 'early_access_page' });
      thanks(d.role, result === 'queued');
    } catch (e2) {
      err.textContent = e2.message;
      btn.disabled = false;
      btn.textContent = 'Try again';
    }
  });
}

function underAge() {
  track('early_access_under_18');
  show('#ea', html`<div class="sv-done"><h2>Thanks for your interest!</h2>
    <p>Early access is for people aged 18 and over, so we haven’t saved your details. You can still help by taking our anonymous survey.</p>
    <a class="btn btn-lg btn-block" href="${link('survey.html')}">Take the 2-minute survey</a></div>`);
}

function thanks(role, queued = false) {
  show('#ea', html`<div class="sv-done">
    <div class="sv-tick" aria-hidden="true">✓</div>
    <h2>You’re on the list.</h2>
    ${queued ? html`<p class="sv-note">You seem to be offline. Your details are saved on this phone and will be sent when you’re back online.</p>` : ''}
    <p>We’ll contact you when TrustGap opens on ${SITE.launchDate}.</p>
    <div class="sv-code"><p>Your early-access code</p><strong>${SITE.earlyAccessCode}</strong>
      <span>No TrustGap fee on your first deal. ${role === 'buyer' ? 'Enter it on step 1 of a seller’s TrustGap link.' : role === 'seller' ? 'Enter it when you create your first link.' : 'Sellers: enter it when creating a link. Buyers: on step 1 of a link.'} Valid until ${SITE.earlyAccessCodeEnds}.</span></div>
    <a class="btn btn-lg btn-block" href="${link('survey.html')}?role=${role === 'seller' ? 'seller' : 'buyer'}">Take the 2-minute survey</a>
    <button type="button" class="btn btn-lg btn-block btn-secondary" id="ea-share">Share with a buyer or seller</button>
  </div>`);
  scrollToForm($('#ea'));
  $('#ea-share').addEventListener('click', () => { track('share', { method: 'survey_share', content_type: 'early_access' }); shareSurvey('share'); });
}

const done = store.get(DONE);
if (done) thanks(done.role);
else form();
