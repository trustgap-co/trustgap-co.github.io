import { first, all, insertStmt, updateStmt, stmt } from '../lib/db.js';
import { parsePhotos, photoUrls } from '../lib/photos.js';
import { checkSellerPromo } from './promo.js';
import { fillConsent } from '../lib/terms.js';
import { randomToken } from '../lib/crypto.js';
import { nairaToKobo, splitCharges, platformFee, processingFee, buyerPart, formatNaira } from '../lib/money.js';
import { normaliseState } from '../lib/states.js';
import { UserError, CONDITIONS, EXPIRY_OPTIONS, iso, addHours, str, requireLength, getDeal, getSeller } from './common.js';

const PAYERS = ['buyer', 'seller', 'split'];

// The fields that decide the price. Shared by the seller's "Calculate price" preview and link
// creation, so the preview is always exactly what the link will charge.
function pricingInput(ctx, input) {
  const itemPrice = nairaToKobo(input.item_price);
  if (itemPrice == null || itemPrice < 500 * 100) throw new UserError('Price must be at least ₦500.');
  if (itemPrice > ctx.config.maxDealKobo) {
    throw new UserError(`During the pilot, deals are limited to ${formatNaira(ctx.config.maxDealKobo)}.`);
  }
  const pickupState = normaliseState(input.pickup_state);
  if (!pickupState) throw new UserError('Enter the state you ship from (one of the 36 states or FCT).');
  const deliveryState = normaliseState(input.delivery_state);
  if (!deliveryState) throw new UserError("Enter the buyer's state (one of the 36 states or FCT).");
  // Fez prices by whole kilograms.
  const weightKg = Math.ceil(Number(input.weight_kg ?? 1));
  if (!Number.isFinite(weightKg) || weightKg < 1 || weightKg > 100) throw new UserError('Parcel weight must be 1 to 100 kg.');
  const deliveryPayer = str(input.delivery_payer);
  const feePayer = str(input.fee_payer);
  if (!PAYERS.includes(deliveryPayer)) throw new UserError('Choose who pays for delivery.');
  if (!PAYERS.includes(feePayer)) throw new UserError('Choose who pays the TrustGap fee.');
  return { itemPrice, pickupState, deliveryState, weightKg, deliveryPayer, feePayer };
}

// Delivery price from the courier (Fez /order/cost, or the manual table), the TrustGap fee, and
// payment processing grossed up on the real total. With an early-access code there is no TrustGap fee.
async function priceDeal(ctx, p, { promo = false } = {}) {
  let deliveryFee;
  try {
    ({ feeKobo: deliveryFee } = await ctx.logistics.quote({ pickupState: p.pickupState, dropoffState: p.deliveryState, weightKg: p.weightKg }));
  } catch (err) {
    throw new UserError(`We couldn't get a delivery price right now (${err.message}). Please try again in a moment.`, 503);
  }
  const pf = promo ? 0 : platformFee(p.itemPrice, ctx.config.fee);
  const buyerShare = p.feePayer === 'buyer' ? 1 : p.feePayer === 'split' ? 0.5 : 0;
  const pr = processingFee(
    { itemPrice: p.itemPrice, buyerDelivery: buyerPart(p.deliveryPayer, deliveryFee), platform: pf, buyerShare },
    ctx.config.processing,
  );
  const q = splitCharges({ itemPrice: p.itemPrice, deliveryFee, deliveryPayer: p.deliveryPayer, feePayer: p.feePayer, platformFee: pf, processingFee: pr });
  if (q.sellerPayout <= 0) {
    throw new UserError(`Delivery to ${p.deliveryState} plus fees is more than you would receive. Adjust the price or who pays.`);
  }
  return q;
}

