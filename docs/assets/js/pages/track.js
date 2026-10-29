// The buyer's private tracking page: status, delivery PIN, confirm or report a problem.
import { photoPicker } from '../photos.js';
import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, getConfig, flash, fail, gallery, local, track, trackThenGo, naira, $ } from '../core.js';

await shell('buyer');
const token = params.get('t') || '';
const path = `/api/track/${encodeURIComponent(token)}`;

async function render() {
  const [{ order: o, dispute, return: ret, events }, config] = await Promise.all([api(path), getConfig()]);
  measure(o, dispute);
  show('#app', html`<section class="card">
    <div class="spread"><h1>Order ${o.ref}</h1>${orderBadge(o.status)}</div>
    <p><strong>${o.item_title}</strong> from ${o.seller_name} · ${money(o.amount)}</p>
    ${gallery(o.photos, o.item_title)}
    <p class="muted small">Delivering to ${o.delivery_address}, ${o.delivery_state}</p>
    ${['awaiting_payment', 'cancelled'].includes(o.status)
      ? html`<div class="callout warn">Payment not completed.
          ${o.can_retry_payment ? html`<form id="retry"><button class="btn">Try payment again</button></form>` : html`<br>This link is no longer open. Ask the seller for a new one.`}</div>`
      : ''}
    ${o.pin
      ? html`<div class="pinbox"><p>Your delivery PIN</p><div class="pin">${o.pin}</div>
          <p class="small">Check the item at the door. <strong>Only give this PIN to the rider if the item matches.</strong> If it doesn’t, refuse it and keep your PIN.</p></div>`
      : ''}
    ${o.status === 'paid' ? html`<p>Your money is held by TrustGap. The seller must hand the item to the courier before ${date(o.ship_by)}.</p>` : ''}
    ${o.status === 'shipping' ? html`<p>Parcel status: <strong>${o.delivery_label}</strong></p>` : ''}
    <details class="rules"><summary>What you paid</summary><table class="breakdown">
      <tr><td>Item</td><td>${money(o.price.item)}</td></tr>
      ${o.price.delivery ? html`<tr><td>Delivery to ${o.delivery_state}</td><td>${money(o.price.delivery)}</td></tr>` : ''}
      ${o.price.platform_fee ? html`<tr><td>TrustGap fee</td><td>${money(o.price.platform_fee)}</td></tr>` : ''}
      ${o.price.processing_fee ? html`<tr><td>Payment processing</td><td>${money(o.price.processing_fee)}</td></tr>` : ''}
      <tr class="total"><td>Total</td><td>${money(o.price.total)}</td></tr></table></details>
    ${o.can_confirm
      ? html`<div class="callout info">Delivered ${date(o.delivered_at)}. If everything is fine, release the payment to the seller.
          If not, report it before <strong>${date(o.inspection_ends_at)}</strong>.
          <form id="accept"><button class="btn">Everything is fine, pay the seller</button></form></div>`
      : ''}
    ${o.status === 'completed' && !dispute ? html`<div class="callout ok">Complete. The seller has been paid.</div>` : ''}
    ${dispute
      ? html`<div class="callout ${dispute.status === 'open' ? 'warn' : 'info'}">
          <strong>${dispute.status === 'open' ? 'Under review' : 'Decision'}:</strong>
          ${dispute.status === 'open' ? 'TrustGap is reviewing this order. Your money stays held.' : dispute.resolution_note}
          ${dispute.status === 'resolved' ? html`<br>Refund to you: <strong>${money(dispute.buyer_refund || 0)}</strong> → ${o.refund_account}` : ''}
          ${dispute.status === 'awaiting_return' ? html`<br>Refund to you: <strong>${money(dispute.buyer_refund || 0)}</strong> → ${o.refund_account}, sent as soon as the seller has the item back.` : ''}
          ${dispute.photos?.length ? html`<p class="small" style="margin:10px 0 0">Your photos:</p>${gallery(dispute.photos, 'Problem')}` : ''}
          ${dispute.opened_by === 'seller' && ret?.problem ? html`<p class="small" style="margin:10px 0 0">The seller says the item that came back isn’t what was delivered. Your refund is on hold while TrustGap reviews. If you have photos or a video of the item before you handed it over, send them to TrustGap support quoting ${o.ref}.</p>` : ''}</div>`
      : ''}
    ${ret?.open
      ? html`<div class="callout info"><strong>Return: ${ret.label}.</strong>
          ${ret.kind === 'pickup'
            ? html`<br>A rider will collect the item from you${ret.deadline_at ? html` by <strong>${date(ret.deadline_at)}</strong>` : ''}. Pack it with everything that came with it (box, accessories, receipt) and keep a photo of what you hand over.`
            : html`<br>The rider is taking the item back to the seller.`}
          <br><span class="small">Your refund is sent once the seller confirms they have it back.</span></div>`
      : ret?.status === 'received' ? html`<div class="callout ok">The seller has the item back${ret.received_at ? ` (${date(ret.received_at)})` : ''}.</div>` : ''}
    ${o.status === 'duplicate_refunded' ? html`<div class="callout info">This deal was already paid, so this payment was refunded in full to ${o.refund_account}.</div>` : ''}
    ${o.can_report
      ? html`<details class="rules"><summary>Report a problem</summary>
          <form class="form" id="dispute">
            <label>What went wrong? <select name="category" required><option value="">Choose</option>
              ${Object.entries(config.dispute_categories).map(([k, label]) => html`<option value="${k}">${label}</option>`)}</select></label>
            <label>Details <small>what you expected vs what you got</small><textarea name="description" required rows="3" maxlength="2000"></textarea></label>
            <div class="photo-field">
              <p class="label">Photos of the problem <small id="ev-rule">Up to ${config.max_dispute_photos || 2}. Show the problem clearly: the damage, the wrong label or size, the missing part.</small></p>
              <p class="live-note"><strong>Take the photos live, now, with the TrustGap camera.</strong> It opens your phone’s camera here and stamps each photo with your order number and the time, so TrustGap can trust it. Old photos, screenshots or pictures from the internet are flagged and carry less weight.</p>
              <div class="photo-grid" id="ev-grid"></div>
              <button type="button" class="btn photo-add" id="ev-camera">📷 Open the TrustGap camera</button>
              <details class="cam-fallback" id="ev-fallback"><summary>Can’t use the camera?</summary>
                <p class="small muted">Choose a photo from your phone instead. It will be marked as not taken with the TrustGap camera.</p>
                <label class="btn btn-secondary btn-small photo-add" id="ev-add">Choose a photo
                  <input type="file" accept="image/*" capture="environment" id="ev-input" class="visually-hidden"></label></details>
              <p class="muted small" id="ev-note" aria-live="polite"></p>
            </div>
            <p class="muted small">Keep the item, packaging and any unboxing video. TrustGap may contact you for more evidence. The money stays held until a decision.</p>
            <button class="btn btn-danger">Report problem &amp; hold payment</button>
          </form></details>`
      : ''}
    <h2>Timeline</h2>${timeline(events)}
    <details class="rules"><summary>The terms you accepted</summary>
      <p class="small muted">Accepted ${date(o.terms_accepted_at)} · record ${o.terms_hash.slice(0, 12)}</p>
      <ol>${o.rules.map((r) => html`<li>${r}</li>`)}</ol></details>
    <p class="muted small">This is your private tracking page. Bookmark it to come back on this phone, or use the link in your SMS from any device. Seller’s phone: ${o.seller_phone}</p>
  </section>`);

  if ($('#retry')) {
    onSubmit($('#retry'), async () => {
      const { payment_url } = await api(path + '/retry', { method: 'POST', body: {} });
      trackThenGo('payment_retry', { transaction_id: o.ref, value: naira(o.price.total), currency: 'NGN' }, payment_url);
    });
  }
  if ($('#accept')) {
    onSubmit($('#accept'), async () => {
      if (!confirm('Release the payment to the seller? Only do this if the item is exactly as agreed.')) return;
      await api(path + '/accept', { method: 'POST', body: {} });
      flash.set('Thank you. The seller has been paid.');
      trackThenGo('delivery_accepted', { transaction_id: o.ref }, location.href);
    });
  }
  if ($('#dispute')) {
    const needsPhoto = config.dispute_photo_required || [];
    const evidence = photoPicker({ grid: $('#ev-grid'), input: $('#ev-input'), add: $('#ev-add'), note: $('#ev-note'),
      max: config.max_dispute_photos || 2, hint: 'Photos help TrustGap decide faster.',
      cameraButton: $('#ev-camera'), fallback: $('#ev-fallback'),
      getStamp: async () => (await api(path + '/photo-stamp')).stamp });
    $('#ev-input').addEventListener('change', () => { const box = $('#dispute .form-error'); if (box) box.innerHTML = ''; });
    $('#dispute [name=category]').addEventListener('change', (e) => {
      $('#ev-note').textContent = needsPhoto.includes(e.target.value) && !evidence.list().length
        ? 'For this problem, add at least one photo showing it.' : $('#ev-note').textContent;
    });
    onSubmit($('#dispute'), async (data) => {
      const photos = evidence.list();
      if (needsPhoto.includes(data.category) && !photos.length) throw new Error('Add at least one photo showing the problem with the item.');
      await api(path + '/dispute', { method: 'POST', body: { ...data, photos } });
      flash.set('Problem reported. Your money is held while TrustGap reviews it.');
      trackThenGo('dispute_opened', { transaction_id: o.ref, dispute_category: data.category, photo_count: photos.length }, location.href);
    });
  }
}
// The buyer lands here straight after paying, so this is where a sale is counted: once per order on
// this device, as GA4 "purchase" and Meta "Purchase" (event ID = order ref, for de-duplication).
function measure(o, dispute) {
  track('order_status_view', { order_status: o.status, delivery_status: o.delivery_label || '', has_dispute: Boolean(dispute) });
  if (['awaiting_payment', 'cancelled', 'duplicate_refunded'].includes(o.status)) {
    track('payment_incomplete', { order_status: o.status, transaction_id: o.ref });
    return;
  }
  const key = `tg_purchase_${o.ref}`;
  if (local.get(key)) return;
  local.set(key, '1');
  track('purchase', {
    transaction_id: o.ref,
    currency: 'NGN',
    value: naira(o.price.total),
    shipping: naira(o.price.delivery),
    trustgap_fee: naira(o.price.platform_fee),
    delivery_state: o.delivery_state,
    items: [{ item_id: o.ref, item_name: o.item_title, price: naira(o.price.item), quantity: 1 }],
  }, { eventId: o.ref });
}

if (!token) {
  show('#app', html`<section class="card narrow"><h1>Open your tracking link</h1>
    <p>This page needs the tracking link from your SMS or WhatsApp message. Please open that link again.</p></section>`);
} else {
  render().catch(fail);
}
