import { first, all, run, insert, update, stmt } from '../lib/db.js';
import { randomToken, humanRef, randomDigits, encrypt, decrypt, safeEqual, signLink } from '../lib/crypto.js';
import { nairaToKobo, formatNaira, buyerPart } from '../lib/money.js';
import { namesMatch } from '../lib/names.js';
import { snapshotTerms } from '../lib/terms.js';
import { refreshDeal, dealPhotoHashes } from './deals.js';
import { checkPromo, buyerUsedPromo } from './promo.js';
import { parsePhotos, EVIDENCE_LINK_HOURS } from '../lib/photos.js';
import { activeReturn, isOpenReturn, startDoorReturn, receiveReturn, bookPickupReturn } from './returns.js';
import {
  UserError,
  DISPUTE_CATEGORIES,
  HELD_STATUSES,
  iso,
  addHours,
  str,
  requireLength,
  normalisePhone,
  validEmail,
  getSeller,
  getDeal,
  getOrder,
  trackUrl,
  logEvent,
  ledgerRow,
  settlesAt,
  transition,
  fmtDate,
} from './common.js';

// ---------------------------------------------------------------- buyer checkout

export async function startCheckout(ctx, deal, promoInput, { acknowledged = false, termsAccepted = false } = {}) {
  deal = await refreshDeal(ctx, deal);
  if (deal.status !== 'open') throw new UserError('This link is no longer available.', 410);
  const promo = await buyerPromo(ctx, deal, promoInput);
  const ackAt = acknowledged ? iso(ctx.now()) : null;
  const tosAt = termsAccepted ? iso(ctx.now()) : null;
  const { json, hash } = await snapshotTerms(deal, await getSeller(ctx, deal.seller_id), await dealPhotoHashes(ctx, deal), promo, ackAt, tosAt);
  const id = randomToken(15);
  await insert(ctx.env, 'checkouts', { id, deal_id: deal.id, terms_json: json, terms_hash: hash, created_at: iso(ctx.now()) });
  return { checkout_id: id, terms_hash: hash, total: JSON.parse(json).money.buyer_total, promo };
}

// A buyer's early-access code removes their share of the TrustGap fee on this deal.
async function buyerPromo(ctx, deal, input) {
  const code = await checkPromo(ctx, input);
  if (!code) return null;
  if (deal.promo_code) throw new UserError('This link already has no TrustGap fee. Keep your code for another deal.');
  const discount = buyerPart(deal.fee_payer, deal.platform_fee);
  if (!discount) throw new UserError('The seller pays the TrustGap fee on this deal, so your code has nothing to remove. Keep it for another deal.');
  return { code, discount };
}

async function getCheckout(ctx, deal, checkoutId) {
  const c = await first(ctx.env, 'SELECT * FROM checkouts WHERE id = ? AND deal_id = ?', str(checkoutId), deal.id);
  if (!c || new Date(c.created_at) < addHours(ctx.now(), -2)) {
    throw new UserError('Your review session expired. Go back to step 1 and confirm the deal again.', 409);
  }
  return c;
}

