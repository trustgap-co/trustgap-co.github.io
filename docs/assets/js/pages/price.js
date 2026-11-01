// Seller price calculator: the exact price of a deal (the same quote a link would charge, with the
// real delivery price for both addresses), a message to send the buyer, and a button that opens the
// new-link form with everything filled in.
import { api, html, show, shell, money, fillSiteInfo, sellerQuoteBox, sellerQuoteError, session, link, stateInput, statesList, formData, fail, track, $ } from '../core.js';

const config = await shell('seller');
const KEEP = 'tg_calculator';

try {
  const { seller } = await api('/api/seller/me', { as: 'seller' });
  let saved = {};
  try { saved = JSON.parse(session.get(KEEP) || '{}'); } catch { /* nothing saved */ }
  const v = { weight_kg: 1, delivery_payer: 'buyer', fee_payer: 'buyer', pickup_address: seller.pickup_address, pickup_state: seller.pickup_state, ...saved };
  const radio = (name, value, label) =>
    html`<label class="choice"><input type="radio" name="${name}" value="${value}" ${v[name] === value ? 'checked' : ''} required> ${label}</label>`;

  show('#app', html`<section class="card">
    <h1>Price calculator</h1>
    <p class="muted">Work out the exact price before you make a link: the real delivery price between the two addresses, the fees, and who pays what. Tell the buyer the total, then create the link with one tap.</p>
    <form class="form" id="calc">
      <fieldset><legend>The item</legend>
        <label>Item name <small>optional, for the message to the buyer</small><input name="item_title" maxlength="120" value="${v.item_title || ''}" placeholder="iPhone 13, 128GB, Midnight"></label>
        <div class="grid2">
          <label>Item price (₦) <input name="item_price" required inputmode="decimal" value="${v.item_price || ''}" placeholder="45000"></label>
          <label>Parcel weight (kg) <small>packed, roughly</small><input name="weight_kg" type="number" min="1" max="100" step="1" value="${v.weight_kg || 1}" required></label>
        </div>
      </fieldset>
      ${statesList(config.states)}
      <fieldset><legend>From you</legend>
        <label>Your pickup address <small>street, area and city</small>
          <textarea name="pickup_address" rows="2" maxlength="300" placeholder="12 Allen Avenue, Ikeja, Lagos">${v.pickup_address || ''}</textarea></label>
        <label>State you ship from ${stateInput('pickup_state', v.pickup_state)}</label>
      </fieldset>
      <fieldset><legend>To the buyer</legend>
        <label>Buyer’s delivery address <small>street, area and city</small>
          <textarea name="delivery_address" rows="2" maxlength="300" placeholder="5 Admiralty Way, Lekki Phase 1, Lagos">${v.delivery_address || ''}</textarea></label>
        <div class="grid2">
          <label>Buyer’s state ${stateInput('delivery_state', v.delivery_state)}</label>
          <label>Nearest landmark <small>optional</small><input name="delivery_landmark" maxlength="200" value="${v.delivery_landmark || ''}"></label>
        </div>
      </fieldset>
      <fieldset><legend>Who pays what</legend>
        <p class="label">Delivery fee</p>
        <div class="choices">${radio('delivery_payer', 'buyer', 'Buyer pays')}${radio('delivery_payer', 'seller', 'I pay')}${radio('delivery_payer', 'split', 'Split 50/50')}</div>
        <p class="label">TrustGap fee + payment processing</p>
        <div class="choices">${radio('fee_payer', 'buyer', 'Buyer pays')}${radio('fee_payer', 'seller', 'I pay')}${radio('fee_payer', 'split', 'Split 50/50')}</div>
        <label>Early-access code <small>optional</small>
          <input name="promo_code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. EARLYGAP" value="${v.promo_code || ''}" class="code-input"></label>
      </fieldset>
    </form>
    <div id="result" class="pricebox"><p class="muted small">Enter the price and both states to see the exact amounts.</p></div>
    <div id="next" hidden>
      <p class="label" style="margin-top:16px">Message for the buyer</p>
      <textarea id="for-buyer" rows="5" readonly></textarea>
      <div class="actions">
        <button type="button" class="btn btn-secondary" id="copy">Copy message</button>
        <button type="button" class="btn" id="make">Create a payment link with these details →</button>
      </div>
      <p class="muted small">The link uses the price at the moment you create it. Delivery prices can change, so create it soon after quoting.</p>
    </div>
  </section>`);

  const form = $('#calc');
  let timer;
  let last = '';
  let quoted = null;
  const save = () => session.set(KEEP, JSON.stringify(formData(form)));

  function buyerMessage(q, d) {
    const p = q.price;
    const lines = [
      `${d.item_title?.trim() || 'Your order'}: total ${money(p.buyerTotal)}`,
      `Item ${money(p.itemPrice)}`,
      p.buyerDelivery ? `Delivery to ${q.delivery_state} ${money(p.buyerDelivery)}${d.delivery_payer === 'split' ? ' (your half)' : ''}` : 'Delivery: paid by me',
      p.buyerFeeShare ? `TrustGap protection and payment processing ${money(p.buyerFeeShare)}${d.fee_payer === 'split' ? ' (your half)' : ''}` : 'TrustGap fees: paid by me',
      '',
      'You pay through a TrustGap link: your money is held safely and I’m paid only after you receive and check the item. I’ll send the link now.',
    ];
    return lines.join('\n');
  }

  async function calculate() {
    const d = formData(form);
    save();
    if (!d.item_price || !d.pickup_state || !d.delivery_state || !d.delivery_payer || !d.fee_payer) return;
    const key = JSON.stringify([d.item_price, d.pickup_state, d.delivery_state, d.weight_kg, d.delivery_payer, d.fee_payer, d.promo_code?.trim()]);
    if (key === last) {
      if (quoted) $('#for-buyer').value = buyerMessage(quoted, d);
      return;
    }
    last = key;
    show('#result', html`<p class="muted small">Calculating…</p>`);
    try {
      const q = await api('/api/seller/quote', { method: 'POST', body: d, as: 'seller' });
      if (key !== last) return;
      quoted = q;
      show('#result', sellerQuoteBox(q, d, config.fee));
      $('#for-buyer').value = buyerMessage(q, d);
      $('#next').hidden = false;
    } catch (err) {
      if (key !== last) return;
      quoted = null;
      show('#result', sellerQuoteError(err));
      fillSiteInfo();
      $('#next').hidden = true;
      last = '';
    }
  }
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(calculate, 600); });
  form.addEventListener('change', calculate);
  calculate();

  $('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#for-buyer').value); } catch { $('#for-buyer').select(); document.execCommand?.('copy'); }
    $('#copy').textContent = 'Copied ✓';
    setTimeout(() => { $('#copy').textContent = 'Copy message'; }, 2000);
    track('price_quote_copied', { delivery_state: formData(form).delivery_state });
  });
  $('#make').addEventListener('click', () => {
    save();
    track('price_quote_to_link', {});
    location.href = link('seller/new.html?from=calculator');
  });
} catch (err) {
  fail(err);
}
