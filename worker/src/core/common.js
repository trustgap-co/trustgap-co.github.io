import { first, insertStmt, guardedInsert, stmt } from '../lib/db.js';
import { UserError } from '../lib/http.js';
import { randomToken } from '../lib/crypto.js';

export { UserError };

export const CONDITIONS = ['Brand new (sealed)', 'Brand new (open box)', 'Used - like new', 'Used - good condition', 'Used - fair condition'];
export const EXPIRY_OPTIONS = [1, 6, 24, 72];
export const BUYER_DISPUTE_CATEGORIES = {
  not_delivered: 'Item not delivered',
  wrong_item: 'Wrong item sent',
  damaged: 'Item damaged',
  not_as_described: 'Not as described',
  counterfeit: 'Item is fake',
  changed_mind: 'I changed my mind',
  other: 'Something else',
};
export const DISPUTE_CATEGORIES = {
  ...BUYER_DISPUTE_CATEGORIES,
  refused_at_door: 'Refused at the door',
  returned_by_courier: 'Returned by the courier',
  not_shipped: 'Seller did not ship in time',
  seller_issue: 'Raised by seller',
  returned_item_problem: 'Returned item isn’t what was delivered',
};
export const HELD_STATUSES = ['paid', 'shipping', 'delivered', 'disputed'];

export const HOUR = 3_600_000;
export const iso = (d) => d.toISOString();
export const addHours = (d, h) => new Date(d.getTime() + h * HOUR);
export const str = (v) => String(v ?? '').trim();

export function requireLength(value, label, min, max) {
  const v = str(value);
  if (v.length < min) throw new UserError(`${label} is too short.`);
  if (v.length > max) throw new UserError(`${label} is too long (max ${max} characters).`);
  return v;
}

export function normalisePhone(input) {
  const digits = str(input).replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?234|0)([789][01]\d{8})$/);
  if (m) return '+234' + m[1];
  throw new UserError('Enter a valid Nigerian phone number, e.g. 0803 123 4567.');
}

export function validEmail(input) {
  const email = str(input).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new UserError('Enter a valid email address.');
  return email;
}

export const getSeller = (ctx, id) => first(ctx.env, 'SELECT * FROM sellers WHERE id = ?', id);
export const getDeal = (ctx, id) => first(ctx.env, 'SELECT * FROM deals WHERE id = ?', id);
export const getOrder = (ctx, id) => first(ctx.env, 'SELECT * FROM orders WHERE id = ?', id);
export const trackUrl = (ctx, order) => `${ctx.config.siteUrl}/track.html?t=${order.buyer_token}`;
export const payUrl = (ctx, deal) => `${ctx.config.siteUrl}/pay.html?d=${deal.token}`;

const detailText = (d) => (d == null ? null : typeof d === 'string' ? d : JSON.stringify(d));

export const eventStmt = (ctx, orderId, actor, type, detail = null) =>
  insertStmt(ctx.env, 'order_events', { order_id: orderId, actor, type, detail: detailText(detail), created_at: iso(ctx.now()) });

export const logEvent = (ctx, ...args) => eventStmt(ctx, ...args).run();

export const ledgerRow = (ctx, orderId, kind, amount, counterparty, status, notBefore = null) => ({
  order_id: orderId,
  kind,
  amount,
  counterparty,
  status,
  not_before: notBefore,
  created_at: iso(ctx.now()),
});

// Flutterwave settles a collection into the wallet the next working day (T+1). Money for an order
// can't be paid out before then. Weekends push it to Monday.
export function settlesAt(ctx, paidAt) {
  const t = new Date(new Date(paidAt).getTime() + ctx.config.settlementHours * HOUR);
  const day = new Date(t.getTime() + HOUR).getUTCDay(); // Lagos is UTC+1
  if (day === 6) return new Date(t.getTime() + 48 * HOUR);
  if (day === 0) return new Date(t.getTime() + 24 * HOUR);
  return t;
}

// Moves an order from one of `from` statuses to new values, atomically. Statements built by
// `followUps(guard)` run in the same D1 batch (a transaction) and only take effect if this call
// won the transition. Returns true if it did. This is what stops double payouts when a webhook,
// a redirect and a timer all try to act on the same order at once.
export async function transition(ctx, orderId, from, fields, followUps = () => []) {
  const nonce = randomToken(12);
  const set = { ...fields, last_transition: nonce };
  const keys = Object.keys(set);
  const cas = stmt(
    ctx.env,
    `UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`,
    ...keys.map((k) => set[k]),
    orderId,
    ...from,
  );
  const guard = `EXISTS (SELECT 1 FROM orders WHERE id = ${Number(orderId)} AND last_transition = '${nonce}')`;
  const helpers = {
    guard,
    insert: (table, row) => guardedInsert(ctx.env, table, row, guard),
    event: (actor, type, detail) =>
      guardedInsert(ctx.env, 'order_events', { order_id: orderId, actor, type, detail: detailText(detail), created_at: iso(ctx.now()) }, guard),
    sql: (sql, ...args) => stmt(ctx.env, `${sql} AND ${guard}`, ...args),
  };
  const results = await ctx.env.DB.batch([cas, ...followUps(helpers)]);
  return results[0].meta.changes === 1;
}

export function fmtDate(d) {
  return new Date(d).toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
