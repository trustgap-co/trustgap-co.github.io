import { first, all } from '../lib/db.js';
import { ensureSchema } from '../lib/migrate.js';
import { redirect, html, UserError, notFound } from '../lib/http.js';
import { formatNaira, buyerPart } from '../lib/money.js';
import { STATES } from '../lib/states.js';
import { verifyLink } from '../lib/crypto.js';
import { CONSENTS } from '../lib/terms.js';
import { createContext } from '../context.js';
import { isDebtRef, confirmDebtPayment } from '../core/debts.js';
import { RULES } from '../lib/terms.js';
import { CONDITIONS, EXPIRY_OPTIONS, BUYER_DISPUTE_CATEGORIES, getDeal, getSeller } from '../core/common.js';
import { refreshDeal, publicDealView, dealPhotos } from '../core/deals.js';
import {
  startCheckout,
  placeOrder,
  retryPayment,
  confirmPayment,
  revealPin,
  openDispute,
  evidenceUrls,
  PHOTO_REQUIRED,
  MAX_DISPUTE_PHOTOS,
  releaseToSeller,
  DELIVERY_LABELS,
  settleTransfer,
  syncCourierStatus,
} from '../core/orders.js';
import { activeReturn, returnView, syncReturnStatus } from '../core/returns.js';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function loadDeal(ctx, token) {
  const deal = await first(ctx.env, 'SELECT * FROM deals WHERE token = ?', token);
  if (!deal) throw notFound('Link not found. Check the link with the seller.');
  return refreshDeal(ctx, deal);
}

async function loadOrderByBuyerToken(ctx, token) {
  const order = await first(ctx.env, 'SELECT * FROM orders WHERE buyer_token = ?', token);
  if (!order) throw notFound('Order not found.');
  return order;
}

