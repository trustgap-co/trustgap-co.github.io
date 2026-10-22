// Private rider page (signed link, expires after 14 days): parcel updates and the buyer's PIN.
import { api, html, show, onSubmit, shell, params, flash, fail, $ } from '../core.js';

await shell('buyer');
const path = `/api/rider/${encodeURIComponent(params.get('t') || '')}`;

async function render() {
  const { order: o } = await api(path);
  const btn = (status, label, tone = '') => html`<button class="btn ${tone}" name="status" value="${status}">${label}</button>`;
  show('#app', html`<section class="card">
    <div class="spread"><h1>Delivery ${o.ref}</h1><span class="badge badge-info">${o.delivery_label}</span></div>
    <h2>Item</h2>
    <p><strong>${o.item_title}</strong> (${o.item_condition}, ×${o.quantity})</p>
    <p class="pre small">${o.item_description}</p>
    <p class="small"><strong>Seller’s packing note:</strong> ${o.packing_note}</p>
    <div class="grid2">
      <div><h2>Pick up</h2><p>${o.pickup.name}<br><a href="tel:${o.pickup.phone}">${o.pickup.phone}</a><br>${o.pickup.address}</p></div>
      <div><h2>Deliver to</h2><p>${o.dropoff.name}<br><a href="tel:${o.dropoff.phone}">${o.dropoff.phone}</a><br>${o.dropoff.address}
        ${o.dropoff.landmark ? html`<br><em>Near ${o.dropoff.landmark}</em>` : ''}</p></div>
    </div>
    ${o.status === 'shipping'
      ? html`<form class="form" id="status">
          <div class="actions">${btn('picked_up', 'Picked up')}${btn('out_for_delivery', 'Out for delivery')}</div>
          <label>If delivery failed or was refused, say what happened <input name="note" maxlength="500"></label>
          <div class="actions">${btn('attempt_failed', 'Buyer not available', 'btn-secondary')}${btn('refused', 'Buyer refused item', 'btn-danger')}</div>
        </form>
        <form class="form pinform" id="pin">
          <p class="small">Let the buyer check the item. They give you their PIN only if it matches.</p>
          <label>Buyer’s 4-digit delivery PIN <input name="pin" class="codeinput" inputmode="numeric" pattern="\\d{4}" maxlength="4" required></label>
          <button class="btn btn-block">Confirm delivery</button>
        </form>`
      : o.delivery_status === 'refused'
        ? html`<form class="form" id="status">${btn('returned', 'Returned to seller')}</form>`
        : html`<p class="muted">Nothing to do for this delivery.</p>`}
  </section>`);
  if ($('#status')) {
    onSubmit($('#status'), async (data) => {
      await api(path + '/status', { method: 'POST', body: data });
      flash.set('Updated.');
      location.reload();
    });
  }
  if ($('#pin')) {
    onSubmit($('#pin'), async (data) => {
      await api(path + '/pin', { method: 'POST', body: data });
      flash.set('Delivery confirmed. Thank you!');
      location.reload();
    });
  }
}
render().catch(fail);
