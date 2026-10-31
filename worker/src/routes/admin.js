import { first, all, update, insert } from '../lib/db.js';
import { nairaToKobo, formatNaira } from '../lib/money.js';
import { UserError, notFound } from '../lib/http.js';
import { verifyLink } from '../lib/crypto.js';
import { DISPUTE_CATEGORIES, getOrder, getDeal, getSeller, trackUrl, iso, str } from '../core/common.js';
import { adminLogin, authenticate } from '../core/sellers.js';
import { resolveDispute, sendTransfer, applyDeliveryUpdate, verifyDeliveryPin, syncCourierStatus, evidenceDetails, DELIVERY_LABELS } from '../core/orders.js';
import { runJobs } from '../core/jobs.js';
import { suspendSeller, unsuspendSeller, sellerHistory } from '../core/suspension.js';
import { healthReport } from './public.js';
import { createContext } from '../context.js';
import { settingsCheck } from '../lib/settings-check.js';
import { addStatement, openCase, caseView } from '../core/statements.js';
import { activeReturn, isOpenReturn, returnView, verifyReturnPin, applyReturnUpdate, receiveReturn, cancelReturn, syncReturnStatus, bookPickupReturn, RETURN_LABELS } from '../core/returns.js';
import { dealPhotos } from '../core/deals.js';
import { syncSheets } from '../providers/sheets.js';

async function requireAdmin(ctx, request) {
  const session = await authenticate(ctx, request);
  if (!session?.is_admin) throw new UserError('Admin login required.', 401);
}

// A rider link is either a delivery ("rider-<order id>") or a pickup return ("return-<return id>").
async function riderJob(ctx, token) {
  const data = await verifyLink(ctx.config.appSecret, token, ctx.now());
  const invalid = () => new UserError('This rider link is invalid or has expired.', 404);
  if (data?.startsWith('return-')) {
    const ret = await first(ctx.env, 'SELECT * FROM returns WHERE id = ?', Number(data.slice(7)));
    if (!ret) throw invalid();
    return { order: await getOrder(ctx, ret.order_id), ret };
  }
  const id = data?.startsWith('rider-') ? Number(data.slice(6)) : null;
  const order = id && (await getOrder(ctx, id));
  if (!order) throw invalid();
  return { order, ret: null };
}
async function riderOrder(ctx, token) {
  const { order, ret } = await riderJob(ctx, token);
  if (ret) throw new UserError('This is a return link.');
  return order;
}


// Date filters for the admin lists: ?from=YYYY-MM-DD&to=YYYY-MM-DD (Lagos days, both included) and
// ?order=oldest (newest first otherwise). Returns SQL bits for a table alias's created_at.
function dateRange(url, col) {
  const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  const from = day(url.searchParams.get('from'));
  const to = day(url.searchParams.get('to'));
  const start = from ? new Date(`${from}T00:00:00+01:00`).toISOString() : '0000';
  const end = to ? new Date(new Date(`${to}T00:00:00+01:00`).getTime() + 86_400_000).toISOString() : '9999';
  const dir = url.searchParams.get('order') === 'oldest' ? 'ASC' : 'DESC';
  return { where: `${col} >= ? AND ${col} < ?`, args: [start, end], order: `${col} ${dir}, ${col.split('.')[0]}.id ${dir}`, from, to };
}

