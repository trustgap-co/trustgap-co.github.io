// The buyer's private tracking page: status, delivery PIN, confirm or report a problem.
import { photoPicker } from '../photos.js';
import { offerTour } from '../tour.js';
import { TOURS } from '../tours.js';
import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, getConfig, flash, fail, gallery, local, track, trackThenGo, naira, caseAccounts, keepFresh, orderJourney, link, $ } from '../core.js';

await shell('buyer');
const token = params.get('t') || '';
const path = `/api/track/${encodeURIComponent(token)}`;

// After a completed order: share TrustGap with friends (a WhatsApp message, and a picture for the
// WhatsApp status), and, for buyers who also sell, join with this seller's invite.
const SITE_HOME = new URL('../../', import.meta.url).href;
function shareCard(o) {
  const url = `${SITE_HOME}?utm_source=buyer_share&utm_medium=referral&utm_campaign=completed_order`;
  const text = `I just bought "${o.item_title}" safely with TrustGap: my money was held until I had the item and checked it. If you buy or sell on WhatsApp or Instagram, use TrustGap: ${url}`;
  return html`<section class="card share-card">
    <h2>Your money was protected 🛡️</h2>
    <p>Know someone who buys or sells online? Tell them about TrustGap.</p>
    <div class="actions">
      <a class="btn btn-whatsapp" href="${`https://wa.me/?text=${encodeURIComponent(text)}`}" target="_blank" rel="noopener" id="share-wa">💬 Share on WhatsApp</a>
      <button type="button" class="btn btn-secondary" id="share-status">📸 Picture for my status</button>
    </div>
    ${o.seller_invite ? html`<p class="small">Do you sell online too? <a href="${link(`seller/signup.html?ref=${encodeURIComponent(o.seller_invite)}`)}">Join with an invite from ${o.seller_name}</a>: your first deals have no TrustGap fee.</p>` : ''}
  </section>`;
}

// A square picture for the WhatsApp status, drawn on the phone (nothing is uploaded).
async function statusPicture() {
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1080;
  const g = c.getContext('2d');
  g.fillStyle = '#0B1B3D'; g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = '#F4B740'; g.beginPath(); g.arc(540, 330, 120, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0B1B3D'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.fillText('✓', 540, 385);
  g.fillStyle = '#FFFFFF'; g.font = 'bold 70px Arial';
  g.fillText('I just bought safely', 540, 580); g.fillText('with TrustGap', 540, 670);
  g.fillStyle = '#C9D3EA'; g.font = '40px Arial';
  g.fillText('My money was held until I had', 540, 770); g.fillText('the item and checked it.', 540, 825);
  g.fillStyle = '#9DB9F5'; g.font = 'bold 44px Arial'; g.fillText('trustgap-co.github.io', 540, 960);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'trustgap.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], text: 'Buy safely online with TrustGap' }).catch(() => {});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'trustgap.png'; a.click();
}

// ---------------------------------------------------------------- paying

const fmtNumber = (n) => String(n).replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
const left = (iso) => {
  const s = Math.max(0, Math.round((new Date(iso) - Date.now()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// A payment that didn't fit: what we received, and that a person is on it.
function reviewNote(o) {
  if (!o.payment_review?.length) return '';
  return html`${o.payment_review.map((r) => r.reason === 'paid_twice'
    ? html`<div class="callout">This order was already paid, so the extra ${money(r.got)} you sent will be refunded to your ${o.refund_account} account. TrustGap will confirm within 24 hours.</div>`
    : html`<div class="callout warn"><strong>We’re checking your payment.</strong> We received ${money(r.got)}, but this deal is ${money(r.expected)}, so it hasn’t gone through.
        <strong>Please don’t send any more money.</strong> TrustGap will contact you within 24 hours, and refund your ${o.refund_account} account if needed.</div>`)}`;
}

function payBox(o) {
  if (!o.can_retry_payment) return html`<div class="callout warn">Payment not completed.<br>This link is no longer open. Ask the seller for a new one.</div>`;
  const card = html`<form id="retry" class="pay-switch"><button class="linklike">💳 Pay with card instead</button></form>`;
  const a = o.transfer;
  // An earlier payment was refunded after checking: start again with a new number, the exact amount.
  if (a && !['open', 'paid'].includes(a.status)) {
    return html`<div class="callout"><strong>Your earlier payment is being refunded</strong> to your ${o.refund_account} account. Don’t send money to that account number again.
        To go ahead with the deal, get a new account number and send exactly ${money(o.amount)}.
      <div class="actions"><button type="button" class="btn" id="tf-new">🏦 Get a new account number</button></div>
      <p class="small muted" id="tf-note" aria-live="polite"></p>${card}</div>`;
  }
  if (a && !a.expired) {
    return html`<section class="transfer-box" aria-labelledby="tf-head">
      <p class="eyebrow" id="tf-head">🏦 Pay by bank transfer</p>
      <p class="tf-label">Send exactly</p>
      <div class="tf-row"><span class="tf-amount">${money(a.amount)}</span><button type="button" class="btn btn-small btn-secondary" data-copy="${String(a.amount / 100)}">Copy</button></div>
      <p class="tf-label">To this account</p>
      <div class="tf-row"><span class="tf-number">${fmtNumber(a.account_number)}</span><button type="button" class="btn btn-small btn-secondary" data-copy="${a.account_number}">Copy</button></div>
      <p class="tf-bank"><strong>${a.bank_name}</strong> · ${a.account_name}</p>
      <p class="tf-timer">⏳ Valid for <strong data-expires="${a.expires_at}">${left(a.expires_at)}</strong></p>
      <ul class="tf-tips small">
        <li><strong>Send the exact amount in one transfer.</strong> A different amount won’t go through and has to be refunded first.</li>
        <li>This number is for this order only. Don’t save it or reuse it.</li>
        <li>Your bank app shows the account name before you send. Check it, then send.</li>
        <li>This page updates by itself once the money arrives, usually within a minute.</li>
      </ul>
      <button type="button" class="btn btn-block" id="tf-sent">I’ve sent the money</button>
      <p class="small muted center" id="tf-note" aria-live="polite"></p>
      ${a.test_bank_url ? html`<a class="btn btn-secondary btn-block" href="${a.test_bank_url}">Open the test bank (test mode)</a>` : ''}
      ${card}
    </section>`;
  }
  if (a || o.pay_method === 'transfer') {
    return html`<div class="callout warn"><strong>That account number has expired.</strong> Don’t send money to it.
        If you already sent it, tap “I’ve sent the money” below and we’ll find it.
      <div class="actions"><button type="button" class="btn" id="tf-new">🏦 Get a new account number</button>
        <button type="button" class="btn btn-secondary" id="tf-sent">I’ve sent the money</button></div>
      <p class="small muted" id="tf-note" aria-live="polite"></p>${card}</div>`;
  }
  return html`<div class="callout warn">Payment not completed.
      <div class="actions"><form id="retry"><button class="btn">💳 Try card payment again</button></form>
        ${o.can_pay_by_transfer ? html`<button type="button" class="btn btn-secondary" id="tf-new">🏦 Pay by bank transfer instead</button>` : ''}</div>
      <p class="small muted" id="tf-note" aria-live="polite"></p></div>`;
}

function wirePayBox(o) {
  clearInterval(wirePayBox.timer);
  const timer = $('[data-expires]');
  if (timer) {
    wirePayBox.timer = setInterval(() => {
      timer.textContent = left(timer.dataset.expires);
      if (new Date(timer.dataset.expires) <= Date.now()) { clearInterval(wirePayBox.timer); render(); }
    }, 1000);
  }
  for (const b of document.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied ✓'; } catch { b.textContent = b.dataset.copy; }
      track('transfer_copy', { field: b.dataset.copy.length === 10 ? 'account_number' : 'amount' });
      setTimeout(() => { b.textContent = 'Copy'; }, 2500);
    });
  }
  const note = $('#tf-note');
  $('#tf-new')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await api(path + '/transfer-account', { method: 'POST', body: {} });
      track('transfer_account_requested', { transaction_id: o.ref });
      await render();
      $('.transfer-box')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (err) {
      if (note) note.textContent = err.message;
      e.currentTarget.disabled = false;
    }
  });
  $('#tf-sent')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    if (note) note.textContent = 'Checking with the bank…';
    try {
      const { status } = await api(path + '/check-payment', { method: 'POST', body: {} });
      track('transfer_sent_tapped', { transaction_id: o.ref, found: status !== 'awaiting_payment' && status !== 'cancelled' });
      if (status !== 'awaiting_payment' && status !== 'cancelled') return render();
      if (note) note.textContent = 'Not here yet. Transfers usually arrive within a few minutes; this page updates by itself when it does. No need to send again.';
    } catch (err) {
      if (note) note.textContent = err.message;
    }
    b.disabled = false;
  });
}

async function render() {
  const [{ order: o, dispute, return: ret, case: kase, events }, config] = await Promise.all([api(path), getConfig()]);
  measure(o, dispute);
  show('#app', html`<section class="card">
    <div class="spread"><h1>Order ${o.ref}</h1>${orderBadge(o.status)}</div>
    <p><strong>${o.item_title}</strong> from ${o.seller_name} · ${money(o.amount)}</p>
    ${gallery(o.photos, o.item_title)}
    <p class="muted small">Delivering to ${o.delivery_address}, ${o.delivery_state}</p>
    ${orderJourney(o, { as: 'buyer', dispute })}
    ${reviewNote(o)}
    ${['awaiting_payment', 'cancelled'].includes(o.status) && !o.payment_review?.length ? payBox(o) : ''}
    ${o.pin || o.courier_code
      ? html`<div class="pinbox"><p>${o.courier_code ? 'Your Fez delivery code' : 'Your delivery PIN'}</p><div class="pin">${o.courier_code || o.pin}</div>
          ${o.courier_code ? html`<p class="small muted">The same code Fez Delivery texted you. The rider can’t complete the delivery without it.</p>` : ''}
          <p class="small"><strong>Please inspect the item before sharing your ${o.courier_code ? 'code' : 'PIN'}.</strong> Sharing it confirms the handover; your ${o.inspection_hours ? `${o.inspection_hours}-hour ` : ''}inspection window still applies under the deal rules. If the item isn’t right, refuse it and keep your ${o.courier_code ? 'code' : 'PIN'}.</p>
          ${o.status === 'shipping' ? html`<p class="small" style="margin:10px 0 0"><strong>At the door, check:</strong></p>
          <ul class="handover-check">
            <li>Is this the correct item (${o.item_title})?</li>
            <li>Is the quantity correct (${o.quantity || 1})?</li>
            <li>Is it free of visible damage?</li>
            <li>Does it match the agreed description${o.item_condition ? ` and condition: ${o.item_condition}` : ''}?</li>
            <li>Are the accessories, box and anything promised included?</li>
          </ul>` : ''}</div>`
      : o.code_by_courier && ['paid', 'shipping'].includes(o.status)
        ? html`<div class="pinbox"><p>Your delivery code</p>
            <p class="small"><strong>Fez Delivery will text you a delivery code when your item is dispatched.</strong> It will also appear here. Inspect the item first, then give the rider the code; the rider can’t complete the delivery without it.</p>
            ${o.status === 'shipping' && o.delivery_status !== 'booked' ? html`<p class="small muted">Haven’t received it? Check your SMS from Fez Delivery, or contact TrustGap support quoting ${o.ref}.</p>` : ''}</div>`
        : ''}
    ${o.status === 'shipping' && o.courier_status ? html`<p class="small muted">Courier’s latest update: ${o.courier_status}</p>` : ''}
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
    ${o.status === 'completed' && !dispute ? html`<div class="callout ok">Complete. The seller has been paid.</div>${shareCard(o)}` : ''}
    ${dispute
      ? html`<div class="callout ${dispute.status === 'open' ? 'warn' : 'info'}">
          <strong>${dispute.status === 'open' ? `Case ${dispute.case_ref}: under review` : 'Decision'}</strong><br>
          ${dispute.status === 'open'
            ? html`We have received ${dispute.opened_by === 'buyer' ? 'your report' : 'a report on this order'} and your case is now under review. Your money stays held while we look into it. Please don’t mark the order complete while the review is open.
              <br><span class="small">Our next update: by <strong>${date(dispute.update_by)}</strong>. Quote ${dispute.case_ref} if you contact support.</span>`
            : dispute.resolution_note}
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
    ${kase ? html`<section class="case-box"><h2>What’s been said</h2>
      <p class="small muted">One case for this problem. Each side adds their account; TrustGap reads them all before deciding.</p>
      ${caseAccounts(kase, { me: 'buyer' })}
      <details class="rules"><summary>${kase.parties_heard.includes('buyer') ? 'Add more to your side' : 'Add your side'}</summary>
        <form class="form" id="side">
          ${o.dispatched && !o.delivered_at && !ret ? html`<fieldset><legend>Where is the parcel now?</legend>
            <div class="choices"><label class="choice"><input type="radio" name="parcel" value="rider"> The rider took it back</label>
            <label class="choice"><input type="radio" name="parcel" value="buyer"> I still have it</label></div></fieldset>` : ''}
          <label>What happened <small>in your own words</small><textarea name="body" required rows="3" maxlength="2000"></textarea></label>
          <div class="photo-grid" id="sd-grid"></div>
          <button type="button" class="btn btn-secondary photo-add" id="sd-camera">📷 Add photos with the TrustGap camera</button>
          <details class="cam-fallback" id="sd-fallback"><summary>Can’t use the camera?</summary>
            <label class="btn btn-secondary btn-small photo-add" id="sd-add">Choose a photo
              <input type="file" accept="image/*" capture="environment" id="sd-input" class="visually-hidden"></label></details>
          <p class="muted small" id="sd-note" aria-live="polite"></p>
          <button class="btn">Add to the case</button>
        </form></details></section>` : ''}
    ${o.status === 'duplicate_refunded' ? html`<div class="callout info">This deal was already paid, so this payment was refunded in full to ${o.refund_account}.</div>` : ''}
    ${o.can_report
      ? html`<details class="rules"><summary>Report a problem</summary>
          <form class="form" id="dispute">
            <label>What went wrong? <select name="category" required><option value="">Choose</option>
              ${Object.entries(config.dispute_categories).map(([k, label]) => html`<option value="${k}">${label}</option>`)}</select></label>
            ${o.status === 'shipping' ? html`<fieldset id="parcel-where"><legend>Where is the parcel now?</legend>
              <div class="choices"><label class="choice"><input type="radio" name="parcel" value="rider"> The rider took it back</label>
              <label class="choice"><input type="radio" name="parcel" value="buyer"> I still have it</label></div>
              <p class="small muted">If you refused the item, don’t give the rider your PIN. If the rider left it with you, keep it safe and unused: TrustGap books a rider to collect it, and any refund is sent once the seller has it back.</p></fieldset>` : ''}
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
            <div class="next-step small"><strong>What happens next</strong>
              <ol style="margin:6px 0 0;padding-left:18px">
                <li>You get a case reference straight away, and the seller is told.</li>
                <li>Your money stays held. Nobody is paid while the review is open.</li>
                <li>Both sides can add their account and photos. Keep the item, packaging and any unboxing video.</li>
                <li>We update you within 24 hours, and explain the decision in writing.</li>
              </ol>
              <p class="small muted" style="margin:6px 0 0">A refund depends on the review and the deal rules; it isn’t automatic.</p></div>
            <button class="btn btn-danger">Report problem &amp; hold payment</button>
          </form></details>`
      : ''}
    <h2>Timeline</h2>${timeline(events)}
    <details class="rules"><summary>The terms you accepted</summary>
      <p class="small muted">Accepted ${date(o.terms_accepted_at)} · record ${o.terms_hash.slice(0, 12)}</p>
      <ol>${o.rules.map((r) => html`<li>${r}</li>`)}</ol></details>
    <p class="muted small">This is your private tracking page. Bookmark it to come back on this phone, or use the link in your SMS from any device. Seller’s phone: ${o.seller_phone}</p>
  </section>`);

  wirePayBox(o);
  render.waitingForTransfer = Boolean(o.transfer && !o.transfer.expired);
  $('#share-wa')?.addEventListener('click', () => track('share', { method: 'whatsapp', content_type: 'completed_order' }));
  $('#share-status')?.addEventListener('click', () => { track('share', { method: 'status_picture', content_type: 'completed_order' }); statusPicture(); });
  if ($('#retry')) {
    onSubmit($('#retry'), async () => {
      if (o.transfer && !o.transfer.expired && !confirm('Pay with card instead? If you have already sent a bank transfer, don’t pay again: tap “I’ve sent the money”.')) return;
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
  if ($('#side')) {
    const side = photoPicker({ grid: $('#sd-grid'), input: $('#sd-input'), add: $('#sd-add'), note: $('#sd-note'), max: config.max_dispute_photos || 2,
      hint: 'Photos are optional here, but help.', cameraButton: $('#sd-camera'), fallback: $('#sd-fallback'),
      getStamp: async () => (await api(path + '/photo-stamp')).stamp });
    onSubmit($('#side'), async (data) => {
      await api(path + '/statement', { method: 'POST', body: { ...data, photos: side.list() } });
      flash.set('Added to the case. TrustGap will read it with the others.');
      location.reload();
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
    const where = $('#parcel-where');
    if (where) $('#dispute [name=category]').addEventListener('change', (e) => { where.hidden = e.target.value === 'not_delivered'; });
    onSubmit($('#dispute'), async (data) => {
      if (where && !where.hidden && !data.parcel) throw new Error('Tell us where the parcel is now: did the rider take it back, or do you still have it?');
      const photos = evidence.list();
      if (needsPhoto.includes(data.category) && !photos.length) throw new Error('Add at least one photo showing the problem with the item.');
      await api(path + '/dispute', { method: 'POST', body: { ...data, photos } });
      flash.set('We have received your report. Your case is now under review and your money stays held.');
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
  // Every 10 seconds while a bank transfer is expected (so the page moves on soon after the money lands).
  render().then(() => { keepFresh(path, render, { every: render.waitingForTransfer ? 10_000 : 30_000 }); offerTour('track', TOURS.track); }).catch(fail);
}
