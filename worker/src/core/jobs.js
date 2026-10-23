import { all, run } from '../lib/db.js';
import { deliver } from '../providers/notify/make.js';
import { confirmPayment, releaseToSeller, openDispute, sendTransfer, settleTransfer } from './orders.js';
import { iso, logEvent, transition } from './common.js';

// Runs on the Cloudflare cron trigger (every 5 minutes) and from the admin "Run timers now" button.
export async function runJobs(ctx) {
  const now = iso(ctx.now());
  const result = { expired: 0, cancelled: 0, released: 0, notShipped: 0, transfersSent: 0, transfersChecked: 0, resent: 0 };

  result.expired = (await run(ctx.env, "UPDATE deals SET status = 'expired' WHERE status = 'open' AND expires_at <= ?", now)).meta.changes;

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
