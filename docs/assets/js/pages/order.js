import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, flash, fail, trackThenGo, gallery, confirmModal, $ } from '../core.js';

await shell('seller');

async function render() {
  const { order: o, dispute, return: ret, events } = await api(`/api/seller/orders/${encodeURIComponent(params.get('id'))}`, { as: 'seller' });
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
          <strong>${dispute.status === 'open' ? 'Under review' : dispute.status === 'awaiting_return' ? 'Decided, waiting for the return' : 'Decided'}:</strong> ${dispute.description}
          ${dispute.resolution_note ? html`<br><strong>Decision:</strong> ${dispute.resolution_note} (paid to you: ${money(dispute.seller_payout || 0)})` : ''}
          ${dispute.status === 'open' ? html`<br><small>Send photos, your packing video or chat screenshots to TrustGap support, quoting ${o.ref}.</small>` : ''}
        </div>`
      : ''}
    ${ret?.open
      ? html`<div class="callout warn return-box"><strong>The item is coming back to you.</strong> ${ret.label}.
          <p class="return-pin-label">Your return PIN</p>
          <p class="pin">${ret.pin}</p>
          <p class="small">Check the item when the rider arrives. If it’s your item, give the rider this PIN. If it isn’t, or it’s been swapped,
            don’t accept it and contact TrustGap support quoting ${o.ref}. The buyer’s refund is only sent once you have the item back.</p>
          <form id="return-received"><button class="btn btn-secondary btn-small">I already have it back</button></form></div>`
      : ret?.status === 'received' ? html`<p class="ok-text">Item back with you${ret.received_at ? ` (${date(ret.received_at)})` : ''}.</p>` : ''}
    <h2>Timeline</h2>${timeline(events)}
  </section>`);
  if ($('#return-received')) {
    onSubmit($('#return-received'), async () => {
      const yes = await confirmModal({
        title: 'Do you have the item back?',
        body: 'Only confirm if you have checked it and it’s your item. Confirming releases the buyer’s refund and can’t be undone.',
        confirm: 'Yes, I have it back',
      });
      if (!yes) return;
      await api(`/api/seller/orders/${encodeURIComponent(params.get('id'))}/return-received`, { method: 'POST', body: {}, as: 'seller' });
      flash.set('Thanks. The return is recorded.');
      location.reload();
    });
  }
  if ($('#book')) {
    onSubmit($('#book'), async (data) => {
      await api(`/api/seller/orders/${encodeURIComponent(params.get('id'))}/book`, { method: 'POST', body: data, as: 'seller' });
      flash.set('Pickup booked. The buyer has been told.');
      trackThenGo('pickup_booked', {}, location.href);
    });
  }
}
render().catch(fail);