export async function placeOrder(ctx, { deal, input }) {
  const checkout = await getCheckout(ctx, deal, input.checkout_id);
  const buyerName = requireLength(input.buyer_name, 'Full name', 3, 100);
  if (buyerName.split(/\s+/).length < 2) throw new UserError('Enter your full name (first and last name).');
  const buyerPhone = normalisePhone(input.buyer_phone);
  const buyerEmail = validEmail(input.buyer_email);
  const bankCode = str(input.refund_bank_code);
  const accountNumber = str(input.refund_account_number);
  if (!/^\d{10}$/.test(accountNumber)) throw new UserError('Refund account number must be 10 digits.');
  const bank = (await ctx.payments.listBanks()).find((b) => b.code === bankCode);
  if (!bank) throw new UserError('Choose the bank for refunds.');

  let accountName;
  try {
    ({ accountName } = await ctx.payments.resolveAccount({ bankCode, accountNumber }));
  } catch (err) {
    throw new UserError(err.locked ? err.message : `Refund account: ${err.message}`, err.locked ? 503 : 400);
  }
  if (!namesMatch(buyerName, accountName)) {
    throw new UserError(
      `The refund account belongs to "${accountName}". Refunds can only go to an account in your own name. Use your own account, or enter your name exactly as your bank has it.`,
    );
  }

  // The address and every amount come from the link the buyer confirmed in step 1, never from
  // this request. A mismatch means the page is out of date.
  const terms = JSON.parse(checkout.terms_json);
  if (!terms.buyer_acknowledgement) {
    throw new UserError('Go back to step 1 and confirm you’ve read what happens if you change your mind.', 409);
  }
  if (!terms.terms_of_service) {
    throw new UserError('Go back to step 1 and tick the box to accept the TrustGap Terms of Service.', 409);
  }
  const money = terms.money;
  const discount = money.promo_discount || 0;
  const total = deal.buyer_total - discount;
  if (input.expected_total !== undefined && Number(input.expected_total) !== total) {
    throw new UserError(`This deal now costs ${formatNaira(total)}. Please go back to step 1 and check it again.`, 409);
  }
  const promoCode = discount ? await checkPromo(ctx, money.promo_code) : deal.promo_code || null;
  if (discount && (await buyerUsedPromo(ctx, buyerPhone, promoCode))) {
    throw new UserError('This phone number has already used the early-access code. Go back to step 1 and remove it to continue.', 409);
  }

  const fresh = await refreshDeal(ctx, await getDeal(ctx, deal.id));
  if (fresh.status !== 'open') throw new UserError('This link is no longer available.', 410);
  const id = await insert(ctx.env, 'orders', {
    ref: humanRef('TG'),
    deal_id: deal.id,
    seller_id: deal.seller_id,
    buyer_token: randomToken(18),
    buyer_name: buyerName,
    buyer_phone: buyerPhone,
    buyer_email: buyerEmail,
    delivery_address: deal.delivery_address,
    delivery_landmark: deal.delivery_landmark,
    delivery_state: deal.delivery_state,
    delivery_fee: deal.delivery_fee,
    platform_fee: deal.platform_fee - discount,
    processing_fee: deal.processing_fee,
    seller_payout: deal.seller_payout,
    promo_code: promoCode,
    promo_discount: discount,
    buyer_ack_at: terms.buyer_acknowledgement.at,
    buyer_terms_accepted_at: terms.terms_of_service.at,
    buyer_marketing_opt_in_at: input.marketing_opt_in === true || input.marketing_opt_in === 'yes' ? iso(ctx.now()) : null,
    refund_bank_code: bankCode,
    refund_bank_name: bank.name,
    refund_account_enc: await encrypt(accountNumber, ctx.config.appSecret),
    refund_account_last4: accountNumber.slice(-4),
    refund_account_name: accountName,
    terms_json: checkout.terms_json,
    terms_hash: checkout.terms_hash,
    terms_accepted_at: checkout.created_at,
    amount: total,
    status: 'awaiting_payment',
    tx_ref: 'TGTX-' + randomToken(12),
    created_at: iso(ctx.now()),
  });
  await logEvent(ctx, id, 'buyer', 'terms_accepted', { terms_hash: checkout.terms_hash });
  const order = await getOrder(ctx, id);
  const { url } = await ctx.payments.createCheckout({ order, title: deal.item_title });
  return { order, payment_url: url };
}

export async function retryPayment(ctx, order) {
  const deal = await refreshDeal(ctx, await getDeal(ctx, order.deal_id));
  if (!['awaiting_payment', 'cancelled'].includes(order.status) || deal.status !== 'open') {
    throw new UserError('This order can no longer be paid. Ask the seller for a new link.', 410);
  }
  // A fresh reference per attempt; providers may reject a reused one.
  await update(ctx.env, 'orders', order.id, { tx_ref: 'TGTX-' + randomToken(12), status: 'awaiting_payment', closed_at: null });
  const fresh = await getOrder(ctx, order.id);
  const { url } = await ctx.payments.createCheckout({ order: fresh, title: deal.item_title });
  return { payment_url: url };
}

// Idempotent and race-safe. Called from the payment redirect, the webhook and the timers.
export async function confirmPayment(ctx, txRef, actor = 'system') {
  const order = await first(ctx.env, 'SELECT * FROM orders WHERE tx_ref = ?', str(txRef));
  if (!order) return null;
  if (!['awaiting_payment', 'cancelled'].includes(order.status)) return order;

  const v = await ctx.payments.verify(order.tx_ref);
  if (v.status !== 'successful') {
    if (v.status === 'failed' && order.status === 'awaiting_payment') await logEvent(ctx, order.id, actor, 'payment_failed');
    return getOrder(ctx, order.id);
  }
  if (v.currency !== 'NGN' || v.amount < order.amount) {
    await logEvent(ctx, order.id, actor, 'payment_mismatch', { expected: order.amount, got: v.amount, currency: v.currency });
    return getOrder(ctx, order.id);
  }

  const deal = await getDeal(ctx, order.deal_id);
  const now = ctx.now();
  const alreadyPaid = await first(
    ctx.env,
    `SELECT id FROM orders WHERE deal_id = ? AND id != ? AND status IN ('paid','shipping','delivered','disputed','completed','refunded')`,
    deal.id,
    order.id,
  );
  if (alreadyPaid) return refundDuplicate(ctx, order, v, actor);

  const pin = randomDigits(4);
  const shipBy = addHours(now, deal.delivery_days * 24);
  let won;
  try {
    won = await transition(
      ctx,
      order.id,
      ['awaiting_payment', 'cancelled'],
      {
        status: 'paid',
        provider_tx_id: v.providerTxId,
        paid_at: iso(now),
        closed_at: null,
        delivery_pin_enc: await encrypt(pin, ctx.config.appSecret),
        ship_by: iso(shipBy),
      },
      (h) => [
        h.sql("UPDATE deals SET status = 'paid' WHERE id = ?", deal.id),
        h.insert('ledger', ledgerRow(ctx, order.id, 'collected', v.amount, 'buyer', 'success')),
        h.event(actor, 'payment_received', { amount: v.amount }),
      ],
    );
  } catch (err) {
    // Another order for this deal was marked paid in the same instant (unique index).
    if (/UNIQUE/i.test(String(err.message))) return refundDuplicate(ctx, order, v, actor);
    throw err;
  }
  if (!won) return getOrder(ctx, order.id);

  const seller = await getSeller(ctx, deal.seller_id);
  await ctx.notify.send({
    orderId: order.id,
    event: 'payment_received_seller',
    phone: seller.phone,
    email: seller.email,
    sms: `TrustGap: ${formatNaira(order.amount)} for "${deal.item_title}" is secured (order ${order.ref}). Pack the item and book pickup in your dashboard before ${fmtDate(shipBy)}.`,
    emailSubject: `Payment secured: order ${order.ref}`,
  });
  await ctx.notify.send({
    orderId: order.id,
    event: 'payment_received_buyer',
    phone: order.buyer_phone,
    email: order.buyer_email,
    sms: `TrustGap: payment received for "${deal.item_title}" (order ${order.ref}). Your money is held until delivery. Your delivery PIN is ${pin}. Give it to the rider ONLY after checking the item. Track: ${trackUrl(ctx, order)}`,
    emailSubject: `Your TrustGap order ${order.ref}`,
  });
  return getOrder(ctx, order.id);
}

