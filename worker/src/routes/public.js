import { first, all } from '../lib/db.js';
import { redirect, html, UserError, notFound } from '../lib/http.js';
import { formatNaira } from '../lib/money.js';
import { ZONES, zoneById } from '../lib/zones.js';
import { RULES } from '../lib/terms.js';
import { CONDITIONS, EXPIRY_OPTIONS, BUYER_DISPUTE_CATEGORIES, getDeal, getSeller } from '../core/common.js';
import { refreshDeal, publicDealView } from '../core/deals.js';
import {
  startCheckout,
  placeOrder,
  retryPayment,
  confirmPayment,
  revealPin,
  openDispute,
  releaseToSeller,
  DELIVERY_LABELS,
  settleTransfer,
} from '../core/orders.js';

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
  r.get('/api/health', () => ({ ok: true }));

  r.get('/api/config', async ({ ctx }) => ({
    test_mode: ctx.config.testMode,
    payment_provider: ctx.payments.name,
    fee: ctx.config.fee,
    processing: ctx.config.processing,
    max_deal: ctx.config.maxDealKobo,
    inspection_hours: ctx.config.inspectionHours,
    zones: ZONES.map(({ id, name }) => ({ id, name })),
    conditions: CONDITIONS,
    expiry_options: EXPIRY_OPTIONS,
    dispute_categories: BUYER_DISPUTE_CATEGORIES,
    require_seller_id: ctx.config.requireSellerId,
  }));

  r.get('/api/banks', async ({ ctx }) => ({ banks: await ctx.payments.listBanks() }));

  // ---------------------------------------------------------------- buyer: the two-step link

  r.get('/api/deals/:token', async ({ ctx, params }) => {
    const deal = await loadDeal(ctx, params.token);
    return { deal: await publicDealView(ctx, deal), rules: RULES(deal) };
  });

  r.post('/api/deals/:token/accept', async ({ ctx, params }) => startCheckout(ctx, await loadDeal(ctx, params.token)));

  r.post('/api/deals/:token/pay', async ({ ctx, params, body }) => {
    const deal = await loadDeal(ctx, params.token);
    if (deal.status !== 'open') throw new UserError('This link is no longer available.', 410);
    const { order, payment_url } = await placeOrder(ctx, { deal, input: body });
    return { payment_url, track_token: order.buyer_token };
  });

  // Flutterwave (or the simulated checkout) sends the buyer back here after paying.
  r.get('/api/payments/callback', async ({ ctx, url }) => {
    const order = await confirmPayment(ctx, url.searchParams.get('tx_ref') || '', 'buyer');
    if (!order) return redirect(`${ctx.config.siteUrl}/?error=payment-not-found`);
    return redirect(`${ctx.config.siteUrl}/track.html?t=${order.buyer_token}`);
  });

  r.post('/webhooks/flutterwave', async ({ ctx, request, body }) => {
    const hint = await ctx.payments.parseWebhook(request, body);
    if (!hint) return new Response('unauthorized', { status: 401 });
    if (hint.kind === 'transfer') await settleTransfer(ctx, hint);
    else await confirmPayment(ctx, hint.txRef, 'webhook');
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
        seller_name: seller.business_name,
        seller_phone: seller.phone,
        delivery_area: zoneById(deal.delivery_zone)?.name,
        delivery_status: o.delivery_status,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        pin: ['paid', 'shipping'].includes(o.status) ? await revealPin(ctx, o) : null,
        ship_by: o.ship_by,
        delivered_at: o.delivered_at,
        inspection_ends_at: o.inspection_ends_at,
        refund_account: `${o.refund_bank_name} ••••${o.refund_account_last4}`,
        terms_hash: o.terms_hash,
        terms_accepted_at: o.terms_accepted_at,
        rules: JSON.parse(o.terms_json).rules,
        can_retry_payment: ['awaiting_payment', 'cancelled'].includes(o.status) && dealNow.status === 'open',
        can_confirm: o.status === 'delivered',
        can_report: canReport,
      },
      dispute: dispute && {
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
    await openDispute(ctx, await loadOrderByBuyerToken(ctx, params.token), { by: 'buyer', category: body.category, description: body.description });
    return { ok: true };
  });
}
