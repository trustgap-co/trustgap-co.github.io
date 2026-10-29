// Public pages with a fee calculator (fees.html, sellers.html). The maths is a copy of
// worker/src/lib/money.js `quote()` so the estimate matches what a real deal link charges.
// Fee settings come from the live API; the defaults below are used if it can't be reached.
import { shell, html, show, money, track, naira, $ } from '../core.js';

const config = await shell('public');
const fee = config.fee || { percent: 1.5, minKobo: 10000, maxKobo: 300000 };
const processing = config.processing || { percent: 2, payoutFeeKobo: 5779, capKobo: 200000 };

const ceilNaira = (kobo) => Math.ceil(kobo / 100) * 100;
const buyerPart = (payer, amount) => (payer === 'buyer' ? amount : payer === 'split' ? Math.ceil(amount / 200) * 100 : 0);

function quote({ itemPrice, deliveryFee, deliveryPayer, feePayer }) {
  const buyerShare = feePayer === 'buyer' ? 1 : feePayer === 'split' ? 0.5 : 0;
  const buyerDelivery = buyerPart(deliveryPayer, deliveryFee);
  const raw = Math.max(fee.minKobo, Math.round((itemPrice * fee.percent) / 100));
  const pf = fee.maxKobo ? Math.min(fee.maxKobo, raw) : raw;
  const r = processing.percent / 100;
  const allowance = buyerShare === 0.5 ? 200 : 0;
  const grossed = (r * (itemPrice + buyerDelivery + buyerShare * pf + allowance) + processing.payoutFeeKobo) / (1 - r * buyerShare);
  const pr = ceilNaira(processing.capKobo ? Math.min(grossed, processing.capKobo + processing.payoutFeeKobo) : grossed);
  const buyerFees = buyerPart(feePayer, pf) + buyerPart(feePayer, pr);
  return {
    itemPrice, deliveryFee, pf, pr, buyerDelivery, buyerFees,
    buyerTotal: itemPrice + buyerDelivery + buyerFees,
    sellerPayout: itemPrice - (deliveryFee - buyerDelivery) - (pf + pr - buyerFees),
  };
}

const PAYERS = [['buyer', 'Buyer'], ['split', 'Half each'], ['seller', 'Seller']];
const radios = (name, checked) => html`<div class="seg">${PAYERS.map(([v, l]) =>
  html`<label><input type="radio" name="${name}" value="${v}" ${v === checked ? 'checked' : ''}><span>${l}</span></label>`)}</div>`;
const toKobo = (v) => Math.round(Number(String(v).replace(/[^\d.]/g, '')) * 100) || 0;

const root = $('#fee-calc');
show(root, html`<div class="calc">
  <form class="form tile" id="calc-form">
    <label>Item price (₦)<input name="price" inputmode="numeric" value="45,000"></label>
    <label>Delivery fee (₦) <small>estimate; the real courier price is shown when the seller creates the link</small>
      <input name="delivery" inputmode="numeric" value="3,500"></label>
    <fieldset><legend>Who pays delivery?</legend>${radios('deliveryPayer', 'buyer')}</fieldset>
    <fieldset><legend>Who pays the fees?</legend>${radios('feePayer', 'buyer')}</fieldset>
  </form>
  <div class="mock" aria-live="polite" id="calc-out"></div>
</div>`);

function render() {
  const f = Object.fromEntries(new FormData($('#calc-form')));
  const q = quote({ itemPrice: toKobo(f.price), deliveryFee: toKobo(f.delivery), deliveryPayer: f.deliveryPayer, feePayer: f.feePayer });
  const who = (payer) => ({ buyer: 'buyer', seller: 'seller', split: 'half each' })[payer];
  show($('#calc-out'), q.itemPrice < 100 * 100 ? html`<p class="muted">Enter an item price to see the breakdown.</p>` : html`
    <p class="eyebrow" style="margin:0 0 8px">Estimate</p>
    <div class="row2"><span>Item price</span><span>${money(q.itemPrice)}</span></div>
    <div class="row2"><span>Delivery <small class="muted">(${who(f.deliveryPayer)})</small></span><span>${money(q.deliveryFee)}</span></div>
    <div class="row2"><span>TrustGap fee ${fee.percent}%${fee.maxKobo && q.pf >= fee.maxKobo ? ` (capped at ${money(fee.maxKobo)})` : ''} <small class="muted">(${who(f.feePayer)})</small></span><span>${money(q.pf)}</span></div>
    <div class="row2"><span>Payment processing <small class="muted">(${who(f.feePayer)})</small></span><span>${money(q.pr)}</span></div>
    <div class="row2 tot"><span>Buyer pays</span><span>${money(q.buyerTotal)}</span></div>
    <div class="row2 tot"><span>Seller receives</span><span>${money(q.sellerPayout)}</span></div>
    <p class="small muted" style="margin-bottom:0">Estimate only. Payment processing is Flutterwave’s ${processing.percent}%${processing.capKobo ? ` (capped at ${money(processing.capKobo)})` : ''} plus a payout fee of up to
      ${money(processing.payoutFeeKobo)}, passed on at cost. The deal link shows the exact amounts before anyone pays.</p>`);
}
// One analytics event per pause in typing, with the numbers tried (no personal data).
let idle;
$('#calc-form').addEventListener('input', () => {
  render();
  clearTimeout(idle);
  idle = setTimeout(() => {
    const f = Object.fromEntries(new FormData($('#calc-form')));
    const q = quote({ itemPrice: toKobo(f.price), deliveryFee: toKobo(f.delivery), deliveryPayer: f.deliveryPayer, feePayer: f.feePayer });
    track('fee_calculator_used', { currency: 'NGN', item_price: naira(q.itemPrice), delivery_fee: naira(q.deliveryFee),
      delivery_payer: f.deliveryPayer, fee_payer: f.feePayer, buyer_total: naira(q.buyerTotal), seller_payout: naira(q.sellerPayout) });
  }, 1500);
});
render();
