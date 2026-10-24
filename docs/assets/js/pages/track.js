// The buyer's private tracking page: status, delivery PIN, confirm or report a problem.
import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, getConfig, flash, fail, local, track, trackThenGo, naira, $ } from '../core.js';

await shell('buyer');
const token = params.get('t') || '';
const path = `/api/track/${encodeURIComponent(token)}`;

async function render() {
  const [{ order: o, dispute, events }, config] = await Promise.all([api(path), getConfig()]);
  measure(o, dispute);
  show('#app', html`<section class="card">
    <div class="spread"><h1>Order ${o.ref}</h1>${orderBadge(o.status)}</div>
    <p><strong>${o.item_title}</strong> from ${o.seller_name} · ${money(o.amount)}</p>
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
          ${dispute.status === 'resolved' ? html`<br>Refund to you: <strong>${money(dispute.buyer_refund || 0)}</strong> → ${o.refund_account}` : ''}</div>`
      : ''}
    ${o.status === 'duplicate_refunded' ? html`<div class="callout info">This deal was already paid, so this payment was refunded in full to ${o.refund_account}.</div>` : ''}
    ${o.can_report
      ? html`<details class="rules"><summary>Report a problem</summary>
          <form class="form" id="dispute">
            <label>What went wrong? <select name="category" required><option value="">Choose</option>
              ${Object.entries(config.dispute_categories).map(([k, label]) => html`<option value="${k}">${label}</option>`)}</select></label>
            <label>Details <small>what you expected vs what you got</small><textarea name="description" required rows="3" maxlength="2000"></textarea></label>
            <p class="muted small">Keep the item, packaging and any unboxing video. TrustGap will contact you for evidence. The money stays held until a decision.</p>
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
    onSubmit($('#dispute'), async (data) => {
      await api(path + '/dispute', { method: 'POST', body: data });
      flash.set('Problem reported. Your money is held while TrustGap reviews it.');
      trackThenGo('dispute_opened', { transaction_id: o.ref, dispute_category: data.category }, location.href);
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
