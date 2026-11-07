// The seller's notifications: the bell in the top bar of every seller page.
// - The number on the bell is how many are new.
// - The newest new one (with a banner) shows at the top of the page: straight away if it arrives
//   while the seller is on the app (checked every minute), or as soon as they next log in.
// - Closing the banner, or opening the bell, marks them read (on the account, so on every phone).
import { api, html, $, showAnnouncements, track, date } from './core.js';

const EVERY = 60_000;
let state = { items: [], unread: 0, banner: null };
let shownKey = null;

const markSeen = (upTo) => api('/api/seller/notifications/seen', { method: 'POST', body: { up_to: upTo }, as: 'seller', peek: true }).catch(() => {});
const ICON = { welcome: '👋', marketing: '🎉', service: '📢' };

function paintCount() {
  const bell = $('#bell');
  if (!bell) return;
  const n = state.unread;
  const count = bell.querySelector('.bell-count');
  count.textContent = n > 9 ? '9+' : String(n);
  count.hidden = !n;
  bell.setAttribute('aria-label', n ? `Notifications: ${n} new` : 'Notifications');
  bell.classList.toggle('has-new', n > 0);
}

function paintBanner() {
  const b = state.banner;
  if (!b) {
    if (shownKey) $('.ann-wrap')?.remove();
    shownKey = null;
    return;
  }
  // Pages redraw their content now and then: put the banner back if it went with it.
  if (b.key === shownKey && $('.ann-wrap')) return;
  if (b.key !== shownKey) track('notification_banner_shown', { notification: b.key });
  shownKey = b.key;
  showAnnouncements([{ ...b, id: b.key }], {
    onClose: async () => {
      track('notification_banner_closed', { notification: b.key });
      await markSeen(b.created_at);
      await refresh();
    },
  });
}

async function refresh() {
  try {
    state = await api('/api/seller/notifications', { as: 'seller', peek: true });
  } catch {
    return; // offline or logged out: try again next time
  }
  paintCount();
  paintBanner();
}

function openPanel() {
  const opened = state;
  const d = document.createElement('dialog');
  d.className = 'inbox';
  d.setAttribute('aria-label', 'Notifications');
  d.innerHTML = String(html`<div class="inbox-head"><h2>Notifications</h2>
      <button type="button" class="ann-close" data-close aria-label="Close">×</button></div>
    ${opened.items.length
      ? html`<ul class="inbox-list">${opened.items.map((i) => html`<li class="${i.unread ? 'unread' : ''}">
          <span class="ann-icon" aria-hidden="true">${ICON[i.kind] || ICON.service}</span>
          <div class="ann-text">${i.unread ? html`<span class="badge badge-ok">New</span> ` : ''}<strong>${i.title}</strong>
            <p>${i.body}</p>
            ${i.link_url ? html`<a href="${i.link_url}">${i.kind === 'welcome' ? 'Finish setting up →' : 'Open →'}</a> ` : ''}<small class="muted">${date(i.created_at)}</small></div></li>`)}</ul>`
      : html`<p class="muted">No notifications yet. Messages from TrustGap will appear here.</p>`}`);
  document.body.append(d);
  const close = () => { d.close(); d.remove(); };
  d.querySelector('[data-close]').addEventListener('click', close);
  d.addEventListener('click', (e) => { if (e.target === d) close(); }); // tap outside
  d.addEventListener('cancel', () => d.remove());
  d.showModal();
  track('notifications_opened', { unread: opened.unread });
  if (opened.unread) markSeen(opened.items[0].created_at).then(refresh);
}

export function startInbox() {
  const bell = $('#bell');
  if (!bell) return;
  bell.addEventListener('click', openPanel);
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
