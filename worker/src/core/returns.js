import { first, run, insert, update } from '../lib/db.js';
import { randomDigits, encrypt, decrypt, safeEqual, signLink } from '../lib/crypto.js';
import { UserError, iso, addHours, str, getSeller, getDeal, getOrder, logEvent, fmtDate, trackUrl, transition } from './common.js';
import { settleAfterReturn, checkedEvidence, evidencePhotoStmt } from './orders.js';
import { parsePhotos } from '../lib/photos.js';

// Returns to the seller: delivery in reverse. The seller gets a 4-digit return PIN (SMS and their
// order page) and gives it to the rider only after checking the item. A buyer's refund that depends
// on a return is paid only once the return is received.
//   'door':   the buyer refused the item at the door; the same rider takes it straight back.
//   'pickup': a problem found after delivery; a new courier order collects it from the buyer.

export const RETURN_LABELS = {
  with_rider: 'Rider is taking it back to the seller',
  booked: 'Return booked: a rider will collect it from the buyer',
  picked_up: 'Collected from the buyer',
  out_for_delivery: 'On the way back to the seller',
  attempt_failed: 'Collection attempt failed',
  received: 'Seller has the item back',
  cancelled: 'Return cancelled',
};
const OPEN = ['with_rider', 'booked', 'picked_up', 'out_for_delivery', 'attempt_failed'];
// Updates the rider (or courier) can make on a pickup return, and where each may come from.
const RETURN_STEPS = {
  picked_up: ['booked', 'attempt_failed'],
  out_for_delivery: ['booked', 'picked_up', 'attempt_failed'],
  attempt_failed: ['booked', 'picked_up', 'out_for_delivery'],
};

export const activeReturn = (ctx, orderId) =>
  first(ctx.env, "SELECT * FROM returns WHERE order_id = ? AND status != 'cancelled' ORDER BY id DESC", orderId);
export const isOpenReturn = (ret) => Boolean(ret && OPEN.includes(ret.status));
export const revealReturnPin = (ctx, ret) => decrypt(ret.pin_enc, ctx.config.appSecret);

// What the seller, buyer and admin pages show about a return.
export async function returnView(ctx, ret, { withPin = false } = {}) {
  if (!ret) return null;
  return {
    id: ret.id,
    kind: ret.kind,
    status: ret.status,
    label: ret.problem_at ? 'Seller has it back but reported it isn’t what was delivered' : RETURN_LABELS[ret.status] || ret.status,
    problem: Boolean(ret.problem_at),
    problem_note: ret.problem_note || null,
    open: isOpenReturn(ret),
    deadline_at: ret.deadline_at,
    received_at: ret.received_at,
    received_by: ret.received_by,
    // After a problem report the seller still needs the PIN: a Fez rider can only close the job with it.
    ...(withPin && (isOpenReturn(ret) || ret.problem_at) ? { pin: await revealReturnPin(ctx, ret) } : {}),
  };
}

async function newPin(ctx) {
  const pin = randomDigits(4);
  return { pin, enc: await encrypt(pin, ctx.config.appSecret) };
}

const pinSms = (order, pin) =>
  `Your TrustGap return PIN for order ${order.ref} is ${pin}. Check the returned item first, then give the rider this PIN. If it isn't your item, don't accept it and contact TrustGap.`;

// Refused at the door: the rider already has the parcel. `received` is for a courier (Fez) that
// reports the parcel already back with the seller.
export async function startDoorReturn(ctx, order, { received = false, by = 'courier' } = {}) {
  if (await activeReturn(ctx, order.id)) return null;
  const { pin, enc } = await newPin(ctx);
  const now = iso(ctx.now());
  await insert(ctx.env, 'returns', {
    order_id: order.id,
    kind: 'door',
    status: received ? 'received' : 'with_rider',
    pin_enc: enc,
    courier: order.courier,
    delivery_ref: order.delivery_ref,
    received_at: received ? now : null,
    received_by: received ? by : null,
    created_at: now,
  });
  await logEvent(ctx, order.id, by, received ? 'return_received' : 'return_started', received ? 'returned by the courier' : 'refused at the door');
  if (received) {
    await update(ctx.env, 'orders', order.id, { delivery_status: 'returned' });
  } else {
    const seller = await getSeller(ctx, order.seller_id);
    await ctx.notify.send({ orderId: order.id, event: 'return_pin', phone: seller.phone, email: seller.email, sms: `TrustGap: the buyer refused order ${order.ref} at the door and the rider is bringing it back. ${pinSms(order, pin)}` });
  }
  return activeReturn(ctx, order.id);
}

