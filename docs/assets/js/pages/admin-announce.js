// Admin → Announce: one message to sellers, buyers and/or team members, as a banner on their pages,
// an SMS and/or an email. Open to the admin and the Customer Relations Admin.
import { api, html, show, shell, date, fail, flash, $, $$ } from '../core.js';

await shell('admin');

const AUD = { sellers: 'Sellers', buyers: 'Buyers', team: 'Team members' };
const CH = { banner: '📢 Banner on their page (free)', sms: '💬 SMS', email: '✉️ Email' };
const naira = (n) => `₦${Number(n).toLocaleString('en-NG')}`;
let last = null; // the last preview, so the send matches what was checked

function readForm() {
  const f = $('#ann');
  const get = (name) => [...f.querySelectorAll(`[name=${name}]:checked`)].map((x) => x.value);
  return {
    kind: f.kind.value,
    audiences: get('audiences'),
    channels: get('channels'),
    title: f.title.value,
    body: f.body.value,
    sms: f.sms.value,
    link_url: f.link_url.value,
    banner_days: f.banner_days.value,
  };
}

function smsCount() {
  const f = $('#ann');
  const text = f.sms.value || (f.title.value && f.body.value ? `${f.title.value}. ${f.body.value}` : '');
  const n = text.length + 10 + (f.kind.value === 'marketing' ? 45 : 0); // "TrustGap: " and the stop link
  const pages = n <= 160 ? 1 : Math.ceil(n / 153);
  $('#sms-count').textContent = text ? `About ${n} characters: ${pages} SMS page${pages > 1 ? 's' : ''} per person${f.kind.value === 'marketing' ? ' (includes the stop link)' : ''}.` : '';
}

function kindChanged() {
  const marketing = $('#ann').kind.value === 'marketing';
  const team = $('#ann [name=audiences][value=team]');
  team.disabled = marketing;
  if (marketing) team.checked = false;
  $('#kind-note').innerHTML = marketing
    ? 'Only people who ticked <strong>“Send me TrustGap news”</strong> get it. Each SMS and email has a stop link. Texts go on KudiSMS’s promotional route: numbers on Do-Not-Disturb won’t receive them.'
    : 'For things everyone needs to know: changes to terms or fees, downtime, security warnings. <strong>No offers or promotions here</strong>: use “News and offers” for those.';
  $('#sms-box').hidden = !$('#ann [name=channels][value=sms]').checked;
  smsCount();
  $('#preview').innerHTML = '';
  last = null;
}

function previewCard(p) {
  return html`<section class="card ann-preview" aria-live="polite">
    <h2>Check before sending</h2>
    <p><strong>${p.people}</strong> ${p.people === 1 ? 'person' : 'people'}: ${p.audiences.map((a) => `${AUD[a]} ${p.by_audience[a]}`).join(' · ')}</p>
    <ul class="small">
      ${p.channels.includes('banner') ? html`<li>Banner on their ${p.audiences.map((a) => ({ sellers: 'seller dashboard', buyers: 'order tracking page', team: 'team portal' })[a]).join(', ')} for ${p.days} days (people can close it).</li>` : ''}
      ${p.channels.includes('sms') ? html`<li>SMS to <strong>${p.sms_to}</strong>: ${p.sms_pages} page${p.sms_pages > 1 ? 's' : ''} each, about <strong>${naira(p.sms_cost_naira)}</strong> of KudiSMS credit${p.sms_balance ? ` (you have ₦${p.sms_balance})` : ''}.</li>` : ''}
      ${p.channels.includes('email') ? html`<li>Email to <strong>${p.email_to}</strong>.</li>` : ''}
      ${p.minutes ? html`<li>Texts and emails go out a few at a time: all sent in about ${p.minutes} minutes.</li>` : ''}
    </ul>
    ${p.low_credit ? html`<p class="callout warn">Not enough KudiSMS credit for this. Top up first, or some texts will fail.</p>` : ''}
    ${p.channels.includes('email') && !p.email_ready ? html`<p class="callout warn">Email isn’t connected (MAKE_WEBHOOK_URL), so emails won’t go out.</p>` : ''}
    ${p.sms_sample ? html`<p class="small muted">The SMS will read${p.sample_name ? ` (as ${p.sample_name} gets it)` : ''}:</p><p class="sms-sample">${p.sms_sample}</p>` : ''}
    <form id="test" class="form">
      <p class="small"><strong>Send yourself a test first.</strong> Leave empty to use your own number${p.channels.includes('email') ? ' and email' : ''}.</p>
      <div class="grid2">
        ${p.channels.includes('sms') ? html`<label>Phone <input name="test_phone" type="tel" inputmode="tel" placeholder="Your number"></label>` : ''}
        ${p.channels.includes('email') ? html`<label>Email <input name="test_email" type="email" placeholder="Your email"></label>` : ''}
      </div>
      ${p.channels.some((c) => c !== 'banner') ? html`<button class="btn btn-secondary">Send test</button>` : ''}
      <p class="small" id="test-out" aria-live="polite"></p>
    </form>
    <button type="button" class="btn btn-block" id="send">Send to ${p.people} ${p.people === 1 ? 'person' : 'people'}</button>
  </section>`;
}

