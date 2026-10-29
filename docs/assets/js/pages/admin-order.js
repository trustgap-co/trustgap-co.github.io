import { api, html, show, onSubmit, shell, money, date, orderBadge, timeline, params, flash, fail, $, $$, gallery, evidencePhotos, caseAccounts , keepFresh } from '../core.js';

await shell('admin');
const id = encodeURIComponent(params.get('id'));
const naira = (kobo) => String(kobo / 100);

async function render() {
  const { order: o, deal: d, photos, seller: s, disputes, return: ret, ledger, events, messages } = await api(`/api/admin/orders/${id}`, { as: 'admin' });
  const open = disputes.find((x) => x.status === 'open');
  const presets = open
    ? [
        ['Seller at fault: full refund, charge seller both delivery trips', { buyer_refund: o.amount, seller_payout: 0, seller_charge: o.delivery_fee * 2 }],
        ['Buyer refused a correct item: refund minus both delivery trips', { buyer_refund: Math.max(0, o.amount - o.delivery_fee * 2), seller_payout: 0, seller_charge: 0 }],
        // Once the item is back with the seller (or on its way), the seller can't also be paid.
        // (unless the seller reported the returned item isn't what was delivered: then they may be owed money).
        ...(ret && !ret.problem ? [] : [['Claim not supported: pay seller as normal', { buyer_refund: 0, seller_payout: o.seller_payout, seller_charge: 0 }]]),
      ]
    : [];

  show('#app', html`<section class="card">
    <div class="spread"><h1>Order ${o.ref}</h1>${orderBadge(o.status)}</div>
    <div class="grid2">
      <div><h2>Deal</h2>
        <p><strong>${d.item_title}</strong> (${d.item_condition}, ×${d.quantity})</p>
        ${photos?.length ? gallery(photos, d.item_title) : html`<p class="muted small">No photos (link made before photos were added).</p>`}
        <p class="pre small">${d.item_description}</p>
        <p class="small">Item ${money(d.item_price)} · delivery ${money(o.delivery_fee)} to ${o.delivery_state} (${d.delivery_payer}) · TrustGap fee ${money(o.platform_fee)} + processing ${money(o.processing_fee)} (${d.fee_payer})<br>
          Parcel ${d.weight_kg} kg${d.fragile ? ', fragile' : ''}<br>
          Buyer paid <strong>${money(o.amount)}</strong> · seller gets <strong>${money(o.seller_payout)}</strong></p>
        <p class="small">Packing note: ${o.packing_note || 'none'}</p>
        <div class="consents small">
          <p><strong>Seller’s condition confirmation:</strong> ${d.condition_confirmed_at ? html`✓ ${date(d.condition_confirmed_at)}<br><span class="muted">“${d.condition_pledge}”</span>` : html`<span class="muted">not recorded (link made before confirmations)</span>`}</p>
          <p><strong>Buyer’s change-of-mind notice:</strong> ${o.buyer_ack_at ? html`✓ accepted ${date(o.buyer_ack_at)} (wording saved in the order’s terms)` : html`<span class="muted">not recorded (order made before confirmations)</span>`}</p>
        </div></div>
      <div><h2>Seller</h2>
        <p>${s.business_name} (${s.full_name}) ${s.identity_verified ? '✓ ID' : '✗ ID'}<br>${s.phone} · ${s.email}<br>
          Pickup: ${d.pickup_address}, ${d.pickup_state}<br>Payout: ${s.payout_bank_name} ${s.payout_account_number}
          ${s.amount_owed ? html`<br><strong>Owes ${money(s.amount_owed)}</strong>` : ''}</p>
        <h2>Buyer</h2>
        <p>${o.buyer_name}<br>${o.buyer_phone} · ${o.buyer_email}<br>${o.delivery_address}, ${o.delivery_state}
          ${o.delivery_landmark ? html`<br>Near ${o.delivery_landmark}` : ''}<br>
          Refund: ${o.refund_bank_name} ••••${o.refund_account_last4} (${o.refund_account_name})</p>
        <p class="small"><a href="${o.track_url}" target="_blank" rel="noopener">Buyer tracking page</a>
          ${o.rider_url ? html` · <a href="${o.rider_url}" target="_blank" rel="noopener">Rider page</a>
            <button type="button" class="linklike" data-copy="${o.rider_url}">(copy rider link)</button>` : ''}</p></div>
    </div>
    <p class="small">Delivery: ${o.delivery_label} ${o.courier ? `· ${o.courier}` : ''} ${o.delivery_ref ? `· ${o.delivery_ref}` : ''}
      ${o.courier_status ? `· courier says “${o.courier_status}”` : ''} · ship by ${date(o.ship_by)} · PIN attempts ${o.pin_attempts}
      ${o.courier === 'fez' && o.status === 'shipping' ? html`<button class="linklike" id="sync">check with Fez now</button>` : ''}</p>
  </section>
  ${disputes.map((x) => html`<section class="card ${x.status === 'open' ? 'card-warn' : ''} ${x.status === 'superseded' ? 'card-muted' : ''}">
    <h2>Dispute #${x.id}: ${x.category_label} (${x.status})</h2>
    <p class="small muted">Opened by ${x.opened_by} · ${date(x.created_at)}${x.parcel_location ? ` · parcel: ${x.parcel_location === 'rider' ? 'rider took it back' : 'left with the buyer'}` : ''}</p>
    ${x.case?.statements?.length > 1 ? '' : html`<p class="pre">${x.description}</p>`}
    ${x.case?.statements?.length > 1 ? html`<h3>Accounts</h3>${caseAccounts(x.case, { staff: true })}`
      : html`${x.photos?.length ? evidencePhotos(x.photos) : x.opened_by === 'buyer' ? html`<p class="small muted">No photos attached.</p>` : ''}`}
    ${x.case && x.status === 'open' && x.case.parties_heard.length < 3 ? html`<p class="small muted">Not heard from yet: ${['buyer', 'seller', 'rider'].filter((p) => !x.case.parties_heard.includes(p) && !(p === 'rider' && x.case.parties_heard.includes('courier'))).join(', ') || 'nobody'}.</p>` : ''}
    ${x.status === 'superseded'
      ? html`<p class="small muted">Set aside: the seller reported the returned item isn’t what was delivered (see the newer dispute below).${x.resolution_note ? html` Earlier decision: ${x.resolution_note} (refund ${money(x.buyer_refund)}).` : ''}</p>`
      : x.status === 'resolved' || x.status === 'awaiting_return'
      ? html`<p><strong>Decision${x.decided_by?.startsWith('team:') ? ` by ${x.decided_by.slice(5)} (team)` : ''}${x.status === 'awaiting_return' ? ' (money waits for the return)' : ''}:</strong> ${x.resolution_note}<br>Buyer refund ${money(x.buyer_refund)} · seller payout ${money(x.seller_payout)} · seller charge ${money(x.seller_charge)}</p>`
      : html`<form class="form" id="resolve" data-id="${x.id}">
          <p class="small">Collected ${money(o.amount)}. Whatever isn’t refunded or paid out is kept to cover delivery and fees.
            Check evidence from both sides and the rider before deciding. Presets only fill in the form.</p>
          <div class="actions">${presets.map(([label, v], i) => html`<button type="button" class="btn btn-small btn-secondary" data-preset="${i}">${label}</button>`)}</div>
          <div class="grid3">
            <label>Refund to buyer (₦) <input name="buyer_refund" inputmode="decimal" value="0"></label>
            <label>Pay seller (₦) <input name="seller_payout" inputmode="decimal" value="0"></label>
            <label>Charge seller (₦) <small>added to what they owe</small><input name="seller_charge" inputmode="decimal" value="0"></label>
          </div>
          <label>Decision note <small>sent to both parties; explain the evidence and the amounts</small><textarea name="note" required rows="3"></textarea></label>
          ${ret?.open
            ? html`<p class="callout info small">The item is on its way back to the seller (${ret.label}). Any refund waits until the seller has it, and the seller can’t also be paid.</p>`
            : ret?.problem ? html`<p class="callout warn small">The seller accepted the return but reports it isn’t what was delivered: “${ret.problem_note}”. Compare their photos with the buyer’s and the listing. The seller can be paid if the buyer swapped or damaged it.</p>`
            : ret ? html`<p class="callout info small">The item is back with the seller, so the seller can’t also be paid. Refund the buyer, with or without the delivery deductions.</p>`
            : o.delivered_at && !ret
              ? html`<p class="callout info small">Any refund here books a courier to collect the item from the buyer. The refund is sent only once the seller has it back (return PIN). Every item goes back, whatever it costs.</p>`
              : ''}
          <button class="btn">Decide</button>
        </form>`}
  </section>`)}
  ${ret ? html`<section class="card ${ret.overdue ? 'card-warn' : ''}">
    <h2>Return to seller (${ret.kind === 'door' ? 'refused at the door' : 'collected from the buyer'})</h2>
    <p>${ret.label}${ret.overdue ? html` · <strong>overdue</strong>: not collected by ${date(ret.deadline_at)}` : ret.deadline_at && ret.open ? ` · hand-over deadline ${date(ret.deadline_at)}` : ''}</p>
    <p class="small">${ret.courier || ''} ${ret.delivery_ref ? `· ${ret.delivery_ref}` : ''} ${ret.courier_status ? `· courier says “${ret.courier_status}”` : ''}
      · PIN attempts ${ret.pin_attempts}${ret.cost ? ` · return cost ${money(ret.cost)}` : ''}
      ${ret.received_at ? html`<br>Received ${date(ret.received_at)} (confirmed by ${ret.received_by})` : ''}
      ${ret.rider_url ? html`<br><a href="${ret.rider_url}" target="_blank" rel="noopener">Return rider page</a> <button type="button" class="linklike" data-copy="${ret.rider_url}">(copy rider link)</button>` : ''}
      ${ret.open && ret.courier === 'fez' && ret.kind === 'pickup' ? html`<button class="linklike" id="ret-sync">check with Fez now</button>` : ''}</p>
    ${ret.open ? html`<div class="actions">
      <button class="btn btn-small" id="ret-received">Seller has it back (no PIN)</button>
      <button class="btn btn-small btn-secondary" id="ret-cancel">Cancel return and decide again</button></div>
      <p class="small muted">Mark received only when the seller has told you they have the item. Cancel when the buyer never handed it over, or the seller says the item that came back isn’t theirs.</p>` : ''}
  </section>` : ''}
  ${!ret && o.dispatched_at && ['disputed', 'shipping'].includes(o.status) ? html`<section class="card">
    <h2>Return to seller</h2>
    <p class="small">No return has started. If the parcel is with the buyer (refused but left with them), book a rider to collect it. Any refund waits until the seller has it back.</p>
    <button class="btn btn-small" id="book-return">Book a return from the buyer</button>
  </section>` : ''}
  <section class="card">
    <h2>Money</h2>
    <table class="breakdown">${ledger.map((l) => html`<tr><td>${l.kind} → ${l.counterparty} <small class="muted">${l.provider_ref || ''}</small></td>
      <td>${money(l.amount)} <span class="badge badge-${l.status === 'success' ? 'ok' : l.status === 'failed' ? 'warn' : 'muted'}">${l.status}</span>
      ${l.status === 'failed' ? html`<button class="linklike" data-retry="${l.id}">retry</button>` : ''}</td></tr>`)}</table>
    <h2>Timeline</h2>${timeline(events, { detail: true })}
    <h2>Messages sent</h2>
    <ul class="small">${messages.map((m) => html`<li><strong>${m.to_phone || m.to_email}</strong> (${m.status}): ${m.sms}</li>`)}</ul>
  </section>`);

  $('#sync')?.addEventListener('click', async () => {
    const { status } = await api(`/api/admin/orders/${id}/sync-courier`, { method: 'POST', body: {}, as: 'admin' });
    flash.set(`Fez status: ${status}`);
    location.reload();
  });

  const form = $('#resolve');
  if (form) {
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      const v = presets[Number(b.dataset.preset)][1];
      for (const k of ['buyer_refund', 'seller_payout', 'seller_charge']) form.elements[k].value = naira(v[k]);
    });
    onSubmit(form, async (data) => {
      const waits = (o.delivered_at || ret?.open) && Number(data.buyer_refund) > 0;
      if (!confirm(`Refund buyer ₦${data.buyer_refund}, pay seller ₦${data.seller_payout}, charge seller ₦${data.seller_charge}? ${waits ? 'Money moves once the seller has the item back.' : 'Money moves immediately.'}`)) return;
      const r = await api(`/api/admin/disputes/${form.dataset.id}/resolve`, { method: 'POST', body: data, as: 'admin' });
      flash.set(r.waiting_for_return ? 'Decision recorded. The refund is sent when the seller has the item back.' : 'Decision recorded and transfers sent.');
      location.reload();
    });
  }
  $('#book-return')?.addEventListener('click', async () => {
    if (!confirm('Book a rider to collect the item from the buyer and take it to the seller?')) return;
    await api(`/api/admin/orders/${id}/book-return`, { method: 'POST', body: {}, as: 'admin' }).then(() => flash.set('Return booked. The buyer and seller have been told.'))
      .catch((e) => alert(e.message));
    location.reload();
  });
  $('#ret-received')?.addEventListener('click', async () => {
    if (!confirm('Mark the item as back with the seller? Any refund waiting for the return is sent now.')) return;
    await api(`/api/admin/returns/${ret.id}/received`, { method: 'POST', body: {}, as: 'admin' });
    flash.set('Return recorded.');
    location.reload();
  });
  $('#ret-cancel')?.addEventListener('click', async () => {
    const note = prompt('Why is the return cancelled? (kept in the timeline)');
    if (!note) return;
    await api(`/api/admin/returns/${ret.id}/cancel`, { method: 'POST', body: { note }, as: 'admin' }).catch((e) => alert(e.message));
    location.reload();
  });
  $('#ret-sync')?.addEventListener('click', async () => {
    const { status } = await api(`/api/admin/returns/${ret.id}/sync-courier`, { method: 'POST', body: {}, as: 'admin' });
    flash.set(`Fez status: ${status}`);
    location.reload();
  });
  for (const b of $$('[data-retry]')) {
    b.addEventListener('click', async () => {
      const { entry } = await api(`/api/admin/ledger/${b.dataset.retry}/retry`, { method: 'POST', body: {}, as: 'admin' });
      flash.set(`Transfer status: ${entry.status}`);
      location.reload();
    });
  }
}
render().then(() => keepFresh(`/api/admin/orders/${id}`, render, { as: 'admin' })).catch(fail);