async function refundDuplicate(ctx, order, v, actor) {
  const now = ctx.now();
  const settles = iso(settlesAt(ctx, now));
  const won = await transition(
    ctx,
    order.id,
    ['awaiting_payment', 'cancelled'],
    { status: 'duplicate_refunded', provider_tx_id: v.providerTxId, paid_at: iso(now), closed_at: iso(now) },
    (h) => [
      h.insert('ledger', ledgerRow(ctx, order.id, 'collected', v.amount, 'buyer', 'success')),
      h.insert('ledger', ledgerRow(ctx, order.id, 'buyer_refund', v.amount, 'buyer', 'pending', settles)),
      h.event(actor, 'duplicate_payment_refunded'),
    ],
  );
  if (won) {
    await sendPendingTransfers(ctx, order.id);
    await ctx.notify.send({
      orderId: order.id,
      event: 'duplicate_refund',
      phone: order.buyer_phone,
      email: order.buyer_email,
      sms: `TrustGap: this deal had already been paid for, so your payment of ${formatNaira(v.amount)} is being refunded in full to your ${order.refund_bank_name} account ending ${order.refund_account_last4}.`,
    });
  }
  return getOrder(ctx, order.id);
}

export async function revealPin(ctx, order) {
  return order.delivery_pin_enc ? decrypt(order.delivery_pin_enc, ctx.config.appSecret) : null;
}

// ---------------------------------------------------------------- delivery

