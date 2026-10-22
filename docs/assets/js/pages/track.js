// The buyer's private tracking page: status, delivery PIN, confirm or report a problem.
import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, getConfig, flash, fail, $ } from '../core.js';

await shell('buyer');
const token = params.get('t') || '';
const path = `/api/track/${encodeURIComponent(token)}`;

async function render() {
  const [{ order: o, dispute, events }, config] = await Promise.all([api(path), getConfig()]);
  show('#app', html`<section class="card">
    <div class="spread"><h1>Order ${o.ref}</h1>${orderBadge(o.status)}</div>
    <p><strong>${o.item_title}</strong> from ${o.seller_name} · ${money(o.amount)}</p>
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
    ${o.can_confirm
      ? html`<div class="callout info">Delivered ${date(o.delivered_at)}. If everything is fine, release the payment to the seller.
          If not, report it before <strong>${date(o.inspection_ends_at)}</strong>.
          <form id="accept"><button class="btn">Everything is fine — pay the seller</button></form></div>`
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
    <p class="muted small">Bookmark this page — it’s your private tracking link. Seller’s phone: ${o.seller_phone}</p>
  </section>`);

  if ($('#retry')) onSubmit($('#retry'), async () => { location.href = (await api(path + '/retry', { method: 'POST', body: {} })).payment_url; });
  if ($('#accept')) {
    onSubmit($('#accept'), async () => {
      if (!confirm('Release the payment to the seller? Only do this if the item is exactly as agreed.')) return;
      await api(path + '/accept', { method: 'POST', body: {} });
      flash.set('Thank you. The seller has been paid.');
      location.reload();
    });
  }
  if ($('#dispute')) {
    onSubmit($('#dispute'), async (data) => {
      await api(path + '/dispute', { method: 'POST', body: data });
      flash.set('Problem reported. Your money is held while TrustGap reviews it.');
      location.reload();
    });
  }
}
render().catch(fail);
