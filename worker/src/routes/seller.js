import { first, all, update } from '../lib/db.js';
import { UserError, notFound } from '../lib/http.js';
import { getSeller, payUrl, HELD_STATUSES, iso } from '../core/common.js';
import { signup, requestLogin, verifyCode, authenticate, logout, sellerView, setPayoutAccount, verifyIdentity } from '../core/sellers.js';
import { createDeal, previewDeal, cancelDeal, refreshDeal, priceBreakdown, dealPhotos } from '../core/deals.js';
import { bookPickup, DELIVERY_LABELS } from '../core/orders.js';
import { activeReturn, isOpenReturn, returnView, receiveReturn } from '../core/returns.js';
import { startDebtPayment } from '../core/debts.js';

export async function requireSeller(ctx, request) {
  const session = await authenticate(ctx, request);
  if (!session?.seller_id) throw new UserError('Please log in.', 401);
  const seller = await getSeller(ctx, session.seller_id);
  if (!seller) throw new UserError('Please log in.', 401);
  return { session, seller };
}

const dealView = (ctx, d) => ({
  id: d.id,
  status: d.status,
  link: payUrl(ctx, d),
  item_title: d.item_title,
  item_description: d.item_description,
  item_condition: d.item_condition,
  quantity: d.quantity,
  pickup_address: d.pickup_address,
  pickup_state: d.pickup_state,
  delivery_address: d.delivery_address,
  delivery_landmark: d.delivery_landmark,
  delivery_state: d.delivery_state,
  weight_kg: d.weight_kg,
  fragile: Boolean(d.fragile),
  delivery_payer: d.delivery_payer,
  fee_payer: d.fee_payer,
  delivery_days: d.delivery_days,
  expires_at: d.expires_at,
  created_at: d.created_at,
  price: priceBreakdown(d),
  promo_code: d.promo_code || null,
});

