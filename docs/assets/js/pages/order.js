import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, flash, fail, trackThenGo, gallery, confirmModal, caseAccounts, keepFresh, $ } from '../core.js';
import { photoPicker } from '../photos.js';

const orderPath = `/api/seller/orders/${encodeURIComponent(params.get('id'))}`;

await shell('seller');

async function render() {
  const { order: o, dispute, return: ret, case: kase, events } = await api(`/api/seller/orders/${encodeURIComponent(params.get('id'))}`, { as: 'seller' });
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
          ${dispute.status === 'open' && !kase ? html`<br><small>Send photos, your packing video or chat screenshots to TrustGap support, quoting ${o.ref}.</small>` : ''}
        </div>`
      : ''}
    ${ret?.open
      ? html`<div class="callout warn return-box"><strong>The item is coming back to you.</strong> ${ret.label}.
          <p class="return-pin-label">Your return PIN</p>
          <p class="pin">${ret.pin}</p>
          <p class="small">When the rider arrives, open the parcel and check the item <strong>before</strong> giving this PIN. The buyer’s refund is sent once you give it.</p>
          <ul class="small">
            <li><strong>It’s your item, as you sent it:</strong> give the rider the PIN.</li>
            <li><strong>It isn’t right</strong> (swapped, damaged, parts missing): accept the parcel, but first report it below with photos. Then give the rider the PIN so they can leave. The refund stays on hold while TrustGap reviews.</li>
          </ul>
          <details class="rules" id="problem-box"><summary>It came back, but it isn’t right</summary>
            <form class="form" id="return-problem">
              <label>What’s wrong? <small>what you sent vs what came back</small><textarea name="description" required minlength="10" maxlength="2000" rows="3"></textarea></label>
              <p class="live-note"><strong>Take the photos now with the TrustGap camera</strong>, in front of the rider if you can. Each photo is stamped with the order number and time.</p>
              <div class="photo-grid" id="rp-grid"></div>
              <button type="button" class="btn photo-add" id="rp-camera">📷 Open the TrustGap camera</button>
              <details class="cam-fallback" id="rp-fallback"><summary>Can’t use the camera?</summary>
                <p class="small muted">Choose a photo from your phone instead. It will be marked as not taken with the TrustGap camera.</p>
                <label class="btn btn-secondary btn-small photo-add" id="rp-add">Choose a photo
                  <input type="file" accept="image/*" capture="environment" id="rp-input" class="visually-hidden"></label></details>
              <p class="muted small" id="rp-note" aria-live="polite"></p>
              <button class="btn btn-danger">Report the problem</button>
            </form></details>
          <form id="return-received"><button class="btn btn-secondary btn-small">I already have it back, and it’s fine</button></form></div>`
      : ret?.problem ? html`<div class="callout warn"><strong>You reported the returned item isn’t right.</strong> TrustGap is reviewing; the buyer’s refund is on hold.
          ${ret.pin ? html`<br>If a courier rider is still waiting, give them your return PIN so they can close the job: <strong class="pin-inline">${ret.pin}</strong>` : ''}</div>`
      : ret?.status === 'received' ? html`<p class="ok-text">Item back with you${ret.received_at ? ` (${date(ret.received_at)})` : ''}.</p>` : ''}
    ${kase ? html`<section class="case-box"><h2>What’s been said</h2>
      <p class="small muted">One case for this problem. Add your side with photos (your packing photos or video help most). TrustGap reads every account before deciding.</p>
      ${caseAccounts(kase, { me: 'seller' })}
      <details class="rules" ${kase.parties_heard.includes('seller') ? '' : 'open'}><summary>${kase.parties_heard.includes('seller') ? 'Add more to your side' : 'Add your side'}</summary>
        <form class="form" id="side">
          <label>What happened <small>what you sent, how it was packed, anything the buyer or rider said</small><textarea name="body" required rows="3" maxlength="2000"></textarea></label>
          <div class="photo-grid" id="sd-grid"></div>
          <button type="button" class="btn btn-secondary photo-add" id="sd-camera">📷 Add photos with the TrustGap camera</button>
          <details class="cam-fallback" id="sd-fallback"><summary>Have photos from when you packed it?</summary>
            <p class="small muted">Choose them from your phone. They’re marked as not taken with the TrustGap camera, which is fine for packing photos taken earlier.</p>
            <label class="btn btn-secondary btn-small photo-add" id="sd-add">Choose a photo
              <input type="file" accept="image/*" id="sd-input" class="visually-hidden"></label></details>
          <p class="muted small" id="sd-note" aria-live="polite"></p>
          <button class="btn">Add to the case</button>
        </form></details></section>` : ''}
    <h2>Timeline</h2>${timeline(events)}
  </section>`);
  if ($('#side')) {
    const side = photoPicker({ grid: $('#sd-grid'), input: $('#sd-input'), add: $('#sd-add'), note: $('#sd-note'), max: 2,
      hint: 'Up to 2 photos.', cameraButton: $('#sd-camera'), fallback: $('#sd-fallback'),
      getStamp: async () => (await api(orderPath + '/photo-stamp', { as: 'seller' })).stamp });
    onSubmit($('#side'), async (data) => {
      await api(orderPath + '/statement', { method: 'POST', body: { ...data, photos: side.list() }, as: 'seller' });
      flash.set('Added to the case.');
      location.reload();
    });
  }
  if ($('#return-problem')) {
    const picker = photoPicker({ grid: $('#rp-grid'), input: $('#rp-input'), add: $('#rp-add'), note: $('#rp-note'), max: 3,
      hint: 'Add 1 to 3 photos of what came back.', cameraButton: $('#rp-camera'), fallback: $('#rp-fallback'),
      getStamp: async () => (await api(orderPath + '/photo-stamp', { as: 'seller' })).stamp });
    onSubmit($('#return-problem'), async (data) => {
      const photos = picker.list();
      if (!photos.length) throw new Error('Add at least one photo showing what came back.');
      await api(orderPath + '/return-problem', { method: 'POST', body: { ...data, photos }, as: 'seller' });
      flash.set('Reported. The refund is on hold while TrustGap reviews. You can now give the rider your return PIN.');
      location.reload();
    });
  }
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
render().then(() => keepFresh(orderPath, render, { as: 'seller' })).catch(fail);
