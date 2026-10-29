import { all, run } from '../lib/db.js';
import { deliver } from '../providers/notify/make.js';
import { confirmPayment, releaseToSeller, openDispute, sendTransfer, settleTransfer, syncCourierStatus } from './orders.js';
import { iso, logEvent, transition } from './common.js';
import { syncReturnStatus } from './returns.js';

// Runs on the Cloudflare cron trigger (every 5 minutes) and from the admin "Run timers now" button.
export async function runJobs(ctx) {
  const now = iso(ctx.now());
  const result = { expired: 0, cancelled: 0, released: 0, notShipped: 0, couriersChecked: 0, transfersSent: 0, transfersChecked: 0, resent: 0 };

  result.expired = (await run(ctx.env, "UPDATE deals SET status = 'expired' WHERE status = 'open' AND expires_at <= ?", now)).meta.changes;

  // Photos of links nobody paid are deleted 30 days after the link was made, to keep the database
  // small. Paid deals keep theirs: they are evidence. (A revised link already has its own copy.)
  const photoCutoff = iso(new Date(ctx.now().getTime() - 30 * 24 * 3600_000));
  result.photosDeleted = (await run(ctx.env, `DELETE FROM deal_photos WHERE deal_id IN (
    SELECT d.id FROM deals d WHERE d.status IN ('expired', 'cancelled', 'replaced') AND d.created_at <= ?
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.deal_id = d.id AND o.status NOT IN ('awaiting_payment', 'cancelled')))`, photoCutoff)).meta.changes;

  // Abandoned checkouts: check with the provider one last time (they may have paid late), then cancel.
  const staleBefore = iso(new Date(ctx.now().getTime() - ctx.config.paymentTimeoutMinutes * 2 * 60_000));
  for (const o of await all(ctx.env, "SELECT * FROM orders WHERE status = 'awaiting_payment' AND created_at <= ? LIMIT 50", staleBefore)) {
    const fresh = await confirmPayment(ctx, o.tx_ref, 'system');
    if (fresh.status === 'awaiting_payment' && (await transition(ctx, o.id, ['awaiting_payment'], { status: 'cancelled', closed_at: now }))) {
      await logEvent(ctx, o.id, 'system', 'checkout_abandoned');
      result.cancelled++;
    }
  }

  for (const o of await all(ctx.env, "SELECT * FROM orders WHERE status = 'delivered' AND inspection_ends_at <= ? LIMIT 50", now)) {
    if (await releaseToSeller(ctx, o, 'auto_released')) result.released++;
  }

  for (const o of await all(ctx.env, "SELECT * FROM orders WHERE status = 'paid' AND ship_by <= ? LIMIT 50", now)) {
    await openDispute(ctx, o, { by: 'system', category: 'not_shipped', description: 'The seller did not book pickup within the agreed time.' });
    result.notShipped++;
  }

  // Parcels with the courier (Fez): read their status, in case a webhook was missed. Includes refused
  // parcels the courier is still carrying back on the original order (order under review, door return open).
  for (const o of await all(ctx.env, `SELECT * FROM orders o WHERE o.courier = ? AND o.delivery_ref IS NOT NULL AND (o.status = 'shipping'
      OR (o.status = 'disputed' AND EXISTS (SELECT 1 FROM returns r WHERE r.order_id = o.id AND r.kind = 'door' AND r.status = 'with_rider'))) LIMIT 30`, ctx.logistics.name)) {
    try {
      if (await syncCourierStatus(ctx, o)) result.couriersChecked++;
    } catch (err) {
      console.error('courier status check failed', o.ref, err.message);
    }
  }

  // Returns travelling with the courier (Fez): the seller giving their PIN marks them delivered.
  for (const ret of await all(ctx.env, "SELECT * FROM returns WHERE kind = 'pickup' AND courier = ? AND delivery_ref IS NOT NULL AND status IN ('booked', 'picked_up', 'out_for_delivery', 'attempt_failed') LIMIT 30", ctx.logistics.name)) {
    try {
      if (await syncReturnStatus(ctx, ret)) result.couriersChecked++;
    } catch (err) {
      console.error('return status check failed', ret.id, err.message);
    }
  }

  // Payouts and refunds that are now due (after settlement), plus retries of unknown/failed ones.
  for (const l of await all(
    ctx.env,
    `SELECT id FROM ledger WHERE kind IN ('seller_payout', 'buyer_refund') AND status IN ('pending', 'unknown', 'failed')
     AND (not_before IS NULL OR not_before <= ?) LIMIT 50`,
    now,
  )) {
    await sendTransfer(ctx, l.id);
    result.transfersSent++;
  }

  // Transfers Flutterwave accepted but hasn't confirmed after 30 minutes: ask for their final status
  // (covers a missed webhook).
  const checkBefore = iso(new Date(ctx.now().getTime() - 30 * 60_000));
  for (const l of await all(ctx.env, "SELECT transfer_ref, provider_ref FROM ledger WHERE status = 'submitted' AND created_at <= ? LIMIT 50", checkBefore)) {
    await settleTransfer(ctx, { reference: l.transfer_ref, providerRef: l.provider_ref });
    result.transfersChecked++;
  }

  // Messages Make.com didn't accept: retry up to 5 times.
  for (const m of await all(ctx.env, "SELECT id FROM outbox WHERE status = 'failed' AND attempts < 5 LIMIT 50")) {
    await deliver(ctx, m.id);
    result.resent++;
  }

  const dayAgo = iso(new Date(ctx.now().getTime() - 86_400_000));
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    ctx.env.DB.prepare('DELETE FROM otps WHERE created_at < ?').bind(dayAgo),
  ]);
  return result;
}
