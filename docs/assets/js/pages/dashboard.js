import { SITE } from '../site-info.js';
import { api, html, show, link, shell, money, date, orderBadge, dealBadge, fail, params, track, trackThenGo, keepFresh, $ } from '../core.js';

await shell('seller');
try {
  const { seller: s, stats, orders, deals } = await api('/api/seller/dashboard', { as: 'seller' });
  const setup = [
    !s.payout && html`<li>Add the bank account you want to be paid into</li>`,
    !s.identity_verified && html`<li>Verify your identity with your NIN</li>`,
  ].filter(Boolean);
  show('#app', html`${s.suspended ? html`<div class="callout warn"><strong>Your account is suspended.</strong> ${s.suspend_reason ? html`Reason: ${s.suspend_reason}. ` : ''}
      Your links can’t take new payments and your payouts are on hold. Please still pack and send items buyers have already paid for.
      Contact TrustGap support to sort it out.</div>` : ''}
    <h1>Hi ${s.business_name}</h1>
    ${setup.length ? html`<div class="callout warn"><strong>Before you can create payment links:</strong><ul>${setup}</ul>
      <a class="btn btn-small" href="${link('seller/settings.html')}">Finish setup →</a></div>` : ''}
    ${params.get('debt') === 'paid' ? html`<div class="callout ok">Thank you, your payment was received.${s.amount_owed > 0 ? ` You still owe ${money(s.amount_owed)}.` : ' Your balance is cleared.'}</div>` : ''}
    ${params.get('debt') === 'not-paid' && s.amount_owed > 0 ? html`<div class="callout warn">The payment didn’t go through, so nothing was taken. You can try again below.</div>` : ''}
    ${s.amount_owed > 0 ? html`<div class="callout warn debt-box">
        <p><strong>You owe ${money(s.amount_owed)}</strong> from a past dispute (the delivery and return of an item that wasn’t as agreed).
        Until it’s paid you can’t create new links, and it will be taken from your next payout.</p>
        <button type="button" class="btn" id="pay-debt">Pay ${money(s.amount_owed)} now</button>
        <p class="small muted">Pay by card, bank transfer or USSD on our secure payment page. The account name there is ${String(SITE.legalName).toUpperCase()}, the company that runs TrustGap. Your balance clears as soon as the payment is confirmed.</p>
      </div>` : ''}
    <div class="stats">
      <div class="stat"><span>${stats.to_ship}</span>to pack &amp; ship</div>
      <div class="stat"><span>${money(stats.held)}</span>held for you</div>
      <div class="stat"><span>${stats.completed}</span>completed</div>
    </div>
    ${setup.length || s.amount_owed > 0 || s.suspended ? '' : html`<p><a class="btn" href="${link('seller/new.html')}">+ Create a payment link</a></p>`}
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
  $('#pay-debt')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Opening the payment page…';
    try {
      const { payment_url, amount } = await api('/api/seller/debt/pay', { method: 'POST', body: {}, as: 'seller' });
      trackThenGo('debt_payment_started', { value: amount / 100, currency: 'NGN' }, payment_url);
    } catch (err) {
      e.target.disabled = false;
      e.target.textContent = 'Try again';
      e.target.insertAdjacentHTML('afterend', String(html`<div class="error">${err.message}</div>`));
    }
  });
  if (params.get('debt')) track('debt_payment_result', { result: params.get('debt') });
  keepFresh('/api/seller/dashboard', () => location.reload(), { as: 'seller' });
} catch (err) {
  fail(err);
}
