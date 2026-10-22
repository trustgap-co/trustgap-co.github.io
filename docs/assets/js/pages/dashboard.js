import { api, html, show, link, shell, money, date, orderBadge, dealBadge, fail } from '../core.js';

await shell('seller');
try {
  const { seller: s, stats, orders, deals } = await api('/api/seller/dashboard', { as: 'seller' });
  const setup = [
    !s.payout && html`<li>Add the bank account you want to be paid into</li>`,
    !s.identity_verified && html`<li>Verify your identity with your NIN or BVN</li>`,
  ].filter(Boolean);
  show('#app', html`<h1>Hi ${s.business_name}</h1>
    ${setup.length ? html`<div class="callout warn"><strong>Before you can create payment links:</strong><ul>${setup}</ul>
      <a class="btn btn-small" href="${link('seller/settings.html')}">Finish setup →</a></div>` : ''}
    ${s.amount_owed > 0 ? html`<div class="callout warn">You owe ${money(s.amount_owed)} from a past dispute. It will be deducted from your next payout.</div>` : ''}
    <div class="stats">
      <div class="stat"><span>${stats.to_ship}</span>to pack &amp; ship</div>
      <div class="stat"><span>${money(stats.held)}</span>held for you</div>
      <div class="stat"><span>${stats.completed}</span>completed</div>
    </div>
    ${setup.length ? '' : html`<p><a class="btn" href="${link('seller/new.html')}">+ Create a payment link</a></p>`}
    <h2>Orders</h2>
    ${orders.length
      ? html`<div class="list">${orders.map((o) => html`<a class="row" href="${link(`seller/order.html?id=${o.id}`)}">
          <div><strong>${o.item_title}</strong><br><small class="muted">${o.ref} · ${o.buyer_name} · ${date(o.paid_at)}</small></div>
          <div class="right">${orderBadge(o.status)}<br><small>${money(o.seller_payout)} to you</small></div></a>`)}</div>`
      : html`<p class="muted">No paid orders yet.</p>`}
    <h2>Links waiting for payment</h2>
    ${deals.length
      ? html`<div class="list">${deals.map((d) => html`<a class="row" href="${link(`seller/deal.html?id=${d.id}`)}">
          <div><strong>${d.item_title}</strong><br><small class="muted">Buyer pays ${money(d.price.buyerTotal)} · expires ${date(d.expires_at)}</small></div>
          <div class="right">${dealBadge(d.status)}</div></a>`)}</div>`
      : html`<p class="muted">No open links.</p>`}`);
} catch (err) {
  fail(err);
}
