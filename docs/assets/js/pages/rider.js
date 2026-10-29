// Private rider page (signed link, expires after 14 days): parcel updates and the buyer's PIN, or for a
// return, collection from the buyer and the seller's return PIN at hand-back.
import { api, html, show, onSubmit, shell, params, flash, fail, keepFresh, $ } from '../core.js';

await shell('buyer');
const path = `/api/rider/${encodeURIComponent(params.get('t') || '')}`;

// The rider's account of a reported problem (one case: the buyer may have reported it first).
const accountForm = (o, intro) => html`${intro ? html`<div class="callout info"><strong>A problem has been reported on this delivery.</strong> Add what you saw, so TrustGap has your account too.</div>` : ''}
  ${o.case.mine.length ? html`<ul class="small">${o.case.mine.map((m) => html`<li>Your account: ${m.body}</li>`)}</ul>` : ''}
  <form class="form" id="account">
    <fieldset><legend>Where is the parcel now?</legend>
      <div class="choices"><label class="choice"><input type="radio" name="parcel" value="rider"> I have it</label>
      <label class="choice"><input type="radio" name="parcel" value="buyer"> I left it with the buyer</label></div></fieldset>
    <label>What happened <textarea name="body" required rows="3" maxlength="2000"></textarea></label>
    <button class="btn">Add my account</button>
  </form>`;

async function render() {
  const { order: o } = await api(path);
  const btn = (status, label, tone = '') => html`<button class="btn ${tone}" name="status" value="${status}">${label}</button>`;
  show('#app', html`<section class="card">
    <div class="spread"><h1>${o.mode === 'return' ? 'Return' : 'Delivery'} ${o.ref}</h1><span class="badge badge-info">${o.delivery_label}</span></div>
    ${o.mode === 'return' ? html`<p class="callout warn">Return to the seller: collect from the buyer, deliver to the seller.</p>` : ''}
    <h2>Item</h2>
    <p><strong>${o.item_title}</strong> (${o.item_condition}, ×${o.quantity})</p>
    <p class="pre small">${o.item_description}</p>
    <p class="small"><strong>Seller’s packing note:</strong> ${o.packing_note}</p>
    <div class="grid2">
      <div><h2>Pick up${o.mode === 'return' ? ' (buyer)' : ''}</h2><p>${o.pickup.name}<br><a href="tel:${o.pickup.phone}">${o.pickup.phone}</a><br>${o.pickup.address}</p></div>
      <div><h2>Deliver to${o.mode === 'return' ? ' (seller)' : ''}</h2><p>${o.dropoff.name}<br><a href="tel:${o.dropoff.phone}">${o.dropoff.phone}</a><br>${o.dropoff.address}
        ${o.dropoff.landmark ? html`<br><em>Near ${o.dropoff.landmark}</em>` : ''}</p></div>
    </div>
    ${o.return?.open
      ? html`${o.mode === 'return'
          ? html`<form class="form" id="status">
              <div class="actions">${btn('picked_up', 'Collected from buyer')}${btn('out_for_delivery', 'On the way to seller')}</div>
              <label>If collection failed, say what happened <input name="note" maxlength="500"></label>
              <div class="actions">${btn('attempt_failed', 'Buyer not available', 'btn-secondary')}</div>
            </form>`
          : html`<p class="callout warn">The buyer refused this parcel. Take it back to the seller.</p>`}
        <form class="form pinform" id="return-pin">
          <p class="small">Let the seller check the item. They give you their return PIN only if it’s their item.</p>
          <label>Seller’s 4-digit return PIN <input name="pin" class="codeinput" inputmode="numeric" pattern="\\d{4}" maxlength="4" required></label>
          <button class="btn btn-block">Confirm hand-back to seller</button>
        </form>
        ${o.mode === 'delivery' && o.case?.open ? html`<details class="rules"><summary>Add what you saw at the door</summary>${accountForm(o, false)}</details>` : ''}`
      : o.case?.open
        ? accountForm(o, true)
      : o.mode === 'return'
        ? html`<p class="muted">${o.return?.status === 'received' ? 'Handed back. Nothing more to do.' : 'Nothing to do for this return.'}</p>`
      : o.status === 'shipping'
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
      : html`<p class="muted">Nothing to do for this delivery.</p>`}
  </section>`);
  if ($('#status')) {
    onSubmit($('#status'), async (data) => {
      await api(path + '/status', { method: 'POST', body: data });
      flash.set('Updated.');
      location.reload();
    });
  }
  if ($('#account')) {
    onSubmit($('#account'), async (data) => {
      await api(path + '/statement', { method: 'POST', body: data });
      flash.set('Your account was added. Thank you.');
      location.reload();
    });
  }
  if ($('#return-pin')) {
    onSubmit($('#return-pin'), async (data) => {
      await api(path + '/return-pin', { method: 'POST', body: data });
      flash.set('Hand-back confirmed. Thank you!');
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
render().then(() => keepFresh(path, render)).catch(fail);
