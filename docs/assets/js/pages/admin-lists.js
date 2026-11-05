// Admin list pages: disputes, sellers, messages, ledger. Which one is chosen by <main data-list>.
import { api, auth, html, show, shell, money, date, link, flash, fail, params, $, $$, keepFresh, dateFilters, wireDateFilters, dateQuery, byDay } from '../core.js';

await shell('admin');
const list = $('main').dataset.list;

const withDates = (path) => (dateQuery() ? `${path}?${dateQuery()}` : path);
// The ledger, filtered to the segment in the address (?segment=revenue …) and the chosen dates.
const ledgerPath = () => `/api/admin/ledger?${new URLSearchParams({ ...(params.get('segment') ? { segment: params.get('segment') } : {}), ...Object.fromEntries(new URLSearchParams(dateQuery())) })}`;
// Plain names for the kinds of ledger entry.
const KIND = {
  collected: 'Buyer payment', seller_payout: 'Seller payout', buyer_refund: 'Buyer refund', platform_fee: 'TrustGap fee',
  delivery_margin: 'Delivery margin', dispute_fee: 'Dispute fee', delivery_cost: 'Courier: delivery', return_cost: 'Courier: return',
  processing_fee: 'Payment processing', fee_waived: 'Fee waived', platform_retained: 'Kept from a dispute decision', debt_recovered: 'Seller debt recovered',
};

