import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, flash, fail, $, $$ } from '../core.js';

await shell('admin');
const id = encodeURIComponent(params.get('id'));
const naira = (kobo) => String(kobo / 100);

async function render() {
  const { order: o, deal: d, seller: s, disputes, ledger, events, messages } = await api(`/api/admin/orders/${id}`, { as: 'admin' });
  const open = disputes.find((x) => x.status === 'open');
  const presets = open
    ? [
        ['Seller at fault: full refund, charge seller both delivery trips', { buyer_refund: o.amount, seller_payout: 0, seller_charge: d.delivery_fee * 2 }],
        ['Buyer refused a correct item: refund minus both delivery trips', { buyer_refund: Math.max(0, o.amount - d.delivery_fee * 2), seller_payout: 0, seller_charge: 0 }],
        ['Claim not supported: pay seller as normal', { buyer_refund: 0, seller_payout: d.seller_payout, seller_charge: 0 }],
      ]
    : [];

  show('#app', html`<section class="card">
    <div class="spread"><h1>Order ${o.ref}</h1>${orderBadge(o.status)}</div>
    <div class="grid2">
      <div><h2>Deal</h2>
        <p><strong>${d.item_title}</strong> (${d.item_condition}, ×${d.quantity})</p>
        <p class="pre small">${d.item_description}</p>
        <p class="small">Item ${money(d.item_price)} · delivery ${money(d.delivery_fee)} (${d.delivery_payer}) · TrustGap fee ${money(d.platform_fee)} + processing ${money(d.processing_fee)} (${d.fee_payer})<br>
          Buyer paid <strong>${money(o.amount)}</strong> · seller gets <strong>${money(d.seller_payout)}</strong></p>
        <p class="small">Packing note: ${o.packing_note || '—'}</p></div>
      <div><h2>Seller</h2>
        <p>${s.business_name} (${s.full_name}) ${s.identity_verified ? '✓ ID' : '✗ ID'}<br>${s.phone} · ${s.email}<br>
          Pickup: ${d.pickup_address} (${d.pickup_area})<br>Payout: ${s.payout_bank_name} ${s.payout_account_number}
          ${s.amount_owed ? html`<br><strong>Owes ${money(s.amount_owed)}</strong>` : ''}</p>
        <h2>Buyer</h2>
        <p>${o.buyer_name}<br>${o.buyer_phone} · ${o.buyer_email}<br>${o.delivery_address} (${o.delivery_area})
          ${o.delivery_landmark ? html`<br>Near ${o.delivery_landmark}` : ''}<br>
          Refund: ${o.refund_bank_name} ••••${o.refund_account_last4} (${o.refund_account_name})</p>
        <p class="small"><a href="${o.track_url}" target="_blank" rel="noopener">Buyer tracking page</a>
          ${o.rider_url ? html` · <a href="${o.rider_url}" target="_blank" rel="noopener">Rider page</a>
            <button type="button" class="linklike" data-copy="${o.rider_url}">(copy rider link)</button>` : ''}</p></div>
    </div>
    <p class="small">Delivery: ${o.delivery_label} ${o.delivery_ref ? `· ${o.delivery_ref}` : ''} · ship by ${date(o.ship_by)} · PIN attempts ${o.pin_attempts}</p>
  </section>
  ${disputes.map((x) => html`<section class="card ${x.status === 'open' ? 'card-warn' : ''}">
    <h2>Dispute #${x.id} — ${x.category_label} (${x.status})</h2>
    <p class="small muted">Opened by ${x.opened_by} · ${date(x.created_at)}</p>
    <p class="pre">${x.description}</p>
    ${x.status === 'resolved'
      ? html`<p><strong>Decision:</strong> ${x.resolution_note}<br>Buyer refund ${money(x.buyer_refund)} · seller payout ${money(x.seller_payout)} · seller charge ${money(x.seller_charge)}</p>`
      : html`<form class="form" id="resolve" data-id="${x.id}">
          <p class="small">Collected ${money(o.amount)}. Whatever isn’t refunded or paid out is kept to cover delivery and fees.
            Check evidence from both sides and the rider before deciding. Presets only fill in the form.</p>
          <div class="actions">${presets.map(([label, v], i) => html`<button type="button" class="btn btn-small btn-secondary" data-preset="${i}">${label}</button>`)}</div>
          <div class="grid3">
            <label>Refund to buyer (₦) <input name="buyer_refund" inputmode="decimal" value="0"></label>
            <label>Pay seller (₦) <input name="seller_payout" inputmode="decimal" value="0"></label>
            <label>Charge seller (₦) <small>added to what they owe</small><input name="seller_charge" inputmode="decimal" value="0"></label>
          </div>
          <label>Decision note <small>sent to both parties — explain the evidence and the amounts</small><textarea name="note" required rows="3"></textarea></label>
          <button class="btn">Decide and move money</button>
        </form>`}
  </section>`)}
  <section class="card">
    <h2>Money</h2>
    <table class="breakdown">${ledger.map((l) => html`<tr><td>${l.kind} → ${l.counterparty} <small class="muted">${l.provider_ref || ''}</small></td>
      <td>${money(l.amount)} <span class="badge badge-${l.status === 'success' ? 'ok' : l.status === 'failed' ? 'warn' : 'muted'}">${l.status}</span>
      ${l.status === 'failed' ? html`<button class="linklike" data-retry="${l.id}">retry</button>` : ''}</td></tr>`)}</table>
    <h2>Timeline</h2>${timeline(events, { detail: true })}
    <h2>Messages sent</h2>
    <ul class="small">${messages.map((m) => html`<li><strong>${m.to_phone || m.to_email}</strong> (${m.status}): ${m.sms}</li>`)}</ul>
  </section>`);

  const form = $('#resolve');
  if (form) {
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      const v = presets[Number(b.dataset.preset)][1];
      for (const k of ['buyer_refund', 'seller_payout', 'seller_charge']) form.elements[k].value = naira(v[k]);
    });
    onSubmit(form, async (data) => {
      if (!confirm(`Refund buyer ₦${data.buyer_refund}, pay seller ₦${data.seller_payout}, charge seller ₦${data.seller_charge}? Money moves immediately.`)) return;
      await api(`/api/admin/disputes/${form.dataset.id}/resolve`, { method: 'POST', body: data, as: 'admin' });
      flash.set('Decision recorded and transfers sent.');
      location.reload();
    });
  }
  for (const b of $$('[data-retry]')) {
    b.addEventListener('click', async () => {
      const { entry } = await api(`/api/admin/ledger/${b.dataset.retry}/retry`, { method: 'POST', body: {}, as: 'admin' });
      flash.set(`Transfer status: ${entry.status}`);
      location.reload();
    });
  }
}
render().catch(fail);
