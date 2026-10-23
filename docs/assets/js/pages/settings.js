import { api, html, show, onSubmit, shell, getBanks, bankOptions, testAccountsHint, date, flash, link, fail, $ } from '../core.js';

const config = await shell('seller');

async function render() {
  const [{ seller: s }, banks] = await Promise.all([api('/api/seller/me', { as: 'seller' }), getBanks()]);
  show('#app', html`<section class="card narrow">
    <h1>1. Payout account</h1>
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
    <h1>2. Identity</h1>
    ${s.identity_verified
      ? html`<div class="callout ok">✓ Verified on ${date(s.identity_verified_at)}. Buyers see an “Identity verified” badge on your links.</div>`
      : s.id_attempts_left === 0
        ? html`<div class="callout warn">You have used all your verification attempts. Contact TrustGap support to finish verification.</div>`
        : html`<p class="muted">We check your NIN (National Identification Number) with Monnify. The name and date of birth on it must match your account. We only keep the last 4 digits.</p>
        <p class="small muted">${s.id_attempts_left} attempt${s.id_attempts_left > 1 ? 's' : ''} left — please double-check before submitting.</p>
        <form class="form" id="identity">
          <label>NIN <input name="nin" required inputmode="numeric" pattern="\\d{11}" maxlength="11" placeholder="11 digits"></label>
          <label>Date of birth <input name="dob" type="date" required></label>
          ${config.test_mode ? html`<details class="hint"><summary>Test mode: use a test NIN</summary>
            <p>11111111111 — Adebayo Oluwaseun John, born 1990-01-15</p></details>` : ''}
          <button class="btn">Verify my identity</button>
        </form>`}
  </section>`);

  onSubmit($('#payout'), async (data) => {
    const { seller } = await api('/api/seller/payout', { method: 'POST', body: data, as: 'seller' });
    flash.set(`Payout account verified: ${seller.payout.account_name}.`);
    location.href = seller.identity_verified ? link('seller/dashboard.html') : location.href;
  });
  if ($('#identity')) {
    onSubmit($('#identity'), async (data) => {
      await api('/api/seller/identity', { method: 'POST', body: data, as: 'seller' });
      flash.set('Identity verified. You can now create payment links.');
      location.href = link('seller/dashboard.html');
    });
  }
}
render().catch(fail);