// A problem found after delivery: book a courier to collect the item from the buyer and take it to
// the seller's pickup address. With Fez this is a new Fez order, carrying the seller's PIN.
// `parcelWithBuyer`: the parcel wasn't marked delivered but is with the buyer (they refused it at the
// door and the rider left it, or staff confirmed it). `by` is who started it, for the timeline.
export async function bookPickupReturn(ctx, order, { parcelWithBuyer = false, by = 'admin' } = {}) {
  if (await activeReturn(ctx, order.id)) throw new UserError('A return already exists for this order.');
  if (!order.delivered_at && !parcelWithBuyer) throw new UserError('The item never reached the buyer, so there is nothing to collect.');
  const deal = await getDeal(ctx, order.deal_id);
  const seller = await getSeller(ctx, order.seller_id);
  const { pin, enc } = await newPin(ctx);
  const deadline = addHours(ctx.now(), ctx.config.returnPickupDays * 24);
  const id = await insert(ctx.env, 'returns', {
    order_id: order.id, kind: 'pickup', status: 'booking', pin_enc: enc, courier: ctx.logistics.name, deadline_at: iso(deadline), created_at: iso(ctx.now()),
  });

  let booking;
  try {
    const riderToken = await signLink(ctx.config.appSecret, `return-${id}`, addHours(ctx.now(), ctx.config.riderLinkDays * 24));
    booking = await ctx.logistics.bookReturn({ order, deal, seller, pin, ref: `${order.ref}-R`, riderToken });
  } catch (err) {
    await run(ctx.env, 'DELETE FROM returns WHERE id = ?', id);
    throw new UserError(`Could not book the return with the courier: ${err.message}`);
  }
  let cost = null;
  try {
    cost = (await ctx.logistics.quote({ pickupState: order.delivery_state, dropoffState: deal.pickup_state, weightKg: deal.weight_kg })).feeKobo;
  } catch {
    // The price is only for the records; the return goes ahead without it.
  }
  await update(ctx.env, 'returns', id, { status: 'booked', delivery_ref: booking.deliveryRef, rider_url: booking.riderUrl || null, cost });
  if (cost) {
    await insert(ctx.env, 'ledger', { order_id: order.id, kind: 'return_cost', amount: cost, counterparty: ctx.logistics.name, status: 'pending', created_at: iso(ctx.now()) });
  }
  await logEvent(ctx, order.id, by, 'return_booked', { delivery_ref: booking.deliveryRef });
  await ctx.notify.send({
    orderId: order.id,
    event: 'return_booked',
    phone: order.buyer_phone,
    email: order.buyer_email,
    sms: `TrustGap: a rider will collect "${deal.item_title}" from you to return it to the seller (order ${order.ref}). Please have it packed with everything that came with it by ${fmtDate(deadline)}. Your refund is sent once the seller receives it: ${trackUrl(ctx, order)}`,
  });
  await ctx.notify.send({ orderId: order.id, event: 'return_pin', phone: seller.phone, email: seller.email, sms: `TrustGap: the item from order ${order.ref} is being returned to you. ${pinSms(order, pin)}` });
  return first(ctx.env, 'SELECT * FROM returns WHERE id = ?', id);
}