function historyRow(a) {
  const live = !a.stopped_at && new Date(a.ends_at) > new Date();
  const c = a.counts || {};
  const waiting = c.queued || 0;
  return html`<div class="row"><div>
      <strong>${a.title}</strong> <span class="badge ${a.kind === 'marketing' ? 'badge-warn' : 'badge-muted'}">${a.kind === 'marketing' ? 'news & offers' : 'service'}</span>
      <br><small class="muted">${date(a.created_at)} by ${String(a.created_by).replace(/^team:/, '')} · to ${a.audiences.map((x) => AUD[x]).join(', ')} · ${a.recipients} people
        · ${a.channels.map((x) => ({ banner: 'banner', sms: 'SMS', email: 'email' })[x]).join(', ')}</small>
      <br><small>${c.sent || 0} sent${c.failed ? ` · ${c.failed} failed` : ''}${c.logged ? ` · ${c.logged} only logged (SMS/email not connected)` : ''}${waiting ? ` · ${waiting} waiting` : ''}${c.stopped ? ` · ${c.stopped} stopped` : ''}${live && a.channels.includes('banner') ? ` · banner showing until ${date(a.ends_at)}` : ''}</small></div>
    <div class="right">${live || waiting ? html`<button class="btn btn-small btn-secondary" data-stop="${a.id}">Stop</button>` : html`<span class="badge badge-muted">done</span>`}</div></div>`;
}

