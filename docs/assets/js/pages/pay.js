// The link the seller sends. Step 1: confirm the whole deal, including the delivery address the
// seller entered (read-only) and the exact total. Step 2: contact details and refund account, pay.
import { api, html, show, onSubmit, shell, money, date, params, getBanks, bankOptions, testAccountsHint, fail, gallery, track, trackThenGo, naira, $ } from '../core.js';

const config = await shell('buyer');
const token = params.get('d') || '';

const steps = (n) => html`<ol class="steps"><li class="${n === 1 ? 'on' : 'done'}">Review deal</li><li class="${n === 2 ? 'on' : ''}">Your details &amp; pay</li></ol>`;

const UNAVAILABLE = {
  paid: 'This deal has already been paid for. If you paid, use the tracking link we sent to your phone.',
  expired: 'This payment link has expired. Ask the seller to send you a new one.',
  cancelled: 'The seller cancelled this link. Ask them for a new one if you still want the item.',
  replaced: 'The seller changed this deal and sent a newer link. Ask them for the latest one.',
};

// Analytics description of this deal (no address, names or token; see analytics.js).
const ecommerce = (d) => ({
  currency: 'NGN',
  value: naira(d.price.total),
  delivery_state: d.delivery.state,
  pickup_state: d.ships_from,
  delivery_payer: d.delivery_payer,
  fee_payer: d.fee_payer,
  seller_identity_verified: Boolean(d.seller.identity_verified),
  photo_count: d.photos?.length || 0,
  items: [{ item_id: `deal_${params.get('o') || 'link'}`, item_name: d.item_title, item_category: d.item_condition,
    price: naira(d.price.item / (d.quantity || 1)), quantity: d.quantity }],
});

const paidBySeller = html`<span class="muted">Paid by seller</span>`;
const half = (payer) => (payer === 'split' ? ' (your half)' : '');

function breakdown(d) {
  const p = d.price;
  return html`<table class="breakdown">
    <tr><td>Item price${d.quantity > 1 ? ` (×${d.quantity})` : ''}</td><td>${money(p.item)}</td></tr>
    <tr><td>Delivery ${d.ships_from} → ${d.delivery.state}${half(d.delivery_payer)}</td><td>${p.delivery ? money(p.delivery) : paidBySeller}</td></tr>
    <tr><td>TrustGap fee (${config.fee.percent}%)${half(d.fee_payer)}</td><td>${p.platform_fee ? money(p.platform_fee) : paidBySeller}</td></tr>
    <tr><td>Payment processing${half(d.fee_payer)} <small class="muted">(Flutterwave’s charges, passed on at cost)</small></td>
      <td>${p.processing_fee ? money(p.processing_fee) : paidBySeller}</td></tr>
    <tr class="total"><td>You pay</td><td>${money(p.total)}</td></tr>
  </table>`;
}

