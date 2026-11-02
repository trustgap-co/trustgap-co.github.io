import { first } from '../lib/db.js';
import { normalisePhone, getOrder, DISPUTE_CATEGORIES, caseRef } from './common.js';
import { formatNaira } from '../lib/money.js';

// SMS alerts for the people who handle disputes: the admin (ADMIN_ALERT_PHONE) and the active
// Customer Relations Admin (their team profile phone).
async function crAdmin(ctx) {
  return first(ctx.env, "SELECT * FROM staff WHERE role = 'cr_admin' AND disabled_at IS NULL");
}
const adminPhone = (ctx) => (ctx.config.adminAlertPhone ? normalisePhone(ctx.config.adminAlertPhone) : null);
const WHO = { buyer: 'the buyer', seller: 'the seller', rider: 'the rider', courier: 'the courier', admin: 'staff' };

// Every new dispute, whoever opened it (buyer, seller, rider or courier).
export async function alertNewDispute(ctx, orderId) {
  const order = await getOrder(ctx, orderId);
  const dispute = await first(ctx.env, 'SELECT * FROM disputes WHERE order_id = ? ORDER BY id DESC', orderId);
  if (!order || !dispute) return;
  const lead = await crAdmin(ctx);
  const phones = [...new Set([adminPhone(ctx), lead?.phone].filter(Boolean))];
  const sms = `TrustGap alert: new dispute ${caseRef(order, dispute)}, "${DISPUTE_CATEGORIES[dispute.category] || dispute.category}", ${formatNaira(order.amount)} order, opened by ${WHO[dispute.opened_by] || dispute.opened_by}. Open: ${ctx.config.siteUrl}/admin/order.html?id=${order.id}`;
  for (const phone of phones) await ctx.notify.send({ orderId: order.id, event: 'staff_alert_dispute', phone, sms });
}

// A decision made by someone other than the admin: the admin is told, so they always know when money moves.
export async function alertDecision(ctx, order, dispute, { by, summary }) {
  const phone = adminPhone(ctx);
  if (!phone || by === 'admin') return;
  await ctx.notify.send({ orderId: order.id, event: 'staff_alert_decision', phone,
    sms: `TrustGap: ${String(by).replace(/^team:/, '')} decided case ${caseRef(order, dispute)}. ${summary}`.slice(0, 600) });
}
