// Admin list pages: disputes, sellers, messages, ledger. Which one is chosen by <main data-list>.
import { api, html, show, shell, money, date, link, flash, fail, $, $$, keepFresh, dateFilters, wireDateFilters, dateQuery, byDay } from '../core.js';

await shell('admin');
const list = $('main').dataset.list;

const withDates = (path) => (dateQuery() ? `${path}?${dateQuery()}` : path);

const pages = {
  async disputes() {
    const { disputes } = await api(withDates('/api/admin/disputes'), { as: 'admin' });
    return html`<h1>Disputes</h1>${dateFilters()}<div class="list">${byDay(disputes, (x) => html`<a class="row" href="${link(`admin/order.html?id=${x.order_id}`)}">
      <div><strong>${x.ref}</strong> · ${x.category_label}<br><small class="muted">${x.description.slice(0, 120)}</small></div>
      <div class="right"><span class="badge badge-${x.status === 'open' ? 'warn' : 'muted'}">${x.status.replace('_', ' ')}</span><br><small>${date(x.created_at)}</small></div></a>`,
      { summary: (day) => `${day.filter((x) => x.status === 'open').length} open` })}</div>`;
  },
  async sellers() {
    const { sellers } = await api(withDates('/api/admin/sellers'), { as: 'admin' });
    const btn = (s, action, label, tone = '') => html`<button class="btn btn-small ${tone}" data-seller="${s.id}" data-action="${action}">${label}</button>`;
    return html`<h1>Sellers</h1><p class="muted small">Grouped by the day they joined.</p>${dateFilters()}<div class="list">${byDay(sellers, (s) => html`<div class="row">
      <div><strong>${s.business_name}</strong> (${s.full_name})<br><small class="muted">${s.phone} · ${s.email} ·
        payout ${s.payout_verified_at ? '✓' : '✗'} · ID ${s.identity_verified_at ? `✓ ${s.id_type}${s.id_last4 ? ' ••' + s.id_last4 : ''}` : '✗'}
        ${s.amount_owed ? ` · owes ${money(s.amount_owed)}` : ''}${s.deal_limit ? ` · deals up to ${money(s.deal_limit)}` : ''} · joined ${date(s.created_at)}</small>
        ${s.suspended_at ? html`<br><span class="badge badge-warn">Suspended</span> <small>${date(s.suspended_at)} by ${s.suspended_by || 'admin'}: ${s.suspend_reason || 'no reason recorded'}${s.held ? html` · <strong>${money(s.held)} in payouts held</strong>` : ''}</small>` : ''}
        ${s.history?.length ? html`<details class="small"><summary>History (${s.history.length})</summary><ul>${s.history.map((h) => html`<li>${date(h.created_at)}: ${h.action} by ${h.actor}${h.reason ? ` · ${h.reason}` : ''}</li>`)}</ul></details>` : ''}</div>
      <div class="right actions">
        ${s.identity_verified_at ? '' : btn(s, 'verify', 'Mark ID verified')}
        ${s.suspended_at ? btn(s, 'unsuspend', 'Unsuspend', 'btn-secondary') : btn(s, 'suspend', 'Suspend', 'btn-danger')}
        ${s.amount_owed ? btn(s, 'settled', 'Debt paid', 'btn-secondary') : ''}
        ${btn(s, 'limit', s.deal_limit ? 'Change deal limit' : 'Raise deal limit', 'btn-secondary')}
      </div></div>`)}</div>`;
  },
  async messages() {
    const { messages } = await api(withDates('/api/admin/outbox'), { as: 'admin' });
    return html`<h1>Messages</h1><p class="muted">SMS and emails handed to Make.com. “logged” means no Make webhook is set yet, so nothing was sent.</p>
      ${dateFilters()}
      <div class="list">${byDay(messages, (m) => html`<div class="row"><div><small class="muted">${date(m.created_at)} · ${m.to_phone || m.to_email} · ${m.event}</small><br>${m.sms}
        ${m.last_error ? html`<br><small class="muted">Error: ${m.last_error}</small>` : ''}</div>
        <div class="right"><span class="badge badge-${m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'warn' : 'muted'}">${m.status}</span></div></div>`,
      { summary: (day) => `${day.filter((m) => m.status === 'failed').length} failed` })}</div>`;
  },
  async ledger() {
    const { held, totals, entries, sheets_synced_at } = await api(withDates('/api/admin/ledger'), { as: 'admin' });
    return html`<h1>Ledger</h1>
      <div class="stats"><div class="stat"><span>${money(held)}</span>held for open orders</div>
        <div class="stat"><span>${sheets_synced_at ? date(sheets_synced_at) : 'never'}</span>last Google Sheets copy</div></div>
      ${dateFilters()}
      <h2>${dateQuery().match(/from|to/) ? 'Totals for these dates' : 'All-time totals'}</h2>
      <table class="breakdown">${totals.map((t) => html`<tr><td>${t.kind} (${t.status})</td><td>${money(t.total)}</td></tr>`)}</table>
      <h2>Entries</h2>
      <div class="list">${byDay(entries, (l) => html`<div class="row"><div><a href="${link(`admin/order.html?id=${l.order_id}`)}">${l.ref}</a> · ${l.kind} → ${l.counterparty}
        <br><small class="muted">${date(l.created_at)}${l.provider_ref ? ` · ${l.provider_ref}` : ''}</small></div>
        <div class="right">${money(l.amount)}<br><span class="badge badge-${l.status === 'success' ? 'ok' : ['failed', 'held', 'needs_attention'].includes(l.status) ? 'warn' : 'muted'}">${l.status}</span></div></div>`,
      { summary: (day) => {
        const sum = (kinds) => day.filter((l) => kinds.includes(l.kind)).reduce((n, l) => n + l.amount, 0);
        const earned = day.filter((l) => ['platform_fee', 'delivery_margin', 'dispute_fee'].includes(l.kind) && l.status === 'success').reduce((n, l) => n + l.amount, 0);
        return `in ${money(sum(['collected']))} · out ${money(sum(['seller_payout', 'buyer_refund']))} · TrustGap earned ${money(earned)} (fees, delivery margin, dispute fees)`;
      } })}</div>`;
  },
};