function review(d, rules) {
  show('#app', html`${steps(1)}<section class="card">
    <p class="seller-line">Seller: <strong>${d.seller.business_name}</strong>
      ${d.seller.identity_verified ? html`<span class="badge badge-ok">✓ Identity verified</span>` : html`<span class="badge badge-muted">Identity not yet verified</span>`}</p>
    <h1>${d.item_title}</h1>
    ${d.photos?.length ? html`${gallery(d.photos, d.item_title)}
      <p class="muted small">Photos from the seller${d.photos.length > 1 ? ` (${d.photos.length}, swipe to see all)` : ''}. Tap to enlarge. At delivery, check the item matches them before giving your PIN.</p>` : ''}
    <p><span class="badge badge-info">${d.item_condition}</span> · Quantity ${d.quantity}</p>
    <p class="pre">${d.item_description}</p>
    <div class="callout info">
      <strong>Delivering to</strong><br>${d.delivery.address}<br><span class="small">${d.delivery.state === 'FCT' ? 'FCT (Abuja)' : `${d.delivery.state} State`}</span>
      ${d.delivery.landmark ? html`<br><span class="small">Near ${d.delivery.landmark}</span>` : ''}
      <br><span class="small muted">Not your address? Don’t continue. Ask the seller to send a corrected link.</span>
    </div>
    ${breakdown(d)}
    <ul class="facts">
      <li>📦 Seller hands it to the courier within <strong>${d.delivery_days} day(s)</strong> of payment</li>
      <li>🔍 You get <strong>${d.inspection_hours} hours</strong> after delivery to report a problem</li>
      <li>⏰ This link expires <strong>${date(d.expires_at)}</strong></li>
    </ul>
    <details class="rules" open><summary>How your money is protected</summary><ol>${rules.map((r) => html`<li>${r}</li>`)}</ol></details>
    <form id="accept"><button class="btn btn-block">The item, address and price are right. Continue</button></form>
    <p class="muted small center">Something wrong? Don’t continue. Tell the seller, who can send you a corrected link.</p>
  </section>`);
  onSubmit($('#accept'), async () => {
    track('begin_checkout', ecommerce(d));
    const { checkout_id } = await api(`/api/deals/${encodeURIComponent(token)}/accept`, { method: 'POST', body: {} });
    await details(d, checkout_id);
    scrollTo(0, 0);
  });
}

async function details(d, checkoutId) {
  const banks = await getBanks();
  show('#app', html`${steps(2)}<section class="card">
    <h1>Your details</h1>
    <p class="muted">${d.item_title} → ${d.delivery.state} · <strong>${money(d.price.total)}</strong> · <button class="linklike" id="back">review the deal again</button></p>
    <form class="form" id="pay">
      <label>Full name <small>as on your bank account</small><input name="buyer_name" required autocomplete="name"></label>
      <div class="grid2">
        <label>Phone number <small>for the rider &amp; your delivery PIN</small><input name="buyer_phone" required inputmode="tel" autocomplete="tel"></label>
        <label>Email <small>for your receipt</small><input name="buyer_email" type="email" required autocomplete="email"></label>
      </div>
      <fieldset><legend>Refund account</legend>
        <p class="muted small">Only used if you are owed a refund. It must be in your own name. The seller never sees it.</p>
        <div class="grid2">
          <label>Bank <select name="refund_bank_code" required>${bankOptions(banks)}</select></label>
          <label>Account number <input name="refund_account_number" required inputmode="numeric" pattern="\\d{10}" maxlength="10"></label>
        </div>
        ${testAccountsHint(config)}
      </fieldset>
      <button class="btn btn-block">Pay ${money(d.price.total)} securely</button>
      <p class="muted small center">Your payment is secured under the deal rules. The seller is not paid until delivery and inspection.</p>
    </form>
  </section>`);
  $('#back').addEventListener('click', () => { track('deal_review_again'); load(); });
  onSubmit($('#pay'), async (data) => {
    const res = await api(`/api/deals/${encodeURIComponent(token)}/pay`, {
      method: 'POST',
      body: { ...data, checkout_id: checkoutId, expected_total: d.price.total },
    });
    trackThenGo('add_payment_info', { ...ecommerce(d), payment_type: 'payment_page' }, res.payment_url);
  });
}

async function load() {
  const { deal, rules } = await api(`/api/deals/${encodeURIComponent(token)}`);
  if (deal.status !== 'open') {
    track('deal_unavailable', { deal_status: deal.status });
    show('#app', html`<section class="card narrow"><h1>This link can’t be paid</h1><p>${UNAVAILABLE[deal.status]}</p></section>`);
    return;
  }
  if (!viewed) { viewed = true; track('view_item', ecommerce(deal)); }
  review(deal, rules);
}
let viewed = false;
if (!token) {
  show('#app', html`<section class="card narrow"><h1>Open your payment link</h1>
    <p>This page needs the payment link from your SMS or WhatsApp message. Please open that link again.</p></section>`);
} else {
  load().catch(fail);
}
