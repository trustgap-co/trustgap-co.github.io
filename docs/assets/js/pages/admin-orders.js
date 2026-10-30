import { api, html, show, shell, money, date, orderBadge, link, params, flash, fail, keepFresh, $, dateFilters, wireDateFilters, dateQuery, byDay } from '../core.js';

await shell('admin');
const FILTERS = ['', 'awaiting_payment', 'paid', 'shipping', 'delivered', 'disputed', 'completed', 'refunded', 'cancelled'];

// Health and risky settings, so a misconfiguration is seen as soon as the admin logs in.
const settingsBox = (h) => (!h ? '' : !h.ok || h.warnings?.length ? html`<section class="card ${h.ok && !h.warnings.some((w) => w.level === 'danger') ? '' : 'card-warn'}">
  <h2>Settings check</h2>
  ${h.ok ? '' : html`<p class="error">${h.database !== 'connected' ? h.database : h.settings}</p>`}
  <ul class="photo-checks">${(h.warnings || []).map((w) => html`<li class="${w.level === 'danger' ? 'warn' : ''}">${w.level === 'danger' ? '⚠ ' : '• '}${w.text}</li>`)}</ul>
  <p class="small muted">Change these under Cloudflare → your Worker → Settings → Variables and Secrets. SETUP.md explains each one.</p>
</section>` : '');

const ordersPath = () => `/api/admin/orders?status=${encodeURIComponent(params.get('status') || '')}${dateQuery() ? `&${dateQuery()}` : ''}`;

async function render() {
  const status = params.get('status') || '';
  const [{ orders, counts }, health] = await Promise.all([
    api(ordersPath(), { as: 'admin' }),
    api('/api/admin/health', { as: 'admin', peek: true }).catch(() => null),
  ]);
  show('#app', html`${settingsBox(health)}<div class="spread"><h1>Orders</h1>
      <div class="actions"><button class="btn btn-small btn-secondary" id="jobs">Run timers now</button>
      <button class="btn btn-small btn-secondary" id="sync">Copy to Google Sheets now</button>
      <button class="btn btn-small btn-secondary" id="fezhook">Register Fez webhook</button></div></div>
    <p class="filters">${FILTERS.map((f) => html`<a class="${f === status ? 'on' : ''}" href="${link(`admin/orders.html?status=${f}${dateQuery() ? `&${dateQuery()}` : ''}`)}">${f || 'active'}${f ? ` (${counts[f] || 0})` : ''}</a> `)}</p>
    ${dateFilters()}
    <div class="list">${byDay(orders, (o) => html`<a class="row" href="${link(`admin/order.html?id=${o.id}`)}">
      <div><strong>${o.ref}</strong> · ${o.item_title}<br><small class="muted">${o.business_name} → ${o.buyer_name} · ${date(o.created_at)}</small></div>
      <div class="right">${orderBadge(o.status)}<br><small>${money(o.amount)}</small></div></a>`,
      { summary: (day) => money(day.reduce((n, o) => n + o.amount, 0)) })}</div>`);
  wireDateFilters();
  $('#jobs').addEventListener('click', async () => {
    flash.set('Timers run: ' + JSON.stringify((await api('/api/admin/jobs', { method: 'POST', body: {}, as: 'admin' })).result));
    location.reload();
  });
  $('#fezhook').addEventListener('click', async () => {
    try {
      const { registered } = await api('/api/admin/courier/register-webhook', { method: 'POST', body: {}, as: 'admin' });
      flash.set(`Fez will send parcel updates to ${registered}`);
    } catch (err) {
      flash.set('Fez webhook: ' + err.message);
    }
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
render().then(() => keepFresh(ordersPath(), render, { as: 'admin' })).catch(fail);
