// The early-access code. It takes the TrustGap fee (1.5%) off a deal, and never more: Flutterwave's
// processing and the courier are still paid in full, so the most TrustGap gives away is its own fee.
//  - Seller: entered when creating a link. The link has no TrustGap fee at all (whoever was going
//    to pay it, buyer, seller or both, pays nothing). Once per seller account.
//  - Buyer: entered on step 1 of a link. Removes the buyer's share of the fee from their total.
//    Once per buyer phone number. If the seller pays the whole fee, there's nothing to remove.
import { first } from '../lib/db.js';
import { UserError } from './common.js';

export const normaliseCode = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

// Is this code real, still running and not used up? Returns the code, or null if none was typed.
export async function checkPromo(ctx, input) {
  const code = normaliseCode(input);
  if (!code) return null;
  const p = ctx.config.promo;
  if (!p.code || code !== p.code) throw new UserError('That code isn’t valid. Check it and try again.');
  if (p.endsAt && ctx.now() > p.endsAt) throw new UserError('This early-access code has expired.');
  const used = await first(ctx.env, `SELECT
      (SELECT COUNT(*) FROM deals WHERE promo_code = ? AND status NOT IN ('expired', 'cancelled', 'replaced'))
    + (SELECT COUNT(*) FROM orders WHERE promo_code = ? AND status NOT IN ('awaiting_payment', 'cancelled')) AS n`, code, code);
  if (used.n >= p.maxUses) throw new UserError('This early-access offer has been fully used.');
  return code;
}

// A seller's use counts while the link is open or paid. If it expires or is cancelled unpaid, they
// can use the code again. `revising` is the link being replaced, which doesn't count.
export async function checkSellerPromo(ctx, seller, input, revising = null) {
  const code = await checkPromo(ctx, input);
  if (!code) return null;
  const used = await first(ctx.env,
    "SELECT id FROM deals WHERE seller_id = ? AND promo_code = ? AND status NOT IN ('expired', 'cancelled', 'replaced') AND id IS NOT ?",
    seller.id, code, revising);
  if (used) throw new UserError('You have already used your early-access code on another link.');
  return code;
}

export async function buyerUsedPromo(ctx, phone, code) {
  return Boolean(await first(ctx.env,
    "SELECT id FROM orders WHERE buyer_phone = ? AND promo_code = ? AND status NOT IN ('awaiting_payment', 'cancelled')", phone, code));
}
