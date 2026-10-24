import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, flash, fail, trackThenGo, gallery, $ } from '../core.js';

await shell('seller');

async function render() {
  const { order: o, dispute, events } = await api(`/api/seller/orders/${encodeURIComponent(params.get('id'))}`, { as: 'seller' });
  show('#app', html`<section class="card">
    <div class="spread"><h1>Order ${o.ref}</h1>${orderBadge(o.status)}</div>
    <p><strong>${o.item_title}</strong> · ${money(o.seller_payout)} to you after delivery</p>
    ${gallery(o.photos, o.item_title)}
    <p class="muted">Buyer: ${o.buyer_name} · Delivering to ${o.delivery_state}${o.delivery_payer !== 'buyer' ? html` · delivery ${money(o.delivery_fee)} (${o.delivery_payer === 'split' ? 'half' : 'all'} paid by you)` : ''}</p>
    ${o.status === 'paid'
      ? html`<div class="callout info"><strong>The buyer’s money is secured.</strong> Pack the item and book pickup before ${date(o.ship_by)}, or the buyer is refunded.
          <form class="form" id="book">
            <label>Packing note <small>serial/IMEI, colour, size, what’s in the box. This is your evidence if there is a dispute</small>
              <textarea name="packing_note" required rows="3" maxlength="500"></textarea></label>
            <button class="btn">Item is packed, book pickup</button>
          </form></div>`
      : ''}
    ${o.status === 'shipping' ? html`<p>Parcel status: <strong>${o.delivery_label}</strong>${o.courier_status ? html` <span class="muted">(courier: ${o.courier_status})</span>` : ''}</p>` : ''}
    ${o.status === 'delivered' ? html`<p>Delivered ${date(o.delivered_at)}. You are paid when the buyer confirms, or automatically at ${date(o.inspection_ends_at)}.</p>` : ''}
    ${dispute
      ? html`<div class="callout ${dispute.status === 'open' ? 'warn' : 'info'}">
          <strong>${dispute.status === 'open' ? 'Under review' : 'Decided'}:</strong> ${dispute.description}
          ${dispute.resolution_note ? html`<br><strong>Decision:</strong> ${dispute.resolution_note} (paid to you: ${money(dispute.seller_payout || 0)})` : ''}
          ${dispute.status === 'open' ? html`<br><small>Send photos, your packing video or chat screenshots to TrustGap support, quoting ${o.ref}.</small>` : ''}
        </div>`
      : ''}
    <h2>Timeline</h2>${timeline(events)}
  </section>`);
  if ($('#book')) {
    onSubmit($('#book'), async (data) => {
      await api(`/api/seller/orders/${encodeURIComponent(params.get('id'))}/book`, { method: 'POST', body: data, as: 'seller' });
      flash.set('Pickup booked. The buyer has been told.');
      trackThenGo('pickup_booked', {}, location.href);
    });
  }
}
render().catch(fail);
