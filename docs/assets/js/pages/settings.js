import { offerTour } from '../tour.js';
import { TOURS } from '../tours.js';
import { inviteCard, wireInvite } from '../invite.js';
import { api, auth, html, show, onSubmit, shell, getBanks, bankOptions, testAccountsHint, date, flash, link, fail, trackThenGo, $ } from '../core.js';

const config = await shell('seller');

async function render() {
  // The invite details come with the dashboard data (no Worker change needed for this page).
  const [{ seller: s }, banks, rf] = await Promise.all([api('/api/seller/me', { as: 'seller' }), getBanks(),
    api('/api/seller/dashboard', { as: 'seller' }).then((d) => d.referral).catch(() => null)]);
  const ready = s.payout && s.identity_verified;
  show('#app', html`<h1 class="page-title">Settings</h1>
  <section class="card narrow me-card">
    <div class="me-head"><span class="avatar" aria-hidden="true">${(s.business_name || s.full_name || '?').trim()[0].toUpperCase()}</span>
      <div><strong>${s.business_name}</strong><br><small class="muted">${s.full_name} · ${s.phone}</small></div></div>
    <div class="setup-steps">
      <span class="${s.payout ? 'done' : ''}">${s.payout ? '✓' : '1'} Payout account</span>
      <span class="${s.identity_verified ? 'done' : ''}">${s.identity_verified ? '✓' : '2'} Identity</span>
    </div>
  </section>
  ${ready && rf?.on ? html`<div class="narrow">${inviteCard(rf)}</div>` : ''}
  <section class="card narrow">
    <h2 class="card-title">1. Payout account</h2>
    <p class="muted">Where we send your money. It must be in your own name: <strong>${s.full_name}</strong>.</p>
    ${s.payout ? html`<div class="callout ok">✓ ${s.payout.bank_name} · ${s.payout.account_number} · ${s.payout.account_name}</div>` : ''}
    <form class="form" id="payout">
      <label>Bank <select name="bank_code" required>${bankOptions(banks)}</select></label>
      <label>Account number <input name="account_number" required inputmode="numeric" pattern="\\d{10}" maxlength="10"></label>
      ${testAccountsHint(config)}
      <button class="btn">${s.payout ? 'Change account' : 'Verify and save'}</button>
    </form>
  </section>
  <section class="card narrow">
    <h2 class="card-title">2. Identity</h2>
    ${s.identity_verified
      ? html`<div class="callout ok">✓ Verified on ${date(s.identity_verified_at)}. Buyers see an “Identity verified” badge on your links.</div>`
      : s.id_attempts_left === 0
        ? html`<div class="callout warn">You have used all your verification attempts. Contact TrustGap support to finish verification.</div>`
        : html`<p class="muted">We check your NIN (National Identification Number) with Monnify. The name and date of birth on it must match your account. We only keep the last 4 digits.</p>
        <p class="small muted">${s.id_attempts_left} attempt${s.id_attempts_left > 1 ? 's' : ''} left. Please double-check before submitting.</p>
        <form class="form" id="identity">
          <label>NIN <input name="nin" required inputmode="numeric" pattern="\\d{11}" maxlength="11" placeholder="11 digits"></label>
          <label>Date of birth <input name="dob" type="date" required></label>
          ${config.test_mode ? html`<details class="hint"><summary>Test mode: use a test NIN</summary>
            <p>11111111111: Adebayo Oluwaseun John, born 1990-01-15</p></details>` : ''}
          <button class="btn">Verify my identity</button>
        </form>`}
  </section>
  <section class="card narrow">
    <h2 class="card-title">3. News and offers</h2>
    <label class="choice"><input type="checkbox" id="marketing" ${s.marketing_opt_in ? 'checked' : ''}>
      Send me TrustGap news, selling tips and special offers by SMS, WhatsApp or email</label>
    <p class="muted small" id="marketing-note">Optional. Messages about your deals and payouts are always sent.</p>
  </section>
  ${!ready && rf?.on ? html`<div class="narrow">${inviteCard(rf)}</div>` : ''}
  <section class="card narrow">
    <button type="button" class="btn btn-block btn-secondary" id="settings-logout">Log out</button>
  </section>`);
  if (rf?.on) wireInvite(rf, $('#app'));
  $('#settings-logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: {}, as: 'seller' }).catch(() => {});
    auth.clear();
    location.href = link('index.html');
  });
  if (location.hash === '#invite') $('#invite')?.scrollIntoView({ block: 'start' });

  $('#marketing').addEventListener('change', async (e) => {
    const r = await api('/api/seller/marketing', { method: 'POST', body: { opt_in: e.target.checked }, as: 'seller' }).catch(() => null);
    $('#marketing-note').textContent = r ? (r.marketing_opt_in ? 'Saved: you’ll get news and offers.' : 'Saved: no news or offers.') : 'Couldn’t save. Try again.';
  });

  onSubmit($('#payout'), async (data) => {
    const { seller } = await api('/api/seller/payout', { method: 'POST', body: data, as: 'seller' });
    flash.set(`Payout account verified: ${seller.payout.account_name}.`);
    trackThenGo('payout_account_added', { first_time: !s.payout }, seller.identity_verified ? link('seller/dashboard.html') : location.href);
  });
  if ($('#identity')) {
    onSubmit($('#identity'), async (data) => {
      await api('/api/seller/identity', { method: 'POST', body: data, as: 'seller' });
      flash.set('Identity verified. You can now create payment links.');
      trackThenGo('identity_verified', { method: 'nin' }, link('seller/dashboard.html'));
    });
  }
}
render().then(() => offerTour('settings', TOURS.settings)).catch(fail);