const LIST_PATHS = { disputes: withDates('/api/admin/disputes'), sellers: withDates('/api/admin/sellers'), messages: withDates('/api/admin/outbox'), ledger: withDates('/api/admin/ledger') };

pages[list]()
  .then((content) => {
    show('#app', content);
    wireDateFilters();
    // Lists have no forms to protect, so a change simply reloads the page.
    if (LIST_PATHS[list]) keepFresh(LIST_PATHS[list], () => location.reload(), { as: 'admin' });
    for (const b of $$('[data-seller]')) {
      b.addEventListener('click', async () => {
        const action = b.dataset.action;
        let reason = '';
        if (action === 'suspend') {
          reason = prompt('Why are you suspending this seller? This is sent to them by SMS.\n\nWhile suspended: no new links, their open links stop taking payments, and payouts are held until you unsuspend.');
          if (!reason) return;
        }
        let limit;
        if (action === 'limit') {
          limit = prompt('Highest item price this seller can put on a link, in naira (e.g. 2500000). Leave empty to go back to the normal limit.\n\nRaise it only for a high-value deal you have checked with the seller.', '');
          if (limit === null) return;
          reason = limit ? prompt('Note for the history (optional), e.g. what the deal is:', '') || '' : '';
        }
        if (action === 'unsuspend') {
          reason = prompt('Unsuspend this seller? Held payouts will be sent. Add a note for the history (optional):', '');
          if (reason === null) return;
        }
        try {
          const r = await api(`/api/admin/sellers/${b.dataset.seller}`, { method: 'POST', body: { action, reason, limit: limit?.replace(/[,\s₦]/g, '') }, as: 'admin' });
          flash.set(action === 'unsuspend' ? `Seller unsuspended${r.released ? `; ${r.released} held payout(s) released` : ''}.` : action === 'suspend' ? 'Seller suspended and told by SMS.' : action === 'limit' ? 'Deal limit updated.' : 'Seller updated.');
        } catch (err) {
          alert(err.message);
        }
        location.reload();
      });
    }
  })
  .catch(fail);
