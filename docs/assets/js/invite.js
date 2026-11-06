// "Invite a seller, earn free deals": the full card lives on the Settings page; the dashboard shows a
// short pop-up version once after each login (auth-code.js sets the flag when a seller logs in).
import { html, money, date, track, link, session, $ } from './core.js';

const POPUP_FLAG = 'tg_invite_popup';
export const askForInvitePopup = () => session.set(POPUP_FLAG, '1');

const shareText = (rf) => `I use TrustGap to sell safely on WhatsApp and Instagram: the buyer's payment is held, and I'm paid after delivery. Join with my link and your first ${rf.welcome_deals} deals have no TrustGap fee: ${rf.link}`;
const waLink = (rf) => `https://wa.me/?text=${encodeURIComponent(shareText(rf))}`;
const rewardText = (rf) => (rf.reward_deals === 1 ? 'a free deal' : `${rf.reward_deals} free deals`);

export function inviteCard(rf) {
  return html`<section class="card invite-card" id="invite">
    <h2>🎁 Invite a seller, earn free deals</h2>
    <p>Sellers who join with your link get their <strong>first ${rf.welcome_deals} deals with no TrustGap fee</strong>. When they complete their first protected deal (item ${money(rf.min_order)} or more), you get <strong>${rewardText(rf)}</strong> too.</p>
    <div class="share-row"><input id="invite-link" readonly value="${rf.link}" aria-label="Your invite link">
      <button type="button" class="btn btn-small btn-secondary" data-invite-copy>Copy link</button>
      <a class="btn btn-small btn-whatsapp" data-invite-wa href="${waLink(rf)}" target="_blank" rel="noopener">💬 Share on WhatsApp</a></div>
    <ul class="invite-stats">
      <li><strong>${rf.invited}</strong> invited</li><li><strong>${rf.active}</strong> completed a deal</li>
      <li><strong>${rf.free_deals}</strong> free ${rf.free_deals === 1 ? 'deal' : 'deals'} to use${rf.free_deals && rf.next_expiry ? html` <small class="muted">(next expires ${date(rf.next_expiry)})</small>` : ''}</li>
      <li>${rf.ambassador ? html`<span class="badge badge-ok">⭐ TrustGap Ambassador</span>` : html`<strong>${rf.active}/${rf.ambassador_at}</strong> to become a TrustGap Ambassador`}</li></ul>
    <p class="small muted">Your code: <strong>${rf.code}</strong>. Free deals are used on your next link automatically and remove only the TrustGap fee. They expire after 90 days.</p>
  </section>`;
}

// Copy and WhatsApp buttons inside `root` (the card or the pop-up).
export function wireInvite(rf, root = document) {
  root.querySelectorAll('[data-invite-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(rf.link); } catch { const i = $('#invite-link', root); i?.select(); document.execCommand?.('copy'); }
    b.textContent = 'Copied ✓';
    track('referral_link_copied', {});
  }));
  root.querySelectorAll('[data-invite-wa]').forEach((a) => a.addEventListener('click', () => track('share', { method: 'whatsapp', content_type: 'seller_invite' })));
}

// The pop-up after login. Resolves when it is closed, so the dashboard tour can wait for it.
export function invitePopup(rf) {
  if (!rf?.on || !session.get(POPUP_FLAG)) return Promise.resolve(false);
  session.del(POPUP_FLAG);
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal invite-modal';
    dlg.innerHTML = String(html`<form method="dialog">
      <div class="invite-modal-gift" aria-hidden="true">🎁</div>
      <h2>Invite a seller, earn free deals</h2>
      <p>Know someone who sells on WhatsApp or Instagram? Send them your link. Their <strong>first ${rf.welcome_deals} deals have no TrustGap fee</strong>, and you get <strong>${rewardText(rf)}</strong> when they complete their first protected deal.</p>
      ${rf.free_deals ? html`<p class="callout ok">You have <strong>${rf.free_deals} free ${rf.free_deals === 1 ? 'deal' : 'deals'}</strong> to use: it’s applied to your next link automatically.</p>` : ''}
      <p class="invite-modal-code">Your code <strong>${rf.code}</strong></p>
      <a class="btn btn-block btn-whatsapp" data-invite-wa href="${waLink(rf)}" target="_blank" rel="noopener">💬 Share on WhatsApp</a>
      <button type="button" class="btn btn-block btn-secondary" data-invite-copy>Copy my invite link</button>
      <p class="invite-modal-foot"><a href="${link('seller/settings.html#invite')}">See your invites in Settings</a> · <button class="linklike" value="close">Not now</button></p>
    </form>`);
    document.body.appendChild(dlg);
    wireInvite(rf, dlg);
    dlg.addEventListener('close', () => { dlg.remove(); resolve(true); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // tap outside to close
    dlg.showModal();
    track('referral_popup_shown', {});
    dlg.querySelector('button[value=close]').focus();
  });
}