// "Calculate price" on the seller's form.
export async function previewDeal(ctx, input, seller) {
  const p = pricingInput(ctx, input);
  const promo = await checkSellerPromo(ctx, seller, input.promo_code, input.replaces ? Number(input.replaces) : null);
  return {
    pickup_state: p.pickupState,
    delivery_state: p.deliveryState,
    price: await priceDeal(ctx, p, { promo: Boolean(promo) }),
    promo: promo && { code: promo, saving: platformFee(p.itemPrice, ctx.config.fee) },
  };
}

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
  const pickupAddress = requireLength(input.pickup_address, 'Pickup address', 10, 300);
  const deliveryAddress = requireLength(input.delivery_address, "Buyer's delivery address", 10, 300);
  const deliveryLandmark = str(input.delivery_landmark).slice(0, 200);
  const fragile = input.fragile === true || input.fragile === 'yes' || input.fragile === 'on';
  const deliveryDays = Number(input.delivery_days || 2);
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1 || deliveryDays > 7) throw new UserError('Ship-within must be 1 to 7 days.');
  const expiresHours = Number(input.expires_hours || 24);
  if (!EXPIRY_OPTIONS.includes(expiresHours)) throw new UserError('Choose when the link expires.');
  // Photos: new ones, or (when revising a link without adding new ones) the old link's photos.
  const photos = await parsePhotos(input.photos);
  const old = input.replaces ? await first(ctx.env, 'SELECT * FROM deals WHERE id = ? AND seller_id = ?', Number(input.replaces), seller.id) : null;
  const replaced = old && old.status === 'open' ? old : null;
  const copyPhotosFrom = !photos.length && replaced?.photo_count ? replaced : null;
  const photoCount = photos.length || copyPhotosFrom?.photo_count || 0;
  if (!photoCount) throw new UserError('Add at least one photo of the item, so the buyer can see what they are paying for.');
  const p = pricingInput(ctx, input);
  const promo = await checkSellerPromo(ctx, seller, input.promo_code, replaced?.id ?? null);
  const q = await priceDeal(ctx, p, { promo: Boolean(promo) });
  // The seller confirms the item's condition in a pop-up, seeing what a false description costs them.
  if (input.condition_confirmed !== true && input.condition_confirmed !== 'yes') {
    throw new UserError('Confirm that the item is in good condition, exactly as agreed with the buyer.');
  }

  const now = ctx.now();
  const token = randomToken(12);
  const statements = [];
  let replacesId = null;
  if (replaced) {
    replacesId = replaced.id;
    statements.push(stmt(ctx.env, "UPDATE deals SET status = 'replaced' WHERE id = ? AND status = 'open'", replaced.id));
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
      item_price: p.itemPrice,
      pickup_address: pickupAddress,
      pickup_zone: p.pickupState, // legacy column, kept filled
      pickup_state: p.pickupState,
      weight_kg: p.weightKg,
      fragile,
      delivery_address: deliveryAddress,
      delivery_landmark: deliveryLandmark || null,
      delivery_state: p.deliveryState,
      delivery_zone: p.deliveryState, // legacy column, kept filled
      delivery_fee: q.deliveryFee,
      delivery_payer: p.deliveryPayer,
      fee_payer: p.feePayer,
      platform_fee: q.platformFee,
      processing_fee: q.processingFee,
      buyer_total: q.buyerTotal,
      seller_payout: q.sellerPayout,
      delivery_days: deliveryDays,
      inspection_hours: ctx.config.inspectionHours,
      photo_count: photoCount,
      promo_code: promo,
      condition_confirmed_at: iso(now),
      condition_pledge: fillConsent('seller', q.deliveryFee),
      status: 'open',
      expires_at: iso(addHours(now, expiresHours)),
      created_at: iso(now),
    }),
    updateStmt(ctx.env, 'sellers', seller.id, { pickup_address: pickupAddress, pickup_state: p.pickupState }),
  );
  // Same batch as the deal, so a link never exists without its photos.
  const newDealId = '(SELECT id FROM deals WHERE token = ?)';
  photos.forEach((ph, i) => statements.push(stmt(ctx.env,
    `INSERT INTO deal_photos (deal_id, position, mime, data, sha256, bytes, created_at) VALUES (${newDealId}, ?, ?, ?, ?, ?, ?)`,
    token, i + 1, ph.mime, ph.data, ph.sha256, ph.bytes, iso(now))));
  if (copyPhotosFrom) {
    statements.push(stmt(ctx.env,
      `INSERT INTO deal_photos (deal_id, position, mime, data, sha256, bytes, created_at)
       SELECT ${newDealId}, position, mime, data, sha256, bytes, ? FROM deal_photos WHERE deal_id = ?`,
      token, iso(now), copyPhotosFrom.id));
  }
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

// The amounts saved with the link. Later fee or courier price changes never alter an existing link.
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

const photoRows = (ctx, deal) => all(ctx.env, 'SELECT position, sha256 FROM deal_photos WHERE deal_id = ? ORDER BY position', deal.id);

/** Addresses of the deal's photos, in order. */
export const dealPhotos = async (ctx, deal) => photoUrls(ctx, deal, await photoRows(ctx, deal));

/** Fingerprints of the deal's photos, saved in the terms the buyer accepts. */
export const dealPhotoHashes = async (ctx, deal) => (await photoRows(ctx, deal)).map((p) => p.sha256);

// What the buyer may see: the whole deal, including the delivery address the seller entered (so
// they can check it), but never the seller's pickup address or contact details.
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
    photos: await dealPhotos(ctx, deal),
    ships_from: deal.pickup_state,
    delivery: { address: deal.delivery_address, landmark: deal.delivery_landmark, state: deal.delivery_state },
    delivery_payer: deal.delivery_payer,
    delivery_days: deal.delivery_days,
    inspection_hours: deal.inspection_hours,
    expires_at: deal.expires_at,
    fee_payer: deal.fee_payer,
    promo_applied: Boolean(deal.promo_code),
    price: {
      item: q.itemPrice,
      delivery: q.buyerDelivery,
      delivery_full: q.deliveryFee,
      platform_fee: q.buyerPlatformShare,
      platform_fee_full: q.platformFee,
      processing_fee: q.buyerProcessingShare,
      total: q.buyerTotal,
    },
  };
}

export { getDeal };