export function riderRoutes(r) {
  r.get('/api/rider/:token', async ({ ctx, params }) => {
    const { order: o, ret: returnJob } = await riderJob(ctx, params.token);
    const d = await getDeal(ctx, o.deal_id);
    const s = await getSeller(ctx, o.seller_id);
    const seller = { name: s.business_name, phone: s.phone, address: d.pickup_address };
    const buyer = { name: o.buyer_name, phone: o.buyer_phone, address: o.delivery_address, landmark: o.delivery_landmark };
    // On a delivery link, a door refusal turns the job into taking the parcel back to the seller.
    const ret = returnJob || (await activeReturn(ctx, o.id));
    const doorReturn = !returnJob && ret?.kind === 'door' ? await returnView(ctx, ret) : null;
    return {
      order: {
        mode: returnJob ? 'return' : 'delivery',
        // An open case the rider can add their account to (e.g. the buyer reported the refusal first).
        case: !returnJob && (await openCase(ctx, o.id)) ? { open: true, mine: (await caseView(ctx, await openCase(ctx, o.id), { viewer: 'rider' })).statements.filter((x) => x.party === 'rider') } : null,
        return: returnJob ? await returnView(ctx, returnJob) : doorReturn,
        ref: o.ref,
        status: o.status,
        delivery_status: o.delivery_status,
        delivery_label: returnJob ? RETURN_LABELS[returnJob.status] : DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        item_title: d.item_title,
        item_condition: d.item_condition,
        item_description: d.item_description,
        quantity: d.quantity,
        packing_note: o.packing_note,
        pickup: returnJob ? buyer : seller,
        dropoff: returnJob ? seller : buyer,
      },
    };
  });
  r.post('/api/rider/:token/status', async ({ ctx, params, body }) => {
    const { order, ret } = await riderJob(ctx, params.token);
    if (ret) await applyReturnUpdate(ctx, ret, { status: body.status, note: body.note, actor: 'rider' });
    else if (body.status === 'refused' && order.status === 'disputed' && (await openCase(ctx, order.id))) {
      // The buyer already reported it: the rider's refusal is their side of the same case.
      await addStatement(ctx, order, { party: 'rider', body: str(body.note) || 'Buyer refused the parcel at the door.', parcel: 'rider' });
      return { ok: true, added_to_case: true };
    } else await applyDeliveryUpdate(ctx, order, { status: body.status, note: body.note, actor: 'rider' });
    return { ok: true };
  });
  r.post('/api/rider/:token/statement', async ({ ctx, params, body }) => {
    const { order, ret } = await riderJob(ctx, params.token);
    if (ret) throw new UserError('Use the delivery link to add your account.');
    await addStatement(ctx, order, { party: 'rider', body: body.body, parcel: body.parcel || null });
    return { ok: true };
  });
  // The seller's return PIN, entered by the rider when handing the item back.
  r.post('/api/rider/:token/return-pin', async ({ ctx, params, body }) => {
    const { order, ret } = await riderJob(ctx, params.token);
    const job = ret || (await activeReturn(ctx, order.id));
    if (!isOpenReturn(job)) throw new UserError('There is no return to confirm on this link.');
    await verifyReturnPin(ctx, job, body.pin, 'rider');
    return { ok: true };
  });
  r.post('/api/rider/:token/pin', async ({ ctx, params, body }) => {
    await verifyDeliveryPin(ctx, await riderOrder(ctx, params.token), body.pin, 'rider');
    return { ok: true };
  });
}