export function publicRoutes(r) {
  // Also reports whether the database is connected and has all its tables, so setup problems
  // (missing D1 binding, tables that could not be created) show up here, not as login errors.
  r.get('/api/health', async ({ ctx }) => {
    const expected = ['sellers', 'sessions', 'otps', 'deals', 'checkouts', 'orders', 'order_events', 'disputes', 'ledger', 'outbox', 'mock_transactions', 'meta', 'deal_photos', 'dispute_photos'];
    if (!ctx.env.DB) return { ok: false, database: 'No D1 binding called DB. Add it under Settings → Bindings.' };
    try {
      await ensureSchema(ctx.env);
      const tables = (await all(ctx.env, "SELECT name FROM sqlite_master WHERE type = 'table'")).map((t) => t.name);
      const missing = expected.filter((t) => !tables.includes(t));
      if (missing.length) return { ok: false, database: `Tables missing: ${missing.join(', ')}. The Worker could not create them. Check Logs.` };
      const columns = (await all(ctx.env, 'PRAGMA table_info(deals)')).map((c) => c.name);
      if (!columns.includes('processing_fee')) return { ok: false, database: 'Database update 0002 not applied. Check Logs.' };
      if (!columns.includes('photo_count')) return { ok: false, database: 'Database update 0005 (item photos) not applied. Check Logs.' };
      // The settings every other page needs: payment, identity and courier connections.
      try {
        const c = createContext(ctx.env);
        if (c.payments.blocked) return { ok: false, database: 'connected', settings: `Payments: ${c.payments.blocked}` };
      } catch (err) {
        return { ok: false, database: 'connected', settings: err.message };
      }
      return { ok: true, database: 'connected', settings: 'ok' };
    } catch (err) {
      return { ok: false, database: `Database error: ${err.message}` };
    }
  });

  r.get('/api/config', async ({ ctx }) => ({
    test_mode: ctx.config.testMode,
    payment_provider: ctx.payments.name,
    payment_test: Boolean(ctx.payments.isTest),
    fee: ctx.config.fee,
    processing: ctx.config.processing,
    max_deal: ctx.config.maxDealKobo,
    inspection_hours: ctx.config.inspectionHours,
    states: STATES,
    courier: ctx.logistics.name,
    conditions: CONDITIONS,
    expiry_options: EXPIRY_OPTIONS,
    dispute_categories: BUYER_DISPUTE_CATEGORIES,
    dispute_photo_required: PHOTO_REQUIRED,
    max_dispute_photos: MAX_DISPUTE_PHOTOS,
    consents: CONSENTS,
    require_seller_id: ctx.config.requireSellerId,
  }));

  r.get('/api/banks', async ({ ctx }) => ({ banks: await ctx.payments.listBanks() }));

  // ---------------------------------------------------------------- buyer: the two-step link

  r.get('/api/deals/:token', async ({ ctx, params }) => {
    const deal = await loadDeal(ctx, params.token);
    return { deal: await publicDealView(ctx, deal), rules: RULES(deal) };
  });

  // Dispute evidence photos: private, served only through a signed link that expires.
  r.get('/api/evidence/:token', async ({ ctx, params }) => {
    const id = (await verifyLink(ctx.config.appSecret, params.token, ctx.now()))?.match(/^dp(\d+)$/)?.[1];
    const photo = id && (await first(ctx.env, 'SELECT mime, data FROM dispute_photos WHERE id = ?', Number(id)));
    if (!photo) throw notFound('This photo link has expired. Reload the page to see it again.');
    return new Response(new Uint8Array(photo.data), {
      headers: { 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=3600', 'Content-Security-Policy': "default-src 'none'" },
    });
  });

  // The item photos. Kept after the link is paid: they are part of what the buyer agreed to.
  r.get('/api/deals/:token/photos/:n', async ({ ctx, params }) => {
    const deal = await first(ctx.env, 'SELECT id FROM deals WHERE token = ?', params.token);
    const photo = deal && (await first(ctx.env, 'SELECT mime, data FROM deal_photos WHERE deal_id = ? AND position = ?', deal.id, Number(params.n)));
    if (!photo) throw notFound('Photo not found.');
    return new Response(new Uint8Array(photo.data), {
      headers: { 'Content-Type': photo.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'" },
    });
  });

  // Step 1 → 2. Applying a code on its own (to see the new total) doesn't need the acknowledgement;
  // only a checkout made after the buyer accepts the change-of-mind pop-up can be paid.
  r.post('/api/deals/:token/accept', async ({ ctx, params, body }) =>
    startCheckout(ctx, await loadDeal(ctx, params.token), body.promo_code, { acknowledged: body.penalty_acknowledged === true, termsAccepted: body.terms_accepted === true }));

  r.post('/api/deals/:token/pay', async ({ ctx, params, body }) => {
    const deal = await loadDeal(ctx, params.token);
    if (deal.status !== 'open') throw new UserError('This link is no longer available.', 410);
    const { order, payment_url } = await placeOrder(ctx, { deal, input: body });
    return { payment_url, track_token: order.buyer_token };
  });

  // Flutterwave (or the simulated checkout) sends the buyer back here after paying.
  r.get('/api/payments/callback', async ({ ctx, url }) => {
    const txRef = url.searchParams.get('tx_ref') || '';
    if (isDebtRef(txRef)) {
      const debt = await confirmDebtPayment(ctx, txRef);
      return redirect(`${ctx.config.siteUrl}/seller/dashboard.html?debt=${debt?.status === 'paid' ? 'paid' : 'not-paid'}`);
    }
    const order = await confirmPayment(ctx, txRef, 'buyer');
    if (!order) return redirect(`${ctx.config.siteUrl}/?error=payment-not-found`);
    return redirect(`${ctx.config.siteUrl}/track.html?t=${order.buyer_token}`);
  });

  r.post('/webhooks/flutterwave', async ({ ctx, request, body }) => {
    const hint = await ctx.payments.parseWebhook(request, body);
    if (!hint) return new Response('unauthorized', { status: 401 });
    if (hint.kind === 'transfer') await settleTransfer(ctx, hint);
    else if (isDebtRef(hint.txRef)) await confirmDebtPayment(ctx, hint.txRef);
    else await confirmPayment(ctx, hint.txRef, 'webhook');
    return new Response('ok');
  });

  // Fez parcel status changes. Only a hint: the status is re-read from Fez before anything changes.
  r.post('/webhooks/fez', async ({ ctx, request, body }) => {
    const hint = await ctx.logistics.parseWebhook(request, body);
    if (!hint) return new Response('ignored', { status: 200 });
    if (!hint.signatureValid) console.warn('Fez webhook signature did not verify; re-checking status with Fez anyway', hint.deliveryRef);
    const order = await first(ctx.env, 'SELECT * FROM orders WHERE delivery_ref = ?', hint.deliveryRef);
    if (order) await syncCourierStatus(ctx, order);
    const ret = order ? null : await first(ctx.env, "SELECT * FROM returns WHERE kind = 'pickup' AND delivery_ref = ?", hint.deliveryRef);
    if (ret) await syncReturnStatus(ctx, ret);
    return new Response('ok');
  });

  // Simulated hosted checkout (test mode only). In live mode this is Flutterwave's page.
  r.get('/mock/pay/:txRef', async ({ ctx, params }) => {
    if (ctx.payments.name !== 'mock') throw notFound();
    const tx = await first(ctx.env, 'SELECT * FROM mock_transactions WHERE tx_ref = ?', params.txRef);
    if (!tx) throw notFound('Unknown test payment.');
    return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test checkout</title><style>body{font:16px system-ui,sans-serif;background:#F4F7FC;margin:0;padding:24px;color:#0B1B3D}
.card{max-width:420px;margin:40px auto;background:#fff;border:1px solid #dfe5e2;border-radius:12px;padding:24px;text-align:center}
button{display:block;width:100%;margin:10px 0;padding:14px;border:0;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;background:#0B1B3D;color:#F4F7FC}
button.alt{background:#fff;color:#0B1B3D;box-shadow:inset 0 0 0 1.5px #0B1B3D}.tag{display:inline-block;background:#fff4dd;color:#9a5b00;border-radius:99px;padding:2px 10px;font-size:13px;font-weight:600}</style></head>
<body><div class="card"><span class="tag">Simulated payment page</span><h1>Pay ${escapeHtml(formatNaira(tx.amount))}</h1>
<p>In live mode this is Flutterwave's checkout (card, bank transfer, USSD).</p>
<form method="post"><button name="result" value="successful">Simulate successful payment</button>
<button class="alt" name="result" value="failed">Simulate failed payment</button></form></div></body></html>`);
  });

  r.post('/mock/pay/:txRef', async ({ ctx, params, body }) => {
    if (ctx.payments.name !== 'mock') throw notFound();
    await ctx.payments.setMockStatus(params.txRef, body.result === 'successful' ? 'successful' : 'failed');
    return redirect(`${ctx.config.apiUrl}/api/payments/callback?tx_ref=${encodeURIComponent(params.txRef)}`);
  });

  // ---------------------------------------------------------------- buyer: private tracking page

  r.get('/api/track/:token', async ({ ctx, params }) => {
    const o = await loadOrderByBuyerToken(ctx, params.token);
    const deal = await getDeal(ctx, o.deal_id);
    const seller = await getSeller(ctx, o.seller_id);
    const dispute = await first(ctx.env, 'SELECT * FROM disputes WHERE order_id = ? ORDER BY id DESC', o.id);
    const events = await all(ctx.env, 'SELECT type, actor, created_at FROM order_events WHERE order_id = ? ORDER BY id', o.id);
    const dealNow = await refreshDeal(ctx, deal);
    const canReport = ['paid', 'shipping'].includes(o.status) || (o.status === 'delivered' && new Date(o.inspection_ends_at) > ctx.now());
    return {
      order: {
        ref: o.ref,
        status: o.status,
        amount: o.amount,
        item_title: deal.item_title,
        photos: await dealPhotos(ctx, deal),
        seller_name: seller.business_name,
        seller_phone: seller.phone,
        delivery_state: o.delivery_state,
        delivery_address: o.delivery_address,
        courier_status: o.courier_status,
        delivery_status: o.delivery_status,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        pin: ['paid', 'shipping'].includes(o.status) ? await revealPin(ctx, o) : null,
        ship_by: o.ship_by,
        delivered_at: o.delivered_at,
        inspection_ends_at: o.inspection_ends_at,
        refund_account: `${o.refund_bank_name} ••••${o.refund_account_last4}`,
        price: {
          item: deal.item_price,
          delivery: buyerPart(deal.delivery_payer, o.delivery_fee),
          platform_fee: buyerPart(deal.fee_payer, o.platform_fee + o.promo_discount) - o.promo_discount,
          promo_discount: o.promo_discount,
          processing_fee: buyerPart(deal.fee_payer, o.processing_fee),
          total: o.amount,
        },
        terms_hash: o.terms_hash,
        terms_accepted_at: o.terms_accepted_at,
        rules: JSON.parse(o.terms_json).rules,
        can_retry_payment: ['awaiting_payment', 'cancelled'].includes(o.status) && dealNow.status === 'open',
        can_confirm: o.status === 'delivered',
        can_report: canReport,
      },
      return: await returnView(ctx, await activeReturn(ctx, o.id)),
      dispute: dispute && {
        photos: await evidenceUrls(ctx, dispute.id),
        status: dispute.status,
        category: dispute.category,
        resolution_note: dispute.resolution_note,
        buyer_refund: dispute.buyer_refund,
      },
      events,
    };
  });

  r.post('/api/track/:token/retry', async ({ ctx, params }) => retryPayment(ctx, await loadOrderByBuyerToken(ctx, params.token)));

  r.post('/api/track/:token/accept', async ({ ctx, params }) => {
    await releaseToSeller(ctx, await loadOrderByBuyerToken(ctx, params.token), 'buyer_confirmed');
    return { ok: true };
  });

  r.post('/api/track/:token/dispute', async ({ ctx, params, body }) => {
    if (!BUYER_DISPUTE_CATEGORIES[body.category]) throw new UserError('Choose what went wrong.');
    await openDispute(ctx, await loadOrderByBuyerToken(ctx, params.token), { by: 'buyer', category: body.category, description: body.description, photos: body.photos });
    return { ok: true };
  });
}