const pages = {
  async disputes() {
    const { disputes } = await api(withDates('/api/admin/disputes'), { as: 'admin' });
    return html`<h1>Disputes</h1>${dateFilters()}<div class="list">${byDay(disputes, (x) => html`<a class="row" href="${link(`admin/order.html?id=${x.order_id}`)}">
      <div><strong>${x.ref}</strong> · ${x.category_label}<br><small class="muted">${x.description.slice(0, 120)}</small></div>
      <div class="right"><span class="badge badge-${x.status === 'open' ? 'warn' : 'muted'}">${x.status.replace('_', ' ')}</span><br><small>${date(x.created_at)}</small></div></a>`,
      { summary: (day) => `${day.filter((x) => x.status === 'open').length} open` })}</div>`;
  },
  async sellers() {
    const { sellers, top_referrers: top } = await api(withDates('/api/admin/sellers'), { as: 'admin' });
    const btn = (s, action, label, tone = '') => html`<button class="btn btn-small ${tone}" data-seller="${s.id}" data-action="${action}">${label}</button>`;
    return html`<h1>Sellers</h1>
      ${top?.length ? html`<details class="rules" open><summary>Top referrers</summary><table class="breakdown">
        <tr><td><strong>Seller</strong></td><td><strong>Invited · completed a deal · blocked</strong></td></tr>
        ${top.map((r) => html`<tr><td>${r.business_name}${r.active >= 5 ? ' ⭐' : ''}</td><td>${r.invited} · ${r.active || 0} · ${r.blocked || 0}</td></tr>`)}</table>
        <p class="small muted">A referral counts once the invited seller completes a protected deal (item ₦10,000 or more, no dispute). Blocked: same bank account or identity, the buyer was one of them, or the monthly cap.</p></details>` : ''}
      <p class="muted small">Grouped by the day they joined.</p>${dateFilters()}<div class="list">${byDay(sellers, (s) => html`<div class="row">
      <div><strong>${s.business_name}</strong> (${s.full_name})<br><small class="muted">${s.phone} · ${s.email} ·
        payout ${s.payout_verified_at ? '✓' : '✗'} · ID ${s.identity_verified_at ? `✓ ${s.id_type}${s.id_last4 ? ' ••' + s.id_last4 : ''}` : '✗'}
        ${s.amount_owed ? ` · owes ${money(s.amount_owed)}` : ''}${s.deal_limit ? ` · deals up to ${money(s.deal_limit)}` : ''} · joined ${date(s.created_at)}
        ${s.referred_by_name || s.invited || s.free_deals ? html`<br>🎁 ${s.referred_by_name ? `invited by ${s.referred_by_name} · ` : ''}${s.ref_code ? `code ${s.ref_code} · ` : ''}invited ${s.invited || 0} (${s.invites_active || 0} completed a deal) · ${s.free_deals || 0} free deals left` : ''}</small>
        ${s.suspended_at ? html`<br><span class="badge badge-warn">Suspended</span> <small>${date(s.suspended_at)} by ${s.suspended_by || 'admin'}: ${s.suspend_reason || 'no reason recorded'}${s.held ? html` · <strong>${money(s.held)} in payouts held</strong>` : ''}</small>` : ''}
        ${s.history?.length ? html`<details class="small"><summary>History (${s.history.length})</summary><ul>${s.history.map((h) => html`<li>${date(h.created_at)}: ${h.action} by ${h.actor}${h.reason ? ` · ${h.reason}` : ''}</li>`)}</ul></details>` : ''}</div>
      <div class="right actions">
        ${auth.isLead()
          // The Customer Relations Admin can suspend in an emergency; the admin does the rest.
          ? (s.suspended_at ? html`<small class="muted">Only the admin can unsuspend.</small>` : btn(s, 'suspend', 'Suspend', 'btn-danger'))
          : html`${s.identity_verified_at ? '' : btn(s, 'verify', 'Mark ID verified')}
        ${s.suspended_at ? btn(s, 'unsuspend', 'Unsuspend', 'btn-secondary') : btn(s, 'suspend', 'Suspend', 'btn-danger')}
        ${s.amount_owed ? btn(s, 'settled', 'Debt paid', 'btn-secondary') : ''}
        ${btn(s, 'limit', s.deal_limit ? 'Change deal limit' : 'Raise deal limit', 'btn-secondary')}`}
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
    if (auth.isLead()) return html`<h1>Ledger</h1><p class="muted">The ledger is for the admin only.</p>`;
    const { held, segment, segments, totals, entries, sheets_synced_at } = await api(ledgerPath(), { as: 'admin' });
    const tab = (key) => link(`admin/ledger.html?${new URLSearchParams({ ...(key === 'all' ? {} : { segment: key }), ...Object.fromEntries(new URLSearchParams(dateQuery())) })}`);
    const current = segments.find((x) => x.key === segment);
    return html`<h1>Ledger</h1>
      <div class="stats"><div class="stat"><span>${money(held)}</span>held for open orders</div>
        <div class="stat"><span>${sheets_synced_at ? date(sheets_synced_at) : 'never'}</span>last Google Sheets copy</div></div>
      ${dateFilters()}
      <h2>${dateQuery().match(/from|to/) ? 'Segments for these dates' : 'Segments, all time'}</h2>
      <div class="ledger-segments">
        <a class="seg-card ${segment === 'all' ? 'on' : ''}" href="${tab('all')}"><span>Everything</span><strong>${segments.reduce((n, x) => n + (x.key === 'problems' ? 0 : x.count), 0)} entries</strong><small>All kinds of entry</small></a>
        ${segments.map((x) => html`<a class="seg-card ${x.key === segment ? 'on' : ''} ${x.key === 'problems' && x.count ? 'warn' : ''}" href="${tab(x.key)}">
          <span>${x.label}</span><strong>${x.key === 'problems' ? `${x.count} ${x.count === 1 ? 'entry' : 'entries'}` : money(x.total)}</strong><small>${x.note}</small></a>`)}
      </div>
      <h2>${current ? current.label : 'Everything'}: totals by kind</h2>
      <table class="breakdown">${totals.map((t) => html`<tr><td>${KIND[t.kind] || t.kind} <small class="muted">(${t.status})</small></td><td>${money(t.total)}</td></tr>`)}</table>
      <h2>Entries</h2>
      <div class="list">${byDay(entries, (l) => html`<div class="row"><div><a href="${link(`admin/order.html?id=${l.order_id}`)}">${l.ref}</a> · ${KIND[l.kind] || l.kind} → ${l.counterparty}
        <br><small class="muted">${date(l.created_at)}${l.provider_ref ? ` · ${l.provider_ref}` : ''}</small></div>
        <div class="right">${money(l.amount)}<br><span class="badge badge-${l.status === 'success' ? 'ok' : ['failed', 'held', 'needs_attention', 'owed'].includes(l.status) ? 'warn' : 'muted'}">${l.status}</span></div></div>`,
      { summary: (day) => {
        const sum = (kinds) => day.filter((l) => kinds.includes(l.kind) && !['failed', 'cancelled'].includes(l.status)).reduce((n, l) => n + l.amount, 0);
        return `in ${money(sum(['collected']))} · out ${money(sum(['seller_payout', 'buyer_refund']))} · TrustGap revenue ${money(sum(['platform_fee', 'delivery_margin', 'dispute_fee']))} · costs ${money(sum(['delivery_cost', 'return_cost', 'processing_fee']))}`;
      } })}</div>`;

  },
};

const LIST_PATHS = { disputes: withDates('/api/admin/disputes'), sellers: withDates('/api/admin/sellers'), messages: withDates('/api/admin/outbox'), ledger: ledgerPath() };

pages[list]()
  .then((content) => {
    show('#app', content);
    wireDateFilters();
    // Lists have no forms to protect, so a change simply reloads the page.
    if (LIST_PATHS[list] && !(list === 'ledger' && auth.isLead())) keepFresh(LIST_PATHS[list], () => location.reload(), { as: 'admin' });
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