async function render() {
  const { announcements } = await api('/api/admin/announcements', { as: 'admin' });
  show('#app', html`<h1>Announce</h1>
    <p class="muted">Send one message to sellers, buyers and team members. Banners are free; SMS uses KudiSMS credit.</p>
    <form id="ann" class="form card ann-form">
      <fieldset><legend>What kind of message?</legend><div class="choices">
        <label class="choice"><input type="radio" name="kind" value="service" checked> Service notice</label>
        <label class="choice"><input type="radio" name="kind" value="marketing"> News and offers</label></div>
        <p class="small muted" id="kind-note"></p></fieldset>
      <fieldset><legend>Who for?</legend><div class="choices">
        ${Object.entries(AUD).map(([k, v]) => html`<label class="choice"><input type="checkbox" name="audiences" value="${k}" ${k !== 'team' ? 'checked' : ''}> ${v}</label>`)}</div></fieldset>
      <fieldset><legend>How?</legend><div class="choices">
        ${Object.entries(CH).map(([k, v]) => html`<label class="choice"><input type="checkbox" name="channels" value="${k}" ${k === 'banner' ? 'checked' : ''}> ${v}</label>`)}</div></fieldset>
      <p class="small callout">✨ <strong>Make it personal:</strong> write <code>{first_name}</code> or <code>{business_name}</code> anywhere and each person sees their own,
        e.g. “Hi {first_name}, good news for {business_name}”. (Buyers and team members have no business name: they see their first name.)
        <br><button type="button" class="linklike" data-insert="{first_name}">+ {first_name}</button> · <button type="button" class="linklike" data-insert="{business_name}">+ {business_name}</button></p>
      <label>Title <input name="title" required maxlength="80" placeholder="e.g. Hi {first_name}, you can now get paid by bank transfer"></label>
      <label>Message <small>for the banner and email</small><textarea name="body" required maxlength="1000" rows="4" placeholder="What people need to know, in a few short sentences."></textarea></label>
      <div id="sms-box" hidden><label>SMS text <small>short; leave empty to use the title and message</small><textarea name="sms" maxlength="450" rows="2"></textarea></label>
        <p class="small muted" id="sms-count"></p></div>
      <div class="grid2">
        <label>Link <small>optional, https://…</small><input name="link_url" type="url" placeholder="https://trustgap-co.github.io/…"></label>
        <label>Banner shows for <small>days</small><input name="banner_days" type="number" min="1" max="90" value="14"></label>
      </div>
      <button class="btn">Check who gets it</button>
    </form>
    <div id="preview"></div>
    <h2>Sent</h2>
    <div class="list ann-history">${announcements.length ? announcements.map(historyRow) : html`<p class="muted">Nothing sent yet.</p>`}</div>`);

  const f = $('#ann');
  for (const el of f.querySelectorAll('[name=kind], [name=channels]')) el.addEventListener('change', kindChanged);
  for (const el of f.querySelectorAll('[name=audiences], input, textarea')) el.addEventListener('input', () => { $('#preview').innerHTML = ''; last = null; smsCount(); });
  kindChanged();
  // Put {first_name} / {business_name} where the cursor was last (title, message or SMS).
  let lastField = f.body;
  for (const el of f.querySelectorAll('[name=title], [name=body], [name=sms]')) el.addEventListener('focus', () => { lastField = el; });
  for (const b of $$('[data-insert]')) {
    b.addEventListener('click', () => {
      const el = lastField, at = el.selectionStart ?? el.value.length;
      el.value = el.value.slice(0, at) + b.dataset.insert + el.value.slice(el.selectionEnd ?? at);
      el.focus();
      el.dispatchEvent(new Event('input'));
    });
  }

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('#preview');
    try {
      last = readForm();
      const { preview } = await api('/api/admin/announcements/preview', { method: 'POST', body: last, as: 'admin' });
      box.innerHTML = String(previewCard(preview));
      box.scrollIntoView({ block: 'start', behavior: 'smooth' });
      wirePreview(preview);
    } catch (err) {
      box.innerHTML = String(html`<p class="error">${err.message}</p>`);
    }
  });

  for (const b of $$('[data-stop]')) {
    b.addEventListener('click', async () => {
      if (!confirm('Stop this announcement? The banner disappears and texts or emails not sent yet are cancelled.')) return;
      const r = await api(`/api/admin/announcements/${b.dataset.stop}/stop`, { method: 'POST', body: {}, as: 'admin' }).catch((err) => alert(err.message));
      if (r) flash.set(`Stopped${r.not_sent ? `: ${r.not_sent} not sent` : ''}.`);
      location.reload();
    });
  }
}

function wirePreview(p) {
  $('#test')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const out = $('#test-out');
    out.textContent = 'Sending…';
    try {
      const { test } = await api('/api/admin/announcements/test', { method: 'POST', body: { ...last, test_phone: e.target.test_phone?.value || '', test_email: e.target.test_email?.value || '' }, as: 'admin' });
      out.textContent = test.status === 'sent' ? `Test sent${test.phone ? ` to ${test.phone}` : ''}${test.email ? ` and ${test.email}` : ''}.`
        : test.status === 'logged' ? 'Nothing is connected, so it was only logged (see Admin → Messages).' : `Not sent: ${test.error || test.status}`;
    } catch (err) {
      out.textContent = err.message;
    }
  });
  $('#send').addEventListener('click', async (e) => {
    const extra = p.sms_to ? ` About ${naira(p.sms_cost_naira)} of SMS credit.` : '';
    if (!confirm(`Send “${p.title}” to ${p.people} people?${extra} You can stop it afterwards, but texts already sent can’t be taken back.`)) return;
    e.currentTarget.disabled = true;
    try {
      const r = await api('/api/admin/announcements', { method: 'POST', body: { ...last, confirm: true }, as: 'admin' });
      flash.set(`Sent to ${r.people} people${r.queued ? `: ${r.queued} texts/emails going out now` : ''}.`);
      location.reload();
    } catch (err) {
      alert(err.message);
      e.currentTarget.disabled = false;
    }
  });
}

render().catch(fail);
