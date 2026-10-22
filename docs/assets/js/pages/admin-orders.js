import { api, html, show, shell, money, date, orderBadge, link, params, flash, fail, $ } from '../core.js';

await shell('admin');
const FILTERS = ['', 'awaiting_payment', 'paid', 'shipping', 'delivered', 'disputed', 'completed', 'refunded', 'cancelled'];

async function render() {
  const status = params.get('status') || '';
  const { orders, counts } = await api(`/api/admin/orders?status=${encodeURIComponent(status)}`, { as: 'admin' });
  show('#app', html`<div class="spread"><h1>Orders</h1>
      <div class="actions"><button class="btn btn-small btn-secondary" id="jobs">Run timers now</button>
      <button class="btn btn-small btn-secondary" id="sync">Copy to Google Sheets now</button></div></div>
    <p class="filters">${FILTERS.map((f) => html`<a class="${f === status ? 'on' : ''}" href="${link(`admin/orders.html?status=${f}`)}">${f || 'active'}${f ? ` (${counts[f] || 0})` : ''}</a> `)}</p>
    <div class="list">${orders.map((o) => html`<a class="row" href="${link(`admin/order.html?id=${o.id}`)}">
      <div><strong>${o.ref}</strong> · ${o.item_title}<br><small class="muted">${o.business_name} → ${o.buyer_name} · ${date(o.created_at)}</small></div>
      <div class="right">${orderBadge(o.status)}<br><small>${money(o.amount)}</small></div></a>`)}</div>
    ${orders.length ? '' : html`<p class="muted">No orders here.</p>`}`);
  $('#jobs').addEventListener('click', async () => {
    flash.set('Timers run: ' + JSON.stringify((await api('/api/admin/jobs', { method: 'POST', body: {}, as: 'admin' })).result));
    location.reload();
  });
  $('#sync').addEventListener('click', async () => {
    try {
      const { result } = await api('/api/admin/sync-sheets', { method: 'POST', body: {}, as: 'admin' });
      flash.set(result.skipped || 'Google Sheets updated.');
    } catch (err) {
      flash.set('Google Sheets copy failed: ' + err.message);
    }
    location.reload();
  });
}
render().catch(fail);
