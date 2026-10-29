// Team: one order, read only (only orders one of your tasks is about). No bank details, no PINs.
import { api, auth, html, show, onSubmit, shell, link, money, date, orderBadge, timeline, params, flash, gallery, fail, $ } from '../core.js';

const naira = (kobo) => String(kobo / 100);

await shell('team');
if (!auth.team()) location.href = link('team/index.html');

async function render() {
  const { order: o, disputes, return: ret, decide, events } = await api(`/api/team/orders/${encodeURIComponent(params.get('id'))}`, { as: 'team' });
  show('#app', html`<section class="card">
    <p class="small"><a href="${link('team/index.html')}">← My tasks</a></p>
    <div class="spread"><h1>Order ${o.ref}</h1>${orderBadge(o.status)}</div>
    <p><strong>${o.item_title}</strong> (${o.item_condition}, ×${o.quantity}) · buyer paid ${money(o.amount)} · paid ${date(o.paid_at)}</p>
    <p class="pre small">${o.item_description}</p>
    <div class="grid2">
      <div><h2>Buyer</h2><p>${o.buyer.name}<br><a href="tel:${o.buyer.phone}">${o.buyer.phone}</a> · ${o.buyer.email}<br>${o.buyer.address}, ${o.buyer.state}</p></div>
      <div><h2>Seller</h2><p>${o.seller.business_name} (${o.seller.name}) ${o.seller.identity_verified ? '✓ ID' : ''}<br><a href="tel:${o.seller.phone}">${o.seller.phone}</a> · ${o.seller.email}</p></div>
    </div>
    <h2>Delivery</h2>
    <p>${o.delivery_label}${o.courier ? ` · ${o.courier}` : ''}${o.delivery_ref ? ` · ${o.delivery_ref}` : ''}${o.courier_status ? ` · courier says “${o.courier_status}”` : ''}<br>
      <span class="small">Ship by ${date(o.ship_by)}${o.delivered_at ? ` · delivered ${date(o.delivered_at)}` : ''}${o.inspection_ends_at ? ` · inspection ends ${date(o.inspection_ends_at)}` : ''}</span></p>
    ${o.packing_note ? html`<p class="small"><strong>Packing note:</strong> ${o.packing_note}</p>` : ''}
    ${disputes.map((x) => html`<div class="callout ${x.status === 'open' ? 'warn' : 'info'}"><strong>Dispute: ${x.category_label}</strong> (${x.status.replace('_', ' ')}) · opened by ${x.opened_by} · ${date(x.created_at)}<br>${x.description}
      ${x.photos?.length ? html`<p class="small" style="margin:10px 0 4px"><strong>Photos (${x.photos.length})</strong>: tap to open full size</p>${gallery(x.photos, 'Evidence')}` : ''}
      ${x.resolution_note ? html`<br><strong>Decision${x.decided_by ? ` (${x.decided_by.replace('team:', '')})` : ''}:</strong> ${x.resolution_note} (refund ${money(x.buyer_refund || 0)} · seller ${money(x.seller_payout || 0)} · seller charge ${money(x.seller_charge || 0)})` : ''}</div>`)}
    ${decide ? decideForm(decide) : ''}
    ${ret ? html`<div class="callout info"><strong>Return (${ret.kind === 'door' ? 'refused at the door' : 'collected from the buyer'}):</strong> ${ret.label}
      ${ret.deadline_at && ret.open ? html`<br>Buyer hands it over by ${date(ret.deadline_at)}` : ''}${ret.received_at ? html`<br>Received ${date(ret.received_at)}` : ''}</div>` : ''}
    <h2>Timeline</h2>${timeline(events)}
    <p class="small muted">${decide ? 'You can decide this dispute because the admin assigned it to you.' : 'Read only.'} Bank details and PINs are never shown here.</p>
  </section>`);
  if (decide) wireDecision(decide);
  if (location.hash === '#decide') $('#decide')?.scrollIntoView();
}

function presets(d) {
  return [
    ['Seller at fault: full refund, charge seller both delivery trips', { buyer_refund: d.amount, seller_payout: 0, seller_charge: d.delivery_fee * 2 }],
    ['Buyer refused a correct item / changed mind: refund minus both delivery trips', { buyer_refund: Math.max(0, d.amount - d.delivery_fee * 2), seller_payout: 0, seller_charge: 0 }],
    ['Claim not supported: pay seller as normal', { buyer_refund: 0, seller_payout: d.seller_payout, seller_charge: 0 }],
  ];
}

const decideForm = (d) => html`<section class="card card-warn" id="decide">
  <h2>Your decision</h2>
  <ul class="small">
    <li>Buyer paid <strong>${money(d.amount)}</strong>. Seller would normally get ${money(d.seller_payout)}. Delivery was ${money(d.delivery_fee)} each way.</li>
    <li>Seller’s condition pledge: ${d.condition_pledge ? html`“${d.condition_pledge}”` : 'not recorded.'}</li>
    <li>Buyer accepted the change-of-mind notice: ${d.buyer_ack_at ? date(d.buyer_ack_at) : 'not recorded'}.</li>
    ${d.delivered ? html`<li>Any refund books a courier to collect the item; the money moves only when the seller has it back.</li>` : ''}
  </ul>
  <p class="small">Check the evidence from both sides and the courier first. Presets only fill in the form; follow the manual (Deciding a dispute).</p>
  <form class="form" id="resolve">
    <div class="actions">${presets(d).map(([label], i) => html`<button type="button" class="btn btn-small btn-secondary" data-preset="${i}">${label}</button>`)}</div>
    <div class="grid3">
      <label>Refund to buyer (₦) <input name="buyer_refund" inputmode="decimal" value="0"></label>
      <label>Pay seller (₦) <input name="seller_payout" inputmode="decimal" value="0"></label>
      <label>Charge seller (₦) <small>added to what they owe</small><input name="seller_charge" inputmode="decimal" value="0"></label>
    </div>
    <label>Decision note <small>sent to both sides: what the evidence showed and why these amounts</small><textarea name="note" required rows="3"></textarea></label>
    <button class="btn">Decide</button>
  </form>
</section>`;

function wireDecision(d) {
  const form = $('#resolve');
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const v = presets(d)[Number(b.dataset.preset)][1];
    for (const k of ['buyer_refund', 'seller_payout', 'seller_charge']) form.elements[k].value = naira(v[k]);
  });
  onSubmit(form, async (data) => {
    const waits = d.delivered && Number(data.buyer_refund) > 0;
    if (!confirm(`Refund buyer ₦${data.buyer_refund}, pay seller ₦${data.seller_payout}, charge seller ₦${data.seller_charge}? ${waits ? 'Money moves once the seller has the item back.' : 'Money moves immediately.'} This can’t be undone.`)) return;
    const r = await api(`/api/team/disputes/${d.dispute_id}/resolve`, { method: 'POST', body: data, as: 'team' });
    flash.set(r.waiting_for_return ? 'Decision recorded. The refund is sent once the seller has the item back. Your task is marked done.' : 'Decision recorded and money sent. Your task is marked done.');
    location.href = link('team/index.html');
  });
}
render().catch(fail);
