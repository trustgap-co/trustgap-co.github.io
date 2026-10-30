import { all, run, insert, update } from '../lib/db.js';
import { UserError, iso, str, getSeller } from './common.js';
import { sendTransfer } from './orders.js';

// Suspending a seller: no new links, their open links stop taking payments, payouts wait ("held")
// until they're unsuspended, and they're told why. They can still log in and send items buyers have
// already paid for, so no buyer is left stranded; any order can still be refunded through a dispute.

export async function suspendSeller(ctx, sellerId, { reason, by = 'admin' }) {
  const seller = await getSeller(ctx, sellerId);
  if (!seller) throw new UserError('Seller not found.', 404);
  if (seller.suspended_at) throw new UserError('This seller is already suspended.');
  const why = str(reason).slice(0, 500);
  if (why.length < 5) throw new UserError('Give a reason for the suspension (it’s sent to the seller).');
  const now = iso(ctx.now());
  await update(ctx.env, 'sellers', seller.id, { suspended_at: now, suspend_reason: why, suspended_by: by });
  await insert(ctx.env, 'seller_actions', { seller_id: seller.id, action: 'suspended', reason: why, actor: by, created_at: now });
  // Payouts already waiting to go out are held too.
  await run(ctx.env, `UPDATE ledger SET status = 'held' WHERE kind = 'seller_payout' AND status IN ('pending', 'failed')
    AND order_id IN (SELECT id FROM orders WHERE seller_id = ?)`, seller.id);
  await ctx.notify.send({
    event: 'seller_suspended', phone: seller.phone, email: seller.email, emailSubject: 'Your TrustGap account is suspended',
    sms: `TrustGap: your seller account is suspended. Reason: ${why}. Your links can't take new payments and payouts are on hold. Please still send items buyers have already paid for. Contact TrustGap support.`,
  });
}

export async function unsuspendSeller(ctx, sellerId, { reason = '', by = 'admin' } = {}) {
  const seller = await getSeller(ctx, sellerId);
  if (!seller) throw new UserError('Seller not found.', 404);
  if (!seller.suspended_at) throw new UserError('This seller isn’t suspended.');
  const now = iso(ctx.now());
  await update(ctx.env, 'sellers', seller.id, { suspended_at: null, suspend_reason: null, suspended_by: null });
  await insert(ctx.env, 'seller_actions', { seller_id: seller.id, action: 'unsuspended', reason: str(reason).slice(0, 500) || null, actor: by, created_at: now });
  // Held payouts go out now (each still waits for its settlement time, as usual).
  const held = await all(ctx.env, `SELECT id FROM ledger WHERE kind = 'seller_payout' AND status = 'held'
    AND order_id IN (SELECT id FROM orders WHERE seller_id = ?)`, seller.id);
  await run(ctx.env, `UPDATE ledger SET status = 'pending' WHERE kind = 'seller_payout' AND status = 'held'
    AND order_id IN (SELECT id FROM orders WHERE seller_id = ?)`, seller.id);
  for (const l of held) await sendTransfer(ctx, l.id);
  await ctx.notify.send({
    event: 'seller_unsuspended', phone: seller.phone, email: seller.email, emailSubject: 'Your TrustGap account is active again',
    sms: `TrustGap: your seller account is active again. Your links work and held payouts are on their way.`,
  });
  return { released: held.length };
}

export const sellerHistory = (ctx, sellerId) =>
  all(ctx.env, 'SELECT action, reason, actor, created_at FROM seller_actions WHERE seller_id = ? ORDER BY id DESC', sellerId);
