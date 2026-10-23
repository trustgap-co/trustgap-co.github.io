import { first, insertStmt, updateStmt, stmt } from '../lib/db.js';
import { randomToken } from '../lib/crypto.js';
import { nairaToKobo, quote, splitCharges, formatNaira } from '../lib/money.js';
import { zoneById, deliveryFeeKobo } from '../lib/zones.js';
import { UserError, CONDITIONS, EXPIRY_OPTIONS, iso, addHours, str, requireLength, getDeal, getSeller } from './common.js';

export async function createDeal(ctx, seller, input) {
  if (seller.suspended_at) throw new UserError('Your account is suspended. Contact support.');
  if (!seller.payout_verified_at) throw new UserError('Add and verify your payout bank account before creating links.');
  if (ctx.config.requireSellerId && !seller.identity_verified_at) {
    throw new UserError('Verify your identity with your NIN before creating links.');
  }
  if (seller.amount_owed > 0) {
    throw new UserError(`You owe ${formatNaira(seller.amount_owed)} from a past dispute. Settle it before creating new links.`);
  }

  const itemTitle = requireLength(input.item_title, 'Item name', 3, 120);
  const itemDescription = requireLength(input.item_description, 'Description', 10, 1000);
  const itemCondition = str(input.item_condition);
  if (!CONDITIONS.includes(itemCondition)) throw new UserError('Choose the item condition.');
  const quantity = Number(input.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new UserError('Quantity must be 1 to 100.');
  const itemPrice = nairaToKobo(input.item_price);
  if (itemPrice == null || itemPrice < 500 * 100) throw new UserError('Price must be at least ₦500.');
  if (itemPrice > ctx.config.maxDealKobo) {
    throw new UserError(`During the pilot, deals are limited to ${formatNaira(ctx.config.maxDealKobo)}.`);
  }
  const pickupAddress = requireLength(input.pickup_address, 'Pickup address', 10, 300);
  const pickupZone = str(input.pickup_zone);
  const deliveryZone = str(input.delivery_zone);
  if (!zoneById(pickupZone)) throw new UserError('Choose your pickup area.');
  if (!zoneById(deliveryZone)) throw new UserError("Choose the buyer's delivery area.");
  const deliveryPayer = str(input.delivery_payer);
  const feePayer = str(input.fee_payer);
  if (!['buyer', 'seller'].includes(deliveryPayer)) throw new UserError('Choose who pays for delivery.');
  if (!['buyer', 'seller', 'split'].includes(feePayer)) throw new UserError('Choose who pays the TrustGap fee.');
  const deliveryDays = Number(input.delivery_days || 2);
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1 || deliveryDays > 7) throw new UserError('Ship-within must be 1 to 7 days.');
  const expiresHours = Number(input.expires_hours || 24);
  if (!EXPIRY_OPTIONS.includes(expiresHours)) throw new UserError('Choose when the link expires.');

  const deliveryFee = deliveryFeeKobo(pickupZone, deliveryZone);
  const q = quote({ itemPrice, deliveryFee, deliveryPayer, feePayer }, ctx.config.fee, ctx.config.processing);
  if (q.sellerPayout <= 0) throw new UserError('After delivery and fees you would receive nothing. Adjust the price or who pays.');

  const now = ctx.now();
  const token = randomToken(12);
  const statements = [];
  let replacesId = null;
  if (input.replaces) {
    const old = await first(ctx.env, 'SELECT * FROM deals WHERE id = ? AND seller_id = ?', Number(input.replaces), seller.id);
    if (old && old.status === 'open') {
      replacesId = old.id;
      statements.push(stmt(ctx.env, "UPDATE deals SET status = 'replaced' WHERE id = ? AND status = 'open'", old.id));
    }
  }
  statements.push(
    insertStmt(ctx.env, 'deals', {
      token,
      seller_id: seller.id,
      replaces_deal_id: replacesId,
      item_title: itemTitle,
      item_description: itemDescription,
      item_condition: itemCondition,
      quantity,
      item_price: itemPrice,
      pickup_address: pickupAddress,
      pickup_zone: pickupZone,
      delivery_zone: deliveryZone,
      delivery_fee: deliveryFee,
      delivery_payer: deliveryPayer,
      fee_payer: feePayer,
      platform_fee: q.platformFee,
      processing_fee: q.processingFee,
      buyer_total: q.buyerTotal,
      seller_payout: q.sellerPayout,
      delivery_days: deliveryDays,
      inspection_hours: ctx.config.inspectionHours,
      status: 'open',
      expires_at: iso(addHours(now, expiresHours)),
      created_at: iso(now),
    }),
    updateStmt(ctx.env, 'sellers', seller.id, { pickup_address: pickupAddress, pickup_zone: pickupZone }),
  );
  await ctx.env.DB.batch(statements);
  return first(ctx.env, 'SELECT * FROM deals WHERE token = ?', token);
}

// Returns the deal with an up-to-date status, expiring it if its time has passed.
export async function refreshDeal(ctx, deal) {
  if (deal && deal.status === 'open' && new Date(deal.expires_at) <= ctx.now()) {
    await stmt(ctx.env, "UPDATE deals SET status = 'expired' WHERE id = ? AND status = 'open'", deal.id).run();
    return { ...deal, status: 'expired' };
  }
  return deal;
}

export async function cancelDeal(ctx, seller, dealId) {
  const res = await stmt(ctx.env, "UPDATE deals SET status = 'cancelled' WHERE id = ? AND seller_id = ? AND status = 'open'", dealId, seller.id).run();
  if (res.meta.changes !== 1) throw new UserError('Only an unpaid, open link can be cancelled.');
}

// Breakdown from the amounts saved with the deal, so later fee changes never alter an existing link.
export function priceBreakdown(deal) {
  return splitCharges({
    itemPrice: deal.item_price,
    deliveryFee: deal.delivery_fee,
    deliveryPayer: deal.delivery_payer,
    feePayer: deal.fee_payer,
    platformFee: deal.platform_fee,
    processingFee: deal.processing_fee,
  });
}

// What the buyer may see. Never includes the pickup address or seller contact details.
export async function publicDealView(ctx, deal) {
  const seller = await getSeller(ctx, deal.seller_id);
  const q = priceBreakdown(deal);
  return {
    token: deal.token,
    status: deal.status,
    seller: { business_name: seller.business_name, identity_verified: Boolean(seller.identity_verified_at) },
    item_title: deal.item_title,
    item_description: deal.item_description,
    item_condition: deal.item_condition,
    quantity: deal.quantity,
    delivery_area: zoneById(deal.delivery_zone)?.name,
    delivery_days: deal.delivery_days,
    inspection_hours: deal.inspection_hours,
    expires_at: deal.expires_at,
    fee_payer: deal.fee_payer,
    price: {
      item: q.itemPrice,
      delivery: q.buyerDelivery,
      delivery_paid_by_seller: q.sellerDelivery > 0,
      platform_fee: q.buyerPlatformShare,
      processing_fee: q.buyerProcessingShare,
      fee_paid_by_seller: q.buyerFeeShare === 0,
      total: q.buyerTotal,
    },
  };
}

export { getDeal };