// The seller has the item back. Pays out any decision that was waiting for the return.
export async function receiveReturn(ctx, ret, by) {
  const res = await run(
    ctx.env,
    `UPDATE returns SET status = 'received', received_at = ?, received_by = ? WHERE id = ? AND status IN (${OPEN.map(() => '?').join(', ')})`,
    iso(ctx.now()), by, ret.id, ...OPEN,
  );
  if (res.meta.changes !== 1) return false;
  await run(ctx.env, "UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'return_cost'", ret.order_id);
  if (ret.kind === 'door') await update(ctx.env, 'orders', ret.order_id, { delivery_status: 'returned' });
  await logEvent(ctx, ret.order_id, by, 'return_received');
  const order = await getOrder(ctx, ret.order_id);
  if (!(await settleAfterReturn(ctx, order))) {
    // No decision yet (e.g. refused at the door): staff decide next, knowing the seller has the item.
    await ctx.notify.send({ orderId: order.id, event: 'return_received', phone: order.buyer_phone, sms: `TrustGap: the seller has received the returned item for order ${order.ref}. We'll send our decision shortly.` });
  }
  return true;
}

export async function verifyReturnPin(ctx, ret, pin, actor) {
  if (!isOpenReturn(ret)) throw new UserError('This return is already closed.');
  if (ret.pin_attempts >= ctx.config.pinMaxAttempts) throw new UserError('Too many wrong PINs. Contact TrustGap support to continue.');
  if (!safeEqual(str(pin), await revealReturnPin(ctx, ret))) {
    await run(ctx.env, 'UPDATE returns SET pin_attempts = pin_attempts + 1 WHERE id = ?', ret.id);
    await logEvent(ctx, ret.order_id, actor, 'wrong_return_pin');
    throw new UserError(`Wrong PIN. ${ctx.config.pinMaxAttempts - ret.pin_attempts - 1} attempt(s) left.`);
  }
  if (!(await receiveReturn(ctx, ret, actor))) throw new UserError('This return was already updated.');
}

// Rider updates on a pickup return (manual courier).
export async function applyReturnUpdate(ctx, ret, { status, note, actor }) {
  const from = RETURN_STEPS[status];
  if (!from) throw new UserError('Unknown return update.');
  const reason = str(note).slice(0, 500);
  if (status === 'attempt_failed' && reason.length < 3) throw new UserError('Say what happened.');
  const res = await run(ctx.env, `UPDATE returns SET status = ? WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`, status, ret.id, ...from);
  if (res.meta.changes !== 1) throw new UserError(`Cannot mark "${RETURN_LABELS[status]}" while the return is "${RETURN_LABELS[ret.status] || ret.status}".`);
  await logEvent(ctx, ret.order_id, actor, 'return_' + status, reason || null);
  if (status === 'attempt_failed') {
    const order = await getOrder(ctx, ret.order_id);
    await ctx.notify.send({ orderId: order.id, event: 'return_attempt_failed', phone: order.buyer_phone, sms: `TrustGap: the rider could not collect the return for order ${order.ref} (${reason}). Your refund waits until the item is back with the seller.` });
  }
}

// Fez: read a pickup return's status (webhook hint or timer). Delivered = the seller gave the PIN.
const STAGE_TO_STATUS = { picked_up: 'picked_up', out_for_delivery: 'out_for_delivery' };
export async function syncReturnStatus(ctx, ret) {
  if (!isOpenReturn(ret) || ret.kind !== 'pickup' || !ret.delivery_ref || ret.courier !== ctx.logistics.name) return null;
  const st = await ctx.logistics.getStatus(ret.delivery_ref);
  if (!st) return null;
  if (st.raw && st.raw !== ret.courier_status) {
    await update(ctx.env, 'returns', ret.id, { courier_status: st.raw });
    await logEvent(ctx, ret.order_id, 'courier', 'return_courier_status', st.reason ? `${st.raw}: ${st.reason}` : st.raw);
  }
  if (st.stage === 'delivered') await receiveReturn(ctx, ret, 'courier');
  else if (STAGE_TO_STATUS[st.stage] && st.stage !== ret.status) await update(ctx.env, 'returns', ret.id, { status: STAGE_TO_STATUS[st.stage] });
  return st;
}

