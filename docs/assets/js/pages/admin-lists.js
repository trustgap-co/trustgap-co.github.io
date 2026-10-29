// Admin list pages: disputes, sellers, messages, ledger. Which one is chosen by <main data-list>.
import { api, html, show, shell, money, date, link, flash, fail, $, $$, keepFresh } from '../core.js';

await shell('admin');
const list = $('main').dataset.list;

const pages = {
  async disputes() {
    const { disputes } = await api('/api/admin/disputes', { as: 'admin' });
    return html`<h1>Disputes</h1><div class="list">${disputes.map((x) => html`<a class="row" href="${link(`admin/order.html?id=${x.order_id}`)}">
      <div><strong>${x.ref}</strong> · ${x.category_label}<br><small class="muted">${x.description.slice(0, 120)}</small></div>
      <div class="right"><span class="badge badge-${x.status === 'open' ? 'warn' : 'muted'}">${x.status}</span><br><small>${date(x.created_at)}</small></div></a>`)}</div>
      ${disputes.length ? '' : html`<p class="muted">No disputes.</p>`}`;
  },
  async sellers() {
    const { sellers } = await api('/api/admin/sellers', { as: 'admin' });
    const btn = (s, action, label, tone = '') => html`<button class="btn btn-small ${tone}" data-seller="${s.id}" data-action="${action}">${label}</button>`;
    return html`<h1>Sellers</h1><div class="list">${sellers.map((s) => html`<div class="row">
      <div><strong>${s.business_name}</strong> (${s.full_name})<br><small class="muted">${s.phone} · ${s.email} ·
        payout ${s.payout_verified_at ? '✓' : '✗'} · ID ${s.identity_verified_at ? `✓ ${s.id_type}${s.id_last4 ? ' ••' + s.id_last4 : ''}` : '✗'}
        ${s.amount_owed ? ` · owes ${money(s.amount_owed)}` : ''}</small></div>
      <div class="right actions">
        ${s.identity_verified_at ? '' : btn(s, 'verify', 'Mark ID verified')}
        ${s.suspended_at ? btn(s, 'unsuspend', 'Unsuspend', 'btn-secondary') : btn(s, 'suspend', 'Suspend', 'btn-danger')}
        ${s.amount_owed ? btn(s, 'settled', 'Debt paid', 'btn-secondary') : ''}
      </div></div>`)}</div>`;
  },
  async messages() {
    const { messages } = await api('/api/admin/outbox', { as: 'admin' });
    return html`<h1>Messages</h1><p class="muted">SMS and emails handed to Make.com. “logged” means no Make webhook is set yet, so nothing was sent.</p>
      <div class="list">${messages.map((m) => html`<div class="row"><div><small class="muted">${date(m.created_at)} · ${m.to_phone || m.to_email} · ${m.event}</small><br>${m.sms}
        ${m.last_error ? html`<br><small class="muted">Error: ${m.last_error}</small>` : ''}</div>
        <div class="right"><span class="badge badge-${m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'warn' : 'muted'}">${m.status}</span></div></div>`)}</div>`;
  },
  async ledger() {
    const { held, totals, entries, sheets_synced_at } = await api('/api/admin/ledger', { as: 'admin' });
    return html`<h1>Ledger</h1>
      <div class="stats"><div class="stat"><span>${money(held)}</span>held for open orders</div>
        <div class="stat"><span>${sheets_synced_at ? date(sheets_synced_at) : 'never'}</span>last Google Sheets copy</div></div>
      <table class="breakdown">${totals.map((t) => html`<tr><td>${t.kind} (${t.status})</td><td>${money(t.total)}</td></tr>`)}</table>
      <h2>Entries</h2>
      <table class="breakdown">${entries.map((l) => html`<tr><td><a href="${link(`admin/order.html?id=${l.order_id}`)}">${l.ref}</a> · ${l.kind} → ${l.counterparty}
        <small class="muted">${date(l.created_at)}</small></td><td>${money(l.amount)} <span class="badge badge-muted">${l.status}</span></td></tr>`)}</table>`;
  },
};

const LIST_PATHS = { disputes: '/api/admin/disputes', sellers: '/api/admin/sellers', messages: '/api/admin/outbox', ledger: '/api/admin/ledger' };

pages[list]()
  .then((content) => {
    show('#app', content);
    // Lists have no forms to protect, so a change simply reloads the page.
    if (LIST_PATHS[list]) keepFresh(LIST_PATHS[list], () => location.reload(), { as: 'admin' });
    for (const b of $$('[data-seller]')) {
      b.addEventListener('click', async () => {
        await api(`/api/admin/sellers/${b.dataset.seller}`, { method: 'POST', body: { action: b.dataset.action }, as: 'admin' });
        flash.set('Seller updated.');
        location.reload();
      });
    }
  })
  .catch(fail);
