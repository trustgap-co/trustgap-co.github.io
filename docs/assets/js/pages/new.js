import { api, html, show, onSubmit, shell, money, link, params, stateInput, statesList, formData, fail, track, trackThenGo, $ } from '../core.js';

const config = await shell('seller');

try {
  const { seller } = await api('/api/seller/me', { as: 'seller' });
  let v = { quantity: 1, weight_kg: 1, delivery_days: 2, expires_hours: 24, pickup_address: seller.pickup_address, pickup_state: seller.pickup_state };
  if (params.get('revise')) {
    const { deal } = await api(`/api/seller/deals/${encodeURIComponent(params.get('revise'))}`, { as: 'seller' });
    v = { ...deal, item_price: deal.price.itemPrice / 100, replaces: deal.status === 'open' ? deal.id : '' };
  }
  const radio = (name, value, label) =>
    html`<label class="choice"><input type="radio" name="${name}" value="${value}" ${v[name] === value ? 'checked' : ''} required> ${label}</label>`;
  const { fee } = config;

  show('#app', html`<section class="card">
    <h1>${v.replaces ? 'Revise payment link' : 'New payment link'}</h1>
    <p class="muted">Fill this in exactly as you agreed with the buyer on WhatsApp or Instagram. The buyer sees all of it before paying, and it can’t be changed afterwards.</p>
    <form class="form" id="deal">
      ${v.replaces ? html`<input type="hidden" name="replaces" value="${v.replaces}">` : ''}
      <fieldset><legend>The item</legend>
        <label>Item name <input name="item_title" required maxlength="120" value="${v.item_title || ''}" placeholder="Nike Tech Fleece sneakers, size 42, blue"></label>
        <label>Full description <small>colour, size, model, what’s in the box, any defects</small>
          <textarea name="item_description" required rows="4" maxlength="1000">${v.item_description || ''}</textarea></label>
        <div class="grid2">
          <label>Condition <select name="item_condition" required><option value="">Choose</option>
            ${config.conditions.map((c) => html`<option ${c === v.item_condition ? 'selected' : ''}>${c}</option>`)}</select></label>
          <label>Quantity <input name="quantity" type="number" min="1" max="100" value="${v.quantity}" required></label>
        </div>
        <label>Item price (₦) <input name="item_price" required inputmode="decimal" value="${v.item_price || ''}" placeholder="45000"></label>
      </fieldset>
      ${statesList(config.states)}
      <fieldset><legend>Pickup (you)</legend>
        <label>Your pickup address <small>street, area and city. Private: only the courier sees it</small>
          <textarea name="pickup_address" required rows="2" maxlength="300" placeholder="12 Allen Avenue, Ikeja, Lagos">${v.pickup_address || ''}</textarea></label>
        <div class="grid2">
          <label>State you ship from ${stateInput('pickup_state', v.pickup_state)}</label>
          <label>Parcel weight (kg) <small>packed, roughly</small>
            <input name="weight_kg" type="number" min="1" max="100" step="1" value="${v.weight_kg || 1}" required></label>
        </div>
        <label class="choice"><input type="checkbox" name="fragile" value="yes" ${v.fragile ? 'checked' : ''}> Fragile, handle with care</label>
      </fieldset>
      <fieldset><legend>Delivery (the buyer)</legend>
        <p class="muted small">Ask the buyer to send their delivery address in the chat and copy it here. They will see it on the link and confirm it before paying.</p>
        <label>Buyer’s delivery address <small>street, area and city</small>
          <textarea name="delivery_address" required rows="2" maxlength="300" placeholder="5 Admiralty Way, Lekki Phase 1, Lagos">${v.delivery_address || ''}</textarea></label>
        <div class="grid2">
          <label>Buyer’s state ${stateInput('delivery_state', v.delivery_state)}</label>
          <label>Nearest landmark <small>optional</small><input name="delivery_landmark" maxlength="200" value="${v.delivery_landmark || ''}"></label>
        </div>
        <label>You will hand the item to the courier within
          <select name="delivery_days">${[1, 2, 3, 5, 7].map((n) => html`<option value="${n}" ${n === Number(v.delivery_days) ? 'selected' : ''}>${n} day${n > 1 ? 's' : ''}</option>`)}</select></label>
      </fieldset>
      <fieldset><legend>Who pays what (as agreed)</legend>
        <p class="label">Delivery fee</p>
        <div class="choices">${radio('delivery_payer', 'buyer', 'Buyer pays')}${radio('delivery_payer', 'seller', 'I pay')}${radio('delivery_payer', 'split', 'Split 50/50')}</div>
        <p class="label">TrustGap fee (${fee.percent}%) + payment processing</p>
        <p class="muted small">Payment processing passes Flutterwave’s charges on at cost (about ${config.processing.percent}% plus a small payout fee), so together it comes to roughly ${(fee.percent + config.processing.percent + 0.4).toFixed(1)}% of the price. Both lines are shown to the buyer separately.</p>
        <div class="choices">${radio('fee_payer', 'buyer', 'Buyer pays')}${radio('fee_payer', 'seller', 'I pay')}${radio('fee_payer', 'split', 'Split 50/50')}</div>
      </fieldset>
      <label>Link expires if not paid within
        <select name="expires_hours">${config.expiry_options.map((h) => html`<option value="${h}" ${h === Number(v.expires_hours) ? 'selected' : ''}>${h < 24 ? `${h} hour${h > 1 ? 's' : ''}` : `${h / 24} day${h > 24 ? 's' : ''}`}</option>`)}</select></label>
      <div id="preview" class="pricebox"><p class="muted small">Fill in the price, both states and who pays to see the exact amounts.</p></div>
      <button class="btn">Create link</button>
    </form>
  </section>`);

  // Live price: the same calculation the link will use, so the seller knows exactly what they get.
  const form = $('#deal');
  const payerLabel = { buyer: 'paid by buyer', seller: 'paid by you', split: 'split 50/50' };
  let timer;
  let started = false;
  let last = '';
  async function preview() {
    const d = formData(form);
    if (!d.item_price || !d.pickup_state || !d.delivery_state || !d.delivery_payer || !d.fee_payer) return;
    const key = JSON.stringify([d.item_price, d.pickup_state, d.delivery_state, d.weight_kg, d.delivery_payer, d.fee_payer]);
    if (key === last) return;
    last = key;
    show('#preview', html`<p class="muted small">Calculating…</p>`);
    try {
      const { price: p, delivery_state } = await api('/api/seller/quote', { method: 'POST', body: d, as: 'seller' });
      if (key !== last) return;
      show('#preview', html`<table class="breakdown">
        <tr><td>Item price</td><td>${money(p.itemPrice)}</td></tr>
        <tr><td>Delivery to ${delivery_state} (${payerLabel[d.delivery_payer]})</td><td>${money(p.deliveryFee)}</td></tr>
        <tr><td>TrustGap fee ${fee.percent}% (${payerLabel[d.fee_payer]})</td><td>${money(p.platformFee)}</td></tr>
        <tr><td>Payment processing (${payerLabel[d.fee_payer]})</td><td>${money(p.processingFee)}</td></tr>
        <tr class="total"><td>Buyer pays</td><td>${money(p.buyerTotal)}</td></tr>
        <tr class="total"><td>You receive after delivery</td><td>${money(p.sellerPayout)}</td></tr>
      </table>`);
    } catch (err) {
      if (key === last) show('#preview', html`<div class="error">${err.message}</div>`);
      last = '';
    }
  }
  form.addEventListener('input', () => {
    if (!started) { started = true; track('deal_form_started', { is_revision: Boolean(v.replaces) }); }
    clearTimeout(timer);
    timer = setTimeout(preview, 600);
  });
  form.addEventListener('change', preview);
  preview();

  onSubmit($('#deal'), async (data) => {
    const { deal } = await api('/api/seller/deals', { method: 'POST', body: data, as: 'seller' });
    const price = Number(String(data.item_price).replace(/[^\d.]/g, '')) || 0;
    trackThenGo('deal_link_created', {
      currency: 'NGN', value: price * (Number(data.quantity) || 1), item_condition: data.item_condition, quantity: Number(data.quantity) || 1,
      delivery_payer: data.delivery_payer, fee_payer: data.fee_payer, pickup_state: data.pickup_state, delivery_state: data.delivery_state,
      expires_hours: Number(data.expires_hours), is_revision: Boolean(data.replaces),
    }, link(`seller/deal.html?id=${deal.id}&new=1`));
  });
} catch (err) {
  fail(err);
}