export async function bookPickup(ctx, seller, orderId, packingNote) {
  const order = await first(ctx.env, 'SELECT * FROM orders WHERE id = ? AND seller_id = ?', orderId, seller.id);
  if (!order) throw new UserError('Order not found.', 404);
  const note = str(packingNote).slice(0, 500);
  if (note.length < 5) {
    throw new UserError('Add a short packing note (serial number, colour, what is in the box). It is your evidence if there is a dispute.');
  }
  const deal = await getDeal(ctx, order.deal_id);
  // Claim the order first so a double-click can't book two couriers.
  const won = await transition(ctx, order.id, ['paid'], {
    status: 'shipping',
    delivery_status: 'booking',
    packing_note: note,
    dispatched_at: iso(ctx.now()),
  });
  if (!won) throw new UserError('Pickup can only be booked for a paid order that has not shipped.');
  let booking;
  try {
    booking = await ctx.logistics.book({ order: { ...order, packing_note: note }, deal, seller, pin: await revealPin(ctx, order) });
  } catch (err) {
    await update(ctx.env, 'orders', order.id, { status: 'paid', delivery_status: 'not_booked', dispatched_at: null });
    throw new UserError(`Could not book the courier: ${err.message}`);
  }
  await ctx.env.DB.batch([
    stmt(ctx.env, "UPDATE orders SET delivery_status = 'booked', delivery_ref = ?, rider_url = ?, courier = ? WHERE id = ?",
      booking.deliveryRef, booking.riderUrl || null, ctx.logistics.name, order.id),
    stmt(ctx.env, 'INSERT INTO ledger (order_id, kind, amount, counterparty, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      order.id, 'delivery_cost', order.delivery_fee, ctx.logistics.name, 'pending', iso(ctx.now())),
  ]);
  await logEvent(ctx, order.id, 'seller', 'pickup_booked', { delivery_ref: booking.deliveryRef, packing_note: note });
  await ctx.notify.send({
    orderId: order.id,
    event: 'pickup_booked',
    phone: order.buyer_phone,
    sms: `TrustGap: the seller has packed "${deal.item_title}" and pickup is booked (order ${order.ref}). Track: ${trackUrl(ctx, order)}`,
  });
  return booking;
}

const DELIVERY_STEPS = {
  picked_up: { from: ['booked'], label: 'Picked up from seller' },
  out_for_delivery: { from: ['booked', 'picked_up', 'attempt_failed'], label: 'Out for delivery' },
  attempt_failed: { from: ['picked_up', 'out_for_delivery'], label: 'Delivery attempt failed' },
  refused: { from: ['picked_up', 'out_for_delivery', 'attempt_failed'], label: 'Refused by buyer at the door' },
  returned: { from: ['refused'], label: 'Returned to seller' },
};
export const DELIVERY_LABELS = {
  not_booked: 'Not booked',
  booking: 'Booking courier',
  booked: 'Pickup booked',
  delivered: 'Delivered',
  ...Object.fromEntries(Object.entries(DELIVERY_STEPS).map(([k, v]) => [k, v.label])),
};

export async function applyDeliveryUpdate(ctx, order, { status, note, actor }) {
  const step = DELIVERY_STEPS[status];
  if (!step) throw new UserError('Unknown delivery update.');
  if (status === 'returned') throw new UserError('Enter the seller’s return PIN to confirm you handed the item back.');
  const reason = str(note).slice(0, 500);
  if (['attempt_failed', 'refused'].includes(status) && reason.length < 3) throw new UserError('Say what happened.');
  const res = await stmt(
    ctx.env,
    `UPDATE orders SET delivery_status = ? WHERE id = ? AND delivery_status IN (${step.from.map(() => '?').join(', ')})`,
    status,
    order.id,
    ...step.from,
  ).run();
  if (res.meta.changes !== 1) {
    throw new UserError(`Cannot mark "${step.label}" while the parcel is "${DELIVERY_LABELS[order.delivery_status] || order.delivery_status}".`);
  }
  await logEvent(ctx, order.id, actor, 'delivery_' + status, reason || null);
  if (status === 'refused') {
    await openDispute(ctx, await getOrder(ctx, order.id), { by: actor, category: 'refused_at_door', description: reason });
    await startDoorReturn(ctx, await getOrder(ctx, order.id), { by: actor });
  } else if (status === 'out_for_delivery' || status === 'attempt_failed') {
    await ctx.notify.send({
      orderId: order.id,
      event: 'delivery_' + status,
      phone: order.buyer_phone,
      sms:
        status === 'out_for_delivery'
          ? `TrustGap: order ${order.ref} is out for delivery. Check the item before you give the rider your PIN.`
          : `TrustGap: the rider could not deliver order ${order.ref} (${reason}). They will try again.`,
    });
  }
}

export async function verifyDeliveryPin(ctx, order, pin, actor) {
  if (order.status !== 'shipping') throw new UserError('This order is not out for delivery.');
  if (order.pin_attempts >= ctx.config.pinMaxAttempts) throw new UserError('Too many wrong PINs. Contact TrustGap support to continue.');
  if (!safeEqual(str(pin), await revealPin(ctx, order))) {
    await run(ctx.env, 'UPDATE orders SET pin_attempts = pin_attempts + 1 WHERE id = ?', order.id);
    await logEvent(ctx, order.id, actor, 'wrong_pin');
    throw new UserError(`Wrong PIN. ${ctx.config.pinMaxAttempts - order.pin_attempts - 1} attempt(s) left.`);
  }
  if (!(await markDelivered(ctx, order, actor, 'delivered_with_pin'))) throw new UserError('This order was already updated.');
}

// Delivery confirmed (by the rider entering the PIN, or by the courier's own status): starts the
// buyer's inspection window. Returns false if the order had already moved on.
export async function markDelivered(ctx, order, actor, eventType) {
  const deal = await getDeal(ctx, order.deal_id);
  const now = ctx.now();
  const ends = addHours(now, deal.inspection_hours);
  const won = await transition(
    ctx,
    order.id,
    ['shipping'],
    { status: 'delivered', delivery_status: 'delivered', delivered_at: iso(now), inspection_ends_at: iso(ends) },
    (h) => [
      h.sql("UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'delivery_cost'", order.id),
      h.event(actor, eventType),
    ],
  );
  if (!won) return false;
  const seller = await getSeller(ctx, order.seller_id);
  await ctx.notify.send({
    orderId: order.id,
    event: 'delivered_buyer',
    phone: order.buyer_phone,
    sms: `TrustGap: order ${order.ref} delivered. If something is wrong, report it before ${fmtDate(ends)}: ${trackUrl(ctx, order)}. Otherwise the seller is paid automatically.`,
  });
  await ctx.notify.send({
    orderId: order.id,
    event: 'delivered_seller',
    phone: seller.phone,
    sms: `TrustGap: order ${order.ref} was delivered. Your payout is released when the buyer confirms or at ${fmtDate(ends)}, unless they report a problem.`,
  });
  return true;
}

// ---------------------------------------------------------------- courier status (Fez)

const STAGE_RANK = { booked: 1, picked_up: 2, out_for_delivery: 3 };

// Reads the parcel's status from the courier and applies it. Called from the Fez webhook (which is
// only a hint) and by the timers, so a missed webhook is caught up within minutes.
export async function syncCourierStatus(ctx, order) {
  if (!order.delivery_ref || order.courier !== ctx.logistics.name) return null;
  const st = await ctx.logistics.getStatus(order.delivery_ref);
  if (!st) return null;
  if (st.raw && st.raw !== order.courier_status) {
    await update(ctx.env, 'orders', order.id, { courier_status: st.raw });
    await logEvent(ctx, order.id, 'courier', 'courier_status', st.reason ? `${st.raw}: ${st.reason}` : st.raw);
  }
  if (st.stage === 'delivered') {
    if (order.status === 'shipping') await markDelivered(ctx, order, 'courier', 'delivered_by_courier');
  } else if (STAGE_RANK[st.stage] && (STAGE_RANK[order.delivery_status] || 0) < STAGE_RANK[st.stage]) {
    await run(ctx.env, "UPDATE orders SET delivery_status = ? WHERE id = ? AND status = 'shipping'", st.stage, order.id);
    if (st.stage === 'out_for_delivery') {
      await ctx.notify.send({
        orderId: order.id,
        event: 'delivery_out_for_delivery',
        phone: order.buyer_phone,
        sms: `TrustGap: order ${order.ref} is out for delivery. Check the item before you give the rider your PIN.`,
      });
    }
  } else if (st.stage === 'returned' && order.delivery_status !== 'returned') {
    await update(ctx.env, 'orders', order.id, { delivery_status: 'returned' });
    if (order.status === 'shipping') {
      await openDispute(ctx, await getOrder(ctx, order.id), {
        by: 'courier',
        category: 'returned_by_courier',
        description: `The courier returned the parcel${st.reason ? `: ${st.reason}` : ''}.`,
      });
    }
    // Fez carries the parcel back on the original order, which holds the buyer's PIN, not the
    // seller's; Fez's "returned" is the record that the seller has it back.
    const ret = await activeReturn(ctx, order.id);
    if (!ret) await startDoorReturn(ctx, await getOrder(ctx, order.id), { received: true });
    else if (ret.kind === 'door') await receiveReturn(ctx, ret, 'courier');
  }
  return st;
}

// ---------------------------------------------------------------- disputes & money out

// Problems that are about the item itself: the buyer must show it in at least one photo.
export const PHOTO_REQUIRED = ['wrong_item', 'damaged', 'not_as_described', 'counterfeit'];
export const MAX_DISPUTE_PHOTOS = 2;

export async function openDispute(ctx, order, { by, category, description, photos: photoInput }) {
  if (!DISPUTE_CATEGORIES[category]) throw new UserError('Choose what went wrong.');
  const text = str(description).slice(0, 2000);
  if (text.length < 3) throw new UserError('Describe the problem.');
  const photos = await parsePhotos(photoInput, MAX_DISPUTE_PHOTOS);
  if (by === 'buyer' && PHOTO_REQUIRED.includes(category) && !photos.length) {
    throw new UserError('Add at least one photo showing the problem with the item.');
  }
  if (!['paid', 'shipping', 'delivered'].includes(order.status)) throw new UserError('A problem can no longer be reported on this order.');
  if (by === 'buyer' && order.status === 'delivered' && new Date(order.inspection_ends_at) <= ctx.now()) {
    throw new UserError('The inspection period has ended.');
  }
  const won = await transition(ctx, order.id, [order.status], { status: 'disputed' }, (h) => [
    h.insert('disputes', { order_id: order.id, opened_by: by, category, description: text, status: 'open', created_at: iso(ctx.now()) }),
    // Saved in the same step as the dispute, so a report never exists without its photos.
    ...photos.map((p, i) => h.sql(
      `INSERT INTO dispute_photos (dispute_id, position, mime, data, sha256, bytes, created_at)
       SELECT (SELECT MAX(id) FROM disputes WHERE order_id = ?), ?, ?, ?, ?, ?, ? WHERE 1`,
      order.id, i + 1, p.mime, p.data, p.sha256, p.bytes, iso(ctx.now()))),
    h.event(by, 'dispute_opened', { category, description: text, photos: photos.length }),
  ]);
  if (!won) throw new UserError('This order changed while you were reporting. Refresh and try again.', 409);
  const seller = await getSeller(ctx, order.seller_id);
  const sms = `TrustGap: a problem was reported on order ${order.ref} (${DISPUTE_CATEGORIES[category]}). The money stays held while we review. We may contact you for evidence.`;
  await ctx.notify.send({ orderId: order.id, event: 'dispute_opened', phone: order.buyer_phone, sms });
  await ctx.notify.send({ orderId: order.id, event: 'dispute_opened', phone: seller.phone, sms });
}

// Signed addresses of a dispute's photos, valid for a couple of hours (GET /api/evidence/:token).
export async function evidenceUrls(ctx, disputeId) {
  const rows = await all(ctx.env, 'SELECT id FROM dispute_photos WHERE dispute_id = ? ORDER BY position', disputeId);
  const until = addHours(ctx.now(), EVIDENCE_LINK_HOURS);
  return Promise.all(rows.map(async (r) => `${ctx.config.apiUrl}/api/evidence/${await signLink(ctx.config.appSecret, `dp${r.id}`, until)}`));
}

// Staff decide a dispute. Any refund for an item the buyer received (or refused at the door) needs
// the item back with the seller first, however cheap: the decision is saved, a return is booked if
// one isn't already under way, and the money waits until the seller has the item (settleAfterReturn).
// `by` is who decided: 'admin', or 'team:<name>' for a team member with a "Decide a dispute" task.
export async function resolveDispute(ctx, disputeId, input, { by = 'admin' } = {}) {
  const dispute = await first(ctx.env, 'SELECT * FROM disputes WHERE id = ?', disputeId);
  if (!dispute || dispute.status !== 'open') throw new UserError('Dispute not found or already resolved.');
  const order = await getOrder(ctx, dispute.order_id);
  const buyerRefund = nairaToKobo(input.buyer_refund ?? '0');
  const sellerPayout = nairaToKobo(input.seller_payout ?? '0');
  const sellerCharge = nairaToKobo(input.seller_charge ?? '0');
  if ([buyerRefund, sellerPayout, sellerCharge].includes(null)) throw new UserError('Amounts must be numbers.');
  if (buyerRefund + sellerPayout > order.amount) {
    throw new UserError(`Refund plus payout cannot exceed the ${formatNaira(order.amount)} collected.`);
  }
  const note = requireLength(input.note, 'Decision note', 10, 2000);
  const decision = { buyerRefund, sellerPayout, sellerCharge, note, by };

  let ret = await activeReturn(ctx, order.id);
  // When the item goes back to the seller (refused at the door, or any refund after delivery), the
  // sale didn't happen: the seller gets the item, never money as well.
  if (sellerPayout > 0 && (ret || (buyerRefund > 0 && order.delivered_at))) {
    throw new UserError(ret
      ? 'The item is back with the seller (or on its way), so the seller can’t also be paid. Refund the buyer, with or without the delivery deductions.'
      : 'A refund means the item goes back to the seller, so the seller can’t also be paid. Choose a refund or a payout, not both.');
  }
  if (buyerRefund > 0 && order.delivered_at && !ret) ret = await bookPickupReturn(ctx, order);
  if (isOpenReturn(ret) && buyerRefund > 0) {
    const res = await run(
      ctx.env,
      "UPDATE disputes SET status = 'awaiting_return', resolution_note = ?, buyer_refund = ?, seller_payout = ?, seller_charge = ?, decided_by = ? WHERE id = ? AND status = 'open'",
      note, buyerRefund, sellerPayout, sellerCharge, by, dispute.id,
    );
    if (res.meta.changes !== 1) throw new UserError('This dispute was already decided.');
    await logEvent(ctx, order.id, by, 'dispute_decided_after_return', { buyerRefund, sellerPayout, sellerCharge, note });
    const seller = await getSeller(ctx, order.seller_id);
    const sms = `TrustGap decision on ${order.ref}. ${decisionSummary(decision)} The refund is sent once the seller has the item back.`;
    await ctx.notify.send({ orderId: order.id, event: 'dispute_decided', phone: order.buyer_phone, email: order.buyer_email, sms });
    await ctx.notify.send({ orderId: order.id, event: 'dispute_decided', phone: seller.phone, email: seller.email, sms });
    return { waiting_for_return: true };
  }
  await settleDispute(ctx, order, dispute, decision);
  return { waiting_for_return: false };
}

// Called when a return is received: pays out a decision that was waiting for it. False if none was.
export async function settleAfterReturn(ctx, order) {
  const dispute = await first(ctx.env, "SELECT * FROM disputes WHERE order_id = ? AND status = 'awaiting_return' ORDER BY id DESC", order.id);
  if (!dispute) return false;
  await settleDispute(ctx, order, dispute, {
    buyerRefund: dispute.buyer_refund, sellerPayout: dispute.seller_payout, sellerCharge: dispute.seller_charge, note: dispute.resolution_note, by: dispute.decided_by || 'admin',
  });
  return true;
}

const decisionSummary = ({ buyerRefund, sellerPayout, sellerCharge, note }) =>
  `Refund to buyer: ${formatNaira(buyerRefund)}. Paid to seller: ${formatNaira(sellerPayout)}.${
    sellerCharge > 0 ? ` Charged to seller: ${formatNaira(sellerCharge)}.` : ''
  } Reason: ${note}`;

async function settleDispute(ctx, order, dispute, { buyerRefund, sellerPayout, sellerCharge, note, by = 'admin' }) {
  const now = iso(ctx.now());
  const retained = order.amount - buyerRefund - sellerPayout;
  const settles = iso(settlesAt(ctx, order.paid_at));

  const won = await transition(
    ctx,
    order.id,
    ['disputed'],
    { status: sellerPayout > 0 ? 'completed' : 'refunded', closed_at: now },
    (h) => [
      h.sql(
        "UPDATE disputes SET status = 'resolved', resolution_note = ?, buyer_refund = ?, seller_payout = ?, seller_charge = ?, resolved_at = ?, decided_by = ? WHERE id = ? AND status IN ('open', 'awaiting_return')",
        note, buyerRefund, sellerPayout, sellerCharge, now, by, dispute.id,
      ),
      h.sql('UPDATE sellers SET amount_owed = amount_owed + ? WHERE id = ?', sellerCharge, order.seller_id),
      h.sql("UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'delivery_cost'", order.id),
      ...(buyerRefund > 0 ? [h.insert('ledger', ledgerRow(ctx, order.id, 'buyer_refund', buyerRefund, 'buyer', 'pending', settles))] : []),
      ...(sellerPayout > 0 ? [h.insert('ledger', ledgerRow(ctx, order.id, 'seller_payout', sellerPayout, 'seller', 'pending', settles))] : []),
      ...(retained > 0 ? [h.insert('ledger', ledgerRow(ctx, order.id, 'platform_retained', retained, 'trustgap', 'success'))] : []),
      h.event(by, 'dispute_resolved', { buyerRefund, sellerPayout, sellerCharge, note }),
    ],
  );
  if (!won) throw new UserError('This order was already decided.');
  await sendPendingTransfers(ctx, order.id);

  const seller = await getSeller(ctx, order.seller_id);
  const summary = decisionSummary({ buyerRefund, sellerPayout, sellerCharge, note });
  await ctx.notify.send({ orderId: order.id, event: 'dispute_resolved', phone: order.buyer_phone, email: order.buyer_email, sms: `TrustGap decision on ${order.ref}. ${summary}` });
  await ctx.notify.send({ orderId: order.id, event: 'dispute_resolved', phone: seller.phone, email: seller.email, sms: `TrustGap decision on ${order.ref}. ${summary}` });
}

export async function releaseToSeller(ctx, order, reason) {
  if (order.status !== 'delivered') throw new UserError('Payment can only be released after delivery.');
  const seller = await getSeller(ctx, order.seller_id);
  const recovered = Math.min(seller.amount_owed, order.seller_payout);
  const payout = order.seller_payout - recovered;
  const settles = settlesAt(ctx, order.paid_at);
  const won = await transition(ctx, order.id, ['delivered'], { status: 'completed', closed_at: iso(ctx.now()) }, (h) => [
    ...(recovered > 0
      ? [
          h.sql('UPDATE sellers SET amount_owed = amount_owed - ? WHERE id = ?', recovered, seller.id),
          h.insert('ledger', ledgerRow(ctx, order.id, 'debt_recovered', recovered, 'seller', 'success')),
        ]
      : []),
    h.insert('ledger', ledgerRow(ctx, order.id, 'platform_fee', order.platform_fee, 'trustgap', 'success')),
    h.insert('ledger', ledgerRow(ctx, order.id, 'processing_fee', order.processing_fee, 'flutterwave', 'success')),
    ...(payout > 0 ? [h.insert('ledger', ledgerRow(ctx, order.id, 'seller_payout', payout, 'seller', 'pending', iso(settles)))] : []),
    h.event(reason === 'buyer_confirmed' ? 'buyer' : 'system', reason),
  ]);
  if (!won) return false;
  await sendPendingTransfers(ctx, order.id);
  await ctx.notify.send({
    orderId: order.id,
    event: 'payout_released',
    phone: seller.phone,
    email: seller.email,
    sms: `TrustGap: ${formatNaira(payout)} for order ${order.ref} has been released to your ${seller.payout_bank_name} account${
      settles > ctx.now() ? ` and will be sent on ${fmtDate(settles)}, once the buyer's payment has settled` : ''
    }.${recovered ? ` (${formatNaira(recovered)} was deducted for what you owed.)` : ''}`,
  });
  await ctx.notify.send({
    orderId: order.id,
    event: 'order_complete',
    phone: order.buyer_phone,
    sms: `TrustGap: order ${order.ref} is complete. Thank you for buying safely.`,
  });
  return true;
}

const TRANSFER_KINDS = "('seller_payout', 'buyer_refund')";

// Sends the order's payouts/refunds that are due now. Ones waiting for settlement go out later
// with the timers (core/jobs.js).
export async function sendPendingTransfers(ctx, orderId) {
  const rows = await all(
    ctx.env,
    `SELECT id FROM ledger WHERE order_id = ? AND status = 'pending' AND kind IN ${TRANSFER_KINDS} AND (not_before IS NULL OR not_before <= ?)`,
    orderId,
    iso(ctx.now()),
  );
  for (const r of rows) await sendTransfer(ctx, r.id);
}

// Sends one ledger row as a bank transfer, safely:
//  - The row is claimed first, so two workers never send it at once.
//  - Each attempt has a fixed reference (TGT-<row>-<attempt>), which Flutterwave uses to refuse
//    duplicates. If we don't know whether an attempt went through (timeout, network error), it is
//    retried with the SAME reference, so the seller can never be paid twice.
//  - Only a confirmed failure moves to a new attempt (new reference), up to maxTransferAttempts;
//    after that the row is flagged "needs_attention" for admin.
// Failures are recorded, never thrown, so a provider outage doesn't undo a decision.
export async function sendTransfer(ctx, ledgerId, { manual = false } = {}) {
  const from = manual ? "('pending', 'unknown', 'failed', 'needs_attention')" : "('pending', 'unknown', 'failed')";
  const claim = await run(
    ctx.env,
    `UPDATE ledger SET
       attempt = CASE WHEN status IN ('failed', 'needs_attention') THEN attempt + 1 ELSE attempt END,
       transfer_ref = 'TGT-' || id || '-' || CASE WHEN status IN ('failed', 'needs_attention') THEN attempt + 1 ELSE attempt END,
       status = 'sending'
     WHERE id = ? AND status IN ${from} AND kind IN ${TRANSFER_KINDS} AND (not_before IS NULL OR not_before <= ?)`,
    ledgerId,
    iso(ctx.now()),
  );
  const row = await first(ctx.env, 'SELECT * FROM ledger WHERE id = ?', ledgerId);
  if (claim.meta.changes !== 1) return row;
  const order = await getOrder(ctx, row.order_id);
  let dest;
  if (row.kind === 'seller_payout') {
    const s = await getSeller(ctx, order.seller_id);
    dest = { bankCode: s.payout_bank_code, accountNumber: s.payout_account_number, accountName: s.payout_account_name };
  } else {
    dest = {
      bankCode: order.refund_bank_code,
      accountNumber: await decrypt(order.refund_account_enc, ctx.config.appSecret),
      accountName: order.refund_account_name,
    };
  }
  try {
    const res = await ctx.payments.transfer({ ...dest, amount: row.amount, narration: `TrustGap ${order.ref}`, reference: row.transfer_ref });
    await update(ctx.env, 'ledger', row.id, {
      status: res.status === 'success' ? 'success' : 'submitted',
      provider_ref: res.providerRef || null,
      last_error: null,
    });
  } catch (err) {
    await recordTransferFailure(ctx, row, err);
  }
  return first(ctx.env, 'SELECT * FROM ledger WHERE id = ?', ledgerId);
}

async function recordTransferFailure(ctx, row, err) {
  const message = String(err.message).slice(0, 300);
  if (err.duplicate) {
    // Flutterwave already has this reference: the earlier attempt did go through. Wait for its result.
    await update(ctx.env, 'ledger', row.id, { status: 'submitted', last_error: null });
    return;
  }
  const status = !err.definite ? 'unknown' : row.attempt >= ctx.config.maxTransferAttempts ? 'needs_attention' : 'failed';
  await update(ctx.env, 'ledger', row.id, { status, last_error: message });
  await logEvent(ctx, row.order_id, 'system', status === 'needs_attention' ? 'transfer_needs_attention' : 'transfer_failed', {
    ledger_id: row.id,
    reference: row.transfer_ref,
    error: message,
  });
}

// Final result of a submitted transfer, from Flutterwave's webhook or the reconciliation timer.
// The status always comes from Flutterwave's API, never from the webhook body.
export async function settleTransfer(ctx, { reference, providerRef }) {
  const row = reference
    ? await first(ctx.env, 'SELECT * FROM ledger WHERE transfer_ref = ?', reference)
    : await first(ctx.env, 'SELECT * FROM ledger WHERE provider_ref = ?', providerRef);
  if (!row || !['submitted', 'unknown'].includes(row.status)) return row;
  const result = await ctx.payments.verifyTransfer({ providerRef: providerRef || row.provider_ref, reference: row.transfer_ref });
  if (result.status === 'success') {
    await update(ctx.env, 'ledger', row.id, { status: 'success', provider_ref: result.providerRef || row.provider_ref, last_error: null });
  } else if (result.status === 'failed') {
    const err = Object.assign(new Error(result.reason || 'Transfer failed at the bank'), { definite: true });
    await recordTransferFailure(ctx, row, err);
  }
  return first(ctx.env, 'SELECT * FROM ledger WHERE id = ?', row.id);
}

export { HELD_STATUSES };