export function sellerRoutes(r) {
  r.post('/api/auth/signup', ({ ctx, body }) => signup(ctx, body));
  r.post('/api/auth/login', ({ ctx, body }) => requestLogin(ctx, body));
  r.post('/api/auth/verify', ({ ctx, body }) => verifyCode(ctx, body));
  r.post('/api/auth/logout', async ({ ctx, request }) => {
    await logout(ctx, await authenticate(ctx, request));
    return { ok: true };
  });

  r.get('/api/seller/me', async ({ ctx, request }) => ({ seller: sellerView((await requireSeller(ctx, request)).seller) }));

  r.post('/api/seller/payout', async ({ ctx, request, body }) => ({
    seller: await setPayoutAccount(ctx, (await requireSeller(ctx, request)).seller, body),
  }));

  r.post('/api/seller/identity', async ({ ctx, request, body }) => ({
    seller: await verifyIdentity(ctx, (await requireSeller(ctx, request)).seller, body),
  }));

  r.get('/api/seller/dashboard', async ({ ctx, request }) => {
    const { seller } = await requireSeller(ctx, request);
    const orders = await all(
      ctx.env,
      `SELECT o.id, o.ref, o.status, o.buyer_name, o.paid_at, o.amount, o.seller_payout, d.item_title
       FROM orders o JOIN deals d ON d.id = o.deal_id
       WHERE o.seller_id = ? AND o.status NOT IN ('awaiting_payment', 'cancelled', 'duplicate_refunded')
       ORDER BY o.id DESC LIMIT 50`,
      seller.id,
    );
    const deals = [];
    for (const d of await all(ctx.env, "SELECT * FROM deals WHERE seller_id = ? AND status IN ('open','expired') ORDER BY id DESC LIMIT 20", seller.id)) {
      deals.push(dealView(ctx, await refreshDeal(ctx, d)));
    }
    return {
      seller: sellerView(seller),
      stats: {
        to_ship: orders.filter((o) => o.status === 'paid').length,
        held: orders.filter((o) => HELD_STATUSES.includes(o.status)).reduce((a, o) => a + o.seller_payout, 0),
        completed: orders.filter((o) => o.status === 'completed').length,
      },
      orders,
      deals,
    };
  });

  // "Calculate price": the exact delivery fee, fees, buyer total and payout, before creating the link.
  // Pay what's owed from a past dispute now, on the payment page (instead of waiting for a payout).
  r.post('/api/seller/debt/pay', async ({ ctx, request }) => startDebtPayment(ctx, (await requireSeller(ctx, request)).seller));

  // TrustGap news and offers by SMS, WhatsApp or email: on or off.
  r.post('/api/seller/marketing', async ({ ctx, request, body }) => {
    const { seller } = await requireSeller(ctx, request);
    await update(ctx.env, 'sellers', seller.id, { marketing_opt_in_at: body.opt_in === true ? iso(ctx.now()) : null });
    return { marketing_opt_in: body.opt_in === true };
  });

  r.post('/api/seller/quote', async ({ ctx, request, body }) => {
    return previewDeal(ctx, body, (await requireSeller(ctx, request)).seller);
  });

  r.post('/api/seller/deals', async ({ ctx, request, body }) => {
    const deal = await createDeal(ctx, (await requireSeller(ctx, request)).seller, body);
    return { deal: { ...dealView(ctx, deal), photos: await dealPhotos(ctx, deal) } };
  });

  r.get('/api/seller/deals/:id', async ({ ctx, request, params }) => {
    const { seller } = await requireSeller(ctx, request);
    const d = await first(ctx.env, 'SELECT * FROM deals WHERE id = ? AND seller_id = ?', Number(params.id), seller.id);
    if (!d) throw notFound('Link not found.');
    const order = await first(ctx.env, "SELECT id FROM orders WHERE deal_id = ? AND status NOT IN ('awaiting_payment','cancelled','duplicate_refunded')", d.id);
    return { deal: { ...dealView(ctx, await refreshDeal(ctx, d)), photos: await dealPhotos(ctx, d) }, order_id: order?.id || null };
  });

  r.post('/api/seller/deals/:id/cancel', async ({ ctx, request, params }) => {
    await cancelDeal(ctx, (await requireSeller(ctx, request)).seller, Number(params.id));
    return { ok: true };
  });

  r.get('/api/seller/orders/:id', async ({ ctx, request, params }) => {
    const { seller } = await requireSeller(ctx, request);
    const o = await first(ctx.env, 'SELECT * FROM orders WHERE id = ? AND seller_id = ?', Number(params.id), seller.id);
    if (!o) throw notFound('Order not found.');
    const d = await first(ctx.env, 'SELECT * FROM deals WHERE id = ?', o.deal_id);
    const dispute = await first(ctx.env, 'SELECT status, category, description, resolution_note, seller_payout FROM disputes WHERE order_id = ? ORDER BY id DESC', o.id);
    // The seller sees the buyer's name and area, never their refund account or full address.
    return {
      order: {
        id: o.id,
        ref: o.ref,
        status: o.status,
        item_title: d.item_title,
        photos: await dealPhotos(ctx, d),
        seller_payout: o.seller_payout,
        delivery_fee: o.delivery_fee,
        delivery_payer: d.delivery_payer,
        courier_status: o.courier_status,
        buyer_name: o.buyer_name,
        delivery_state: o.delivery_state,
        delivery_status: o.delivery_status,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        packing_note: o.packing_note,
        ship_by: o.ship_by,
        delivered_at: o.delivered_at,
        inspection_ends_at: o.inspection_ends_at,
      },
      dispute,
      // Includes the return PIN while the item is on its way back, to give the rider at hand-back.
      return: await returnView(ctx, await activeReturn(ctx, o.id), { withPin: true }),
      events: await all(ctx.env, 'SELECT type, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id', o.id),
    };
  });

  // The seller confirms they have the item back without the rider entering the PIN.
  r.post('/api/seller/orders/:id/return-received', async ({ ctx, request, params }) => {
    const { seller } = await requireSeller(ctx, request);
    const o = await first(ctx.env, 'SELECT id FROM orders WHERE id = ? AND seller_id = ?', Number(params.id), seller.id);
    if (!o) throw notFound('Order not found.');
    const ret = await activeReturn(ctx, o.id);
    if (!isOpenReturn(ret)) throw new UserError('There is no return waiting on this order.');
    await receiveReturn(ctx, ret, 'seller');
    return { ok: true };
  });

  r.post('/api/seller/orders/:id/book', async ({ ctx, request, params, body }) => {
    await bookPickup(ctx, (await requireSeller(ctx, request)).seller, Number(params.id), body.packing_note);
    return { ok: true };
  });
}
