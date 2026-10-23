// The link the seller sends. Step 1: review the deal. Step 2: delivery details, refund account, pay.
import { api, html, show, onSubmit, shell, money, date, params, getBanks, bankOptions, testAccountsHint, fail, $ } from '../core.js';

const config = await shell('buyer');
const token = params.get('d') || '';

const steps = (n) => html`<ol class="steps"><li class="${n === 1 ? 'on' : 'done'}">Review deal</li><li class="${n === 2 ? 'on' : ''}">Delivery &amp; pay</li></ol>`;

const UNAVAILABLE = {
  paid: 'This deal has already been paid for. If you paid, use the tracking link we sent to your phone.',
  expired: 'This payment link has expired. Ask the seller to send you a new one.',
  cancelled: 'The seller cancelled this link. Ask them for a new one if you still want the item.',
  replaced: 'The seller changed this deal and sent a newer link. Ask them for the latest one.',
};

function breakdown(d) {
  const p = d.price;
  const half = d.fee_payer === 'split' ? ' (your half)' : '';
  const feePercent = config.fee.percent;
  return html`<table class="breakdown">
    <tr><td>Item price${d.quantity > 1 ? ` (×${d.quantity})` : ''}</td><td>${money(p.item)}</td></tr>
    <tr><td>Delivery to ${d.delivery_area}</td><td>${p.delivery ? money(p.delivery) : html`<span class="muted">Paid by seller</span>`}</td></tr>
    <tr><td>TrustGap fee (${feePercent}%)${half}</td><td>${p.platform_fee ? money(p.platform_fee) : html`<span class="muted">Paid by seller</span>`}</td></tr>
    <tr><td>Payment processing${half} <small class="muted">— Flutterwave’s charges, passed on at cost</small></td>
      <td>${p.processing_fee ? money(p.processing_fee) : html`<span class="muted">Paid by seller</span>`}</td></tr>
    <tr class="total"><td>You pay</td><td>${money(p.total)}</td></tr>
  </table>`;
}

function review(d, rules) {
  show('#app', html`${steps(1)}<section class="card">
    <p class="seller-line">Seller: <strong>${d.seller.business_name}</strong>
      ${d.seller.identity_verified ? html`<span class="badge badge-ok">✓ Identity verified</span>` : html`<span class="badge badge-muted">Identity not yet verified</span>`}</p>
    <h1>${d.item_title}</h1>
    <p><span class="badge badge-info">${d.item_condition}</span> · Quantity ${d.quantity}</p>
    <p class="pre">${d.item_description}</p>
    ${breakdown(d)}
    <ul class="facts">
      <li>📦 Seller hands it to the courier within <strong>${d.delivery_days} day(s)</strong> of payment</li>
      <li>📍 Delivery area: <strong>${d.delivery_area}</strong></li>
      <li>🔍 You get <strong>${d.inspection_hours} hours</strong> after delivery to report a problem</li>
      <li>⏰ This link expires <strong>${date(d.expires_at)}</strong></li>
    </ul>
    <details class="rules" open><summary>How your money is protected</summary><ol>${rules.map((r) => html`<li>${r}</li>`)}</ol></details>
    <form id="accept"><button class="btn btn-block">This matches what we agreed — continue</button></form>
    <p class="muted small center">Something wrong? Don’t continue. Tell the seller — they can send you a corrected link.</p>
  </section>`);
  onSubmit($('#accept'), async () => {
    const { checkout_id } = await api(`/api/deals/${encodeURIComponent(token)}/accept`, { method: 'POST', body: {} });
    await details(d, checkout_id);
    scrollTo(0, 0);
  });
}

async function details(d, checkoutId) {
  const banks = await getBanks();
  show('#app', html`${steps(2)}<section class="card">
    <h1>Delivery details</h1>
    <p class="muted">${d.item_title} · <strong>${money(d.price.total)}</strong> · <button class="linklike" id="back">review the deal again</button></p>
    <form class="form" id="pay">
      <label>Full name <small>as on your bank account</small><input name="buyer_name" required autocomplete="name"></label>
      <div class="grid2">
        <label>Phone number <small>for delivery &amp; your PIN</small><input name="buyer_phone" required inputmode="tel" autocomplete="tel"></label>
        <label>Email <small>for your receipt</small><input name="buyer_email" type="email" required autocomplete="email"></label>
      </div>
      <label>Delivery address <textarea name="delivery_address" required rows="2" maxlength="300" autocomplete="street-address"></textarea></label>
      <label>Nearest landmark <small>optional</small><input name="delivery_landmark" maxlength="200"></label>
      <label class="choice"><input type="checkbox" name="confirm_area" value="yes" required> My address is in <strong>${d.delivery_area}</strong></label>
      <fieldset><legend>Refund account</legend>
        <p class="muted small">Only used if you are owed a refund. It must be in your own name. The seller never sees it.</p>
        <div class="grid2">
          <label>Bank <select name="refund_bank_code" required>${bankOptions(banks)}</select></label>
          <label>Account number <input name="refund_account_number" required inputmode="numeric" pattern="\\d{10}" maxlength="10"></label>
        </div>
        ${testAccountsHint(config)}
      </fieldset>
      <button class="btn btn-block">Pay ${money(d.price.total)} securely</button>
      <p class="muted small center">Your money is held by TrustGap, not the seller, until delivery.</p>
    </form>
  </section>`);
  $('#back').addEventListener('click', () => load());
  onSubmit($('#pay'), async (data) => {
    const res = await api(`/api/deals/${encodeURIComponent(token)}/pay`, { method: 'POST', body: { ...data, checkout_id: checkoutId } });
    location.href = res.payment_url;
  });
}

async function load() {
  const { deal, rules } = await api(`/api/deals/${encodeURIComponent(token)}`);
  if (deal.status !== 'open') {
    show('#app', html`<section class="card narrow"><h1>This link can’t be paid</h1><p>${UNAVAILABLE[deal.status]}</p></section>`);
    return;
  }
  review(deal, rules);
}
load().catch(fail);