// Staff: the buyer never handed it over, or the seller says the returned item isn't theirs. The
// return is cancelled and the dispute goes back to staff to decide again.
export async function cancelReturn(ctx, ret, note) {
  if (!isOpenReturn(ret)) throw new UserError('Only an open return can be cancelled.');
  const reason = str(note);
  if (reason.length < 5) throw new UserError('Say why the return is cancelled.');
  await run(ctx.env, "UPDATE returns SET status = 'cancelled' WHERE id = ?", ret.id);
  await run(ctx.env, "UPDATE ledger SET status = 'cancelled' WHERE order_id = ? AND kind = 'return_cost' AND status = 'pending'", ret.order_id);
  await run(ctx.env, "UPDATE disputes SET status = 'open' WHERE order_id = ? AND status = 'awaiting_return'", ret.order_id);
  await logEvent(ctx, ret.order_id, 'admin', 'return_cancelled', reason);
  if (ret.kind === 'pickup' && ret.delivery_ref && ctx.logistics.cancel) {
    try {
      await ctx.logistics.cancel(ret.delivery_ref, reason);
    } catch (err) {
      console.error('courier cancel failed', ret.delivery_ref, err.message);
    }
  }
}

// The seller has the parcel in hand, but it isn't what was delivered (swapped, damaged, parts missing).
// They report it before giving the rider the PIN. The return is recorded as received (the item stays
// with the seller and the courier job can close), any decision waiting for the return is set aside,
// and a new dispute opens for review with the seller's photos. No refund goes out meanwhile.
export const MAX_RETURN_PROBLEM_PHOTOS = 3;
export async function reportReturnProblem(ctx, ret, input) {
  if (!isOpenReturn(ret)) throw new UserError('This return is already closed. Contact TrustGap support.');
  const description = str(input.description).slice(0, 2000);
  if (description.length < 10) throw new UserError('Describe what is wrong with the item that came back.');
  const order = await getOrder(ctx, ret.order_id);
  const photos = await checkedEvidence(ctx, order, await parsePhotos(input.photos, MAX_RETURN_PROBLEM_PHOTOS));
  if (!photos.length) throw new UserError('Add at least one photo showing what came back.');
  const now = iso(ctx.now());
  const before = await first(ctx.env, "SELECT * FROM disputes WHERE order_id = ? AND status IN ('open', 'awaiting_return') ORDER BY id DESC", order.id);
  const context = before?.status === 'awaiting_return'
    ? ` (Earlier decision, now set aside: refund ${(before.buyer_refund / 100).toLocaleString('en-NG')} naira.)`
    : '';
  const won = await transition(ctx, order.id, ['disputed'], { status: 'disputed' }, (h) => [
    h.sql(`UPDATE returns SET status = 'received', received_at = ?, received_by = 'seller', problem_at = ?, problem_note = ? WHERE id = ? AND status IN (${OPEN.map(() => '?').join(', ')})`,
      now, now, description, ret.id, ...OPEN),
    h.sql("UPDATE disputes SET status = 'superseded' WHERE order_id = ? AND status IN ('open', 'awaiting_return')", order.id),
    h.insert('disputes', { order_id: order.id, opened_by: 'seller', category: 'returned_item_problem', description: description + context, status: 'open', created_at: now }),
    ...photos.map((p, i) => evidencePhotoStmt(h, ctx, order.id, i + 1, p)),
    h.sql("UPDATE ledger SET status = 'success' WHERE order_id = ? AND kind = 'return_cost'", order.id),
    ...(ret.kind === 'door' ? [h.sql("UPDATE orders SET delivery_status = 'returned' WHERE id = ?", order.id)] : []),
    h.event('seller', 'return_received_with_problem', { description, photos: photos.length }),
  ]);
  if (!won) throw new UserError('This order changed while you were reporting. Refresh and try again.', 409);
  const seller = await getSeller(ctx, order.seller_id);
  await ctx.notify.send({ orderId: order.id, event: 'return_problem', phone: order.buyer_phone, email: order.buyer_email,
    sms: `TrustGap: the seller says the item returned for order ${order.ref} isn't what was delivered. Any refund is on hold while TrustGap reviews. Send any photos or video you have of the item before you handed it over: ${trackUrl(ctx, order)}` });
  await ctx.notify.send({ orderId: order.id, event: 'return_problem', phone: seller.phone,
    sms: `TrustGap: we've recorded the item for order ${order.ref} as back with you, with your report. You can now give the rider your return PIN so they can leave. TrustGap will review and decide.` });
}
