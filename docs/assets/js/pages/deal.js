import { api, html, show, shell, money, date, dealBadge, link, params, flash, fail, $ } from '../core.js';

await shell('seller');

async function render() {
  const { deal: d, order_id } = await api(`/api/seller/deals/${encodeURIComponent(params.get('id'))}`, { as: 'seller' });
  const p = d.price;
  const wa = `Hi! Here is the secure payment link for ${d.item_title}. Your money is held by TrustGap until you receive the item: ${d.link}`;
  show('#app', html`<section class="card">
    ${params.get('new') ? html`<div class="callout ok">Link created. Send it to your buyer.</div>` : ''}
    <div class="spread"><h1>${d.item_title}</h1>${dealBadge(d.status)}</div>
    ${d.status === 'open'
      ? html`<div class="share"><input readonly value="${d.link}" aria-label="Payment link">
          <button type="button" class="btn" data-copy="${d.link}">Copy link</button>
          <a class="btn btn-wa" href="https://wa.me/?text=${encodeURIComponent(wa)}" target="_blank" rel="noopener">Share on WhatsApp</a></div>
        <p class="muted small">Expires ${date(d.expires_at)} if not paid.</p>`
      : ''}
    ${order_id ? html`<p><a class="btn" href="${link(`seller/order.html?id=${order_id}`)}">View the order →</a></p>` : ''}
    <h2>Money</h2>
    <table class="breakdown">
      <tr><td>Item price</td><td>${money(p.itemPrice)}</td></tr>
      <tr><td>Delivery (${d.pickup_area} → ${d.delivery_area}) — paid by ${d.delivery_payer === 'buyer' ? 'buyer' : 'you'}</td><td>${money(p.deliveryFee)}</td></tr>
      <tr><td>TrustGap fee — paid by ${{ buyer: 'buyer', seller: 'you', split: 'both, 50/50' }[d.fee_payer]}</td><td>${money(p.platformFee)}</td></tr>
      <tr class="total"><td>Buyer pays</td><td>${money(p.buyerTotal)}</td></tr>
      <tr class="total"><td>You receive after delivery</td><td>${money(p.sellerPayout)}</td></tr>
    </table>
    <h2>Shown to the buyer</h2>
    <p><strong>Condition:</strong> ${d.item_condition} · <strong>Quantity:</strong> ${d.quantity} · <strong>Ships within:</strong> ${d.delivery_days} day(s)</p>
    <p class="pre">${d.item_description}</p>
    ${d.status === 'open'
      ? html`<div class="actions"><a class="btn btn-secondary" href="${link(`seller/new.html?revise=${d.id}`)}">Change something (makes a new link)</a>
          <button class="btn btn-danger" id="cancel">Cancel link</button></div>`
      : d.status === 'expired'
        ? html`<p><a class="btn btn-secondary" href="${link(`seller/new.html?revise=${d.id}`)}">Create a fresh link with the same details</a></p>`
        : ''}
  </section>`);
  $('#cancel')?.addEventListener('click', async () => {
    if (!confirm('Cancel this link? The buyer will no longer be able to pay it.')) return;
    await api(`/api/seller/deals/${d.id}/cancel`, { method: 'POST', body: {}, as: 'seller' });
    flash.set('Link cancelled.');
    location.reload();
  });
}
render().catch(fail);