export function adminRoutes(r) {
  r.post('/api/admin/login', ({ ctx, body }) => adminLogin(ctx, body));

  const admin = (handler) => async (args) => {
    await requireAdmin(args.ctx, args.request);
    return handler(args);
  };

  r.get('/api/admin/orders', admin(async ({ ctx, url }) => {
    const status = url.searchParams.get('status') || '';
    const range = dateRange(url, 'o.created_at');
    const orders = await all(
      ctx.env,
      `SELECT o.id, o.ref, o.status, o.amount, o.buyer_name, o.created_at, d.item_title, s.business_name
       FROM orders o JOIN deals d ON d.id = o.deal_id JOIN sellers s ON s.id = o.seller_id
       WHERE ((? = '' AND o.status != 'cancelled') OR o.status = ?) AND ${range.where} ORDER BY ${range.order} LIMIT 500`,
      status,
      status,
      ...range.args,
    );
    const counts = Object.fromEntries((await all(ctx.env, 'SELECT status, COUNT(*) n FROM orders GROUP BY status')).map((x) => [x.status, x.n]));
    return { orders, counts };
  }));

  r.get('/api/admin/orders/:id', admin(async ({ ctx, params }) => {
    const o = await getOrder(ctx, Number(params.id));
    if (!o) throw notFound('Order not found.');
    const d = await getDeal(ctx, o.deal_id);
    const s = await getSeller(ctx, o.seller_id);
    const { refund_account_enc, delivery_pin_enc, last_transition, terms_json, ...order } = o;
    return {
      order: {
        ...order,
        delivery_label: DELIVERY_LABELS[o.delivery_status] || o.delivery_status,
        track_url: trackUrl(ctx, o),
      },
      deal: d,
      photos: await dealPhotos(ctx, d),
      seller: {
        id: s.id, business_name: s.business_name, full_name: s.full_name, phone: s.phone, email: s.email,
        payout_bank_name: s.payout_bank_name, payout_account_number: s.payout_account_number,
        identity_verified: Boolean(s.identity_verified_at), amount_owed: s.amount_owed,
      },
      disputes: await Promise.all((await all(ctx.env, 'SELECT * FROM disputes WHERE order_id = ? ORDER BY id', o.id)).map(async (x) => ({
        ...x,
        category_label: DISPUTE_CATEGORIES[x.category] || x.category,
        photos: await evidenceDetails(ctx, x.id),
        case: await caseView(ctx, x),
      }))),
      return: await (async () => {
        const ret = await activeReturn(ctx, o.id);
        return ret && {
          ...(await returnView(ctx, ret)),
          courier: ret.courier, delivery_ref: ret.delivery_ref, rider_url: ret.rider_url, courier_status: ret.courier_status,
          pin_attempts: ret.pin_attempts, cost: ret.cost,
          overdue: Boolean(ret.deadline_at && ['booked', 'attempt_failed'].includes(ret.status) && new Date(ret.deadline_at) < ctx.now()),
        };
      })(),
      ledger: await all(ctx.env, 'SELECT * FROM ledger WHERE order_id = ? ORDER BY id', o.id),
      events: await all(ctx.env, 'SELECT * FROM order_events WHERE order_id = ? ORDER BY id', o.id),
      messages: await all(ctx.env, 'SELECT * FROM outbox WHERE order_id = ? ORDER BY id', o.id),
    };
  }));

  r.post('/api/admin/disputes/:id/resolve', admin(async ({ ctx, params, body }) => ({ ok: true, ...(await resolveDispute(ctx, Number(params.id), body)) })));

  const adminReturn = async (ctx, id) => {
    const ret = await first(ctx.env, 'SELECT * FROM returns WHERE id = ?', Number(id));
    if (!ret) throw notFound('Return not found.');
    return ret;
  };
  // For when the seller has the item but no PIN was entered (e.g. they confirmed by phone).
  r.post('/api/admin/returns/:id/received', admin(async ({ ctx, params }) => {
    if (!(await receiveReturn(ctx, await adminReturn(ctx, params.id), 'admin'))) throw new UserError('This return is already closed.');
    return { ok: true };
  }));
  // Staff book a collection from the buyer by hand (e.g. the buyer still has a refused parcel and no
  // return was started, or a courier error stopped the automatic booking).
  r.post('/api/admin/orders/:id/book-return', admin(async ({ ctx, params }) => {
    const order = await getOrder(ctx, Number(params.id));
    if (!order) throw notFound('Order not found.');
    if (!['disputed', 'shipping'].includes(order.status) || !order.dispatched_at) throw new UserError('A return can only be booked for a shipped order under review.');
    const ret = await bookPickupReturn(ctx, order, { parcelWithBuyer: true });
    return { ok: true, return_id: ret.id };
  }));
  r.post('/api/admin/returns/:id/cancel', admin(async ({ ctx, params, body }) => {
    await cancelReturn(ctx, await adminReturn(ctx, params.id), body.note);
    return { ok: true };
  }));
  r.post('/api/admin/returns/:id/sync-courier', admin(async ({ ctx, params }) => {
    const st = await syncReturnStatus(ctx, await adminReturn(ctx, params.id));
    return { status: st?.raw || 'no update' };
  }));

  r.get('/api/admin/disputes', admin(async ({ ctx, url }) => ({
    disputes: (await all(
      ctx.env,
      `SELECT x.*, o.ref FROM disputes x JOIN orders o ON o.id = x.order_id WHERE ${dateRange(url, 'x.created_at').where}
       ORDER BY ${dateRange(url, 'x.created_at').order} LIMIT 500`, ...dateRange(url, 'x.created_at').args,
    )).map((x) => ({ ...x, category_label: DISPUTE_CATEGORIES[x.category] || x.category })),
  })));

  r.get('/api/admin/sellers', admin(async ({ ctx, url }) => ({
    sellers: await Promise.all((await all(
      ctx.env,
      `SELECT s.id, s.business_name, s.full_name, s.phone, s.email, s.phone_verified_at, s.payout_verified_at, s.payout_bank_name,
              s.identity_verified_at, s.id_type, s.id_last4, s.amount_owed, s.suspended_at, s.suspend_reason, s.suspended_by, s.deal_limit, s.created_at,
              (SELECT COALESCE(SUM(l.amount), 0) FROM ledger l JOIN orders o ON o.id = l.order_id
                WHERE o.seller_id = s.id AND l.kind = 'seller_payout' AND l.status = 'held') AS held
       FROM sellers s WHERE ${dateRange(url, 's.created_at').where} ORDER BY ${dateRange(url, 's.created_at').order} LIMIT 500`,
      ...dateRange(url, 's.created_at').args,
    )).map(async (s) => ({ ...s, history: await sellerHistory(ctx, s.id) }))),
  })));

  r.post('/api/admin/sellers/:id', admin(async ({ ctx, params, body }) => {
    const id = Number(params.id);
    if (body.action === 'suspend') return { ok: true, ...(await suspendSeller(ctx, id, { reason: body.reason })) };
    if (body.action === 'unsuspend') return { ok: true, ...(await unsuspendSeller(ctx, id, { reason: body.reason })) };
    // A higher deal limit for one seller (a high-value deal arranged through support). Empty resets it.
    if (body.action === 'limit') {
      if (!(await getSeller(ctx, id))) throw notFound('Seller not found.');
      const limit = body.limit === '' || body.limit == null ? null : nairaToKobo(body.limit);
      if (limit !== null && (!limit || limit <= ctx.config.maxDealKobo)) throw new UserError(`Enter an amount above the normal limit of ${formatNaira(ctx.config.maxDealKobo)}, or leave it empty to go back to it.`);
      await update(ctx.env, 'sellers', id, { deal_limit: limit });
      await insert(ctx.env, 'seller_actions', { seller_id: id, action: 'limit', reason: limit ? `Deals up to ${formatNaira(limit)}${body.reason ? ` · ${String(body.reason).slice(0, 300)}` : ''}` : 'Back to the normal limit', actor: 'admin', created_at: iso(ctx.now()) });
      return { ok: true };
    }
    const fields = {
      verify: { identity_verified_at: iso(ctx.now()), id_type: 'manual' },
      settled: { amount_owed: 0 },
    }[body.action];
    if (!fields) throw new UserError('Unknown action.');
    if (!(await getSeller(ctx, id))) throw notFound('Seller not found.');
    await update(ctx.env, 'sellers', id, fields);
    return { ok: true };
  }));

  r.get('/api/admin/outbox', admin(async ({ ctx, url }) => {
    const range = dateRange(url, 'm.created_at');
    return { messages: await all(ctx.env, `SELECT m.* FROM outbox m WHERE ${range.where} ORDER BY ${range.order} LIMIT 500`, ...range.args) };
  }));

  r.get('/api/admin/ledger', admin(async ({ ctx, url }) => {
    const range = dateRange(url, 'l.created_at');
    return {
    held: (await first(ctx.env, "SELECT COALESCE(SUM(amount),0) t FROM orders WHERE status IN ('paid','shipping','delivered','disputed')")).t,
    // Totals for the chosen dates (all time when no dates are chosen).
    totals: await all(ctx.env, `SELECT l.kind, l.status, SUM(l.amount) total FROM ledger l WHERE ${range.where} GROUP BY l.kind, l.status ORDER BY l.kind`, ...range.args),
    entries: await all(ctx.env, `SELECT l.*, o.ref FROM ledger l LEFT JOIN orders o ON o.id = l.order_id WHERE ${range.where} ORDER BY ${range.order} LIMIT 1000`, ...range.args),
    sheets_synced_at: (await first(ctx.env, "SELECT value FROM meta WHERE key = 'sheets_synced_at'"))?.value || null,
    };
  }));

  r.post('/api/admin/ledger/:id/retry', admin(async ({ ctx, params }) => ({ entry: await sendTransfer(ctx, Number(params.id), { manual: true }) })));
  r.post('/api/admin/orders/:id/sync-courier', admin(async ({ ctx, params }) => {
    const o = await getOrder(ctx, Number(params.id));
    if (!o) throw notFound('Order not found.');
    const st = await syncCourierStatus(ctx, o);
    return { status: st ? st.raw : 'No courier status (manual rider, or not booked yet).' };
  }));

  // Tells Fez where to send parcel status updates (Fez → POST /webhooks/store).
  r.post('/api/admin/courier/register-webhook', admin(async ({ ctx }) => {
    if (!ctx.logistics.registerWebhook) throw new UserError('Webhooks are only needed with LOGISTICS_PROVIDER=fez.');
    const url = `${ctx.config.apiUrl}/webhooks/fez`;
    await ctx.logistics.registerWebhook(url);
    return { registered: url };
  }));

  r.post('/api/admin/jobs', admin(async ({ ctx }) => ({ result: await runJobs(ctx) })));
  // Full health details and risky settings (the public /api/health only says ok or not).
  r.get('/api/admin/health', admin(async ({ ctx }) => {
    let warnings;
    try {
      warnings = settingsCheck(createContext(ctx.env));
    } catch (err) {
      warnings = [{ level: 'danger', text: err.message }];
    }
    return { ...(await healthReport(ctx)), warnings };
  }));
  r.post('/api/admin/sync-sheets', admin(async ({ ctx }) => ({ result: await syncSheets(ctx) })));
}
