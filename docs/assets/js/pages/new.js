import { api, html, show, onSubmit, shell, money, link, params, fail, $ } from '../core.js';

const config = await shell('seller');

try {
  const { seller } = await api('/api/seller/me', { as: 'seller' });
  let v = { quantity: 1, delivery_days: 2, expires_hours: 24, pickup_address: seller.pickup_address, pickup_zone: seller.pickup_zone };
  if (params.get('revise')) {
    const { deal } = await api(`/api/seller/deals/${encodeURIComponent(params.get('revise'))}`, { as: 'seller' });
    v = { ...deal, item_price: deal.price.itemPrice / 100, pickup_zone: config.zones.find((z) => z.name === deal.pickup_area)?.id,
      delivery_zone: config.zones.find((z) => z.name === deal.delivery_area)?.id, replaces: deal.status === 'open' ? deal.id : '' };
  }
  const zoneOptions = (sel) => config.zones.map((z) => html`<option value="${z.id}" ${z.id === sel ? 'selected' : ''}>${z.name}</option>`);
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
      <fieldset><legend>Delivery</legend>
        <label>Your pickup address <small>private — only the rider sees it</small>
          <textarea name="pickup_address" required rows="2" maxlength="300">${v.pickup_address || ''}</textarea></label>
        <div class="grid2">
          <label>Your pickup area <select name="pickup_zone" required><option value="">Choose</option>${zoneOptions(v.pickup_zone)}</select></label>
          <label>Buyer’s delivery area <select name="delivery_zone" required><option value="">Choose</option>${zoneOptions(v.delivery_zone)}</select></label>
        </div>
        <p class="muted small">The buyer types their exact address on the payment page. It must be inside the area you choose, because the area sets the delivery price.</p>
        <label>You will hand the item to the courier within
          <select name="delivery_days">${[1, 2, 3, 5, 7].map((n) => html`<option value="${n}" ${n === Number(v.delivery_days) ? 'selected' : ''}>${n} day${n > 1 ? 's' : ''}</option>`)}</select></label>
      </fieldset>
      <fieldset><legend>Who pays what (as agreed)</legend>
        <p class="label">Delivery fee</p>
        <div class="choices">${radio('delivery_payer', 'buyer', 'Buyer pays')}${radio('delivery_payer', 'seller', 'I pay')}</div>
        <p class="label">TrustGap fee (${fee.percent}%) + payment processing</p>
        <p class="muted small">Payment processing passes Flutterwave’s charges on at cost (about ${config.processing.percent}% plus a small payout fee), so together it comes to roughly ${(fee.percent + config.processing.percent + 0.4).toFixed(1)}% of the price. Both lines are shown to the buyer separately.</p>
        <div class="choices">${radio('fee_payer', 'buyer', 'Buyer pays')}${radio('fee_payer', 'seller', 'I pay')}${radio('fee_payer', 'split', 'Split 50/50')}</div>
      </fieldset>
      <label>Link expires if not paid within
        <select name="expires_hours">${config.expiry_options.map((h) => html`<option value="${h}" ${h === Number(v.expires_hours) ? 'selected' : ''}>${h < 24 ? `${h} hour${h > 1 ? 's' : ''}` : `${h / 24} day${h > 24 ? 's' : ''}`}</option>`)}</select></label>
      <button class="btn">Create link</button>
    </form>
  </section>`);

  onSubmit($('#deal'), async (data) => {
    const { deal } = await api('/api/seller/deals', { method: 'POST', body: data, as: 'seller' });
    location.href = link(`seller/deal.html?id=${deal.id}&new=1`);
  });
} catch (err) {
  fail(err);
}
